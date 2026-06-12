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

## Pre-Apply Commands

Run from repo root:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
cd ../..
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected before apply:

- `workflow:destructive-cleanup-preflight` is `ok: true`.
- Pending migrations are exactly:
  - `20260612133000_drop_schedule_project_construction_transition.sql`
  - `20260612143000_drop_legacy_state_machine_objects.sql`
- `workflow_runtime_consistency` reports `total_issues=0`.
- `legacy_objects_still_targeted` is `ok: true`, proving the migration still
  targets existing legacy objects.

## Apply

Apply only after the pre-apply checks above pass:

```bash
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
