import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { CredentialService } from '../services/CredentialService.js';
import { McpConfigService } from '../services/McpConfigService.js';

describe('CredentialService - manage_users (Issue #14 Fix)', () => {
  const testProjectRoot = path.join(process.cwd(), 'test-proj-manage-users-' + Date.now());
  const credentialService = new CredentialService();
  const configService = new McpConfigService();

  beforeEach(() => {
    // Create test project directory
    if (!fs.existsSync(testProjectRoot)) {
      fs.mkdirSync(testProjectRoot, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test project
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  it('should use default src/test-data directory when no config exists', async () => {
    // No mcp-config.json exists
    const result = await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'staging',
      [{ username: 'admin@test.com', password: 'secret123', role: 'admin' }]
    );

    assert.ok(result.includes('src/test-data/users.staging.json'));
    
    const userFile = path.join(testProjectRoot, 'src/test-data', 'users.staging.json');
    assert.ok(fs.existsSync(userFile), 'Users file should be created in src/test-data/');
    
    const users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0].username, 'admin@test.com');
  });

  it('should respect testDataRoot from mcp-config.json', async () => {
    // Create mcp-config.json with custom testDataRoot
    const config = {
      project: {
        language: 'typescript',
        testFramework: 'cucumber',
        client: 'webdriverio-appium'
      },
      mobile: {
        defaultPlatform: 'android',
        capabilitiesProfiles: {
          pixel: {
            platformName: 'Android',
            'appium:deviceName': 'Pixel_6'
          }
        }
      },
      paths: {
        testDataRoot: 'custom-test-data'
      }
    };

    fs.writeFileSync(
      path.join(testProjectRoot, 'mcp-config.json'),
      JSON.stringify(config, null, 2)
    );

    const result = await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'prod',
      [
        { username: 'user1@test.com', password: 'pass1', role: 'user' },
        { username: 'user2@test.com', password: 'pass2', role: 'admin' }
      ]
    );

    // The result message includes the full absolute path
    assert.ok(result.includes('users.prod.json'), 'Result should mention the users file');
    assert.ok(result.includes('prod'), 'Result should mention the environment');
    
    const userFile = path.join(testProjectRoot, 'custom-test-data', 'users.prod.json');
    assert.ok(fs.existsSync(userFile), 'Users file should be in custom-test-data/');
    
    const users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    assert.strictEqual(users.length, 2);
  });

  it('should read users from correct directory based on config', async () => {
    // Setup config
    const config = {
      project: {
        language: 'typescript',
        testFramework: 'cucumber',
        client: 'webdriverio-appium'
      },
      mobile: {
        defaultPlatform: 'android',
        capabilitiesProfiles: {
          pixel: { platformName: 'Android' }
        }
      },
      paths: {
        testDataRoot: 'data/users'
      }
    };

    fs.writeFileSync(
      path.join(testProjectRoot, 'mcp-config.json'),
      JSON.stringify(config, null, 2)
    );

    // Write users first
    await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'staging',
      [{ username: 'test@example.com', password: 'testpass', role: 'tester' }]
    );

    // Read them back
    const result = await credentialService.manageUsers(
      testProjectRoot,
      'read',
      'staging'
    );

    const users = JSON.parse(result);
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0].username, 'test@example.com');
    assert.strictEqual(users[0].role, 'tester');
  });

  it('should generate getUser helper with correct relative path', async () => {
    // Setup config with custom path
    const config = {
      project: {
        language: 'typescript',
        testFramework: 'cucumber',
        client: 'webdriverio-appium'
      },
      mobile: {
        defaultPlatform: 'android',
        capabilitiesProfiles: {
          pixel: { platformName: 'Android' }
        }
      },
      paths: {
        testDataRoot: 'src/test-data'
      }
    };

    fs.writeFileSync(
      path.join(testProjectRoot, 'mcp-config.json'),
      JSON.stringify(config, null, 2)
    );

    await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'staging',
      [{ username: 'helper@test.com', password: 'helperpass' }]
    );

    const helperFile = path.join(testProjectRoot, 'utils', 'getUser.ts');
    assert.ok(fs.existsSync(helperFile), 'Helper file should be generated');

    const helperContent = fs.readFileSync(helperFile, 'utf8');
    
    // Should contain the correct relative path from utils/ to src/test-data/
    assert.ok(helperContent.includes('../src/test-data'), 'Helper should have correct relative path');
    assert.ok(helperContent.includes('export function getUser'), 'Helper should export getUser function');
  });

  it('should NOT create phantom test-data/ directory at project root', async () => {
    // Setup config pointing to src/test-data
    const config = {
      project: {
        language: 'typescript',
        testFramework: 'cucumber',
        client: 'webdriverio-appium'
      },
      mobile: {
        defaultPlatform: 'android',
        capabilitiesProfiles: {
          pixel: { platformName: 'Android' }
        }
      },
      paths: {
        testDataRoot: 'src/test-data'
      }
    };

    fs.writeFileSync(
      path.join(testProjectRoot, 'mcp-config.json'),
      JSON.stringify(config, null, 2)
    );

    await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'staging',
      [{ username: 'test@example.com', password: 'test123' }]
    );

    // The BUG was that it created test-data/ at root instead of using src/test-data/
    const phantomDir = path.join(testProjectRoot, 'test-data');
    assert.ok(!fs.existsSync(phantomDir), 'Should NOT create phantom test-data/ directory at root');

    // Verify it was created in the correct location
    const correctDir = path.join(testProjectRoot, 'src/test-data');
    assert.ok(fs.existsSync(correctDir), 'Should create directory at configured path');
  });

  it('should handle multiple environments correctly', async () => {
    const config = {
      project: {
        language: 'typescript',
        testFramework: 'cucumber',
        client: 'webdriverio-appium'
      },
      mobile: {
        defaultPlatform: 'android',
        capabilitiesProfiles: { pixel: { platformName: 'Android' } }
      },
      paths: {
        testDataRoot: 'src/test-data'
      }
    };

    fs.writeFileSync(
      path.join(testProjectRoot, 'mcp-config.json'),
      JSON.stringify(config, null, 2)
    );

    // Write staging users
    await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'staging',
      [{ username: 'staging@test.com', password: 'staging123', role: 'admin' }]
    );

    // Write prod users
    await credentialService.manageUsers(
      testProjectRoot,
      'write',
      'prod',
      [{ username: 'prod@test.com', password: 'prod456', role: 'readonly' }]
    );

    // Verify both files exist in correct location
    const stagingFile = path.join(testProjectRoot, 'src/test-data', 'users.staging.json');
    const prodFile = path.join(testProjectRoot, 'src/test-data', 'users.prod.json');

    assert.ok(fs.existsSync(stagingFile));
    assert.ok(fs.existsSync(prodFile));

    const stagingUsers = JSON.parse(fs.readFileSync(stagingFile, 'utf8'));
    const prodUsers = JSON.parse(fs.readFileSync(prodFile, 'utf8'));

    assert.strictEqual(stagingUsers[0].username, 'staging@test.com');
    assert.strictEqual(prodUsers[0].username, 'prod@test.com');
  });

  it('should return error message when reading non-existent users file', async () => {
    const result = await credentialService.manageUsers(
      testProjectRoot,
      'read',
      'nonexistent'
    );

    const parsed = JSON.parse(result);
    assert.ok(parsed.error, 'Should return an error object');
    assert.ok(parsed.error.includes('No users file found'));
    assert.ok(parsed.path, 'Should include the path it tried to read');
  });
});