# AppForge MCP Issues Fix Plan

This plan translates the findings in `docs/issues.md` into an implementation roadmap for AppForge MCP.

## Objective

Improve AppForge from a generation-first MCP into a maintenance-ready platform that supports large codebases, preventive quality checks, and actionable refactoring workflows.

## Success Criteria

- Large repositories can be analyzed without token overflow.
- Existing code quality can be assessed without manual file-by-file review.
- `validate_and_write` works for both generated code and surgical edits.
- Locator and flakiness tooling returns actionable outputs (not only warnings).
- Learning rules are manageable, deduplicated, and verifiable.
- Mandatory learned rules are provably injected into generation context for applicable requests.
- Generation fails fast when an applicable mandatory rule is not injected.
- Every generation run has an auditable record of applied rule IDs.
- Test execution output is machine-readable and useful for trend analysis.

## Phase 1: Token and Audit Foundations (High)

### [x] 1.1 Add `analyze_codebase_summary`
**Status**: COMPLETED
**Goal**: Prevent token overflow for real projects.
**Implementation**: Added `CodebaseAnalyzerService.analyzeSummary` and `analyze_codebase_summary` tool.

### [x] 1.2 Add structured `analyze_code_quality`
**Status**: COMPLETED
**Goal**: Audit existing framework quality without generation flow.

**Changes**
- Extend or add service logic in `src/services/RefactoringService.ts` (and AST helpers as needed).
- Add tool registration and dispatch in `src/index.ts`:
- `analyze_code_quality`

**Checks included**
- Duplicate blocks and duplicate step definitions
- Inconsistent patterns (`driver` vs `browser` usage)
- Magic numbers (timeouts, retry values)
- Multi-responsibility methods
- Dead code candidates / unused imports

**Acceptance**
- Structured JSON with file paths and findings.
- Findings are prioritized by severity.

## Phase 2: Write Path Flexibility (High)

### [x] 2.1 Improve `validate_and_write` input modes
**Status**: COMPLETED
**Goal**: Support simple edits and complex generation equally well.

**Changes**
- Update tool contract in `src/index.ts` to allow additional write modes while keeping `files[]` support.
- Keep `jsonPageObjects` optional and additive.
- Keep validations in `src/services/FileWriterService.ts` available in all modes (`dryRun`, TS/Gherkin checks).

**Acceptance**
- Small file patches do not require POM-specific payloads.
- No breaking changes for existing clients.

## Phase 3: Actionable Reliability Tooling (Medium)

### [x] 3.1 Add `predict_flakiness`
**Status**: COMPLETED
**Goal**: Detect fragile tests before they fail.

**Changes**
- Add preventive scoring in `src/services/SelfHealingService.ts` (or a dedicated flakiness service).
- Register tool in `src/index.ts`:
- `predict_flakiness`

**Signals**
- Brittle locator patterns (deep XPath, text-only selectors)
- Wait patterns prone to stale element references
- Mixed responsibilities in page methods

**Acceptance**
- Risk score per page/test + specific remediation hints.

### [x] 3.2 Make `audit_mobile_locators` patch-oriented
**Status**: COMPLETED
**Goal**: Move from warnings to ready-to-apply changes.

**Changes**
- Extend `src/services/AuditLocatorService.ts` output to include:
- `suggestedReplacement`
- `strategyPreference`
- patch-ready replacement suggestions

**Acceptance**
- Critical locator findings include concrete alternatives.
- Output can be consumed by automation for code updates.

## Phase 4: Learning and Traceability (Medium)

### [x] 4.1 Upgrade rule lifecycle management
**Status**: COMPLETED
**Goal**: Keep learned knowledge clean and trustworthy.

**Changes**
- Extend `src/services/LearningService.ts`:
- explicit rule metadata (`mandatory`, `scope`, `priority`, optional matchers)
- normalized deduplication
- list/edit/delete operations
- timestamp/version metadata improvements
- Add new tool operations in `src/index.ts`:
- `manage_training_rules`
- `verify_training`

**Required `verify_training` response**
- `applicableRules` with IDs and match reasons
- `appliedMandatoryRules`
- `skippedMandatoryRules` (must include reason)
- `injectionPreview` (the exact prompt block to be injected)
- `promptHash` (stable hash of final prompt body for auditability)

**Acceptance**
- Rules can be reviewed and maintained without file edits.
- `verify_training` shows what will inject for a given request.

### [x] 4.2 Enforce mandatory rule injection in generation path
**Status**: COMPLETED
**Goal**: Ensure learning is operationally guaranteed, not best effort.

**Changes**
- Add deterministic resolver in `src/services/LearningService.ts`:
- `resolveApplicableRules(projectRoot, requestContext)`
- returns applied and skipped rules with reasons
- Update generation flow in `src/index.ts` (`generate_cucumber_pom` path):
- resolve applicable rules before prompt generation
- inject rule IDs into prompt markers (example: `[RULE_ID=rule-123][MANDATORY=true]`)
- hard-fail if any applicable mandatory rule is missing from injected prompt

**Acceptance**
- If a mandatory applicable rule is not injected, tool returns error and does not generate prompt.
- Generated prompt always includes deterministic rule markers for applied rules.

