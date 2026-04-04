# AI Deliverable Chunks - PHASE 4 & 5 Breakdown

## Overview
This document breaks down PHASE4_TEST_SUITE_PLAN.md and PHASE5_STRUCTURAL_GAPS_PLAN.md into manageable chunks that can be completed by AI in single conversations.

**Total Estimated Time:**
- Phase 4: 5-6 days
- Phase 5: 5-6 days
- **Total: 10-12 days**

---

# PHASE 4: TEST SUITE & INPUT VALIDATION

## Chunk 4.1: Test Infrastructure Setup
**Estimated Time:** 4-6 hours (Day 1)  
**Scope:** Foundation for all testing

### Deliverables
1. Jest configuration (`jest.config.js`)
2. Test utilities (`src/tests/testHelpers.ts`)
3. Mock fixtures directory structure
4. 3 sample handler tests as templates

### Files to Create
```
jest.config.js
src/tests/testHelpers.ts
src/tests/fixtures/sampleProject/
src/tests/fixtures/mockXml/
src/tests/fixtures/mockConfigs/
src/tests/handlers/setup/setupProject.test.ts (sample)
src/tests/handlers/config/manageConfig.test.ts (sample)
src/tests/handlers/generation/generateCucumberPom.test.ts (sample)
```

### Success Criteria
- ✅ `npm test` runs successfully
- ✅ 3 sample tests pass
- ✅ Test fixtures load correctly
- ✅ Mock helpers work for filesystem operations

---

## Chunk 4.2: Project Setup & Config Tests
**Estimated Time:** 6-8 hours (Day 2)  
**Scope:** 12 tests for setup and configuration tools

### Deliverables
1. **Setup Tools (6 tests)**
   - `setup_project` (4 tests: Android, iOS, invalid paths, both platforms)
   - `upgrade_project` (1 test: upgrades legacy structure)
   - `repair_project` (1 test: restores baseline files)

2. **Config Tools (6 tests)**
   - `manage_config` (3 tests: read, write, validation)
   - `inject_app_build` (2 tests: valid platform, invalid platform)
   - `set_credentials` (1 test: updates .env)

### Files to Create/Update
```
src/tests/handlers/setup/setupProject.test.ts
src/tests/handlers/setup/upgradeProject.test.ts
src/tests/handlers/setup/repairProject.test.ts
src/tests/handlers/config/manageConfig.test.ts
src/tests/handlers/config/injectAppBuild.test.ts
src/tests/handlers/config/setCredentials.test.ts
```

