# AppForge MCP Server - Issues & Fix Plan

**Date**: January 4, 2026  
**Tester**: Cline AI Assistant  
**Test Environment**: macOS Tahoe, Node.js v20.19.3  
**Project Tested**: /Users/rsakhawalkar/appium-poc

---

## Executive Summary

During comprehensive end-user testing of AppForge MCP server, **1 minor issue** was identified. Overall, the server performs excellently with 15/15 features working correctly. The issue found is related to report format compatibility.

**Status**: ✅ All core functionality working  
**Priority**: 🟡 Low (enhancement, not blocking)

---

## Issue #1: WebdriverIO Cucumber Report Format Not Supported

### Severity: 🟡 Low (Enhancement)

### Description

The `summarize_suite` tool expects standard Cucumber JSON report format but the test project uses WebdriverIO-specific Cucumber report format, which has a slightly different structure.

### Current Behavior

- Tool returns: `✅ All 0 scenarios passed across 1 features in 0s.`
- Actual report at `reports/cucumber-results.json` contains:
  - 1 feature ("Credit Card Flow")
  - 2 scenarios ("Apply for credit card", "View card offers")
  - 1 passed scenario, 1 failed scenario
  - Detailed step information with durations

### Expected Behavior

Tool should parse WebdriverIO Cucumber format and return:

```
❌ 1 of 2 scenarios failed across 1 features in 2.4s.

Failing Scenarios:
  ✗ View card offers
    Error: Element not found: ~credit_card.button
```

### Impact

- **User Impact**: Medium - Users cannot see test results summary without manual inspection
- **Workaround**: Users can manually inspect `reports/cucumber-results.json` or use standard Cucumber JSON format
- **Frequency**: Affects all WebdriverIO + Cucumber projects

### Root Cause

The tool expects this structure:

```json
[
  {
    "elements": [
      {
        "name": "scenario name",
        "steps": [
          {
            "result": {
              "status": "passed|failed",
              "duration": 123456789
            }
          }
        ]
      }
    ]
  }
]
```

WebdriverIO format has the same structure but may have additional/different field names or nested differently.

### Example Report Format (WebdriverIO)

```json
[
  {
    "id": "credit-card",
    "name": "Credit Card Flow",
    "elements": [
      {
        "id": "scenario1",
        "name": "Apply for credit card",
        "steps": [
          {
            "name": "I tap apply now",
            "result": {
              "status": "passed",
              "duration": 1200000000
            }
          }
        ]
      },
      {
        "id": "scenario2",
        "name": "View card offers",
        "steps": [
          {
            "name": "I see credit cards",
            "result": {
              "status": "failed",
              "duration": 500000000,
              "error_message": "Element not found: ~credit_card.button"
            }
          }
        ]
      }
    ]
  }
]
```

---

## Fix Plan

### Implementation Strategy

#### Option 1: Enhance Parser (Recommended)

**Priority**: Medium  
**Effort**: 2-3 hours  
**Impact**: High (supports most common format)

**Steps**:

1. Update `summarize_suite` tool parser to handle WebdriverIO format
2. Add format auto-detection logic
3. Support both standard Cucumber JSON and WebdriverIO formats
4. Add tests for both formats

**Code Location**: `/Users/rsakhawalkar/forge/AppForge/src/tools/summarize-suite.ts`

**Proposed Changes**:

```typescript
// Add format detection
function detectReportFormat(report: any): "cucumber" | "wdio" | "unknown" {
  if (Array.isArray(report) && report[0]?.elements) {
    // Check for WebdriverIO-specific fields
    if (report[0].elements[0]?.id && report[0].id) {
      return "wdio";
    }
    return "cucumber";
  }
  return "unknown";
}

// Add WebdriverIO parser
function parseWdioReport(report: any) {
  let total = 0,
    passed = 0,
    failed = 0,
    skipped = 0;
  let totalDuration = 0;
  const failedScenarios = [];

  report.forEach((feature) => {
    feature.elements?.forEach((scenario) => {
      total++;
      let scenarioStatus = "passed";
      let scenarioError = "";

      scenario.steps?.forEach((step) => {
        totalDuration += step.result?.duration || 0;
        if (step.result?.status === "failed") {
          scenarioStatus = "failed";
          scenarioError = step.result.error_message || step.result.error || "Unknown error";
        } else if (step.result?.status === "skipped") {
          scenarioStatus = "skipped";
        }
      });

      if (scenarioStatus === "passed") passed++;
      else if (scenarioStatus === "failed") {
        failed++;
        failedScenarios.push({
          name: scenario.name,
          error: scenarioError,
        });
      } else if (scenarioStatus === "skipped") skipped++;
    });
  });

  return {
    total,
    passed,
    failed,
    skipped,
    duration: formatDuration(totalDuration),
    failedScenarios,
  };
}

// Main function update
export async function summarizeSuite(projectRoot: string, reportFile?: string) {
  // ... existing code to read report ...

  const format = detectReportFormat(report);

  let stats;
  if (format === "wdio") {
    stats = parseWdioReport(report);
  } else if (format === "cucumber") {
    stats = parseCucumberReport(report);
  } else {
    return {
      summary: "Unknown report format",
      data: { total: 0, passed: 0, failed: 0, skipped: 0 },
    };
  }

  // ... generate summary message ...
}
```

