export interface CodebaseAnalysisResult {
    existingFeatures: string[];
    existingStepDefinitions: {
        file: string;
        steps: {
            type: string;
            pattern: string;
        }[];
    }[];
    existingPageObjects: {
        path: string;
        publicMethods: string[];
    }[];
}
export declare class CodebaseAnalyzerService {
    analyze(projectRoot: string): Promise<CodebaseAnalysisResult>;
    private extractSteps;
    private extractMethods;
    private isDirectory;
    private listRecursive;
}
//# sourceMappingURL=CodebaseAnalyzerService.d.ts.map