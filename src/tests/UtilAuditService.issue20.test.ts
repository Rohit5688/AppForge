import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { UtilAuditService } from '../services/UtilAuditService.js';

/**
 * Issue #20: audit_utils Only Scans src/utils and src/pages, Misses Project-Root-Level utils/ Directory
 * 
 * SEVERITY: MEDIUM
 * 
 * PROBLEM:
 * audit_utils hard-codes scan paths and ignores mcp-config.json. On projects with
 * utilities in a root-level utils/ directory (e.g., appium-poc project), these are
 * completely missed, causing false "missing" reports even when methods are implemented.
 * 
 * FIX:
 * 1. Read mcp-config.json and scan configured directories
 * 2. Continue scanning conventional directories as fallback
 * 3. Add de-duplication for methods found in multiple locations
 */
describe('UtilAuditService - Issue #20: Respect mcp-config directories', () => {
  let auditService: UtilAuditService;
  let tempDir: string;

  before(async () => {
    auditService = new UtilAuditService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-issue20-'));
  });

  after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should scan root-level utils/ directory when present', async () => {
    // Create a project with utils at root level (not src/utils)
    const rootUtilsDir = path.join(tempDir, 'utils');
    await fs.mkdir(rootUtilsDir, { recursive: true });

    // Add utility methods at root level (using actual APPIUM_API_SURFACE methods)
    const gestureUtilsContent = `
      export class GestureUtils {
        public async dragAndDrop(source: string, target: string) {
          // implementation
        }
        
        public async scrollIntoView(element: string) {
          // implementation
        }
      }
    `;
    await fs.writeFile(path.join(rootUtilsDir, 'GestureUtils.ts'), gestureUtilsContent);

    const assertUtilsContent = `
      export class AssertionUtils {
        static async assertScreenshot(name: string) {
          // implementation
        }
      }
    `;
    await fs.writeFile(path.join(rootUtilsDir, 'AssertionUtils.ts'), assertUtilsContent);

    // Create basic mcp-config.json
    const config = {
      version: "1.0.0",
      directories: {
        features: "features",
        stepDefinitions: "step-definitions",
        pages: "pages"
      }
    };
    await fs.writeFile(path.join(tempDir, 'mcp-config.json'), JSON.stringify(config, null, 2));

    const result = await auditService.audit(tempDir);

    // These methods should be found in the root-level utils/
    assert.ok(result.present.includes('dragAndDrop'), 'Should find dragAndDrop in root-level utils/');
    assert.ok(result.present.includes('scrollIntoView'), 'Should find scrollIntoView in root-level utils/');
    assert.ok(result.present.includes('assertScreenshot'), 'Should find assertScreenshot in root-level utils/');
    
    // Coverage should reflect these found methods
    assert.ok(result.coveragePercent > 0, 'Coverage should be > 0 when methods are found');
  });

  test('should scan custom directories from mcp-config.json', async () => {
    // Create a project with custom directory structure (flat, not nested)
    const customHelpersDir = path.join(tempDir, 'test-helpers');
    await fs.mkdir(customHelpersDir, { recursive: true });

    const customUtilsContent = `
      export class MobileHelpers {
        async dragAndDrop(source: string, target: string) {}
        async scrollIntoView(selector: string) {}
        async handleOTP() {}
      }
    `;
    await fs.writeFile(path.join(customHelpersDir, 'MobileHelpers.ts'), customUtilsContent);

    // Configure custom directories in mcp-config.json
    const config = {
      version: "1.0.0",
      project: {
        language: "typescript",
        testFramework: "cucumber",
        client: "webdriverio"
      },
      mobile: {
        defaultPlatform: "android",
        capabilitiesProfiles: {}
      },
      paths: {
        featuresRoot: "specs/features",
        stepsRoot: "specs/steps",
        pagesRoot: "specs/pages",
        testDataRoot: "test-helpers"  // Custom utils location
      }
    };
    await fs.writeFile(path.join(tempDir, 'mcp-config.json'), JSON.stringify(config, null, 2));

    const result = await auditService.audit(tempDir);

    // Methods should be found in the custom test-helpers directory
    assert.ok(result.present.includes('dragAndDrop'), 'Should find dragAndDrop in custom directory');
    assert.ok(result.present.includes('scrollIntoView'), 'Should find scrollIntoView in custom directory');
    assert.ok(result.present.includes('handleOTP'), 'Should find handleOTP in custom directory');
  });

  test('should de-duplicate methods found in multiple directories', async () => {
    // Create same method in multiple locations
    const srcUtilsDir = path.join(tempDir, 'src', 'utils');
    const rootUtilsDir = path.join(tempDir, 'utils');
    await fs.mkdir(srcUtilsDir, { recursive: true });
    await fs.mkdir(rootUtilsDir, { recursive: true });

    const utilContent = `
      export class Utils {
        async dragAndDrop(source: string, target: string) {}
      }
    `;

    // Same method in both locations
    await fs.writeFile(path.join(srcUtilsDir, 'Utils1.ts'), utilContent);
    await fs.writeFile(path.join(rootUtilsDir, 'Utils2.ts'), utilContent);

    const config = {
      version: "1.0.0",
      directories: {
        features: "features",
        stepDefinitions: "step-definitions",
        pages: "pages"
      }
    };
    await fs.writeFile(path.join(tempDir, 'mcp-config.json'), JSON.stringify(config, null, 2));

    const result = await auditService.audit(tempDir);

    // dragAndDrop should appear exactly once in the present array (de-duplicated)
    const swipeCount = result.present.filter(m => m === 'dragAndDrop').length;
    assert.equal(swipeCount, 1, 'Method found in multiple directories should only be counted once');
  });

  test('should scan both configured and conventional directories', async () => {
    // Create utils in both standard and custom locations
    const srcUtilsDir = path.join(tempDir, 'src', 'utils');
    const customUtilsDir = path.join(tempDir, 'custom-helpers');
    await fs.mkdir(srcUtilsDir, { recursive: true });
    await fs.mkdir(customUtilsDir, { recursive: true });

    // Method in standard location
    await fs.writeFile(path.join(srcUtilsDir, 'Standard.ts'), `
      export function handleOTP() {}
    `);

    // Method in custom location
    await fs.writeFile(path.join(customUtilsDir, 'Custom.ts'), `
      export function dragAndDrop(source: string, target: string) {}
    `);

    // Config only mentions custom location
    const config = {
      version: "1.0.0",
      directories: {
        features: "features",
        stepDefinitions: "step-definitions",
        pages: "pages",
        testData: "custom-helpers"
      }
    };
    await fs.writeFile(path.join(tempDir, 'mcp-config.json'), JSON.stringify(config, null, 2));

    const result = await auditService.audit(tempDir);

    // Should find methods in both locations
    assert.ok(result.present.includes('handleOTP'), 'Should find method in standard src/utils/');
    assert.ok(result.present.includes('dragAndDrop'), 'Should find method in custom configured directory');
  });

  test('should handle projects without mcp-config.json gracefully', async () => {
    // Create a fresh temp dir without config
    const noConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-noconfig-'));
    
    try {
      const utilsDir = path.join(noConfigDir, 'utils');
      await fs.mkdir(utilsDir, { recursive: true });

      await fs.writeFile(path.join(utilsDir, 'Utils.ts'), `
        export function handleOTP() {}
      `);

      // Should still work without config (fallback to conventions)
      const result = await auditService.audit(noConfigDir);
      
      assert.ok(result.present.includes('handleOTP'), 'Should find methods even without mcp-config.json');
    } finally {
      await fs.rm(noConfigDir, { recursive: true, force: true });
    }
  });
});