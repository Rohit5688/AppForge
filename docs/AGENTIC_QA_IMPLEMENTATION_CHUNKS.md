# Agentic QA Ecosystem - Implementation Chunks (One Chat Per Item)

## Overview

This document breaks down the complete Agentic QA Ecosystem into **discrete, deliverable chunks** that can each be implemented in a **single AI chat session**. Each chunk is self-contained, has clear inputs/outputs, and builds incrementally toward the complete system.

**Total Chunks:** 15  
**Estimated Timeline:** 12-15 weeks  
**Team:** 3 engineers + AI assistance

---

## 📦 CHUNK 1: Config Schema & Multi-Project Setup (Week 1)

### Goal
Create the foundational configuration system supporting multiple projects and repositories.

### Deliverables
1. `.mcp/config.json` schema definition
2. `ConfigManager` service to read/validate/write config
3. Support for environment variable interpolation ({{TOKENS}})
4. Multi-project structure (PROJ1, PROJ2, etc.)

### Input Requirements
- None (greenfield)

### Output
- `src/services/ConfigManager.ts`
- `docs/CONFIG_SCHEMA.md`
- Example configs for 2-3 projects

### Acceptance Criteria
- ✅ Can define multiple projects in single config
- ✅ Environment variables resolved correctly
- ✅ Schema validation catches invalid configs
- ✅ Config hot-reload support

### AI Chat Prompt
```
Create a ConfigManager service for AppForge/TestForge that:
1. Reads .mcp/config.json with multi-project support
2. Validates schema (Jira, GitHub repos, Figma, Xray, Slack)
3. Supports environment variable interpolation {{TOKEN}}
4. Handles multiple repositories per project (GitHub + GitLab)
5. Includes TypeScript interfaces for all config types

Use the schema from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 3.
```

### Dependencies
None

---

## 📦 CHUNK 2: External MCP Client Wrapper (Week 1-2)

### Goal
Create a service to call other MCP servers (Jira, Confluence, Figma, GitHub).

### Deliverables
1. `ExternalMcpClient` service
2. Methods: `callJiraTool()`, `callGitHubTool()`, `callFigmaTool()`, `callFetchTool()`
3. Error handling and retry logic
4. Connection testing utilities

### Input Requirements
- CHUNK 1: ConfigManager

### Output
- `src/services/ExternalMcpClient.ts`
- `src/tests/ExternalMcpClient.test.ts`

### Acceptance Criteria
- ✅ Can call Jira MCP: `get_issue`, `list_issues`, `add_comment`
- ✅ Can call GitHub MCP: `search_issues`, `get_file_contents`, `list_commits`
- ✅ Can call Figma MCP: `figma_get_file`, `figma_get_image`
- ✅ Can call Fetch MCP for arbitrary HTTP requests
- ✅ Graceful error handling with retry (3 attempts, exponential backoff)

### AI Chat Prompt
```
Create ExternalMcpClient service that wraps calls to external MCP servers:
- Jira MCP (@modelcontextprotocol/server-jira)
- GitHub MCP (@modelcontextprotocol/server-github) 
- Figma MCP (@modelcontextprotocol/server-figma)
- Fetch MCP (@modelcontextprotocol/server-fetch)

Include:
- Type-safe method signatures
- Retry logic (3 attempts, exponential backoff)
- Error handling
- Unit tests

Reference: docs/AGENTIC_QA_REVISED_PLAN_EXISTING_MCP.md Section 1.
```

### Dependencies
- CHUNK 1

---

## 📦 CHUNK 3: Multi-Repository Analyzer (Week 2)

### Goal
Search and analyze PRs across multiple GitHub/GitLab repositories.

### Deliverables
1. `MultiRepoAnalyzer` service
2. Search PRs across all configured repos
3. Aggregate changes from multiple repos
4. Determine test location strategy