### [x] 4.3 Add learning audit trail
**Status**: COMPLETED
**Goal**: Provide post-run proof that learned rules were used.

**Changes**
- Persist generation-time audit entries to `.appium-mcp/learning-audit.jsonl`.
- Each entry should include:
- timestamp
- request summary
- applicable rule IDs
- applied rule IDs
- skipped rule IDs and reasons
- prompt hash

**Acceptance**
- Audit file is append-only and readable for troubleshooting.
- For any generation request, team can trace exactly which rules were applied.

### [x] 4.4 Define deterministic rule applicability model
**Status**: COMPLETED
**Goal**: Ensure the system can reliably decide which rules are applicable, mandatory, or skippable.

**Changes**
- Extend rule schema in `src/services/LearningService.ts` with explicit matching metadata:
- `mandatory: boolean`
- `scope: generation | healing | all`
- `priority: number`
- `conditions` object:
- `platforms`, `toolNames`, `fileGlobs`
- `keywordsAny`, `keywordsAll`, `regexAny`, `tagsAny`
- Build `requestContext` at runtime in `src/index.ts` for each generation/healing request:
- active tool name, platform, request text, tags, candidate files, optional UI context
- Implement deterministic resolver in `src/services/LearningService.ts`:
- evaluate rules in fixed gate order: scope -> tool -> platform/file/tag -> text match
- return explicit decisions with reasons

**Conflict resolution policy**
- When two applicable rules conflict:
- higher `priority` wins
- if tied, rule with more matched conditions wins (more specific)
- if still tied, newest timestamp wins
- Record loser as skipped with `reason: conflict_with:<ruleId>`.

**Required resolver output contract**
- `applicableRules`
- `appliedMandatoryRules`
- `appliedOptionalRules`
- `skippedMandatoryRules` (with reasons)
- `skippedOptionalRules` (with reasons)

**Acceptance**
- Rule applicability is fully deterministic for the same input context.
- Mandatory rules cannot silently drop; unresolved mandatory rules cause hard failure.
- Skip decisions always include machine-readable reasons.

### [x] 4.5 Prompt marker and enforcement contract
**Status**: COMPLETED
**Goal**: Provide verifiable proof that resolved rules are present in final prompt payload.

**Changes**
- Inject explicit markers for each applied rule in generation/healing prompts:
- format: `[RULE_ID=<id>][MANDATORY=<true|false>][SCOPE=<scope>]`
- Validate marker presence before dispatching prompt to the LLM.
- Abort tool execution if any applicable mandatory rule marker is missing.

**Acceptance**
- Final prompt always contains markers for all applied rules.
- Missing mandatory marker always causes fail-fast behavior.

## Phase 5: Developer Ergonomics and Test Intelligence (Low)

### [x] 5.1 Add high-level sandbox APIs
**Status**: COMPLETED
**Goal**: Reduce scripting friction in `execute_sandbox_code`.
**Implementation**: Added `suggestRefactorings`, `analyzeCodeQuality`, and `analyzeRuleHealth` wrappers.

### [x] 5.2 Enrich `run_cucumber_test` result structure
**Status**: COMPLETED
**Goal**: Improve downstream analytics and automated reporting.
**Implementation**: Added detailed scenario breakdown array with `durationMs` and individual `error` info to `ExecutionService.parseReport`.

## Phase 6: Production Readiness and Governance (High)

### [x] 6.1 Rule drift and stale-rule detection
**Status**: COMPLETED (Analysis/Health Part)
**Goal**: Keep the learning corpus useful over time and prevent low-signal rule growth.

**Changes**
- Add health metrics in `src/services/LearningService.ts`:
- `matchCount`, `appliedCount`, `skippedCount`, `lastMatchedAt`, `lastAppliedAt`
- Add stale-rule analysis tool operation in `src/index.ts`:
- `analyze_training_rules_health`
- Flag rules that never match or are repeatedly skipped by conflicts.

**Acceptance**
- Team can identify stale, noisy, or ineffective rules from structured output.

### [x] 6.2 Prompt budget governance
**Status**: COMPLETED
**Goal**: Ensure rule injection does not degrade generation quality due to token pressure.

**Changes**
- Add deterministic prompt budget policy in generation flow (`src/index.ts` + `src/services/LearningService.ts`):
- max mandatory token budget
- max optional token budget
- truncation/compaction strategy for optional rules
- Add budget diagnostics to `verify_training` output.

**Acceptance**
- Mandatory rules are always retained.
- Optional rules degrade gracefully under budget pressure with explicit skip reasons.

### [x] 6.3 Concurrency safety for learning state
**Status**: COMPLETED
**Goal**: Prevent corruption when multiple agents/jobs update learning files simultaneously.

**Changes**
- Add safe write strategy for `.appium-mcp/mcp-learning.json` and `.appium-mcp/learning-audit.jsonl`:
- atomic temp-file writes and rename
- lightweight lock mechanism per file
- Add retry with backoff for lock contention.

**Acceptance**
- Concurrent writes do not corrupt rule or audit files.

