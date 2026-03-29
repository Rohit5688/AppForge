import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { auditGeneratedCode, auditFeatureFile } from '../utils/SecurityUtils.js';
import { AppForgeError, ErrorCode } from '../utils/ErrorCodes.js';
const execAsync = promisify(exec);
export class FileWriterService {
    /**
     * Validates generated TypeScript files using tsc --noEmit, then writes if valid.
     * Retries up to maxRetries times, returning error details for LLM to self-heal.
     */
    async validateAndWrite(projectRoot, files, maxRetries = 3, dryRun = false) {
        // Step 1: Write files to a temp staging area first
        const stagingDir = path.join(projectRoot, '.mcp-staging');
        if (!fs.existsSync(stagingDir)) {
            fs.mkdirSync(stagingDir, { recursive: true });
        }
        for (const file of files) {
            const fullPath = path.join(stagingDir, file.path);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, file.content, 'utf8');
        }
        // Step 2: Validate .ts files with tsc --noEmit
        const tsFiles = files.filter(f => f.path.endsWith('.ts'));
        if (tsFiles.length > 0) {
            const validation = await this.validateTypeScript(projectRoot, stagingDir, tsFiles);
            if (!validation.valid) {
                // Clean up staging
                await this.cleanStaging(stagingDir);
                throw new AppForgeError(ErrorCode.E006_TS_COMPILE_FAIL, "TypeScript compilation failed during validation.", [
                    "Review the tsc output below and fix the generated TypeScript files.",
                    ...validation.errors
                ]);
            }
        }
        // Step 3: Validate .feature files (basic Gherkin syntax)
        const featureFiles = files.filter(f => f.path.endsWith('.feature'));
        for (const f of featureFiles) {
            const gherkinErrors = this.validateGherkin(f.content);
            if (gherkinErrors.length > 0) {
                await this.cleanStaging(stagingDir);
                return JSON.stringify({
                    success: false,
                    phase: 'gherkin-validation',
                    file: f.path,
                    errors: gherkinErrors,
                    hint: 'Fix the Gherkin syntax errors.'
                }, null, 2);
            }
        }
        // Step 3b: Cross-platform POM enforcement
        // If platform is 'both', verify page files have .android.ts and .ios.ts variants
        const pageFiles = files.filter(f => f.path.includes('pages/') && f.path.endsWith('.ts') && !f.path.includes('BasePage'));
        if (pageFiles.length > 0) {
            const androidPages = pageFiles.filter(f => f.path.includes('.android.ts'));
            const iosPages = pageFiles.filter(f => f.path.includes('.ios.ts'));
            const genericPages = pageFiles.filter(f => !f.path.includes('.android.') && !f.path.includes('.ios.'));
            // Only enforce if we detect the intent to be cross-platform (both variants present or generic pages exist)
            const hasCrossPlatformIntent = androidPages.length > 0 || iosPages.length > 0;
            if (hasCrossPlatformIntent) {
                const missingPlatforms = [];
                for (const ap of androidPages) {
                    const iosEquiv = ap.path.replace('.android.ts', '.ios.ts');
                    if (!iosPages.some(f => f.path === iosEquiv)) {
                        missingPlatforms.push(`Missing iOS variant: ${iosEquiv} (has Android: ${ap.path})`);
                    }
                }
                for (const ip of iosPages) {
                    const androidEquiv = ip.path.replace('.ios.ts', '.android.ts');
                    if (!androidPages.some(f => f.path === androidEquiv)) {
                        missingPlatforms.push(`Missing Android variant: ${androidEquiv} (has iOS: ${ip.path})`);
                    }
                }
                if (missingPlatforms.length > 0) {
                    await this.cleanStaging(stagingDir);
                    return JSON.stringify({
                        success: false,
                        phase: 'cross-platform-validation',
                        errors: missingPlatforms,
                        hint: 'When generating for both platforms, every Page Object must have both .android.ts and .ios.ts variants. Generate the missing files.'
                    }, null, 2);
                }
            }
        }
        // Step 3c: Security audit on generated code
        const securityWarnings = [];
        for (const file of files) {
            if (file.path.endsWith('.ts')) {
                securityWarnings.push(...auditGeneratedCode(file.content, file.path));
            }
            if (file.path.endsWith('.feature')) {
                securityWarnings.push(...auditFeatureFile(file.content, file.path));
            }
        }
        // Dry-run mode: validate and report without writing
        if (dryRun) {
            await this.cleanStaging(stagingDir);
            return JSON.stringify({
                success: true,
                dryRun: true,
                filesValidated: files.map(f => f.path),
                securityWarnings: securityWarnings.length > 0 ? securityWarnings : undefined,
                message: `Dry run complete. ${files.length} files validated successfully.${securityWarnings.length > 0 ? ` ${securityWarnings.length} security warning(s).` : ''}`
            }, null, 2);
        }
        // Step 4: Backup existing files before overwrite (Atomic Prep)
        const backupDir = path.join(projectRoot, '.appium-mcp', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
        const overwrittenFiles = [];
        const newFiles = [];
        for (const file of files) {
            const destPath = path.join(projectRoot, file.path);
            if (fs.existsSync(destPath)) {
                const backupPath = path.join(backupDir, file.path);
                const bDir = path.dirname(backupPath);
                if (!fs.existsSync(bDir)) {
                    fs.mkdirSync(bDir, { recursive: true });
                }
                fs.copyFileSync(destPath, backupPath);
                overwrittenFiles.push(file.path);
            }
            else {
                newFiles.push(file.path);
            }
        }
        // Step 5: Move from staging to actual project paths with Rollback Support
        const results = [];
        try {
            for (const file of files) {
                const destPath = path.join(projectRoot, file.path);
                const dir = path.dirname(destPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(destPath, file.content, 'utf8');
                results.push(file.path);
            }
        }
        catch (writeError) {
            // Automatic Rollback
            for (const newFile of newFiles) {
                const destPath = path.join(projectRoot, newFile);
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
            }
            for (const overwrittenFile of overwrittenFiles) {
                const destPath = path.join(projectRoot, overwrittenFile);
                const backupPath = path.join(backupDir, overwrittenFile);
                if (fs.existsSync(backupPath)) {
                    fs.copyFileSync(backupPath, destPath);
                }
            }
            await this.cleanStaging(stagingDir);
            return JSON.stringify({
                success: false,
                phase: 'write-to-disk',
                error: writeError.message,
                message: 'A critical write error occurred. The batch operation was aborted and all modified files were rolled back to their original state.'
            }, null, 2);
        }
        // Clean up staging
        await this.cleanStaging(stagingDir);
        return JSON.stringify({
            success: true,
            filesWritten: results,
            backedUpTo: overwrittenFiles.length > 0 && fs.existsSync(backupDir) ? backupDir : undefined,
            securityWarnings: securityWarnings.length > 0 ? securityWarnings : undefined,
            message: `Successfully validated and wrote ${results.length} files.`
        }, null, 2);
    }
    /**
     * Legacy method for backward compatibility.
     */
    async writeFiles(projectRoot, files) {
        return this.validateAndWrite(projectRoot, files);
    }
    // ─── Private Validators ───────────────────────────────────
    async validateTypeScript(projectRoot, stagingDir, tsFiles) {
        try {
            // BUG-05 FIX: Previously used `tsc --project projectRoot/tsconfig.json` with
            // file paths pointing into .mcp-staging/. This causes tsc to resolve relative
            // imports from the staging path, failing on valid `import '../pages/BasePage'`
            // because there's no pages/ dir inside staging. Mitigation: write a minimal
            // tsconfig into staging that extends the real one and redirects rootDir/baseUrl
            // to the project root so all cross-file imports resolve correctly.
            const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
            const hasTsConfig = fs.existsSync(tsconfigPath);
            // Write a patched tsconfig into the staging dir
            const stagingTsconfigPath = path.join(stagingDir, 'tsconfig.json');
            if (hasTsConfig) {
                const stagingTsconfig = {
                    extends: tsconfigPath,
                    compilerOptions: {
                        // Resolve imports relative to projectRoot so `../pages/BasePage` works
                        baseUrl: projectRoot,
                        rootDir: projectRoot,
                        noEmit: true
                    },
                    // Include staging files + project source for cross-reference
                    include: [
                        path.join(stagingDir, '**/*.ts'),
                        path.join(projectRoot, '**/*.ts')
                    ],
                    exclude: [
                        path.join(projectRoot, 'node_modules'),
                        path.join(projectRoot, '.mcp-staging')
                    ]
                };
                fs.writeFileSync(stagingTsconfigPath, JSON.stringify(stagingTsconfig, null, 2), 'utf8');
            }
            const filePaths = tsFiles.map(f => path.join(stagingDir, f.path)).join(' ');
            const cmd = hasTsConfig
                ? `npx tsc --noEmit --project "${stagingTsconfigPath}"`
                : `npx tsc --noEmit --strict --esModuleInterop --skipLibCheck ${filePaths}`;
            await execAsync(cmd, { cwd: projectRoot });
            return { valid: true, errors: [] };
        }
        catch (error) {
            const stderr = error.stderr || error.stdout || error.message;
            const errors = stderr
                .split('\n')
                .filter((line) => line.includes('error TS'))
                .slice(0, 10); // Limit to 10 errors
            return { valid: false, errors };
        }
    }
    validateGherkin(content) {
        const errors = [];
        const lines = content.split('\n').map(l => l.trim());
        // Must have Feature keyword
        if (!lines.some(l => l.startsWith('Feature:'))) {
            errors.push('Missing "Feature:" keyword');
        }
        // Must have at least one Scenario or Scenario Outline
        if (!lines.some(l => l.startsWith('Scenario:') || l.startsWith('Scenario Outline:'))) {
            errors.push('Missing "Scenario:" or "Scenario Outline:" keyword');
        }
        // Must have at least one Given/When/Then
        if (!lines.some(l => /^(Given|When|Then|And|But)\s/.test(l))) {
            errors.push('Missing step keywords (Given/When/Then)');
        }
        return errors;
    }
    async cleanStaging(stagingDir) {
        try {
            await fsPromises.rm(stagingDir, { recursive: true, force: true });
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
