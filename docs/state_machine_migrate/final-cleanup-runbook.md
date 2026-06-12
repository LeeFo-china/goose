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
- Migration history is aligned through `20260612124500`; the two entries above
  are the only local migrations missing from the target history before apply.
- `workflow_runtime_consistency` reports `total_issues=0`.
- `legacy_objects_still_targeted` is `ok: true`, proving the migration still
  targets existing legacy objects.

## Apply

Apply only after the pre-apply checks above pass:

```bash
cd /Users/leefo/Public/work/gooes
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
```

Record:

| item | value |
| --- | --- |
| apply actor | |
| apply started at | |
| apply finished at | |
| target environment/project | |
| command output location | |

## Post-Apply Verification

Run:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-verify
cd ../..
supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba > apps/api/src/types/database.ts
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
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
- `workflow:final-completion-audit` reports `no_pending_migrations` and
  `migration_list_aligned` as `ok: true` using the direct migration history
  check.
- Generated database types no longer expose dropped legacy objects.
- `workflow:final-completion-audit` is `ok: true`.

## Final Commit

The final cleanup commit must be explicit about the breaking database cleanup:

```bash
git add supabase/migrations apps/api/src/types/database.ts docs/state_machine_migrate
git commit -m "refactor(workflow)!: 删除旧状态机数据库对象"
```

If the commit subject differs, include a `BREAKING CHANGE:` footer that
mentions the workflow/old state-machine database cleanup.

## Rollback

Rollback is database restore, not recreating empty legacy tables. Restore from
the backup recorded in `manual-gates.json`, then rerun:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:runtime-consistency-check
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```
