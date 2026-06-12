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

## Runtime Smoke

2026-06-12 local smoke:

| check | result |
| --- | --- |
| Existing admin server on `http://127.0.0.1:3010` | reachable; `/dashboard` redirects through the admin app |
| `pnpm --dir apps/admin exec playwright screenshot --timeout=15000 http://127.0.0.1:3010/dashboard /tmp/gooes-admin-dashboard.png` | passed; rendered employee login page |

The workspace does not have an authenticated admin browser session, so this
smoke only proves the admin app compiles and renders the login page. It does
not prove customer/project workflow action clicks in a real tenant.

## Pending Acceptance

These checks are still required before Phase 5 can be fully accepted:

| gate | required evidence |
| --- | --- |
| Customer/project admin action smoke | authenticated admin user opens customer/project detail, sees workflow actions, submits at least one customer action and one project action through `/workflow-tasks/:id/complete` |
| Mini-program task/detail smoke | authenticated mini-program token confirms `/workflow-tasks`, `/customer/bootstrap`, and customer self-service project detail include workflow data and remain paginated |
| Task center smoke | authenticated employee token confirms task center expense todos match pending workflow tasks |
| Orange handoff | mini-program team confirms the updated `workflow_state.actions` / `output_fields` contract is implemented or scheduled before Phase 6 |
| Remote migration status | `supabase migration list` succeeds and Local/Remote are aligned before destructive cleanup |

## Current Blockers

- No staging tenant id and no authenticated API tokens are available in this
  workspace for customer/project/admin/mini-program smoke.
- `SUPABASE_DB_PASSWORD` authentication has failed for project
  `fclnkyatvfvmzgzdqlba` in earlier migration status checks, so remote
  migration alignment is still unverified.
