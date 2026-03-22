import type { McpConfig } from './McpConfigService.js';
import type { CodebaseAnalysisResult } from './CodebaseAnalyzerService.js';
export declare class TestGenerationService {
    /**
     * Generates a rigid system instruction context for the LLM to write Appium-Cucumber-POM code.
     */
    generateAppiumPrompt(projectRoot: string, testDescription: string, config: McpConfig, analysis: CodebaseAnalysisResult): string;
}
//# sourceMappingURL=TestGenerationService.d.ts.map