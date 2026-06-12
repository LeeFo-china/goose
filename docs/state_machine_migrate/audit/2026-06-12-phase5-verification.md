# Phase 5 Verification Record

## Scope

Phase 5 switches read/action entry points toward workflow subject state and
workflow tasks:

- Task center expense todos read `workflow_tasks`.
- Customer self-service project payloads include `workflow_state`.
- Admin customer/project status panels render workflow actions first and old
  status actions only as fallback.
- Workflow task completion bridges customer/project/expense actions back into
  the existing business services during the compatibility window.

## Static Verification

2026-06-12 local verification:

| command | result |
| --- | --- |
| `cd apps/api && bun test src/services/workflow-task-action-metadata.test.ts src/services/workflow-task-customer-bridge.test.ts src/services/workflow-task-project-bridge.test.ts src/services/workflow-task-expense-bridge.test.ts` | passed, 9 tests / 15 expects |
| `bun run api:typecheck` | passed |
| `bun run api:build` | passed |
| `pnpm --dir apps/admin check` | passed |
| `git diff --check` | passed |
| `cd apps/api && bun test src/scripts/phase5-workflow-smoke.test.ts` | passed, 5 tests / 5 expects |

## Runtime Smoke

2026-06-12 local smoke:

| check | result |
| --- | --- |
| Existing admin server on `http://127.0.0.1:3010` | reachable; `/dashboard` redirects through the admin app |
| `pnpm --dir apps/admin exec playwright screenshot --timeout=15000 http://127.0.0.1:3010/dashboard /tmp/gooes-admin-dashboard.png` | passed; rendered employee login page |

The workspace does not have an authenticated admin browser session, so this
smoke only proves the admin app compiles and renders the login page. It does
not prove customer/project workflow action clicks in a real tenant.

## Repeatable API Smoke

Run this once staging tenant ids and authenticated employee/customer tokens are
available:

```bash
GOOES_API_BASE_URL="$GOOES_API_BASE_URL" \
PHASE5_SMOKE_EMPLOYEE_TOKEN="$TOKEN" \
PHASE5_SMOKE_CUSTOMER_TOKEN="$CUSTOMER_TOKEN" \
PHASE5_SMOKE_CUSTOMER_PROJECT_ID="$CUSTOMER_PROJECT_ID" \
PHASE5_SMOKE_PROJECT_ID="$PROJECT_ID" \
bun --cwd apps/api run workflow:phase5-smoke
```

Required variables:

| variable | purpose |
| --- | --- |
| `GOOES_API_BASE_URL` | Target API base URL |
| `PHASE5_SMOKE_EMPLOYEE_TOKEN` | Employee/admin token for `/workflow-tasks`, `/task-center/todos`, and project workflow state |

Optional variables:

| variable | purpose |
| --- | --- |
| `PHASE5_SMOKE_CUSTOMER_TOKEN` | Customer mini-program token for `/customer/bootstrap` |
| `PHASE5_SMOKE_CUSTOMER_PROJECT_ID` | Customer-owned project id for `/customer/projects/:id/detail-bootstrap` |
| `PHASE5_SMOKE_PROJECT_ID` | Project id for `/workflow-subjects/project/:id/state` |

The script asserts pagination boundaries, `workflow_state` presence where
expected, and workflow task action metadata including `output_fields`.

## Pending Acceptance

These checks are still required before Phase 5 can be fully accepted:

| gate | required evidence |
| --- | --- |
| Customer/project admin action smoke | authenticated admin user opens customer/project detail, sees workflow actions, submits at least one customer action and one project action through `/workflow-tasks/:id/complete` |
| Mini-program task/detail smoke | `bun --cwd apps/api run workflow:phase5-smoke` confirms `/workflow-tasks`, `/customer/bootstrap`, and customer self-service project detail include workflow data and remain paginated |
| Task center smoke | `bun --cwd apps/api run workflow:phase5-smoke` confirms task center todos stay paginated |
| Orange handoff | mini-program team confirms the updated `workflow_state.actions` / `output_fields` contract is implemented or scheduled before Phase 6 |
| Remote migration status | `supabase migration list` succeeds and Local/Remote are aligned before destructive cleanup |

## Current Blockers

- No staging tenant id and no authenticated API tokens are available in this
  workspace for customer/project/admin/mini-program smoke.
- `SUPABASE_DB_PASSWORD` authentication has failed for project
  `fclnkyatvfvmzgzdqlba` in earlier migration status checks, so remote
  migration alignment is still unverified.
