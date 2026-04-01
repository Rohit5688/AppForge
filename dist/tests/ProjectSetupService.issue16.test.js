import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ProjectSetupService } from '../services/ProjectSetupService.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
/**
 * Test suite for Issue #16: setup_project scaffold wdio.conf.ts always imports Android config
 * regardless of platform parameter.
 *
 * REGRESSION TESTS:
 * - platform: 'ios' should generate wdio.conf.ts importing from './wdio.ios.conf'
 * - platform: 'android' should generate wdio.conf.ts importing from './wdio.android.conf'
 * - platform: 'both' should generate separate wdio.android.conf.ts and wdio.ios.conf.ts (no wdio.conf.ts)
 */
describe('Issue #16: wdio.conf.ts platform-specific imports', () => {
    let service;
    let testRoot;
    function setupTest() {
        service = new ProjectSetupService();
        testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-issue16-'));
    }
    function cleanupTest() {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    }
    it('platform: ios - wdio.conf.ts should NOT import from wdio.android.conf', async () => {
        setupTest();
        try {
            await service.setup(testRoot, 'ios', 'TestApp');
            const wdioConfPath = path.join(testRoot, 'wdio.conf.ts');
            assert.ok(fs.existsSync(wdioConfPath), 'wdio.conf.ts should exist for iOS project');
            const content = fs.readFileSync(wdioConfPath, 'utf8');
            // Should NOT contain android import
            assert.ok(!content.includes('./wdio.android.conf'), 'iOS project should not import wdio.android.conf');
            assert.ok(!content.includes('wdio.android.conf'), 'iOS project should not reference android config at all');
            // Should have iOS-specific capabilities
            assert.ok(content.includes("platformName: 'iOS'"), 'iOS project should have iOS platformName');
            assert.ok(content.includes('XCUITest'), 'iOS project should use XCUITest automation');
        }
        finally {
            cleanupTest();
        }
    });
    it('platform: android - wdio.conf.ts should NOT import from wdio.ios.conf', async () => {
        setupTest();
        try {
            await service.setup(testRoot, 'android', 'TestApp');
            const wdioConfPath = path.join(testRoot, 'wdio.conf.ts');
            assert.ok(fs.existsSync(wdioConfPath), 'wdio.conf.ts should exist for Android project');
            const content = fs.readFileSync(wdioConfPath, 'utf8');
            // Should NOT contain iOS import
            assert.ok(!content.includes('./wdio.ios.conf'), 'Android project should not import wdio.ios.conf');
            assert.ok(!content.includes('wdio.ios.conf'), 'Android project should not reference iOS config at all');
            // Should have Android-specific capabilities
            assert.ok(content.includes("platformName: 'Android'"), 'Android project should have Android platformName');
            assert.ok(content.includes('UiAutomator2'), 'Android project should use UiAutomator2 automation');
        }
        finally {
            cleanupTest();
        }
    });
    it('platform: both - should NOT generate wdio.conf.ts', async () => {
        setupTest();
        try {
            await service.setup(testRoot, 'both', 'TestApp');
            const wdioConfPath = path.join(testRoot, 'wdio.conf.ts');
            // Should NOT exist for 'both' platform
            assert.ok(!fs.existsSync(wdioConfPath), 'wdio.conf.ts should not exist when platform is "both"');
            // Should generate platform-specific configs instead
            const androidConfPath = path.join(testRoot, 'wdio.android.conf.ts');
            const iosConfPath = path.join(testRoot, 'wdio.ios.conf.ts');
            const sharedConfPath = path.join(testRoot, 'wdio.shared.conf.ts');
            assert.ok(fs.existsSync(androidConfPath), 'wdio.android.conf.ts should exist');
            assert.ok(fs.existsSync(iosConfPath), 'wdio.ios.conf.ts should exist');
            assert.ok(fs.existsSync(sharedConfPath), 'wdio.shared.conf.ts should exist');
            // Verify platform-specific configs import from shared
            const androidContent = fs.readFileSync(androidConfPath, 'utf8');
            const iosContent = fs.readFileSync(iosConfPath, 'utf8');
            assert.ok(androidContent.includes('./wdio.shared.conf'), 'Android config should import from shared config');
            assert.ok(iosContent.includes('./wdio.shared.conf'), 'iOS config should import from shared config');
        }
        finally {
            cleanupTest();
        }
    });
    it('iOS project should be runnable without wdio.android.conf.ts', async () => {
        setupTest();
        try {
            await service.setup(testRoot, 'ios', 'TestApp');
            // Ensure Android config does NOT exist
            const androidConfPath = path.join(testRoot, 'wdio.android.conf.ts');
            assert.ok(!fs.existsSync(androidConfPath), 'iOS project should not have wdio.android.conf.ts file');
            // Verify wdio.conf.ts is self-contained (no external import dependency on missing file)
            const wdioConfPath = path.join(testRoot, 'wdio.conf.ts');
            const content = fs.readFileSync(wdioConfPath, 'utf8');
            // Should be a complete config, not a re-export
            assert.ok(content.includes('export const config'), 'iOS wdio.conf.ts should export config');
            assert.ok(content.includes('capabilities:'), 'iOS wdio.conf.ts should have capabilities');
        }
        finally {
            cleanupTest();
        }
    });
    it('Android project should be runnable without wdio.ios.conf.ts', async () => {
        setupTest();
        try {
            await service.setup(testRoot, 'android', 'TestApp');
            // Ensure iOS config does NOT exist
            const iosConfPath = path.join(testRoot, 'wdio.ios.conf.ts');
            assert.ok(!fs.existsSync(iosConfPath), 'Android project should not have wdio.ios.conf.ts file');
            // Verify wdio.conf.ts is self-contained
            const wdioConfPath = path.join(testRoot, 'wdio.conf.ts');
            const content = fs.readFileSync(wdioConfPath, 'utf8');
            assert.ok(content.includes('export const config'), 'Android wdio.conf.ts should export config');
            assert.ok(content.includes('capabilities:'), 'Android wdio.conf.ts should have capabilities');
        }
        finally {
            cleanupTest();
        }
    });
    it('default platform (no argument) defaults to android', async () => {
        setupTest();
        try {
            await service.setup(testRoot); // No platform specified
            const wdioConfPath = path.join(testRoot, 'wdio.conf.ts');
            const content = fs.readFileSync(wdioConfPath, 'utf8');
            // Should default to Android
            assert.ok(content.includes("platformName: 'Android'"), 'Default platform should be Android');
            assert.ok(content.includes('UiAutomator2'), 'Default platform should use UiAutomator2');
        }
        finally {
            cleanupTest();
        }
    });
});
