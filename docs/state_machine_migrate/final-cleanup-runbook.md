# Workflow Final Cleanup Runbook

Use this runbook only after Phase 4/5 staging verification and mini-program
rollout evidence are ready. Do not use it to bypass
`docs/state_machine_migrate/audit/manual-gates.json`.

## Required Evidence Before Apply

Create `docs/state_machine_migrate/audit/manual-gates.json` from
`docs/state_machine_migrate/audit/manual-gates.example.json` and fill every
field with real evidence:

| section | required evidence |
| --- | --- |
| `phase_acceptance` | Phase 4 backfill/reconciliation report and Phase 5 authenticated API smoke report |
| `api_contract` | proof that `workflow_state.actions`, `output_fields`, `/workflow-tasks`, and task complete are implemented by callers |
| `mini_program` | rollout confirmation, confirmer, confirmation time, minimum supported version, and release/test link |
| `admin_smoke` | authenticated admin smoke actor, smoke time, and evidence link |
| `backup_window` | backup id, restore window, and backup/restore evidence |

`mini_program.confirmed_at` and `admin_smoke.smoke_at` must be parseable
date-time strings, preferably ISO 8601 values with timezone offsets. They must
record completed checks and cannot be future timestamps.

`mini_program.minimum_version` must be a numeric version string such as
`2.8.0`, not a free-form rollout note.

Evidence values must be traceable: use either an `http(s)` URL or a
`docs/state_machine_migrate/` path. Local doc paths must reference existing
files; free-form notes are rejected by `workflow:manual-gates-check` and
`workflow:destructive-cleanup-preflight`.
The evidence file can be validated without a database connection:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
cd ../..
```

## Pre-Apply Commands

Run from repo root:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
cd ../..
```

Expected before apply:

- `workflow:manual-gates-check` is `ok: true`.
- `workflow:destructive-cleanup-preflight` is `ok: true`.
- The scripts read `SUPABASE_DB_DIRECT_URL` or `SUPABASE_DB_URL` and compare
  local migration files with `supabase_migrations.schema_migrations`; do not
  print or paste the database URL into reports.
- `SUPABASE_DB_DIRECT_URL` or `SUPABASE_DB_URL` must be present. The final
  cleanup scripts do not fall back to a linked Supabase project because the
  destructive target must be explicit.
- Pending migrations are exactly:
  - `20260612133000_drop_schedule_project_construction_transition.sql`
  - `20260612143000_drop_legacy_state_machine_objects.sql`
- `destructive_migration_content` is `ok: true`, proving the pending
  migration files still contain the expected old RPC, table, index, policy,
  constraint, and column drop targets, and do not drop retained business
  `status` columns.
- Migration history is aligned through `20260612124500`; the two entries above
  are the only local migrations missing from the target history before apply.
- `workflow_runtime_consistency` reports `total_issues=0`.
- `legacy_objects_still_targeted` is `ok: true`, proving the migration still
  targets existing legacy objects.

## Apply

Apply only after the pre-apply checks above pass:

```bash
cd /Users/leefo/Public/work/gooes
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
test -n "$SUPABASE_DB_DIRECT_URL"
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
```

Use the direct database URL for `supabase db push`; do not use the pooled URL
for migration apply. The `test -n` command only verifies that the variable is
present and must not be replaced with a command that prints the connection
string.

Record:

| item | value |
| --- | --- |
| apply actor | |
| apply started at | |
| apply finished at | |
| target environment/project | |
| command output location | |

## Post-Apply Technical Verification

Run:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-verify
cd ../..
supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba > apps/api/src/types/database.ts
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --technical-only \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --technical-only \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
cd ../..
bun run api:check
pnpm --dir apps/admin check
git diff --check
```

Expected after apply:

- `legacy_tables_absent`, `legacy_rpc_absent`,
  `legacy_expense_columns_absent`, `legacy_indexes_absent`, and
  `legacy_policies_absent` are `ok: true`.
- `workflow_runtime_consistency` reports `total_issues=0`.
- Generated database types no longer expose dropped legacy objects.
- `workflow:final-completion-audit --technical-only` reports all technical
  and manual checks as `ok: true`, while intentionally omitting the latest
  commit-message check.
- `workflow:migration-status --technical-only` has an empty `blockers` list.
- API and admin checks pass before the final commit.

Do not expect `workflow:final-completion-audit` without `--technical-only` to
be `ok: true` before the final commit. The full audit intentionally checks
that the latest commit documents the breaking workflow database cleanup.

## Final Commit

The final cleanup commit must be explicit about the breaking database cleanup:

```bash
git add supabase/migrations apps/api/src/types/database.ts docs/state_machine_migrate
git commit -m "refactor(workflow)!: 删除旧状态机数据库对象"
```

If the commit subject differs, include a `BREAKING CHANGE:` footer that
mentions the workflow/old state-machine database cleanup.

## Final Audit

Run after the final cleanup commit:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
cd ../..
```

Expected:

- `workflow:final-completion-audit` reports `no_pending_migrations` and
  `migration_list_aligned` as `ok: true` using the direct migration history
  check.
- `workflow:final-completion-audit` reports `destructive_migration_content`
  as `ok: true`, so the committed cleanup migrations still match the approved
  destructive object list.
- `workflow:final-completion-audit` reports `final_breaking_commit_documented`
  as `ok: true`.
- `workflow:final-completion-audit` is `ok: true`.

## Rollback

Rollback is database restore, not recreating empty legacy tables. Restore from
the backup recorded in `manual-gates.json`, then rerun:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:runtime-consistency-check
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```
