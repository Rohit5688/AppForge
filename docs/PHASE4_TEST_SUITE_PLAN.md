# Phase 4 — Test Suite & Input Validation Plan

## Overview
Phase 4 addresses **Gap 1 (No Test Suite)** and **Gap 2 (No Input Validation Layer)** from the Production Readiness assessment. This phase establishes the testing foundation and implements a consistent validation framework across all MCP tools.

## Scope Summary
- **Gap 1:** Create comprehensive test suite (~40 tests) covering all handlers
- **Gap 2:** Implement shared input validation middleware
- **Estimated Effort:** 3-4 days AI + 1 day review
- **Recommended Model:** Claude Sonnet 4.5

---

## Phase 4.1 — Test Suite Development (Gap 1)

### Objective
Build a complete unit and integration test suite covering all MCP tool handlers with happy path, error path, and edge case coverage.

### Current State
- Zero unit/integration tests for handlers
- Some existing tests in `src/tests/` for isolated services
- No test coverage reporting
- Fixes are unverifiable without manual QA

### Target State
- Minimum 40 tests covering all 30+ MCP tools
- Each handler has:
  - ✅ Happy path test
  - ✅ At least one error/failure path test
  - ✅ Parameter validation test
- Test coverage >80% for handler logic
- Automated test execution in CI/CD

---

## Test Suite Architecture

### Framework & Tools
```typescript
// Test Stack
- Jest (test runner) — already in package.json
- @types/jest (TypeScript support)
- ts-jest (TypeScript transformation)
- Mock file system: memfs or mock-fs
- Mock child_process: jest.mock()
```

### Directory Structure
```
src/tests/
├── handlers/                    # Handler-level tests
│   ├── setup/
│   │   ├── setupProject.test.ts
│   │   ├── upgradeProject.test.ts
│   │   └── repairProject.test.ts
│   ├── generation/
│   │   ├── generateCucumberPom.test.ts
│   │   ├── analyzeCodebase.test.ts
│   │   └── executeSandbox.test.ts
│   ├── execution/
│   │   ├── runCucumberTest.test.ts
│   │   ├── selfHealTest.test.ts
│   │   └── inspectUiHierarchy.test.ts
│   ├── config/
│   │   ├── manageConfig.test.ts
│   │   ├── injectAppBuild.test.ts
│   │   └── setCredentials.test.ts
│   ├── users/
│   │   └── manageUsers.test.ts
│   ├── audit/
│   │   ├── auditUtils.test.ts
│   │   ├── auditMobileLocators.test.ts
│   │   └── suggestRefactorings.test.ts
│   ├── session/
│   │   ├── startAppiumSession.test.ts
│   │   ├── endAppiumSession.test.ts
│   │   └── verifySelector.test.ts
│   ├── reports/
│   │   ├── exportBugReport.test.ts
│   │   ├── summarizeSuite.test.ts
│   │   └── analyzeCoverage.test.ts
│   └── ci/
│       └── generateCiWorkflow.test.ts
├── integration/                 # Cross-handler workflows
│   ├── fullProjectSetup.test.ts
│   ├── testGenerationFlow.test.ts
│   └── healingWorkflow.test.ts
├── validation/                  # Input validation tests
│   ├── pathValidator.test.ts
│   ├── paramValidator.test.ts
│   └── securityValidator.test.ts
└── fixtures/                    # Test data
    ├── sampleProject/
    ├── mockXml/
    └── mockConfigs/
```

---

## Test Breakdown by Handler (~40 Tests)

### 1. Project Setup Tools (6 tests)
```typescript
// setup_project
- ✅ Creates Android project with correct structure
- ✅ Creates iOS project with correct wdio.ios.conf import (Issue #16)
- ❌ Rejects invalid projectRoot paths
- ✅ Creates both platforms correctly

// upgrade_project
- ✅ Upgrades legacy project structure
- ❌ Handles missing mcp-config.json gracefully

// repair_project
- ✅ Restores missing baseline files
- ❌ Rejects unsafe traversal paths
```

### 2. Test Generation Tools (8 tests)
```typescript
// generate_cucumber_pom
- ✅ Returns Appium/WebdriverIO prompt (not Playwright) (Issue #11)
- ✅ Reuses existing steps from codebase
- ✅ Generates valid Page Object selectors
- ❌ Handles missing screenXml gracefully

// analyze_codebase
- ✅ Scans standard project structure
- ✅ Respects mcp-config.json directories (Issue #13)
- ❌ Handles empty project

// execute_sandbox_code (Issue #19)
- ✅ Executes safe forge.api calls
- ❌ Blocks require() usage (SECURITY)
- ❌ Blocks process access (SECURITY)
- ✅ Enforces timeout correctly
```

