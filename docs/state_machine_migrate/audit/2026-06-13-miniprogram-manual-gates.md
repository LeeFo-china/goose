# 2026-06-13 Orange Mini-Program Manual Gate Evidence

## Scope

This document records Orange mini-program evidence for the workflow state
machine migration manual gates. It covers frontend integration work for:

- `workflow_state.actions` as the source of customer, project, and expense
  actionable buttons.
- `/workflow-tasks` as the task-center list source.
- `POST /workflow-tasks/:taskId/complete` for customer, project, and expense
  workflow task completion where a workflow action is present.
- Legacy fields retained for read-only display only. Customer, project, expense,
  and task-center pages no longer call legacy action endpoints to generate or
  complete workflow actions.

## Implementation Summary

Orange repository:

`/Users/leefo/Public/work/orange`

Implemented changes:

- Added `src/types/api/workflow_task.d.ts`.
- Added `src/services/workflow_task.ts`.
- Updated task center to read `/workflow-tasks` with pagination and map tasks
  into the existing card view model.
- Updated home task summary to derive counts from `/workflow-tasks` pagination
  instead of `/task-center/todos/summary`.
- Updated expense todo view to read `/workflow-tasks?subject_type=expense_request`
  and load detail records by task subject ID for card display.
- Updated expense detail actions so approve, reject, cancel, and pay use
  `WorkflowTaskService.complete` when `workflow_state.actions` provides a task.
- Removed new expense create/update/submit payload usage of `approval_chain`.
- Updated project detail bootstrap to prefer project `workflow_state.actions`
  over legacy `status_actions`.
- Updated project status transition, schedule construction, and first-time sign
  contract flows to call workflow task complete. Missing workflow task metadata
  now blocks the action instead of falling back to old project status endpoints.
- Updated customer detail status actions to prefer customer
  `workflow_state.actions` and call workflow task complete. Missing workflow
  task metadata now blocks the action instead of falling back to old customer
  status endpoints.
- Updated customer follow-up auto-start-following and project-create
  start-design customer sync to use workflow task complete.
- Split customer status action orchestration into
  `src/packageCustomers/pages/customerDetail/hooks/useCustomerStatusActions.ts`
  to keep frontend files under the Orange size threshold.

## Automated Verification

Verification time: `2026-06-13T12:52:45+08:00`

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | Passed. `tsc -p tsconfig.typecheck.json --noEmit` completed with exit code 0. |
| `npx eslint <changed workflow files>` | Passed. Changed workflow integration files completed with exit code 0. |
| `pnpm run check:file-size` | Passed. 627 tracked source files checked; non-generated files are <= 500 lines. Generated exception: `src/types/database.ts`. |
| `pnpm run build:weapp` | Passed. Taro v4.1.11 WeChat mini-program build compiled successfully in 14.84s. |
| `git diff --check` | Passed. No whitespace errors reported. |

## Backend Evidence Path Probe

Format-only probe time: `2026-06-13T13:00:00+08:00`

The backend checker function `validateManualGateEvidence` was executed with a
synthetic complete evidence object to validate path format and local file
existence only. The probe used this document for both `api_contract.evidence`
and `mini_program.evidence`:

```text
docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md
```

Probe result:

```json
{
  "ok": true,
  "missing": [],
  "invalid": []
}
```

This probe does not confirm the mini-program smoke, admin smoke, backup window,
or production readiness gates. It only proves the evidence path is acceptable to
the backend checker once real gate values are filled.

## WeChat DevTools Automation Attempt

Attempt time: `2026-06-13T13:07:56+08:00`

Local WeChat DevTools was found at:

```text
/Applications/wechatwebdevtools.app
```

The app was running and the entrance screen showed the `orange` project at:

```text
/Users/leefo/Public/work/orange
```

The root `project.config.json` points `miniprogramRoot` to `dist/`, and the
latest `pnpm run build:weapp` had generated `dist/app.json` and
`dist/project.config.json`.

Automation status:

- `cli islogin --project /Users/leefo/Public/work/orange/dist` did not return
  output within 40 seconds and was terminated.
- `cli open --project /Users/leefo/Public/work/orange --port 9420` did not
  return output within 60 seconds and was terminated.
- Computer Use could read the DevTools window but could not keep the NW.js app
  active for click actions.

No manual smoke flow was completed by automation. The manual smoke checklist
below still requires a human-run WeChat DevTools or real-device session.

## Manual Smoke Checklist

These checks still require WeChat DevTools or a real mini-program test build
against the target backend environment before setting `manual-gates.json`
mini-program fields to confirmed:

- Customer flow: new lead follow-up, mark arrived, start design, sign.
- Project flow: sign contract, schedule construction, pause, resume, start
  acceptance.
- Expense flow: submit request, manager approve, finance approve, reject,
  cancel, pay.
- Home/task center: first page loads from `/workflow-tasks`; reach-bottom loads
  the next page; no full-history request is made.
- Legacy fallback: detail pages without `workflow_state` render existing data
  read-only and do not expose legacy-field-generated workflow action buttons.

## Manual Smoke Record

Fill this section after the mini-program smoke is executed:

| Field | Value |
| --- | --- |
| target backend environment | |
| mini-program build/version | |
| tester / confirmer | |
| smoke started at | |
| smoke completed at | |
| WeChat DevTools or real-device build link | |
| screenshot / recording / issue link | |
| result | |

Do not use planned future times. `confirmed_at` in `manual-gates.json` should
match a completed smoke time from this record.

## Manual Gate Usage

After manual smoke passes, `manual-gates.json` may use this backend-relative
path for both `api_contract.evidence` and `mini_program.evidence`:

```text
docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md
```

Do not mark `mini_program.confirmed` as `true` until the manual smoke checklist
above has been executed against the target backend and the confirmed
mini-program version is known.