### Input Requirements
- CHUNK 1: ConfigManager
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/MultiRepoAnalyzer.ts`
- `src/tests/MultiRepoAnalyzer.test.ts`

### Acceptance Criteria
- ✅ Searches GitHub repos for PRs mentioning ticket ID
- ✅ Searches GitLab repos (mixed repo types)
- ✅ Aggregates changed files across all repos
- ✅ Determines affected layers (frontend, API, mobile, etc.)
- ✅ Suggests test location strategy (single-repo, primary-repo, multi-repo)

### AI Chat Prompt
```
Create MultiRepoAnalyzer service for multi-repository code analysis:

Features:
1. Search for PRs mentioning Jira ticket across N repositories
2. Support both GitHub and GitLab in same project
3. Analyze PR changes (files, functions, edge cases from reviews)
4. Aggregate changes across repos
5. Determine test location strategy based on:
   - Single repo changed → tests there
   - Multiple but primary configured → E2E in primary
   - Multiple without primary → distributed tests

Implement the service from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 3.1.
```

### Dependencies
- CHUNK 1, CHUNK 2

---

## 📦 CHUNK 4: Fallback Strategy Manager (Week 2-3)

### Goal
Detect available systems and execute appropriate fallback strategy.

### Deliverables
1. `FallbackStrategyManager` service
2. System availability checker
3. Strategy determination logic
4. Fallback execution methods

### Input Requirements
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/FallbackStrategyManager.ts`
- `src/tests/FallbackStrategyManager.test.ts`

### Acceptance Criteria
- ✅ Tests connectivity to Jira, Confluence, GitHub, Figma, Xray
- ✅ Determines best strategy based on available systems
- ✅ Executes appropriate workflow (full, jira-github, jira-only, etc.)
- ✅ Clear warnings about degraded mode

### AI Chat Prompt
```
Create FallbackStrategyManager with graceful degradation:

System availability detection:
- Jira, Confluence, GitHub, Figma, Xray

Strategies (in priority order):
1. Full (all systems) → 100% quality
2. Jira+GitHub+Xray → 85%
3. Jira+GitHub → 70%
4. Jira+Design → 75%
5. Jira only → 50%
6. GitHub only → 60%
7. Manual → 40%

Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 2.
```

### Dependencies
- CHUNK 2

---

## 📦 CHUNK 5: GitHub Context Analyzer (Week 3)

### Goal
Extract code-level insights from GitHub PRs and code reviews.

### Deliverables
1. `GitHubContextAnalyzer` service
2. PR diff parsing
3. Code review comment extraction
4. Edge case identification from reviews

### Input Requirements
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/GitHubContextAnalyzer.ts`
- `src/tests/GitHubContextAnalyzer.test.ts`

### Acceptance Criteria
- ✅ Gets PR commits and diffs
- ✅ Parses diffs to extract new/modified functions
- ✅ Extracts edge cases from code review comments
- ✅ Detects API changes, DB migrations, frontend changes
- ✅ Returns structured context for test generation

### AI Chat Prompt
```
Create GitHubContextAnalyzer for code-level analysis:

Features:
1. Fetch PR commits and diffs
2. Parse diffs using AST (TypeScript/JavaScript: @babel/parser)
3. Extract new functions, modified functions
4. Extract edge cases from code review comments
   Example: "What if user requests multiple resets?" → rate limiting test
5. Detect: API changes, DB migrations, frontend changes

Implement from docs/AGENTIC_QA_FINAL_PLAN_WITH_GITHUB.md Section 5.
```

### Dependencies
- CHUNK 2

---

## 📦 CHUNK 6: Requirements Synthesizer (Week 4)

### Goal
Combine Jira + Confluence + GitHub + Figma into unified requirement.

### Deliverables
1. `RequirementsSynthesizer` service
2. Jira ticket fetching
3. Confluence PRD extraction
4. Multi-repo GitHub analysis integration
5. Figma/Sketch design linking

### Input Requirements
- CHUNK 2: ExternalMcpClient
- CHUNK 3: MultiRepoAnalyzer
- CHUNK 5: GitHubContextAnalyzer

### Output
- `src/services/RequirementsSynthesizer.ts`
- `src/tests/RequirementsSynthesizer.test.ts`

### Acceptance Criteria
- ✅ Fetches Jira ticket with ACs
- ✅ Extracts linked Confluence pages
- ✅ Gets GitHub PRs across all repos
- ✅ Identifies design files (Figma/Sketch)
- ✅ Returns comprehensive EnhancedRequirement object

### AI Chat Prompt
```
Create RequirementsSynthesizer that combines all data sources:

Workflow:
1. Fetch Jira ticket (issueKey)
2. Extract Confluence links from ticket description
3. Call MultiRepoAnalyzer for code changes
4. Extract Figma/Sketch links
5. Synthesize into EnhancedRequirement:
   - Business requirements (Jira ACs)
   - Technical specs (Confluence)
   - Code context (GitHub PRs)
   - UI expectations (Figma)
   - Edge cases (all sources combined)

Implement from docs/AGENTIC_QA_FINAL_PLAN_WITH_GITHUB.md Section 6.
```

### Dependencies
- CHUNK 2, CHUNK 3, CHUNK 5

---

## 📦 CHUNK 7: Visual Analyzer with VLM (Week 5)

### Goal
Analyze Figma/Sketch designs using Vision Language Models.

### Deliverables
1. `VisualAnalyzer` service
2. VLM integration (GPT-4o Vision or Claude 3.5 Sonnet)
3. Design file fetching
4. UI element detection

### Input Requirements
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/VisualAnalyzer.ts`
- `src/tests/VisualAnalyzer.test.ts`

### Acceptance Criteria
- ✅ Fetches Figma file structure
- ✅ Renders frames as images
- ✅ Analyzes images with VLM
- ✅ Identifies UI elements (buttons, inputs, error messages)
- ✅ Cross-validates with Figma node metadata

### AI Chat Prompt
```
Create VisualAnalyzer service with VLM integration:

Features:
1. Fetch Figma design via Figma MCP
2. Render specific frames as PNG
3. Analyze with GPT-4o Vision:
   Prompt: "Identify all UI elements, types, positions, expected behaviors"
4. Cross-validate VLM output with Figma JSON metadata
5. Generate visual validation test assertions

VLM provider: OpenAI GPT-4o (configurable)
Confidence threshold: 85%

Implement from docs/AGENTIC_QA_REVISED_PLAN_EXISTING_MCP.md.
```

### Dependencies
- CHUNK 2

---

## 📦 CHUNK 8: Test Generation Service Enhancement (Week 6)

### Goal
Enhance existing TestGenerationService to use multi-source requirements.

### Deliverables
1. Updated `TestGenerationService`
2. Multi-source test generation
3. Test categorization (happy/edge/visual/error)
4. Coverage area mapping

### Input Requirements
- CHUNK 6: RequirementsSynthesizer
- CHUNK 7: VisualAnalyzer
- Existing TestGenerationService (in TestForge/AppForge)

### Output
- `src/services/TestGenerationService.ts` (enhanced)
- `src/tests/TestGenerationService.enhanced.test.ts`

### Acceptance Criteria
- ✅ Generates tests from EnhancedRequirement
- ✅ Categorizes: happy-path, edge-case, visual, error-handling
- ✅ Maps coverage to changed files
- ✅ Uses existing POM patterns from codebase

### AI Chat Prompt
```
Enhance TestGenerationService to use multi-source requirements:

Input: EnhancedRequirement (from RequirementsSynthesizer)
  - Business requirements (Jira)
  - Code context (GitHub PRs)
  - Visual expectations (Figma)
  - Edge cases (aggregated)

Output: TestPlan with categorized tests:
  - Happy path (from Jira ACs)
  - Edge cases (from code reviews)
  - Visual validation (from Figma)
  - Error handling (from API contracts)

Use existing TestGenerationService as base, extend with new inputs.
```

### Dependencies
- CHUNK 6, CHUNK 7

---

## 📦 CHUNK 9: Xray Integration Service (Week 7)

### Goal
Push generated tests to Xray and link to Jira requirements.

