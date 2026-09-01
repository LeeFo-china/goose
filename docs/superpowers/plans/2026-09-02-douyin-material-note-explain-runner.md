# Douyin Material Note EXPLAIN Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a protected, read-only dev EXPLAIN gate for the public material list, tenant keyword list, and active owned-material list without exposing tenant or anonymous-subject evidence.

**Architecture:** A dedicated API CLI resolves the fixed Task10 fixture inside one repeatable-read, read-only transaction, validates planner/index metadata, runs three bounded parameterized plans, and emits only a sanitized summary. A dedicated GitHub workflow verifies main, the exact deployed API revision, the dev database target, and migration history before invoking the CLI.

**Tech Stack:** Bun 1.3.2, TypeScript, `Bun.SQL`, Bun test, PostgreSQL JSON EXPLAIN, GitHub Actions, Supabase CLI 2.99.0.

---

### Task 1: Fail-closed configuration

**Files:**
- Create: `apps/api/src/scripts/douyin-material-note-explain-config.test.ts`
- Create: `apps/api/src/scripts/douyin-material-note-explain-config.ts`

- [ ] **Step 1: Write the failing configuration tests**

Test these exact contracts:

```ts
expect(MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG).toBe('Task10-A-20260902');
expect(parseMaterialNoteExplainConfig(validEnv())).toEqual({
  databaseUrl: 'postgresql://dev-reader:secret@db.example.test:5432/gooes',
});
expectFailure({}, 'CONFIRMATION_REQUIRED');
expectFailure(missingDatabaseEnv(), 'MISSING_CONFIG');
expectFailure(nonPostgresEnv(), 'INVALID_DATABASE_URL');
```

Also assert that errors never contain a database URL, password, fixture tag, or rejected input.

- [ ] **Step 2: Run RED**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain-config.test.ts
```

Expected: FAIL because the config module does not exist.

- [ ] **Step 3: Implement the minimal module**

```ts
export const MATERIAL_NOTE_EXPLAIN_CONFIRMATION = 'development-read-only';
export const MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG = 'Task10-A-20260902';
export const MATERIAL_NOTE_EXPLAIN_ENV = {
  confirmation: 'DOUYIN_MATERIAL_NOTE_EXPLAIN_CONFIRM',
  databaseUrl: 'DOUYIN_MATERIAL_NOTE_EXPLAIN_DB_URL',
} as const;

export interface MaterialNoteExplainConfig {
  readonly databaseUrl: string;
}

export class MaterialNoteExplainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MaterialNoteExplainError';
  }
}
```

`parseMaterialNoteExplainConfig()` requires the exact confirmation string and a PostgreSQL URL with host and database path. All rejection messages are stable and non-sensitive.

- [ ] **Step 4: Run GREEN and commit**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain-config.test.ts
git add src/scripts/douyin-material-note-explain-config.ts src/scripts/douyin-material-note-explain-config.test.ts
git commit -m "test(douyin): 锁定资料性能门禁配置"
```

### Task 2: Cardinality-aware plan evidence

**Files:**
- Create: `apps/api/src/scripts/douyin-material-note-explain-evidence.test.ts`
- Create: `apps/api/src/scripts/douyin-material-note-explain-evidence.ts`

- [ ] **Step 1: Write failing evidence tests**

Lock these names and policies:

```ts
export const MATERIAL_NOTE_EXPLAIN_QUERY_NAMES = [
  'public_list',
  'tenant_keyword_list',
  'owned_active_list',
] as const;

export const MATERIAL_NOTE_EXPLAIN_THRESHOLDS = {
  cardinalityLimit: 1_000,
  statementTimeoutMs: 5_000,
  planningMs: 50,
  executionMs: 250,
  sharedReadBlocks: 20_000,
  tempBlocks: 0,
} as const;
```

Manifest mappings:

- `public_list`: notes public index, versions tenant-note index, claims owned index.
- `tenant_keyword_list`: notes tenant index and all three version trigram indexes.
- `owned_active_list`: claims owned index and versions tenant-note index.

Test malformed plans, small-table Seq Scan acceptance, large-table Seq Scan rejection, required approved index at 1,000 rows, invalid/unready/wrong-relation metadata, non-default planner settings, timing/buffer thresholds, and summary redaction.

- [ ] **Step 2: Run RED**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain-evidence.test.ts
```

Expected: FAIL because the evidence module is missing.

- [ ] **Step 3: Implement the parser and gate**

Recursively collect only node type, public relation, index name, actual rows/loops, planning/execution time and buffer counters. Never return filter text, index conditions, SQL, bindings, raw plan JSON or identifiers. Use the supplier runner's already-proven `effective_cache_size` and `search_path` default-baseline exceptions without importing or changing supplier modules.

- [ ] **Step 4: Run GREEN and commit**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain-evidence.test.ts
git add src/scripts/douyin-material-note-explain-evidence.ts src/scripts/douyin-material-note-explain-evidence.test.ts
git commit -m "test(douyin): 锁定资料查询计划证据"
```

