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
import * as fs from "fs";
import * as path from "path";
import { executeSandbox } from "./services/SandboxEngine.js";
import { JsonToPomTranspiler } from "./utils/JsonToPomTranspiler.js";
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
                    description: "Initialize a NEW project with standard Appium/Cucumber structure. ⚠️ WARNING: Run 'upgrade_project' instead if the project already exists to avoid overwriting your current configurations.",
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
                    name: "repair_project",
                    description: "Repair and restore missing baseline files after a partial or interrupted setup_project run. Safe to run at any time — only generates files that are missing and never overwrites existing ones.",
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
                    description: "⚠️ TOKEN-INTENSIVE (LEGACY): Scan the entire codebase. Only use this for projects with < 5 source files. FOR ALL OTHER PROJECTS, ALWAYS use 'execute_sandbox_code' (Turbo Mode) for 98% token savings.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "analyze_codebase_summary",
                    description: "🚀 LIGHTWEIGHT: Scans the project and returns ONLY structural metadata — file tree with line counts, exported class/function names, and import dependency graph. Never dumps file contents. Safe for projects of any size. Use this instead of analyze_codebase for initial project discovery.",
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
                    description: "[PROMPT-BUILDER] Returns an LLM prompt containing a complete BDD suite (feature + steps + page object) from plain English. Output must be passed to validate_and_write to save files to disk. Provide live Appium screenshots/XML if available to improve locator accuracy.",
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
                    description: "[ARTIFACT-WRITER] Validates TypeScript syntax (tsc --noEmit) and Gherkin syntax, then writes generated files to disk. This is the second step after generate_cucumber_pom — it physically creates the .feature, step-definitions, and page object files.",
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
                            jsonPageObjects: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        className: { type: "string" },
                                        path: { type: "string" },
                                        extendsClass: { type: "string" },
                                        imports: { type: "array", items: { type: "string" } },
                                        locators: { type: "array", items: { type: "object" } },
                                        methods: { type: "array", items: { type: "object" } }
                                    },
                                    required: ["className", "path"]
                                }
                            },
                            patches: {
                                type: "array",
                                description: "Directly apply string replacements to files. Useful for surgical edits rather than overriding the entire file.",
                                items: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string" },
                                        find: { type: "string", description: "The exact string to replace." },
                                        replace: { type: "string", description: "The new string to insert." }
                                    },
                                    required: ["path", "find", "replace"]
                                }
                            },
                            dryRun: { type: "boolean", description: "If true, validates code without writing to disk." }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "run_cucumber_test",
                    description: "[EXECUTOR] Runs the Cucumber/Appium test suite with tag/platform filtering and returns structured pass/fail results. Call this after validate_and_write to execute the generated tests.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            tags: { type: "string", description: "Cucumber tag expression, e.g. '@smoke and @android'" },
                            platform: { type: "string", enum: ["android", "ios"] },
                            overrideCommand: { type: "string", description: "Optional full command to run (e.g. 'npm run test:e2e:smoke'). Bypasses the default executionCommand." },
                            specificArgs: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "inspect_ui_hierarchy",
                    description: "[PROMPT-BUILDER] Call with NO arguments when a session is active — live XML is fetched automatically from the device. Use this after every perform_action step to read the new screen state. Optionally pass xmlDump to analyse a previously captured hierarchy offline. Pass the output to generate_cucumber_pom for accurate locator generation.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            xmlDump: { type: "string", description: "Optional: Appium XML page source. When omitted, live screen XML is fetched automatically from the active session." },
                            screenshotBase64: { type: "string" }
                        },
                        required: []
                    }
                },
                {
                    name: "self_heal_test",
                    description: "[PROMPT-BUILDER] Analyzes a failed test run using XML + screenshot and returns a prompt proposing healed selectors. After reviewing the output, use validate_and_write to apply the fixes.",
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
                    description: "[ARTIFACT-WRITER] Generates and writes a CI/CD workflow file (GitHub Actions or GitLab CI) directly to the project. The file is saved immediately — no validate_and_write step required.",
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
                            tags: { type: "array", items: { type: "string" } },
                            mandatory: { type: "boolean", description: "If true, generation will FAIL if this rule cannot be injected. Starts as 'draft' until approved." },
                            scope: { type: "string", enum: ["generation", "healing", "all"], description: "Which tool flows this rule applies to." },
                            priority: { type: "number", description: "Higher priority wins conflicts. Default: 0." },
                            conditions: {
                                type: "object",
                                description: "Optional fine-grained matching conditions.",
                                properties: {
                                    toolNames: { type: "array", items: { type: "string" } },
                                    platforms: { type: "array", items: { type: "string" } },
                                    keywordsAny: { type: "array", items: { type: "string" } },
                                    keywordsAll: { type: "array", items: { type: "string" } },
                                    regexAny: { type: "array", items: { type: "string" } },
                                    tagsAny: { type: "array", items: { type: "string" } }
                                }
                            }
                        },
                        required: ["projectRoot", "issuePattern", "solution"]
                    }
                },
                {
                    name: "manage_training_rules",
                    description: "List, update, approve, reject, or delete learned rules in .appium-mcp/mcp-learning.json. Use 'list' to review rules, 'update' to change a rule, 'delete' to remove a rule, 'approve' / 'reject' to change a mandatory rule's status. Use 'snapshot' to save the current corpus, 'list_snapshots' to see available backups, and 'rollback' to restore a previous state.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            operation: { type: "string", enum: ["list", "update", "delete", "approve", "reject", "health", "snapshot", "list_snapshots", "rollback"] },
                            ruleId: { type: "string", description: "Required for update/delete/approve/reject operations." },
                            snapshotPath: { type: "string", description: "Required for 'rollback' operation — path returned by 'snapshot' or 'list_snapshots'." },
                            updates: {
                                type: "object",
                                description: "Fields to update (for 'update' operation).",
                                properties: {
                                    pattern: { type: "string" },
                                    solution: { type: "string" },
                                    tags: { type: "array", items: { type: "string" } },
                                    mandatory: { type: "boolean" },
                                    scope: { type: "string", enum: ["generation", "healing", "all"] },
                                    priority: { type: "number" },
                                    conditions: { type: "object" }
                                }
                            },
                            filter: {
                                type: "object",
                                description: "Optional filter for 'list' operation.",
                                properties: {
                                    mandatory: { type: "boolean" },
                                    status: { type: "string", enum: ["draft", "approved", "rejected"] },
                                    scope: { type: "string", enum: ["generation", "healing", "all"] }
                                }
                            }
                        },
                        required: ["projectRoot", "operation"]
                    }
                },
                {
                    name: "verify_training",
                    description: "Dry-run: shows which learned rules would be injected for a given generation request, including mandatory rule enforcement status, injection preview, and prompt hash. Use before running generation to audit rule coverage.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            testDescription: { type: "string", description: "The generation request text to simulate." },
                            platform: { type: "string", enum: ["android", "ios", "both"] },
                            tags: { type: "array", items: { type: "string" } }
                        },
                        required: ["projectRoot", "testDescription"]
                    }
                },
                {
                    name: "analyze_training_rules_health",
                    description: "Inspect the learning corpus health: identify stale rules that never match, noisy rules that are repeatedly skipped, and mandatory rules awaiting approval.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
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
                    name: "analyze_code_quality",
                    description: "Wave 2 (1.2): Deep scan for code quality issues (magic numbers, inconsistent APIs, heavy Page Objects, dead code). Returns a structured JSON severity report.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "predict_flakiness",
                    description: "Wave 2 (3.1): Preventive risk scoring. Scans locators and async synchronization patterns to predict test flakiness before execution.",
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
                    description: "[PROMPT-BUILDER] Generates a Jira-formatted bug report from a failed Appium test with auto-classified severity. Returns formatted text ready to copy into your issue tracker.",
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
                    description: "[PROMPT-BUILDER] Returns an LLM prompt to generate a typed mock data factory using faker.js (TypeScript interface + builder function). Use validate_and_write to save the resulting file.",
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
                    description: "[PROMPT-BUILDER] Returns an LLM prompt to translate an existing Espresso, XCUITest, or Detox test file into Appium + Cucumber POM format. Pass the generated code to validate_and_write to persist it.",
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
                    description: "[EXECUTOR] Starts a live Appium session on a device/emulator and returns session ID, device info, and initial page source. Required first step before using inspect_ui_hierarchy or verify_selector in live mode. Supports Appium 1 and Appium 2 (auto-detected). Pass workflowSteps to anchor the AI's task plan server-side — every subsequent perform_action response will include the remaining steps so the AI can re-orient itself after context eviction.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectRoot: { type: "string" },
                            profileName: { type: "string", description: "Optional capability profile name from mcp-config.json." },
                            workflowSteps: {
                                type: "array",
                                items: { type: "string" },
                                description: "Optional: plain-English list of steps for this session (e.g. ['Tap Sign In', 'Enter username', 'Tap Login']). Persisted server-side and echoed as workflowProgress in every perform_action response."
                            }
                        },
                        required: ["projectRoot"]
                    }
                },
                {
                    name: "end_appium_session",
                    description: "[EXECUTOR] Terminates the active Appium session and releases the device. Returns explicit state: 'terminated' or 'no_active_session'.",
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
                },
                {
                    name: "execute_sandbox_code",
                    description: "🚀 TURBO MODE (RECOMMENDED): Execute a JavaScript snippet inside a secure V8 sandbox to analyze code, search for existing step definitions, or read specific files. Use this tool for ALL DATA RETRIEVAL AND SCANNING tasks to avoid token overflow. The script has access to `forge.api.*` and returns only the final filtered result. Available APIs: forge.api.analyzeCodebase(projectRoot), forge.api.runTests(projectRoot), forge.api.readFile(filePath), forge.api.getConfig(projectRoot).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            script: { type: "string", description: "The JavaScript code to execute. Use `return` to send a value back. Use `await forge.api.*()` to call server services." },
                            timeoutMs: { type: "number", description: "Optional execution timeout in milliseconds. Default: 10000 (10s)." }
                        },
                        required: ["script"],
                    },
                },
                {
                    name: "perform_action",
                    description: "[EXECUTOR] Perform an interaction on the live Appium session (tap, type, clear, swipe, back, home, screenshot). Returns a compact summary by default (~1 KB) — element count, screen title, and top interactive elements with selectors. For full locator inspection after navigating to a new screen, call inspect_ui_hierarchy with no arguments.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            action: {
                                type: "string",
                                enum: ["tap", "type", "clear", "swipe", "back", "home", "screenshot"],
                                description: "The interaction to perform."
                            },
                            selector: {
                                type: "string",
                                description: "Target element selector (e.g. '~loginButton', 'id=com.app:id/btn'). Required for tap, type, clear."
                            },
                            value: {
                                type: "string",
                                description: "Text input for 'type'; swipe direction ('up'|'down'|'left'|'right') for 'swipe'."
                            },
                            captureAfter: {
                                type: "boolean",
                                description: "If true (default), returns compact summary of screen state after the action."
                            }
                        },
                        required: ["action"]
                    }
                },
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
                    case "repair_project":
                        return this.textResult(await this.projectMaintenanceService.repairProject(args.projectRoot, args.platform ?? 'android'));
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
                        const result = await this.analyzerService.analyze(args.projectRoot);
                        try {
                            const config = this.configService.read(args.projectRoot);
                            config.paths = result.detectedPaths;
                            this.configService.write(args.projectRoot, config);
                        }
                        catch (e) {
                            // Ignore if config doesn't exist yet
                        }
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "analyze_codebase_summary": {
                        const summary = await this.analyzerService.analyzeSummary(args.projectRoot);
                        return this.textResult(JSON.stringify(summary, null, 2));
                    }
                    case "generate_cucumber_pom": {
                        const config = this.configService.read(args.projectRoot);
                        const analysis = await this.analyzerService.analyze(args.projectRoot);
                        // Persist the empirically discovered structural paths back to memory
                        config.paths = analysis.detectedPaths;
                        this.configService.write(args.projectRoot, config);
                        // ── Wave 0: Deterministic rule resolution + mandatory enforcement ──
                        const ctx = {
                            toolName: 'generate_cucumber_pom',
                            platform: config.mobile?.defaultPlatform,
                            // LS-16: Guard against undefined testDescription to prevent toLowerCase crash in LearningService
                            requestText: typeof args.testDescription === 'string' ? args.testDescription : '',
                            tags: [],
                        };
                        const resolved = await this.learningService.resolveApplicableRules(args.projectRoot, ctx);
                        // Hard-fail if any approved mandatory rule cannot be injected
                        if (resolved.skippedMandatoryRules.some(s => s.rule.status === 'approved')) {
                            const failures = resolved.skippedMandatoryRules
                                .filter(s => s.rule.status === 'approved')
                                .map(s => `  • [${s.rule.id}] "${s.rule.pattern}" — ${s.reason}`);
                            return {
                                content: [{ type: "text", text: `❌ GENERATION ABORTED — Mandatory rule enforcement failure.\n\n` +
                                            `The following approved mandatory rules could not be injected:\n${failures.join('\n')}\n\n` +
                                            `Fix the rule conditions or use manage_training_rules to update them before retrying.` }],
                                isError: true,
                            };
                        }
                        // Build injection block (throws if marker check fails)
                        let learningPrompt;
                        try {
                            learningPrompt = this.learningService.buildPromptInjection(resolved);
                        }
                        catch (enforcementError) {
                            return { content: [{ type: "text", text: `❌ ${enforcementError.message}` }], isError: true };
                        }
                        const prompt = this.generationService.generateAppiumPrompt(args.projectRoot, args.testDescription, config, analysis, args.testName, learningPrompt, args.screenXml, args.screenshotBase64);
                        // ── Wave 0: Write audit trail entry ──
                        const promptHash = this.learningService.hashPrompt(prompt);
                        await this.learningService.writeAuditEntry(args.projectRoot, {
                            timestamp: new Date().toISOString(),
                            toolName: 'generate_cucumber_pom',
                            requestSummary: args.testDescription.slice(0, 120),
                            applicableRuleIds: resolved.applicableRules.map(r => r.id),
                            appliedRuleIds: [...resolved.appliedMandatoryRules, ...resolved.appliedOptionalRules].map(r => r.id),
                            skippedRuleIds: [...resolved.skippedMandatoryRules, ...resolved.skippedOptionalRules].map(s => s.rule.id),
                            skippedReasons: Object.fromEntries([...resolved.skippedMandatoryRules, ...resolved.skippedOptionalRules].map(s => [s.rule.id, s.reason])),
                            promptHash,
                        });
                        return this.textResult(prompt);
                    }
                    case "validate_and_write": {
                        const { projectRoot, jsonPageObjects, dryRun, patches } = args;
                        const files = args.files || [];
                        if (jsonPageObjects && Array.isArray(jsonPageObjects)) {
                            for (const jsonPom of jsonPageObjects) {
                                if (jsonPom.className && jsonPom.path) {
                                    const generatedContent = JsonToPomTranspiler.transpile(jsonPom);
                                    files.push({
                                        path: jsonPom.path,
                                        content: generatedContent
                                    });
                                }
                            }
                        }
                        if (patches && Array.isArray(patches)) {
                            for (const patch of patches) {
                                const fullPath = path.join(projectRoot, patch.path);
                                if (fs.existsSync(fullPath)) {
                                    let content = fs.readFileSync(fullPath, 'utf8');
                                    content = content.replace(patch.find, patch.replace);
                                    // Check if file is already in our 'files' payload from a previous step to avoid conflicts
                                    const existingFile = files.find((f) => f.path === patch.path);
                                    if (existingFile) {
                                        existingFile.content = existingFile.content.replace(patch.find, patch.replace);
                                    }
                                    else {
                                        files.push({
                                            path: patch.path,
                                            content
                                        });
                                    }
                                }
                            }
                        }
                        return this.textResult(await this.fileWriterService.validateAndWrite(projectRoot, files, 3, dryRun));
                    }
                    case "run_cucumber_test": {
                        const config = this.configService.read(args.projectRoot);
                        const activeCommand = args.overrideCommand || config.executionCommand;
                        const result = await this.executionService.runTest(args.projectRoot, {
                            tags: args.tags,
                            platform: args.platform,
                            specificArgs: args.specificArgs,
                            executionCommand: activeCommand,
                            testRunTimeout: config.testRunTimeout
                        });
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "inspect_ui_hierarchy": {
                        // LS-05: When xmlDump is not provided, auto-fetch live page source
                        // from the active session instead of operating on stale/empty XML.
                        let liveXml = args.xmlDump;
                        if (!liveXml && this.appiumSessionService.isSessionActive()) {
                            liveXml = await this.appiumSessionService.getPageSource();
                        }
                        if (!liveXml) {
                            return {
                                content: [{ type: 'text', text: JSON.stringify({
                                            code: 'NO_XML_SOURCE',
                                            message: 'No xmlDump provided and no active Appium session. Either pass xmlDump or call start_appium_session first.',
                                            hint: 'Start a session with start_appium_session, then call inspect_ui_hierarchy without arguments to get live XML.'
                                        }, null, 2) }],
                                isError: true
                            };
                        }
                        const result = await this.executionService.inspectHierarchy(liveXml, args.screenshotBase64 ?? '');
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
                        // Return full structured report (includes patches) + markdown for human reading
                        return this.textResult(JSON.stringify({
                            schemaVersion: report.schemaVersion,
                            healthScore: report.healthScore,
                            totalLocators: report.totalLocators,
                            criticalCount: report.criticalCount,
                            actionablePatches: report.actionablePatches,
                            entries: report.entries,
                            markdownReport: report.markdownReport,
                        }, null, 2));
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
                        const rule = await this.learningService.learn(args.projectRoot, args.issuePattern, args.solution, args.tags ?? [], {
                            mandatory: args.mandatory ?? false,
                            scope: args.scope ?? 'all',
                            priority: args.priority ?? 0,
                            conditions: args.conditions ?? {},
                        });
                        const mandatoryNote = rule.mandatory
                            ? `\n⚠️ This rule is MANDATORY (status: ${rule.status}). ${rule.status === 'draft'
                                ? 'Run manage_training_rules with operation=\'approve\' to activate hard-fail enforcement.'
                                : 'Hard-fail enforcement is ACTIVE.'}`
                            : '';
                        return this.textResult(`✅ Learned rule "${rule.id}"\n` +
                            `Pattern : "${rule.pattern}"\n` +
                            `Solution: ${rule.solution}\n` +
                            `Scope   : ${rule.scope} | Priority: ${rule.priority}${mandatoryNote}`);
                    }
                    case "manage_training_rules": {
                        const { projectRoot, operation, ruleId, updates, filter } = args;
                        switch (operation) {
                            case 'list': {
                                const rules = this.learningService.listRules(projectRoot, filter);
                                return this.textResult(JSON.stringify({ schemaVersion: '2.0.0', count: rules.length, rules }, null, 2));
                            }
                            case 'update': {
                                if (!ruleId)
                                    return { content: [{ type: 'text', text: '❌ ruleId is required for update operation.' }], isError: true };
                                const updated = await this.learningService.updateRule(projectRoot, ruleId, updates ?? {});
                                if (!updated)
                                    return { content: [{ type: 'text', text: `❌ Rule "${ruleId}" not found.` }], isError: true };
                                return this.textResult(`✅ Rule "${ruleId}" updated.\n${JSON.stringify(updated, null, 2)}`);
                            }
                            case 'delete': {
                                if (!ruleId)
                                    return { content: [{ type: 'text', text: '❌ ruleId is required for delete operation.' }], isError: true };
                                const deleted = await this.learningService.forget(projectRoot, ruleId);
                                return deleted
                                    ? this.textResult(`✅ Rule "${ruleId}" deleted.`)
                                    : { content: [{ type: 'text', text: `❌ Rule "${ruleId}" not found.` }], isError: true };
                            }
                            case 'approve': {
                                if (!ruleId)
                                    return { content: [{ type: 'text', text: '❌ ruleId is required for approve operation.' }], isError: true };
                                const approved = await this.learningService.updateRule(projectRoot, ruleId, { status: 'approved' });
                                if (!approved)
                                    return { content: [{ type: 'text', text: `❌ Rule "${ruleId}" not found.` }], isError: true };
                                return this.textResult(`✅ Rule "${ruleId}" approved. Hard-fail enforcement is now ACTIVE for this rule.`);
                            }
                            case 'reject': {
                                if (!ruleId)
                                    return { content: [{ type: 'text', text: '❌ ruleId is required for reject operation.' }], isError: true };
                                const rejected = await this.learningService.updateRule(projectRoot, ruleId, { status: 'rejected' });
                                if (!rejected)
                                    return { content: [{ type: 'text', text: `❌ Rule "${ruleId}" not found.` }], isError: true };
                                return this.textResult(`✅ Rule "${ruleId}" rejected. It will no longer match or enforce.`);
                            }
                            case 'health': {
                                const health = this.learningService.analyzeRuleHealth(projectRoot);
                                return this.textResult(JSON.stringify(health, null, 2));
                            }
                            case 'snapshot': {
                                const snap = await this.learningService.createSnapshot(projectRoot);
                                return this.textResult(`✅ Snapshot created.\n` +
                                    `📁 Path: ${snap.snapshotPath}\n` +
                                    `📋 Rules captured: ${snap.ruleCount}\n` +
                                    `🕐 Created at: ${snap.createdAt}\n\n` +
                                    `Use manage_training_rules with operation='rollback' and snapshotPath='${snap.snapshotPath}' to restore.`);
                            }
                            case 'list_snapshots': {
                                const snapshots = this.learningService.listSnapshots(projectRoot);
                                if (snapshots.length === 0)
                                    return this.textResult('📭 No snapshots found. Use operation="snapshot" to create one.');
                                const lines = snapshots.map((s, i) => `${i + 1}. [${s.createdAt}] — ${s.ruleCount} rules\n   Path: ${s.snapshotPath}`);
                                return this.textResult(`📚 ${snapshots.length} snapshot(s) found (newest first):\n\n${lines.join('\n\n')}`);
                            }
                            case 'rollback': {
                                const snapshotPath = args.snapshotPath;
                                if (!snapshotPath)
                                    return { content: [{ type: 'text', text: '❌ snapshotPath is required for rollback operation.' }], isError: true };
                                const result = await this.learningService.rollbackToSnapshot(projectRoot, snapshotPath);
                                return this.textResult(`✅ Rollback complete.\n` +
                                    `🔄 Restored from: ${result.rolledBackTo}\n` +
                                    `💾 Safety backup at: ${result.safetyBackupPath}\n` +
                                    `📋 Rules restored: ${result.ruleCount}`);
                            }
                            default:
                                return { content: [{ type: 'text', text: `❌ Unknown operation: ${operation}` }], isError: true };
                        }
                    }
                    case "verify_training": {
                        const ctx = {
                            toolName: 'generate_cucumber_pom',
                            platform: args.platform,
                            requestText: args.testDescription,
                            tags: args.tags ?? [],
                        };
                        const result = this.learningService.verifyTraining(args.projectRoot, ctx);
                        return this.textResult(JSON.stringify(result, null, 2));
                    }
                    case "analyze_training_rules_health": {
                        const health = this.learningService.analyzeRuleHealth(args.projectRoot);
                        return this.textResult(JSON.stringify(health, null, 2));
                    }
                    case "export_team_knowledge":
                        return this.textResult(this.learningService.exportToMarkdown(args.projectRoot));
                    case "suggest_refactorings": {
                        const config = this.configService.read(args.projectRoot);
                        const analysis = await this.analyzerService.analyze(args.projectRoot);
                        return this.textResult(this.refactoringService.generateRefactoringSuggestions(analysis));
                    }
                    case "analyze_code_quality": {
                        const analysis = await this.analyzerService.analyze(args.projectRoot);
                        const report = await this.refactoringService.analyzeCodeQuality(args.projectRoot, analysis);
                        return this.textResult(JSON.stringify(report, null, 2));
                    }
                    case "predict_flakiness": {
                        const analysis = await this.analyzerService.analyze(args.projectRoot);
                        const report = await this.selfHealingService.predictFlakiness(args.projectRoot, analysis);
                        return this.textResult(JSON.stringify(report, null, 2));
                    }
                    case "export_bug_report": {
                        const bugValidation = this.validateArgs(args, ['testName', 'rawError']);
                        if (bugValidation)
                            return bugValidation;
                        return this.textResult(this.bugReportService.generateBugReport(args.testName, args.rawError, args.platform, args.deviceName, args.appVersion));
                    }
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
                        // LS-08: accept workflowSteps to persist the AI's task plan server-side
                        const sessionInfo = await this.appiumSessionService.startSession(args.projectRoot, args.profileName, args.workflowSteps);
                        const ls = sessionInfo.launchSummary;
                        return this.textResult(JSON.stringify({
                            sessionId: sessionInfo.sessionId,
                            platform: sessionInfo.platformName,
                            device: sessionInfo.deviceName,
                            appPackage: sessionInfo.appPackage,
                            bundleId: sessionInfo.bundleId,
                            // LS-09/10: return semantic topElements instead of just a count
                            elementCount: ls.elementCount,
                            screenTitle: ls.screenTitle,
                            topElements: ls.topElements,
                            workflowSteps: args.workflowSteps ?? null,
                            message: `Session started on ${sessionInfo.deviceName} (${sessionInfo.platformName}). ` +
                                `${ls.elementCount} elements on launch screen. ` +
                                (ls.topElements.length > 0
                                    ? `Top elements: ${ls.topElements.map(e => `${e.label} (${e.selector})`).join(', ')}.`
                                    : 'Use inspect_ui_hierarchy (no args) to fetch live XML.'),
                        }, null, 2));
                    }
                    case "end_appium_session": {
                        const sessionState = await this.appiumSessionService.endSession();
                        if (sessionState === 'no_active_session') {
                            return this.textResult(JSON.stringify({
                                status: 'no_active_session',
                                message: 'No active Appium session was found. Nothing to terminate.'
                            }, null, 2));
                        }
                        return this.textResult(JSON.stringify({
                            status: 'terminated',
                            message: 'Appium session terminated successfully.'
                        }, null, 2));
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
                    case "perform_action": {
                        // LS-06/07/08: Drive the live Appium session with compact-by-default responses
                        const actionValidation = this.validateArgs(args, ['action']);
                        if (actionValidation)
                            return actionValidation;
                        if (!this.appiumSessionService.isSessionActive()) {
                            return {
                                content: [{ type: 'text', text: JSON.stringify({
                                            code: 'NO_ACTIVE_SESSION',
                                            message: 'No active Appium session. Call start_appium_session first.',
                                            hint: 'Use start_appium_session to connect to a device, then use perform_action to interact.'
                                        }, null, 2) }],
                                isError: true
                            };
                        }
                        const actionResult = await this.appiumSessionService.performAction(args.action, args.selector, args.value, args.captureAfter !== false, // default true
                        args.verboseCapture === true // LS-07: opt-in only; default false
                        );
                        const screenInfo = actionResult.summary
                            ? `${actionResult.summary.elementCount} elements on new screen${actionResult.summary.screenTitle ? ` — "${actionResult.summary.screenTitle}"` : ''}.`
                            : '';
                        const successMsg = actionResult.success
                            ? `${args.action}${args.selector ? ` on ${args.selector}` : ''} succeeded. ${screenInfo}`
                            : `${args.action} failed: ${actionResult.error}`;
                        return this.textResult(JSON.stringify({
                            action: args.action,
                            selector: args.selector ?? null,
                            value: args.value ?? null,
                            success: actionResult.success,
                            error: actionResult.error ?? null,
                            // LS-07: compact summary always present; raw data only if verboseCapture
                            summary: actionResult.summary ?? null,
                            pageSource: actionResult.pageSource ?? null,
                            screenshot: actionResult.screenshot ?? null,
                            // LS-08: workflow re-orientation anchor
                            workflowProgress: actionResult.workflowProgress ?? null,
                            message: successMsg,
                        }, null, 2));
                    }
                    case "execute_sandbox_code": {
                        const apiRegistry = {
                            analyzeCodebase: async (projectRoot) => {
                                const config = this.configService.read(projectRoot);
                                return await this.analyzerService.analyze(projectRoot);
                            },
                            runTests: async (projectRoot) => {
                                return await this.executionService.runTest(projectRoot, {});
                            },
                            readFile: async (filePath) => {
                                if (!fs.existsSync(filePath))
                                    return null;
                                return fs.readFileSync(filePath, 'utf8');
                            },
                            getConfig: async (projectRoot) => {
                                return this.configService.read(projectRoot);
                            },
                            summarizeSuite: async (projectRoot) => {
                                return await this.summarySuiteService.summarize(projectRoot);
                            },
                            suggestRefactorings: async (projectRoot) => {
                                const config = this.configService.read(projectRoot);
                                const analysis = await this.analyzerService.analyze(projectRoot);
                                return this.refactoringService.generateRefactoringSuggestions(analysis);
                            },
                            analyzeCodeQuality: async (projectRoot) => {
                                const analysis = await this.analyzerService.analyze(projectRoot);
                                return await this.refactoringService.analyzeCodeQuality(projectRoot, analysis);
                            },
                            analyzeRuleHealth: async (projectRoot) => {
                                return this.learningService.analyzeRuleHealth(projectRoot);
                            }
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
                                content: [{ type: "text", text: `❌ SANDBOX ERROR: ${sandboxResult.error}\n\nLogs:\n${sandboxResult.logs.join('\n')}\n\n⏱️ Failed after ${sandboxResult.durationMs}ms` }],
                                isError: true,
                            };
                        }
                    }
                    default:
                        throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                const msg = error?.message || String(error);
                return {
                    content: [{ type: "text", text: JSON.stringify({
                                code: 'TOOL_EXECUTION_ERROR',
                                message: msg,
                                tool: request.params.name,
                                hint: 'Check the error message above for details. If this is an Appium connectivity issue, ensure Appium is running with: npx appium'
                            }, null, 2) }],
                    isError: true
                };
            }
        });
    }
    textResult(text) {
        return { content: [{ type: "text", text }] };
    }
    /**
     * Validates that required fields are present and non-empty in the args object.
     * Returns a structured isError response if any are missing, or null if all OK.
     *
     * Usage: const v = this.validateArgs(args, ['testName', 'rawError']); if (v) return v;
     */
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
                        expectedSchemaSnippet: Object.fromEntries(missing.map(f => [f, { type: 'string', required: true }])),
                        hint: 'Provide all required fields and retry.'
                    }, null, 2)
                }],
            isError: true
        };
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
            console.error("AppForge Server running on stdio");
        }
    }
}
const server = new AppForgeServer();
server.run().catch(console.error);
