# 🚀 Token Optimizer — Code Mode Execution

The Token Optimizer (`execute_sandbox_code`) is a new MCP tool that dramatically reduces LLM token consumption by running JavaScript snippets inside a secure V8 sandbox on the MCP server.

---

## The Problem

Every MCP tool call costs tokens in two ways:

| Cost Type | Example | Tokens |
|---|---|---|
| **Schema overhead** | LLM must "see" 26+ tool schemas every message | ~5,000 |
| **Payload bloat** | `analyze_codebase` returns full AST analysis | ~8,000 |

A single "count my step definitions" operation can cost ~10,000 tokens.

## The Solution

Instead of the LLM calling tools that return massive data, it writes a small JavaScript script that runs **on your machine**. The script calls server services locally, filters the data, and returns **only the final result**.

### Before (Classic): ~10,000 tokens
```
LLM → calls analyze_codebase → receives 8,000 tokens of JSON → reads it all → responds
```

### After (Code Mode): ~150 tokens
```
LLM → sends 50-token script → sandbox processes JSON locally → returns 20-token answer
```

**Savings: up to 98%**

---

## How to Use

Ask your AI assistant to use the sandbox. Example prompts:

> "Using the sandbox, analyze my codebase and tell me how many step definitions exist"

> "Using the sandbox, read my wdio.conf.ts and return the capabilities"

> "Using the sandbox, check my config and return the current platform"

The AI will write a script and call `execute_sandbox_code`:

```javascript
// Example: Count step definitions
const analysis = await forge.api.analyzeCodebase('/path/to/project');
const stepCount = analysis.steps ? analysis.steps.length : 0;
console.log('Found ' + stepCount + ' step definitions');
return { totalSteps: stepCount };
```

---

## Available APIs

Scripts have access to these server services via `forge.api.*`:

| Method | Description |
|---|---|
| `forge.api.analyzeCodebase(projectRoot)` | AST-based codebase analysis |
| `forge.api.runTests(projectRoot)` | Runs Cucumber Appium tests |
| `forge.api.readFile(filePath)` | Reads a file from disk |
| `forge.api.getConfig(projectRoot)` | Reads `mcp-config.json` |
| `forge.api.summarizeSuite(projectRoot)` | Parses Cucumber reports |

---

## Security

The sandbox enforces strict zero-trust isolation:

- ❌ `eval()`, `new Function()` — blocked
- ❌ `require()`, `import()` — blocked
- ❌ `process`, `globalThis` — blocked
- ❌ `fetch`, network access — blocked
- ✅ 10-second timeout enforcement
- ✅ Fresh V8 context per execution (no state leakage)
- ✅ Console output captured and returned

See [Security Architecture](Security.md) for the full security model.

---

## Token Savings Summary

| Operation | Classic (tokens) | Code Mode (tokens) | Savings |
|---|---|---|---|
| Count step definitions | ~8,000 | ~100 | **98.7%** |
| Check project config | ~2,000 | ~80 | **96%** |
| Read and filter a file | ~3,000 | ~150 | **95%** |
| Multi-step orchestration | ~18,000 | ~300 | **98.3%** |
| Schema overhead (per msg) | ~5,000 | ~200 | **96%** |