### 3. Execution & Healing Tools (6 tests)
```typescript
// run_cucumber_test (Issue #17)
- ✅ Runs tests with valid tags
- ❌ Sanitizes tag expressions (SECURITY)
- ❌ Rejects malicious specificArgs (SECURITY)
- ✅ Handles test failure output

// self_heal_test
- ✅ Proposes healed selectors
- ❌ Handles missing XML input

// inspect_ui_hierarchy (Issue #15)
- ✅ Parses Android XML correctly
- ✅ Returns valid WebdriverIO selectors (not *[text()="..."]) (Issue #15)
- ❌ Handles malformed XML
```

### 4. Configuration Tools (6 tests)
```typescript
// manage_config
- ✅ Reads existing config
- ✅ Writes merged config correctly
- ❌ Validates config schema
- ❌ Prevents directory traversal (CB-2)

// inject_app_build
- ✅ Updates app path for platform
- ❌ Rejects invalid platform values

// set_credentials
- ✅ Updates .env file
- ❌ Prevents overwriting sensitive system files
```

### 5. User Management (3 tests)
```typescript
// manage_users (Issue #14)
- ✅ Reads users from mcp-config.json testData directory (Issue #14)
- ✅ Writes users to correct directory (Issue #14)
- ❌ Handles missing environment
```

### 6. Audit Tools (6 tests)
```typescript
// audit_utils (Issue #20)
- ✅ Scans mcp-config.json utils directory (Issue #20)
- ✅ Detects custom wrapper packages
- ❌ Handles missing utils directory

// audit_mobile_locators (Issue #18)
- ✅ Detects XPath locators
- ✅ Detects id= and CSS selectors in YAML (Issue #18)
- ❌ Handles invalid YAML gracefully

// suggest_refactorings (Issue #13)
- ✅ Uses mcp-config.json directories (Issue #13)
- ✅ Finds duplicate steps
- ❌ Handles empty project
```

### 7. Session Management (3 tests)
```typescript
// start_appium_session
- ✅ Starts session with valid capabilities
- ❌ Handles Appium server connection failure

// verify_selector
- ✅ Verifies selector on live device
- ❌ Returns false for missing element
```

### 8. Validation & Writing (3 tests)
```typescript
// validate_and_write (Issue #12, CB-2)
- ✅ Validates TypeScript before writing (Issue #12)
- ✅ Rolls back on tsc failure (Issue #12)
- ❌ Prevents directory traversal (CB-2)
```

### 9. Reporting Tools (2 tests)
```typescript
// summarize_suite
- ✅ Parses Cucumber JSON report
- ❌ Handles missing report file

// export_bug_report
- ✅ Generates Jira-formatted output
```

---

## Test Implementation Timeline

### Week 1 (Days 1-2): Foundation
| Day | Tasks | Deliverables |
|-----|-------|--------------|
| **Day 1** | Setup test infrastructure | - Jest config (`jest.config.js`)<br>- Test utilities (`testHelpers.ts`)<br>- Mock fixtures directory<br>- 3 sample handler tests |
| **Day 2** | Project setup & config tests | - 6 setup/upgrade/repair tests<br>- 6 config management tests<br>- Mock filesystem helpers |

### Week 1 (Days 3-4): Generation & Execution
| Day | Tasks | Deliverables |
|-----|-------|--------------|
| **Day 3** | Test generation tools | - 8 generation tests (analyze, generate, sandbox)<br>- Security tests for Issue #19 |
| **Day 4** | Execution & healing | - 6 execution tests<br>- Security tests for Issue #17 |

