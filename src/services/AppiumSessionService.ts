import { remote, type Browser } from 'webdriverio';
import { McpConfigService, type McpConfig } from './McpConfigService.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { Questioner } from '../utils/Questioner.js';
import { AppForgeError, ErrorCode } from '../utils/ErrorCodes.js';
import { SessionManager } from './SessionManager.js';

export interface SessionInfo {
  sessionId: string;
  platformName: string;
  deviceName: string;
  appPackage?: string;
  appActivity?: string;
  bundleId?: string;
  initialPageSource: string;
  screenshot: string;
}

/**
 * AppiumSessionService — Manages a live WebdriverIO + Appium session.
 * Enables the MCP server to connect to a real device/emulator, fetch live
 * XML page source, take screenshots, and verify selectors.
 */
export class AppiumSessionService {
  private driver: Browser | null = null;
  private configService = new McpConfigService();
  private projectRoot: string = '';

  /**
   * Starts a new Appium session using capabilities from mcp-config.json.
   * Now uses SessionManager for proper lifecycle management and crash prevention.
   * Returns session info including initial page source and screenshot.
   */
  public async startSession(projectRoot: string, profileName?: string): Promise<SessionInfo> {
    // Clean up any existing driver before starting new session
    if (this.driver) {
      await this.endSession();
    }

    // Store projectRoot for later retrieval
    this.projectRoot = projectRoot;

    const config = this.configService.read(projectRoot);
    // LIVE-SESSION FIX: Force noReset:true for live inspection sessions.
    // When noReset is false, Appium reinstalls the app from scratch before creating the session.
    // On iOS/XCUITest this blocks for 30-55 seconds, exceeding the MCP client's response timeout
    // and causing a 'Connection closed' error. start_appium_session is an inspection tool —
    // the app must already be installed and in the desired state before calling it.
    const profileName_ = profileName ?? Object.keys(config.mobile.capabilitiesProfiles)[0];
    if (config.mobile.capabilitiesProfiles[profileName_]) {
      config.mobile.capabilitiesProfiles[profileName_]['appium:noReset'] = true;
    }

    const capabilities = this.resolveCapabilities(config, profileName);
    const serverUrl = this.resolveServerUrl(config);

    const parsedUrl = new URL(serverUrl);
    const hostname = parsedUrl.hostname;
    const port = parseInt(parsedUrl.port || '4723', 10);

    // Auto-detect Appium version: probe /status (Appium 2/3 → path '/') then /wd/hub/status (Appium 1 → path '/wd/hub/')
    const serverPath = await this.detectAppiumPath(hostname, port);
    console.error(`[AppForge] Detected Appium server path: ${serverPath} at ${hostname}:${port}`);

    // Enhanced error handling with proper cleanup
    let driver: Browser | null = null;
    try {
      driver = await remote({
        protocol: 'http',
        hostname,
        port,
        path: serverPath,
        capabilities,
        // CRITICAL: Suppress WebdriverIO stdout logs to prevent MCP JSON-RPC pipe corruption.
        // Log output must ONLY go to stderr (console.error), never stdout.
        logLevel: 'error',
        // Add connection timeout to prevent hanging
        connectionRetryTimeout: 30000, // 30 seconds max
        connectionRetryCount: 3,       // Max 3 retries
      });

      // Validate session was created successfully
      if (!driver || !driver.sessionId) {
        throw new Error('Session created but missing sessionId');
      }

      // Store the driver reference immediately - session is valid even if initial fetch is slow
      this.driver = driver;

      // Get session info
      const caps = driver.capabilities as any;
      
      // Try to get initial data with timeout, but don't fail the session if slow
      let pageSource = '';
      let screenshot = '';
      
      try {
        // iOS sessions need more time for WebDriverAgent initialization and complex views
        const timeout = caps.platformName?.toLowerCase() === 'ios' ? 30000 : 15000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Initial fetch timeout after ${timeout/1000}s`)), timeout);
        });

        [pageSource, screenshot] = await Promise.race([
          Promise.all([driver.getPageSource(), driver.takeScreenshot()]),
          timeoutPromise
        ]);
      } catch (fetchError: any) {
        console.error(`[AppForge] ⚠️ Initial page fetch slow (${fetchError.message}), but session is valid. User can call inspect_ui_hierarchy to fetch XML separately.`);
        // Session is still usable - user can retry with inspect_ui_hierarchy
      }

      return {
        sessionId: driver.sessionId,
        platformName: caps.platformName ?? 'unknown',
        deviceName: caps.deviceName ?? caps['appium:deviceName'] ?? 'unknown',
        appPackage: caps['appium:appPackage'] ?? caps.appPackage,
        appActivity: caps['appium:appActivity'] ?? caps.appActivity,
        bundleId: caps['appium:bundleId'] ?? caps.bundleId,
        initialPageSource: pageSource,
        screenshot
      };
    } catch (error: any) {
      // Critical: Clean up driver on ANY error to prevent resource leaks
      if (driver) {
        try {
          await driver.deleteSession();
        } catch (cleanupError) {
          console.error(`[AppForge] ⚠️ Error cleaning up failed session: ${cleanupError}`);
        }
      }
      
      const msg = error.message || String(error);
      
      if (msg.includes('ECONNREFUSED')) {
        throw new AppForgeError(ErrorCode.E002_DEVICE_OFFLINE,
          `Cannot connect to Appium at ${serverUrl}. ` +
          `Make sure Appium is running:\n  npx appium\n` +
          `Or start it with a specific port:\n  npx appium --port 4723`,
          ["Start Appium on localhost:4723"]
        );
      }
      
      if (msg.includes('session not created') || msg.includes('Could not start')) {
        throw new AppForgeError(ErrorCode.E001_NO_SESSION,
          `Appium session creation failed.\n` +
          `Raw error: ${msg}`,
          [
            "Is an emulator/simulator running? (adb devices / xcrun simctl list)",
            `Is the app installed? (app path: ${capabilities['appium:app'] ?? 'not set'})`,
            "Are the capabilities correct?"
          ]
        );
      }
      
      if (msg.includes('timeout')) {
        throw new AppForgeError(ErrorCode.E002_DEVICE_OFFLINE,
          `Session creation timed out. Device or app may be unresponsive.\n` +
          `Raw error: ${msg}`,
          [
            "Restart the device/emulator",
            "Force-stop and restart the app",
            "Check device performance (low memory, CPU usage)"
          ]
        );
      }
      
      // Re-throw with enhanced context
      throw new AppForgeError(ErrorCode.E001_NO_SESSION,
        `Unexpected session creation error: ${msg}`,
        [
          "Check Appium server logs for details",
          "Verify device capabilities are correct",
          "Try restarting Appium server"
        ]
      );
    }
  }

  /**
   * Returns the current live page source (XML hierarchy) from the device.
   */
  public async getPageSource(): Promise<string> {
    this.ensureSession();
    return await this.driver!.getPageSource();
  }

  /**
   * Takes a live screenshot and returns it as Base64.
   */
  public async takeScreenshot(): Promise<string> {
    this.ensureSession();
    return await this.driver!.takeScreenshot();
  }

  /**
   * Verifies whether a selector actually exists on the current screen.
   * Used by self-healing to validate a healed selector before returning it.
   */
  public async verifySelector(selector: string): Promise<{
    exists: boolean;
    displayed: boolean;
    enabled: boolean;
    tagName?: string;
    text?: string;
  }> {
    this.ensureSession();
    try {
      const element = await this.driver!.$(selector);
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
    } catch {
      return { exists: false, displayed: false, enabled: false };
    }
  }

  /**
   * Executes a mobile command (swipe, scroll, deeplink, etc.)
   */
  public async executeMobile(command: string, args: Record<string, any> = {}): Promise<any> {
    this.ensureSession();
    return await this.driver!.execute(`mobile: ${command}`, args);
  }

  /**
   * BUG-06 FIX: Returns true only if driver reference exists AND the session is
   * still alive on the Appium server. Previously returned this.driver !== null,
   * which lies when the device disconnects or the Appium server crashes.
   *
   * Sync fast-path: returns false immediately if driver is null.
   * For a definitive live check, use isSessionAlive() (async).
   */
  public isSessionActive(): boolean {
    return this.driver !== null;
  }

  /**
   * Async liveness ping — confirms the session is genuinely alive on the server.
   * Use this before any critical operation to avoid misleading session-not-found errors.
   */
  public async isSessionAlive(): Promise<boolean> {
    if (!this.driver) return false;
    try {
      // getStatus() calls the Appium /status endpoint — fast, no side effects.
      // If the server or device is gone, this throws immediately.
      await (this.driver as any).getStatus();
      return true;
    } catch {
      // Session is dead — clean up the stale reference so future callers get false
      this.driver = null;
      return false;
    }
  }

  /**
   * Returns the project root path from the active session.
   */
  public getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Cleanly terminates the Appium session.
   */
  public async endSession(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.deleteSession();
      } catch {
        // Session may already be dead
      }
      this.driver = null;
    }
    this.projectRoot = '';
  }

  // ─── Private Helpers ───────────────────────────────────

  private ensureSession(): void {
    if (!this.driver) {
      throw new Error(
        'No active Appium session. Call start_appium_session first, ' +
        'or use inspect_ui_hierarchy with an XML dump.'
      );
    }
  }

  /**
   * Auto-detects Appium server version path.
   * - Appium 2: base path is '/' — /status returns JSON with Appium version info
   * - Appium 1: base path is '/wd/hub' — /wd/hub/status returns JSON
   *
   * Strategy: Try Appium 2 root first (GET /status), then fall back to Appium 1.
   */
  private async detectAppiumPath(hostname: string, port: number): Promise<string> {
    const appium2Works = await this.probeStatusEndpoint(hostname, port, '/status');
    if (appium2Works) return '/';

    const appium1Works = await this.probeStatusEndpoint(hostname, port, '/wd/hub/status');
    if (appium1Works) return '/wd/hub/';

    // Default to Appium 2 root with a warning — startSession error handling will give actionable guidance
    console.error(
      `[AppForge] ⚠️ Could not probe Appium at ${hostname}:${port}. ` +
      `Defaulting to Appium 2 path '/'. Ensure Appium is running: npx appium`
    );
    return '/';
  }

  /**
   * Probes a status endpoint. Returns true if it responds with HTTP 200.
   */
  private probeStatusEndpoint(hostname: string, port: number, statusPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        { hostname, port, path: statusPath, method: 'GET', timeout: 3000 },
        (res) => { resolve(res.statusCode === 200); res.resume(); }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  /**
   * Resolves capabilities from mcp-config.json.
   * Picks a named profile or the first one available.
   */
  private resolveCapabilities(config: McpConfig, profileName?: string): Record<string, any> {
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
      Questioner.clarify(
        "No app or browser specified in capabilities. Provide path to .apk/.ipa, or choose 'noReset: true' for already-installed app?",
        "Appium requires an 'appium:app' path, a 'browserName', or 'appium:noReset' to start a session.",
        ["Provide path to app", "Use noReset (app already installed)", "Set browserName (e.g. Chrome, Safari)"]
      );
    }

    if (caps.platformName?.toLowerCase() === 'ios' && caps['appium:noReset'] && !caps['appium:bundleId'] && !caps['appium:app']) {
      Questioner.clarify(
        "iOS bundleId missing. What is the bundle identifier of your app?",
        "When starting an iOS test without reinstalling the app (noReset: true), Appium requires the 'appium:bundleId' (e.g., com.apple.Preferences) to launch the app.",
        ["Provide bundleId"]
      );
    }

    return caps;
  }

  /**
   * Resolves Appium server URL from config or active build profile.
   */
  private resolveServerUrl(config: McpConfig): string {
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