### Success Criteria
- ✅ 12 tests passing
- ✅ Platform-specific behavior tested (Issue #16)
- ✅ Mock filesystem operations working
- ✅ Error paths tested

---

## Chunk 4.3: Test Generation Tools
**Estimated Time:** 6-8 hours (Day 3)  
**Scope:** 8 tests for test generation and sandbox execution

### Deliverables
1. **Generation Tools (5 tests)**
   - `generate_cucumber_pom` (3 tests: Appium prompt, reuse steps, valid selectors)
   - `analyze_codebase` (2 tests: standard structure, empty project)

2. **Sandbox Execution (3 tests - SECURITY CRITICAL)**
   - `execute_sandbox_code` (3 tests: safe execution, block require(), enforce timeout)

### Files to Create
```
src/tests/handlers/generation/generateCucumberPom.test.ts
src/tests/handlers/generation/analyzeCodebase.test.ts
src/tests/handlers/generation/executeSandbox.test.ts
```

### Success Criteria
- ✅ 8 tests passing
- ✅ Appium/WebdriverIO identification correct (Issue #11)
- ✅ Sandbox security tests prevent require() and process access (Issue #19)
- ✅ Timeout enforcement working

---

## Chunk 4.4: Execution & Healing Tests
**Estimated Time:** 6-8 hours (Day 4)  
**Scope:** 6 tests for test execution and self-healing

### Deliverables
1. **Execution Tools (4 tests - SECURITY CRITICAL)**
   - `run_cucumber_test` (3 tests: valid tags, shell injection prevention, malicious args)
   - `inspect_ui_hierarchy` (1 test: Android XML parsing)

2. **Healing Tools (2 tests)**
   - `self_heal_test` (1 test: proposes healed selectors)
   - `verify_selector` (1 test: verifies on live device)

### Files to Create
```
src/tests/handlers/execution/runCucumberTest.test.ts
src/tests/handlers/execution/inspectUiHierarchy.test.ts
src/tests/handlers/execution/selfHealTest.test.ts
src/tests/handlers/session/verifySelector.test.ts
```

### Success Criteria
- ✅ 6 tests passing
- ✅ Shell injection prevention tested (Issue #17, CB-1)
- ✅ Tag sanitization working
- ✅ Valid WebdriverIO selectors generated (Issue #15)

---

## Chunk 4.5: Audit & Validation Tests
**Estimated Time:** 6-8 hours (Day 5)  
**Scope:** 14 tests for audit, validation, and remaining tools

### Deliverables
1. **Audit Tools (6 tests)**
   - `audit_utils` (2 tests: scans utils, handles missing)
   - `audit_mobile_locators` (2 tests: XPath detection, YAML selectors)
   - `suggest_refactorings` (2 tests: uses mcp-config dirs, empty project)

2. **Validation Tools (3 tests - SECURITY CRITICAL)**
   - `validate_and_write` (3 tests: TypeScript validation, rollback, directory traversal)

3. **User Management (3 tests)**
   - `manage_users` (3 tests: read from testData dir, write to dir, missing env)

4. **Session & Reports (2 tests)**
   - `start_appium_session` (1 test: valid capabilities)
   - `summarize_suite` (1 test: parses JSON report)

### Files to Create
```
src/tests/handlers/audit/auditUtils.test.ts
src/tests/handlers/audit/auditMobileLocators.test.ts
src/tests/handlers/audit/suggestRefactorings.test.ts
src/tests/handlers/validation/validateAndWrite.test.ts
src/tests/handlers/users/manageUsers.test.ts
src/tests/handlers/session/startAppiumSession.test.ts
src/tests/handlers/reports/summarizeSuite.test.ts
```

### Success Criteria
- ✅ 14 tests passing
- ✅ Path resolution issues tested (Issues #13, #14, #20)
- ✅ Directory traversal prevention tested (CB-2)
- ✅ TypeScript validation/rollback tested (Issue #12)
- ✅ YAML selector coverage tested (Issue #18)

---

## Chunk 4.6: Input Validation Layer
**Estimated Time:** 8 hours (Day 6)  
**Scope:** Shared validation middleware for all tools

### Deliverables
1. **Core Validators**
   - Path validation
   - Shell safety validation
   - Directory traversal prevention
   - Platform/tag expression validation

2. **Validation Middleware**
   - Schema definitions for all 30+ tools
   - Validation runner
   - Handler wrapper

3. **Integration**
   - Update 5 critical handlers with validation
   - 10+ validation tests

### Files to Create
```
src/utils/ValidationMiddleware.ts
src/utils/SecurityValidators.ts
src/utils/HandlerWrapper.ts
src/config/validationSchemas.ts
src/tests/validation/pathValidator.test.ts
src/tests/validation/paramValidator.test.ts
src/tests/validation/securityValidator.test.ts
```

### Success Criteria
- ✅ All validators working
- ✅ Schema definitions complete
- ✅ 5 handlers updated and tested
- ✅ Security regression tests passing

---

# PHASE 5: STRUCTURAL GAPS

## Chunk 5.1: Versioning & Changelog
**Estimated Time:** 6-8 hours (Day 1)  
**Scope:** Version management and documentation

### Deliverables
1. **Version Infrastructure**
   - Version constant and getter
   - Tool manifest version field
   - Build metadata

2. **Documentation**
   - Complete CHANGELOG.md with historical entries
   - DEPRECATION_POLICY.md
   - Version update in all tool schemas

### Files to Create/Update
```
src/version.ts
CHANGELOG.md
DEPRECATION_POLICY.md
src/index.ts (add version to tool manifest)
```

### Success Criteria
- ✅ Version exposed in tool manifest
- ✅ CHANGELOG.md complete
- ✅ Deprecation policy documented
- ✅ All tools show version field

---

## Chunk 5.2: Error Contract Foundation
**Estimated Time:** 4-6 hours (Day 2)  
**Scope:** Standard response types and error factory

### Deliverables
1. **Response Types**
   - SuccessResponse and ErrorResponse interfaces
   - ErrorCode enum
   - ToolResponse union type

2. **Error Factory**
   - Standard error creators
   - Error message formatting
   - Details handling

### Files to Create
```
src/types/Response.ts
src/utils/ErrorFactory.ts
src/tests/Response.test.ts
```

### Success Criteria
- ✅ Type definitions complete
- ✅ Error factory working
- ✅ Tests passing
- ✅ Type-safe error creation

---

## Chunk 5.3: Error Handler & Migration (Part 1)
**Estimated Time:** 4 hours (Day 2)  
**Scope:** Global error handler and 10 handler migrations

### Deliverables
1. **Error Handler**
   - safeExecute wrapper
   - Request ID support
   - Execution time tracking

2. **Handler Migration**
   - Update 10 critical handlers
   - Error response tests

### Files to Create/Update
```
src/utils/ErrorHandler.ts
src/tests/ErrorHandler.test.ts
Update 10 handlers to use error contract
```

### Success Criteria
- ✅ safeExecute wrapper working
- ✅ 10 handlers migrated
- ✅ Consistent error responses
- ✅ No unhandled exceptions

---

## Chunk 5.4: Error Handler Migration (Part 2)
**Estimated Time:** 4 hours (Day 3)  
**Scope:** Remaining 20+ handler migrations

### Deliverables
1. **Complete Migration**
   - Update remaining 20+ handlers
   - Integration tests
   - Client compatibility tests

### Files to Update
```
All remaining handlers in src/index.ts
src/tests/integration/errorContract.test.ts
```

### Success Criteria
- ✅ All 30+ handlers using error contract
- ✅ Zero handlers throw unhandled exceptions
- ✅ Integration tests passing
- ✅ Error codes documented

---

## Chunk 5.5: Session Store
**Estimated Time:** 6-8 hours (Day 4)  
**Scope:** Session lifecycle management

### Deliverables
1. **Session Store**
   - In-memory session storage
   - TTL and expiration
   - Cleanup timer
   - Graceful shutdown

2. **Updated Handlers**
   - start_appium_session
   - end_appium_session
   - verify_selector

3. **Tests**
   - Session lifecycle tests
   - TTL and cleanup tests
   - Shutdown tests

### Files to Create/Update
```
src/services/SessionStore.ts
src/tests/SessionStore.test.ts
Update session handlers
src/index.ts (shutdown hooks)
```

### Success Criteria
- ✅ Session store working
- ✅ TTL enforcement correct
- ✅ Automatic cleanup running
- ✅ Graceful shutdown tested
- ✅ No memory leaks

---

## Chunk 5.6: Structured Logging
**Estimated Time:** 4 hours (Day 5)  
**Scope:** JSON logging and log levels

### Deliverables
1. **Logger**
   - Structured JSON format
   - Log levels (DEBUG, INFO, WARN, ERROR)
   - Timestamp and metadata

2. **Integration**
   - Update 10 handlers with logging
   - Sensitive data sanitization

### Files to Create/Update
```
src/utils/Logger.ts
src/tests/Logger.test.ts
Update 10 handlers with logging
```

### Success Criteria
- ✅ JSON logs working
- ✅ Log levels configurable
- ✅ Sensitive data redacted
- ✅ Logs parseable

---

## Chunk 5.7: Request Tracing
**Estimated Time:** 4 hours (Day 5)  
**Scope:** Request ID generation and tracing

### Deliverables
1. **Request Tracer**
   - Request ID generation
   - Request lifecycle tracking
   - Performance timing
   - Argument sanitization

2. **Integration**
   - Wrap all handlers with tracing
   - Trace tests

### Files to Create/Update
```
src/utils/RequestTracer.ts
src/tests/RequestTracer.test.ts
Update all handlers with tracing
```

### Success Criteria
- ✅ Request IDs generated
- ✅ Request lifecycle tracked
- ✅ Performance metrics captured
- ✅ Sensitive args sanitized

---

## Chunk 5.8: Performance Metrics
**Estimated Time:** 4 hours (Day 6)  
**Scope:** Metrics collection and endpoint

### Deliverables
1. **Metrics System**
   - Tool execution metrics
   - Success/error tracking
   - Average duration calculation

2. **Metrics Endpoint** (Optional)
   - Express server
   - /metrics endpoint
   - System health data

3. **Tests**
   - Metrics collection tests
   - Endpoint tests

### Files to Create
```
src/utils/Metrics.ts
src/tests/Metrics.test.ts
src/index.ts (optional metrics endpoint)
```

### Success Criteria
- ✅ Metrics collected per tool
- ✅ Success rates calculated
- ✅ Average duration tracked
- ✅ Optional endpoint working

---

## Chunk 5.9: Final Integration & Testing
**Estimated Time:** 4 hours (Day 6)  
**Scope:** Complete integration and verification

### Deliverables
1. **Integration**
   - All handlers use error contract
   - All handlers use tracing
   - All handlers use logging

2. **Testing**
   - Integration tests
   - Performance tests
   - Documentation updates

3. **Verification**
   - Run all tests
   - Generate coverage report
   - Verify metrics
   - Update documentation

### Files to Update
```
README.md (add version, changelog references)
docs/UserGuide.md (add error codes)
All handlers (final review)
```

### Success Criteria
- ✅ All tests passing
- ✅ Coverage >80%
- ✅ All handlers integrated
- ✅ Documentation complete
- ✅ Production ready

---

# CHUNK PRIORITY GUIDE

## Critical Path (Must Complete First)
1. ✅ **Chunk 4.1** - Test Infrastructure Setup
2. ✅ **Chunk 4.6** - Input Validation Layer (Security foundation)
3. ✅ **Chunk 5.2** - Error Contract Foundation

## High Priority (Security & Core Functionality)
4. ✅ **Chunk 4.3** - Test Generation Tools (Security tests for sandbox)
5. ✅ **Chunk 4.4** - Execution & Healing Tests (Security tests for shell injection)
6. ✅ **Chunk 4.5** - Audit & Validation Tests (Directory traversal tests)
7. ✅ **Chunk 5.3** - Error Handler & Migration (Part 1)

## Medium Priority (Completeness)
8. ✅ **Chunk 4.2** - Project Setup & Config Tests
9. ✅ **Chunk 5.1** - Versioning & Changelog
10. ✅ **Chunk 5.4** - Error Handler Migration (Part 2)
11. ✅ **Chunk 5.5** - Session Store

## Standard Priority (Observability)
12. ✅ **Chunk 5.6** - Structured Logging
13. ✅ **Chunk 5.7** - Request Tracing
14. ✅ **Chunk 5.8** - Performance Metrics

## Final (Integration)
15. ✅ **Chunk 5.9** - Final Integration & Testing

---

# CONVERSATION GUIDELINES

## Each Chunk Should Include:
1. **Context Review:** Read relevant source files before starting
2. **Implementation:** Create/update files as specified
3. **Testing:** Run tests to verify functionality
4. **Verification:** Confirm all success criteria met
5. **Documentation:** Update inline comments and docs as needed

## Single Conversation Scope:
- ✅ 1 chunk = 1 conversation
- ✅ 4-8 hours of work per chunk
- ✅ 3-8 files created/updated
- ✅ Clear success criteria
- ✅ Verifiable completion

## Dependencies Between Chunks:
- Some chunks depend on others (marked in priority guide)
- Follow the priority guide or ensure dependencies are met
- Each chunk should be independently testable

---

# VERIFICATION COMMANDS

## After Each Test Chunk (4.1-4.5):
```bash
npm test -- <test-file-pattern>
npm test -- --coverage
```

## After Chunk 4.6 (Validation):
```bash
npm test -- validation/
npm test -- --coverage
```

## After Error Contract Chunks (5.2-5.4):
```bash
npm test -- Response.test.ts
npm test -- ErrorHandler.test.ts
```

## After Session Chunk (5.5):
```bash
npm test -- SessionStore.test.ts
```

## After Observability Chunks (5.6-5.8):
```bash
LOG_LEVEL=DEBUG npm start 2>&1 | jq -r '.message'
npm test -- Logger.test.ts
npm test -- Metrics.test.ts
```

## Final Verification (5.9):
```bash
npm test
npm test -- --coverage
npm run build
node dist/index.js --version
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-04  
**Status:** READY FOR USE  
**Total Chunks:** 15  
**Estimated Total Time:** 10-12 days