### Week 2 (Day 5): Audit & Validation
| Day | Tasks | Deliverables |
|-----|-------|--------------|
| **Day 5** | Audit & validation tools | - 6 audit tests (Issues #13, #18, #20)<br>- 3 validation tests (Issue #12, CB-2)<br>- 5 remaining tests (users, session, reports) |

---

## Phase 4.2 — Input Validation Layer (Gap 2)

### Objective
Implement a shared validation middleware that runs before all tool handlers, ensuring consistent parameter validation, type checking, and security enforcement.

### Current State
- Ad-hoc validation in each handler
- Inconsistent error messages
- Security checks duplicated or missing
- No central validation audit trail

### Target State
- Single `ValidationMiddleware` class
- All handlers use shared validators
- Consistent error response format
- Path traversal prevention (CB-2)
- Shell injection prevention (CB-1, #17)

---

## Validation Layer Architecture

### Core Components

```typescript
// src/utils/ValidationMiddleware.ts

interface ValidationRule {
  field: string;
  type: 'string' | 'boolean' | 'number' | 'object' | 'array';
  required: boolean;
  validator?: (value: any) => { valid: boolean; error?: string };
}

interface ValidationSchema {
  [toolName: string]: ValidationRule[];
}

class ValidationMiddleware {
  // Path safety
  validatePath(path: string, baseDir: string): ValidationResult;
  
  // Parameter validation
  validateParams(toolName: string, params: any): ValidationResult;
  
  // Security validation
  validateShellSafe(value: string): ValidationResult;
  validateNoTraversal(path: string): ValidationResult;
  
  // Type validation
  validatePlatform(platform: string): ValidationResult;
  validateTagExpression(tags: string): ValidationResult;
}
```

### Validation Schemas

```typescript
// src/config/validationSchemas.ts

export const TOOL_SCHEMAS: ValidationSchema = {
  setup_project: [
    { field: 'projectRoot', type: 'string', required: true, 
      validator: (v) => validatePath(v) },
    { field: 'platform', type: 'string', required: false,
      validator: (v) => validatePlatform(v) },
    { field: 'appName', type: 'string', required: false }
  ],
  
  run_cucumber_test: [
    { field: 'projectRoot', type: 'string', required: true,
      validator: (v) => validatePath(v) },
    { field: 'tags', type: 'string', required: false,
      validator: (v) => validateTagExpression(v) },  // Issue #17
    { field: 'specificArgs', type: 'string', required: false,
      validator: (v) => validateShellSafe(v) }  // Issue #17
  ],
  
  validate_and_write: [
    { field: 'projectRoot', type: 'string', required: true,
      validator: (v) => validatePath(v) },
    { field: 'files', type: 'array', required: true,
      validator: (v) => validateFileArray(v) },  // CB-2
    { field: 'dryRun', type: 'boolean', required: false }
  ],
  
  // ... schemas for all 30+ tools
};
```

### Security Validators

```typescript
// src/utils/SecurityValidators.ts

export function validatePath(path: string): ValidationResult {
  // No null bytes
  if (path.includes('\0')) {
    return { valid: false, error: 'Path contains null bytes' };
  }
  
  // No shell metacharacters
  const dangerous = /[;&|`$<>(){}[\]\\]/;
  if (dangerous.test(path)) {
    return { valid: false, error: 'Path contains shell metacharacters' };
  }
  
  // Must be absolute or relative (no protocol schemes)
  if (/^[a-z]+:\/\//i.test(path)) {
    return { valid: false, error: 'Path contains protocol scheme' };
  }
  
  return { valid: true };
}

export function validateNoTraversal(
  filePath: string, 
  baseDir: string
): ValidationResult {
  const resolved = path.resolve(baseDir, filePath);
  const base = path.resolve(baseDir);
  
  if (!resolved.startsWith(base)) {
    return { 
      valid: false, 
      error: `Path traversal detected: ${filePath}` 
    };
  }
  
  return { valid: true };
}

