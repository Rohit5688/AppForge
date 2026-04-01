import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditLocatorService } from '../services/AuditLocatorService.js';

/**
 * Issue #18 Tests: YAML Parser Misses `id=`, CSS Class, and `#id` Selector Types
 * 
 * Problem: extractSelectorsFromYaml uses a regex that only matches ~, //, and 
 * accessibility-id= prefixed selectors in YAML files. Selectors using id=, CSS 
 * classes (.ClassName), and hash IDs (#elementId) are silently skipped.
 * 
 * This test suite verifies all 5 selector types are detected:
 * 1. ~ (accessibility-id)
 * 2. // (xpath)
 * 3. accessibility-id= (explicit)
 * 4. id= (WebdriverIO id selector)
 * 5. . and # (CSS selectors)
 */
describe('AuditLocatorService - YAML Parser Coverage (Issue #18)', () => {
  const auditService = new AuditLocatorService();

  // Helper to create unique test directory for each test
  function createTestDir(): string {
    const testDir = path.join(os.tmpdir(), `test-issue18-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    return testDir;
  }

  // Helper to cleanup test directory
  function cleanupTestDir(testDir: string): void {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  test('[ISSUE #18] should detect id= prefix selectors in YAML', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
submit_button: id=com.myapp:id/submitBtn
login_button: id=com.example:id/loginButton
cancel_button: id=android:id/cancel
`;
      fs.writeFileSync(path.join(locatorsDir, 'dashboard.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 3, 'Should find all 3 id= selectors');
      
      for (const entry of report.entries) {
        assert.ok(entry.selector.startsWith('id='), 'Selector should start with id=');
        assert.strictEqual(entry.strategy, 'resource-id', 'Strategy should be resource-id');
        assert.strictEqual(entry.severity, 'warning', 'Severity should be warning');
      }
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should detect CSS class selectors in YAML', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
header_text: .HeaderText
submit_button: .SubmitButton
error_message: .ErrorMessage
`;
      fs.writeFileSync(path.join(locatorsDir, 'css-classes.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 3, 'Should find all 3 CSS class selectors');
      
      for (const entry of report.entries) {
        assert.ok(entry.selector.startsWith('.'), 'Selector should start with .');
        assert.strictEqual(entry.strategy, 'other', 'Strategy should be other');
        assert.strictEqual(entry.severity, 'warning', 'Severity should be warning');
      }
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should detect hash ID selectors in YAML', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
username_field: "#usernameInput"
password_field: '#passwordInput'
submit_button: #submitBtn
`;
      fs.writeFileSync(path.join(locatorsDir, 'hash-ids.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 3, 'Should find all 3 hash ID selectors');
      
      for (const entry of report.entries) {
        assert.ok(entry.selector.startsWith('#'), 'Selector should start with #');
        assert.strictEqual(entry.strategy, 'other', 'Strategy should be other');
        assert.strictEqual(entry.severity, 'warning', 'Severity should be warning');
      }
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] REGRESSION: should still detect ~ accessibility-id selectors', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
login_button: ~loginButton
submit_button: ~submitBtn
`;
      fs.writeFileSync(path.join(locatorsDir, 'accessibility.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 2, 'Should still find ~ selectors');
      assert.strictEqual(report.accessibilityIdCount, 2, 'Both should be accessibility-id');
      
      for (const entry of report.entries) {
        assert.strictEqual(entry.strategy, 'accessibility-id', 'Strategy should be accessibility-id');
        assert.strictEqual(entry.severity, 'ok', 'Severity should be ok');
      }
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] REGRESSION: should still detect // xpath selectors', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
header_text: //android.widget.TextView[@text="Dashboard"]
submit_button: "//android.widget.Button[@text='Submit']"
`;
      fs.writeFileSync(path.join(locatorsDir, 'xpath.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 2, 'Should still find // xpath selectors');
      assert.strictEqual(report.xpathCount, 2, 'Both should be xpath');
      
      for (const entry of report.entries) {
        assert.strictEqual(entry.strategy, 'xpath', 'Strategy should be xpath');
        assert.strictEqual(entry.severity, 'critical', 'Severity should be critical');
      }
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] REGRESSION: should still detect :id/ resource-id selectors', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
login_button: android:id/login_button
submit_button: com.example.app:id/submit
`;
      fs.writeFileSync(path.join(locatorsDir, 'resource-ids.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 2, 'Should still find :id/ selectors');
      
      for (const entry of report.entries) {
        assert.ok(entry.selector.includes(':id/'), 'Selector should contain :id/');
        assert.strictEqual(entry.strategy, 'resource-id', 'Strategy should be resource-id');
        assert.strictEqual(entry.severity, 'warning', 'Severity should be warning');
      }
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should detect ALL 5 selector types in mixed YAML file', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
# All 5 selector types in one file
accessibility_selector: ~loginButton
xpath_selector: //android.widget.Button[@text="Submit"]
resource_id_selector: android:id/login_button
id_prefix_selector: id=com.myapp:id/submitBtn
css_class_selector: .HeaderText
hash_id_selector: #usernameInput
`;
      fs.writeFileSync(path.join(locatorsDir, 'mixed-all-types.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 6, 'Should find all 6 selectors from all 5 types');
      assert.strictEqual(report.accessibilityIdCount, 1, 'Should have 1 accessibility-id');
      assert.strictEqual(report.xpathCount, 1, 'Should have 1 xpath');
      assert.strictEqual(report.otherCount, 4, 'Should have 4 other (resource-id, id=, class, hash)');

      const accessibilityEntry = report.entries.find(e => e.selector.startsWith('~'));
      const xpathEntry = report.entries.find(e => e.selector.startsWith('//'));
      const resourceIdEntry = report.entries.find(e => e.selector.includes(':id/'));
      const idPrefixEntry = report.entries.find(e => e.selector.startsWith('id='));
      const classEntry = report.entries.find(e => e.selector.startsWith('.'));
      const hashEntry = report.entries.find(e => e.selector.startsWith('#'));

      assert.ok(accessibilityEntry, 'Should find ~ selector');
      assert.ok(xpathEntry, 'Should find // selector');
      assert.ok(resourceIdEntry, 'Should find :id/ selector');
      assert.ok(idPrefixEntry, 'Should find id= selector');
      assert.ok(classEntry, 'Should find . selector');
      assert.ok(hashEntry, 'Should find # selector');
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should handle quoted and unquoted new selector types', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
unquoted_id: id=com.myapp:id/button
single_quoted_id: 'id=com.myapp:id/button2'
double_quoted_id: "id=com.myapp:id/button3"
unquoted_class: .ClassName
single_quoted_class: '.ClassName2'
double_quoted_class: ".ClassName3"
unquoted_hash: #elementId
single_quoted_hash: '#elementId2'
double_quoted_hash: "#elementId3"
`;
      fs.writeFileSync(path.join(locatorsDir, 'quotes-new-types.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 9, 'Should find all 9 selectors regardless of quotes');
      
      const idSelectors = report.entries.filter(e => e.selector.startsWith('id='));
      assert.strictEqual(idSelectors.length, 3, 'Should find 3 id= selectors');
      
      const classSelectors = report.entries.filter(e => e.selector.startsWith('.'));
      assert.strictEqual(classSelectors.length, 3, 'Should find 3 class selectors');
      
      const hashSelectors = report.entries.filter(e => e.selector.startsWith('#'));
      assert.strictEqual(hashSelectors.length, 3, 'Should find 3 hash selectors');
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] real-world reproduction: dashboard.yaml with id= and xpath', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
submit_button: id=com.myapp:id/submitBtn
header_text: //android.widget.TextView[@text="Dashboard"]
`;
      fs.writeFileSync(path.join(locatorsDir, 'dashboard.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 2, 'Should find both id= and xpath selectors');
      
      const idEntry = report.entries.find(e => e.locatorName === 'submit_button');
      const xpathEntry = report.entries.find(e => e.locatorName === 'header_text');
      
      assert.ok(idEntry, 'Should find submit_button with id= selector');
      assert.ok(xpathEntry, 'Should find header_text with xpath selector');
      
      assert.ok(idEntry.selector.startsWith('id='), 'submit_button should use id= prefix');
      assert.ok(xpathEntry.selector.startsWith('//'), 'header_text should use xpath');
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should correctly classify id= and xpath selectors with proper severity', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
submit_button: id=com.myapp:id/submitBtn
header_text: //android.widget.TextView[@text="Dashboard"]
`;
      fs.writeFileSync(path.join(locatorsDir, 'dashboard.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 2, 'Should find 2 locators');
      
      // Verify the id= selector is classified correctly
      const idEntry = report.entries.find(e => e.locatorName === 'submit_button');
      assert.ok(idEntry, 'Should find submit_button entry');
      assert.ok(idEntry.selector.startsWith('id='), 'Selector should include id= prefix');
      assert.strictEqual(idEntry.strategy, 'resource-id', 'id= selector should be classified as resource-id');
      assert.strictEqual(idEntry.severity, 'warning', 'id= selector should have warning severity');
      
      // Verify the xpath selector is classified correctly
      const xpathEntry = report.entries.find(e => e.locatorName === 'header_text');
      assert.ok(xpathEntry, 'Should find header_text entry');
      assert.ok(xpathEntry.selector.startsWith('//'), 'Selector should start with //');
      assert.strictEqual(xpathEntry.strategy, 'xpath', 'xpath selector should be classified as xpath');
      assert.strictEqual(xpathEntry.severity, 'critical', 'xpath selector should have critical severity');
      
      // Verify markdown report is generated
      assert.ok(report.markdownReport.length > 0, 'Report should generate markdown');
      assert.ok(report.markdownReport.includes('Mobile Locator Audit Report'), 'Report should have title');
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should handle CSS selectors with complex patterns', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
class_selector: .btn-primary
id_selector: #submit-button
compound_class: .btn.btn-large
compound_id: #main-form
`;
      fs.writeFileSync(path.join(locatorsDir, 'css-complex.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 4, 'Should find all CSS selectors');
      
      const classSelectors = report.entries.filter(e => e.selector.startsWith('.'));
      const hashSelectors = report.entries.filter(e => e.selector.startsWith('#'));
      
      assert.strictEqual(classSelectors.length, 2, 'Should find 2 class selectors');
      assert.strictEqual(hashSelectors.length, 2, 'Should find 2 hash selectors');
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });

  test('[ISSUE #18] should not match false positives in YAML values', async () => {
    const testProjectRoot = createTestDir();
    try {
      const locatorsDir = path.join(testProjectRoot, 'locators');
      fs.mkdirSync(locatorsDir, { recursive: true });

      const yamlContent = `
# These should NOT be matched as selectors
timeout: 5000
page_name: "My Dashboard Page"
description: "Click the # button to continue"
notes: "Use .class selector for styling"

# These SHOULD be matched
real_selector: #actualButton
real_class: .RealClass
`;
      fs.writeFileSync(path.join(locatorsDir, 'false-positives.yaml'), yamlContent, 'utf-8');

      const report = await auditService.audit(testProjectRoot, ['locators']);

      assert.strictEqual(report.totalLocators, 2, 'Should only match actual selectors');
      assert.ok(report.entries.every(e => e.locatorName === 'real_selector' || e.locatorName === 'real_class'),
        'Should only have real selector entries');
    } finally {
      cleanupTestDir(testProjectRoot);
    }
  });
});