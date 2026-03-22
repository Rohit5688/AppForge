import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { ProjectSetupService } from "./services/ProjectSetupService.js";
import { McpConfigService } from "./services/McpConfigService.js";
import { CodebaseAnalyzerService } from "./services/CodebaseAnalyzerService.js";
import { TestGenerationService } from "./services/TestGenerationService.js";
import { FileWriterService } from "./services/FileWriterService.js";
import { ExecutionService } from "./services/ExecutionService.js";
import { SelfHealingService } from "./services/SelfHealingService.js";
import { CredentialService } from "./services/CredentialService.js";
import { AuditLocatorService } from "./services/AuditLocatorService.js";
import { SummarySuiteService } from "./services/SummarySuiteService.js";
import { EnvironmentCheckService } from "./services/EnvironmentCheckService.js";
import { CiWorkflowService } from "./services/CiWorkflowService.js";
import { LearningService } from "./services/LearningService.js";
import { RefactoringService } from "./services/RefactoringService.js";
import { BugReportService } from "./services/BugReportService.js";
import { TestDataService } from "./services/TestDataService.js";
import { AppiumSessionService } from "./services/AppiumSessionService.js";
import { ProjectMaintenanceService } from "./services/ProjectMaintenanceService.js";
import { CoverageAnalysisService } from "./services/CoverageAnalysisService.js";
import { MigrationService } from "./services/MigrationService.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
/**
 * Appium Cucumber POM MCP Server
 * Orchestrates Mobile Automation (Android/iOS) using WebdriverIO + Cucumber
 */
