import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { TestGenerationService } from '../services/TestGenerationService.js';
import type { McpConfig } from '../services/McpConfigService.js';
import type { CodebaseAnalysisResult } from '../services/CodebaseAnalyzerService.js';

describe('TestGenerationService — Issue #11 Fix Validation', () => {
  const service = new TestGenerationService();

  const mockConfig: McpConfig = {
    mobile: {
      defaultPlatform: 'android',
      capabilitiesProfiles: {}
    },
    paths: {
      featuresRoot: 'features',
      pagesRoot: 'pages',
      stepsRoot: 'step-definitions',
      utilsRoot: 'utils'
    },
    project: {
      language: 'typescript',
      testFramework: 'cucumber',
      client: 'webdriverio'
    }
  };

  const mockAnalysis: CodebaseAnalysisResult = {
    existingFeatures: [],
    existingStepDefinitions: [],
    existingPageObjects: [],
    existingUtils: [],
    conflicts: [],
    architecturePattern: 'pom',
    yamlLocatorFiles: [],
    detectedPaths: {
      featuresRoot: 'features',
      stepsRoot: 'step-definitions',
      pagesRoot: 'pages',
      utilsRoot: 'utils',
      locatorsRoot: 'locators'
    }
  };

  test('should generate a valid prompt string', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.strictEqual(typeof prompt, 'string');
    assert.ok(prompt.length > 0);
  });

  test('[ISSUE #11] prompt header should identify framework as Appium + WebdriverIO + @cucumber/cucumber', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      prompt.includes('Appium + WebdriverIO + @cucumber/cucumber'),
      'Expected prompt to contain "Appium + WebdriverIO + @cucumber/cucumber"'
    );
  });

  test('[ISSUE #11] prompt must NOT contain the word "Playwright"', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      !prompt.includes('Playwright'),
      'FAILURE: Prompt contains "Playwright" — this violates Issue #11 fix. AppForge is Appium/WebdriverIO, not Playwright.'
    );
  });

  test('[ISSUE #11] prompt must include explicit constraint against Playwright imports', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      prompt.includes('CRITICAL CONSTRAINT'),
      'Expected critical constraint warning'
    );
    assert.ok(
      prompt.includes('ONLY WebdriverIO'),
      'Expected emphasis on WebdriverIO-only usage'
    );
    assert.ok(
      prompt.includes('driver.$()'),
      'Expected mention of WebdriverIO selector syntax'
    );
    assert.ok(
      prompt.includes('Appium'),
      'Expected mention of Appium locator strategies'
    );
    assert.ok(
      prompt.includes('Do NOT import web testing libraries'),
      'Expected warning against other testing frameworks'
    );
  });

  test('[ISSUE #11] prompt must emphasize WebdriverIO and Appium usage', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(prompt.includes('WebdriverIO'), 'Expected WebdriverIO mention');
    assert.ok(prompt.includes('driver.$()'), 'Expected driver.$() pattern');
    assert.ok(prompt.includes('Appium'), 'Expected Appium mention');
  });

  test('[ISSUE #11] prompt must include critical constraint warning with emphasis marker', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      prompt.includes('⚠️ **CRITICAL CONSTRAINT**'),
      'Expected critical constraint warning with ⚠️ emoji'
    );
  });

  test('should handle optional parameters (testName, screenXml, screenshotBase64)', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis,
      'LoginTest',
      undefined,
      '<xml>test</xml>',
      'base64data'
    );

    assert.ok(prompt.includes('LoginTest'), 'Expected test name');
    assert.ok(prompt.includes('[XML] LIVE UI HIERARCHY'), 'Expected XML section');
    assert.ok(prompt.includes('[IMAGE] SCREENSHOT'), 'Expected screenshot section');
  });

  test('should include existing code reuse sections', async () => {
    const analysisWithCode: CodebaseAnalysisResult = {
      ...mockAnalysis,
      existingStepDefinitions: [
        {
          file: 'login.steps.ts',
          steps: [
            { type: 'Given', pattern: 'I open the login screen' },
            { type: 'When', pattern: 'I enter username {string}' }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['enterUsername', 'enterPassword', 'tapLogin'],
          locators: []
        }
      ]
    };

    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'Test a feature',
      mockConfig,
      analysisWithCode
    );

    assert.ok(prompt.includes('Existing Step Definitions'));
    assert.ok(prompt.includes('Existing Page Objects'));
    assert.ok(prompt.includes('login.steps.ts'));
    assert.ok(prompt.includes('LoginPage.ts'));
  });

  test('should include learning prompt if provided', async () => {
    const learningPrompt = 'Always use accessibility-id selectors for buttons.';

    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in',
      mockConfig,
      mockAnalysis,
      undefined,
      learningPrompt
    );

    assert.ok(prompt.includes(learningPrompt));
  });

  test('should specify correct JSON output format with jsonPageObjects', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in',
      mockConfig,
      mockAnalysis
    );

    assert.ok(prompt.includes('"jsonPageObjects"'));
    assert.ok(prompt.includes('"reusePlan"'));
    assert.ok(prompt.includes('"filesToCreate"'));
  });
});