### [x] 6.4 Observability and schema versioning
**Status**: COMPLETED
**Goal**: Improve operability and backward compatibility for MCP clients.

**Changes**
- Add `schemaVersion` to new structured tool responses.
- Emit structured telemetry for critical operations:
- rule resolution start/end
- mandatory enforcement failures
- prompt generation duration
- audit write outcomes

**Acceptance**
- Payload evolution is traceable and clients can guard on `schemaVersion`.
- Operational failures can be diagnosed without reproducing locally.

### [x] 6.5 Security and safety hardening for rule matching
**Status**: COMPLETED
**Goal**: Prevent unsafe pattern matching and data leakage.

**Changes**
- Add regex safety checks in `src/services/LearningService.ts` to prevent catastrophic regex patterns.
- Sanitize logs/audit entries to avoid secret leakage from request text.
- Add input validation and max-length guards for rule fields.

**Acceptance**
- Unsafe regex patterns are rejected with clear errors.
- Audit and telemetry paths do not store sensitive secrets.

### [x] 6.6 User Explainability Tools
**Status**: COMPLETED
**Goal**: Transparency in generation context.
**Implementation**: `verify_training` tool serves exactly as the `simulate_generation_context` dry run, successfully exposing conflict rationales, skipped reasons, and the final injected textual preview.

### [x] 6.7 Rollback and approval workflow for mandatory rules
**Status**: COMPLETED
**Goal**: Reduce blast radius from incorrect mandatory rules in live projects.
**Implementation**: Added `createSnapshot`, `listSnapshots`, `rollbackToSnapshot` in `LearningService`. Wired as `snapshot`, `list_snapshots`, `rollback` operations in `manage_training_rules`. Rollback auto-creates a safety backup before overwriting. Approval statuses (`draft`/`approved`/`rejected`) already enforced in resolver.

## Delivery Order (Priority + Token Efficiency)

### [x] Wave 0: Trust-Critical Rule Enforcement (DONE)

1. Phase `4.4` deterministic rule applicability model
2. Phase `4.2` mandatory rule enforcement in generation path
3. Phase `4.5` prompt marker validation contract
4. Phase `4.1` rule lifecycle management + `verify_training`
5. Phase `4.3` learning audit trail

### [x] Wave 1: High ROI, Lower Complexity (DONE)

1. [x] Phase `1.1` `analyze_codebase_summary`
2. [x] Phase `2.1` `validate_and_write` input flexibility
3. [x] Phase `3.2` actionable locator audit output

### [x] Wave 2: Core Analysis Capability (DONE)

1. Phase `1.2` structured `analyze_code_quality`
2. Phase `3.1` `predict_flakiness`

### [x] Wave 3: Operational Hardening (DONE)

1. Phase `6.2` prompt budget governance
2. Phase `6.3` concurrency-safe learning state
3. Phase `6.5` regex and data safety hardening
4. Phase `6.4` schema versioning + observability

### [x] Wave 4: Extended Intelligence and Ergonomics (DONE)

1. [ ] Phase `5.1` high-level sandbox APIs
2. [ ] Phase `5.2` enriched `run_cucumber_test` structure
3. [ ] Phase `6.6` user explainability / simulation tools

## Token Optimization Execution Rules

1. Implement in waves and do not start next wave until current wave acceptance tests pass.
2. Prefer additive changes with backward compatibility to avoid rework loops.
3. Limit each PR to one wave milestone to contain review and rollback costs.
4. Use strict test subsets first, then full regression only at wave boundaries.
5. Reuse resolver and reporting primitives across tools to avoid duplicate logic.

## Wave Exit Gates

- **Wave 0 exit**:
- `verify_training` proves mandatory rule applicability and injection.
- generation fails fast when mandatory applied rule is missing.
- audit log records applied/skipped rule IDs and prompt hash.
- **Wave 1 exit**:
- large project summary output remains compact.
- write-path flexibility supports non-generation edits safely.
- locator audit emits patch-ready suggestions.
- **Wave 2 exit**:
- quality and flakiness outputs include file-level findings and severity.
- **Wave 3 exit**:
- no learning-state corruption under concurrent writes.
- prompt budget policy retains mandatory rules deterministically.
- **Wave 4 exit**:
- sandbox and test-analytics enhancements deliver expected structured outputs.

## Validation Plan

- Unit tests for each new service method and parser.
- Tool contract tests for `ListTools` and dispatcher routing in `src/index.ts`.
- Learning verification tests:
- resolver returns deterministic applicable/applied/skipped outputs for identical context.
- conflict resolution follows priority/specificity/timestamp tie-breakers.
- `verify_training` reports expected mandatory rule IDs.
- generation path fails when applicable mandatory rules are missing.
- injected prompt contains applied rule markers.
- audit log entry is written with matching rule IDs and prompt hash.
- Production readiness tests:
- concurrent rule writes preserve valid JSON and append-only audit integrity.
- prompt budget policy keeps mandatory rules while skipping optional with reasons.
- stale-rule health report flags long-unused rules.
- regex safety validation rejects unsafe matchers.
- `schemaVersion` is present in versioned structured responses.
- Backward compatibility checks for existing tools:
- `ana