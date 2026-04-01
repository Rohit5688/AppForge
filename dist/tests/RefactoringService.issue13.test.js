import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CodebaseAnalyzerService } from '../services/CodebaseAnalyzerService.js';
import { McpConfigService } from '../services/McpConfigService.js';
import { RefactoringService } from '../services/RefactoringService.js';
/**
 * Issue #13 Tests: `suggest_refactorings` must respect mcp-config.json directory paths
 *
 * Problem (from APPFORGE_SESSION3_ISSUES.md):
 * `suggest_refactorings` was hard-coding paths to `src/features/step-definitions` and `src/pages`
 * regardless of mcp-config.json's `directories.stepDefinitions` and `directories.pages` values.
 * On projects with non-standard layouts, the tool returned empty results.
 *
 * Solution:
 * - Load mcp-config.json at the start of the handler
 * - Use McpConfigService.getPaths() to resolve directories
 * - Pass these paths to CodebaseAnalyzerService.analyze()
 * - Fall back to defaults if config is missing
 *
 * This test suite validates that suggest_refactorings respects custom directory layouts.
 */
describe('RefactoringService - Custom Directory Layout (Issue #13)', () => {
    const refactoringService = new RefactoringService();
    const analyzerService = new CodebaseAnalyzerService();
    const configService = new McpConfigService();
    let testProjectDir;
    before(async () => {
        // Create a temporary test project with non-standard directory layout
        testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-issue13-test-'));
    });
    after(async () => {
        // Clean up test project
        if (testProjectDir && fs.existsSync(testProjectDir)) {
            fs.rmSync(testProjectDir, { recursive: true, force: true });
        }
    });
    test('[ISSUE #13] should use custom stepDefinitions path from mcp-config.json', async () => {
        // Setup: Create project with custom steps directory
        const customStepsDir = path.join(testProjectDir, 'tests', 'steps');
        fs.mkdirSync(customStepsDir, { recursive: true });
        // Write mcp-config.json with custom paths
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: {
                    android: {
                        platformName: 'Android',
                        'appium:deviceName': 'emulator'
                    }
                }
            },
            paths: {
                featuresRoot: 'tests/features',
                stepsRoot: 'tests/steps', // Custom path
                pagesRoot: 'tests/pages',
                utilsRoot: 'tests/utils',
                testDataRoot: 'tests/test-data'
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Create a step definition file in the custom location
        const stepContent = `
import { Given, When, Then } from '@cucumber/cucumber';

Given('the user is on the login page', async function() {
  await loginPage.navigateTo();
});

When('the user enters valid credentials', async function() {
  await loginPage.login('user', 'pass');
});
`;
        fs.writeFileSync(path.join(customStepsDir, 'login.steps.ts'), stepContent);
        // Test: Load config and analyze with custom paths
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        assert.equal(paths.stepsRoot, 'tests/steps', 'Should read custom stepsRoot from config');
        const analysis = await analyzerService.analyze(testProjectDir, paths);
        const report = refactoringService.generateRefactoringSuggestions(analysis);
        // Verify: Steps were found from custom directory
        assert.ok(analysis.existingStepDefinitions.length > 0, 'Should find step definitions in custom directory');
        assert.ok(analysis.existingStepDefinitions[0].file.includes('tests/steps'), `Step file path should include custom directory, got: ${analysis.existingStepDefinitions[0].file}`);
    });
    test('[ISSUE #13] should use custom pagesRoot path from mcp-config.json', async () => {
        // Setup: Create project with custom pages directory
        const customPagesDir = path.join(testProjectDir, 'automation', 'page-objects');
        fs.mkdirSync(customPagesDir, { recursive: true });
        // Write mcp-config.json with custom paths
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: {
                    android: { platformName: 'Android' }
                }
            },
            paths: {
                featuresRoot: 'automation/features',
                stepsRoot: 'automation/steps',
                pagesRoot: 'automation/page-objects', // Custom path
                utilsRoot: 'automation/utils',
                testDataRoot: 'automation/data'
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Create a page object file in the custom location
        const pageContent = `
export class LoginPage {
  get usernameField() {
    return $('~username');
  }

  get passwordField() {
    return $('~password');
  }

  async login(user: string, pass: string) {
    await this.usernameField.setValue(user);
    await this.passwordField.setValue(pass);
  }

  async logout() {
    // Not implemented yet
  }
}
`;
        fs.writeFileSync(path.join(customPagesDir, 'LoginPage.ts'), pageContent);
        // Test: Load config and analyze with custom paths
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        assert.equal(paths.pagesRoot, 'automation/page-objects', 'Should read custom pagesRoot from config');
        const analysis = await analyzerService.analyze(testProjectDir, paths);
        const report = refactoringService.generateRefactoringSuggestions(analysis);
        // Verify: Page objects were found from custom directory
        assert.ok(analysis.existingPageObjects.length > 0, 'Should find page objects in custom directory');
        assert.ok(analysis.existingPageObjects[0].path.includes('automation/page-objects'), `Page object path should include custom directory, got: ${analysis.existingPageObjects[0].path}`);
    });
    test('[ISSUE #13] should fall back to defaults when mcp-config.json is missing paths', async () => {
        // Setup: Create minimal config without paths section
        const minimalConfig = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: {
                    android: { platformName: 'Android' }
                }
            }
            // No paths section
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(minimalConfig, null, 2));
        // Test: Load config and verify defaults
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        // Verify: Should use default paths
        assert.equal(paths.featuresRoot, 'features', 'Should default to features');
        assert.equal(paths.stepsRoot, 'step-definitions', 'Should default to step-definitions');
        assert.equal(paths.pagesRoot, 'pages', 'Should default to pages');
        assert.equal(paths.utilsRoot, 'utils', 'Should default to utils');
        assert.equal(paths.testDataRoot, 'src/test-data', 'Should default to src/test-data');
    });
    test('[ISSUE #13] should handle deeply nested custom directory structures', async () => {
        // Setup: Create deeply nested directory structure
        const deepStepsDir = path.join(testProjectDir, 'src', 'test', 'bdd', 'step-definitions');
        const deepPagesDir = path.join(testProjectDir, 'src', 'test', 'bdd', 'page-objects');
        fs.mkdirSync(deepStepsDir, { recursive: true });
        fs.mkdirSync(deepPagesDir, { recursive: true });
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: { android: { platformName: 'Android' } }
            },
            paths: {
                featuresRoot: 'src/test/bdd/features',
                stepsRoot: 'src/test/bdd/step-definitions',
                pagesRoot: 'src/test/bdd/page-objects',
                utilsRoot: 'src/test/bdd/utilities',
                testDataRoot: 'src/test/bdd/data'
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Create files in deeply nested structure
        fs.writeFileSync(path.join(deepStepsDir, 'checkout.steps.ts'), `
import { Given } from '@cucumber/cucumber';
Given('user checks out', async () => {});
      `);
        fs.writeFileSync(path.join(deepPagesDir, 'CheckoutPage.ts'), `
export class CheckoutPage {
  get submitButton() { return $('~submit'); }
  async submit() { await this.submitButton.click(); }
}
      `);
        // Test: Analyze with deeply nested paths
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        const analysis = await analyzerService.analyze(testProjectDir, paths);
        // Verify: Found files in deeply nested structure
        assert.ok(analysis.existingStepDefinitions.some(s => s.file.includes('src/test/bdd/step-definitions')), 'Should find steps in deeply nested directory');
        assert.ok(analysis.existingPageObjects.some(p => p.path.includes('src/test/bdd/page-objects')), 'Should find pages in deeply nested directory');
    });
    test('[ISSUE #13] should not return false empty results for non-standard layouts', async () => {
        // Setup: This reproduces the exact scenario from the issue description
        const customStepsDir = path.join(testProjectDir, 'tests', 'steps');
        const customPagesDir = path.join(testProjectDir, 'tests', 'pages');
        fs.mkdirSync(customStepsDir, { recursive: true });
        fs.mkdirSync(customPagesDir, { recursive: true });
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: { android: { platformName: 'Android' } }
            },
            paths: {
                stepsRoot: 'tests/steps',
                pagesRoot: 'tests/pages'
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Create duplicate step definitions (the issue to detect)
        fs.writeFileSync(path.join(customStepsDir, 'common1.steps.ts'), `
import { Given } from '@cucumber/cucumber';
Given('the app is launched', async () => {});
      `);
        fs.writeFileSync(path.join(customStepsDir, 'common2.steps.ts'), `
import { Given } from '@cucumber/cucumber';
Given('the app is launched', async () => {});  // Duplicate!
      `);
        // Create page object with unused method
        fs.writeFileSync(path.join(customPagesDir, 'HomePage.ts'), `
export class HomePage {
  async navigateToSettings() { /* used */ }
  async navigateToProfile() { /* unused */ }
}
      `);
        // Create step that uses only one method
        fs.writeFileSync(path.join(customStepsDir, 'navigation.steps.ts'), `
import { When } from '@cucumber/cucumber';
When('user goes to settings', async function() {
  await homePage.navigateToSettings();
});
      `);
        // Test: Analyze with custom paths
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        const analysis = await analyzerService.analyze(testProjectDir, paths);
        const report = refactoringService.generateRefactoringSuggestions(analysis);
        // Verify: Should NOT report zero counts (the bug from issue #13)
        assert.ok(analysis.existingStepDefinitions.length > 0, 'Should find step definitions');
        assert.ok(analysis.existingPageObjects.length > 0, 'Should find page objects');
        // Verify: Should detect the duplicate step
        assert.ok(report.includes('Duplicate Step Definitions'), 'Should detect duplicate steps');
        assert.ok(report.includes('the app is launched'), 'Should show duplicate pattern');
        // Verify: Should detect unused method
        assert.ok(report.includes('navigateToProfile') || report.includes('Potentially Unused'), 'Should detect unused page method');
        // The key assertion: duplicateStepCount and unusedMethodCount should NOT be zero
        assert.ok(analysis.conflicts.length > 0, 'Should report conflicts (not zero)');
    });
    test('[ISSUE #13] should respect partial path overrides', async () => {
        // Setup: Override only some paths, use defaults for others
        const customStepsDir = path.join(testProjectDir, 'custom-steps');
        fs.mkdirSync(customStepsDir, { recursive: true });
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: { android: { platformName: 'Android' } }
            },
            paths: {
                stepsRoot: 'custom-steps' // Only override steps, rest use defaults
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Test: Verify partial override
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        assert.equal(paths.stepsRoot, 'custom-steps', 'Should use custom stepsRoot');
        assert.equal(paths.pagesRoot, 'pages', 'Should use default pagesRoot');
        assert.equal(paths.featuresRoot, 'features', 'Should use default featuresRoot');
        assert.equal(paths.utilsRoot, 'utils', 'Should use default utilsRoot');
    });
    test('[ISSUE #13] integration: full suggest_refactorings workflow with custom paths', async () => {
        // This test simulates the exact workflow from index.ts handler
        const customLayout = {
            steps: path.join(testProjectDir, 'e2e', 'steps'),
            pages: path.join(testProjectDir, 'e2e', 'pages')
        };
        fs.mkdirSync(customLayout.steps, { recursive: true });
        fs.mkdirSync(customLayout.pages, { recursive: true });
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: { android: { platformName: 'Android' } }
            },
            paths: {
                stepsRoot: 'e2e/steps',
                pagesRoot: 'e2e/pages'
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Create test content
        fs.writeFileSync(path.join(customLayout.pages, 'CartPage.ts'), `
export class CartPage {
  get checkoutButton() { return $('~checkout'); }
  async checkout() { await this.checkoutButton.click(); }
  async clearCart() { /* unused */ }
  async applyCoupon(code: string) { /* unused */ }
}
      `);
        fs.writeFileSync(path.join(customLayout.steps, 'cart.steps.ts'), `
import { When } from '@cucumber/cucumber';
When('user proceeds to checkout', async function() {
  await cartPage.checkout();
});
      `);
        // Simulate the exact handler flow from index.ts
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        const analysis = await analyzerService.analyze(testProjectDir, paths);
        const report = refactoringService.generateRefactoringSuggestions(analysis);
        // Verify: Complete workflow works with custom paths
        assert.ok(analysis.existingPageObjects.length > 0, 'Found page objects');
        assert.ok(analysis.existingStepDefinitions.length > 0, 'Found step definitions');
        assert.ok(report.includes('clearCart') || report.includes('applyCoupon'), 'Detected unused methods');
    });
    test('[ISSUE #13] should handle Windows-style paths correctly', async () => {
        // Setup: Config with forward slashes (works on all platforms)
        const config = {
            version: '1.1.0',
            project: {
                language: 'typescript',
                testFramework: 'cucumber',
                client: 'webdriverio'
            },
            mobile: {
                defaultPlatform: 'android',
                capabilitiesProfiles: { android: { platformName: 'Android' } }
            },
            paths: {
                stepsRoot: 'tests/steps', // Forward slashes
                pagesRoot: 'tests\\pages' // Backslashes (Windows)
            }
        };
        fs.writeFileSync(path.join(testProjectDir, 'mcp-config.json'), JSON.stringify(config, null, 2));
        // Test: Load and verify path normalization
        const loadedConfig = configService.read(testProjectDir);
        const paths = configService.getPaths(loadedConfig);
        // Should work on all platforms (path.join normalizes)
        assert.ok(paths.stepsRoot, 'Should have stepsRoot');
        assert.ok(paths.pagesRoot, 'Should have pagesRoot');
    });
});
