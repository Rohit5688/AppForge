import { test, describe, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { UtilAuditService } from '../services/UtilAuditService.js';

describe('UtilAuditService (AppForge Unit Tests)', () => {
  let auditService: UtilAuditService;
  let tempDir: string;
  let stepsDir: string;
  let utilsDir: string;

  before(async () => {
    auditService = new UtilAuditService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-audit-'));
    stepsDir = path.join(tempDir, 'step-definitions');
    utilsDir = path.join(tempDir, 'utils');
    await fs.mkdir(stepsDir, { recursive: true });
    await fs.mkdir(utilsDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, 'mcp-config.json'), JSON.stringify({ version: "1.0.0" }));
  });

  test('should detect missing native Appium usages without a wrapper', async () => {
    // Normal steps checking native Appium methods
    const stepFile = `
      import { Then } from '@cucumber/cucumber';
      
      Then('I drag and drop', async () => {
        // missing wrapper, native appium usage instead
        const el = await driver.$('~submit');
        await el.dragAndDrop(driver.$('~target'));
      });
    `;
    const stepFilePath = path.join(stepsDir, 'sample-steps.ts');
    await fs.writeFile(stepFilePath, stepFile);

    const result = await auditService.audit(tempDir);
    
    // Cleanup
    await fs.unlink(stepFilePath);

    assert.equal(result.missing.length, 4, 'Should detect 4 missing Appium surface handlers when starting from scratch');
    assert.ok(result.actionableSuggestions.some(s => s.includes('dragAndDrop')), 'Should suggest building dragAndDrop util');
  });

  test('customWrapperPackage (BUG-12) should ignore wrapper functions acting natively', async () => {
    const stepFile = `
      import { Then } from '@cucumber/cucumber';
      import { dragAndDrop, scrollIntoView, assertScreenshot, handleOTP } from '@company/appium-helpers';
      
      Then('I do something', async () => {
        await dragAndDrop('~submit', '~target');
        await scrollIntoView('~target');
        await assertScreenshot('name');
        await handleOTP();
      });
    `;
    const stepFilePath = path.join(stepsDir, 'custom-wrapper-step.ts');
    await fs.writeFile(stepFilePath, stepFile);

    const helperPkgDir = path.join(tempDir, 'node_modules', '@company', 'appium-helpers');
    await fs.mkdir(helperPkgDir, { recursive: true });
    
    await fs.writeFile(path.join(helperPkgDir, 'index.js'), `
      export function dragAndDrop(source, target) {}
      export function scrollIntoView(selector) {}
      export function assertScreenshot(name) {}
      export function handleOTP() {}
    `);

    const result = await auditService.audit(tempDir, '@company/appium-helpers');
    
    // Cleanup
    await fs.unlink(stepFilePath);

    assert.equal(result.missing.length, 0, 'Should have 0 missing since all 4 are covered by wrapper');
  });
});