### Task 3: Read-only database orchestration and sanitized CLI

**Files:**
- Create: `apps/api/src/scripts/douyin-material-note-explain.test.ts`
- Create: `apps/api/src/scripts/douyin-material-note-explain-cli.test.ts`
- Create: `apps/api/src/scripts/douyin-material-note-explain.ts`

- [ ] **Step 1: Write failing SQL and transaction tests**

Export exactly three parameterized `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, VERBOSE, FORMAT JSON)` queries:

```sql
-- public_list
SELECT note.id, note.published_at, version.title,
  EXISTS (SELECT 1 FROM public.douyin_material_note_claims AS claim
    WHERE claim.tenant_id = note.tenant_id AND claim.note_id = note.id
      AND claim.douyin_miniapp_installation_id = $2::uuid
      AND claim.subject_hash = $3::text AND claim.removed_at IS NULL) AS claimed
FROM public.douyin_material_notes AS note
JOIN public.douyin_material_note_versions AS version
  ON version.id = note.published_version_id
  AND version.note_id = note.id AND version.tenant_id = note.tenant_id
WHERE note.tenant_id = $1::uuid AND note.status = 'published'
ORDER BY note.published_at DESC, note.id DESC
LIMIT 20;
```

```sql
-- tenant_keyword_list
SELECT note.id, note.updated_at
FROM public.douyin_material_notes AS note
WHERE note.tenant_id = $1::uuid
  AND EXISTS (SELECT 1 FROM public.douyin_material_note_versions AS version
    WHERE version.tenant_id = note.tenant_id AND version.note_id = note.id
      AND (version.title ILIKE $2 ESCAPE '\\'
        OR version.summary ILIKE $2 ESCAPE '\\'
        OR version.category ILIKE $2 ESCAPE '\\'))
ORDER BY note.updated_at DESC, note.id DESC
LIMIT 20;
```

```sql
-- owned_active_list
SELECT claim.id, claim.claimed_at, note.status, version.title
FROM public.douyin_material_note_claims AS claim
JOIN public.douyin_material_notes AS note
  ON note.id = claim.note_id AND note.tenant_id = claim.tenant_id
JOIN public.douyin_material_note_versions AS version
  ON version.id = claim.claimed_version_id
  AND version.note_id = claim.note_id AND version.tenant_id = claim.tenant_id
WHERE claim.tenant_id = $1::uuid
  AND claim.douyin_miniapp_installation_id = $2::uuid
  AND claim.subject_hash = $3::text AND claim.removed_at IS NULL
ORDER BY claim.claimed_at DESC, claim.id DESC
LIMIT 20;
```

Assert no exported query starts with a write/DDL statement. The fake database must observe:

```text
begin -> set read-only repeatable-read -> set 5s timeout -> guard-start ->
role -> planner -> fixture-preflight -> claim-preflight -> bounded counts ->
index metadata -> public_list -> tenant_keyword_list -> owned_active_list ->
guard-end -> close
```

The fixture preflight resolves exactly one published note and one active merchant installation from `Task10-A-20260902`. The claim preflight requires at least one active claim, selects the latest by `claimed_at DESC, id DESC LIMIT 1`, and keeps its subject hash only in memory. Zero claims fails `REPRESENTATIVE_CLAIM_MISSING`; ambiguous fixture/installation fails `INVALID_FIXTURE`.

- [ ] **Step 2: Run RED**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain.test.ts src/scripts/douyin-material-note-explain-cli.test.ts
```

- [ ] **Step 3: Implement the runner**

Use one `Bun.SQL` connection with `max: 1`, `prepare: false` and 10-second connection timeout. Start with:

```ts
await sql.unsafe('set transaction isolation level repeatable read, read only');
await sql.unsafe("set local statement_timeout = '5000ms'");
```

Validate the same backend and transaction settings at both ends. Normalize PostgreSQL `57014` to `QUERY_TIMEOUT`, unknown database errors to `DATABASE_FAILURE`, and CLI failures to only `DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:STABLE_CODE`.

- [ ] **Step 4: Run GREEN and commit**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain*.test.ts
git add src/scripts/douyin-material-note-explain.ts src/scripts/douyin-material-note-explain.test.ts src/scripts/douyin-material-note-explain-cli.test.ts
git commit -m "feat(douyin): 增加资料查询性能门禁"
```

### Task 4: Package, protected workflow and runbook contracts

**Files:**
- Create: `apps/api/src/scripts/douyin-material-note-explain-workflow-contract.test.ts`
- Create: `apps/api/src/scripts/douyin-material-note-explain-docs-contract.test.ts`
- Create: `.github/workflows/verify-dev-douyin-material-note-explain.yml`
- Create: `docs/runbooks/douyin-material-note-explain.md`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write failing contract tests**

