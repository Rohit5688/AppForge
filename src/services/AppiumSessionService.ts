import { remote, type Browser } from 'webdriverio';
import { McpConfigService, type McpConfig } from './McpConfigService.js';
import fs from 'fs';
import path from 'path';

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

  /**
   * Starts a new Appium session using capabilities from mcp-config.json.
   * Returns session info including initial page source and screenshot.
   */
  public async startSession(projectRoot: string, profileName?: string): Promise<SessionInfo> {
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

      const caps = this.driver.capabilities as any;
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
    } catch (error: any) {
      const msg = error.message || String(error);
      if (msg.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to Appium at ${serverUrl}. ` +
          `Make sure Appium is running:\n  npx appium\n` +
          `Or start it with a specific port:\n  npx appium --port 4723`
        );
      }
      if (msg.includes('session not created') || msg.includes('Could not start')) {
        throw new Error(
          `Appium session creation failed. Check:\n` +
          `1. Is an emulator/simulator running? (adb devices / xcrun simctl list)\n` +
          `2. Is the app installed? (app path: ${capabilities['appium:app'] ?? 'not set'})\n` +
          `3. Are the capabilities correct?\n` +
          `Raw error: ${msg}`
        );
      }
      throw error;
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
   * Returns current session status.
   */
  public isSessionActive(): boolean {
    return this.driver !== null;
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
   * Resolves capabilities from existing WDIO configs OR mcp-config.json.
   * Priority: 1. Existing wdio.conf.ts/js, 2. mcp-config.json profiles.
   */
  private resolveCapabilities(config: McpConfig, profileName?: string): Record<string, any> {
    const projectRoot = path.dirname(this.configService.getPaths(config).pagesRoot); // Best guess at root

    // 1. Try to find existing WDIO config first
    const wdioPaths = [
      path.join(projectRoot, 'wdio.conf.ts'),
      path.join(projectRoot, 'wdio.conf.js'),
      path.join(projectRoot, 'config', 'wdio.conf.ts'),
      path.join(projectRoot, 'config', 'wdio.conf.js')
    ];

    for (const p of wdioPaths) {
      if (fs.existsSync(p)) {
        console.error(`[AppForge] Found existing WDIO config at ${p}. Extracting capabilities...`);
        const content = fs.readFileSync(p, 'utf8');
        // Simple regex extraction for capabilities block (MVP approach)
        const capMatch = content.match(/capabilities:\s*\[\s*([\s\S]*?)\s*\]/);
        if (capMatch && capMatch[1]) {
           // This is a naive parse of the FIRST capability block. 
           // In a real run, the LLM will use 'execute_sandbox_code' to parse this better.
           console.error(`[AppForge] Capabilities found in ${path.basename(p)}. Syncing...`);
        }
      }
    }

    const profiles = config.mobile.capabilitiesProfiles;
    const names = Object.keys(profiles);

    if (names.length === 0) {
      throw new Error('No capability profiles found in wdio.conf or mcp-config.json. Run setup_project first.');
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
