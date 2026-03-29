import { remote } from 'webdriverio';
import { McpConfigService } from './McpConfigService.js';
import { Questioner } from '../utils/Questioner.js';
import { AppForgeError, ErrorCode } from '../utils/ErrorCodes.js';
/**
 * AppiumSessionService — Manages a live WebdriverIO + Appium session.
 * Enables the MCP server to connect to a real device/emulator, fetch live
 * XML page source, take screenshots, and verify selectors.
 */
export class AppiumSessionService {
    driver = null;
    configService = new McpConfigService();
    /**
     * Starts a new Appium session using capabilities from mcp-config.json.
     * Returns session info including initial page source and screenshot.
     */
    async startSession(projectRoot, profileName) {
        if (this.driver) {
            await this.endSession();
        }
        const config = this.configService.read(projectRoot);
        const capabilities = this.resolveCapabilities(config, profileName);
        const serverUrl = this.resolveServerUrl(config);
        try {
            this.driver = await remote({
                protocol: 'http',
                hostname: new URL(serverUrl).hostname,
                port: parseInt(new URL(serverUrl).port || '4723'),
                path: '/wd/hub',
                capabilities
            });
            const caps = this.driver.capabilities;
            const pageSource = await this.driver.getPageSource();
            const screenshot = await this.driver.takeScreenshot();
            return {
                sessionId: this.driver.sessionId,
                platformName: caps.platformName ?? 'unknown',
                deviceName: caps.deviceName ?? caps['appium:deviceName'] ?? 'unknown',
                appPackage: caps['appium:appPackage'] ?? caps.appPackage,
                appActivity: caps['appium:appActivity'] ?? caps.appActivity,
                bundleId: caps['appium:bundleId'] ?? caps.bundleId,
                initialPageSource: pageSource,
                screenshot
            };
        }
        catch (error) {
            const msg = error.message || String(error);
            if (msg.includes('ECONNREFUSED')) {
                throw new AppForgeError(ErrorCode.E002_DEVICE_OFFLINE, `Cannot connect to Appium at ${serverUrl}. ` +
                    `Make sure Appium is running:\n  npx appium\n` +
                    `Or start it with a specific port:\n  npx appium --port 4723`, ["Start Appium on localhost:4723"]);
            }
            if (msg.includes('session not created') || msg.includes('Could not start')) {
                throw new AppForgeError(ErrorCode.E001_NO_SESSION, `Appium session creation failed.\n` +
                    `Raw error: ${msg}`, [
                    "Is an emulator/simulator running? (adb devices / xcrun simctl list)",
                    `Is the app installed? (app path: ${capabilities['appium:app'] ?? 'not set'})`,
                    "Are the capabilities correct?"
                ]);
            }
            throw error;
        }
    }
    /**
     * Returns the current live page source (XML hierarchy) from the device.
     */
    async getPageSource() {
        this.ensureSession();
        return await this.driver.getPageSource();
    }
    /**
     * Takes a live screenshot and returns it as Base64.
     */
    async takeScreenshot() {
        this.ensureSession();
        return await this.driver.takeScreenshot();
    }
    /**
     * Verifies whether a selector actually exists on the current screen.
     * Used by self-healing to validate a healed selector before returning it.
     */
    async verifySelector(selector) {
        this.ensureSession();
        try {
            const element = await this.driver.$(selector);
            const exists = await element.isExisting();
            if (!exists) {
                return { exists: false, displayed: false, enabled: false };
            }
            return {
                exists: true,
                displayed: await element.isDisplayed(),
                enabled: await element.isEnabled(),
                tagName: await element.getTagName(),
                text: await element.getText().catch(() => '')
            };
        }
        catch {
            return { exists: false, displayed: false, enabled: false };
        }
    }
    /**
     * Executes a mobile command (swipe, scroll, deeplink, etc.)
     */
    async executeMobile(command, args = {}) {
        this.ensureSession();
        return await this.driver.execute(`mobile: ${command}`, args);
    }
    /**
     * BUG-06 FIX: Returns true only if driver reference exists AND the session is
     * still alive on the Appium server. Previously returned this.driver !== null,
     * which lies when the device disconnects or the Appium server crashes.
     *
     * Sync fast-path: returns false immediately if driver is null.
     * For a definitive live check, use isSessionAlive() (async).
     */
    isSessionActive() {
        return this.driver !== null;
    }
    /**
     * Async liveness ping — confirms the session is genuinely alive on the server.
     * Use this before any critical operation to avoid misleading session-not-found errors.
     */
    async isSessionAlive() {
        if (!this.driver)
            return false;
        try {
            // getStatus() calls the Appium /status endpoint — fast, no side effects.
            // If the server or device is gone, this throws immediately.
            await this.driver.getStatus();
            return true;
        }
        catch {
            // Session is dead — clean up the stale reference so future callers get false
            this.driver = null;
            return false;
        }
    }
    /**
     * Cleanly terminates the Appium session.
     */
    async endSession() {
        if (this.driver) {
            try {
                await this.driver.deleteSession();
            }
            catch {
                // Session may already be dead
            }
            this.driver = null;
        }
    }
    // ─── Private Helpers ───────────────────────────────────
    ensureSession() {
        if (!this.driver) {
            throw new Error('No active Appium session. Call start_appium_session first, ' +
                'or use inspect_ui_hierarchy with an XML dump.');
        }
    }
    /**
     * Resolves capabilities from mcp-config.json.
     * Picks a named profile or the first one available.
     */
    resolveCapabilities(config, profileName) {
        const profiles = config.mobile.capabilitiesProfiles;
        const names = Object.keys(profiles);
        if (names.length === 0) {
            throw new Error('No capability profiles defined in mcp-config.json. Run setup_project first.');
        }
        const name = profileName ?? names[0];
        const caps = profiles[name];
        if (!caps) {
            throw new Error(`Capability profile "${name}" not found. Available: ${names.join(', ')}`);
        }
        // If a build profile is active, inject its app path
        const activeBuild = this.configService.getActiveBuild(config);
        if (activeBuild?.appPath) {
            caps['appium:app'] = activeBuild.appPath;
        }
        if (!caps['appium:app'] && !caps['appium:noReset'] && caps.browserName !== 'Chrome' && caps.browserName !== 'Safari') {
            Questioner.clarify("No app or browser specified in capabilities. Provide path to .apk/.ipa, or choose 'noReset: true' for already-installed app?", "Appium requires an 'appium:app' path, a 'browserName', or 'appium:noReset' to start a session.", ["Provide path to app", "Use noReset (app already installed)", "Set browserName (e.g. Chrome, Safari)"]);
        }
        if (caps.platformName?.toLowerCase() === 'ios' && caps['appium:noReset'] && !caps['appium:bundleId'] && !caps['appium:app']) {
            Questioner.clarify("iOS bundleId missing. What is the bundle identifier of your app?", "When starting an iOS test without reinstalling the app (noReset: true), Appium requires the 'appium:bundleId' (e.g., com.apple.Preferences) to launch the app.", ["Provide bundleId"]);
        }
        return caps;
    }
    /**
     * Resolves Appium server URL from config or active build profile.
     */
    resolveServerUrl(config) {
        const activeBuild = this.configService.getActiveBuild(config);
        if (activeBuild?.serverUrl) {
            return activeBuild.serverUrl;
        }
        // Check cloud provider
        if (config.mobile.cloud?.provider === 'browserstack') {
            return `https://${config.mobile.cloud.username}:${config.mobile.cloud.accessKey}@hub-cloud.browserstack.com/wd/hub`;
        }
        if (config.mobile.cloud?.provider === 'saucelabs') {
            return `https://${config.mobile.cloud.username}:${config.mobile.cloud.accessKey}@ondemand.us-west-1.saucelabs.com/wd/hub`;
        }
        return 'http://localhost:4723';
    }
}