export function validateShellSafe(value: string): ValidationResult {
  // Reject shell metacharacters in arguments
  const dangerous = /[;&|`$<>(){}\\]/;
  if (dangerous.test(value)) {
    return { 
      valid: false, 
      error: 'Value contains shell metacharacters' 
    };
  }
  
  return { valid: true };
}

export function validateTagExpression(tags: string): ValidationResult {
  // Cucumber tags: @word, @word and @word, @word or @word, not @word
  const validPattern = /^[@\w\s()!&|,]+$/;
  if (!validPattern.test(tags)) {
    return { 
      valid: false, 
      error: 'Invalid tag expression format' 
    };
  }
  
  return { valid: true };
}

export function validatePlatform(platform: string): ValidationResult {
  const valid = ['android', 'ios', 'both'];
  if (!valid.includes(platform)) {
    return {
      valid: false,
      error: `Invalid platform: ${platform}. Must be: android, ios, or both`
    };
  }
  
  return { valid: true };
}
```

### Handler Integration

```typescript
// Before: Ad-hoc validation
export async function handleSetupProject(args: any) {
  if (!args.projectRoot) {
    throw new Error('projectRoot is required');
  }
  // ... rest of handler
}

// After: Middleware validation
export async function handleSetupProject(args: any) {
  // Validation happens automatically via middleware wrapper
  const result = ValidationMiddleware.validateParams('setup_project', args);
  if (!result.valid) {
    return { success: false, error: result.error };
  }
  
  // Handler logic assumes validated inputs
  const { projectRoot, platform = 'android', appName } = args;
  // ... rest of handler
}
```

### Middleware Wrapper

```typescript
// src/utils/HandlerWrapper.ts

export function withValidation(
  toolName: string,
  handler: (args: any) => Promise<any>
) {
  return async (args: any) => {
    // Pre-validation
    const validationResult = ValidationMiddleware.validateParams(
      toolName, 
      args
    );
    
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error,
        code: 'VALIDATION_ERROR'
      };
    }
    
    // Execute handler
    try {
      return await handler(args);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: 'HANDLER_ERROR'
      };
    }
  };
}

// Usage in index.ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'setup_project',
      description: '...',
      inputSchema: TOOL_SCHEMAS.setup_project
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // Wrap all handlers with validation
  const handlers = {
    setup_project: withValidation('setup_project', handleSetupProject),
    run_cucumber_test: withValidation('run_cucumber_test', handleRunCucumberTest),
    // ... all handlers
  };
  
  return handlers[name](args);
});
```

---

## Validation Layer Timeline

### Day 6: Implementation
| Hour | Task | Deliverable |
|------|------|-------------|
| 1-2 | Core validators | - `SecurityValidators.ts`<br>- Path, shell, traversal validators |
| 3-4 | Validation middleware | - `ValidationMiddleware.ts`<br>- Schema definitions |
| 5-6 | Handler integration | - `HandlerWrapper.ts`<br>- Update 5 critical handlers |
| 7-8 | Testing & validation | - 10+ validation tests<br>- Security regression tests |

---

## Success Criteria

### Test Suite (Gap 1)
- ✅ 40+ tests passing in CI/CD
- ✅ Coverage >80% for handler logic
- ✅ All security issues have regression tests (CB-1, CB-2, #17, #19)
- ✅ All path resolution issues have tests (#13, #14, #20)
- ✅ All selector generation issues have tests (#11, #15, #18)
- ✅ Jest runs in <30 seconds locally

### Validation Layer (Gap 2)
- ✅ All 30+ handlers use validation middleware
- ✅ Consistent error response format across all tools
- ✅ Zero shell injection vulnerabilities (CB-1, #17)
- ✅ Zero directory traversal vulnerabilities (CB-2)
- ✅ Path validation covers all filesystem operations
- ✅ 100% validation schema coverage

---

## Review Process

### Code Review Checklist
- [ ] All tests pass locally (`npm test`)
- [ ] Coverage report >80% for handlers
- [ ] No new security vulnerabilities introduced
- [ ] Validation middleware applied to all handlers
- [ ] Error messages are user-friendly and actionable
- [ ] Test fixtures are realistic (not toy examples)
- [ ] Integration tests cover multi-tool workflows

### Security Review Checklist
- [ ] All `execSync` calls use validated inputs
- [ ] All `path.join` operations check for traversal
- [ ] Tag expressions validated against whitelist
- [ ] Sandbox has no `require` or `process` access
- [ ] Platform enum validated before file generation
- [ ] AppBuild paths validated before config update

### Test Quality Review
- [ ] Each test has clear arrange/act/assert structure
- [ ] Mock data is realistic (not `foo`/`bar`)
- [ ] Error path tests verify exact error messages
- [ ] Integration tests clean up temp files
- [ ] No flaky tests (timing-dependent assertions)

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test suite takes >5 minutes | Slows development | Use Jest parallel execution; mock filesystem instead of real I/O |
| Validation breaks existing tools | Breaking change for MCP clients | Add `skipValidation` flag for backward compatibility; deprecate in v2.0 |
| False positive security blocks | Legitimate paths rejected | Expand whitelist; add override for trusted environments |
| Test maintenance burden | Tests become stale | Generate tests from schemas; automate coverage checks in CI |

---

## Dependencies

### Phase 4.1 (Tests)
- Jest, ts-jest, @types/jest
- memfs (mock filesystem)
- No external service dependencies

### Phase 4.2 (Validation)
- No new dependencies
- Uses Node.js built-in `path`, `fs`

---

## Deliverables

### Phase 4.1
1. **Test Infrastructure**
   - `jest.config.js`
   - `src/tests/testHelpers.ts`
   - `src/tests/fixtures/` directory

2. **Handler Tests** (40+ files)
   - All tests in `src/tests/handlers/`
   - Integration tests in `src/tests/integration/`

3. **Coverage Report**
   - HTML coverage report in `coverage/`
   - Badge in README.md

### Phase 4.2
1. **Validation Framework**
   - `src/utils/ValidationMiddleware.ts`
   - `src/utils/SecurityValidators.ts`
   - `src/utils/HandlerWrapper.ts`
   - `src/config/validationSchemas.ts`

2. **Updated Handlers**
   - All 30+ handlers wrapped with validation
   - Consistent error responses

3. **Validation Tests**
   - `src/tests/validation/` directory (10+ tests)

---

## Post-Phase 4 Verification

Run these commands to verify completion:

```bash
# Run full test suite
npm test

# Check coverage
npm test -- --coverage

# Verify no security issues
npm audit

# Test validation layer
npm test -- validation/

# Run specific handler tests
npm test -- handlers/execution/runCucumberTest.test.ts
```

**Expected Output:**
- ✅ 40+ tests passing
- ✅ Coverage >80%
- ✅ 0 security vulnerabilities
- ✅ All validation tests green

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-04  
**Status:** READY FOR IMPLEMENTATION  
**Next Phase:** [Phase 5 — Structural Gaps](./PHASE5_STRUCTURAL_GAPS_PLAN.md)