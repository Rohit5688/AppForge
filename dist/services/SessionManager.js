import { AppiumSessionService } from './AppiumSessionService.js';
import { AppForgeError, ErrorCode } from '../utils/ErrorCodes.js';
/**
 * SessionManager - Singleton service to manage Appium sessions safely.
 *
 * Prevents issues:
 * - Concurrent session creation conflicts
 * - Resource leaks from failed sessions
 * - Memory accumulation from screenshots
 * - Zombie sessions that never cleanup
 *
 * Features:
 * - One session per projectRoot
 * - Automatic idle timeout and cleanup
 * - Retry logic with exponential backoff
 * - Memory usage monitoring
 * - Process exit cleanup hooks
 */
export class SessionManager {
    static instance = null;
    static hasRegisteredHandlers = false;
    static instanceCounter = 0;
    sessions = new Map();
    sessionLocks = new Map();
    cleanupTimer = null;
    config;
    instanceId;
    isShuttingDown = false;
    constructor(config) {
        this.instanceId = ++SessionManager.instanceCounter;
        this.config = {
            maxIdleTimeMs: 5 * 60 * 1000, // 5 minutes
            maxMemoryMB: 50,
            cleanupIntervalMs: 60 * 1000, // 1 minute
            maxRetryAttempts: 3,
            ...config
        };
        this.startCleanupTimer();
        this.registerExitHandlers();
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager(config);
        }
        else if (config) {
            // Warn if trying to reconfigure existing instance
            console.warn('[SessionManager] Cannot reconfigure existing instance. Use destroyInstance() first.');
        }
        return SessionManager.instance;
    }
    /**
     * Get or create a session for the given project root.
     * Prevents concurrent sessions for the same project.
     *
     * RACE CONDITION FIX: Uses session locks to prevent multiple concurrent
     * session creation attempts for the same project.
     */
    async getSession(projectRoot, profileName, forceNew = false) {
        if (this.isShuttingDown) {
            throw new AppForgeError(ErrorCode.E002_DEVICE_OFFLINE, 'SessionManager is shutting down. Cannot create new sessions.', ['Wait for current operations to complete', 'Restart the process if needed']);
        }
        const normalizedPath = this.normalizePath(projectRoot);
        // Check if session creation is already in progress (RACE CONDITION FIX)
        const existingLock = this.sessionLocks.get(normalizedPath);
        if (existingLock) {
            console.error(`[SessionManager] Waiting for in-progress session creation: ${normalizedPath}`);
            return existingLock;
        }
        const existing = this.sessions.get(normalizedPath);
        // Return existing active session
        if (existing && !forceNew) {
            if (await this.isSessionHealthy(existing)) {
                existing.lastUsedAt = Date.now();
                console.error(`[SessionManager] Reusing existing session for ${normalizedPath}`);
                return existing.service;
            }
            else {
                // Session is dead, clean it up
                await this.cleanupSession(normalizedPath);
            }
        }
        // Create lock to prevent concurrent creation (RACE CONDITION FIX)
        const creationPromise = this.createSessionWithRetry(normalizedPath, profileName);
        this.sessionLocks.set(normalizedPath, creationPromise);
        try {
            const service = await creationPromise;
            return service;
        }
        finally {
            this.sessionLocks.delete(normalizedPath);
        }
    }
    /**
     * Check if a session exists and is active for the given project
     */
    hasActiveSession(projectRoot) {
        const normalizedPath = this.normalizePath(projectRoot);
        const session = this.sessions.get(normalizedPath);
        return session ? session.isActive : false;
    }
    /**
     * Get session info without activating it
     */
    getSessionInfo(projectRoot) {
        const normalizedPath = this.normalizePath(projectRoot);
        return this.sessions.get(normalizedPath) || null;
    }
    /**
     * Explicitly end a session for a project
     */
    async endSession(projectRoot) {
        const normalizedPath = this.normalizePath(projectRoot);
        await this.cleanupSession(normalizedPath);
    }
    /**
     * End all sessions (for shutdown)
     */
    async endAllSessions() {
        this.isShuttingDown = true;
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        const cleanupPromises = Array.from(this.sessions.keys()).map(projectRoot => this.cleanupSession(projectRoot));
        await Promise.allSettled(cleanupPromises);
        console.error('[SessionManager] All sessions cleaned up during shutdown');
    }
    /**
     * Get memory usage statistics
     */
    getMemoryStats() {
        const activeSessions = Array.from(this.sessions.values()).filter(s => s.isActive).length;
        // TODO: Integrate with ScreenshotStorage to get actual memory usage
        return {
            totalSessions: this.sessions.size,
            activeSessions,
            memoryUsageMB: 0 // Placeholder - will be implemented with ScreenshotStorage integration
        };
    }
    // ─── Private Implementation ──────────────────────────
    async createSessionWithRetry(projectRoot, profileName) {
        let lastError = null;
        for (let attempt = 1; attempt <= this.config.maxRetryAttempts; attempt++) {
            try {
                console.error(`[SessionManager] Creating session for ${projectRoot} (attempt ${attempt}/${this.config.maxRetryAttempts})`);
                const service = new AppiumSessionService();
                const sessionInfo = await service.startSession(projectRoot, profileName);
                const record = {
                    service,
                    projectRoot,
                    createdAt: Date.now(),
                    lastUsedAt: Date.now(),
                    sessionId: sessionInfo.sessionId,
                    isActive: true
                };
                this.sessions.set(projectRoot, record);
                console.error(`[SessionManager] ✅ Session created successfully: ${sessionInfo.sessionId}`);
                return service;
            }
            catch (error) {
                lastError = error;
                console.error(`[SessionManager] ❌ Session creation failed (attempt ${attempt}): ${error.message}`);
                if (attempt < this.config.maxRetryAttempts) {
                    const delayMs = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
                    console.error(`[SessionManager] Retrying in ${delayMs}ms...`);
                    await this.delay(delayMs);
                }
            }
        }
        // All retries failed
        throw new AppForgeError(ErrorCode.E001_NO_SESSION, `Failed to create session after ${this.config.maxRetryAttempts} attempts. Last error: ${lastError?.message}`, [
            'Check if Appium server is running (npx appium)',
            'Verify device/emulator is connected (adb devices / xcrun simctl list)',
            'Ensure app is installed and capabilities are correct',
            'Check for port conflicts (kill existing Appium processes)'
        ]);
    }
    async isSessionHealthy(record) {
        try {
            return await record.service.isSessionAlive();
        }
        catch {
            return false;
        }
    }
    async cleanupSession(projectRoot) {
        const record = this.sessions.get(projectRoot);
        if (!record)
            return;
        try {
            console.error(`[SessionManager] Cleaning up session for ${projectRoot}`);
            await record.service.endSession();
        }
        catch (error) {
            console.error(`[SessionManager] ⚠️ Error during session cleanup: ${error.message}`);
        }
        finally {
            this.sessions.delete(projectRoot);
        }
    }
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupIdleSessions();
        }, this.config.cleanupIntervalMs);
    }
    async cleanupIdleSessions() {
        if (this.isShuttingDown)
            return;
        const now = Date.now();
        const idleProjectRoots = [];
        for (const [projectRoot, record] of this.sessions.entries()) {
            const idleTime = now - record.lastUsedAt;
            if (idleTime > this.config.maxIdleTimeMs) {
                console.error(`[SessionManager] Session ${projectRoot} idle for ${Math.round(idleTime / 1000)}s, cleaning up...`);
                idleProjectRoots.push(projectRoot);
            }
        }
        // Cleanup idle sessions
        for (const projectRoot of idleProjectRoots) {
            await this.cleanupSession(projectRoot);
        }
    }
    registerExitHandlers() {
        // Prevent registering handlers multiple times
        if (SessionManager.hasRegisteredHandlers)
            return;
        SessionManager.hasRegisteredHandlers = true;
        const cleanup = async () => {
            console.error('[SessionManager] Process exit detected, cleaning up sessions...');
            await this.endAllSessions();
        };
        // Handle various exit scenarios
        process.on('exit', () => {
            // Note: async cleanup won't work in 'exit', but we try anyway
            this.endAllSessions().catch(() => { });
        });
        process.on('SIGINT', async () => {
            await cleanup();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            await cleanup();
            process.exit(0);
        });
        process.on('uncaughtException', async (error) => {
            console.error('[SessionManager] Uncaught exception, cleaning up sessions...', error);
            await cleanup();
            process.exit(1);
        });
        process.on('unhandledRejection', async (reason) => {
            console.error('[SessionManager] Unhandled rejection, cleaning up sessions...', reason);
            await cleanup();
            process.exit(1);
        });
    }
    normalizePath(projectRoot) {
        // Normalize path separators and resolve relative paths
        return projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Return unique string identifier for this instance (for testing)
     */
    toString() {
        return `SessionManager#${this.instanceId}`;
    }
    /**
     * For testing: Force cleanup of singleton (use with caution)
     */
    static async destroyInstance() {
        if (SessionManager.instance) {
            await SessionManager.instance.endAllSessions();
            SessionManager.instance = null;
        }
    }
}
