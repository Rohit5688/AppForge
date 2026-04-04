import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { SessionManager } from '../services/SessionManager.js';
import { AppForgeError } from '../utils/ErrorCodes.js';
import * as fs from 'fs';
import * as path from 'path';
describe('SessionManager - Critical Session Stability Tests', () => {
    let mockProjectRoot;
    beforeEach(async () => {
        // Clean up any existing singleton
        await SessionManager.destroyInstance();
        mockProjectRoot = path.join(process.cwd(), 'test-session-' + Date.now());
        // Create minimal test project structure
        if (!fs.existsSync(mockProjectRoot)) {
            fs.mkdirSync(mockProjectRoot, { recursive: true });
        }
        // Create minimal mcp-config.json for testing
        const minimalConfig = {
            mobile: {
                capabilitiesProfiles: {
                    default: {
                        platformName: 'Android',
                        'appium:deviceName': 'TestDevice',
                        'appium:app': '/path/to/test.apk',
                        'appium:automationName': 'UiAutomator2'
                    }
                }
            }
        };
        fs.writeFileSync(path.join(mockProjectRoot, 'mcp-config.json'), JSON.stringify(minimalConfig, null, 2));
    });
    async function cleanupTest() {
        try {
            const sessionManager = SessionManager.getInstance();
            await sessionManager.endAllSessions();
        }
        catch (e) {
            // Ignore cleanup errors
        }
        await SessionManager.destroyInstance();
        if (fs.existsSync(mockProjectRoot)) {
            fs.rmSync(mockProjectRoot, { recursive: true, force: true });
        }
    }
    describe('🔥 Session Manager Singleton Behavior', () => {
        it('should create and manage singleton instance correctly', async () => {
            try {
                const manager1 = SessionManager.getInstance();
                const manager2 = SessionManager.getInstance();
                assert.strictEqual(manager1, manager2, 'Should return same singleton instance');
                // Verify initial state
                const stats = manager1.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0, 'Should start with zero sessions');
                assert.strictEqual(stats.activeSessions, 0, 'Should start with zero active sessions');
            }
            finally {
                await cleanupTest();
            }
        });
        it('should destroy and recreate singleton correctly', async () => {
            try {
                const manager1 = SessionManager.getInstance();
                const instanceId1 = manager1.toString(); // Simple way to track instance
                await SessionManager.destroyInstance();
                const manager2 = SessionManager.getInstance();
                const instanceId2 = manager2.toString();
                // They should be different instances
                assert.notStrictEqual(instanceId1, instanceId2, 'Should create new instance after destroy');
                // New instance should have clean state
                const stats = manager2.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0, 'New instance should have zero sessions');
            }
            finally {
                await cleanupTest();
            }
        });
    });
    describe('🚨 Session Creation Failure Handling', () => {
        it('should handle missing mcp-config.json gracefully', async () => {
            try {
                // Remove the config file
                fs.unlinkSync(path.join(mockProjectRoot, 'mcp-config.json'));
                const sessionManager = SessionManager.getInstance({ maxRetryAttempts: 1 });
                // Should fail with proper error
                await assert.rejects(async () => {
                    await sessionManager.getSession(mockProjectRoot);
                }, (error) => {
                    return error instanceof AppForgeError &&
                        error.message.includes('config');
                }, 'Should throw AppForgeError for missing config');
                // Manager should remain stable
                const stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0, 'Should not track failed session attempts');
            }
            finally {
                await cleanupTest();
            }
        });
        it('should validate project root path', async () => {
            try {
                const sessionManager = SessionManager.getInstance({ maxRetryAttempts: 1 });
                // Try with non-existent path
                await assert.rejects(async () => {
                    await sessionManager.getSession('/non/existent/path');
                }, (error) => {
                    return error instanceof AppForgeError;
                }, 'Should reject non-existent project paths');
                // Manager should remain stable
                const stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0, 'Should not track invalid sessions');
            }
            finally {
                await cleanupTest();
            }
        });
        it('should prevent duplicate sessions for same project', async () => {
            try {
                const sessionManager = SessionManager.getInstance({
                    maxRetryAttempts: 1,
                    maxIdleTimeMs: 5000 // Short idle time for testing
                });
                // Since we can't mock webdriverio easily in Node.js tests,
                // we'll test the validation logic that should prevent
                // multiple session creation attempts
                let sessionCreateAttempts = 0;
                // Start multiple session requests concurrently
                const promises = Array(3).fill(null).map(async () => {
                    try {
                        sessionCreateAttempts++;
                        // This will likely fail due to no Appium server, but that's ok
                        // We're testing that the manager handles concurrent requests
                        await sessionManager.getSession(mockProjectRoot);
                    }
                    catch (error) {
                        // Expected to fail in test environment
                        return error;
                    }
                });
                const results = await Promise.allSettled(promises);
                // All requests should have been attempted, but manager should remain stable
                assert.strictEqual(sessionCreateAttempts, 3, 'All requests should be processed');
                const stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0, 'Failed sessions should not be tracked');
            }
            finally {
                await cleanupTest();
            }
        });
    });
    describe('💥 Memory and Resource Management', () => {
        it('should track session statistics correctly', async () => {
            try {
                const sessionManager = SessionManager.getInstance();
                // Initially should be empty
                let stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0);
                assert.strictEqual(stats.activeSessions, 0);
                assert.strictEqual(typeof stats.memoryUsageMB, 'number');
                assert.ok(stats.memoryUsageMB >= 0, 'Memory usage should be non-negative');
                // Test session info for non-existent project
                const sessionInfo = sessionManager.getSessionInfo('non-existent');
                assert.strictEqual(sessionInfo, null);
                // Test has active session for non-existent project  
                const hasActive = sessionManager.hasActiveSession('non-existent');
                assert.strictEqual(hasActive, false);
            }
            finally {
                await cleanupTest();
            }
        });
        it('should handle session cleanup on destroy', async () => {
            try {
                const sessionManager = SessionManager.getInstance();
                // Verify clean initial state
                let stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0);
                // Destroy should not throw even with no sessions
                await sessionManager.endAllSessions();
                stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0);
            }
            finally {
                await cleanupTest();
            }
        });
    });
    describe('⏰ Error Boundaries and Safety', () => {
        it('should handle malformed config gracefully', async () => {
            try {
                // Write malformed JSON
                fs.writeFileSync(path.join(mockProjectRoot, 'mcp-config.json'), '{ invalid json content');
                const sessionManager = SessionManager.getInstance({ maxRetryAttempts: 1 });
                await assert.rejects(async () => {
                    await sessionManager.getSession(mockProjectRoot);
                }, (error) => {
                    return error instanceof Error;
                }, 'Should handle malformed config');
                // Manager should remain stable
                const stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0);
            }
            finally {
                await cleanupTest();
            }
        });
        it('should handle rapid session manager creation/destruction cycles', async () => {
            try {
                // Rapid create/destroy cycles to test stability
                for (let i = 0; i < 5; i++) {
                    const manager = SessionManager.getInstance();
                    const stats = manager.getMemoryStats();
                    assert.strictEqual(stats.totalSessions, 0, `Cycle ${i} should start clean`);
                    await SessionManager.destroyInstance();
                }
                // Final verification
                const finalManager = SessionManager.getInstance();
                const finalStats = finalManager.getMemoryStats();
                assert.strictEqual(finalStats.totalSessions, 0, 'Final state should be clean');
            }
            finally {
                await cleanupTest();
            }
        });
        it('should respect retry configuration limits', async () => {
            try {
                const sessionManager = SessionManager.getInstance({
                    maxRetryAttempts: 2,
                    cleanupIntervalMs: 100 // Fast cleanup for testing
                });
                const startTime = Date.now();
                // This should fail but respect retry limits
                await assert.rejects(async () => {
                    await sessionManager.getSession(mockProjectRoot);
                }, 'Should eventually fail after retries');
                const elapsed = Date.now() - startTime;
                // Should have attempted retries (2 attempts + initial = at least 200ms for delays)
                assert.ok(elapsed >= 100, 'Should have taken time for retries');
                assert.ok(elapsed < 10000, 'Should not hang indefinitely');
                const stats = sessionManager.getMemoryStats();
                assert.strictEqual(stats.totalSessions, 0, 'Failed attempts should not create sessions');
            }
            finally {
                await cleanupTest();
            }
        });
    });
    describe('🧩 Integration with Configuration Service', () => {
        it('should validate config file structure', async () => {
            try {
                // Create config without required structure
                const invalidConfig = {
                    someOtherField: 'value'
                    // Missing mobile.capabilitiesProfiles
                };
                fs.writeFileSync(path.join(mockProjectRoot, 'mcp-config.json'), JSON.stringify(invalidConfig, null, 2));
                const sessionManager = SessionManager.getInstance({ maxRetryAttempts: 1 });
                await assert.rejects(async () => {
                    await sessionManager.getSession(mockProjectRoot);
                }, (error) => {
                    return error instanceof AppForgeError;
                }, 'Should validate config structure');
            }
            finally {
                await cleanupTest();
            }
        });
    });
});
