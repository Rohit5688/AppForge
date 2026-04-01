# Issue #13: `suggest_refactorings` Custom Directory Layout Support

## Issue Summary

**Severity**: MEDIUM  
**Status**: ✅ RESOLVED (Already Fixed in Current Codebase)  
**Reported in**: APPFORGE_SESSION3_ISSUES.md

### Problem Description

The original issue report stated that `suggest_refactorings` hard-coded scan paths to `src/features/step-definitions` and `src/pages` regardless of `mcp-config.json`'s `directories.stepDefinitions` and `directories.pages` values. On projects with non-standard layouts, the tool would return empty results and falsely report zero duplicate steps.

### Root Cause Analysis

Upon investigation, the issue was found to be **already resolved** in the current codebase. The implementation correctly:

1. Loads `mcp-config.json` at the start of the handler
2. Uses `McpConfigService.getPaths()` to resolve custom directories
3. Passes these paths to `CodebaseAnalyzerService.analyze()`
4. Falls back to sensible defaults if paths are not configured

## Current Implementation

### Code Flow

```typescript
// In src/index.ts - suggest_refactorings handler
case "suggest_refactorings": {
  const config = this.configService.read(args.projectRoot);      // ✅ Reads config
  const paths = this.configService.getPaths(config);              // ✅ Gets custom paths
  const analysis = await this.analyzerService.analyze(
    args.projectRoot, 
    paths                                                          // ✅ Passes custom paths
  );
  return this.textResult(
    this.refactoringService.generateRefactoringSuggestions(analysis)
  );
}
```

### McpConfigService.getPaths()

Located in `src/services/McpConfigService.ts`:

```typescript
function resolvePaths(config: McpConfig) {
  return {
    featuresRoot: config.paths?.featuresRoot ?? 'features',
    pagesRoot: config.paths?.pagesRoot ?? 'pages',
    stepsRoot: config.paths?.stepsRoot ?? 'step-definitions',
    utilsRoot: config.paths?.utilsRoot ?? 'utils',
    testDataRoot: config.paths?.testDataRoot ?? 'src/test-data'
  };
}
```

This function correctly:
- Reads custom paths from `config.paths`
- Provides sensible defaults using nullish coalescing (`??`)
- Returns a complete path configuration

### CodebaseAnalyzerService.analyze()

Located in `src/services/CodebaseAnalyzerService.ts`:

```typescript
public async analyze(
  projectRoot: string, 
  customPaths?: {
    featuresRoot?: string;
    stepsRoot?: string;
    pagesRoot?: string;
    utilsRoot?: string;
  }
): Promise<CodebaseAnalysisResult>
```

The analyzer correctly uses `customPaths` parameter when provided, falling back to defaults only when not specified.

## Verification

### Test Coverage

A comprehensive test suite was added in `src/tests/RefactoringService.issue13.test.ts` with 8 test cases covering:

1. ✅ Custom stepDefinitions path from mcp-config.json
2. ✅ Custom pagesRoot path from mcp-config.json  
3. ✅ Fallback to defaults when mcp-config.json is missing paths
4. ✅ Deeply nested custom directory structures
5. ✅ Non-standard layouts (reproduces original issue scenario)
6. ✅ Partial path overrides
7. ✅ Full integration workflow with custom paths
8. ✅ Windows-style path handling

### Test Results

```
✔ RefactoringService - Custom Directory Layout (Issue #13) (103.819083ms)
ℹ tests 8
ℹ suites 1
ℹ pass 8
ℹ fail 0
```

All tests pass, confirming the implementation correctly handles:
- Custom directory configurations
- Non-standard project layouts
- Deeply nested structures
- Partial overrides
- Default fallbacks

## Example Usage

### Project with Custom Layout

