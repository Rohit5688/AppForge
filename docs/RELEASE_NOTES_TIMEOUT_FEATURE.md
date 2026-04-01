# Release Notes: Configurable Test Execution Timeout

## Version: 1.1.0
## Date: January 4, 2026

---

## Overview

The `run_cucumber_test` tool now supports configurable timeouts, resolving issues with long-running test suites being prematurely terminated and providing better control over test execution duration.

## What's New

### 🎯 Configurable Timeout Support

The execution timeout can now be configured through multiple sources with a clear priority order:

1. **Explicit Parameter** (Highest Priority)
   ```javascript
   run_cucumber_test({
     projectRoot: "/path/to/project",
     timeoutMs: 600000,  // 10 minutes
     tags: "@smoke"
   })
   ```

2. **mcp-config.json Configuration**
   ```json
   {
     "execution": {
       "timeoutMs": 3600000
     }
   }
   ```

3. **Auto-Detection** from `playwright.config.ts/js`
   - Detects `timeout: <number>` 
   - Detects `expect.timeout: <number>`
   - Detects `testTimeout: <number>`

4. **Default** - 30 minutes (1800000ms) if nothing else is configured

### 🛡️ Safety Features

- **Maximum Cap**: 2 hours (7200000ms) to prevent runaway processes
- **Input Validation**: Rejects negative or zero timeout values
- **Warning Logs**: Clear warnings when timeout is capped
- **Error Messages**: Descriptive errors for invalid configurations

### 📊 Enhanced Output

Test execution output now includes timeout information:

```
[Timeout: 60000ms (source: explicit)]

<test execution output>
```

The source indicator shows which configuration was used:
- `explicit` - From tool parameter
- `mcp-config` - From mcp-config.json
- `detected(playwright.config)` - Auto-detected from config file
- `default` - Fallback default value

---

## Migration Guide

### For Existing Projects

**No action required!** The feature is fully backward compatible. If you don't configure a timeout, the system will use the default 30-minute timeout.

### Recommended Actions

1. **Review your current test execution times**
   - Check how long your full test suite typically runs
   - Identify any tests that may take longer than 30 minutes

2. **Configure timeout in mcp-config.json** (Recommended)
   ```json
   {
     "version": "1.1.0",
     "execution": {
       "timeoutMs": 3600000  // 1 hour for full regression suite
     }
   }
   ```

3. **For CI/CD pipelines**, consider using explicit timeouts:
   ```javascript
   // Short timeout for smoke tests
   run_cucumber_test({
     projectRoot: process.env.PROJECT_ROOT,
     tags: "@smoke",
     timeoutMs: 300000  // 5 minutes
   })
   
   // Longer timeout for full regression
   run_cucumber_test({
     projectRoot: process.env.PROJECT_ROOT,
     tags: "@regression",
     timeoutMs: 7200000  // 2 hours (maximum)
   })
   ```

### Configuration Examples

#### Scenario 1: Quick Smoke Tests
```json
{
  "execution": {
    "timeoutMs": 300000  // 5 minutes
  }
}
```

#### Scenario 2: Standard Test Suite
```json
{
  "execution": {
    "timeoutMs": 1800000  // 30 minutes (default)
  }
}
```

#### Scenario 3: Full Regression Suite
```json
{
  "execution": {
    "timeoutMs": 7200000  // 2 hours (maximum)
  }
}
```

---

## Technical Details

### Implementation Changes

1. **ExecutionService.ts**
   - Added `timeoutMs` optional parameter to `runTest()` method
   - Implemented `resolveTimeout()` for priority-based resolution
   - Added `detectProjectTimeout()` for auto-detection from playwright config files
   - Enhanced output with timeout source logging

2. **index.ts**
   - Updated `run_cucumber_test` tool schema with `timeoutMs` parameter
   - Updated tool description to document timeout resolution order

3. **Documentation**
   - Updated `McpConfig.md` with timeout configuration section
   - Added examples and best practices

### Files Changed

- `src/services/ExecutionService.ts` - Core timeout logic
- `src/index.ts` - MCP tool schema update
- `docs/McpConfig.md` - Configuration documentation
- `docs/issue/run_cucumber_test_timeout_fixplan.md` - Implementation tracking

### Testing

Comprehensive test coverage added in `src/tests/ExecutionService.timeout.test.ts`:
- Timeout priority resolution
- Input validation
- Configuration parsing
- Default fallback behavior

---

## Troubleshooting

### Issue: Tests timing out unexpectedly

**Solution**: Check the timeout configuration:
```bash
# View current configuration
cat mcp-config.json | grep -A 2 "execution"

# Check test output for timeout source
# Look for: [Timeout: XXXXXms (source: ...)]
```

### Issue: Warning about capped timeout

**Cause**: Requested timeout exceeds 2-hour maximum

**Solution**: 
- Review if tests genuinely need more than 2 hours
- Consider splitting long-running suites into smaller batches
- Use the maximum allowed: `"timeoutMs": 7200000`

### Issue: Timeout not being respected

**Check**:
1. Verify the timeout value in output: `[Timeout: XXXXXms (...)]`
2. Confirm the source is correct (explicit > mcp-config > detected > default)
3. Ensure mcp-config.json syntax is valid JSON

---

## Support

For issues, questions, or feedback regarding the timeout feature:

1. Check the [McpConfig.md](./McpConfig.md) documentation
2. Review the [implementation fix plan](./issue/run_cucumber_test_timeout_fixplan.md)
3. Report bugs via the project issue tracker

---

## Future Enhancements

Potential improvements being considered:

- Per-platform timeout overrides (different timeouts for Android vs iOS)
- Test-level timeout hints in feature files
- Dynamic timeout adjustment based on historical execution times
- Timeout warnings before termination (graceful shutdown signals)

---

*Last Updated: January 4, 2026*