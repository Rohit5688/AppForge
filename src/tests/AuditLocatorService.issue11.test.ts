import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditLocatorService } from '../services/AuditLocatorService.js';

/**
 * Issue #11 Tests: `audit_mobile_locators` should parse YAML locator files
 * 
 * Problem: Documentation claims YAML parsing needs to be implemented, but the code
 * already has it! However, there are ZERO tests, meaning no validation that it works.
 * 
 * This test suite verifies:
 * - YAML files are discovered and parsed
 * - Selectors are classified correctly (~ = ok, // = critical, :id/ = warning)
 * - Health scores are calculated properly
 * - Platform-specific YAML is handled
 * - Mixed TS + YAML projects work correctly
 */
describe('AuditLocatorService - YAML Locator Parsing (Issue #11)', () => {
  let testProjectRoot: string;
  const auditService = new AuditLocatorService();

  // Setup: Create a temporary test project directory
  test.before(() => {
    testProjectRoot = path.join(os.tmpdir(), `test-issue11-${Date.now()}`);
    if (!fs.existsSync(testProjectRoot)) {
      fs.mkdirSync(testProjectRoot, { recursive: true });
    }
  });

  // Cleanup
  test.after(() => {
    try {
      if (fs.existsSync(testProjectRoot)) {
        fs.rmSync(testProjectRoot, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('[ISSUE #11] should parse YAML files with accessibility-id selectors', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
login_button: ~loginButton
submit_button: ~submitBtn
username_field: ~usernameInput
`;
    fs.writeFileSync(path.join(locatorsDir, 'login.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 3, 'Should find 3 locators');
    assert.strictEqual(report.accessibilityIdCount, 3, 'All 3 should be accessibility-id');
    assert.strictEqual(report.xpathCount, 0, 'Should have 0 xpath locators');
    assert.strictEqual(Math.round(report.accessibilityIdCount / report.totalLocators * 100), 100, 'Health score should be 100%');
    
    // Verify all entries are classified as 'ok'
    for (const entry of report.entries) {
      assert.strictEqual(entry.strategy, 'accessibility-id', 'Strategy should be accessibility-id');
      assert.strictEqual(entry.severity, 'ok', 'Severity should be ok');
      assert.ok(entry.selector.startsWith('~'), 'Selector should start with ~');
    }
  });

  test('[ISSUE #11] should parse YAML files with xpath selectors', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
login_form: "//android.widget.LinearLayout[@id='login']"
submit_button: //android.widget.Button[@text='Submit']
error_message: "//android.widget.TextView[@text='Error']"
`;
    fs.writeFileSync(path.join(locatorsDir, 'xpath-selectors.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 3, 'Should find 3 locators');
    assert.strictEqual(report.xpathCount, 3, 'All 3 should be xpath');
    assert.strictEqual(report.accessibilityIdCount, 0, 'Should have 0 accessibility-id locators');
    
    // Verify all entries are classified as 'critical'
    for (const entry of report.entries) {
      assert.strictEqual(entry.strategy, 'xpath', 'Strategy should be xpath');
      assert.strictEqual(entry.severity, 'critical', 'Severity should be critical');
      assert.ok(entry.selector.startsWith('//'), 'Selector should start with //');
      assert.ok(entry.recommendation.includes('BRITTLE'), 'Should warn about brittleness');
    }
  });

  test('[ISSUE #11] should parse YAML files with resource-id selectors', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
login_button: android:id/login_button
submit_button: com.example.app:id/submit
username_field: android:id/username_input
`;
    fs.writeFileSync(path.join(locatorsDir, 'android-ids.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 3, 'Should find 3 locators');
    assert.strictEqual(report.otherCount, 3, 'All 3 should be in "other" category (resource-id)');
    
    // Verify all entries are classified as 'warning'
    for (const entry of report.entries) {
      assert.strictEqual(entry.strategy, 'resource-id', 'Strategy should be resource-id');
      assert.strictEqual(entry.severity, 'warning', 'Severity should be warning');
      assert.ok(entry.selector.includes(':id/'), 'Selector should contain :id/');
    }
  });

  test('[ISSUE #11] should classify YAML selectors correctly (~ = ok, // = critical)', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
good_selector: ~accessibilityId
bad_selector: //android.widget.Button[@text='Bad']
acceptable_selector: android:id/some_id
`;
    fs.writeFileSync(path.join(locatorsDir, 'mixed.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 3, 'Should find 3 locators');
    assert.strictEqual(report.accessibilityIdCount, 1, 'Should have 1 accessibility-id');
    assert.strictEqual(report.xpathCount, 1, 'Should have 1 xpath');
    assert.strictEqual(report.otherCount, 1, 'Should have 1 other (resource-id)');
    
    // Health score should be 33% (1 out of 3 is stable)
    const healthScore = Math.round((report.accessibilityIdCount / report.totalLocators) * 100);
    assert.strictEqual(healthScore, 33, 'Health score should be 33%');
  });

  test('[ISSUE #11] should ignore non-selector YAML keys', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
# This YAML has some config keys that aren't selectors
timeout: 5000
retry_count: 3
page_name: LoginPage

# Only these should be parsed as selectors
login_button: ~loginButton
submit_button: //android.widget.Button
`;
    fs.writeFileSync(path.join(locatorsDir, 'with-config.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    // Should only find the 2 actual selectors, not the config keys
    assert.strictEqual(report.totalLocators, 2, 'Should find only 2 selectors, ignoring config keys');
  });

  test('[ISSUE #11] should generate correct health scores for YAML projects', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    // 7 good selectors, 2 bad selectors, 1 warning = 70% health score
    const yamlContent = `
selector1: ~good1
selector2: ~good2
selector3: ~good3
selector4: ~good4
selector5: ~good5
selector6: ~good6
selector7: ~good7
selector8: //bad1
selector9: //bad2
selector10: android:id/warning1
`;
    fs.writeFileSync(path.join(locatorsDir, 'health-test.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 10, 'Should find 10 locators');
    assert.strictEqual(report.accessibilityIdCount, 7, 'Should have 7 good selectors');
    assert.strictEqual(report.xpathCount, 2, 'Should have 2 bad selectors');
    assert.strictEqual(report.otherCount, 1, 'Should have 1 warning selector');
    
    const healthScore = Math.round((report.accessibilityIdCount / report.totalLocators) * 100);
    assert.strictEqual(healthScore, 70, 'Health score should be 70%');
  });

  test('[ISSUE #11] should handle mixed TS + YAML projects', async () => {
    const pagesDir = path.join(testProjectRoot, 'pages');
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.mkdirSync(locatorsDir, { recursive: true });

    // Create a TS Page Object
    const tsContent = `
export class LoginPage {
  get usernameField() { return $('~username'); }
  get passwordField() { return $('~password'); }
}
`;
    fs.writeFileSync(path.join(pagesDir, 'LoginPage.ts'), tsContent, 'utf-8');

    // Create a YAML locator file
    const yamlContent = `
submit_button: ~submitBtn
cancel_button: //android.widget.Button[@text='Cancel']
`;
    fs.writeFileSync(path.join(locatorsDir, 'actions.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['pages', 'locators']);

    // Should find 2 from TS + 2 from YAML = 4 total
    assert.strictEqual(report.totalLocators, 4, 'Should find 4 locators (2 TS + 2 YAML)');
    assert.strictEqual(report.accessibilityIdCount, 3, 'Should have 3 accessibility-id selectors');
    assert.strictEqual(report.xpathCount, 1, 'Should have 1 xpath selector');
  });

  test('[ISSUE #11] should report 0 locators when YAML files are empty', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    // Create empty YAML file
    fs.writeFileSync(path.join(locatorsDir, 'empty.yaml'), '', 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 0, 'Should report 0 locators for empty YAML');
    assert.strictEqual(report.accessibilityIdCount, 0, 'Should have 0 accessibility-id');
    assert.strictEqual(report.xpathCount, 0, 'Should have 0 xpath');
  });

  test('[ISSUE #11] should handle YAML with quoted and unquoted values', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
unquoted: ~loginButton
single_quoted: '~submitButton'
double_quoted: "~cancelButton"
xpath_quoted: "//android.widget.Button"
xpath_unquoted: //android.widget.TextView
`;
    fs.writeFileSync(path.join(locatorsDir, 'quotes.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 5, 'Should find 5 locators regardless of quotes');
    assert.strictEqual(report.accessibilityIdCount, 3, 'Should have 3 accessibility-id');
    assert.strictEqual(report.xpathCount, 2, 'Should have 2 xpath');
  });

  test('[ISSUE #11] should include YAML file path in report entries', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `login_button: ~loginButton`;
    fs.writeFileSync(path.join(locatorsDir, 'test-file.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.entries.length, 1, 'Should have 1 entry');
    assert.ok(report.entries[0].file.includes('locators'), 'File path should include locators dir');
    assert.ok(report.entries[0].file.includes('test-file.yaml'), 'File path should include YAML filename');
    assert.strictEqual(report.entries[0].className, 'test-file', 'Class name should be filename without extension');
  });

  test('[ISSUE #11] should handle multiple YAML files in same directory', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    fs.writeFileSync(path.join(locatorsDir, 'file1.yaml'), 'button1: ~btn1', 'utf-8');
    fs.writeFileSync(path.join(locatorsDir, 'file2.yaml'), 'button2: ~btn2', 'utf-8');
    fs.writeFileSync(path.join(locatorsDir, 'file3.yml'), 'button3: ~btn3', 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.strictEqual(report.totalLocators, 3, 'Should find locators from all 3 YAML files');
    
    const file1Entry = report.entries.find(e => e.file.includes('file1.yaml'));
    const file2Entry = report.entries.find(e => e.file.includes('file2.yaml'));
    const file3Entry = report.entries.find(e => e.file.includes('file3.yml'));
    
    assert.ok(file1Entry, 'Should have entry from file1.yaml');
    assert.ok(file2Entry, 'Should have entry from file2.yaml');
    assert.ok(file3Entry, 'Should have entry from file3.yml');
  });

  test('[ISSUE #11] should generate markdown report with YAML locators', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
good_button: ~goodButton
bad_button: //android.widget.Button
`;
    fs.writeFileSync(path.join(locatorsDir, 'report-test.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    assert.ok(report.markdownReport, 'Should generate markdown report');
    assert.ok(report.markdownReport.includes('Mobile Locator Audit Report'), 'Report should have title');
    assert.ok(report.markdownReport.includes('accessibility-id'), 'Report should mention accessibility-id');
    assert.ok(report.markdownReport.includes('xpath'), 'Report should mention xpath');
    assert.ok(report.markdownReport.includes('50%'), 'Report should show 50% health score');
    assert.ok(report.markdownReport.includes('Critical'), 'Report should have critical section for xpath');
  });

  test('[ISSUE #11] should handle YAML files in subdirectories', async () => {
    const locatorsDir = path.join(testProjectRoot, 'src', 'locators', 'android');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `login_button: ~loginBtn`;
    fs.writeFileSync(path.join(locatorsDir, 'deep.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['src/locators']);

    assert.strictEqual(report.totalLocators, 1, 'Should find locator in subdirectory');
    assert.ok(report.entries[0].file.includes('android'), 'File path should include subdirectory');
  });

  test('[ISSUE #11] should skip non-selector lines in YAML', async () => {
    const locatorsDir = path.join(testProjectRoot, 'locators');
    fs.mkdirSync(locatorsDir, { recursive: true });

    const yamlContent = `
# Comments should be ignored
---
metadata:
  version: 1.0
  author: test

# Only actual selectors
real_selector: ~actualButton
another_selector: //path
`;
    fs.writeFileSync(path.join(locatorsDir, 'complex.yaml'), yamlContent, 'utf-8');

    const report = await auditService.audit(testProjectRoot, ['locators']);

    // Should only count the 2 actual selectors
    assert.strictEqual(report.totalLocators, 2, 'Should only count actual selectors');
  });
});