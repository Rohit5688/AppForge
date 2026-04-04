import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { SummarySuiteService } from '../services/SummarySuiteService.js';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SummarySuiteService - WebdriverIO Format Support', () => {
  it('should parse WebdriverIO Cucumber report format correctly', async () => {
    const service = new SummarySuiteService();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-wdio-test-'));
    await fs.mkdir(path.join(tempDir, 'reports'), { recursive: true });

    try {
      const wdioReport = [
        {
          id: 'credit-card-flow',
          name: 'Credit Card Flow',
          uri: 'features/credit-card.feature',
          elements: [
            {
              id: 'apply-for-credit-card',
              name: 'Apply for credit card',
              steps: [
                {
                  name: 'Given I am on the home screen',
                  result: { status: 'passed', duration: 500000000 }
                },
                {
                  name: 'When I tap apply now',
                  result: { status: 'passed', duration: 700000000 }
                },
                {
                  name: 'Then I should see the application form',
                  result: { status: 'passed', duration: 300000000 }
                }
              ]
            },
            {
              id: 'view-card-offers',
              name: 'View card offers',
              steps: [
                {
                  name: 'Given I am on the home screen',
                  result: { status: 'passed', duration: 400000000 }
                },
                {
                  name: 'When I tap view offers',
                  result: {
                    status: 'failed',
                    duration: 200000000,
                    error_message: 'Element not found: ~credit_card.button\nat SelectorEngine.findElement (line 45)\nat Page.click (line 123)'
                  }
                }
              ]
            }
          ]
        }
      ];

      const reportPath = path.join(tempDir, 'reports', 'cucumber-results.json');
      await fs.writeFile(reportPath, JSON.stringify(wdioReport, null, 2));

      const result = await service.summarize(tempDir);

      assert.strictEqual(result.totalFeatures, 1);
      assert.strictEqual(result.totalScenarios, 2);
      assert.strictEqual(result.passed, 1);
      assert.strictEqual(result.failed, 1);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.failedScenarios.length, 1);
      assert.strictEqual(result.failedScenarios[0].name, 'View card offers');
      assert.ok(result.failedScenarios[0].error.includes('Element not found'));
      assert.ok(result.plainEnglishSummary.includes('1 passed, 1 failed'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should parse standard Cucumber JSON format correctly', async () => {
    const service = new SummarySuiteService();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-wdio-test-'));
    await fs.mkdir(path.join(tempDir, 'reports'), { recursive: true });

    try {
      const cucumberReport = [
        {
          name: 'Login Feature',
          uri: 'features/login.feature',
          elements: [
            {
              type: 'scenario',
              keyword: 'Scenario',
              name: 'Successful login',
              steps: [
                {
                  name: 'Given I am on the login page',
                  result: { status: 'passed', duration: 1000000000 }
                },
                {
                  name: 'When I enter valid credentials',
                  result: { status: 'passed', duration: 500000000 }
                }
              ]
            }
          ]
        }
      ];

      const reportPath = path.join(tempDir, 'reports', 'cucumber-results.json');
      await fs.writeFile(reportPath, JSON.stringify(cucumberReport, null, 2));

      const result = await service.summarize(tempDir);

      assert.strictEqual(result.totalFeatures, 1);
      assert.strictEqual(result.totalScenarios, 1);
      assert.strictEqual(result.passed, 1);
      assert.strictEqual(result.failed, 0);
      assert.ok(result.plainEnglishSummary.includes('✅ All 1 scenarios passed'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle WebdriverIO format with background steps excluded', async () => {
    const service = new SummarySuiteService();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-wdio-test-'));
    await fs.mkdir(path.join(tempDir, 'reports'), { recursive: true });

    try {
      const wdioReport = [
        {
          id: 'feature-with-background',
          name: 'Feature with Background',
          elements: [
            {
              id: 'background-setup',
              name: 'Background',
              type: 'background',
              steps: [
                { name: 'Given background setup', result: { status: 'passed', duration: 100000000 } }
              ]
            },
            {
              id: 'actual-scenario',
              name: 'Actual test scenario',
              steps: [
                { name: 'When I do something', result: { status: 'passed', duration: 100000000 } }
              ]
            }
          ]
        }
      ];

      const reportPath = path.join(tempDir, 'reports', 'cucumber-results.json');
      await fs.writeFile(reportPath, JSON.stringify(wdioReport, null, 2));

      const result = await service.summarize(tempDir);

      // Should only count the actual scenario, not the background
      assert.strictEqual(result.totalScenarios, 1);
      assert.strictEqual(result.passed, 1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should auto-detect report path from common locations', async () => {
    const service = new SummarySuiteService();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-wdio-test-'));
    await fs.mkdir(path.join(tempDir, 'reports'), { recursive: true });

    try {
      const wdioReport = [
        {
          id: 'test',
          name: 'Test',
          elements: [
            {
              id: 's1',
              name: 'Scenario  1',
              steps: [
                { name: 'Step 1', result: { status: 'passed', duration: 100000000 } }
              ]
            }
          ]
        }
      ];

      // Place report at default location
      const reportPath = path.join(tempDir, 'reports', 'cucumber-results.json');
      await fs.writeFile(reportPath, JSON.stringify(wdioReport, null, 2));

      // Call without specifying reportFile
      const result = await service.summarize(tempDir);

      assert.strictEqual(result.totalScenarios, 1);
      assert.strictEqual(result.passed, 1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});