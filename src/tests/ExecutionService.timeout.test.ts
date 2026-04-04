import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionService } from '../services/ExecutionService.js';
import * as path from 'path';
import * as fs from 'fs';

describe('ExecutionService - Timeout Resolution', () => {
  let executionService: ExecutionService;
  let testProjectRoot: string;

  function setupTest() {
    executionService = new ExecutionService();
    testProjectRoot = path.join(process.cwd(), 'test-proj-' + Date.now());
    if (!fs.existsSync(testProjectRoot)) {
      fs.mkdirSync(testProjectRoot, { recursive: true });
    }
    // Create minimal wdio.conf.ts
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

  describe('Timeout Priority Resolution', () => {
    it('should use explicit timeout when provided', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, {
          timeoutMs: 60000 // 1 minute
        });

        // Check that timeout info is in output
        assert.ok(result.output.includes('source: explicit'), 
          'Output should show explicit timeout source');
        assert.ok(result.output.includes('60000ms'), 
          'Output should show 60000ms timeout');
      } finally {
        cleanupTest();
      }
    });

    it('should cap timeout at 2 hours maximum', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, {
          timeoutMs: 10000000 // Much higher than cap
        });

        assert.ok(result.output.includes('7200000ms'), 
          'Timeout should be capped at 7200000ms (2 hours)');
      } finally {
        cleanupTest();
      }
    });

    it('should reject invalid timeout values (negative)', async () => {
      setupTest();
      try {
        await assert.rejects(
          async () => {
            await executionService['runTest'](testProjectRoot, {
              timeoutMs: -5000
            });
          },
          (err: Error) => {
            return err.message.includes('Invalid timeoutMs');
          },
          'Should reject negative timeout'
        );
      } finally {
        cleanupTest();
      }
    });

    it('should reject invalid timeout values (zero)', async () => {
      setupTest();
      try {
        await assert.rejects(
          async () => {
            await executionService['runTest'](testProjectRoot, {
              timeoutMs: 0
            });
          },
          (err: Error) => {
            return err.message.includes('Invalid timeoutMs');
          },
          'Should reject zero timeout'
        );
      } finally {
        cleanupTest();
      }
    });

    it('should use mcp-config timeout when no explicit timeout provided', async () => {
      setupTest();
      try {
        // Create mcp-config.json with timeout
        const mcpConfig = {
          version: '1.0.0',
          project: {
            language: 'typescript',
            client: 'webdriverio-appium',
            executionCommand: 'npx wdio run wdio.conf.ts'
          },
          execution: {
            timeoutMs: 120000 // 2 minutes
          },
          mobile: {
            defaultPlatform: 'Android'
          }
        };
        fs.writeFileSync(
          path.join(testProjectRoot, 'mcp-config.json'),
          JSON.stringify(mcpConfig, null, 2)
        );

        const result = await executionService['runTest'](testProjectRoot);

        assert.ok(result.output.includes('source: mcp-config'), 
          'Output should show mcp-config timeout source');
        assert.ok(result.output.includes('120000ms'), 
          'Output should show 120000ms timeout from config');
      } finally {
        cleanupTest();
      }
    });

    it('should detect cucumberOpts.timeout from wdio.conf.ts', async () => {
      setupTest();
      try {
        // Overwrite the minimal wdio.conf.ts with one that has cucumberOpts.timeout
        const wdioConfig = `
export const config = {
  runner: 'local',
  framework: 'cucumber',
  cucumberOpts: {
    require: ['./src/step-definitions/**/*.ts'],
    timeout: 180000,
  },
  waitforTimeout: 10000,
};
`;
        fs.writeFileSync(
          path.join(testProjectRoot, 'wdio.conf.ts'),
          wdioConfig
        );

        const result = await executionService['runTest'](testProjectRoot);

        assert.ok(result.output.includes('source: detected(wdio.conf)'),
          'Output should show detected(wdio.conf) timeout source');
        assert.ok(result.output.includes('180000ms'),
          'Output should show 180000ms timeout from wdio.conf cucumberOpts');
      } finally {
        cleanupTest();
      }
    });

    it('should fall back to default timeout (30 min) when nothing configured', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot);

        assert.ok(result.output.includes('source: default'), 
          'Output should show default timeout source');
        assert.ok(result.output.includes('1800000ms'), 
          'Output should show 1800000ms (30 min) default timeout');
      } finally {
        cleanupTest();
      }
    });

    it('should prioritize explicit over mcp-config', async () => {
      setupTest();
      try {
        // Create mcp-config with timeout
        const mcpConfig = {
          version: '1.0.0',
          project: {
            language: 'typescript',
            client: 'webdriverio-appium',
            executionCommand: 'npx wdio run wdio.conf.ts'
          },
          execution: {
            timeoutMs: 120000
          },
          mobile: {
            defaultPlatform: 'Android'
          }
        };
        fs.writeFileSync(
          path.join(testProjectRoot, 'mcp-config.json'),
          JSON.stringify(mcpConfig, null, 2)
        );

        // Pass explicit timeout that should override config
        const result = await executionService['runTest'](testProjectRoot, {
          timeoutMs: 90000
        });

        assert.ok(result.output.includes('source: explicit'), 
          'Explicit timeout should take priority over config');
        assert.ok(result.output.includes('90000ms'), 
          'Output should show explicit 90000ms, not config 120000ms');
      } finally {
        cleanupTest();
      }
    });

    it('should prioritize mcp-config over detected wdio.conf timeout', async () => {
      setupTest();
      try {
        // Create mcp-config with its own timeout
        const mcpConfig = {
          version: '1.0.0',
          project: {
            language: 'typescript',
            client: 'webdriverio-appium',
            executionCommand: 'npx wdio run wdio.conf.ts'
          },
          execution: {
            timeoutMs: 120000
          },
          mobile: {
            defaultPlatform: 'Android'
          }
        };
        fs.writeFileSync(
          path.join(testProjectRoot, 'mcp-config.json'),
          JSON.stringify(mcpConfig, null, 2)
        );

        // Overwrite wdio.conf.ts with a different timeout
        const wdioConfig = `
export const config = {
  runner: 'local',
  framework: 'cucumber',
  cucumberOpts: {
    timeout: 180000,
  },
};
`;
        fs.writeFileSync(
          path.join(testProjectRoot, 'wdio.conf.ts'),
          wdioConfig
        );

        const result = await executionService['runTest'](testProjectRoot);

        assert.ok(result.output.includes('source: mcp-config'),
          'mcp-config timeout should take priority over detected wdio.conf timeout');
        assert.ok(result.output.includes('120000ms'),
          'Output should show mcp-config timeout, not wdio.conf timeout');
      } finally {
        cleanupTest();
      }
    });

    it('should detect waitforTimeout from wdio.conf.js', async () => {
      setupTest();
      try {
        // Use .js variant with only waitforTimeout (no cucumberOpts.timeout)
        const wdioConfig = `
module.exports = {
  runner: 'local',
  framework: 'cucumber',
  waitforTimeout: 90000,
};
`;
        fs.writeFileSync(
          path.join(testProjectRoot, 'wdio.conf.js'),
          wdioConfig
        );

        const result = await executionService['runTest'](testProjectRoot);

        assert.ok(result.output.includes('source: detected(wdio.conf)'),
          'Should detect timeout from waitforTimeout in wdio.conf.js');
        assert.ok(result.output.includes('90000ms'),
          'Output should show 90000ms from waitforTimeout');
      } finally {
        cleanupTest();
      }
    });
  });

  describe('Timeout Output Logging', () => {
    it('should include timeout info in output with correct format', async () => {
      setupTest();
      try {
        const result = await executionService['runTest'](testProjectRoot, {
          timeoutMs: 60000
        });

        // Check format: [Timeout: 60000ms (source: explicit)]
        assert.ok(result.output.includes('[Timeout:'), 
          'Output should include [Timeout: prefix');
        assert.ok(result.output.includes('(source:'), 
          'Output should include (source: indicator');
        assert.ok(result.output.includes(')]'), 
          'Output should close with )]');
      } finally {
        cleanupTest();
      }
    });
  });

  describe('Integration with Test Execution', () => {
    it('should pass timeout to child process execution', async () => {
      setupTest();
      try {
        // This test verifies the timeout is actually applied
        // The execution will likely fail due to missing test files,
        // but we're testing that the timeout parameter is processed correctly
        const result = await executionService['runTest'](testProjectRoot, {
          timeoutMs: 5000 // Very short timeout for testing
        });

        // Even if test fails, timeout should be logged
        assert.ok(result.output.includes('5000ms'), 
          'Short timeout should be applied to execution');
      } finally {
        cleanupTest();
      }
    });
  });
});