class AppiumMcpServer {
    server;
    projectSetupService = new ProjectSetupService();
    configService = new McpConfigService();
    analyzerService = new CodebaseAnalyzerService();
    generationService = new TestGenerationService();
    fileWriterService = new FileWriterService();
    executionService = new ExecutionService();
    selfHealingService = new SelfHealingService();
    credentialService = new CredentialService();
    auditLocatorService = new AuditLocatorService();
    summarySuiteService = new SummarySuiteService();
    environmentCheckService = new EnvironmentCheckService();
    ciWorkflowService = new CiWorkflowService();
    learningService = new LearningService();
    refactoringService = new RefactoringService();
    bugReportService = new BugReportService();
    testDataService = new TestDataService();
    appiumSessionService = new AppiumSessionService();
    projectMaintenanceService = new ProjectMaintenanceService();
    coverageAnalysisService = new CoverageAnalysisService();
    migrationService = new MigrationService();
    constructor() {
        this.server = new Server({ name: "appium-cucumber-pom-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
        this.setupToolHandlers();
        this.server.onerror = (error) => console.error("[MCP Error]", error);
        // Inject live session service into services that need it
        this.executionService.setSessionService(this.appiumSessionService);
        this.selfHealingService.setSessionService(this.appiumSessionService);
        this.selfHealingService.setLearningService(this.learningService);
    }
    setupToolHandlers() {
        // ─── Tool Discovery ──────────────────────────────────
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "setup_project",
                    description: "Initialize a complete Mobile Automation project with Appium, Cucumber, TypeScript, BasePage, hooks, and sample feature.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            platform: { type: "string", enum: ["android", "ios", "both"] },
                            appName: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "upgrade_project",
                    description: "Idempotent tool to detect and upgrade existing project structures, migrate configs, and update dependencies. Run this to maintain older setups.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "manage_config",
                    description: "Read or update the mcp-config.json file for capabilities, paths, and cloud settings.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            operation: { type: "string", enum: ["read", "write"] },
                            config: { type: "object" }
                        },
                        required: ["projectRoot", "operation"]
                    }
                },
                {
                    name: "inject_app_build",
                    description: "Dynamically update the Appium app path (.apk/.ipa/.app) in the config for a platform.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            platform: { type: "string", enum: ["android", "ios"] },
                            appPath: { type: "string" }
                        },
                        required: ["projectRoot", "platform", "appPath"]
                    }
                },
                {
                    name: "analyze_codebase",
                    description: "Scan existing codebase using AST for reusable steps, page methods, and utils.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "generate_cucumber_pom",
                    description: "Generate a complete BDD suite (feature + steps + page) from plain English with maximum reuse. Provide live Appium screenshots/XML if available to improve locator accuracy.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            testDescription: { type: "string" },
                            testName: { type: "string" },
                            screenXml: { type: "string", description: "Optional: Live XML hierarchy dump from an Appium session." },
                            screenshotBase64: { type: "string", description: "Optional: Base64 encoded screenshot image for visual context." }
                        },
                        required: ["projectRoot", "testDescription"]
                    }
                },
                {
                    name: "validate_and_write",
                    description: "Validate TypeScript syntax (tsc --noEmit) and Gherkin syntax, then write generated files to disk.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            files: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { path: { type: "string" }, content: { type: "string" } },
                                    required: ["path", "content"]
                                }
                            },
                            dryRun: { type: "boolean", description: "If true, validates code without writing to disk." }
                        },
                        required: ["projectRoot", "files"]
                    }
                },
                {
                    name: "run_cucumber_test",
                    description: "Execute Cucumber Appium tests with tag/platform filtering and structured result parsing.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            tags: { type: "string", description: "Cucumber tag expression, e.g. '@smoke and @android'" },
                            platform: { type: "string", enum: ["android", "ios"] },
                            specificArgs: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "inspect_ui_hierarchy",
                    description: "Structure and parse Appium XML page source + Base64 screenshot for vision analysis.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            xmlDump: { type: "string" },
                            screenshotBase64: { type: "string" }
                        },
                        required: ["xmlDump"]
                    }
                },
                {
                    name: "self_heal_test",
                    description: "Analyze a failed test run with XML + screenshot vision to propose healed selectors.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            testOutput: { type: "string" },
                            xmlHierarchy: { type: "string" },
                            screenshotBase64: { type: "string" },
                            attempt: { type: "number" }
                        },
                        required: ["testOutput", "xmlHierarchy"]
                    }
                },
                {
                    name: "set_credentials",
                    description: "Update project .env file with cloud or local authentication credentials.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            credentials: { type: "object", additionalProperties: { type: "string" } }
                        },
                        required: ["projectRoot", "credentials"]
                    }
                },
                {
                    name: "manage_users",
                    description: "Manage multi-environment test users (users.{env}.json) with typed getUser() helper.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            operation: { type: "string", enum: ["read", "write"] },
                            env: { type: "string", description: "Environment name: staging, prod, etc." },
                            users: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        username: { type: "string" },
                                        password: { type: "string" },
                                        role: { type: "string" }
                                    },
                                    required: ["username", "password"]
                                }
                            }
                        },
                        required: ["projectRoot", "operation"]
                    }
                },
                {
                    name: "audit_mobile_locators",
                    description: "Scan Page Objects and audit locator strategies. Flags brittle XPaths and generates a Markdown report.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "summarize_suite",
                    description: "Parse Cucumber JSON report and generate a plain-English test execution summary.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            reportFile: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "check_environment",
                    description: "Pre-flight check: verify Appium server, SDK, emulator/simulator, app binary, and dependencies.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            platform: { type: "string", enum: ["android", "ios", "both"] },
                            appPath: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "generate_ci_workflow",
                    description: "Generate a CI/CD workflow file (GitHub Actions or GitLab CI) for running Appium tests.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            provider: { type: "string", enum: ["github", "gitlab"] },
                            platform: { type: "string", enum: ["android", "ios"] },
                            nodeVersion: { type: "string" },
                            appiumVersion: { type: "string" }
                        },
                        required: ["projectRoot", "provider"]
                    }
                },
                {
                    name: "train_on_example",
                    description: "Teach the AI a team-specific pattern or fix. Persisted to .appium-mcp/mcp-learning.json and injected into all future generation prompts.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            issuePattern: { type: "string", description: "The error or pattern to learn from." },
                            solution: { type: "string", description: "The correct fix or approach." },
                            tags: { type: "array", items: { type: "string" } }
                        },
                        required: ["projectRoot", "issuePattern", "solution"]
                    }
                },
                {
                    name: "export_team_knowledge",
                    description: "Export the AI's learned rules (.appium-mcp/mcp-learning.json) as a human-readable Markdown document.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "suggest_refactorings",
                    description: "Analyze the codebase for duplicate steps, unused Page Object methods, and XPath over-usage. Returns a structured cleanup report.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "export_bug_report",
                    description: "Generate a Jira-formatted bug report from a failed Appium test, with auto-classified severity.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            testName: { type: "string" },
                            rawError: { type: "string" },
                            platform: { type: "string" },
                            deviceName: { type: "string" },
                            appVersion: { type: "string" }
                        },
                        required: ["testName", "rawError"]
                    }
                },
                {
                    name: "generate_test_data_factory",
                    description: "Generate a typed mock data factory using faker.js for reusable test data (TypeScript interface + builder function).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            entityName: { type: "string", description: "Name of the entity (e.g. 'User', 'Product')." },
                            schemaDefinition: { type: "string", description: "Schema description or TypeScript interface." }
                        },
                        required: ["entityName", "schemaDefinition"]
                    }
                },
                {
                    name: "request_user_clarification",
                    description: "HALT: Call when encountering an ambiguity that prevents confident code generation. Forces the AI host to ask the user a question.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            question: { type: "string" },
                            options: { type: "array", items: { type: "string" } },
                            context: { type: "string" }
                        },
                        required: ["question", "context"]
                    }
                },
                {
                    name: "analyze_coverage",
                    description: "Parse .feature files to generate a coverage report, screen heatmap, and identify missing a11y or negative scenarios.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            featureFilesPaths: { type: "array", items: { type: "string" } }
                        },
                        required: ["projectRoot", "featureFilesPaths"]
                    }
                },
                {
                    name: "migrate_test",
                    description: "Generate an LLM prompt to map an existing Espresso, XCUITest, or Detox test file to Appium + Cucumber POM.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            sourceCode: { type: "string" },
                            sourceFileName: { type: "string" },
                            sourceFramework: { type: "string", enum: ["espresso", "xcuitest", "detox"] },
                            sourceLanguage: { type: "string", enum: ["java", "swift", "javascript"] }
                        },
                        required: ["sourceCode", "sourceFileName", "sourceFramework", "sourceLanguage"]
                    }
                },
                {
                    name: "start_appium_session",
                    description: "Start a live Appium session on a device/emulator. Returns session ID, device info, initial page source, and screenshot. Required before using live inspect/verify features.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            profileName: { type: "string", description: "Optional capability profile name from mcp-config.json." }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "end_appium_session",
                    description: "Terminate the active Appium session and release the device.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    }
                },
                {
                    name: "verify_selector",
                    description: "Verify whether a selector exists on the live device screen. Optionally pass projectRoot and oldSelector to auto-learn successful fixes.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            selector: { type: "string", description: "The selector to verify (e.g. '~loginButton', 'id=com.app:id/btn')." },
                            projectRoot: { type: "string", description: "Project root (required if auto-learning)." },
                            oldSelector: { type: "string", description: "The broken selector that was replaced (required if auto-learning)." }
                        },
                        required: ["selector"]
                    }
                }
            ],
        }));
        // ─── Tool Dispatcher ──────────────────────────────────
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const args = request.params.arguments;
                switch (request.params.name) {
                    case "setup_project":
                        return this.textResult(await this.projectSetupService.setup(args.projectRoot, args.platform, args.appName));
                    case "upgrade_project":
                        return this.textResult(await this.projectMaintenanceService.upgradeProject(args.projectRoot));
                    case "manage_config":
                        if (args.operation === "read") {
                            return this.textResult(JSON.stringify(this.configService.read(args.projectRoot), null, 2));
                        }
                        else {
                            this.configService.write(args.projectRoot, args.config);
                            return this.textResult("Configuration updated successfully.");
                        }
                    case "inject_app_build":
                        this.configService.updateAppPath(args.projectRoot, args.platform, args.appPath);
                        return this.textResult(`Updated ${args.platform} app path to: ${args.appPath}`);
                    case "analyze_codebase": {
                        const config = this.configService.read(args.projectRoot);
                        const paths = this.configService.getPaths(config);
                        const result = await this.analyzerService.analyze(args.projectRoot, paths);
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "generate_cucumber_pom": {
                        const config = this.configService.read(args.projectRoot);
                        const paths = this.configService.getPaths(config);
                        const analysis = await this.analyzerService.analyze(args.projectRoot, paths);
                        const learningPrompt = this.learningService.getKnowledgePromptInjection(args.projectRoot);
                        const prompt = this.generationService.generateAppiumPrompt(args.projectRoot, args.testDescription, config, analysis, args.testName, learningPrompt, args.screenXml, args.screenshotBase64);
                        return this.textResult(prompt);
                    }
                    case "validate_and_write":
                        return this.textResult(await this.fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.dryRun));
                    case "run_cucumber_test": {
                        const result = await this.executionService.runTest(args.projectRoot, {
                            tags: args.tags,
                            platform: args.platform,
                            specificArgs: args.specificArgs
                        });
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "inspect_ui_hierarchy": {
                        const result = await this.executionService.inspectHierarchy(args.xmlDump, args.screenshotBase64 ?? '');
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "self_heal_test": {
                        const healResult = await this.selfHealingService.healWithRetry(args.testOutput, args.xmlHierarchy, args.screenshotBase64 ?? '', args.attempt ?? 1);
                        return this.textResult(healResult.prompt);
                    }
                    case "set_credentials":
                        return this.textResult(await this.credentialService.setEnv(args.projectRoot, args.credentials));
                    case "manage_users":
                        return this.textResult(await this.credentialService.manageUsers(args.projectRoot, args.operation, args.env, args.users));
                    case "audit_mobile_locators": {
                        const config = this.configService.read(args.projectRoot);
                        const paths = this.configService.getPaths(config);
                        const report = await this.auditLocatorService.audit(args.projectRoot, paths.pagesRoot);
                        return this.textResult(report.markdownReport);
                    }
                    case "summarize_suite": {
                        const summary = await this.summarySuiteService.summarize(args.projectRoot, args.reportFile);
                        return this.textResult(summary.plainEnglishSummary);
                    }
                    case "check_environment": {
                        const report = await this.environmentCheckService.check(args.projectRoot, args.platform, args.appPath);
                        return this.textResult(report.summary);
                    }
                    case "generate_ci_workflow": {
                        const workflow = this.ciWorkflowService.generate(args.provider, args.platform, {
                            nodeVersion: args.nodeVersion,
                            appiumVersion: args.appiumVersion
                        });
                        // Write the workflow file to the project
                        const fs = await import('fs');
                        const path = await import('path');
                        const fullPath = path.default.join(args.projectRoot, workflow.filename);
                        const dir = path.default.dirname(fullPath);
                        if (!fs.default.existsSync(dir)) {
                            fs.default.mkdirSync(dir, { recursive: true });
                        }
                        fs.default.writeFileSync(fullPath, workflow.content);
                        return this.textResult(`Generated CI workflow at ${workflow.filename}\n\n${workflow.content}`);
                    }
                    case "train_on_example": {
                        const rule = this.learningService.learn(args.projectRoot, args.issuePattern, args.solution, args.tags ?? []);
                        return this.textResult(`✅ Learned rule "${rule.id}": When encountering "${rule.pattern}" → apply: ${rule.solution}`);
                    }
                    case "export_team_knowledge":
                        return this.textResult(this.learningService.exportToMarkdown(args.projectRoot));
                    case "suggest_refactorings": {
                        const config = this.configService.read(args.projectRoot);
                        const paths = this.configService.getPaths(config);
                        const analysis = await this.analyzerService.analyze(args.projectRoot, paths);
                        return this.textResult(this.refactoringService.generateRefactoringSuggestions(analysis));
                    }
                    case "export_bug_report":
                        return this.textResult(this.bugReportService.generateBugReport(args.testName, args.rawError, args.platform, args.deviceName, args.appVersion));
                    case "generate_test_data_factory":
                        return this.textResult(this.testDataService.generateDataFactoryPrompt(args.entityName, args.schemaDefinition));
                    case "analyze_coverage": {
                        const report = this.coverageAnalysisService.analyzeCoverage(args.projectRoot, args.featureFilesPaths);
                        const prompt = this.coverageAnalysisService.getCoveragePrompt(report);
                        return this.textResult(JSON.stringify({ report, prompt }, null, 2));
                    }
                    case "migrate_test": {
                        const prompt = this.migrationService.generateMigrationPrompt(args.sourceCode, args.sourceFileName, { sourceFramework: args.sourceFramework, sourceLanguage: args.sourceLanguage });
                        return this.textResult(prompt);
                    }
                    case "request_user_clarification":
                        return this.textResult(`⚠️ SYSTEM HALT — HUMAN INPUT REQUIRED\n\n**Question**: ${args.question}\n\n**Context**: ${args.context}\n${args.options ? '\n**Options**:\n' + args.options.map((o, i) => `${i + 1}. ${o}`).join('\n') : ''}\n\nPlease answer the question above before continuing.`);
                    case "start_appium_session": {
                        const sessionInfo = await this.appiumSessionService.startSession(args.projectRoot, args.profileName);
                        return this.textResult(JSON.stringify({
                            sessionId: sessionInfo.sessionId,
                            platform: sessionInfo.platformName,
                            device: sessionInfo.deviceName,
                            appPackage: sessionInfo.appPackage,
                            bundleId: sessionInfo.bundleId,
                            elementsFound: this.executionService['parseXmlElements'](sessionInfo.initialPageSource).length,
                            message: `Session started on ${sessionInfo.deviceName} (${sessionInfo.platformName}). Use inspect_ui_hierarchy (no args) to fetch live XML.`
                        }, null, 2));
                    }
                    case "end_appium_session": {
                        await this.appiumSessionService.endSession();
                        return this.textResult('Appium session terminated.');
                    }
                    case "verify_selector": {
                        const verification = await this.selfHealingService.verifyHealedSelector(args.selector);
                        // Auto-learn if the selector works and we have context
                        if (verification.exists && args.projectRoot && args.oldSelector) {
                            this.selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
                            verification.note = "Success automatically learned to rule base.";
                        }
                        return this.textResult(JSON.stringify(verification, null, 2));
                    }
                    default:
                        throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
            }
        });
    }
    textResult(text) {
        return { content: [{ type: "text", text }] };
    }
    async run() {
        const args = process.argv.slice(2);
        const transportFlag = args.findIndex(a => a === '--transport');
        const transportType = transportFlag !== -1 ? args[transportFlag + 1] : 'stdio';
        if (transportType === 'sse') {
            const portFlag = args.findIndex(a => a === '--port');
            const port = portFlag !== -1 ? parseInt(args[portFlag + 1] || '3100', 10) : 3100;
            const app = express();
            let sseTransport;
            app.get('/sse', async (req, res) => {
                sseTransport = new SSEServerTransport('/message', res);
                await this.server.connect(sseTransport);
            });
            app.post('/message', async (req, res) => {
                if (sseTransport) {
                    await sseTransport.handlePostMessage(req, res);
                }
                else {
                    res.status(500).send('SSE transport not connected');
                }
            });
            app.listen(port, () => {
                console.error(`Appium MCP Server running on SSE at http://localhost:${port}/sse`);
            });
        }
        else {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error("Appium MCP Server running on stdio");
        }
    }
}
const server = new AppiumMcpServer();
server.run().catch(console.error);