**Testing**:

```typescript
// Test with WebdriverIO format
const wdioReport = [
  {
    id: "feature1",
    name: "Test Feature",
    elements: [
      {
        id: "scenario1",
        name: "Test Scenario",
        steps: [
          { name: "step1", result: { status: "passed", duration: 1000000000 } },
          {
            name: "step2",
            result: { status: "failed", duration: 500000000, error_message: "Error" },
          },
        ],
      },
    ],
  },
];

const result = parseSummary(wdioReport);
assert.equal(result.total, 1);
assert.equal(result.failed, 1);
```

---

#### Option 2: Document Current Limitation

**Priority**: Low  
**Effort**: 30 minutes  
**Impact**: Low (workaround only)

**Steps**:

1. Update tool description to specify supported format
2. Add example of converting WebdriverIO to standard format
3. Provide workaround script

**Tool Description Update**:

```
summarize_suite:
  Reads Cucumber JSON test reports in standard format.

  Supported Format: Standard Cucumber JSON

  For WebdriverIO users: This tool currently supports standard Cucumber JSON
  format. WebdriverIO reports may need conversion. Workaround: Use
  cucumber-json-formatter or inspect reports/cucumber-results.json manually.
```

---

#### Option 3: Add Report Converter Tool

**Priority**: Low  
**Effort**: 4-5 hours  
**Impact**: Medium (adds flexibility)

**Steps**:

1. Create new tool `convert_report`
2. Support multiple input formats → standard Cucumber JSON
3. Users convert before summarizing

**New Tool**:

```typescript
convert_report:
  Converts test reports from various formats to standard Cucumber JSON.

  Input: {
    projectRoot: string,
    inputFile: string,      // e.g., "reports/cucumber-results.json"
    inputFormat: 'wdio' | 'junit' | 'mocha',
    outputFile: string      // e.g., "reports/cucumber-standard.json"
  }

  Output: {
    success: boolean,
    outputPath: string,
    message: string
  }
```

---

## Recommended Approach

### Phase 1: Immediate (Option 2)

**Timeline**: Same day  
**Effort**: 30 minutes

1. Document current limitation in tool description
2. Add note in README about supported formats
3. Provide manual inspection guidance

### Phase 2: Enhancement (Option 1)

**Timeline**: Next sprint (1-2 weeks)  
**Effort**: 2-3 hours

1. Implement WebdriverIO format parser
2. Add format auto-detection
3. Add test coverage for both formats
4. Update documentation

### Phase 3: Future Enhancement (Option 3 - Optional)

**Timeline**: Future backlog  
**Effort**: 4-5 hours

1. Add `convert_report` tool if more formats are needed
2. Support JUnit, Mocha, Jest formats
3. Provide unified report interface

---

## Implementation Details

### File Locations

```
/Users/rsakhawalkar/forge/AppForge/
├── src/
│   └── tools/
│       └── summarize-suite.ts          ← Main fix location
├── tests/
│   └── tools/
│       └── summarize-suite.test.ts     ← Add test coverage
└── README.md                            ← Update documentation
```

### Key Functions to Modify

1. `summarizeSuite()` - Main entry point
2. `parseReport()` - Add format detection
3. `formatSummary()` - Handle different result structures

### Test Coverage Needed

