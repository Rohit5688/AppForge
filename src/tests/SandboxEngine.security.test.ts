/**
 * SandboxEngine.security.test.ts — Security Tests for Issue #19
 * 
 * These tests verify that the sandbox properly blocks all known escape vectors:
 * - require() and process access
 * - Constructor-based escapes
 * - Global object access
 * - Timer-based resource leaks
 * - eval() and Function() constructor
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { executeSandbox } from '../services/SandboxEngine.js';
import type { SandboxApiRegistry } from '../services/SandboxEngine.js';

describe('SandboxEngine Security Tests (Issue #19)', () => {
  // Mock API registry for tests
  const mockApi: SandboxApiRegistry = {
    testMethod: async (args: any) => ({ received: args }),
  };

  describe('Block require() access', () => {
    it('should block direct require() calls', async () => {
      const script = `const cp = require('child_process'); return cp.execSync('echo HACKED').toString();`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*require/i);
    });

    it('should block require with single quotes', async () => {
      const script = `const fs = require('fs'); return 'should not execute';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*require/i);
    });
  });

  describe('Block process access', () => {
    it('should block direct process.env access', async () => {
      const script = `return process.env.HOME;`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*process/i);
    });

    it('should block child_process references', async () => {
      const script = `const child_process = null; return 'test';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*child_process/i);
    });
  });

  describe('Block constructor-based escapes', () => {
    it('should block this.constructor.constructor pattern', async () => {
      const script = `const F = this.constructor.constructor; return new F('return process')();`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*constructor/i);
    });

    it('should block ({}).constructor.constructor pattern', async () => {
      const script = `const F = ({}).constructor.constructor; return new F('return process')();`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*constructor/i);
    });
  });

  describe('Block global object access', () => {
    it('should block global object access', async () => {
      const script = `return global.process;`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*global/i);
    });

    it('should block globalThis access', async () => {
      const script = `return globalThis.process;`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      // The validation catches 'process' first, which is fine - both are blocked
      assert.match(result.error || '', /forbidden pattern.*(globalThis|process)/i);
    });

    it('should block __dirname access', async () => {
      const script = `return __dirname;`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*__dirname/i);
    });
  });

  describe('Block eval() and Function() constructor', () => {
    it('should block eval() calls', async () => {
      const script = `return eval('2 + 2');`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*eval/i);
    });

    it('should block new Function() constructor', async () => {
      const script = `const fn = new Function('return 42'); return fn();`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*Function/i);
    });
  });

  describe('Block module system access', () => {
    it('should block import() calls', async () => {
      const script = `const mod = await import('fs'); return 'should not execute';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*import/i);
    });

    it('should block worker_threads references', async () => {
      const script = `const worker_threads = null; return 'test';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*worker_threads/i);
    });
  });

  describe('Verify safe operations work correctly', () => {
    it('should allow safe JSON operations', async () => {
      const script = `const data = { test: 'value' }; return JSON.stringify(data);`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, '{"test":"value"}');
    });

    it('should allow safe Math operations', async () => {
      const script = `return Math.max(1, 2, 3) + Math.min(4, 5, 6);`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, 7);
    });

    it('should allow safe Array operations', async () => {
      const script = `const arr = [1, 2, 3]; return arr.map(x => x * 2).filter(x => x > 2);`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      // Check array contents instead of reference equality
      assert.strictEqual(JSON.stringify(result.result), JSON.stringify([4, 6]));
    });

    it('should allow forge.api calls', async () => {
      const script = `const result = await forge.api.testMethod({ value: 42 }); return result.received.value;`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, 42);
    });

    it('should capture console.log output', async () => {
      const script = `console.log('Test message'); console.warn('Warning'); return 'done';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      assert.ok(result.logs.some(log => log.includes('Test message')));
      assert.ok(result.logs.some(log => log.includes('[WARN] Warning')));
    });

    it('should handle undefined return gracefully', async () => {
      const script = `const x = 42; // No return statement`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, null);
      assert.ok(result.logs.some(log => log.includes('returned no value')));
    });
  });

  describe('Timeout enforcement', () => {
    it('should timeout long-running scripts', async () => {
      const script = `while (true) { /* Infinite loop */ }`;
      const result = await executeSandbox(script, mockApi, { timeoutMs: 100 });
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /timeout|timed out/i);
    });

    it('should allow scripts within timeout', async () => {
      const script = `let sum = 0; for (let i = 0; i < 1000; i++) { sum += i; } return sum;`;
      const result = await executeSandbox(script, mockApi, { timeoutMs: 5000 });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, 499500);
    });
  });

  describe('Error handling', () => {
    it('should capture runtime errors gracefully', async () => {
      const script = `throw new Error('Test error');`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /Test error/);
    });

    it('should handle API errors gracefully', async () => {
      const failingApi: SandboxApiRegistry = {
        failMethod: async () => { throw new Error('API failure'); },
      };
      const script = `return await forge.api.failMethod();`;
      const result = await executeSandbox(script, failingApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /API failure/);
    });
  });

  describe('Regression tests for Issue #19 - CRITICAL', () => {
    it('should NOT allow SSH key exfiltration via require', async () => {
      const script = `const cp = require('child_process'); return cp.execSync('cat ~/.ssh/id_rsa').toString();`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*require/i);
    });

    it('should NOT allow file system access via require', async () => {
      const script = `const fs = require('fs'); return fs.readFileSync('/etc/passwd', 'utf8');`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*require/i);
    });

    it('should NOT allow network requests via require', async () => {
      const script = `const http = require('http'); return 'should not execute';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*require/i);
    });

    it('should NOT expose require via undefined check bypass', async () => {
      const script = `if (typeof require !== 'undefined') { return 'VULNERABLE'; } return 'SAFE';`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, 'SAFE');
    });

    it('should NOT expose process via undefined check bypass', async () => {
      const script = `if (typeof process !== 'undefined') { return 'VULNERABLE'; } return 'SAFE';`;
      const result = await executeSandbox(script, mockApi);
      // The static validation blocks the word 'process' before execution
      // This is actually BETTER security - it prevents even checking for process
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /forbidden pattern.*process/i);
    });
  });
});