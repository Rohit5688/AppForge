# TASK-26 — MCP Evaluation Harness: Create AppForge `evaluation.xml`

**Status**: TODO  
**Priority**: 🟣 P3 — Quality Gate (Do After Core Tasks)  
**Effort**: Medium  
**Applies to**: AppForge  

---

## Problem

There is no automated way to verify that Claude can *actually use AppForge tools to complete real mobile automation tasks*. The `Skills/scripts/evaluation.py` harness (shared from TestForge) solves this by running 10 realistic QA questions against the AppForge MCP server and measuring accuracy.

---

## What To Do

### Step 1 — Read the evaluation guide

File: `c:\Users\Rohit\mcp\TestForge\Skills\reference\evaluation.md`  
Script: `c:\Users\Rohit\mcp\TestForge\Skills\scripts\evaluation.py`

### Step 2 — Create 10 QA pairs for AppForge

Questions must test real AppForge capabilities. They must be:
- **Read-only** — only `workflow_guide`, `manage_config` (read), `check_environment`, `summarize_suite`, etc.
- **Multi-hop** — require reasoning across multiple tool responses
- **Stable** — answers don't depend on live device state

Example question candidates:
1. "What is the default platform if `setup_project` is called without a `platform` argument?"
2. "Which tool does `workflow_guide` recommend calling to see what's on screen after starting an Appium session?"
3. "What field in the `capabilitiesProfiles` object controls the device name for CI purposes?"
4. "What does `verify_selector` return when the element exists and is visible?"
5. "What security measure is applied in `execute_sandbox_code` to prevent file path traversal?"

**Verify each answer yourself by using the tools before adding to the XML.**

### Step 3 — Create the XML file

```bash
# Location (create this file):
c:\Users\Rohit\mcp\AppForge\docs\evaluation\appforge_evaluation.xml
```

Format:
```xml
<evaluation>
  <qa_pair>
    <question>...</question>
    <answer>...</answer>
  </qa_pair>
</evaluation>
```

### Step 4 — Run the baseline evaluation

```bash
cd c:\Users\Rohit\mcp\AppForge

# Install dependencies (one-time)
pip install anthropic mcp

# Run against the built AppForge server
python c:\Users\Rohit\mcp\TestForge\Skills\scripts\evaluation.py \
  -t stdio \
  -c node \
  -a dist/index.js \
  docs/evaluation/appforge_evaluation.xml
```

### Step 5 — Record baseline accuracy

Document the initial score in `docs/evaluation/eval_results.md`.

---

## Files Created
- `docs/evaluation/appforge_evaluation.xml` — 10 QA pairs
- `docs/evaluation/eval_results.md` — baseline accuracy log

## Acceptance Criteria
- 10 verified, read-only, stable QA pairs
- Baseline accuracy ≥ 70%
- Results documented

---

## Notes
- The evaluation script is at `TestForge/Skills/scripts/evaluation.py` — it's shared.
- AppForge does NOT need its own copy of the script; just reference it by path.