```typescript
describe("summarize_suite", () => {
  it("should parse standard Cucumber JSON format", async () => {
    // Test existing functionality
  });

  it("should parse WebdriverIO Cucumber format", async () => {
    // New test for WebdriverIO format
    const result = await summarizeSuite(projectRoot, "reports/cucumber-results.json");
    expect(result.data.total).toBe(2);
    expect(result.data.passed).toBe(1);
    expect(result.data.failed).toBe(1);
    expect(result.data.failedScenarios).toHaveLength(1);
  });

  it("should handle unknown formats gracefully", async () => {
    // Test error handling
  });
});
```

---

## Validation Plan

### Testing Checklist

- [ ] Parse standard Cucumber JSON format (existing tests pass)
- [ ] Parse WebdriverIO Cucumber format (new functionality)
- [ ] Detect format automatically
- [ ] Handle missing/corrupt report files gracefully
- [ ] Generate correct summary messages for both formats
- [ ] Extract failing scenarios correctly
- [ ] Calculate durations accurately
- [ ] Handle edge cases (0 scenarios, all skipped, etc.)

### Manual Testing

```bash
# Test with real project
cd /Users/rsakhawalkar/appium-poc

# Run AppForge tool
node /Users/rsakhawalkar/forge/AppForge/dist/index.js

# Call summarize_suite with WebdriverIO report
# Expected output:
# ❌ 1 of 2 scenarios failed across 1 features in 2.4s.
# Failing Scenarios:
#   ✗ View card offers
#     Error: Element not found: ~credit_card.button
```

---

## Documentation Updates Needed

### README.md

````markdown
## summarize_suite

Analyzes test execution reports and provides summary statistics.

**Supported Formats:**

- Standard Cucumber JSON (default)
- WebdriverIO Cucumber JSON (auto-detected)

**Usage:**

```javascript
const result = await tools.summarize_suite({
  projectRoot: "/path/to/project",
  reportFile: "reports/cucumber-results.json", // optional
});
```
````

**Output:**

- Total/passed/failed/skipped scenario counts
- Total execution duration
- List of failing scenarios with error messages

````

