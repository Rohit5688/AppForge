import fs from 'fs';
import path from 'path';

export class ProjectSetupService {
  /**
   * Scaffolds a complete, runnable Appium + Cucumber + TypeScript project.
   */
  public async setup(projectRoot: string, platform: string = 'android', appName: string = 'MyMobileApp'): Promise<string> {
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }

    // 1. Create directory structure
    const dirs = ['features', 'step-definitions', 'pages', 'utils', 'test-data', 'config', 'reports'];
    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    // 2. package.json
    this.scaffoldPackageJson(projectRoot, appName);

    // 3. tsconfig.json
    this.scaffoldTsConfig(projectRoot);

    // 4. cucumber.js config
    this.scaffoldCucumberConfig(projectRoot);

    // 5. BasePage.ts
    this.scaffoldBasePage(projectRoot);

    // 6. MobileGestures.ts
    this.scaffoldMobileGestures(projectRoot);

    // 7. MockServer.ts
    this.scaffoldMockServer(projectRoot);

    // 8. Before/After hooks
    this.scaffoldHooks(projectRoot);

    // 9. Sample feature
    this.scaffoldSampleFeature(projectRoot);

    // 10. .gitignore
    this.scaffoldGitignore(projectRoot);

    // 11. mcp-config.json (with paths field matching McpConfig interface)
    this.scaffoldMcpConfig(projectRoot, platform);

    // 12. wdio.conf.ts — WebdriverIO + Appium connection config
    this.scaffoldWdioConfig(projectRoot, platform);

    // 13. Mock scenarios sample JSON
    this.scaffoldMockScenarios(projectRoot);

    const summary = [
      `✅ Scaffolded Appium BDD project at ${projectRoot}`,
      '',
      'Generated files:',
      '  📦 package.json',
      '  ⚙️  tsconfig.json',
      '  🥒 cucumber.js',
      '  🔧 wdio.conf.ts',
      '  📄 mcp-config.json',
      '  🏗️  pages/BasePage.ts',
      '  🤸 utils/MobileGestures.ts',
      '  🔌 utils/MockServer.ts',
      '  🪝 step-definitions/hooks.ts',
      '  📝 features/sample.feature',
      '  📊 test-data/mock-scenarios.json',
      '  🚫 .gitignore',
      '',
      'Next steps:',
      '  1. cd ' + projectRoot,
      '  2. npm install',
      '  3. Use check_environment to verify Appium setup',
      '  4. Use generate_cucumber_pom to create tests'
    ].join('\n');