### Deliverables
1. `XrayIntegration` service
2. Test case creation in Xray
3. Requirement linkage
4. Coverage report generation

### Input Requirements
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/XrayIntegration.ts`
- `src/tests/XrayIntegration.test.ts`

### Acceptance Criteria
- ✅ Creates test cases in Xray via API
- ✅ Links tests to Jira requirements (custom field)
- ✅ Adds to test sets
- ✅ Generates coverage matrix (requirements → tests)

### AI Chat Prompt
```
Create XrayIntegration service for test management:

Features:
1. Authenticate with Xray (OAuth2)
2. Create test cases from Gherkin
3. Link tests to Jira requirements (customfield)
4. Add to test sets (TS-PROJKEY-xxxx)
5. Generate coverage report:
   - Total requirements
   - Covered requirements
   - Coverage percentage
   - Gaps

Use Fetch MCP for Xray REST API calls.
Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 3.
```

### Dependencies
- CHUNK 2

---

## 📦 CHUNK 10: Agentic Orchestrator (Week 8)

### Goal
Main orchestrator coordinating the full workflow.

### Deliverables
1. `AgenticOrchestrator` service
2. End-to-end workflow coordination
3. Multi-repo test generation
4. Xray push and coverage tracking

### Input Requirements
- CHUNK 6: RequirementsSynthesizer
- CHUNK 7: VisualAnalyzer
- CHUNK 8: TestGenerationService
- CHUNK 9: XrayIntegration

### Output
- `src/services/AgenticOrchestrator.ts`
- `src/tests/AgenticOrchestrator.test.ts`

### Acceptance Criteria
- ✅ Orchestrates: Jira → Confluence → GitHub → Figma → Tests → Xray
- ✅ Handles multi-repo scenarios
- ✅ Determines test locations
- ✅ Writes tests to appropriate repos
- ✅ Links everything to Xray
- ✅ Returns comprehensive TestGenerationResult

### AI Chat Prompt
```
Create AgenticOrchestrator as main workflow coordinator:

Workflow:
1. Fetch requirements (RequirementsSynthesizer)
2. Analyze designs if available (VisualAnalyzer)
3. Generate tests (TestGenerationService)
4. Determine test locations (multi-repo strategy)
5. Write test files to repos
6. Push to Xray and link to Jira
7. Generate coverage report

Handle multi-repo scenarios:
- Single repo → tests there
- Multiple but primary → E2E in primary
- Multiple distributed → tests per repo

Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 3.1.
```

### Dependencies
- CHUNK 6, CHUNK 7, CHUNK 8, CHUNK 9

---

## 📦 CHUNK 11: Slack Notification Service (Week 9)

### Goal
Send rich Slack notifications for test generation.

### Deliverables
1. `SlackNotificationService`
2. Rich formatted notifications
3. Links to Jira and Xray
4. Test breakdown display

### Input Requirements
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/SlackNotificationService.ts`
- `src/tests/SlackNotificationService.test.ts`

### Acceptance Criteria
- ✅ Sends Slack webhook with rich blocks
- ✅ Shows test breakdown (happy/edge/visual/error)
- ✅ Links to Jira ticket and Xray test set
- ✅ Configurable per project

### AI Chat Prompt
```
Create SlackNotificationService for test generation alerts:

Features:
1. Use Fetch MCP to call Slack webhook
2. Rich Block Kit formatting:
   - Header: "Tests Generated for PROJ-123"
   - Fields: Project, Requirement, Test Count, Coverage %
   - Test breakdown: Happy/Edge/Visual/Error counts
   - Sources used: Jira/GitHub/Figma
   - Action buttons: View in Jira, View in Xray
3. Configurable per project (channel, enabled)

Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 1.
```

### Dependencies
- CHUNK 2

---

## 📦 CHUNK 12: Test Execution Feedback Loop (Week 9-10)

### Goal
Upload test execution results to Xray for tracking.

### Deliverables
1. `TestExecutionFeedbackService`
2. Test result parsing (Cucumber JSON, JUnit XML)
3. Xray execution creation
4. Historical trend analysis

