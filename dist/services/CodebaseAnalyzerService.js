import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs/promises';
export class CodebaseAnalyzerService {
    /**
     * Scans the project for existing BDD assets using ts-morph AST parsing.
     * Scans features/, step-definitions/, pages/, and utils/.
     */
    async analyze(projectRoot, customPaths) {
        const featuresDir = path.join(projectRoot, customPaths?.featuresRoot ?? 'features');
        const stepsDir = path.join(projectRoot, customPaths?.stepsRoot ?? 'step-definitions');
        const pagesDir = path.join(projectRoot, customPaths?.pagesRoot ?? 'pages');
        const utilsDir = path.join(projectRoot, customPaths?.utilsRoot ?? 'utils');
        const result = {
            existingFeatures: [],
            existingStepDefinitions: [],
            existingPageObjects: [],
            existingUtils: [],
            conflicts: [],
        };
        // 1. Discover Feature files
        result.existingFeatures = await this.listFiles(featuresDir, '.feature', projectRoot);
        // 2. Discover Step Definitions using AST
        const stepFiles = await this.listFilesAbsolute(stepsDir, '.ts');
        if (stepFiles.length > 0) {
            const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
            for (const f of stepFiles) {
                project.addSourceFileAtPath(f);
            }
            for (const sourceFile of project.getSourceFiles()) {
                const steps = this.extractStepsAST(sourceFile);
                if (steps.length > 0) {
                    result.existingStepDefinitions.push({
                        file: path.relative(projectRoot, sourceFile.getFilePath()),
                        steps
                    });
                }
            }
        }
        // 3. Discover Page Objects using AST
        const pageFiles = await this.listFilesAbsolute(pagesDir, '.ts');
        if (pageFiles.length > 0) {
            const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
            for (const f of pageFiles) {
                project.addSourceFileAtPath(f);
            }
            for (const sourceFile of project.getSourceFiles()) {
                const classes = sourceFile.getClasses();
                for (const cls of classes) {
                    const publicMethods = cls.getMethods()
                        .filter(m => !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword))
                        .map(m => m.getName());
                    const locators = this.extractLocatorsAST(cls);
                    result.existingPageObjects.push({
                        path: path.relative(projectRoot, sourceFile.getFilePath()),
                        className: cls.getName() ?? 'AnonymousClass',
                        publicMethods,
                        locators
                    });
                }
            }
        }
        // 4. Discover Utils using AST
        const utilFiles = await this.listFilesAbsolute(utilsDir, '.ts');
        if (utilFiles.length > 0) {
            const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
            for (const f of utilFiles) {
                project.addSourceFileAtPath(f);
            }
            for (const sourceFile of project.getSourceFiles()) {
                const methods = [];
                // Extract methods from classes
                for (const cls of sourceFile.getClasses()) {
                    for (const m of cls.getMethods()) {
                        if (!m.hasModifier(SyntaxKind.PrivateKeyword)) {
                            methods.push(`${cls.getName()}.${m.getName()}`);
                        }
                    }
                }
                // Extract exported standalone functions
                for (const fn of sourceFile.getFunctions()) {
                    if (fn.isExported()) {
                        methods.push(fn.getName() ?? 'anonymous');
                    }
                }
                if (methods.length > 0) {
                    result.existingUtils.push({
                        path: path.relative(projectRoot, sourceFile.getFilePath()),
                        publicMethods: methods
                    });
                }
            }
        }
        // 5. Detect Step Rule Conflicts
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
