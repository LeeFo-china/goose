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

1. Confirm Local/Remote migration alignment with `supabase migration list`.
2. Confirm mini-program minimum supported version no longer reads legacy fields.
3. Apply to staging first.
4. Regenerate `apps/api/src/types/database.ts` from the target project.
5. Run:

```sql
SELECT to_regclass('public.customer_status_transition_logs') AS customer_logs,
       to_regclass('public.project_status_transition_logs') AS project_logs,
       to_regclass('public.expense_request_approval_chains') AS expense_chains;
```

Expected: all three values are `NULL`.
