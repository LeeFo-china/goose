# Cleanup Readiness Report

## Scope

This report records the local, non-destructive Phase 6/7 readiness scan for
legacy state-machine references. It does not apply a database migration and
does not remove code.

## Command

```bash
bun --cwd apps/api run workflow:cleanup-readiness
```

Expected before destructive cleanup: exit code `0` and `"ready": true`.

## Result

2026-06-12 local result:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `139` |
| blocker files | `32` |

## Pattern Counts

The scanner counts both blocking production references and allowed historical
references in docs, migrations, generated types, and tests.

| pattern | count |
| --- | ---: |
| `current_step` | 137 |
| `approval_chain` | 86 |
| `customer_status_transition_logs` | 83 |
| `expense_request_approval_chains` | 65 |
| `project_status_transition_logs` | 60 |
| `status-transition` | 38 |
| `status-transitions` | 25 |
| `schedule_project_construction_transition` | 22 |
| `current_step_role` | 16 |
| `status-actions` | 15 |

## First Blocker Files

The first blocker files from the local scan:

| file | cleanup implication |
| --- | --- |
| `apps/api/src/repositories/projects/legacy/mutations.ts` | still calls `schedule_project_construction_transition` |
| `apps/api/src/repositories/project-status-transitions.ts` | still writes/reads `project_status_transition_logs` |
| `apps/api/src/repositories/customer-status-transitions.ts` | still writes/reads `customer_status_transition_logs` |
| `apps/api/src/repositories/expense-requests/legacy/shared.ts` | still models `current_step` / `approval_chain` |
| `apps/api/src/repositories/expense-requests/legacy/approvals.ts` | still writes/reads `expense_request_approval_chains` |
| `apps/api/src/repositories/expense-requests/legacy/lists.ts` | still filters/selects `current_step` |
| `apps/api/src/repositories/expense-requests/legacy-repository.ts` | still selects `expense_request_approval_chains` |
| `apps/api/src/repositories/task-center.ts` | still has legacy expense `current_step` projections |
| `apps/api/src/schema/expense-requests.ts` | still exposes `approval_chain` / `current_step` API fields |
| `apps/api/src/controllers/projects/status-bootstrap-controller.ts` | still exposes old project status endpoints |
| `apps/api/src/controllers/customer/extras-controller.ts` | still exposes old customer status endpoints |
| `apps/api/src/services/customer-status.ts` | still uses old customer status transition repository/config |
| `apps/api/src/services/project-status.ts` | still uses old project status transition repository/config |
| `apps/api/src/services/expense-requests/legacy/*` | still owns legacy expense approval-chain behavior |
| `apps/admin/components/customers/customer-status-panel.tsx` | still has old status endpoint fallback |
| `apps/admin/components/projects/project-status-panel-state.ts` | still has old status endpoint fallback |
| `apps/admin/components/expenses/*` | still displays/filter legacy expense `current_step` / approval chain |
| `packages/domain/src/customer.ts` | still exports old customer status action config |
| `packages/domain/src/project.ts` | still exports old project status action config |

## Interpretation

Phase 6 destructive cleanup is not ready. The remaining blockers are expected
because the system is still in the compatibility window:

- old status endpoints and admin fallbacks still exist;
- expense approval-chain APIs and UI are not yet fully replaced by workflow
  tasks/actions;
- generated database types still reflect the not-yet-dropped DB objects;
- backfill scripts still read legacy fields until historical data migration is
  applied and accepted.

Before creating the destructive cleanup migration, this command must report
`ready: true` or all remaining references must be explicitly reclassified as
allowed historical references.
