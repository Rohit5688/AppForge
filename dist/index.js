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
import { UtilAuditService } from "./services/UtilAuditService.js";
import { CiWorkflowService } from "./services/CiWorkflowService.js";
import { ClarificationRequired } from "./utils/Questioner.js";
import { AppForgeError } from "./utils/ErrorCodes.js";
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
import { executeSandbox } from "./services/SandboxEngine.js";
/**
 * AppForge — Mobile Automation MCP Server
 * Orchestrates Mobile Automation (Android/iOS) using WebdriverIO + Cucumber
 */
class AppForgeServer {
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
    utilAuditService = new UtilAuditService();
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
        this.server = new Server({ name: "AppForge", version: "1.0.0" }, { capabilities: { tools: {} } });
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
                    description: "FIRST-TIME SETUP. Use when starting a brand-new mobile automation project. Call ONCE for a new empty directory. Scaffolds the complete structure: mcp-config.json, BasePage, Cucumber feature, step definitions, wdio config, and hooks. Returns: log of all files created. Next: use manage_config to configure your Appium capabilities.",
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
                    description: "UPGRADE EXISTING PROJECT. Use when the user says 'update dependencies / upgrade the project / it is outdated'. Upgrades npm packages, migrates mcp-config.json, repairs missing files, and reports utility coverage gaps. Safe to re-run — never overwrites custom code. Returns: upgrade log with warnings.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "repair_project",
                    description: "REPAIR MISSING FILES. Use when setup was interrupted or files were accidentally deleted. Regenerates ONLY missing baseline files — never overwrites existing custom code. Safe to run at any time. Returns: list of files regenerated.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            platform: { type: "string", enum: ["android", "ios", "both"], description: "Platform hint used when regenerating mcp-config.json. Defaults to android." }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "manage_config",
                    description: "READ OR UPDATE PROJECT CONFIG. Use when the user wants to check or change Appium capabilities, device settings, app paths, or cloud provider. 'read' returns the full mcp-config.json. 'write' does a partial merge — only keys you provide are updated, all others are preserved. Returns: current config on read, updated confirmation on write.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            operation: { type: "string", enum: ["read", "write"] },
                            config: { type: "object", description: "For 'write': partial config to merge. Only provided keys are updated. Example: { mobile: { capabilitiesProfiles: { myProfile: { 'appium:deviceName': 'Pixel 6' } } } }" }
                        },
                        required: ["projectRoot", "operation"]
                    }
                },
                {
                    name: "inject_app_build",
                    description: "UPDATE APP FILE PATH. Use after a new build or when pointing to a different .apk/.ipa/.app file. Updates the app path in mcp-config.json for the specified platform. Set forceWrite: true for CI paths where the file does not exist locally yet. Returns: confirmation with the new path. Next: use start_appium_session to test the new build.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            platform: { type: "string", enum: ["android", "ios"] },
                            appPath: { type: "string" },
                            forceWrite: { type: "boolean", description: "If true, saves the path even if it does not exist locally (useful for CI paths)." }
                        },
                        required: ["projectRoot", "platform", "appPath"]
                    }
                },
                {
                    name: "analyze_codebase",
                    description: "⚠️ TOKEN-INTENSIVE — ONLY FOR TINY PROJECTS (<5 files). Reads every source file to extract existing steps, page objects, and utilities for reuse in code generation. For ANY real project, use execute_sandbox_code (Turbo Mode) instead — it uses 98% fewer tokens and returns only the data you request. Returns: { existingSteps[], existingPageObjects[], existingUtils[] }.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "execute_sandbox_code",
                    description: "🚀 TURBO MODE — USE FOR ALL PROJECT ANALYSIS. Runs a JavaScript snippet in a secure V8 sandbox without reading entire files. Always prefer this over analyze_codebase for real projects. Available APIs: forge.api.analyzeCodebase(projectRoot) → existing steps/pages/utils; forge.api.runTests(projectRoot) → runs tests; forge.api.readFile(filePath) → reads one file; forge.api.getConfig(projectRoot) → config object. Use `return <value>` in your script. Tip: answer questions like 'do I already have a LoginPage?' before generating new code.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            script: { type: "string", description: "JavaScript to execute. Use `return` to send results back. Example: `const c = await forge.api.analyzeCodebase('/path'); return c.existingSteps.filter(s => s.text.includes('login'));`" },
                            timeoutMs: { type: "number", description: "Optional execution timeout in milliseconds. Default: 10000 (10s)." }
                        },
                        required: ["script"]
                    }
                },
                {
                    name: "generate_cucumber_pom",
                    description: "WRITE A NEW TEST. Use when the user asks to 'write a test / create a scenario / add automation for X'. Returns a generation PROMPT pre-loaded with your project's existing steps, page objects, and architecture pattern — YOU act on this prompt to produce the actual .feature, step .ts, and Page Object .ts files. Does NOT write files itself. After generating, call validate_and_write to save. Provide screenXml and screenshotBase64 from a live session for highest locator accuracy. Returns: generation prompt text.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            testDescription: { type: "string" },
                            testName: { type: "string" },
                            screenXml: { type: "string" },
                            screenshotBase64: { type: "string" }
                        },
                        required: ["projectRoot", "testDescription"]
                    }
                },
                {
                    name: "audit_utils",
                    description: "CHECK UTILITY COVERAGE. Use when the user asks 'what helpers are missing / check my utilities / what Appium methods are not wrapped'. Scans for implementations of essential Appium wrappers (tap, swipe, scroll, waitForElement, etc.) and reports gaps. Returns: { coveragePercent, missing[]: unwrapped APIs, actionableSuggestions[]: where and how to add them }.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            customWrapperPackage: { type: "string", description: "Optional package name for a shared helper lib (e.g. '@myorg/appium-base'). Methods from this package are counted as present and not flagged as missing." }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "validate_and_write",
                    description: "SAVE FILES TO DISK. Use after generate_cucumber_pom to write the generated test code. Validates TypeScript syntax (tsc --noEmit) and Gherkin syntax first — returns errors instead of writing if validation fails. Use dryRun: true to preview validation without writing. Always call this instead of writing files manually. Returns: validation result and list of written files.",
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
                    description: "RUN TESTS. Use when the user says 'run my tests / execute / run @smoke'. Executes the Appium Cucumber suite. Auto-detects execution command from mcp-config.json — falls back to npx wdio run wdio.conf.ts if not configured. Supports Cucumber tag expressions and platform filtering. Timeout resolution: explicit timeoutMs > mcp-config.json execution.timeoutMs > detected from playwright.config > default (30 min). Returns: { success, output, stats: { total, passed, failed, skipped }, reportPath }. If tests fail, pass the output to self_heal_test to fix broken locators.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            tags: { type: "string", description: "Cucumber tag expression, e.g. '@smoke and @android'" },
                            platform: { type: "string", enum: ["android", "ios"] },
                            specificArgs: { type: "string" },
                            overrideCommand: { type: "string", description: "Full custom execution command (e.g. 'npm run test'). Bypasses mcp-config.json executionCommand." },
                            timeoutMs: { type: "number", description: "Optional execution timeout in milliseconds. Overrides all other timeout sources. Maximum: 2 hours (7200000ms)." }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "inspect_ui_hierarchy",
                    description: "SEE WHAT'S ON SCREEN. Two modes: (1) NO ARGS — fetches live XML and screenshot from the active Appium session. ⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. (2) Pass xmlDump — parses offline with no session needed. Returns: { source ('live'|'provided'), elements[]: [{ id, text, className, bounds, locatorStrategies[] }], screenshot }. Use locatorStrategies to build accurate Page Object selectors.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            xmlDump: { type: "string", description: "Optional: Appium XML page source. When omitted, live XML is fetched automatically from the active session." },
                            screenshotBase64: { type: "string" }
                        },
                        required: []
                    }
                },
                {
                    name: "self_heal_test",
                    description: "FIX BROKEN TESTS. Use when a test failure says 'element not found / no such element / selector not found'. Parses the error and current XML to find the correct replacement selector. Returns: { candidates[]: [{ selector, strategy, confidence, rationale }], promptForLLM: guidance text }. After getting candidates, use verify_selector to confirm the best one works. Then update your Page Object and call train_on_example to remember the fix.",
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
                    description: "SAVE CREDENTIALS SECURELY. Stores cloud provider credentials, API keys, or service env vars in the project .env file. Use for BrowserStack, Sauce Labs, or any external service. Values are stored in .env and excluded from git. Returns: confirmation of keys saved.",
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
                    description: "MANAGE TEST USERS. Use when the user wants to add or view test account credentials for different environments (staging, prod). Stores users with roles (admin, readonly, etc.) in users.{env}.json following the testDataRoot path from mcp-config.json (defaults to 'src/test-data' if not configured). Generates a typed getUser() helper. Returns: list of users on read, confirmation on write.",
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
                    description: "LOCATOR HEALTH CHECK. Use when the user says 'check my locators / are my selectors stable / too many XPaths'. Scans Page Objects and YAML locator files. Flags XPath (❌ brittle), CSS class/ID (⚠️ fragile), accessibility-id (✅ stable). Returns a health report with per-file breakdown, health score percentage, and specific lines to fix. Brittle XPath locators are the #1 cause of flaky mobile tests.",
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
                    description: "TEST RUN SUMMARY. Use after run_cucumber_test or when the user asks 'what were the test results / how many passed'. Parses the Cucumber JSON report. Returns: { summary: Markdown report, totalScenarios, passed, failed, skipped, duration, failingScenarios[]: [{ name, error }] }. The failingScenarios list tells you exactly which tests to investigate and fix.",
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
                    description: "PRE-FLIGHT CHECK. Use when the user says 'is my environment ready / why isn’t Appium connecting / tests won’t start / check my setup'. Verifies the entire Appium stack: Node.js, Appium server, drivers, Android SDK, Xcode, connected device/emulator, app binary, node_modules, and mcp-config.json. Returns: { summary: full report, ready: boolean, failCount, warnCount }. Run this FIRST when tests fail for unknown reasons.",
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
                    description: "SET UP CI/CD PIPELINE. Use when the user says 'add GitHub Actions / create a CI pipeline / automate my test runs'. Generates a pre-configured workflow file for GitHub Actions or GitLab CI — reads deviceName, execution command, and report path from mcp-config.json automatically. Writes the file to .github/workflows/ or gitlab-ci.yml. Returns: file path and workflow content.",
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
                    description: "TEACH A PROJECT RULE. Use when a generation was wrong and you know the correct pattern, or after fixing a broken selector. Saves the rule to .AppForge/mcp-learning.json. All future generate_cucumber_pom calls will incorporate it. Call this after every successful self-heal to prevent the same selector from breaking again. Returns: confirmation with the rule ID.",
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
                    description: "EXPORT LEARNED RULES. Generates a human-readable Markdown table of all rules taught via train_on_example. Use to review what the AI knows about your project, onboard new team members, or audit the knowledge base. Returns: Markdown document with all learned rules.",
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
                    description: "FIND CODE QUALITY ISSUES. Use when the user says 'clean up my test code / check for duplicate steps / is my code DRY'. Finds duplicate step definitions (cause Cucumber compile errors), potentially unused Page Object methods, and XPath over-usage percentage. Returns: { report: Markdown, duplicateStepCount, unusedMethodCount, xpathOverusePercent }. ⚠️ Unused method detection has high false-positive risk — verify manually before deleting code.",
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
                    description: "GENERATE JIRA BUG REPORT. Use when a failed test needs to be tracked in a ticket. Formats the test failure into a Jira-ready report with auto-classified severity (Critical/High/Medium/Low), reproduction steps, environment details, and suggested fix. Returns: Markdown ready to paste into Jira or any issue tracker.",
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
                    description: "CREATE FAKE TEST DATA. Use when tests need realistic randomized data (users, products, orders) or the user says 'generate test data / mock data / create a data factory'. Returns a generation prompt to create a typed Faker.js factory. YOU act on the prompt to produce the factory file. Returns: generation prompt text.",
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
                    description: "ASK THE USER A QUESTION. Use ONLY when you cannot proceed and no reasonable assumption is possible. This halts the workflow and presents the question to the user. PREFER making a sensible default assumption and logging a warning over stopping. NEVER call this in a loop — if the user already answered, proceed with their answer. Returns: the question displayed to the user.",
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
                    description: "FIND MISSING TEST COVERAGE. Use when the user says 'what screens are not tested / find coverage gaps / what scenarios am I missing'. Parses .feature files to identify untested screens, missing accessibility scenarios, and absent negative test cases. Returns: { report: coverage data, prompt: suggestions for new tests to write with generate_cucumber_pom }.",
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
                    description: "CONVERT EXISTING TESTS TO APPIUM. Use when the user has Espresso (Java), XCUITest (Swift), or Detox (JavaScript) tests and wants to migrate to Appium + Cucumber POM format. Returns a migration prompt with side-by-side construct mapping. YOU act on the prompt to produce the migrated files. Returns: migration prompt text.",
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
                    description: "CONNECT TO DEVICE. Use when the user says 'connect to the device / start a session / inspect the app / I want to see what's on screen'. Connects to Appium and starts a session on the device in mcp-config.json. The app must already be installed. Auto-forces noReset:true to skip reinstall. Returns: { sessionId, platform, device, elementsFound, message }. After success, call inspect_ui_hierarchy with no args to see the current screen.",
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
                    description: "DISCONNECT FROM DEVICE. Terminates the active Appium session and frees the device. Call when inspection or live testing is complete. No args needed. Returns: confirmation.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    }
                },
                {
                    name: "verify_selector",
                    description: "TEST A SELECTOR LIVE. Use after self_heal_test returns candidates to confirm a selector works before updating your Page Object. ⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. Returns: { exists, displayed, enabled, tagName, text }. If exists is true and this fixes a broken selector, also pass oldSelector and projectRoot to auto-learn the fix.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            selector: { type: "string", description: "The selector to verify (e.g. '~loginButton', 'id=com.app:id/btn')." },
                            projectRoot: { type: "string", description: "Project root (required if auto-learning)." },
                            oldSelector: { type: "string", description: "The broken selector that was replaced (required if auto-learning)." }
                        },
                        required: ["selector"]
                    }
                },
                {
                    name: "workflow_guide",
                    description: "START HERE IF UNSURE. Returns the recommended step-by-step tool call sequence for common AppForge tasks. Call this FIRST if you don't know which tool to use or how to start. No side effects — safe to call at any time. Specify a workflow name for a focused guide, or omit to see all workflows. Returns: { workflows: { [name]: { description, steps[] } } }.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workflow: {
                                type: "string",
                                enum: ["new_project", "write_test", "run_and_heal", "inspect_device", "all"],
                                description: "Which workflow to return. Omit or use 'all' to see every workflow."
                            }
                        },
                        required: []
                    }
                }
            ],
        }));
        // ─── Tool Dispatcher ──────────────────────────────────
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const args = request.params.arguments;
                switch (request.params.name) {
                    case "setup_project": {
                        // Use sensible defaults rather than blocking clarifications
                        const platform = args.platform ?? 'android';
                        const appName = args.appName ?? 'MyApp';
                        const result = await this.projectSetupService.setup(args.projectRoot, platform, appName);
                        return this.textResult(`${result}\n\n✅ Project scaffolded. Next: use manage_config (operation: 'read') to review your capabilities, then start_appium_session to connect to your device.`);
                    }
                    case "upgrade_project":
                        return this.textResult(await this.projectMaintenanceService.upgradeProject(args.projectRoot));
                    case "repair_project":
                        return this.textResult(await this.projectMaintenanceService.repairProject(args.projectRoot, args.platform));
                    case "manage_config":
                        if (args.operation === "read") {
                            return this.textResult(JSON.stringify(this.configService.read(args.projectRoot), null, 2));
                        }
                        else {
                            this.configService.write(args.projectRoot, args.config);
                            return this.textResult("Configuration updated successfully.");
                        }
                    case "inject_app_build":
                        this.configService.updateAppPath(args.projectRoot, args.platform, args.appPath, args.forceWrite);
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
                        if (analysis.existingPageObjects.length === 0) {
                            console.warn(`[AppForge] ⚠️ No page objects detected in ${paths.pagesRoot}. Proceeding with fresh generation.`);
                        }
                        const learningPrompt = this.learningService.getKnowledgePromptInjection(args.projectRoot);
                        const prompt = this.generationService.generateAppiumPrompt(args.projectRoot, args.testDescription, config, analysis, args.testName, learningPrompt, args.screenXml, args.screenshotBase64);
                        return this.textResult(prompt);
                    }
                    case "audit_utils": {
                        // BUG-12 FIX: Pass customWrapperPackage so methods from shared helper
                        // packages (e.g. @company/appium-helpers) are counted as present.
                        const result = await this.utilAuditService.audit(args.projectRoot, args.customWrapperPackage);
                        return this.textResult(JSON.stringify({
                            msg: "🔧 Util coverage suggestions",
                            ...result
                        }, null, 2));
                    }
                    case "validate_and_write":
                        return this.textResult(await this.fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.dryRun));
                    case "run_cucumber_test": {
                        const result = await this.executionService.runTest(args.projectRoot, {
                            tags: args.tags,
                            platform: args.platform,
                            specificArgs: args.specificArgs,
                            overrideCommand: args.overrideCommand,
                            timeoutMs: args.timeoutMs
                        });
                        const hint = result.success
                            ? "✅ All tests passed. Call summarize_suite to generate the final report."
                            : "❌ Some tests failed. Call self_heal_test with the output to fix broken selectors.";
                        return this.textResult(JSON.stringify({ ...result, hint }, null, 2));
                    }
                    case "inspect_ui_hierarchy": {
                        // Pass raw arguments down. ExecutionService will auto-fetch XML + screenshot if xmlDump is missing.
                        const result = await this.executionService.inspectHierarchy(args.xmlDump, args.screenshotBase64);
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "self_heal_test": {
                        const healResult = await this.selfHealingService.healWithRetry(args.testOutput, args.xmlHierarchy, args.screenshotBase64 ?? '', args.attempt ?? 1);
                        return this.textResult(JSON.stringify({
                            candidates: healResult.instruction.alternativeSelectors || [],
                            promptForLLM: healResult.prompt
                        }, null, 2));
                    }
                    case "set_credentials":
                        return this.textResult(await this.credentialService.setEnv(args.projectRoot, args.credentials));
                    case "manage_users":
                        return this.textResult(await this.credentialService.manageUsers(args.projectRoot, args.operation, args.env, args.users));
                    case "audit_mobile_locators": {
                        const config = this.configService.read(args.projectRoot);
                        const paths = this.configService.getPaths(config);
                        const report = await this.auditLocatorService.audit(args.projectRoot, [paths.pagesRoot, 'locators', 'src/locators']);
                        return this.textResult(report.markdownReport);
                    }
                    case "summarize_suite": {
                        const summary = await this.summarySuiteService.summarize(args.projectRoot, args.reportFile);
                        return this.textResult(JSON.stringify({
                            summary: summary.plainEnglishSummary,
                            data: {
                                total: summary.totalScenarios,
                                passed: summary.passed,
                                failed: summary.failed,
                                skipped: summary.skipped,
                                duration: summary.duration,
                                failedScenarios: summary.failedScenarios
                            },
                            hint: summary.failed > 0 ? "Call self_heal_test for any failing scenarios listed above." : "Tests passed. Ready for production push."
                        }, null, 2));
                    }
                    case "check_environment": {
                        const report = await this.environmentCheckService.check(args.projectRoot, args.platform, args.appPath);
                        return this.textResult(JSON.stringify({
                            summary: report.summary,
                            data: {
                                ready: report.ready,
                                failCount: report.checks.filter((c) => c.status === 'fail').length,
                                warnCount: report.checks.filter((c) => c.status === 'warn').length
                            },
                            hint: report.ready ? "✅ Environment ready. Call setup_project to scaffold your tests." : "❌ Environment issues found. Fix the failures before continuing."
                        }, null, 2));
                    }
                    case "generate_ci_workflow": {
                        const config = this.configService.read(args.projectRoot);
                        // Extract best-effort CI parameters from config
                        const executionCommand = config.project?.executionCommand;
                        let deviceName = args.platform === 'ios' ? 'iPhone 14' : 'Pixel_6';
                        for (const profile of Object.values(config.mobile?.capabilitiesProfiles || {})) {
                            if (profile.platformName?.toLowerCase() === args.platform && profile['appium:deviceName']) {
                                deviceName = profile['appium:deviceName'];
                                break;
                            }
                        }
                        // WDIO commonly uses _results_ or reports/
                        const reportPath = executionCommand?.includes('wdio') ? '_results_/' : 'reports/';
                        const workflow = this.ciWorkflowService.generate(args.provider, args.platform, {
                            nodeVersion: args.nodeVersion,
                            appiumVersion: args.appiumVersion,
                            executionCommand,
                            deviceName,
                            reportPath
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
                            hint: `✅ Session started on ${sessionInfo.deviceName} (${sessionInfo.platformName}). NEXT: Call inspect_ui_hierarchy (no args) to fetch live XML and see what's on screen.`
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
                    case "execute_sandbox_code": {
                        const v = this.validateArgs(args, ['script']);
                        if (v)
                            return v;
                        const apiRegistry = {
                            analyzeCodebase: async (projectRoot) => {
                                const config = this.configService.read(projectRoot);
                                const paths = this.configService.getPaths(config);
                                return this.analyzerService.analyze(projectRoot, paths);
                            },
                            runTests: async (projectRoot) => {
                                return this.executionService.runTest(projectRoot, {});
                            },
                            readFile: async (filePath) => {
                                const fs = await import('fs');
                                return fs.default.readFileSync(filePath, 'utf8');
                            },
                            getConfig: async (projectRoot) => {
                                return this.configService.read(projectRoot);
                            },
                        };
                        const sandboxResult = await executeSandbox(args.script, apiRegistry, { timeoutMs: args.timeoutMs });
                        if (sandboxResult.success) {
                            const parts = [];
                            if (sandboxResult.logs.length > 0) {
                                parts.push(`[Sandbox Logs]\n${sandboxResult.logs.join('\n')}`);
                            }
                            if (sandboxResult.result != null) {
                                parts.push(typeof sandboxResult.result === 'string'
                                    ? sandboxResult.result
                                    : JSON.stringify(sandboxResult.result, null, 2));
                            }
                            else if (sandboxResult.logs.length === 0) {
                                parts.push('⚠️ Sandbox executed successfully but returned no data. Ensure your script uses `return <value>` to send results back.');
                            }
                            parts.push(`\n⏱️ Executed in ${sandboxResult.durationMs}ms`);
                            return this.textResult(parts.join('\n\n'));
                        }
                        else {
                            return {
                                content: [{ type: "text", text: `❌ SANDBOX ERROR:\n${sandboxResult.error}\n\nLogs:\n${sandboxResult.logs.join('\n')}\n\n⏱️ Failed after ${sandboxResult.durationMs}ms` }],
                                isError: true
                            };
                        }
                    }
                    case "workflow_guide": {
                        const ALL_WORKFLOWS = {
                            new_project: {
                                description: "Set up a brand-new Appium Cucumber mobile automation project from scratch.",
                                steps: [
                                    "1. check_environment — Verify Node.js, Appium, Android SDK / Xcode, and connected device.",
                                    "2. setup_project — Scaffold the full project structure (BasePage, features, wdio config, hooks).",
                                    "3. manage_config (read) — Review the generated mcp-config.json.",
                                    "4. manage_config (write) — Set your deviceName, app path, platformVersion.",
                                    "5. inject_app_build — Point config to your .apk/.ipa file.",
                                    "6. start_appium_session — Verify the session starts successfully.",
                                    "7. end_appium_session — Clean up after verification."
                                ]
                            },
                            write_test: {
                                description: "Write a new Cucumber BDD test for a screen or feature in your app.",
                                steps: [
                                    "1. start_appium_session — Connect to the device.",
                                    "2. inspect_ui_hierarchy (no args) — Inspect the target screen to get real locators.",
                                    "3. generate_cucumber_pom — Generate the BDD test code using the screen XML.",
                                    "4. validate_and_write — Validate syntax and write the .feature, steps, and page files.",
                                    "5. run_cucumber_test — Run the new test to verify it passes.",
                                    "6. end_appium_session — Clean up."
                                ]
                            },
                            run_and_heal: {
                                description: "Run the test suite and fix any tests failing due to broken selectors.",
                                steps: [
                                    "1. run_cucumber_test — Run all or filtered tests.",
                                    "2. [If tests fail] inspect_ui_hierarchy — Get current XML from the failing screen.",
                                    "3. self_heal_test — Pass the failure output + XML to get replacement selector candidates.",
                                    "4. verify_selector — Confirm the best candidate works on the live device.",
                                    "5. Update the Page Object file with the working selector.",
                                    "6. train_on_example — Save the fix so it is never repeated.",
                                    "7. run_cucumber_test — Re-run to confirm everything passes."
                                ]
                            },
                            inspect_device: {
                                description: "Inspect the current app screen on a real device or emulator.",
                                steps: [
                                    "1. start_appium_session — Connect to the device.",
                                    "2. inspect_ui_hierarchy (no args) — Fetch live XML and screenshot.",
                                    "3. verify_selector — Test specific selectors on the live screen.",
                                    "4. end_appium_session — Release the device."
                                ]
                            }
                        };
                        const wf = args?.workflow;
                        const result = (!wf || wf === 'all')
                            ? ALL_WORKFLOWS
                            : ALL_WORKFLOWS[wf] ? { [wf]: ALL_WORKFLOWS[wf] } : ALL_WORKFLOWS;
                        return this.textResult(JSON.stringify({ workflows: result }, null, 2));
                    }
                    default:
                        throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
            catch (err) {
                if (err instanceof ClarificationRequired) {
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    action: 'CLARIFICATION_REQUIRED',
                                    question: err.question,
                                    context: err.context,
                                    options: err.options ?? []
                                }, null, 2)
                            }]
                    };
                }
                if (err instanceof AppForgeError) {
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    action: 'ERROR',
                                    code: err.code,
                                    message: err.message,
                                    remediation: err.remediation
                                }, null, 2)
                            }],
                        isError: true
                    };
                }
                return {
                    content: [{
                            type: "text", text: JSON.stringify({
                                action: 'ERROR',
                                code: 'UNHANDLED_ERROR',
                                message: err.message || String(err),
                                hint: 'Verify that projectRoot is an absolute path, mcp-config.json is valid JSON, and the Appium server is running (if using live session tools).'
                            }, null, 2)
                        }],
                    isError: true
                };
            }
        });
    }
    validateArgs(args, requiredFields) {
        const missing = requiredFields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
        if (missing.length === 0)
            return null;
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        code: 'VALIDATION_ERROR',
                        message: `Missing required argument(s): ${missing.join(', ')}`,
                        invalidFields: missing,
                        hint: 'Provide all required fields and retry.'
                    }, null, 2)
                }],
            isError: true
        };
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
const server = new AppForgeServer();
server.run().catch(console.error);
