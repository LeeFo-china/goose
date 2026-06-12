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

2026-06-12 initial local result:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `139` |
| blocker files | `32` |

2026-06-12 after switching admin customer/project panels to workflow
timeline/actions:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `131` |
| blocker files | `30` |
| customer/project admin component blockers | `0` |

2026-06-12 after attaching expense request list workflow state and switching
admin expense list node display to workflow projection:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `128` |
| blocker files | `29` |
| expense admin blocker references | `11` |

2026-06-12 after switching admin expense approve/reject/pay actions to
`/workflow-tasks/:id/complete`:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `126` |
| blocker files | `28` |
| expense admin blocker references | `9` |

2026-06-12 after removing admin expense legacy node filtering and approval-chain
display:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `117` |
| blocker files | `24` |
| expense admin blocker references | `0` |

2026-06-12 after removing task-center legacy expense todo projection:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `114` |
| blocker files | `23` |
| task-center blocker references | `0` |

2026-06-12 after removing the old expense todo API:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `109` |
| blocker files | `22` |
| `expense-requests/todo` blocker references | `0` |

2026-06-12 after removing legacy `current_step` list filtering:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `98` |
| blocker files | `20` |
| `current_step` list filter references | `0` |

2026-06-12 after removing old customer/project status endpoints:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `90` |
| blocker files | `18` |
| customer/project status endpoint controller references | `0` |

2026-06-12 after removing legacy expense `approval_chain` mutation input:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `81` |
| blocker files | `17` |
| expense schema `approval_chain` blocker references | `0` |
| expense drafts `approval_chain` blocker references | `0` |

2026-06-12 after removing customer legacy transition log writes:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `75` |
| blocker files | `15` |
| customer status transition log blocker references | `0` |

2026-06-12 after removing project legacy transition log reads/writes:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `70` |
| blocker files | `13` |
| project status transition log blocker references | `0` |

2026-06-12 after removing project construction scheduling RPC usage:

| check | result |
| --- | --- |
| exit code | `1` |
| ready | `false` |
| blocker references | `69` |
| blocker files | `12` |
| `schedule_project_construction_transition` blocker references | `0` |

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
- customer/project admin panels no longer require old status action/timeline
  endpoints for normal operation;
- expense request list responses now attach `workflow_state`, and the admin
  expense list current-node display/payment count read the workflow projection;
- admin expense approve/reject/pay actions now complete workflow tasks instead
  of directly calling the old expense action endpoints;
- admin expense pages no longer send `current_step` filters or render
  `approval_chain`; expense detail uses `workflow_state` for current workflow
  status;
- task-center expense todos no longer query legacy `current_step`; they keep
  using workflow tasks and only batch-load expense summary fields by id;
- the old `/expense-requests/todo` endpoint, query schema, and service method
  have been removed; task-center and clients should use workflow task surfaces;
- `/expense-requests` list/stats no longer accept or apply legacy
  `current_step` filters; workflow task endpoints own actionable node filters;
- old customer/project `status-actions`, `status-transition`, and
  `status-transitions` controller routes have been removed; customer detail
  activity no longer embeds old status action/timeline payloads;
- expense request create/update/submit request schemas no longer expose
  `approval_chain`, and mutation inputs no longer write old approval-chain
  rows directly;
- customer status changes no longer write `customer_status_transition_logs`;
  workflow runtime/subject state is the remaining status timeline source;
- project status changes no longer write/read `project_status_transition_logs`;
  `resume_project` uses workflow transition log context to find the paused
  source status;
- project construction scheduling no longer calls
  `schedule_project_construction_transition`; the RPC is covered by a drop
  migration with rollback notes;
- expense approval-chain APIs and UI are not yet fully replaced by workflow
  tasks/actions;
- generated database types still reflect the not-yet-dropped DB objects;
- backfill scripts still read legacy fields until historical data migration is
  applied and accepted.

Before creating the destructive cleanup migration, this command must report
`ready: true` or all remaining references must be explicitly reclassified as
allowed historical references.