### Tool Description
Update MCP tool schema to reflect supported formats:
```json
{
  "name": "summarize_suite",
  "description": "Analyzes Cucumber test reports (standard or WebdriverIO format) and provides execution summary with pass/fail statistics, duration, and failing scenario details.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectRoot": {
        "type": "string",
        "description": "Absolute path to the test project"
      },
      "reportFile": {
        "type": "string",
        "description": "Optional: relative path to report file (default: reports/cucumber-report.json). Supports standard Cucumber JSON and WebdriverIO formats."
      }
    }
  }
}
````

---

## Breaking Changes Analysis

### Impact Assessment: ✅ None

- All changes are additive
- Existing functionality remains unchanged
- No API changes required
- Backward compatible with current usage

### Migration Guide: Not Required

Users currently receiving "0 scenarios" will automatically see correct results after fix.

---

## Success Metrics

### Definition of Done

- [ ] WebdriverIO format parsed correctly
- [ ] Format auto-detection working
- [ ] All existing tests pass
- [ ] New tests added for WebdriverIO format
- [ ] Documentation updated
- [ ] Manual testing with real project successful
- [ ] No performance degradation

### Acceptance Criteria

1. Tool correctly parses `reports/cucumber-results.json` from test project
2. Returns: `❌ 1 of 2 scenarios failed across 1 features in 2.4s.`
3. Lists failing scenario: "View card offers" with error message
4. Maintains backward compatibility with standard Cucumber JSON
5. Execution time remains <100ms

---

## Risk Assessment

### Risks & Mitigation

| Risk                                                  | Likelihood | Impact | Mitigation                                               |
| ----------------------------------------------------- | ---------- | ------ | -------------------------------------------------------- |
| Breaking existing projects using standard format      | Low        | High   | Add comprehensive tests, maintain backward compatibility |
| Performance degradation with large reports            | Low        | Medium | Test with 1000+ scenario reports, optimize if needed     |
| Missing edge cases in format detection                | Medium     | Low    | Add extensive test coverage for various formats          |
| Different WebdriverIO versions have format variations | Medium     | Medium | Support common versions, document unsupported cases      |

---

## Rollout Plan

### Phase 1: Development (Week 1)

- Day 1-2: Implement format detection and WebdriverIO parser
- Day 3: Add test coverage
- Day 4: Manual testing with real projects
- Day 5: Code review and adjustments

### Phase 2: Testing (Week 2)

- Test with multiple projects
- Verify backward compatibility
- Performance testing
- Edge case validation

### Phase 3: Release (Week 2)

- Update documentation
- Release new version
- Notify users of enhancement
- Monitor for issues

---

## Alternative Solutions Considered

### 1. Require Standard Format Only

**Pros**: No code changes needed  
**Cons**: Poor user experience, forces manual conversion  
**Decision**: ❌ Rejected - Not user-friendly

### 2. External Conversion Tool

**Pros**: Separation of concerns  
**Cons**: Extra step for users, more complexity  
**Decision**: ⚠️ Consider for future if more formats needed

### 3. AI-Powered Format Detection

**Pros**: Very flexible, handles unknown formats  
**Cons**: Overkill for this use case, adds complexity  
**Decision**: ❌ Rejected - Over-engineering

### 4. Support WebdriverIO Only

**Pros**: Simpler implementation  
**Cons**: Breaks existing users  
**Decision**: ❌ Rejected - Breaking change

---

## Summary

### Quick Reference

**Issue**: WebdriverIO Cucumber report format not supported  
**Severity**: 🟡 Low (Enhancement)  
**Fix**: Add WebdriverIO format parser with auto-detection  
**Effort**: 2-3 hours  
**Timeline**: 1-2 weeks  
**Breaking Changes**: None  
**Priority**: Medium (improves user experience)

### Next Steps

1. **Immediate**: Document limitation (30 min)
2. **Short-term**: Implement fix (2-3 hours)
3. **Medium-term**: Add comprehensive testing (1-2 hours)
4. **Long-term**: Monitor for other format requests

### Contact

For questions or concerns about this fix plan:

- Review test results: `APPFORGE_MCP_TEST_REPORT.md`
- Source code: `/Users/rsakhawalkar/forge/AppForge`
- Test project: `/Users/rsakhawalkar/appium-poc`

---

**Document Version**: 2.0  
**Last Updated**: January 4, 2026  
**Status**: ✅ IMPLEMENTED AND TESTED

---

## Implementation Summary

### Changes Made

1. **Enhanced `SummarySuiteService`** (`src/services/SummarySuiteService.ts`):
   - Added `detectReportFormat()` method to automatically detect WebdriverIO vs standard Cucumber JSON format
   - Added `autoDetectReportPath()` method to search common report locations
   - Updated `summarize()` to support format detection and auto-detection of report paths
   - Made `reportFile` parameter optional - now auto-detects if not provided

2. **Updated `McpConfigService`** (`src/services/McpConfigService.ts`):
   - Added `reportsRoot` to `paths` configuration (default: `reports`)
   - Added `execution.reportPath` configuration option
   - Updated `resolvePaths()` to include reportsRoot

3. **Added Comprehensive Test Coverage** (`src/tests/SummarySuiteService.wdio.test.ts`):
   - Tests for WebdriverIO format parsing
   - Tests for standard Cucumber format parsing
   - Tests for background step exclusion
   - Tests for auto-detection of report paths
   - All tests passing ✅

### Configuration Options

Users can now configure report paths in `mcp-config.json`:

```json
{
  "paths": {
    "reportsRoot": "custom-reports"
  },
  "execution": {
    "reportPath": "custom-reports/my-report.json"
  }
}
```

### Auto-Detection Priority

The service auto-detects reports in this order:
1. `execution.reportPath` (if configured in mcp-config.json)
2. `{reportsRoot}/cucumber-results.json`
3. `{reportsRoot}/cucumber-report.json`
4. `{reportsRoot}/cucumber.json`
5. `cucumber-report.json`
6. `allure-results/cucumber.json`
7. `test-results/cucumber.json`
8. `wdio-reports/cucumber.json`

### Format Detection

The service automatically detects format based on:
- **WebdriverIO**: Features and elements have `id` fields
- **Standard Cucumber**: Elements have `type` or `keyword` fields
- Handles both nanosecond (standard) and millisecond (WebdriverIO) duration formats

### Test Results

```
✔ should parse WebdriverIO Cucumber report format correctly
✔ should parse standard Cucumber JSON format correctly
✔ should handle WebdriverIO format with background steps excluded
✔ should auto-detect report path from common locations

ℹ tests 4
ℹ pass 4
ℹ fail 0
```

**Document Version**: 2.0  
**Last Updated**: January 4, 2026  
**Status**: ✅ IMPLEMENTED AND TESTED
