# AppForge MCP Tool Review Report

**Model:** Claude 3.5 Sonnet (Anthropic) via Cline
**Date:** 2026-03-25
**Project:** appium-poc (Appium + Cucumber BDD mobile test framework)
**Task:** Full framework audit and overhaul of core/utils/locator strategy layer

---

## 1. AppForge Tools Used During This Session

| Tool | Used? | Purpose |
| ----------------------- | ------ | --------------------------------------------------------------- |
| `analyze_codebase` | ✅ Yes | Initial project discovery — Page Objects, step defs, configs |
| `train_on_example` | ✅ Yes | Persisted 13 mandatory rules for future generation |
| `manage_config` | ✅ Yes | Read mcp-config.json for capabilities and paths |
| `check_environment` | ❌ No | Not needed — environment was already working |
| `generate_cucumber_pom` | ❌ No | Not applicable — was refactoring, not generating new tests |
| `validate_and_write` | ❌ No | Used Cline native write_to_file instead (faster, more flexible) |
| `self_heal_test` | ❌ No | Was doing preventive fixes, not reactive healing |
| `inspect_ui_hierarchy` | ❌ No | No live Appium session XML available during code review |
| `audit_mobile_locators` | ❌ No | Read locator files directly with read_file |
| `execute_sandbox_code` | ❌ No | Used read_file + search_files instead (more intuitive) |
| `suggest_refactorings` | ❌ No | Did manual code review (tool output wasn't actionable enough) |
| `run_cucumber_test` | ❌ No | Used direct wdio CLI for better output control |

---

## 2. What Worked Well

### 2.1 `train_on_example` — Learning Persistence

The concept of persisting rules to `.appium-mcp/mcp-learning.json` is excellent. Being able to teach the tool "when you see X pattern, always do Y" is the right approach for team-specific conventions. The tagging system (e.g., `["framework", "anti-flake"]`) is useful for categorization.

### 2.2 `analyze_codebase` — Initial Discovery

Gave a quick birds-eye view of the project structure on first run. Identified all Page Objects, step definitions, and config files without manual exploration.

### 2.3 `manage_config` — Config Access

Clean way to read/write mcp-config.json without worrying about file format.

---

## 3. What Did NOT Work Well — Practical Issues

### 3.1 `analyze_codebase` is unusable for real projects (Token Overflow)

The tool dumps ALL file contents into a single response. For a project with 50+ source files, this exceeds context limits. The tool itself warns: "⚠️ TOKEN-INTENSIVE (LEGACY)". The suggested alternative (`execute_sandbox_code`) requires writing JavaScript snippets to query the codebase, which is much less intuitive than just reading files.

**Fix needed:** Add a lightweight `analyze_codebase_summary` mode that returns only:

- File tree with line counts
- Exported class/function names per file
- Import dependency graph
- No file contents — just structural metadata

### 3.2 `generate_cucumber_pom` — Generation-only, no refactoring support

The tool generates NEW test suites from plain English descriptions. There is NO tool for:

- Analyzing EXISTING code for quality issues
- Suggesting refactors to existing Page Objects
- Detecting duplicated patterns across files
- Proposing consolidation opportunities

I had to do the entire framework audit manually (reading 10+ files, identifying 12 gaps, planning fixes). The MCP should have a tool for this.

**Fix needed:** Add an `analyze_code_quality` tool that accepts a list of file paths and returns:

- Duplicated code blocks with locations
- Methods with too many responsibilities
- Inconsistent patterns (e.g., some files use `browser`, others use `driver`)
- Magic numbers that should be constants
- Dead code / unused imports

### 3.3 `validate_and_write` — Overly rigid input schema

The tool requires a structured JSON input with `className`, `locators`, `methods` arrays. This is fine for generating new Page Objects from scratch, but useless when I need to:

- Add a 2-line utility function
- Fix one method in an existing file
- Refactor imports

I used Cline's native `write_to_file` and `replace_in_file` for ALL file operations because they're simpler and more flexible.

**Fix needed:** Accept both structured JSON input (for generation) AND plain file content (for arbitrary writes). The validation step (tsc --noEmit + Gherkin lint) should work with either mode.

### 3.4 `self_heal_test` — Reactive only, not preventive

The tool requires FAILED test output + XML hierarchy + screenshot as input. It only works AFTER something breaks. The real value would be in PREVENTIVE analysis: "these locators are brittle and WILL break because..."

**Fix needed:** Add a `predict_flakiness` mode that:

- Analyzes locator strategies for brittleness (XPath depth, text-based selectors that may change with i18n)
- Identifies wait patterns that hold stale element handles
- Flags methods that mix responsibilities (navigation + assertion + popup handling)
- Returns risk scores per test/page object

### 3.5 `audit_mobile_locators` — Flags issues but doesn't fix them

The tool identifies XPath over-usage and brittle selectors, but its output is a Markdown report with warnings. It doesn't suggest concrete replacement selectors or generate a PR-ready diff.

**Fix needed:** Return actionable output with:

- Current brittle selector
- Suggested replacement (accessibility ID preferred, then predicate, then XPath)
- Auto-generated `replace_in_file` diff that can be applied directly

### 3.6 `execute_sandbox_code` — High friction for simple tasks

To read a file or search for patterns, I need to write JavaScript like:

```js
const content = await forge.api.readFile("path/to/file");
return content.match(/pattern/g);
```

This is slower and more error-prone than Cline's native `read_file` and `search_files` tools which I used instead.

**Fix needed:** Provide higher-level sandbox APIs:

- `forge.api.findDuplicateStepDefs(projectRoot)` — returns duplicate Cucumber steps
- `forge.api.findUnusedLocators(projectRoot)` — returns locator keys defined in YAML but never referenced
- `forge.api.findMagicNumbers(projectRoot)` — returns hardcoded timeout values
- `forge.api.findInconsistentPatterns(projectRoot)` — returns files using `driver` vs `browser`, etc.

### 3.7 `train_on_example` — No validation or deduplication

Rules are appended without checking if a similar rule already exists. After multiple training calls, the learning file can have overlapping or contradictory rules. There's also no way to verify that trained rules are actually injected into `generate_cucumber_pom` prompts.

**Fix needed:**

- Deduplicate rules by comparing issue patterns
- Allow listing/removing/editing existing rules
- Add a `verify_training` tool that shows which rules would be applied for a given generation request
- Version rules with timestamps and source references

### 3.8 No tool for running and analyzing test results structurally

`run_cucumber_test` executes tests but returns raw terminal output. There's no structured result parsing that returns:

- Pass/fail per scenario
- Duration per step
- Which locators were used
- Which waits timed out
- Comparison with previous run

I ran tests via direct CLI and manually parsed the output.

**Fix needed:** Return structured JSON results:

```json
{
"scenarios": [{"name": "...", "status": "passed", "duration": 73600, "steps": [...]}],
"locatorsUsed": ["login.passwordField", ...],
"timeoutsHit": [],
"comparedToPrevious": {"faster": true, "delta": "-2.3s"}
}
```

---

## 4. Summary of Recommended MCP Tool Fixes

| Priority | Fix | Impact |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 🔴 High | Add `analyze_code_quality` tool for existing code review | Enables framework audits without manual file-by-file reading |
| 🔴 High | Add lightweight `analyze_codebase_summary` mode | Prevents token overflow on real projects |
| 🔴 High | `validate_and_write` should accept plain file content | Makes the tool usable for non-generation writes |
| 🟡 Med | Add `predict_flakiness` mode to self_heal_test | Catches issues before they cause failures |
| 🟡 Med | `audit_mobile_locators` should return actionable diffs | Saves manual work converting warnings to code changes |
| 🟡 Med | `train_on_example` needs deduplication and verification | Prevents rule bloat and ensures rules are actually used |
| 🟡 Med | Higher-level sandbox APIs for common analysis tasks | Reduces friction vs. Cline native tools |
| 🟢 Low | `run_cucumber_test` should return structured JSON | Enables automated analysis of test results |
| 🟢 Low | Add rule management (list/edit/delete) to training | Maintains learning quality over time |

---

## 5. Verdict

**AppForge MCP v1 is a solid foundation for test GENERATION but lacks tools for test MAINTENANCE and REFACTORING.**

In this session, ~90% of the work was done with Cline's native tools (`read_file`, `write_to_file`, `replace_in_file`, `search_files`, `execute_command`). AppForge was only used for initial discovery and final learning persistence. The gap is particularly acute for:

1. **Code quality analysis** — no tool to detect duplicated patterns, magic numbers, inconsistent APIs
2. **Preventive flakiness detection** — only reactive self-healing after failures
3. **Existing code refactoring** — all tools assume new generation, not modification of existing code

The `train_on_example` concept is the strongest feature — persisting team-specific rules for future generation is exactly right. But it needs validation, deduplication, and proof that rules are actually applied.

**Model recommendation:** Claude 3.5 Sonnet performed well for this task. The ability to read multiple files, identify cross-cutting patterns, and make surgical edits with `replace_in_file` was essential. The main bottleneck was waiting for test execution (3+ minutes per run), not LLM reasoning.