Require package script `douyin:material-note:explain`. Require workflow dispatch inputs `commit_sha` and `confirmation`, read-only GitHub permissions, fixed dev runner, exact main/deployed-revision guards, production host/ref deny lists, migration verification through `20260901120030`, only the two CLI env values, exactly three summary queries, and only sanitized summary plus migration evidence in the artifact.

Require the runbook to document the exact manifest, thresholds, fixture tag, stable errors, `REPEATABLE READ READ ONLY`, no SQL fixture writes, and no raw UUID/hash/URL/plan retention.

- [ ] **Step 2: Run RED**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain-workflow-contract.test.ts src/scripts/douyin-material-note-explain-docs-contract.test.ts
```

- [ ] **Step 3: Add command, workflow and runbook**

Package script:

```json
"douyin:material-note:explain": "bun src/scripts/douyin-material-note-explain.ts"
```

Workflow step order:

```text
Guard development runner and request
Checkout verified commit
Verify immutable checkout and deployed revision
Set up Node
Set up Bun
Install API workflow dependencies
Verify development database target and migration history
Run read-only material note EXPLAIN
Verify material note EXPLAIN summary
Upload material note EXPLAIN evidence
```

The run step passes only the confirmation and dev direct URL to the CLI, redirects stdout to `material-note-explain-summary.json`, validates `gate=douyin_material_note_queries` and `queryCount=3`, then uploads the sanitized summary and migration evidence.

- [ ] **Step 4: Run GREEN and commit**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain-workflow-contract.test.ts src/scripts/douyin-material-note-explain-docs-contract.test.ts
git add package.json src/scripts/douyin-material-note-explain-*.test.ts ../../../.github/workflows/verify-dev-douyin-material-note-explain.yml ../../../docs/runbooks/douyin-material-note-explain.md
git commit -m "ci(douyin): 增加资料性能验证工作流"
```

### Task 5: Full local verification and integration

**Files:**
- Modify only files from Tasks 1-4 when a failing requirement proves a correction is needed.

- [ ] **Step 1: Run focused and repository checks**

```bash
cd apps/api
bun test src/scripts/douyin-material-note-explain*.test.ts
cd ../..
bun run api:check
bun test scripts/release-orchestration-contract.test.ts
git diff --check
```

Expected: zero failures; no migration, dependency, public/tenant API contract, Orange file, or supplier EXPLAIN file changed.

- [ ] **Step 2: Review sensitive output paths**

Prove stdout/artifact cannot contain database URL, tenant/install/note/claim UUID, subject hash, phone, token, SQL binding, filter predicate or raw plan. Prove a missing real claim fails without creating data.

- [ ] **Step 3: Commit only test-driven corrections**

```bash
git status --short
git add apps/api/src/scripts/douyin-material-note-explain-config.ts \
  apps/api/src/scripts/douyin-material-note-explain-evidence.ts \
  apps/api/src/scripts/douyin-material-note-explain.ts \
  apps/api/src/scripts/douyin-material-note-explain*.test.ts \
  apps/api/package.json \
  .github/workflows/verify-dev-douyin-material-note-explain.yml \
  docs/runbooks/douyin-material-note-explain.md
git commit -m "fix(douyin): 加固资料性能验证边界"
```

Skip this commit when no correction is required.

### Task 6: Push main, deploy exact SHA and execute dev gate

**Files:**
- No source edits expected.

- [ ] **Step 1: Integrate through the established main flow**

Keep the unfinished handoff document out of implementation commits. Push reviewed commits to main without force push.

- [ ] **Step 2: Release API dev at the new main SHA**

Run the established Release Dev workflow. Wait for migration verification, API readiness and immutable image/revision checks. Verify `https://api-dev.goodcms.cn/` returns 200 and the container revision equals the new SHA.

- [ ] **Step 3: Dispatch the protected EXPLAIN workflow**

Use the exact deployed SHA and `development-read-only`. Before a real public claim exists, the truthful expected result is `DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:REPRESENTATIVE_CLAIM_MISSING`. After real account smoke creates an active claim, rerun unchanged and require a successful sanitized artifact with three distinct query summaries.

### Task 7: Update integration evidence

**Files:**
- Modify: `docs/miniprogram/2026-09-01-douyin-material-note-claims-handoff.md`

- [ ] **Step 1: Record immutable evidence**

Record implementation SHA, Release Dev run, API revision/digest, EXPLAIN workflow run, fixture tag and sanitized plans or stable missing-claim result. Never record direct IDs, subject hash, phone, token or database URL.

- [ ] **Step 2: Verify and commit truthful evidence**

```bash
git diff --check
rg -n '1[3-9][0-9]{9}|Bearer[[:space:]]+|eyJ[A-Za-z0-9_-]{20,}|postgres(?:ql)?://' docs/miniprogram/2026-09-01-douyin-material-note-claims-handoff.md
```

Expected sensitive search: no matches. Commit the handoff only when it states clearly whether all three plans passed or the real-claim prerequisite remains open.
