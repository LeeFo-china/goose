# Workflow Final Cleanup Team Notice

## Summary

The workflow source-of-truth migration has completed in `gooes`.

- Repository: `gooes`
- Branch: `main`
- Remote: `origin/main`
- Latest commit: `eeb6866 refactor(workflow)!: 删除旧状态机数据库对象`
- Final audit: passed with `ok: true`, `mode: "final"`
- Evidence report:
  `docs/state_machine_migrate/audit/2026-06-16-final-cleanup-completion.md`

## What Changed

The old state-machine database objects have been removed from the target
Supabase project `fclnkyatvfvmzgzdqlba`.

Removed legacy objects verified by automation:

- `customer_status_transition_logs`
- `project_status_transition_logs`
- `expense_request_approval_chains`
- `schedule_project_construction_transition(...)`
- `expense_requests.current_step`
- `expense_requests.current_step_role`
- legacy indexes and policies tied to those objects

Workflow runtime remains consistent:

- `workflow_runtime_consistency`: `total_issues=0`
- migration history: aligned, no pending migrations
- generated database types: legacy generated types absent

## Current Source Of Truth

Workflow runtime is now the source of truth for actionable process state:

- current state: `workflow_instances`, `workflow_subject_states`
- current tasks/actions: `workflow_tasks`
- timeline/history: `workflow_instance_nodes`, `workflow_transition_logs`
- execution: `POST /workflow-tasks/:taskId/complete`

Business tables may still keep business fields such as `status`, but those
fields must not be used as the driver for workflow actions or current node
progress.

## Required Client Behavior

Admin and mini-program clients should continue to use:

- `GET /workflow-tasks?page=1&pageSize=20`
- `GET /workflow-subjects/:subjectType/:subjectId/state`
- `GET /workflow-subjects/:subjectType/:subjectId/timeline?page=1&pageSize=20`
- `POST /workflow-tasks/:taskId/complete`
- project/customer detail bootstrap workflow fields

Do not call removed legacy endpoints or rely on removed legacy tables/RPC.

## Smoke Focus

Recommended post-cleanup smoke:

- API: `/workflow-tasks`, `/workflow-subjects/project/:id/state`, task center
  todos, project/customer detail bootstrap.
- Admin: customer list, project list/detail, expenses, roles/permissions,
  workflow tasks.
- Mini-program: customer project detail, employee project detail, procedure
  acceptance, payment collection node.

## Evidence

- Final cleanup report:
  `docs/state_machine_migrate/audit/2026-06-16-final-cleanup-completion.md`
- Manual gates:
  `docs/state_machine_migrate/audit/manual-gates.json`
- Manual gate evidence:
  `docs/state_machine_migrate/audit/2026-06-14-manual-gates-evidence.md`
