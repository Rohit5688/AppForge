import { test, describe, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { CodebaseAnalyzerService } from '../services/CodebaseAnalyzerService.js';

describe('CodebaseAnalyzerService (AppForge Unit Tests)', () => {
  let analyzerService: CodebaseAnalyzerService;
  let tempDir: string;
  let pagesDir: string;
  let stepsDir: string;

  before(async () => {
    analyzerService = new CodebaseAnalyzerService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appforge-analyzer-'));
    pagesDir = path.join(tempDir, 'pages');
    stepsDir = path.join(tempDir, 'step-definitions');
    await fs.mkdir(pagesDir, { recursive: true });
    await fs.mkdir(stepsDir, { recursive: true });
  });

  test('should analyze standard Appium Page Object Models', async () => {
    const pagePom = `
      export class NativeAuthPage {
        public async login() { return; }
        private async helper() { return; }
      }
    `;
    const pagePath = path.join(pagesDir, 'NativeAuthPage.ts');
    await fs.writeFile(pagePath, pagePom);

    // Mock paths object expected by AppForge
    const paths = { pagesRoot: 'pages', stepsRoot: 'step-definitions', utilsRoot: 'utils' };
    const result = await analyzerService.analyze(tempDir, paths);
    
    // Cleanup
    await fs.unlink(pagePath);

    const authPage = result.existingPageObjects.find(p => p.className === 'NativeAuthPage');
    assert.ok(authPage, 'NativeAuthPage should be detected');
    assert.deepEqual(authPage?.publicMethods, ['login'], 'Should only extract public methods');
  });

  test('should detect Page Registries in Appium apps (BUG-04 Extracted Feature)', async () => {
    const registryPom = `
      import { ProfilePage } from './ProfilePage';
      import { SettingsPage } from './SettingsPage';
      
      export class MobileAppManager {
        public profilePage = new ProfilePage();
        public settingsPage = new SettingsPage();
      }
    `;
    const registryPath = path.join(pagesDir, 'MobileAppManager.ts');
    await fs.writeFile(registryPath, registryPom);

    const paths = { pagesRoot: 'pages', stepsRoot: 'step-definitions', utilsRoot: 'utils' };
    const result = await analyzerService.analyze(tempDir, paths);
    
    // Cleanup
    await fs.unlink(registryPath);

    assert.equal(result.pageRegistries?.length, 1, 'Should detect 1 page registry');
    const registry = result.pageRegistries![0];
    assert.equal(registry?.className, 'MobileAppManager');
    const pageClasses = registry?.pages.map(p => p.pageClass) || [];
    assert.ok(pageClasses.includes('ProfilePage'), 'Should detect ProfilePage instantiation');
    assert.ok(pageClasses.includes('SettingsPage'), 'Should detect SettingsPage instantiation');
  });
});
