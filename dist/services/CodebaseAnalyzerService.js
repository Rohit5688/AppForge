import path from 'path';
import { Project, SyntaxKind, Node } from 'ts-morph';
import fs from 'fs/promises';
export class CodebaseAnalyzerService {
    // ──────────────────────────────────────────────────────────────────────────
    // Wave 1.1 — Lightweight summary mode (no file content dumped)
    // ──────────────────────────────────────────────────────────────────────────
    /**
     * Returns compact structural metadata for the whole project.
     * Safe for large codebases — never dumps file contents.
     * Output: file tree, line counts, exported names, import graph.
     */
    async analyzeSummary(projectRoot) {
        const warnings = [];
        const tsFiles = await this.listFilesWithExtensions(projectRoot, ['.ts']);
        const fileSummaries = [];
        const dependencyEdges = [];
        const project = new Project({
            compilerOptions: { strict: false },
            skipAddingFilesFromTsConfig: true,
        });
        let totalLines = 0;
        for (const f of tsFiles) {
            if (f.includes('node_modules') || f.includes('dist') || f.endsWith('.d.ts'))
                continue;
            project.addSourceFileAtPath(f);
        }
        for (const sf of project.getSourceFiles()) {
            const abs = sf.getFilePath();
            const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
            const text = sf.getFullText();
            const lines = text.split('\n').length;
            totalLines += lines;
            // Exported names only — no bodies
            const exports = [];
            for (const cls of sf.getClasses()) {
                if (cls.isExported())
                    exports.push(`class:${cls.getName() ?? 'Anonymous'}`);
            }
            for (const fn of sf.getFunctions()) {
                if (fn.isExported())
                    exports.push(`fn:${fn.getName() ?? 'anonymous'}`);
            }
            for (const vd of sf.getVariableDeclarations()) {
                const stmt = vd.getVariableStatement();
                if (stmt?.isExported())
                    exports.push(`const:${vd.getName()}`);
            }
            for (const iface of sf.getInterfaces()) {
                if (iface.isExported())
                    exports.push(`interface:${iface.getName()}`);
            }
            for (const te of sf.getTypeAliases()) {
                if (te.isExported())
                    exports.push(`type:${te.getName()}`);
            }
            // Import graph
            const importSpecifiers = [];
            for (const imp of sf.getImportDeclarations()) {
                const spec = imp.getModuleSpecifierValue();
                importSpecifiers.push(spec);
                dependencyEdges.push({ from: rel, to: spec });
            }
            if (lines > 1000) {
                warnings.push(`⚠️ ${rel} is ${lines} lines — consider splitting into smaller modules.`);
            }
            fileSummaries.push({ path: rel, lines, exports, imports: importSpecifiers });
        }
        // Detect architecture heuristically without re-analyzing
        const hasYaml = (await this.listFilesWithExtensions(projectRoot, ['.yaml', '.yml']))
            .some(f => !f.includes('node_modules') && !path.basename(f).includes('github') && !path.basename(f).includes('docker'));
        const hasFacade = fileSummaries.some(f => f.exports.some(e => e.toLowerCase().includes('facade') || e.toLowerCase().includes('locatorservice')));
        const arch = hasYaml && hasFacade ? 'yaml-locators' : hasYaml ? 'yaml-locators' : hasFacade ? 'facade' : 'pom';
        return {
            schemaVersion: '1.0',
            projectRoot,
            scannedAt: new Date().toISOString(),
            totalFiles: fileSummaries.length,
            totalLines,
            architecture: arch,
            files: fileSummaries,
            dependencyEdges,
            warnings,
        };
    }
    // ──────────────────────────────────────────────────────────────────────────
    /**
     * Scans the project for existing BDD assets using ts-morph AST parsing.
     * Scans features/, step-definitions/, pages/, and utils/.
     */
    async analyze(projectRoot) {
        const result = {
            existingFeatures: [],
            existingStepDefinitions: [],
            existingPageObjects: [],
            existingUtils: [],
            conflicts: [],
            architecturePattern: 'pom',
            yamlLocatorFiles: [],
            detectedPaths: {
                featuresRoot: 'features',
                stepsRoot: 'step-definitions',
                pagesRoot: 'pages',
                utilsRoot: 'utils',
                locatorsRoot: 'locators'
            }
        };
        // 1. Discover Feature files anywhere in the workspace
        const featureFiles = await this.listFilesWithExtensions(projectRoot, ['.feature']);
        result.existingFeatures = featureFiles.map(f => path.relative(projectRoot, f).replace(/\\/g, '/'));
        if (featureFiles.length > 0) {
            result.detectedPaths.featuresRoot = path.dirname(path.relative(projectRoot, featureFiles[0]).replace(/\\/g, '/'));
        }
        // 2. Discover ALL TypeScript Files dynamically
        const tsFiles = await this.listFilesWithExtensions(projectRoot, ['.ts']);
        if (tsFiles.length > 0) {
            const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
            for (const f of tsFiles) {
                if (f.includes('mcp-config') || f.includes('wdio.conf') || f.endsWith('d.ts'))
                    continue;
                project.addSourceFileAtPath(f);
            }
            for (const sourceFile of project.getSourceFiles()) {
                const filePath = sourceFile.getFilePath();
                const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
                const codeContent = sourceFile.getFullText();
                const steps = this.extractStepsAST(sourceFile);
                if (steps.length > 0) {
                    result.existingStepDefinitions.push({ file: relativePath, steps });
                    if (result.detectedPaths.stepsRoot === 'step-definitions') {
                        result.detectedPaths.stepsRoot = path.dirname(relativePath);
                    }
                    continue;
                }
                const classes = sourceFile.getClasses();
                let isPageObject = false;
                for (const cls of classes) {
                    const className = cls.getName() || '';
                    const hasLocators = this.extractLocatorsAST(cls).length > 0;
                    const isStandardPom = className.toLowerCase().includes('page') || className.toLowerCase().includes('screen');
                    if (hasLocators || isStandardPom) {
                        const publicMethods = cls.getMethods()
                            .filter(m => !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword))
                            .map(m => m.getName());
                        result.existingPageObjects.push({
                            path: relativePath,
                            className: className || 'AnonymousClass',
                            publicMethods,
                            locators: this.extractLocatorsAST(cls)
                        });
                        isPageObject = true;
                    }
                }
                // --- Phase 43: Detect Functional/Object-Literal POMs ---
                const variableDeclarations = sourceFile.getVariableDeclarations();
                for (const varDecl of variableDeclarations) {
                    const name = varDecl.getName() || '';
                    const isStandardPom = name.toLowerCase().includes('page') || name.toLowerCase().includes('screen');
                    let hasLocators = false;
                    const publicMethods = [];
                    const locators = [];
                    const initializer = varDecl.getInitializer();
                    if (initializer && Node.isObjectLiteralExpression(initializer)) {
                        for (const prop of initializer.getProperties()) {
                            // Extract functions inside object literals
                            if (Node.isMethodDeclaration(prop)) {
                                publicMethods.push(prop.getName());
                            }
                            else if (Node.isPropertyAssignment(prop)) {
                                const propInit = prop.getInitializer();
                                if (propInit && (Node.isArrowFunction(propInit) || Node.isFunctionExpression(propInit))) {
                                    publicMethods.push(prop.getName());
                                }
                            }
                            // Basic locator AST detection
                            const bodyText = prop.getText();
                            const selectorMatch = bodyText.match(/\$\(\s*['"`](.+?)['"`]\s*\)/) || bodyText.match(/~(.+?)/);
                            if (selectorMatch && selectorMatch[1]) {
                                hasLocators = true;
                                const propName = 'getName' in prop ? prop.getName() : 'unknown';
                                locators.push({ name: propName, strategy: this.classifyLocatorStrategy(selectorMatch[1]), selector: selectorMatch[1] });
                            }
                        }
                    }
                    if (isStandardPom || hasLocators) {
                        result.existingPageObjects.push({
                            path: relativePath,
                            className: name || 'AnonymousObject',
                            publicMethods,
                            locators
                        });
                        isPageObject = true;
                    }
                }
                if (isPageObject) {
                    if (result.detectedPaths.pagesRoot === 'pages') {
                        result.detectedPaths.pagesRoot = path.dirname(relativePath);
                    }
                    continue;
                }
                if (relativePath.toLowerCase().includes('util') || codeContent.includes('export function') || codeContent.includes('export const')) {
                    const methods = [];
                    for (const cls of classes) {
                        for (const m of cls.getMethods()) {
                            if (!m.hasModifier(SyntaxKind.PrivateKeyword))
                                methods.push(`${cls.getName()}.${m.getName()}`);
                        }
                    }
                    for (const fn of sourceFile.getFunctions()) {
                        if (fn.isExported())
                            methods.push(fn.getName() ?? 'anonymous');
                    }
                    if (methods.length > 0) {
                        result.existingUtils.push({ path: relativePath, publicMethods: methods });
                        if (result.detectedPaths.utilsRoot === 'utils') {
                            result.detectedPaths.utilsRoot = path.dirname(relativePath);
                        }
                    }
                }
            }
        }
        // 4b. Parse tsconfig.json for Path Aliasing
        const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
        try {
            await fs.access(tsconfigPath);
            const content = await fs.readFile(tsconfigPath, 'utf8');
            const stripped = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
            const tsconfig = JSON.parse(stripped);
            if (tsconfig.compilerOptions?.paths) {
                result.importAliases = tsconfig.compilerOptions.paths;
            }
        }
        catch (e) { }
        // 4c. Discover existing Env or Config Files
        let rootFiles = [];
        try {
            rootFiles = await fs.readdir(projectRoot);
        }
        catch (e) { }
        const envFiles = rootFiles.filter(f => f.startsWith('.env') && !f.endsWith('.example'));
        let hasCustomConfigDir = false;
        try {
            const configStat = await fs.stat(path.join(projectRoot, 'config'));
            if (configStat.isDirectory())
                hasCustomConfigDir = true;
        }
        catch { }
        result.envConfig = {
            present: envFiles.length > 0 || hasCustomConfigDir,
            files: envFiles,
            keys: []
        };
        // 4d. Discover Custom package.json Scripts
        const packageJsonPath = path.join(projectRoot, 'package.json');
        let pkgExists = false;
        try {
            await fs.stat(packageJsonPath);
            pkgExists = true;
        }
        catch { }
        if (pkgExists) {
            try {
                const pkgContent = await fs.readFile(packageJsonPath, 'utf8');
                const pkg = JSON.parse(pkgContent);
                if (pkg.scripts) {
                    result.packageScripts = pkg.scripts;
                }
            }
            catch (e) { }
        }
        // 5. Detect Architecture Pattern
        result.architecturePattern = await this.detectArchitecture(projectRoot, result);
        if (result.yamlLocatorFiles.length > 0) {
            result.detectedPaths.locatorsRoot = path.dirname(path.relative(projectRoot, result.yamlLocatorFiles[0]).replace(/\\/g, '/'));
        }
        // 6. Detect Step Rule Conflicts
        const patternMap = new Map();
        for (const stepDef of result.existingStepDefinitions) {
            for (const step of stepDef.steps) {
                const key = `${step.type}: ${step.pattern}`;
                const existing = patternMap.get(key) || [];
                existing.push(stepDef.file);
                patternMap.set(key, existing);
            }
        }
        for (const [pattern, files] of patternMap.entries()) {
            if (files.length > 1) {
                result.conflicts.push({ pattern, files: [...new Set(files)] });
            }
        }
        return result;
    }
    // ─── Architecture Detection ────────────────────────────
    /**
     * Detects the project's locator architecture by scanning for:
     * - YAML locator files → 'yaml-locators'
     * - Page Object classes with inline selectors → 'pom'
     * - driverFacade/resolveLocator usage → 'facade'
     * - Mix of patterns → 'hybrid'
     */
    async detectArchitecture(projectRoot, analysis) {
        let hasYaml = false;
        let hasPom = false;
        let hasFacade = false;
        // 1. Check for YAML locator files everywhere in the workspace
        const yamlFiles = await this.listFilesWithExtensions(projectRoot, ['.yaml', '.yml']);
        // Filter out irrelevant yaml files like CI workflows or docker-compose
        const validYamlLocators = yamlFiles.filter(f => {
            const name = path.basename(f).toLowerCase();
            return !name.includes('github') && !name.includes('gitlab') && !name.includes('docker') && !f.includes('node_modules');
        });
        if (validYamlLocators.length > 0) {
            hasYaml = true;
            analysis.yamlLocatorFiles = validYamlLocators;
        }
        // 2. Check for POM patterns (page classes with inline $() selectors or decorators)
        if (analysis.existingPageObjects.length > 0) {
            const hasInlineLocators = analysis.existingPageObjects.some(p => p.locators.length > 0);
            if (hasInlineLocators)
                hasPom = true;
        }
        // 3. Check for Facade/resolveLocator patterns across ALL discovered ts files
        const tsFiles = await this.listFilesWithExtensions(projectRoot, ['.ts']);
        for (const f of tsFiles) {
            if (f.includes('node_modules') || f.includes('.d.ts'))
                continue;
            try {
                const content = await fs.readFile(f, 'utf8');
                if (content.includes('resolveLocator') ||
                    content.includes('driverFacade') ||
                    content.includes('LocatorService') ||
                    content.includes('getLocator(')) {
                    hasFacade = true;
                    break;
                }
            }
            catch { /* skip unreadable files */ }
        }
        // 4. Classify
        if (hasYaml && hasFacade)
            return 'yaml-locators';
        if (hasYaml && hasPom)
            return 'hybrid';
        if (hasYaml)
            return 'yaml-locators';
        if (hasFacade)
            return 'facade';
        return 'pom';
    }
    async listFilesWithExtensions(dir, extensions) {
        let results = [];
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git')
                    continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results = results.concat(await this.listFilesWithExtensions(fullPath, extensions));
                }
                else if (extensions.some(ext => entry.name.endsWith(ext))) {
                    results.push(fullPath);
                }
            }
        }
        catch { /* directory doesn't exist */ }
        return results;
    }
    // ─── AST Extractors ───────────────────────────────────
    /**
     * Uses AST to find Given/When/Then calls with their patterns.
     */
    extractStepsAST(sourceFile) {
        const steps = [];
        const stepTypes = ['Given', 'When', 'Then', 'And', 'But'];
        sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
            const exprText = call.getExpression().getText();
            if (stepTypes.includes(exprText)) {
                const args = call.getArguments();
                if (args.length > 0) {
                    let pattern = args[0].getText();
                    // Remove quotes/backticks/regex delimiters
                    pattern = pattern.replace(/^['"`\/]|['"`\/]$/g, '');
                    steps.push({ type: exprText, pattern });
                }
            }
        });
        return steps;
    }
    /**
     * Extracts locator patterns from page object getters/properties.
     */
    extractLocatorsAST(cls) {
        const locators = [];
        // Look for getter accessors that return $() or $$()
        for (const getter of cls.getGetAccessors()) {
            const body = getter.getBody()?.getText() ?? '';
            const selectorMatch = body.match(/\$\(\s*['"`](.+?)['"`]\s*\)/);
            if (selectorMatch) {
                const selector = selectorMatch[1];
                locators.push({
                    name: getter.getName(),
                    strategy: this.classifyLocatorStrategy(selector),
                    selector
                });
            }
        }
        // Also look for properties with $ calls
        for (const prop of cls.getProperties()) {
            const initializer = prop.getInitializer()?.getText() ?? '';
            const selectorMatch = initializer.match(/\$\(\s*['"`](.+?)['"`]\s*\)/);
            if (selectorMatch) {
                const selector = selectorMatch[1];
                locators.push({
                    name: prop.getName(),
                    strategy: this.classifyLocatorStrategy(selector),
                    selector
                });
            }
        }
        return locators;
    }
    /**
     * Classifies a selector string into its locator strategy.
     */
    classifyLocatorStrategy(selector) {
        if (selector.startsWith('~'))
            return 'accessibility-id';
        if (selector.startsWith('//'))
            return 'xpath';
        if (selector.startsWith('#'))
            return 'id';
        if (selector.startsWith('.'))
            return 'class';
        if (selector.includes(':id/'))
            return 'resource-id';
        if (selector.startsWith('-ios'))
            return 'ios-predicate';
        return 'unknown';
    }
    // ─── File Discovery Helpers ───────────────────────────
    async listFiles(dir, ext, projectRoot) {
        const absolute = await this.listFilesAbsolute(dir, ext);
        return absolute.map(f => path.relative(projectRoot, f));
    }
    async listFilesAbsolute(dir, ext) {
        let results = [];
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results = results.concat(await this.listFilesAbsolute(fullPath, ext));
                }
                else if (entry.name.endsWith(ext)) {
                    results.push(fullPath);
                }
            }
        }
        catch {
            // Directory doesn't exist — fine
        }
        return results;
    }
}