### Input Requirements
- CHUNK 2: ExternalMcpClient
- CHUNK 9: XrayIntegration

### Output
- `src/services/TestExecutionFeedbackService.ts`
- `src/tests/TestExecutionFeedbackService.test.ts`

### Acceptance Criteria
- ✅ Parses test results (Cucumber/JUnit)
- ✅ Creates test execution in Xray
- ✅ Updates individual test statuses
- ✅ Adds comment to Jira ticket with results
- ✅ Generates historical trend (30 days)

### AI Chat Prompt
```
Create TestExecutionFeedbackService for result tracking:

Features:
1. Parse test results:
   - Cucumber JSON (cucumber-results.json)
   - JUnit XML (junit.xml)
2. Create Test Execution in Xray
3. Update test statuses (PASSED/FAILED/SKIPPED)
4. Add evidences (screenshots, logs)
5. Comment on Jira ticket with summary
6. Generate trend report (success rate over 30 days)

Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 3.
```

### Dependencies
- CHUNK 2, CHUNK 9

---

## 📦 CHUNK 13: Flaky Test Detector (Week 10)

### Goal
Detect flaky tests and create Jira tasks with AI analysis.

### Deliverables
1. `FlakyTestDetectorService`
2. Test execution history analysis
3. Jira task creation
4. AI-powered root cause analysis

### Input Requirements
- CHUNK 2: ExternalMcpClient
- CHUNK 9: XrayIntegration

### Output
- `src/services/FlakyTestDetectorService.ts`
- `src/tests/FlakyTestDetectorService.test.ts`

