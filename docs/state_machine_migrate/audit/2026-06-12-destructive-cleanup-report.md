# Destructive Cleanup Migration Report

- date: 2026-06-12
- migration: `supabase/migrations/20260612143000_drop_legacy_state_machine_objects.sql`
- status: migration prepared, target apply pending

## Local Readiness

```bash
cd apps/api
bun src/scripts/workflow-cleanup-readiness.ts
```

Result:

| check | result |
| --- | --- |
| ready | `true` |
| blocker references | `0` |
| blocker files | `0` |

## Objects Dropped By Migration

| object | action |
| --- | --- |
| `schedule_project_construction_transition(...)` | drop RPC |
| `customer_status_transition_logs` | drop table and legacy indexes |
| `project_status_transition_logs` | drop table and legacy indexes |
| `expense_request_approval_chains` | drop table and legacy indexes |
| `expense_requests.current_step` | drop column, check constraint, index |
| `expense_requests.current_step_role` | drop column |

`customers.status`, `projects.status`, and `expense_requests.status` are not
dropped in this migration. Current application code still uses those columns as
business status fields; workflow runtime now owns actionable node state.

## Target Pre-Cleanup Inventory

2026-06-12 read-only verification against Supabase project
`fclnkyatvfvmzgzdqlba`:

| check | result |
| --- | --- |
| `supabase migration list` | aligned through `20260612124500`; pending only `20260612133000` and `20260612143000` |
| `supabase db push --dry-run` | would push only the two destructive cleanup migrations |
| `workflow:runtime-consistency-check` | `ok: true`, `total_issues: 0` |
| `workflow:cleanup-readiness` | `ready: true`, `blockers: 0` |
| `workflow:destructive-cleanup-preflight` without manual evidence | automated checks pass; fails only `manual_gates` |

Legacy objects still present before destructive cleanup:

| object | current state |
| --- | ---: |
| `customer_status_transition_logs` | exists, `27` rows |
| `project_status_transition_logs` | exists, `42` rows |
| `expense_request_approval_chains` | exists, `6` rows |
| `schedule_project_construction_transition(...)` | exists |
| `expense_requests.current_step` | exists |
| `expense_requests.current_step_role` | exists |
| legacy transition / approval-chain / `current_step` indexes | exist |

Workflow replacement state in the same target:

| object | current state |
| --- | ---: |
| `workflow_subject_states` | `21` rows |
| pending `workflow_tasks` | `39` rows |

## Rollback

Restore the database from the latest pre-cleanup backup. If object definitions
must be recreated for emergency compatibility, use the original migrations
listed in `20260612143000_drop_legacy_state_machine_objects.sql`, then restore
historical data from backup. Recreating empty legacy tables is not a valid data
rollback.

## Pending Target Verification

Target destructive apply was not executed in this workspace. Remote migration
status now succeeds through `20260612124500`; the remaining pending migrations
are the destructive cleanup pair. Before applying to production:

1. Confirm mini-program minimum supported version no longer reads legacy fields.
2. Attach authenticated admin and mini-program smoke evidence.
3. Confirm backup and restore window for the target environment.
4. Run:

```bash
cd apps/api
bun run workflow:destructive-cleanup-preflight \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

5. Apply the destructive migration pair to staging first.
6. Regenerate `apps/api/src/types/database.ts` from the target project.
7. Run:

```sql
SELECT to_regclass('public.customer_status_transition_logs') AS customer_logs,
       to_regclass('public.project_status_transition_logs') AS project_logs,
       to_regclass('public.expense_request_approval_chains') AS expense_chains;
```

Expected: all three values are `NULL`.
