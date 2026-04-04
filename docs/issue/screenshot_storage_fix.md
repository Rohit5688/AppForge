# Screenshot Storage Implementation

## Problem Statement

Screenshots in live session responses were eating the whole context and causing LLM hallucinations due to large base64 data being embedded directly in JSON responses.

## Solution

Implemented a local screenshot storage system that stores screenshots on disk and returns file paths instead of base64 data in responses.

## Changes Made

### 1. Created `ScreenshotStorage` Utility (`src/utils/ScreenshotStorage.ts`)

A new utility class that manages local storage of screenshots:

- **Storage Location**: `.AppForge/screenshots/` directory within project root
- **Filename Format**: `{prefix}_{timestamp}_{hash}.png`
- **Key Features**:
  - `store()`: Saves base64 screenshot to disk and returns file path metadata
  - `read()`: Retrieves stored screenshot as base64 when needed
  - `cleanup()`: Removes old screenshots (default: 24 hours)
  - `getSummary()`: Returns statistics about stored screenshots

### 2. Updated `ExecutionService` (`src/services/ExecutionService.ts`)

**Modified `inspectHierarchy()` return type:**
- **Before**: `{ xml, screenshot: string, ... }`
- **After**: `{ xml, screenshotPath?: string, screenshotSize?: number, ... }`

**Modified `ExecutionResult.failureContext`:**
- **Before**: `{ screenshot: string, pageSource, timestamp }`
- **After**: `{ screenshotPath: string, screenshotSize: number, pageSource, timestamp }`

Screenshots are now automatically stored when captured from live sessions.

### 3. Updated `SelfHealingService` (`src/services/SelfHealingService.ts`)

**Modified method signatures:**
- `analyzeMobileFailure()`: Now accepts `screenshotPath` instead of `screenshotBase64`
- `buildVisionHealPrompt()`: References screenshot file path in prompt instead of embedding base64
- `healWithRetry()`: Stores screenshots automatically when fetching from live session

### 4. Updated MCP Tool Handler (`src/index.ts`)

**Modified `self_heal_test` tool:**
- Automatically stores incoming base64 screenshots before processing
- Updated tool description to mention automatic local storage

**Modified `inspect_ui_hierarchy` tool:**
- Updated description to mention `screenshotPath` and `screenshotSize` in response

## Benefits

1. **Reduced Context Size**: Screenshots no longer consume massive token counts in responses
2. **Improved LLM Performance**: Prevents hallucinations caused by context overflow
3. **Better Organization**: All screenshots stored in dedicated directory
4. **Automatic Cleanup**: Built-in mechanism to remove old screenshots
5. **Debugging Support**: Screenshots  remain available for manual inspection

## Usage Examples

### Inspect UI Hierarchy (Live Session)
```javascript
// Call start_appium_session first
await startAppiumSession(projectRoot);

// Fetch live XML and screenshot
const result = await inspectHierarchy();

// Response now includes:
// {
//   xml: "...",
//   screenshotPath: ".AppForge/screenshots/inspect_2026-01-04_15-30-00_a1b2c3d4.png",
//   screenshotSize: 245632,
//   elements: [...],
//   source: "live_session"
// }
```

### Self-Heal Test
```javascript
// Screenshots are automatically stored
const healResult = await selfHealTest(
  testOutput,
  xmlHierarchy,
  screenshotBase64  // Automatically stored locally
);

// Prompt references file path instead of embedding base64
```

### Cleanup Old Screenshots
```javascript
const storage = new ScreenshotStorage(projectRoot);
const result = storage.cleanup(86400000); // 24 hours
// { removed: 15, freedBytes: 3670016 }
```

## File Locations

- **Storage Directory**: `{projectRoot}/.AppForge/screenshots/`
- **Screenshot Files**: `{prefix}_{ISO-timestamp}_{hash}.png`
- **Utility Class**: `src/utils/ScreenshotStorage.ts`

## Configuration

Screenshots are stored automatically with no configuration needed. The default cleanup age is 24 hours but can be adjusted when calling `cleanup()`.

## Testing

To test the implementation:

1. Start an Appium session
2. Call `inspect_ui_hierarchy` with no arguments
3. Verify the response contains `screenshotPath` instead of `screenshot`
4. Check that the file exists at the specified path
5. Verify the file is a valid PNG image

## Future Enhancements

- Add automatic periodic cleanup (e.g., on session end)
- Support configurable storage location via mcp-config.json
- Add screenshot compression options
- Implement storage quota management

## Related Files

- `src/utils/ScreenshotStorage.ts` - Core storage utility
- `src/services/ExecutionService.ts` - Session inspection
- `src/services/SelfHealingService.ts` - Test healing
- `src/index.ts` - MCP tool handlers