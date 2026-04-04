import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
/**
 * ScreenshotStorage — Manages local storage of screenshots to prevent
 * base64 data from consuming excessive context tokens in MCP responses.
 *
 * Issue: Screenshots in responses eat whole context and cause LLM hallucinations.
 * Solution: Store screenshots locally with unique IDs and return file paths instead.
 */
export class ScreenshotStorage {
    storageRoot;
    constructor(projectRoot) {
        // Store screenshots in .AppForge/screenshots/ to keep them isolated
        this.storageRoot = path.join(projectRoot, '.AppForge', 'screenshots');
        this.ensureStorageDirectory();
    }
    /**
     * Creates the storage directory if it doesn't exist.
     */
    ensureStorageDirectory() {
        if (!fs.existsSync(this.storageRoot)) {
            fs.mkdirSync(this.storageRoot, { recursive: true });
        }
    }
    /**
     * Stores a base64 screenshot and returns the file path.
     * @param base64Data - Base64 encoded screenshot data
     * @param prefix - Optional prefix for the filename (e.g., 'session', 'failure', 'heal')
     * @returns Object containing the file path and metadata
     */
    store(base64Data, prefix = 'screenshot') {
        // Generate unique filename using timestamp + short hash
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const hash = crypto.createHash('md5').update(base64Data.substring(0, 100)).digest('hex').substring(0, 8);
        const filename = `${prefix}_${timestamp}_${hash}.png`;
        const filePath = path.join(this.storageRoot, filename);
        // Write binary PNG data
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        return {
            filePath,
            relativePath: path.relative(process.cwd(), filePath),
            timestamp: new Date().toISOString(),
            size: buffer.length
        };
    }
    /**
     * Reads a stored screenshot and returns it as base64.
     * Used when the screenshot needs to be retrieved for processing.
     */
    read(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Screenshot not found: ${filePath}`);
        }
        const buffer = fs.readFileSync(filePath);
        return buffer.toString('base64');
    }
    /**
     * Cleans up old screenshots to prevent storage bloat.
     * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
     */
    cleanup(maxAgeMs = 86400000) {
        let removed = 0;
        let freedBytes = 0;
        const now = Date.now();
        if (!fs.existsSync(this.storageRoot)) {
            return { removed: 0, freedBytes: 0 };
        }
        const files = fs.readdirSync(this.storageRoot);
        for (const file of files) {
            const filePath = path.join(this.storageRoot, file);
            const stats = fs.statSync(filePath);
            // Remove files older than maxAgeMs
            if (now - stats.mtimeMs > maxAgeMs) {
                freedBytes += stats.size;
                fs.unlinkSync(filePath);
                removed++;
            }
        }
        return { removed, freedBytes };
    }
    /**
     * Returns a summary of stored screenshots.
     */
    getSummary() {
        if (!fs.existsSync(this.storageRoot)) {
            return { count: 0, totalSizeBytes: 0, oldestTimestamp: null, newestTimestamp: null };
        }
        const files = fs.readdirSync(this.storageRoot);
        let totalSize = 0;
        let oldest = null;
        let newest = null;
        for (const file of files) {
            const filePath = path.join(this.storageRoot, file);
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
            if (oldest === null || stats.mtimeMs < oldest) {
                oldest = stats.mtimeMs;
            }
            if (newest === null || stats.mtimeMs > newest) {
                newest = stats.mtimeMs;
            }
        }
        return {
            count: files.length,
            totalSizeBytes: totalSize,
            oldestTimestamp: oldest ? new Date(oldest).toISOString() : null,
            newestTimestamp: newest ? new Date(newest).toISOString() : null
        };
    }
}
