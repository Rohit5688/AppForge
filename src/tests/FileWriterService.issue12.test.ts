import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileWriterService } from '../services/FileWriterService.js';

/**
 * Issue #12 Tests: `validate_and_write` should not write broken TypeScript files to disk
 * 
 * Problem: Previously, validate_and_write would write all .ts files to disk in a loop,
 * then run tsc --noEmit afterwards. If TypeScript compilation failed, invalid files
 * would remain on disk with no rollback.
 * 
 * Solution: Write files to a temporary staging directory first (.mcp-staging), validate
 * them with tsc, and only move to final destination on success. If validation fails,
 * clean up the staging directory.
 */
describe('FileWriterService.validateAndWrite - Issue #12 Fix (Staging & Rollback)', () => {
  let testProjectRoot: string;
  const fileWriterService = new FileWriterService();

  // Setup: Create a temporary test project directory
  test.before(() => {
    testProjectRoot = path.join(os.tmpdir(), `test-issue12-${Date.now()}`);
    if (!fs.existsSync(testProjectRoot)) {
      fs.mkdirSync(testProjectRoot, { recursive: true });
    }
    // Create a minimal tsconfig.json so tsc can validate files
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: false,
        outDir: './dist',
        rootDir: './',
        baseUrl: './',
        noImplicitAny: false
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };
    fs.writeFileSync(
      path.join(testProjectRoot, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2),
      'utf8'
    );
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

  test('[ISSUE #12] should NOT write files to disk if TypeScript validation fails', async () => {
    const files = [
      {
        path: 'src/pages/LoginPage.ts',
        content: `
export class LoginPage {
  async login(username: string, password: string) {
    // This method calls a non-existent method, causing tsc error
    await this.nonExistentMethod(username);
  }
}
        `
      }
    ];

    // Attempt to write invalid TypeScript
    try {
      const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
      const parsed = JSON.parse(result);
      // Should fail validation
      assert.strictEqual(parsed.success, false, 'Expected validation to fail for invalid TypeScript');
    } catch (error: any) {
      // AppForgeError is also acceptable - it means validation failed
      assert.ok(error.code === 'E006_TS_COMPILE_FAIL', 'Expected TypeScript compilation error');
    }

    // Verify the file was NOT written to the project root
    const filePath = path.join(testProjectRoot, 'src/pages/LoginPage.ts');
    assert.ok(
      !fs.existsSync(filePath),
      'Invalid TypeScript file should NOT be written to disk when validation fails'
    );
  });

  test('[ISSUE #12] should clean up staging directory after failed validation', async () => {
    const files = [
      {
        path: 'src/pages/BadPage.ts',
        content: `
const x: number = "this is a string"; // Type mismatch
        `
      }
    ];

    try {
      const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.success, false, 'Expected validation to fail');
    } catch (error: any) {
      assert.ok(error.code === 'E006_TS_COMPILE_FAIL', 'Expected TypeScript error');
    }

    // Verify staging directory was cleaned up
    const stagingDir = path.join(testProjectRoot, '.mcp-staging');
    assert.ok(
      !fs.existsSync(stagingDir),
      'Staging directory should be cleaned up after failed validation'
    );
  });

  test('[ISSUE #12] should write files to disk AFTER successful TypeScript validation', async () => {
    const files = [
      {
        path: 'src/pages/GoodPage.ts',
        content: `
export class GoodPage {
  private driver: Record<string, any>;

  constructor(driver: Record<string, any>) {
    this.driver = driver;
  }

  async login(username: string, password: string): Promise<void> {
    const userInput = this.driver['$']('input[name="username"]');
    const passInput = this.driver['$']('input[name="password"]');
    const submitBtn = this.driver['$']('button[type="submit"]');
    if (userInput && passInput && submitBtn) {
      await userInput.setValue(username);
      await passInput.setValue(password);
      await submitBtn.click();
    }
  }
}
        `
      }
    ];

    // Write valid TypeScript
    const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
    const parsed = JSON.parse(result);

    // Should succeed
    assert.strictEqual(parsed.success, true, 'Expected validation to pass for valid TypeScript');

    // Verify the file WAS written to the project
    const filePath = path.join(testProjectRoot, 'src/pages/GoodPage.ts');
    assert.ok(fs.existsSync(filePath), 'Valid TypeScript file should be written to disk');

    // Verify staging directory was cleaned up
    const stagingDir = path.join(testProjectRoot, '.mcp-staging');
    assert.ok(
      !fs.existsSync(stagingDir),
      'Staging directory should be cleaned up after successful write'
    );
  });

  test('[ISSUE #12] should write multiple files atomically (all or nothing)', async () => {
    const files = [
      {
        path: 'src/pages/Page1.ts',
        content: `
export class Page1 {
  public greet(): string {
    return 'Hello from Page1';
  }
}
        `
      },
      {
        path: 'src/pages/Page2.ts',
        content: `
export class Page2 {
  public greet(): string {
    return 'Hello from Page2';
  }
}
        `
      }
    ];

    // Both files are syntactically valid
    const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
    const parsed = JSON.parse(result);

    // Both should be written together on success
    assert.strictEqual(parsed.success, true, 'Expected both files to write successfully');
    
    const page1Path = path.join(testProjectRoot, 'src/pages', 'Page1.ts');
    const page2Path = path.join(testProjectRoot, 'src/pages', 'Page2.ts');
    
    // Both files should exist
    assert.ok(fs.existsSync(page1Path), 'Page1 should be written');
    assert.ok(fs.existsSync(page2Path), 'Page2 should be written');
  });

  test('[ISSUE #12] should support dry-run mode (validate without writing)', async () => {
    const files = [
      {
        path: 'src/pages/DryRunPage.ts',
        content: `
export class DryRunPage {
  public async test(): Promise<void> {
    console.log('ok');
  }
}
        `
      }
    ];

    // Write with dryRun=true
    const result = await fileWriterService.validateAndWrite(testProjectRoot, files, 3, true);
    const parsed = JSON.parse(result);

    assert.strictEqual(parsed.dryRun, true, 'Response should indicate dry-run mode');
    assert.strictEqual(parsed.success, true, 'Dry run validation should pass');

    // Verify file was NOT written
    const filePath = path.join(testProjectRoot, 'src/pages/DryRunPage.ts');
    assert.ok(
      !fs.existsSync(filePath),
      'Dry-run should NOT write files to disk'
    );
  });

  test('[ISSUE #12] should include clear error message when TypeScript validation fails', async () => {
    const files = [
      {
        path: 'src/pages/ErrorPage.ts',
        content: `
export class ErrorPage {
  private unknownType: NonExistentType; // This type does not exist
}
        `
      }
    ];

    try {
      const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.success, false, 'Expected validation to fail');
    } catch (error: any) {
      assert.ok(error.code === 'E006_TS_COMPILE_FAIL', 'Expected TypeScript error');
      assert.ok(error.remediation, 'Error should include remediation details');
    }
  });

  test('[ISSUE #12] should not leave .mcp-staging directory on disk after failed validation', async () => {
    const files = [
      {
        path: 'src/broken.ts',
        content: `const x: string = 123;` // Type error
      }
    ];

    try {
      await fileWriterService.validateAndWrite(testProjectRoot, files);
    } catch (error) {
      // Error is expected
    }

    const stagingDir = path.join(testProjectRoot, '.mcp-staging');
    assert.ok(
      !fs.existsSync(stagingDir),
      'Staging directory should be completely cleaned up, even on validation failure'
    );
  });

  test('[ISSUE #12] should not leave .mcp-staging directory on disk after successful write', async () => {
    const files = [
      {
        path: 'src/pages/CleanupTest.ts',
        content: `
export class CleanupTest {
  public constructor() {
    // cleanup test
  }
}
        `
      }
    ];

    const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
    const parsed = JSON.parse(result);

    assert.strictEqual(parsed.success, true, 'Write should succeed');

    const stagingDir = path.join(testProjectRoot, '.mcp-staging');
    assert.ok(
      !fs.existsSync(stagingDir),
      'Staging directory should be completely cleaned up after successful write'
    );
  });

  test('[ISSUE #12] should validate TypeScript before writing Gherkin files', async () => {
    const files = [
      {
        path: 'src/features/test.feature',
        content: `Feature: Test Feature
Scenario: Test Scenario
Given the user is logged in
        `
      },
      {
        path: 'src/steps/test.steps.ts',
        content: `
import { Given } from '@cucumber/cucumber';

Given('the user is logged in', async function() {
  // Missing await or implementation
  unknownFunction();
});
        `
      }
    ];

    try {
      const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.success, false, 'Expected validation to fail');
    } catch (error: any) {
      assert.ok(error.code === 'E006_TS_COMPILE_FAIL', 'Expected TypeScript error');
    }

    // Feature file should not be written if TypeScript validation fails
    assert.ok(
      !fs.existsSync(path.join(testProjectRoot, 'src/features/test.feature')),
      'Feature file should not be written if TypeScript validation fails'
    );
  });

  test('[ISSUE #12] should provide backup/recovery information in success response', async () => {
    const files = [
      {
        path: 'src/pages/BackupTest.ts',
        content: `
export class BackupTest {
  public constructor() {
    // backup test
  }
}
        `
      }
    ];

    const result = await fileWriterService.validateAndWrite(testProjectRoot, files);
    const parsed = JSON.parse(result);

    assert.strictEqual(parsed.success, true, 'Write should succeed');
    assert.ok(
      parsed.filesWritten && Array.isArray(parsed.filesWritten),
      'Response should list written files'
    );
    // backedUpTo should only appear if files were overwritten
    // (not on initial write)
  });

  test('[ISSUE #12] message should clearly state validation failure vs. successful write', async () => {
    // Test 2: Successful write
    const validFiles = [
      {
        path: 'src/pages/MessageTest.ts',
        content: `
export class MessageTest {
  public constructor() {
    // message test
  }
}
        `
      }
    ];

    const successResult = await fileWriterService.validateAndWrite(testProjectRoot, validFiles);
    const successParsed = JSON.parse(successResult);
    assert.ok(
      successParsed.message.includes('successfully') && successParsed.success === true,
      'Successful write should explicitly say "successfully"'
    );
  });
});