    return summary;
  }

  // ─── Scaffolders ───────────────────────────────────────────────

  private scaffoldPackageJson(projectRoot: string, appName: string) {
    const pkg = {
      name: appName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      type: 'module',
      scripts: {
        "test": "cucumber-js",
        "test:android": "cucumber-js --tags '@android'",
        "test:ios": "cucumber-js --tags '@ios'",
        "test:smoke": "cucumber-js --tags '@smoke'"
      },
      dependencies: {
        "@cucumber/cucumber": "^10.0.0",
        "webdriverio": "^8.0.0",
        "ts-node": "^10.9.0",
        "typescript": "^5.0.0",
        "express": "^4.18.0"
      },
      devDependencies: {
        "@types/node": "^20.0.0",
        "@types/express": "^4.17.0"
      }
    };
    this.writeIfNotExists(path.join(projectRoot, 'package.json'), JSON.stringify(pkg, null, 2));
  }

  private scaffoldTsConfig(projectRoot: string) {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      // Acknowledge existing tsconfig — do not overwrite
      return;
    }
    const tsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022"],
        outDir: "./dist",
        rootDir: ".",
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true
      },
      include: ["features/**/*", "step-definitions/**/*", "pages/**/*", "utils/**/*"],
      exclude: ["node_modules", "dist", "reports"]
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  }

  private scaffoldCucumberConfig(projectRoot: string) {
    const content = `// cucumber.js — Cucumber configuration
export default {
  requireModule: ['ts-node/register'],
  require: ['step-definitions/**/*.ts'],
  format: [
    'progress-bar',
    'json:reports/cucumber-report.json',
    'html:reports/cucumber-report.html'
  ],
  paths: ['features/**/*.feature'],
  publishQuiet: true
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'cucumber.js'), content);
  }

  private scaffoldBasePage(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

/**
 * BasePage — Abstract base for all Page Objects.
 * All page classes should extend this to inherit common mobile actions.
 */
export abstract class BasePage {
  /**
   * Wait for an element to be displayed, then return it.
   */
  protected async waitForElement(selector: string, timeout: number = 10000) {
    const element = await $(selector);
    await element.waitForDisplayed({ timeout });
    return element;
  }

  /**
   * Click an element after waiting for it to appear.
   */
  protected async click(selector: string) {
    const element = await this.waitForElement(selector);
    await element.click();
  }

  /**
   * Type text into an input field after clearing it.
   */
  protected async type(selector: string, value: string) {
    const element = await this.waitForElement(selector);
    await element.clearValue();
    await element.setValue(value);
  }

  /**
   * Get the text content of an element.
   */
  protected async getText(selector: string): Promise<string> {
    const element = await this.waitForElement(selector);
    return await element.getText();
  }

  /**
   * Check if an element is currently displayed.
   */
  protected async isDisplayed(selector: string): Promise<boolean> {
    try {
      const element = await $(selector);
      return await element.isDisplayed();
    } catch {
      return false;
    }
  }

  /**
   * Wait for the element to disappear.
   */
  protected async waitForElementGone(selector: string, timeout: number = 10000) {
    const element = await $(selector);
    await element.waitForDisplayed({ timeout, reverse: true });
  }

  // ─── WebView Context Switching ─────────────────────────

  /**
   * Switch to WebView context (for hybrid apps).
   * Returns the WebView context name.
   */
  protected async switchToWebView(): Promise<string> {
    const contexts = await browser.getContexts() as string[];
    const webView = contexts.find(c => c.includes('WEBVIEW'));
    if (!webView) throw new Error('No WebView context found. Available: ' + contexts.join(', '));
    await browser.switchContext(webView);
    return webView;
  }

  /**
   * Switch back to NATIVE_APP context.
   */
  protected async switchToNativeContext(): Promise<void> {
    await browser.switchContext('NATIVE_APP');
  }

  /**
   * Get all available contexts (NATIVE_APP, WEBVIEW_xxx).
   */
  /**
   * Get all available contexts (NATIVE_APP, WEBVIEW_xxx).
   */
  protected async getContexts(): Promise<string[]> {
    return await browser.getContexts() as string[];
  }

  // ─── App Lifecycle Helpers ────────────────────────────

  /**
   * Open a deep link / URL scheme to navigate directly to a screen.
   * Android: Uses 'mobile: deepLink'
   * iOS: Uses 'mobile: deepLink' or 'driver.url()'
   */
  protected async openDeepLink(url: string) {
    await browser.url(url);
  }

  /**
   * Handle native permission dialogs (Allow/Deny).
   * Common for Location, Camera, Notifications, Contacts, etc.
   */
  protected async handlePermissionDialog(accept: boolean = true) {
    try {
      const caps = browser.capabilities as any;
      const isIOS = caps.platformName?.toLowerCase() === 'ios';

      if (isIOS) {
        // iOS permission alert
        const btnLabel = accept ? 'Allow' : 'Don\\'t Allow';
        const btn = await $(\`~\${btnLabel}\`);
        if (await btn.isExisting()) await btn.click();
      } else {
        // Android permission dialog
        const btnId = accept
          ? 'com.android.permissioncontroller:id/permission_allow_button'
          : 'com.android.permissioncontroller:id/permission_deny_button';
        const btn = await $(\`id=\${btnId}\`);
        if (await btn.isExisting()) await btn.click();
      }
    } catch {
      // No permission dialog present — ignore
    }
  }

  /**
   * Simulate biometric authentication (Touch ID / Face ID / Fingerprint).
   * Requires Appium to be started with --relaxed-security.
   */
  protected async simulateBiometric(success: boolean = true) {
    const caps = browser.capabilities as any;
    const isIOS = caps.platformName?.toLowerCase() === 'ios';

    if (isIOS) {
      await browser.execute('mobile: sendBiometricMatch', { type: 'touchId', match: success });
    } else {
      // Android fingerprint simulation
      await browser.execute('mobile: fingerPrint', { fingerprintId: success ? 1 : 0 });
    }
  }

  /**
   * Put the app to background for a duration (seconds), then bring it back.
   */
  protected async backgroundApp(seconds: number = 3) {
    await browser.execute('mobile: backgroundApp', { seconds });
  }

  /**
   * Terminate and re-launch the app (cold start).
   */
  protected async restartApp(bundleId: string) {
    await browser.execute('mobile: terminateApp', { bundleId });
    await browser.execute('mobile: activateApp', { bundleId });
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'pages', 'BasePage.ts'), content);
  }

  private scaffoldMobileGestures(projectRoot: string) {
    const content = `import { browser } from '@wdio/globals';

/**
 * Cross-platform W3C Gesture abstractions for Appium.
 * Use these in Page Objects for swipe, scroll, and long-press actions.
 */
export class MobileGestures {
  /**
   * Swipe up (scroll content down).
   */
  static async swipeUp(percentage: number = 0.8) {
    const { width, height } = await browser.getWindowSize();
    const startX = width / 2;
    const startY = height * percentage;
    const endY = height * (1 - percentage);

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        { type: 'pointerMove', duration: 500, x: startX, y: endY },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Swipe down (scroll content up).
   */
  static async swipeDown(percentage: number = 0.8) {
    const { width, height } = await browser.getWindowSize();
    const startX = width / 2;
    const startY = height * (1 - percentage);
    const endY = height * percentage;

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        { type: 'pointerMove', duration: 500, x: startX, y: endY },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Long press on an element for a given duration.
   */
  static async longPress(element: WebdriverIO.Element, durationMs: number = 1500) {
    const location = await element.getLocation();
    const size = await element.getSize();
    const x = Math.round(location.x + size.width / 2);
    const y = Math.round(location.y + size.height / 2);

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: durationMs },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Scroll until an element with the given text is visible (Android UiScrollable).
   */
  static async scrollToText(text: string) {
    await browser.execute('mobile: scroll', { strategy: 'accessibility id', selector: text });
  }

  /**
   * Handle a native alert by accepting or dismissing it.
   */
  static async handleAlert(accept: boolean = true) {
    if (accept) {
      await browser.acceptAlert();
    } else {
      await browser.dismissAlert();
    }
  }
}
`;
    fs.writeFileSync(path.join(projectRoot, 'utils', 'MobileGestures.ts'), content);
  }

  private scaffoldMockServer(projectRoot: string) {
    const content = `import express from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Local API Mock Server for Mobile Traffic Interception.
 * Start this alongside Appium tests to control backend responses.
 *
 * IMPORTANT: Android emulators cannot reach 'localhost' on the host machine.
 * Use MockServer.getBaseUrl('android') to get the correct address.
 */
export class MockServer {
  private app = express();
  private server: any;
  private scenarios: Map<string, any> = new Map();

  constructor(private port: number = 3000) {
    this.app.use(express.json());
  }

  /**
   * Returns the correct base URL for the mock server based on the platform.
   * Android emulators use 10.0.2.2 (mapped to host localhost).
   * iOS simulators and real devices use localhost directly.
   */
  static getBaseUrl(platform: 'android' | 'ios' = 'android', port: number = 3000): string {
    if (platform === 'android') {
      return \\\`http://10.0.2.2:\\\${port}\\\`;
    }
    return \\\`http://localhost:\\\${port}\\\`;
  }

  /**
   * Register a static route with a fixed response.
   */
  setupRoute(method: 'get' | 'post' | 'put' | 'delete', path: string, response: any, statusCode: number = 200) {
    this.app[method](path, (_req: any, res: any) => {
      res.status(statusCode).json(response);
    });
  }

  /**
   * Register a dynamic route that returns different responses based on the active scenario.
   */
  setupDynamicRoute(method: 'get' | 'post' | 'put' | 'delete', path: string, scenarioKey: string) {
    this.app[method](path, (_req: any, res: any) => {
      const scenario = this.scenarios.get(scenarioKey);
      if (scenario) {
        res.status(scenario.statusCode || 200).json(scenario.body);
      } else {
        res.status(404).json({ error: 'No active scenario for ' + scenarioKey });
      }
    });
  }

  /**
   * Activate a named scenario with a response body and status code.
   */
  setScenario(key: string, body: any, statusCode: number = 200) {
    this.scenarios.set(key, { body, statusCode });
  }

  /**
   * Load scenarios from a JSON file (e.g., test-data/mock-scenarios.json).
   * JSON format: { "scenarioKey": { "method": "get", "path": "/api/users", "response": {...}, "statusCode": 200 } }
   */
  loadScenariosFromFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
      console.warn(\\\`Mock scenarios file not found: \\\${filePath}\\\`);
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const scenarios = JSON.parse(raw);
    for (const [key, config] of Object.entries(scenarios) as any[]) {
      this.setScenario(key, config.response, config.statusCode || 200);
      if (config.method && config.path) {
        this.setupDynamicRoute(config.method, config.path, key);
      }
    }
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(\\\`Mock Server running on http://localhost:\\\${this.port}\\\`);
        console.log(\\\`  Android emulator URL: http://10.0.2.2:\\\${this.port}\\\`);
        resolve(true);
      });
    });
  }

  stop() {
    if (this.server) this.server.close();
    this.scenarios.clear();
  }
}
`;
    fs.writeFileSync(path.join(projectRoot, 'utils', 'MockServer.ts'), content);
  }

  private scaffoldHooks(projectRoot: string) {
    const content = `import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { browser } from '@wdio/globals';

/**
 * Cucumber Hooks — Lifecycle management for Appium sessions.
 */

BeforeAll(async function () {
  // Global setup — Appium session will be started by WebdriverIO config
  console.log('[Hooks] Test suite starting...');
});

Before(async function (scenario) {
  console.log(\`[Hooks] Starting scenario: \${scenario.pickle.name}\`);
});

After(async function (scenario) {
  // Capture screenshot on failure
  if (scenario.result?.status === Status.FAILED) {
    try {
      const screenshot = await browser.takeScreenshot();
      this.attach(screenshot, 'image/png');
      console.log('[Hooks] Screenshot captured for failed scenario');

      // Also log the page source for debugging
      const pageSource = await browser.getPageSource();
      this.attach(pageSource, 'text/xml');
      console.log('[Hooks] Page source captured for failed scenario');
    } catch (err) {
      console.error('[Hooks] Failed to capture screenshot:', err);
    }
  }
});

AfterAll(async function () {
  console.log('[Hooks] Test suite complete.');
});
`;
    this.writeIfNotExists(path.join(projectRoot, 'step-definitions', 'hooks.ts'), content);
  }

  private scaffoldSampleFeature(projectRoot: string) {
    const content = `@smoke
Feature: Sample Login Flow
  As a user
  I want to log into the application
  So that I can access my account

  @android @ios
  Scenario: Successful login with valid credentials
    Given the app is launched
    When I enter username "testuser" and password "pass123"
    And I tap the login button
    Then I should see the home screen
`;
    this.writeIfNotExists(path.join(projectRoot, 'features', 'sample.feature'), content);
  }

  private scaffoldGitignore(projectRoot: string) {
    const content = `node_modules/
dist/
reports/
*.log
.env
.DS_Store
`;
    this.writeIfNotExists(path.join(projectRoot, '.gitignore'), content);
  }

  private scaffoldMcpConfig(projectRoot: string, platform: string) {
    const config = {
      $schema: "./.appium-mcp/configSchema.json",
      version: "1.1.0",
      project: {
        language: "typescript",
        testFramework: "cucumber",
        client: "webdriverio-appium"
      },
      mobile: {
        defaultPlatform: platform,
        capabilitiesProfiles: {
          "pixel8": {
            "platformName": "Android",
            "appium:automationName": "UiAutomator2",
            "appium:deviceName": "Pixel_8"
          },
          "iphone14": {
            "platformName": "iOS",
            "appium:automationName": "XCUITest",
            "appium:deviceName": "iPhone 14"
          }
        }
      },
      paths: {
        featuresRoot: "features",
        pagesRoot: "pages",
        stepsRoot: "step-definitions",
        utilsRoot: "utils"
      },
      reuse: {
        locatorOrder: ["accessibility id", "resource-id", "xpath", "class chain", "predicate", "text"]
      }
    };
    fs.writeFileSync(path.join(projectRoot, 'mcp-config.json'), JSON.stringify(config, null, 2));
  }

  private scaffoldWdioConfig(projectRoot: string, platform: string) {
    const content = `import type { Options } from '@wdio/types';

/**
 * WebdriverIO + Appium Configuration
 * Generated by Appium MCP Server.
 * Adjust capabilities for your target device/emulator.
 */
export const config: Options.Testrunner = {
  runner: 'local',
  hostname: 'localhost',
  port: 4723,
  path: '/',

  specs: ['./features/**/*.feature'],

  maxInstances: 1,

  capabilities: [{
    platformName: '${platform === 'ios' ? 'iOS' : 'Android'}',
    'appium:automationName': '${platform === 'ios' ? 'XCUITest' : 'UiAutomator2'}',
    'appium:deviceName': '${platform === 'ios' ? 'iPhone 14' : 'Pixel_8'}',
    // 'appium:app': '/path/to/your/app.${platform === 'ios' ? 'app' : 'apk'}',
    'appium:newCommandTimeout': 240,
    'appium:noReset': false,
  }],

  framework: 'cucumber',
  cucumberOpts: {
    require: ['./step-definitions/**/*.ts'],
    backtrace: false,
    dryRun: false,
    failFast: false,
    snippets: true,
    source: true,
    strict: false,
    timeout: 60000,
  },

  reporters: ['spec'],

  services: ['appium'],
  appium: {
    args: ['--relaxed-security'],
  },

  logLevel: 'info',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.conf.ts'), content);
  }

  private scaffoldMockScenarios(projectRoot: string) {
    const content = JSON.stringify({
      "login-success": {
        method: "post",
        path: "/api/auth/login",
        statusCode: 200,
        body: {
          token: "mock-jwt-token-123",
          user: { id: 1, name: "Test User", role: "admin" }
        }
      },
      "login-failure": {
        method: "post",
        path: "/api/auth/login",
        statusCode: 401,
        body: { error: "Invalid credentials" }
      },
      "user-profile": {
        method: "get",
        path: "/api/user/profile",
        statusCode: 200,
        body: { id: 1, name: "Test User", email: "test@example.com" }
      }
    }, null, 2);
    this.writeIfNotExists(path.join(projectRoot, 'test-data', 'mock-scenarios.json'), content);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private writeIfNotExists(filePath: string, content: string) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  }
}
