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
| `workflow:destructive-cleanup-preflight` without manual evidence | automated checks pass, including `destructive_migration_content`; fails only `manual_gates` |
| `workflow:destructive-cleanup-verify` before destructive apply | expected failure: legacy tables/RPC/columns/indexes still present; runtime consistency still passes |

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
2. Attach workflow API contract upgrade evidence for `workflow_state.actions`
   and `/workflow-tasks/:taskId/complete`.
3. Attach Phase 4 staging backfill/apply/reconciliation evidence.
4. Attach Phase 5 authenticated admin and mini-program smoke evidence.
5. Confirm backup and restore window for the target environment.
6. Run:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Expected: `workflow:manual-gates-check` validates the evidence file without a
database connection, then `workflow:destructive-cleanup-preflight` validates the
explicit target database, pending destructive migration pair, runtime
consistency, and legacy-object inventory.

7. Apply the destructive migration pair to staging first.
8. Regenerate `apps/api/src/types/database.ts` from the target project.
9. Run:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-verify
```

Expected: `legacy_tables_absent`, `legacy_rpc_absent`,
`legacy_expense_columns_absent`, `legacy_indexes_absent`,
`legacy_policies_absent`, and `workflow_runtime_consistency` are all
`ok: true`.

10. Run the final completion audit:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Expected: `no_pending_migrations`, `migration_list_aligned`,
`cleanup_readiness`, `destructive_cleanup_verify`,
`generated_database_types_clean`, `manual_gate_evidence`, and
`final_breaking_commit_documented` are all `ok: true`.
