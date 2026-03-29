import { Project, Node, SyntaxKind } from 'ts-morph';
export class ASTScrutinizer {
    /**
     * Scans a TypeScript string for "lazy scaffolding" (e.g., empty methods, TODO comments).
     * @throws {Error} If lazy patterns are found.
     */
    static scrutinize(fileContent, fileName) {
        if (!fileName.endsWith('.ts') && !fileName.endsWith('.js')) {
            return;
        }
        const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
        const sourceFile = project.createSourceFile('temp.ts', fileContent);
        // 1. Check for suspicious "TODO" or "FIXME" comments anywhere in the file
        const fullText = sourceFile.getFullText();
        const lazyKeywords = ['TODO', 'FIXME', 'implement later', 'add logic here', 'add implementation here', 'add your logic here'];
        for (const keyword of lazyKeywords) {
            if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
                throw new Error(`Execution Rejected (Code 406): File '${fileName}' contains lazy scaffolding. ` +
                    `Found mocking placeholder '${keyword}'. You MUST provide the full, working implementation without TODOs.`);
            }
        }
        // 2. Check for empty function/method bodies
        const classes = sourceFile.getClasses();
        for (const cls of classes) {
            for (const method of cls.getMethods()) {
                const bodyContent = method.getBodyText()?.trim();
                if (bodyContent === '') {
                    throw new Error(`Execution Rejected (Code 406): File '${fileName}' contains an empty method '${method.getName()}'. ` +
                        `You MUST write the complete interaction logic instead of leaving empty scaffolding blocks.`);
                }
            }
        }
        const functions = sourceFile.getFunctions();
        for (const fn of functions) {
            const bodyContent = fn.getBodyText()?.trim();
            if (bodyContent === '') {
                throw new Error(`Execution Rejected (Code 406): File '${fileName}' contains an empty function '${fn.getName() || 'anonymous'}'. ` +
                    `You MUST write the complete logic instead of leaving empty scaffolding blocks.`);
            }
        }
        // 3. Arrow functions containing empty block {}
        const arrowFunctions = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
        for (const arrow of arrowFunctions) {
            const body = arrow.getBody();
            if (Node.isBlock(body)) {
                if (body.getStatements().length === 0 && !body.getText().includes('//')) {
                    throw new Error(`Execution Rejected (Code 406): File '${fileName}' contains an empty arrow function block. ` +
                        `You MUST provide the full, working implementation instead of empty blocks.`);
                }
            }
        }
    }
}
