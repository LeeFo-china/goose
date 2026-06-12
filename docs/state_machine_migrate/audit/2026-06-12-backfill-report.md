# State Machine Runtime Backfill Report

- date: 2026-06-12
- status: implementation-ready, staging dry-run pending
- script: `apps/api/src/scripts/backfill-workflow-runtime-from-state-machine.ts`

## Scope

Implemented an idempotent workflow runtime backfill command for:

- customers -> `customer_main`
- projects -> `construction_main`
- expense requests -> `expense_approval`

The command supports:

```bash
cd apps/api
bun src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id "$TENANT_ID" --dry-run
bun src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id "$TENANT_ID" --apply
```

## Current Mapping Notes

The implementation follows the current domain enums and active template node
keys, not the older draft mapping in the original execution plan.

- Customer `potential` backfills to `following`.
- Customer `dormant` is skipped because `customer_main` has no dormant node.
- Customer `invalid` maps to `invalid`, but the current template has no invalid
  node, so the script reports `mapped_node_missing`.
- Project statuses map directly to current `construction_main` node keys.
- Expense `draft/draft` is skipped because the current approval runtime starts
  after submit.
- Expense `cancelled/cancelled` maps to `cancelled`, but the current template
  has no cancelled node, so the script reports `mapped_node_missing`.

## Verification Completed

```bash
cd apps/api
bun test src/scripts/workflow-runtime-backfill/plan.test.ts
bun run typecheck
bun run build
bun run check:file-size
bun src/scripts/backfill-workflow-runtime-from-state-machine.ts \
  --tenant-id 00000000-0000-0000-0000-000000000000 \
  --dry-run \
  --report /tmp/gooes-workflow-backfill-dry-run.md
```

All checks passed locally. The dummy dry-run scanned 0 rows and wrote the
report to `/tmp/gooes-workflow-backfill-dry-run.md`, which verifies CLI
argument parsing, remote read path, and report writing without mutating data.

## Pending Staging Verification

No staging dry-run/apply was executed in this workspace because a confirmed
staging tenant id is not available, and earlier remote migration status checks
failed with `SUPABASE_DB_PASSWORD` authentication errors for project
`fclnkyatvfvmzgzdqlba`.

Before marking Phase 4 accepted:

1. Run dry-run against a staging tenant and keep this report path or generate a
   tenant-specific replacement.
2. Run apply twice against staging.
3. Confirm the second apply creates zero new instances.
4. Run customer/project/expense reconciliation SQL and attach counts here.