### Acceptance Criteria
- ✅ Queries Xray for last 30 days of executions
- ✅ Identifies flaky tests (10-90% failure rate)
- ✅ Creates Jira task (not GitHub issue)
- ✅ AI analysis: root causes, suggested fixes
- ✅ Deduplication (don't create duplicate tasks)

### AI Chat Prompt
```
Create FlakyTestDetectorService with AI analysis:

Features:
1. Query Xray for test execution history (30 days)
2. Identify flaky tests:
   - Min 10 executions
   - Min 3 failures
   - Failure rate 10-90%
3. Create Jira task:
   - Summary: "Flaky test: {testName}"
   - Description: Stats, recent failures
   - Priority: based on failure rate
   - Labels: flaky-test, auto-generated
4. AI analysis (GPT-4):
   - Common patterns
   - Potential causes (timing, race conditions, etc.)
   - Suggested fixes

Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 4.
```

### Dependencies
- CHUNK 2, CHUNK 9

---

## 📦 CHUNK 14: CI/CD Workflow Analyzer (Week 11)

### Goal
Analyze existing CI/CD workflows and generate intelligent test workflows.

### Deliverables
1. `CiWorkflowAnalyzer` service
2. Platform detection (GitHub Actions, GitLab CI, Jenkins)
3. Pattern extraction (node version, caching, parallelization)
4. Intelligent workflow generation

### Input Requirements
- CHUNK 2: ExternalMcpClient

### Output
- `src/services/CiWorkflowAnalyzer.ts`
- `src/tests/CiWorkflowAnalyzer.test.ts`

### Acceptance Criteria
- ✅ Detects CI platform
- ✅ Reads existing workflows
- ✅ Extracts patterns (node version, dependencies, caching)
- ✅ Generates workflow matching project style (NOT generic template)
- ✅ Supports: GitHub Actions, GitLab CI, Jenkins

### AI Chat Prompt
```
Create CiWorkflowAnalyzer for intelligent workflow generation:

Features:
1. Detect CI platform:
   - GitHub Actions (.github/workflows/*.yml)
   - GitLab CI (.gitlab-ci.yml)
   - Jenkins (Jenkinsfile)
2. Extract patterns from existing workflows:
   - Node version
   - Package manager (npm/pnpm/yarn)
   - Caching strategy
   - Parallelization
   - Test commands
3. Generate test workflow matching style:
   - Auto-detect Jira ticket from PR title
   - Call AgenticOrchestrator
   - Create PR with generated tests
   - Run tests and upload to Xray

NOT a generic template - reuse project patterns.
Implement from docs/AGENTIC_QA_COMPLETE_PLAN_WITH_FALLBACKS.md Section 2.
```

### Dependencies
- CHUNK 2

---

## 📦 CHUNK 15: Integration & End-to-End Testing (Week 12)

### Goal
Integration tests and full workflow validation.

### Deliverables
1. Integration test suite
2. End-to-end workflow tests
3. Fallback scenario tests
4. Documentation

### Input Requirements
- ALL PREVIOUS CHUNKS

### Output
- `src/tests/integration/`
- `docs/USER_GUIDE.md`
- `docs/TROUBLESHOOTING.md`

### Acceptance Criteria
- ✅ E2E test: Jira ticket → Tests generated → Xray linked
- ✅ Multi-repo test: Changes in 3 repos → Tests distributed
- ✅ Fallback tests: All 7 fallback scenarios validated
- ✅ Documentation complete
- ✅ Example projects ready

### AI Chat Prompt
```
Create integration tests and documentation:

Tests:
1. E2E happy path (all systems available)
2. Multi-repo scenario (3 repos changed)
3. Each fallback scenario (7 total)
4. Error handling (network failures, auth issues)
5. Performance (handle 100 requirements)

Documentation:
1. USER_GUIDE.md:
   - Setup instructions
   - Configuration examples
   - Usage examples
2. TROUBLESHOOTING.md:
   - Common issues
   - Fallback scenarios
   - Error messages

Run full workflow against test Jira/GitHub/Figma instances.
```

### Dependencies
- ALL CHUNKS

---

## 📊 Implementation Timeline

| Week | Chunks | Focus |
|------|--------|-------|
| 1 | 1-2 | Foundation (Config, MCP Client) |
| 2 | 3-4 | Multi-repo & Fallbacks |
| 3 | 5 | GitHub Analysis |
| 4 | 6 | Requirements Synthesis |
| 5 | 7 | Visual Intelligence |
| 6 | 8 | Test Generation |
| 7 | 9 | Xray Integration |
| 8 | 10 | Orchestration |
| 9 | 11-12 | Slack & Feedback Loop |
| 10 | 13 | Flaky Detection |
| 11 | 14 | CI/CD Intelligence |
| 12 | 15 | Integration & Docs |

---

## 🎯 Dependency Graph

```
CHUNK 1 (Config)
  └─→ CHUNK 2 (MCP Client)
        ├─→ CHUNK 3 (Multi-Repo)
        ├─→ CHUNK 4 (Fallbacks)
        ├─→ CHUNK 5 (GitHub)
        ├─→ CHUNK 7 (Visual)
        ├─→ CHUNK 9 (Xray)
        ├─→ CHUNK 11 (Slack)
        └─→ CHUNK 14 (CI/CD)

CHUNK 3, 5 → CHUNK 6 (Requirements)
CHUNK 6, 7 → CHUNK 8 (Test Gen)
CHUNK 6-9  → CHUNK 10 (Orchestrator)
CHUNK 9    → CHUNK 12, 13
ALL        → CHUNK 15
```

---

## ✅ Success Criteria

### Per Chunk
- Code complete and tested
- Unit tests passing
- Integration with previous chunks validated
- Documentation updated

### Overall System
- Can generate tests from Jira ticket end-to-end
- Multi-repo support working
- All 7 fallback scenarios functional
- Slack notifications sent
- Xray linkage complete
- Flaky tests detected
- CI/CD workflows generated

---

## 📝 Notes

1. **Each chunk is independent** - Can be worked on in separate chat sessions
2. **Clear interfaces** - Chunks communicate via TypeScript interfaces
3. **Incremental value** - Each chunk adds functionality
4. **Testable** - Each chunk has unit tests
5. **Documented** - Each chunk updates relevant docs

---

**Document Version:** 1.0  
**Date:** 2026-01-04  
**Status:** READY FOR IMPLEMENTATION