import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// ─── Schema Version ──────────────────────────────────────────────────────────
export const LEARNING_SCHEMA_VERSION = '2.0.0';
/**
 * LearningService — Wave 0 complete rewrite.
 *
 * Responsibilities:
 *  1. CRUD for rules with normalized deduplication and lifecycle management.
 *  2. Deterministic rule applicability resolver (scope → tool → platform/file/tag → text).
 *  3. Prompt marker injection and mandatory-rule enforcement.
 *  4. Append-only audit trail at `.appium-mcp/learning-audit.jsonl`.
 *  5. Health metrics (matchCount, appliedCount, etc.) updated on every resolve.
 */
export class LearningService {
    // ──────────────────────────────────────────────────────────────
    // Path helpers
    // ──────────────────────────────────────────────────────────────
    getMcpDir(projectRoot) {
        const dir = path.join(projectRoot, '.appium-mcp');
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        return dir;
    }
    getStoragePath(projectRoot) {
        return path.join(this.getMcpDir(projectRoot), 'mcp-learning.json');
    }
    getAuditPath(projectRoot) {
        return path.join(this.getMcpDir(projectRoot), 'learning-audit.jsonl');
    }
    // ──────────────────────────────────────────────────────────────
    // Safe atomic file I/O (prevents concurrent corruption)
    // ──────────────────────────────────────────────────────────────
    atomicWrite(filePath, content) {
        const tmp = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, filePath);
    }
    async withFileLock(filePath, operation) {
        const lockPath = filePath + '.lock';
        let retries = 50;
        while (retries > 0) {
            try {
                fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
                break;
            }
            catch (e) {
                if (e.code === 'EEXIST') {
                    retries--;
                    await new Promise(r => setTimeout(r, 100)); // 100ms backoff
                    if (retries === 0)
                        throw new Error(`Lock contention timeout for ${filePath}`);
                }
                else {
                    throw e; // actual error
                }
            }
        }
        try {
            return await operation();
        }
        finally {
            if (fs.existsSync(lockPath))
                fs.unlinkSync(lockPath);
        }
    }
    // ──────────────────────────────────────────────────────────────
    // Read / Write schema
    // ──────────────────────────────────────────────────────────────
    getKnowledge(projectRoot) {
        const storagePath = this.getStoragePath(projectRoot);
        if (!fs.existsSync(storagePath)) {
            return { schemaVersion: LEARNING_SCHEMA_VERSION, version: '1.0.0', rules: [] };
        }
        try {
            const raw = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
            // Migrate v1 rules that lack new fields
            if (raw.rules) {
                raw.rules = raw.rules.map(r => this.migrateRule(r));
            }
            return {
                schemaVersion: raw.schemaVersion ?? LEARNING_SCHEMA_VERSION,
                version: raw.version ?? '1.0.0',
                rules: raw.rules ?? []
            };
        }
        catch {
            return { schemaVersion: LEARNING_SCHEMA_VERSION, version: '1.0.0', rules: [] };
        }
    }
    saveKnowledge(projectRoot, schema) {
        this.atomicWrite(this.getStoragePath(projectRoot), JSON.stringify(schema, null, 2));
    }
    async saveKnowledgeAsync(projectRoot, modifier) {
        const storagePath = this.getStoragePath(projectRoot);
        await this.withFileLock(storagePath, async () => {
            const schema = this.getKnowledge(projectRoot); // Read fresh state under lock
            modifier(schema);
            this.atomicWrite(storagePath, JSON.stringify(schema, null, 2));
        });
    }
    /** Fills in default Wave 0 fields for rules created before the migration. */
    migrateRule(r) {
        return {
            id: r.id,
            pattern: r.pattern,
            solution: r.solution,
            tags: r.tags ?? [],
            timestamp: r.timestamp ?? new Date().toISOString(),
            updatedAt: r.updatedAt ?? r.timestamp ?? new Date().toISOString(),
            mandatory: r.mandatory ?? false,
            scope: r.scope ?? 'all',
            priority: r.priority ?? 0,
            status: r.status ?? 'approved',
            conditions: r.conditions ?? {},
            matchCount: r.matchCount ?? 0,
            appliedCount: r.appliedCount ?? 0,
            skippedCount: r.skippedCount ?? 0,
            lastMatchedAt: r.lastMatchedAt,
            lastAppliedAt: r.lastAppliedAt,
        };
    }
    // ──────────────────────────────────────────────────────────────
    // CRUD
    // ──────────────────────────────────────────────────────────────
    /**
     * Adds a new rule with normalized deduplication.
     * If a rule with the same normalized pattern + solution already exists, returns the existing rule.
     *
     * Phase 6.5 — Input validation guards applied before any write.
     */
    static MAX_REGEX_LENGTH = 200;
    static MAX_FIELD_LENGTH = 2000;
    async learn(projectRoot, pattern, solution, tags = [], options = {}) {
        // LS-16: Comprehensive input validation — type-check before any write or .length access
        if (!pattern || typeof pattern !== 'string') {
            throw new Error('Rule pattern is required and must be a non-empty string.');
        }
        if (!solution || typeof solution !== 'string') {
            throw new Error('Rule solution is required and must be a non-empty string.');
        }
        if (!Array.isArray(tags)) {
            throw new Error('tags must be an array of strings.');
        }
        for (const tag of tags) {
            if (typeof tag !== 'string') {
                throw new Error(`Each tag must be a string, got ${typeof tag}: ${String(tag)}`);
            }
        }
        if (options.conditions) {
            const c = options.conditions;
            const arrFields = ['toolNames', 'platforms', 'keywordsAll', 'keywordsAny', 'tagsAny', 'regexAny'];
            for (const field of arrFields) {
                const arr = c[field];
                if (arr !== undefined && !Array.isArray(arr)) {
                    throw new Error(`conditions.${field} must be an array.`);
                }
                if (Array.isArray(arr)) {
                    for (const item of arr) {
                        if (typeof item !== 'string') {
                            throw new Error(`conditions.${field} items must be strings, got ${typeof item}: ${String(item)}`);
                        }
                    }
                }
            }
        }
        // ── Phase 6.5: Input length guards ──────────────────────────
        if (pattern.length > LearningService.MAX_FIELD_LENGTH) {
            throw new Error(`Rule pattern exceeds maximum length (${LearningService.MAX_FIELD_LENGTH} chars). Truncate or summarize the pattern.`);
        }
        if (solution.length > LearningService.MAX_FIELD_LENGTH) {
            throw new Error(`Rule solution exceeds maximum length (${LearningService.MAX_FIELD_LENGTH} chars). Truncate or break into multiple rules.`);
        }
        // Validate any regexAny entries
        if (options.conditions?.regexAny) {
            for (const rx of options.conditions.regexAny) {
                if (rx.length > LearningService.MAX_REGEX_LENGTH) {
                    throw new Error(`regex pattern "${rx.slice(0, 40)}..." exceeds MAX_REGEX_LENGTH (${LearningService.MAX_REGEX_LENGTH}). Use simpler patterns.`);
                }
                try {
                    new RegExp(rx);
                }
                catch (e) {
                    throw new Error(`Invalid regex pattern "${rx.slice(0, 40)}...": ${e.message}`);
                }
            }
        }
        const normPattern = this.normalize(pattern);
        const normSolution = this.normalize(solution);
        let finalRule;
        await this.saveKnowledgeAsync(projectRoot, (knowledge) => {
            const existing = knowledge.rules.find(r => this.normalize(r.pattern) === normPattern && this.normalize(r.solution) === normSolution);
            if (existing) {
                finalRule = existing;
                return;
            }
            const now = new Date().toISOString();
            const newRule = {
                id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                pattern,
                solution,
                tags,
                timestamp: now,
                updatedAt: now,
                mandatory: options.mandatory ?? false,
                scope: options.scope ?? 'all',
                priority: options.priority ?? 0,
                status: options.status ?? (options.mandatory ? 'draft' : 'approved'),
                conditions: options.conditions ?? {},
                matchCount: 0,
                appliedCount: 0,
                skippedCount: 0,
            };
            knowledge.rules.push(newRule);
            finalRule = newRule;
        });
        return finalRule;
    }
    /** Updates mutable fields of an existing rule. Immutable: id, timestamp. */
    async updateRule(projectRoot, ruleId, updates) {
        let finalRule = null;
        await this.saveKnowledgeAsync(projectRoot, (knowledge) => {
            const rule = knowledge.rules.find(r => r.id === ruleId);
            if (rule) {
                Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
                finalRule = { ...rule };
            }
        });
        return finalRule;
    }
    /** Deletes a specific rule by ID. */
    async forget(projectRoot, ruleId) {
        let deleted = false;
        await this.saveKnowledgeAsync(projectRoot, (knowledge) => {
            const idx = knowledge.rules.findIndex(r => r.id === ruleId);
            if (idx !== -1) {
                knowledge.rules.splice(idx, 1);
                deleted = true;
            }
        });
        return deleted;
    }
    /** Returns all rules, optionally filtered by status or scope. */
    listRules(projectRoot, filter) {
        const rules = this.getKnowledge(projectRoot).rules;
        if (!filter)
            return rules;
        return rules.filter(r => {
            if (filter.status !== undefined && r.status !== filter.status)
                return false;
            if (filter.scope !== undefined && r.scope !== filter.scope && r.scope !== 'all')
                return false;
            if (filter.mandatory !== undefined && r.mandatory !== filter.mandatory)
                return false;
            return true;
        });
    }
    // ──────────────────────────────────────────────────────────────
    // Deterministic Rule Resolver (Phase 4.4)
    // ──────────────────────────────────────────────────────────────
    /**
     * Evaluates all rules against the given request context in fixed gate order:
     *   scope → tool → platform/file/tag → text matchers
     *
     * Conflict resolution (when two applicable rules compete):
     *   1. Higher `priority` wins
     *   2. Tie → more matched conditions wins (specificity)
     *   3. Still tied → newer `updatedAt` wins
     */
    async resolveApplicableRules(projectRoot, ctx) {
        const knowledge = this.getKnowledge(projectRoot);
        const now = new Date().toISOString();
        const appliedMandatory = [];
        const appliedOptional = [];
        const skippedMandatory = [];
        const skippedOptional = [];
        // Only work with non-rejected rules
        const candidates = knowledge.rules.filter(r => r.status !== 'rejected');
        // Evaluate each candidate
        const evaluated = [];
        for (const rule of candidates) {
            const { matched, conditionsMatched, skipReason } = this.evaluate(rule, ctx);
            evaluated.push({ rule, matched, conditionsMatched, skipReason });
        }
        // Filter to matched rules only
        let matched = evaluated.filter(e => e.matched);
        // Conflict resolution: sort descending by (priority, conditionsMatched, updatedAt)
        matched.sort((a, b) => {
            if (b.rule.priority !== a.rule.priority)
                return b.rule.priority - a.rule.priority;
            if (b.conditionsMatched !== a.conditionsMatched)
                return b.conditionsMatched - a.conditionsMatched;
            return new Date(b.rule.updatedAt).getTime() - new Date(a.rule.updatedAt).getTime();
        });
        // Detect conflicts (same pattern family competing)
        const seenPatterns = new Set();
        for (const entry of matched) {
            const normKey = this.normalize(entry.rule.pattern);
            if (seenPatterns.has(normKey)) {
                // Loser of conflict
                const skipReason = `conflict_with: higher-priority rule already applied for pattern "${entry.rule.pattern}"`;
                if (entry.rule.mandatory)
                    skippedMandatory.push({ rule: entry.rule, reason: skipReason });
                else
                    skippedOptional.push({ rule: entry.rule, reason: skipReason });
                entry.matched = false;
            }
            else {
                seenPatterns.add(normKey);
            }
        }
        // Prompt Budget Governance (Phase 6.2)
        const MAX_OPTIONAL_RULES = 15;
        // Separate mandatory from optional winners with budget constraints
        for (const entry of matched.filter(e => e.matched)) {
            if (entry.rule.mandatory) {
                // Only 'approved' mandatory rules participate in hard-fail path
                if (entry.rule.status === 'approved') {
                    appliedMandatory.push(entry.rule);
                }
                else {
                    skippedMandatory.push({ rule: entry.rule, reason: `status_not_approved: rule is "${entry.rule.status}", not enforced` });
                    entry.matched = false;
                }
            }
            else {
                if (appliedOptional.length < MAX_OPTIONAL_RULES) {
                    appliedOptional.push(entry.rule);
                }
                else {
                    skippedOptional.push({ rule: entry.rule, reason: `budget_exceeded: maximum optional rule limit (${MAX_OPTIONAL_RULES}) reached` });
                    entry.matched = false;
                }
            }
        }
        // Non-matched rules become skipped
        for (const entry of evaluated.filter((e) => !e.matched && !!e.skipReason)) {
            const reason = entry.skipReason ?? 'no_match';
            if (entry.rule.mandatory)
                skippedMandatory.push({ rule: entry.rule, reason });
            else
                skippedOptional.push({ rule: entry.rule, reason });
        }
        // Update health metrics concurrently safely
        await this.saveKnowledgeAsync(projectRoot, (lockedKnowledge) => {
            for (const entry of evaluated) {
                const lockedRule = lockedKnowledge.rules.find(r => r.id === entry.rule.id);
                if (lockedRule) {
                    lockedRule.matchCount = (lockedRule.matchCount ?? 0) + (entry.matched ? 1 : 0);
                    if (entry.matched) {
                        lockedRule.lastMatchedAt = now;
                        const wasApplied = appliedMandatory.some(r => r.id === entry.rule.id) || appliedOptional.some(r => r.id === entry.rule.id);
                        if (wasApplied) {
                            lockedRule.appliedCount = (lockedRule.appliedCount ?? 0) + 1;
                            lockedRule.lastAppliedAt = now;
                        }
                        else {
                            lockedRule.skippedCount = (lockedRule.skippedCount ?? 0) + 1;
                        }
                    }
                }
            }
        });
        return {
            applicableRules: [...appliedMandatory, ...appliedOptional],
            appliedMandatoryRules: appliedMandatory,
            appliedOptionalRules: appliedOptional,
            skippedMandatoryRules: skippedMandatory,
            skippedOptionalRules: skippedOptional,
        };
    }
    /** Evaluates a single rule against a request context through gate order. */
    evaluate(rule, ctx) {
        let conditionsMatched = 0;
        // Gate 1: Scope
        if (rule.scope !== 'all') {
            const expectedScope = ctx.toolName.startsWith('generate') ? 'generation' : 'healing';
            if (rule.scope !== expectedScope) {
                return { matched: false, conditionsMatched: 0, skipReason: `scope_mismatch: rule scope is "${rule.scope}", tool is "${ctx.toolName}"` };
            }
        }
        conditionsMatched++;
        // Gate 2: Tool name match
        if (rule.conditions.toolNames && rule.conditions.toolNames.length > 0) {
            if (!rule.conditions.toolNames.includes(ctx.toolName)) {
                return { matched: false, conditionsMatched, skipReason: `tool_mismatch: rule requires ${rule.conditions.toolNames.join('|')}, got "${ctx.toolName}"` };
            }
            conditionsMatched++;
        }
        // Gate 3: Platform match
        if (rule.conditions.platforms && rule.conditions.platforms.length > 0 && ctx.platform) {
            if (!rule.conditions.platforms.includes(ctx.platform)) {
                return { matched: false, conditionsMatched, skipReason: `platform_mismatch: rule requires ${rule.conditions.platforms.join('|')}, got "${ctx.platform}"` };
            }
            conditionsMatched++;
        }
        // Gate 4: Tag match
        if (rule.conditions.tagsAny && rule.conditions.tagsAny.length > 0) {
            const ctxTags = ctx.tags ?? [];
            if (!rule.conditions.tagsAny.some(t => ctxTags.includes(t))) {
                return { matched: false, conditionsMatched, skipReason: `tag_mismatch: rule requires any of [${rule.conditions.tagsAny.join(',')}], context tags: [${ctxTags.join(',')}]` };
            }
            conditionsMatched++;
        }
        // Gate 5: Text matchers
        const text = ctx.requestText.toLowerCase();
        if (rule.conditions.keywordsAll && rule.conditions.keywordsAll.length > 0) {
            const allMatch = rule.conditions.keywordsAll.every(kw => {
                // LS-16: Defensive null/type check before .toLowerCase()
                if (!kw || typeof kw !== 'string')
                    return false;
                return text.includes(kw.toLowerCase());
            });
            if (!allMatch) {
                return { matched: false, conditionsMatched, skipReason: `keywords_all_miss: not all required keywords present` };
            }
            conditionsMatched++;
        }
        if (rule.conditions.keywordsAny && rule.conditions.keywordsAny.length > 0) {
            const anyMatch = rule.conditions.keywordsAny.some(kw => {
                // LS-16: Defensive null/type check before .toLowerCase()
                if (!kw || typeof kw !== 'string')
                    return false;
                return text.includes(kw.toLowerCase());
            });
            if (!anyMatch) {
                return { matched: false, conditionsMatched, skipReason: `keywords_any_miss: none of the keywords present` };
            }
            conditionsMatched++;
        }
        if (rule.conditions.regexAny && rule.conditions.regexAny.length > 0) {
            const anyMatch = rule.conditions.regexAny.some(rxStr => {
                try {
                    // Safety: reject catastrophic backtracking regex patterns
                    if (rxStr.length > 200)
                        return false;
                    return new RegExp(rxStr, 'i').test(ctx.requestText);
                }
                catch {
                    return false;
                }
            });
            if (!anyMatch) {
                return { matched: false, conditionsMatched, skipReason: `regex_any_miss: no regex patterns matched` };
            }
            conditionsMatched++;
        }
        return { matched: true, conditionsMatched };
    }
    // ──────────────────────────────────────────────────────────────
    // Prompt Injection with Markers (Phase 4.5)
    // ──────────────────────────────────────────────────────────────
    /**
     * Builds the prompt injection block from resolved rules.
     * Each rule gets a verifiable marker: [RULE_ID=xxx][MANDATORY=true][SCOPE=generation]
     *
     * @throws Error if any applied mandatory rule marker is missing (hard-fail).
     */
    buildPromptInjection(resolved) {
        const allApplied = [...resolved.appliedMandatoryRules, ...resolved.appliedOptionalRules];
        if (allApplied.length === 0)
            return '';
        let block = `\n### 🧠 CUSTOM TEAM KNOWLEDGE & LEARNED FIXES\n`;
        block += `IMPORTANT: You MUST adhere to ALL rules below. These are prior human-in-the-loop corrections that OVERRIDE ordinary behavior.\n\n`;
        for (const rule of allApplied) {
            const marker = `[RULE_ID=${rule.id}][MANDATORY=${rule.mandatory}][SCOPE=${rule.scope}]`;
            block += `${marker}\n`;
            block += `**When**: "${rule.pattern}"\n`;
            block += `**Action**: ${rule.solution}\n`;
            if (rule.tags.length > 0)
                block += `_(Tags: ${rule.tags.join(', ')})_\n`;
            block += '\n';
        }
        // Hard-fail validation: ensure every mandatory rule marker is present
        for (const mandatory of resolved.appliedMandatoryRules) {
            const marker = `[RULE_ID=${mandatory.id}][MANDATORY=true]`;
            if (!block.includes(marker)) {
                throw new Error(`[RULE_ENFORCEMENT_FAILURE] Mandatory rule "${mandatory.id}" (pattern: "${mandatory.pattern}") ` +
                    `was resolved as applicable but its marker is missing from the injection block. Generation aborted.`);
            }
        }
        return block;
    }
    /**
     * Computes a stable SHA-256 hash of the prompt body for audit traceability.
     */
    hashPrompt(prompt) {
        return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    }
    // ──────────────────────────────────────────────────────────────
    // Audit Trail (Phase 4.3)
    // ──────────────────────────────────────────────────────────────
    /**
     * Appends an immutable audit entry to `.appium-mcp/learning-audit.jsonl`.
     * File is append-only (one JSON object per line).
     */
    async writeAuditEntry(projectRoot, entry) {
        const auditPath = this.getAuditPath(projectRoot);
        // Sanitize: strip anything that looks like a secret (Bearer tokens, passwords)
        const sanitized = JSON.stringify(entry).replace(/(password|token|secret|bearer)[^"]*"[^"]+"/gi, '$1":"[REDACTED]"');
        await this.withFileLock(auditPath, async () => {
            fs.appendFileSync(auditPath, sanitized + '\n', 'utf8');
        });
    }
    /** Reads the last N entries from the audit log. */
    readAuditLog(projectRoot, limit = 50) {
        const auditPath = this.getAuditPath(projectRoot);
        if (!fs.existsSync(auditPath))
            return [];
        try {
            const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
            const tail = lines.slice(-limit);
            return tail.map(l => { try {
                return JSON.parse(l);
            }
            catch {
                return null;
            } }).filter(Boolean);
        }
        catch {
            return [];
        }
    }
    // ──────────────────────────────────────────────────────────────
    // verify_training (Phase 4.1)
    // ──────────────────────────────────────────────────────────────
    /**
     * Dry-run simulation: shows what would be injected for a given context.
     * Does NOT update health metrics or write audit entries.
     */
    verifyTraining(projectRoot, ctx) {
        const knowledge = this.getKnowledge(projectRoot);
        const warnings = [];
        // Resolve without persisting metrics
        const resolved = this.resolveApplicableRulesReadOnly(projectRoot, ctx);
        let injectionPreview = '';
        try {
            injectionPreview = this.buildPromptInjection(resolved);
        }
        catch (e) {
            warnings.push(`⚠️ ENFORCEMENT FAILURE: ${e.message}`);
        }
        const promptHash = this.hashPrompt(injectionPreview);
        if (resolved.skippedMandatoryRules.length > 0) {
            for (const s of resolved.skippedMandatoryRules) {
                if (s.rule.status === 'approved') {
                    warnings.push(`⚠️ Approved mandatory rule "${s.rule.id}" will be SKIPPED: ${s.reason}`);
                }
            }
        }
        return {
            schemaVersion: LEARNING_SCHEMA_VERSION,
            applicableRules: resolved.applicableRules.map(r => ({
                id: r.id,
                pattern: r.pattern,
                mandatory: r.mandatory,
                matchReason: `priority=${r.priority} scope=${r.scope}`,
            })),
            appliedMandatoryRules: resolved.appliedMandatoryRules.map(r => ({ id: r.id, pattern: r.pattern })),
            skippedMandatoryRules: resolved.skippedMandatoryRules.map(s => ({
                id: s.rule.id,
                pattern: s.rule.pattern,
                reason: s.reason,
            })),
            injectionPreview,
            promptHash,
            warnings,
        };
    }
    /** Same as resolveApplicableRules but does NOT mutate health metrics or save. */
    resolveApplicableRulesReadOnly(projectRoot, ctx) {
        const knowledge = this.getKnowledge(projectRoot);
        const appliedMandatory = [];
        const appliedOptional = [];
        const skippedMandatory = [];
        const skippedOptional = [];
        const candidates = knowledge.rules.filter(r => r.status !== 'rejected');
        const evaluated = candidates.map(rule => {
            const { matched, conditionsMatched, skipReason } = this.evaluate(rule, ctx);
            return { rule, matched, conditionsMatched, skipReason };
        });
        let matched = evaluated.filter(e => e.matched);
        matched.sort((a, b) => {
            if (b.rule.priority !== a.rule.priority)
                return b.rule.priority - a.rule.priority;
            if (b.conditionsMatched !== a.conditionsMatched)
                return b.conditionsMatched - a.conditionsMatched;
            return new Date(b.rule.updatedAt).getTime() - new Date(a.rule.updatedAt).getTime();
        });
        const seenPatterns = new Set();
        for (const entry of matched) {
            const normKey = this.normalize(entry.rule.pattern);
            if (seenPatterns.has(normKey)) {
                const reason = `conflict_with: higher-priority rule already applied`;
                if (entry.rule.mandatory)
                    skippedMandatory.push({ rule: entry.rule, reason });
                else
                    skippedOptional.push({ rule: entry.rule, reason });
                entry.matched = false;
            }
            else {
                seenPatterns.add(normKey);
            }
        }
        const MAX_OPTIONAL_RULES = 15;
        for (const entry of matched.filter(e => e.matched)) {
            if (entry.rule.mandatory) {
                if (entry.rule.status === 'approved') {
                    appliedMandatory.push(entry.rule);
                }
                else {
                    skippedMandatory.push({ rule: entry.rule, reason: `status_not_approved: "${entry.rule.status}"` });
                    entry.matched = false;
                }
            }
            else {
                if (appliedOptional.length < MAX_OPTIONAL_RULES) {
                    appliedOptional.push(entry.rule);
                }
                else {
                    skippedOptional.push({ rule: entry.rule, reason: `budget_exceeded: maximum optional rule limit (${MAX_OPTIONAL_RULES}) reached` });
                    entry.matched = false;
                }
            }
        }
        for (const entry of evaluated.filter(e => !e.matched && e.skipReason)) {
            if (entry.rule.mandatory)
                skippedMandatory.push({ rule: entry.rule, reason: entry.skipReason });
            else
                skippedOptional.push({ rule: entry.rule, reason: entry.skipReason });
        }
        return { applicableRules: [...appliedMandatory, ...appliedOptional], appliedMandatoryRules: appliedMandatory, appliedOptionalRules: appliedOptional, skippedMandatoryRules: skippedMandatory, skippedOptionalRules: skippedOptional };
    }
    // ──────────────────────────────────────────────────────────────
    // Health & Stale Rule Analysis (Phase 6.1)
    // ──────────────────────────────────────────────────────────────
    analyzeRuleHealth(projectRoot) {
        const rules = this.getKnowledge(projectRoot).rules;
        const stale = rules.filter(r => r.matchCount === 0 || (r.appliedCount === 0 && r.matchCount > 3));
        const noisy = rules.filter(r => r.skippedCount > r.appliedCount * 2 && r.matchCount > 0);
        return {
            schemaVersion: LEARNING_SCHEMA_VERSION,
            totalRules: rules.length,
            approvedMandatory: rules.filter(r => r.mandatory && r.status === 'approved').length,
            draftMandatory: rules.filter(r => r.mandatory && r.status === 'draft').length,
            staleRules: stale.map(r => ({ id: r.id, pattern: r.pattern, matchCount: r.matchCount, appliedCount: r.appliedCount, lastMatchedAt: r.lastMatchedAt })),
            noisyRules: noisy.map(r => ({ id: r.id, pattern: r.pattern, skippedCount: r.skippedCount, appliedCount: r.appliedCount })),
        };
    }
    // ──────────────────────────────────────────────────────────────
    // Snapshot & Rollback (Phase 6.7)
    // ──────────────────────────────────────────────────────────────
    /**
     * Creates a timestamped snapshot of the current learning corpus.
     * Snapshots are stored in `.appium-mcp/snapshots/mcp-learning.<timestamp>.json`.
     * Returns the snapshot file path.
     */
    async createSnapshot(projectRoot) {
        const snapshotsDir = path.join(projectRoot, '.appium-mcp', 'snapshots');
        if (!fs.existsSync(snapshotsDir))
            fs.mkdirSync(snapshotsDir, { recursive: true });
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const snapshotPath = path.join(snapshotsDir, `mcp-learning.${timestamp}.json`);
        const knowledge = this.getKnowledge(projectRoot);
        this.atomicWrite(snapshotPath, JSON.stringify(knowledge, null, 2));
        return { snapshotPath, ruleCount: knowledge.rules.length, createdAt: now.toISOString() };
    }
    /**
     * Lists all available snapshots for a project, newest first.
     */
    listSnapshots(projectRoot) {
        const snapshotsDir = path.join(projectRoot, '.appium-mcp', 'snapshots');
        if (!fs.existsSync(snapshotsDir))
            return [];
        return fs.readdirSync(snapshotsDir)
            .filter(f => f.startsWith('mcp-learning.') && f.endsWith('.json'))
            .sort().reverse()
            .map(f => {
            const full = path.join(snapshotsDir, f);
            try {
                const content = JSON.parse(fs.readFileSync(full, 'utf8'));
                const ts = f.replace('mcp-learning.', '').replace('.json', '').replace(/-/g, (m, offset) => offset < 19 ? m : offset === 19 ? 'T' : offset < 25 ? m : '.');
                return { snapshotPath: full, createdAt: ts, ruleCount: content.rules?.length ?? 0 };
            }
            catch {
                return null;
            }
        })
            .filter(Boolean);
    }
    /**
     * Rolls back the learning corpus to a specific snapshot file.
     * The current corpus is backed up before rollback for safety.
     */
    async rollbackToSnapshot(projectRoot, snapshotPath) {
        if (!fs.existsSync(snapshotPath)) {
            throw new Error(`Snapshot not found: ${snapshotPath}`);
        }
        let snapshotContent;
        try {
            snapshotContent = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        }
        catch (e) {
            throw new Error(`Snapshot file is corrupted or unreadable: ${snapshotPath}`);
        }
        // Safety backup of current state before overwrite
        const backup = await this.createSnapshot(projectRoot);
        // Overwrite active corpus atomically under lock
        const knowledgePath = this.getStoragePath(projectRoot);
        await this.withFileLock(knowledgePath, async () => {
            this.atomicWrite(knowledgePath, JSON.stringify(snapshotContent, null, 2));
        });
        return {
            rolledBackTo: snapshotPath,
            safetyBackupPath: backup.snapshotPath,
            ruleCount: snapshotContent.rules?.length ?? 0,
        };
    }
    // ──────────────────────────────────────────────────────────────
    // Legacy compatibility helpers
    // ──────────────────────────────────────────────────────────────
    /**
     * @deprecated Use resolveApplicableRules() + buildPromptInjection() instead.
     * Kept for backward compat with existing callers.
     */
    getKnowledgePromptInjection(projectRoot) {
        const knowledge = this.getKnowledge(projectRoot);
        if (knowledge.rules.length === 0)
            return '';
        let prompt = `\n### 🧠 CUSTOM TEAM KNOWLEDGE & LEARNED FIXES\n`;
        prompt += `IMPORTANT: You MUST adhere to the following learned rules.\n\n`;
        knowledge.rules.forEach((rule, idx) => {
            prompt += `**Rule ${idx + 1}**: When you encounter: "${rule.pattern}"\n`;
            prompt += `-> **Action/Solution**: ${rule.solution}\n`;
            if (rule.tags.length > 0)
                prompt += `(Tags: ${rule.tags.join(', ')})\n`;
            prompt += `\n`;
        });
        return prompt;
    }
    /** Exports the learning brain as Markdown. */
    exportToMarkdown(projectRoot) {
        const knowledge = this.getKnowledge(projectRoot);
        if (knowledge.rules.length === 0) {
            return '# AppForge — Team Knowledge Base\n\n_No rules learned yet. Use `train_on_example` to add patterns._\n';
        }
        let md = `# AppForge — Team Knowledge Base\n\n`;
        md += `**Schema Version**: ${knowledge.schemaVersion}\n`;
        md += `**Total Rules**: ${knowledge.rules.length}\n\n`;
        md += `| # | ID | Pattern | Mandatory | Status | Priority | Applied | Skipped | Learned |\n`;
        md += `|---|-----|---------|-----------|--------|----------|---------|---------|--------|\n`;
        knowledge.rules.forEach((rule, idx) => {
            md += `| ${idx + 1} | \`${rule.id}\` | ${rule.pattern.slice(0, 60)} | ${rule.mandatory ? '✅' : '—'} | ${rule.status} | ${rule.priority} | ${rule.appliedCount} | ${rule.skippedCount} | ${rule.timestamp.split('T')[0]} |\n`;
        });
        return md;
    }
    // ──────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────
    normalize(s) {
        // LS-16: Guard against null/undefined before calling toLowerCase
        if (!s || typeof s !== 'string')
            return '';
        return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
    }
}
