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
    const dirs = ['src/features', 'src/step-definitions', 'src/pages', 'src/utils', 'src/test-data', 'src/config', 'reports'];
    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    // 2. package.json
    this.scaffoldPackageJson(projectRoot, appName, platform);

    // 3. tsconfig.json
    this.scaffoldTsConfig(projectRoot);

    // 4. cucumber.js config
    this.scaffoldCucumberConfig(projectRoot);

    // 5. BasePage.ts
    this.scaffoldBasePage(projectRoot);

    // 6. Utils Layer
    this.scaffoldAppiumDriver(projectRoot);
    this.scaffoldActionUtils(projectRoot);
    this.scaffoldGestureUtils(projectRoot);
    this.scaffoldWaitUtils(projectRoot);
    this.scaffoldAssertionUtils(projectRoot);
    this.scaffoldTestContext(projectRoot);
    this.scaffoldDataUtils(projectRoot);
    this.scaffoldLocatorUtils(projectRoot);
    // Keep old for back compat
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
    if (platform === 'both') {
      this.scaffoldWdioSharedConfig(projectRoot);
      this.scaffoldWdioAndroidConfig(projectRoot);
      this.scaffoldWdioIosConfig(projectRoot);
    } else {
      this.scaffoldWdioConfig(projectRoot, platform);
    }

    // 13. Mock scenarios sample JSON
    this.scaffoldMockScenarios(projectRoot);

    const summary = [
      `✅ Scaffolded Appium BDD project at ${projectRoot}`,
      '',
      'Generated files:',
      '  📦 package.json',
      '  ⚙️  tsconfig.json',
      '  🥒 cucumber.js',
      ...(platform === 'both' ? [
        '  🔧 wdio.shared.conf.ts',
        '  🔧 wdio.android.conf.ts',
        '  🔧 wdio.ios.conf.ts'
      ] : [
        '  🔧 wdio.conf.ts'
      ]),
      '  📄 mcp-config.json',
      '  🏗️  src/pages/BasePage.ts',
      '  🎬 src/utils/ActionUtils.ts',
      '  🤸 src/utils/MobileGestures.ts',
      '  ⏳ src/utils/WaitUtils.ts',
      '  🔌 src/utils/MockServer.ts',
      '  🏷️  src/utils/LocatorUtils.ts',
      '  📁 src/locators/login.yaml',
      '  🪝 src/step-definitions/hooks.ts',
      '  📝 src/features/sample.feature',
      '  📊 src/test-data/mock-scenarios.json',
      '  🚫 .gitignore',
      '',
      'Next steps:',
      '  1. cd ' + projectRoot,
      '  2. npm install',
      '  3. Start Appium server (separate terminal): npx appium',
      '  4. Use check_environment to verify Appium setup',
      '  5. Update wdio.conf.ts with device name and app path',
      '  6. Use start_appium_session to verify live connection',
      '  7. Use generate_cucumber_pom to create tests',
      '  8. Use validate_and_write to save, then run_cucumber_test'
    ].join('\n');

    return summary;
  }

  // ─── Scaffolders ───────────────────────────────────────────────

  private scaffoldPackageJson(projectRoot: string, appName: string, platform: string) {
    const scripts: Record<string, string> = {};
    if (platform === 'both') {
      scripts["test"]             = "npx wdio run wdio.shared.conf.ts";
      scripts["test:android"]     = "npx wdio run wdio.android.conf.ts";
      scripts["test:ios"]         = "npx wdio run wdio.ios.conf.ts";
      scripts["test:smoke"]       = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tagExpression='@smoke'";
      scripts["test:regression"]  = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tagExpression='@regression'";
      scripts["test:e2e"]         = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tagExpression='@e2e'";
      scripts["test:smoke:android"] = "npx wdio run wdio.android.conf.ts --cucumberOpts.tagExpression='@smoke'";
      scripts["test:smoke:ios"]   = "npx wdio run wdio.ios.conf.ts --cucumberOpts.tagExpression='@smoke'";
    } else {
      scripts["test"]             = "npx wdio run wdio.conf.ts";
      scripts["test:smoke"]       = "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@smoke'";
      scripts["test:regression"]  = "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@regression'";
      scripts["test:e2e"]         = "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@e2e'";
      if (platform === 'android') scripts["test:android"] = "npx wdio run wdio.conf.ts";
      if (platform === 'ios')     scripts["test:ios"] = "npx wdio run wdio.conf.ts";
    }

    const pkg = {
      name: appName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      type: 'module',
      scripts,
      dependencies: {
        // WebdriverIO core + Appium framework
        "@wdio/cli":                 "8.29.1",
        "@wdio/local-runner":        "8.29.1",
        "@wdio/cucumber-framework":  "8.29.1",
        "@wdio/appium-service":      "8.29.1",
        "@wdio/spec-reporter":       "8.29.1",
        "@wdio/allure-reporter":     "8.29.1",
        "webdriverio":               "8.29.1",
        // Appium server (local usage)
        "appium":                    "2.5.1",
        // Appium drivers — install both for cross-platform support
        "@appium/uiautomator2-driver": "^3.7.0",
        "@appium/xcuitest-driver":   "^7.22.0",
        // Cucumber runner
        "@cucumber/cucumber":        "10.3.2",
        "@cucumber/pretty-formatter": "1.0.1",
        // TypeScript runtime
        "ts-node":                   "10.9.2",
        "typescript":                "5.4.5",
        // Utilities
        "express":                   "^4.18.0",
        "yaml":                      "^2.4.1",
        "allure-cucumberjs":         "^3.0.0"
      },
      devDependencies: {
        "@types/node":               "^20.0.0",
        "@types/express":            "^4.17.0"
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
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true
      },
      "ts-node": {
        esm: true,
        experimentalSpecifierResolution: "node"
      },
      include: ["src/**/*.ts", "wdio.conf.ts", "wdio.shared.conf.ts", "wdio.android.conf.ts", "wdio.ios.conf.ts"],
      exclude: ["node_modules", "dist", "reports"]
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  }

  private scaffoldCucumberConfig(projectRoot: string) {
    const content = `// cucumber.js — Cucumber configuration
export default {
  requireModule: ['ts-node/esm'],
  require: ['src/step-definitions/**/*.ts'],
  format: [
    'progress-bar',
    'json:reports/cucumber-report.json',
    'html:reports/cucumber-report.html'
  ],
  paths: ['src/features/**/*.feature'],
  publishQuiet: true
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'cucumber.js'), content);
  }

  private scaffoldBasePage(projectRoot: string) {
    const content = `import { AppiumDriver } from '../utils/AppiumDriver.js';
import { GestureUtils } from '../utils/GestureUtils.js';
import { WaitUtils } from '../utils/WaitUtils.js';
import { AssertionUtils } from '../utils/AssertionUtils.js';

export abstract class BasePage {
  protected driver = AppiumDriver;
  protected wait = WaitUtils;
  protected gesture = GestureUtils;
  protected assert = AssertionUtils;

  // Every page must implement this
  abstract isLoaded(): Promise<boolean>;

  async waitForLoaded(timeout = 15000): Promise<void> {
    await WaitUtils.waitForCondition(() => this.isLoaded(), timeout);
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'pages', 'BasePage.ts'), content);
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
    fs.writeFileSync(path.join(projectRoot, 'src', 'utils', 'MobileGestures.ts'), content);
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
      return \`http://10.0.2.2:\${port}\`;
    }
    return \`http://localhost:\${port}\`;
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
      console.warn(\`Mock scenarios file not found: \${filePath}\`);
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
        console.log(\`Mock Server running on http://localhost:\${this.port}\`);
        console.log(\`  Android emulator URL: http://10.0.2.2:\${this.port}\`);
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
    fs.writeFileSync(path.join(projectRoot, 'src', 'utils', 'MockServer.ts'), content);
  }

  private scaffoldLocatorUtils(projectRoot: string) {
    const tsPath = path.join(projectRoot, 'src/utils/LocatorUtils.ts');
    this.writeIfNotExists(tsPath, [
      'import fs from "fs";',
      'import path from "path";',
      'import yaml from "yaml";',
      'import { browser } from "@wdio/globals";',
      '',
      'export class LocatorUtils {',
      '  /**',
      '   * Reads a YAML locator file and returns the appropriate selector for the current platform.',
      '   * Platform is resolved synchronously from driver capabilities at runtime.',
      '   */',
      '  public static getLocator(yamlFileName: string, locatorKey: string): string {',
      '    // Read platform synchronously from WebdriverIO capabilities (set after session starts)',
      '    const caps = browser.capabilities as Record<string, any>;',
      '    const platformName = (caps?.platformName ?? \'\').toLowerCase();',
      '    const platform = platformName === \'ios\' ? \'ios\' : \'android\';',
      '',
      '    const filePath = path.resolve(process.cwd(), "src/locators", `${yamlFileName}.yaml`);',
      '    if (!fs.existsSync(filePath)) {',
      '      throw new Error(`Locator file not found: ${filePath}`);',
      '    }',
      '',
      '    const fileContent = fs.readFileSync(filePath, "utf8");',
      '    const locators = yaml.parse(fileContent);',
      '',
      '    if (!locators[locatorKey]) {',
      '      throw new Error(`Locator key "${locatorKey}" not found in ${filePath}`);',
      '    }',
      '',
      '    const selector = locators[locatorKey][platform];',
      '    if (!selector) {',
      '      throw new Error(`No selector defined for platform "${platform}" on key "${locatorKey}" in ${filePath}`);',
      '    }',
      '',
      '    return selector;',
      '  }',
      '}'
    ].join('\n'));

    const locatorsDir = path.join(projectRoot, 'src/locators');
    if (!fs.existsSync(locatorsDir)) {
      fs.mkdirSync(locatorsDir, { recursive: true });
    }

    const yamlPath = path.join(locatorsDir, 'login.yaml');
    this.writeIfNotExists(yamlPath, [
      'submit_button:',
      '  android: id=com.example:id/submit',
      '  ios: ~submitButton',
      '',
      'username_input:',
      '  android: id=com.example:id/username',
      '  ios: ~usernameInput'
    ].join('\n'));
  }

  private scaffoldHooks(projectRoot: string) {
    const content = `import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { AppiumDriver } from '../utils/AppiumDriver.js';
import { TestContext } from '../utils/TestContext.js';

/**
 * Cucumber Hooks — Lifecycle management for Appium sessions.
 */

BeforeAll(async function () {
  console.log('[Hooks] Test suite starting...');
});

Before(async function (scenario) {
  console.log(\`[Hooks] Starting scenario: \${scenario.pickle.name}\`);
});

After(async function (scenario) {
  if (scenario.result?.status === Status.FAILED) {
    try {
      const screenshot = await AppiumDriver.takeScreenshot();
      if (screenshot) {
        TestContext.addAttachment('screenshot', Buffer.from(screenshot, 'base64'), 'image/png');
        this.attach(Buffer.from(screenshot, 'base64'), 'image/png');
      }
      const pageSource = await AppiumDriver.getPageSource();
      if (pageSource) {
        TestContext.addAttachment('page-source', pageSource, 'text/xml');
        this.attach(pageSource, 'text/xml');
      }
      console.log('[Hooks] Captured screenshot and page source for failed scenario');
    } catch (err) {
      console.error('[Hooks] Failed to capture artifacts:', err);
    }
  }
  TestContext.clear();
});

AfterAll(async function () {
  console.log('[Hooks] Test suite complete.');
});
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'step-definitions', 'hooks.ts'), content);
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'features', 'sample.feature'), content);
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

  logLevel: 'info',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.conf.ts'), content);
  }

  private scaffoldWdioSharedConfig(projectRoot: string) {
    const content = `import type { Options } from '@wdio/types';

/**
 * Shared WebdriverIO Configuration
 * Adjust common settings here. Platform specifics belong in wdio.android.conf.ts / wdio.ios.conf.ts
 */
export const config: Options.Testrunner = {
  runner: 'local',
  hostname: 'localhost',
  port: 4723,
  path: '/',

  specs: ['./features/**/*.feature'],
  maxInstances: 1,

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

  logLevel: 'info',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.shared.conf.ts'), content);
  }

  private scaffoldWdioAndroidConfig(projectRoot: string) {
    const content = `import { config as sharedConfig } from './wdio.shared.conf.ts';

export const config = {
  ...sharedConfig,
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Pixel_8',
    // 'appium:app': '/path/to/your/app.apk',
    'appium:newCommandTimeout': 240,
    'appium:noReset': false,
  }]
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.android.conf.ts'), content);
  }

  private scaffoldWdioIosConfig(projectRoot: string) {
    const content = `import { config as sharedConfig } from './wdio.shared.conf.ts';

export const config = {
  ...sharedConfig,
  capabilities: [{
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone 14',
    // 'appium:app': '/path/to/your/app.app',
    'appium:newCommandTimeout': 240,
    'appium:noReset': false,
  }]
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.ios.conf.ts'), content);
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'test-data', 'mock-scenarios.json'), content);
  }

  private scaffoldAppiumDriver(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

export class AppiumDriver {
  static async find(selector: string) { return await $(selector); }

  /** Synchronous platform check — valid after session has started. */
  static isAndroid(): boolean {
    return ((browser.capabilities as any)?.platformName ?? '').toLowerCase() === 'android';
  }
  static isIOS(): boolean {
    return ((browser.capabilities as any)?.platformName ?? '').toLowerCase() === 'ios';
  }

  /** Async versions — prefer synchronous isAndroid()/isIOS() inside Page Object methods. */
  static async getPageSource() { return await browser.getPageSource(); }
  static async takeScreenshot(filePath?: string) {
    const base64 = await browser.takeScreenshot();
    if (filePath) require('fs').writeFileSync(filePath, base64, 'base64');
    return base64;
  }
  static async openDeepLink(url: string) {
    await browser.url(url);
  }
  static async handlePermissionDialog(accept: boolean) {
    if (accept) await browser.acceptAlert().catch(() => {});
    else await browser.dismissAlert().catch(() => {});
  }
  static async switchToWebView() {
    const handles = await browser.getContexts();
    const webview = handles.find((h: string) => h.startsWith('WEBVIEW'));
    if (webview) await browser.switchContext(webview);
  }
  static async switchToNativeContext() {
    await browser.switchContext('NATIVE_APP');
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'AppiumDriver.ts'), content);
  }

  private scaffoldActionUtils(projectRoot: string) {
    const content = `import { $, $$ } from '@wdio/globals';

/**
 * ActionUtils — Core element interaction helpers for Appium mobile tests.
 *
 * Use these in Page Object methods instead of calling WebdriverIO APIs directly.
 * This provides a single place to add retry logic, logging, or platform-specific
 * workarounds without touching every Page Object.
 */
export class ActionUtils {
  /**
   * Tap an element by selector.
   * Waits for the element to be displayed before tapping.
   */
  static async tap(selector: string, timeout = 10000) {
    const el = await $(selector);
    await el.waitForDisplayed({ timeout });
    await el.click();
  }

  /**
   * Double-tap an element by selector.
   */
  static async doubleTap(selector: string) {
    const el = await $(selector);
    await el.waitForDisplayed();
    await el.doubleClick();
  }

  /**
   * Type text into a field by selector.
   * Waits for the element, clears existing value, then types.
   */
  static async type(selector: string, text: string, timeout = 10000) {
    const el = await $(selector);
    await el.waitForDisplayed({ timeout });
    await el.clearValue();
    await el.setValue(text);
  }

  /**
   * Clear the value of an input field by selector.
   */
  static async clear(selector: string) {
    const el = await $(selector);
    await el.waitForDisplayed();
    await el.clearValue();
  }

  /**
   * Clear an input field and type new text (convenience wrapper for type).
   */
  static async clearAndType(selector: string, text: string) {
    await ActionUtils.type(selector, text);
  }

  /**
   * Tap the first element that contains the given visible text.
   * Uses cross-platform accessibility text matching.
   */
  static async tapByText(text: string) {
    // Try accessibility id first, then XPath as fallback
    const byA11y = await \`~\${text}\`;
    const els = await $$(\`*[\${byA11y}]\`);
    if (els.length > 0) {
      await els[0].click();
      return;
    }
    const byXpath = await \`//*[@text='\${text}' or @label='\${text}' or @name='\${text}']\`;
    const el = await $(byXpath);
    await el.waitForDisplayed();
    await el.click();
  }

  /**
   * Tap the Nth element matching a selector (0-indexed).
   * Useful for lists where multiple elements share the same selector.
   */
  static async tapByIndex(selector: string, index: number) {
    const els = await $$(selector);
    if (index >= els.length) {
      throw new Error(\`tapByIndex: only \${els.length} elements found for "\${selector}", index \${index} out of range\`);
    }
    await els[index].waitForDisplayed();
    await els[index].click();
  }

  /**
   * Get the visible text of an element.
   */
  static async getText(selector: string): Promise<string> {
    const el = await $(selector);
    await el.waitForDisplayed();
    return el.getText();
  }

  /**
   * Get the value attribute of an input element.
   */
  static async getValue(selector: string): Promise<string> {
    const el = await $(selector);
    return el.getValue();
  }

  /**
   * Check if an element is currently displayed on screen.
   */
  static async isDisplayed(selector: string): Promise<boolean> {
    try {
      const el = await $(selector);
      return el.isDisplayed();
    } catch {
      return false;
    }
  }

  /**
   * Check if an element is enabled (not greyed out).
   */
  static async isEnabled(selector: string): Promise<boolean> {
    const el = await $(selector);
    return el.isEnabled();
  }

  /**
   * Dismiss the software keyboard.
   */
  static async hideKeyboard() {
    try {
      await (global as any).driver.hideKeyboard();
    } catch {
      // Keyboard may not be visible — ignore
    }
  }

  /**
   * Tap the device Back button (Android only).
   */
  static async tapBack() {
    await (global as any).driver.back();
  }

  /**
   * Tap an element and wait for a different element to appear.
   * Used for transitions where the result element confirms the navigation succeeded.
   */
  static async tapAndWait(tapSelector: string, waitForSelector: string, timeout = 10000) {
    await ActionUtils.tap(tapSelector);
    const target = await $(waitForSelector);
    await target.waitForDisplayed({ timeout });
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'ActionUtils.ts'), content);
  }

  private scaffoldGestureUtils(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

export class GestureUtils {
  static async scrollDown() {
    await browser.execute('mobile: scroll', { direction: 'down' });
  }
  static async swipeLeft(selector?: string) {
    await browser.execute('mobile: swipe', { direction: 'left', element: selector ? (await $(selector)).elementId : undefined });
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'GestureUtils.ts'), content);
  }

  private scaffoldWaitUtils(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

export class WaitUtils {
  static async waitForDisplayed(selector: string, timeout = 10000) {
    await (await $(selector)).waitForDisplayed({ timeout });
  }
  static async waitForCondition(fn: () => Promise<boolean>, timeout = 15000, pollInterval = 500) {
    await browser.waitUntil(fn, { timeout, interval: pollInterval });
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'WaitUtils.ts'), content);
  }

  private scaffoldAssertionUtils(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

export class AssertionUtils {
  static async assertDisplayed(selector: string, message?: string) {
    const isDisplayed = await (await $(selector)).isDisplayed();
    if (!isDisplayed) throw new Error(message || \`Element \${selector} is not displayed.\`);
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'AssertionUtils.ts'), content);
  }

  private scaffoldTestContext(projectRoot: string) {
    const content = `export class TestContext {
  private static state: Map<string, any> = new Map();
  private static attachments: any[] = [];

  static set<T>(key: string, value: T) { this.state.set(key, value); }
  static get<T>(key: string): T | undefined { return this.state.get(key) as T; }
  static require<T>(key: string): T {
    if (!this.state.has(key)) throw new Error(\`Missing context key: \${key}\`);
    return this.state.get(key) as T;
  }
  static clear() { this.state.clear(); this.attachments = []; }
  static addAttachment(name: string, data: any, mimeType: string) {
    this.attachments.push({ name, data, mimeType });
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'TestContext.ts'), content);
  }

  private scaffoldDataUtils(projectRoot: string) {
    const content = `export class DataUtils {
  static getEnv(key: string, fallback?: string) { return process.env[key] || fallback; }
  static requireEnv(key: string) {
    if (!process.env[key]) throw new Error(\`Missing required env variable: \${key}\`);
    return process.env[key] as string;
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'DataUtils.ts'), content);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private writeIfNotExists(filePath: string, content: string) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  }
}
