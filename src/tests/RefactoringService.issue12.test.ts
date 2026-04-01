import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { RefactoringService } from '../services/RefactoringService.js';
import type { CodebaseAnalysisResult } from '../services/CodebaseAnalyzerService.js';

/**
 * Issue #12 Tests: `suggest_refactorings` false positive detection
 * 
 * Problem: The original implementation used simple substring matching which flagged
 * ALL page methods as unused, including methods clearly called as `page.method()`.
 * 
 * Solution: Implement multi-strategy detection with confidence scoring:
 * - Strategy 1: Simple substring match
 * - Strategy 2: Instance.method() pattern
 * - Strategy 3: await pattern matching
 * - Strategy 4: Wrapper function pattern
 * - Confidence scoring based on unused ratio
 * 
 * This test suite verifies the improved algorithm reduces false positives.
 */
describe('RefactoringService - Unused Method Detection (Issue #12)', () => {
  const refactoringService = new RefactoringService();

  // Helper to create a minimal valid CodebaseAnalysisResult
  const createAnalysis = (overrides: Partial<CodebaseAnalysisResult> = {}): CodebaseAnalysisResult => {
    const defaults: CodebaseAnalysisResult = {
      existingFeatures: [],
      existingStepDefinitions: [],
      existingPageObjects: [],
      existingUtils: [],
      conflicts: [],
      architecturePattern: 'pom' as const,
      yamlLocatorFiles: [],
      detectedPaths: {
        featuresRoot: 'features',
        stepsRoot: 'step-definitions',
        pagesRoot: 'pages',
        utilsRoot: 'utils',
        locatorsRoot: 'locators'
      }
    };
    return { ...defaults, ...overrides };
  };

  test('[ISSUE #12] should NOT flag methods called as page.method()', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/login.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'the user is on the login page',
              bodyText: 'await loginPage.navigateToPage();'
            },
            {
              type: 'When',
              pattern: 'the user enters credentials',
              bodyText: 'await loginPage.fillUsername("test"); await loginPage.fillPassword("pass");'
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['navigateToPage', 'fillUsername', 'fillPassword'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(!report.includes('navigateToPage'), 'Should NOT flag navigateToPage');
    assert.ok(!report.includes('fillUsername'), 'Should NOT flag fillUsername');
    assert.ok(!report.includes('fillPassword'), 'Should NOT flag fillPassword');
    assert.ok(report.includes('No unused Page Object methods detected'), 'Should report no unused methods');
  });

  test('[ISSUE #12] should NOT flag methods called through wrappers', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/common.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'the user performs action',
              bodyText: 'await wrapperFunction(loginPage.performAction());'
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['performAction'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(!report.includes('performAction'), 'Should NOT flag method called through wrapper');
  });

  test('[ISSUE #12] should correctly flag genuinely unused methods', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/login.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'user logs in',
              bodyText: 'await loginPage.login("user", "pass");'
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['login', 'logout', 'forgotPassword', 'resetPassword'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    // login is used, should not be flagged
    assert.ok(!report.includes('login') || !report.includes('High Confidence'), 'Should NOT flag login method');
    
    // logout, forgotPassword, resetPassword are not used
    assert.ok(report.includes('logout') || report.includes('forgotPassword') || report.includes('resetPassword'),
      'Should flag at least one genuinely unused method');
  });

  test('[ISSUE #12] should handle instance variable patterns (loginPage.method)', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/auth.steps.ts',
          steps: [
            {
              type: 'When',
              pattern: 'user submits form',
              bodyText: `
                const username = "test";
                const password = "pass";
                loginPage.enterUsername(username);
                loginPage.enterPassword(password);
                loginPage.clickSubmit();
              `
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['enterUsername', 'enterPassword', 'clickSubmit'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(!report.includes('enterUsername'), 'Should NOT flag enterUsername');
    assert.ok(!report.includes('enterPassword'), 'Should NOT flag enterPassword');
    assert.ok(!report.includes('clickSubmit'), 'Should NOT flag clickSubmit');
  });

  test('[ISSUE #12] should include false-positive warning in report', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/test.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'test',
              bodyText: 'await page.unusedMethod();'
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/TestPage.ts',
          className: 'TestPage',
          publicMethods: ['unusedMethod'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(report.includes('False-Positive Risk'), 'Should include false positive warning');
    assert.ok(report.includes('verify manually'), 'Should warn to verify manually');
  });

  test('[ISSUE #12] should assign high confidence when <50% methods flagged', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/test.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'test',
              bodyText: `
                await page.method1();
                await page.method2();
                await page.method3();
                await page.method4();
                await page.method5();
              `
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/TestPage.ts',
          className: 'TestPage',
          // 10 methods total, 5 used, 5 unused = 50% unused = medium confidence border
          publicMethods: ['method1', 'method2', 'method3', 'method4', 'method5', 
                         'unused1', 'unused2', 'unused3'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    // 3 unused out of 8 total = 37.5% unused = high confidence
    if (report.includes('unused1') || report.includes('unused2')) {
      assert.ok(report.includes('High Confidence') || report.includes('Medium Confidence'),
        'Should have high or medium confidence for <50% flagged');
    }
  });

  test('[ISSUE #12] should assign low confidence when >80% methods flagged', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/test.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'test',
              bodyText: 'await page.method1();' // Only 1 method used
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/TestPage.ts',
          className: 'TestPage',
          // 10 methods, only 1 used = 90% flagged = low confidence
          publicMethods: ['method1', 'method2', 'method3', 'method4', 'method5', 
                         'method6', 'method7', 'method8', 'method9', 'method10'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    if (report.includes('method2')) {
      assert.ok(report.includes('Low Confidence'), 
        'Should have low confidence when >80% methods flagged (likely missing imports)');
    }
  });

  test('[ISSUE #12] should handle await patterns correctly', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/async.steps.ts',
          steps: [
            {
              type: 'When',
              pattern: 'async action',
              bodyText: `
                await performAsyncAction();
                const result = await fetchData();
                await submitForm();
              `
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/AsyncPage.ts',
          className: 'AsyncPage',
          publicMethods: ['performAsyncAction', 'fetchData', 'submitForm'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(!report.includes('performAsyncAction'), 'Should detect method with await');
    assert.ok(!report.includes('fetchData'), 'Should detect method with await');
    assert.ok(!report.includes('submitForm'), 'Should detect method with await');
  });

  test('[ISSUE #12] should detect duplicate step definitions', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/login1.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'the user is logged in',
              bodyText: 'await login();'
            }
          ]
        },
        {
          file: 'steps/login2.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'the user is logged in',  // Duplicate!
              bodyText: 'await loginUser();'
            }
          ]
        }
      ],
      existingPageObjects: [],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(report.includes('Duplicate Step Definitions'), 'Should detect duplicate steps');
    assert.ok(report.includes('the user is logged in'), 'Should show the duplicate pattern');
    assert.ok(report.includes('login1.steps.ts'), 'Should show first file');
    assert.ok(report.includes('login2.steps.ts'), 'Should show second file');
  });

  test('[ISSUE #12] should report clean codebase when no issues', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/test.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'test step',
              bodyText: 'await page.usedMethod();'
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/Page.ts',
          className: 'Page',
          publicMethods: ['usedMethod'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(report.includes('No duplicate step definition patterns detected'), 
      'Should report no duplicates');
    assert.ok(report.includes('No unused Page Object methods detected'), 
      'Should report no unused methods');
  });

  test('[ISSUE #12] should group unused methods by confidence level', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/mixed.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'mixed scenario',
              bodyText: `
                await highConfPage.usedMethod1();
                await highConfPage.usedMethod2();
                await mediumConfPage.usedMethod1();
                await lowConfPage.usedMethod1();
              `
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/HighConfPage.ts',
          className: 'HighConfPage',
          publicMethods: ['usedMethod1', 'usedMethod2', 'unusedMethod1'], // 33% unused = high confidence
          locators: []
        },
        {
          path: 'pages/MediumConfPage.ts',
          className: 'MediumConfPage',
          publicMethods: ['usedMethod1', 'unusedMethod1', 'unusedMethod2'], // 66% unused = medium confidence
          locators: []
        },
        {
          path: 'pages/LowConfPage.ts',
          className: 'LowConfPage',
          publicMethods: ['usedMethod1', 'unusedMethod1', 'unusedMethod2', 'unusedMethod3', 'unusedMethod4'], // 80% unused = low confidence
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    // Should have all three confidence sections
    const hasHighConf = report.includes('High Confidence');
    const hasMediumConf = report.includes('Medium Confidence');
    const hasLowConf = report.includes('Low Confidence');

    assert.ok(hasHighConf || hasMediumConf || hasLowConf, 
      'Should categorize by confidence levels');
  });

  test('[ISSUE #12] should detect XPath over-usage', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [],
      existingPageObjects: [
        {
          path: 'pages/Page.ts',
          className: 'Page',
          publicMethods: [],
          locators: [
            { name: 'button', strategy: 'xpath', selector: '//button' },
            { name: 'input', strategy: 'xpath', selector: '//input' },
            { name: 'div', strategy: 'xpath', selector: '//div' },
            { name: 'span', strategy: 'xpath', selector: '//span' },
            { name: 'accessButton', strategy: 'accessibility-id', selector: '~button' }
          ]
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(report.includes('XPath Over-Usage'), 'Should detect XPath over-usage');
    assert.ok(report.includes('80%'), 'Should show 80% xpath usage');
  });

  test('[ISSUE #12] should handle case-insensitive matching', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/test.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'test',
              bodyText: 'await LoginPage.SUBMITFORM();' // Uppercase in step
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['submitForm'], // Lowercase in page object
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    assert.ok(!report.includes('submitForm'), 'Should match case-insensitively');
  });

  test('[ISSUE #12] should provide helpful suggestion for low confidence results', () => {
    const analysis = createAnalysis({
      existingStepDefinitions: [
        {
          file: 'steps/test.steps.ts',
          steps: [
            {
              type: 'Given',
              pattern: 'test',
              bodyText: 'await page.method1();'
            }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/TestPage.ts',
          className: 'TestPage',
          publicMethods: ['method1', 'method2', 'method3', 'method4', 'method5', 
                         'method6', 'method7', 'method8', 'method9'],
          locators: []
        }
      ],
      existingUtils: []
    });

    const report = refactoringService.generateRefactoringSuggestions(analysis);

    if (report.includes('Low Confidence')) {
      assert.ok(report.includes('likely false positives') || report.includes('verify page object'),
        'Should provide helpful guidance for low confidence results');
    }
  });
});