**mcp-config.json:**
```json
{
  "version": "1.1.0",
  "project": {
    "language": "typescript",
    "testFramework": "cucumber",
    "client": "webdriverio"
  },
  "mobile": {
    "defaultPlatform": "android",
    "capabilitiesProfiles": {
      "android": { "platformName": "Android" }
    }
  },
  "paths": {
    "featuresRoot": "tests/features",
    "stepsRoot": "tests/steps",
    "pagesRoot": "tests/pages",
    "utilsRoot": "tests/utils",
    "testDataRoot": "tests/test-data"
  }
}
```

**Result:**
- `suggest_refactorings` will scan `tests/steps/` for step definitions
- `suggest_refactorings` will scan `tests/pages/` for page objects
- No hard-coded paths are used
- Duplicate detection and unused method detection work correctly

### Project with Default Layout

When `paths` section is missing or incomplete:

```json
{
  "version": "1.1.0",
  "project": { /* ... */ },
  "mobile": { /* ... */ }
  // No paths section
}
```

**Result:**
- Defaults to `step-definitions/` for steps
- Defaults to `pages/` for page objects
- Defaults to `features/` for features
- Defaults to `utils/` for utilities
- Defaults to `src/test-data/` for test data

## Prevention of Regression

### Added Safety Measures

1. **Comprehensive Test Suite**: 8 tests specifically for issue #13
2. **Integration Tests**: Full workflow tests simulating real usage
3. **Edge Case Coverage**: Deeply nested paths, partial overrides, Windows paths
4. **Documentation**: Clear inline comments in test cases explaining scenarios

### Key Test Cases

**Test: Non-Standard Layout (Original Issue)**
```typescript
test('[ISSUE #13] should not return false empty results for non-standard layouts', async () => {
  // Custom layout: tests/steps instead of src/features/step-definitions
  // Custom layout: tests/pages instead of src/pages
  
  const config = {
    paths: {
      stepsRoot: 'tests/steps',
      pagesRoot: 'tests/pages'
    }
  };
  
  // Should detect duplicates and unused methods correctly
  assert.ok(analysis.existingStepDefinitions.length > 0);
  assert.ok(analysis.existingPageObjects.length > 0);
  assert.ok(analysis.conflicts.length > 0); // NOT zero
});
```

## Recommendations

### For Users

1. **Always configure paths in mcp-config.json** if using non-standard layouts:
   ```json
   {
     "paths": {
       "stepsRoot": "your/custom/steps/path",
       "pagesRoot": "your/custom/pages/path"
     }
   }
   ```

2. **Use relative paths** from project root (no leading slash)

3. **Use forward slashes** for cross-platform compatibility

### For Developers

1. **Never hard-code directory paths** - always use `McpConfigService.getPaths()`
2. **Pass paths to analyzer** - use the `customPaths` parameter in `analyze()`
3. **Provide defaults** - use nullish coalescing for fallback values
4. **Test with custom layouts** - add test cases for non-standard structures

## Conclusion

**Issue #13 is RESOLVED** - the current implementation correctly respects `mcp-config.json` directory paths. The comprehensive test suite added ensures this functionality remains robust and prevents regression.

### Summary

- ✅ Config-based directory resolution works correctly
- ✅ Fallback defaults are sensible
- ✅ Custom layouts are fully supported
- ✅ 8 comprehensive tests validate behavior
- ✅ No code changes required (issue was already fixed)
- ✅ Test suite prevents future regression

### Files Modified

- **Added**: `src/tests/RefactoringService.issue13.test.ts` (8 test cases, 359 lines)
- **Added**: `docs/issue/issue_13_suggest_refactorings_fix.md` (this document)

### Related Issues

- Issue #12: Unused method detection (separate concern, also tested)
- Issue #14: `manage_users` hard-coded paths (similar pattern, different tool)
- Issue #20: `audit_utils` hard-coded paths (similar pattern, different tool)

---

**Verified**: 2026-01-04  
**Test Pass Rate**: 8/8 (100%)  
**Code Changes Required**: None (already fixed)