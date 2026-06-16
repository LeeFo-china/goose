# Workflow Post-Cleanup Smoke Report

- date: 2026-06-16
- generated at: 2026-06-16T13:34:05+08:00
- repository commit under test:
  `eeb68660937796c60a98e067b8a21a7785b108db`
- target API: `http://127.0.0.1:3000`
- target admin: `http://127.0.0.1:3010`
- smoke actor: tenant admin phone `18800000001`

## Team Notice

Team notice prepared:

- `docs/state_machine_migrate/2026-06-16-final-cleanup-team-notice.md`

The notice summarizes the final cleanup status, removed legacy objects,
current workflow source-of-truth contract, client requirements, and smoke focus.

## API Smoke

### Workflow Phase 5 Smoke

Command shape:

```bash
GOOES_API_BASE_URL=http://127.0.0.1:3000 \
PHASE5_SMOKE_EMPLOYEE_TOKEN=<redacted> \
PHASE5_SMOKE_PROJECT_ID=2d710a84-1045-4750-8dfd-51a0f463a4db \
bun run workflow:phase5-smoke
```

Result:

```json
{
  "ok": true,
  "checks": [
    "workflow tasks",
    "task center todos",
    "project workflow state"
  ]
}
```

### Direct Endpoint Smoke

The employee token was generated through `POST /admin/auth/login`; the token was
not written to this report.

Checked endpoints:

| endpoint | result |
| --- | --- |
| `GET /workflow-tasks?page=1&pageSize=20` | `200`, paginated, `20` items |
| `GET /task-center/todos?page=1&pageSize=20` | `200`, paginated, `0` items |
| `GET /workflow-subjects/project/2d710a84-1045-4750-8dfd-51a0f463a4db/state` | `200`, `current_node_key=constructing`, `actions=1` |
| `GET /projects/2d710a84-1045-4750-8dfd-51a0f463a4db/employee-detail-bootstrap` | `200`, `workflow_source=workflow_runtime`, `timeline_count=9` |

Raw summary:

```json
{
  "ok": true,
  "projectId": "2d710a84-1045-4750-8dfd-51a0f463a4db",
  "results": [
    {
      "name": "workflow tasks",
      "status": 200,
      "ok": true,
      "items": 20
    },
    {
      "name": "task center todos",
      "status": 200,
      "ok": true,
      "items": 0
    },
    {
      "name": "project workflow state",
      "status": 200,
      "ok": true,
      "current_node_key": "constructing",
      "actions": 1
    },
    {
      "name": "employee project detail bootstrap",
      "status": 200,
      "ok": true,
      "workflow_source": "workflow_runtime",
      "timeline_count": 9
    }
  ]
}
```

### Runtime And Final Audit

Commands:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:runtime-consistency-check
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Result:

| command | result |
| --- | --- |
| `workflow:runtime-consistency-check` | `ok: true`, `total_issues=0` |
| `workflow:final-completion-audit` | `ok: true`, `mode=final` |

## Admin Smoke

Command:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3010 \
pnpm --dir apps/admin test:e2e -- admin-smoke.spec.ts
```

Result:

| suite | result |
| --- | --- |
| `admin-smoke.spec.ts` | `13 passed` |

Covered admin areas:

- dashboard and organization/post configuration
- project creation dialog
- project detail acceptance workspace
- employee creation and role assignment dialog
- permission list
- WeChat rebind review page
- role permissions page
- expense list/action entry
- camera page basic empty state
- marketing H5 dialog
- usage pages

During this run, the camera smoke assertion was updated to accept the current
empty-state text `尚未绑定项目摄像头` as well as the previous
`未绑定设备通道`. The failure was a stale smoke assertion, not a workflow
cleanup regression.

Static admin verification:

```bash
pnpm --dir apps/admin check
```

Result: passed.

## Mini-Program Scope

This repository does not modify `/Users/leefo/Public/work/orange`. Mini-program
post-cleanup smoke still needs the orange team to confirm:

- customer project detail reads workflow timeline from bootstrap/state;
- employee project detail uses workflow runtime timeline and actions;
- procedure acceptance completes through workflow task/state refresh;
- payment collection node uses `/workflow-tasks` and task complete;
- no mini-program path calls removed legacy project/customer status endpoints.

Relevant handoff documents:

- `docs/state_machine_migrate/orange-workflow-handoff.md`
- `docs/state_machine_migrate/2026-06-14-orange-workflow-progress-handoff.md`
- `docs/state_machine_migrate/miniprogram-procedure-stage-acceptance-integration.md`
- `docs/state_machine_migrate/miniprogram-payment-collection-node-integration.md`

## Conclusion

Local API and admin smoke passed after the destructive workflow cleanup. The
workflow runtime remains consistent, final audit remains green, and admin pages
covering the main tenant workflows render successfully against the cleaned
schema.
