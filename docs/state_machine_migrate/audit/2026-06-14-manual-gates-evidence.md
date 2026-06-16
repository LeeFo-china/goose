# Manual Gates Evidence Template

> Copy this file to:
>
> `gooes/docs/state_machine_migrate/audit/2026-06-14-manual-gates-evidence.md`
>
> Fill every `REPLACE_*` field with completed, traceable evidence before
> creating `manual-gates.json`. Do not mark gates as confirmed until the checks
> have actually run against the target environment.

## Target

| Field | Value |
| --- | --- |
| target environment | staging |
| target Supabase project | fclnkyatvfvmzgzdqlba |
| target API base URL | http://192.168.1.5:3000 |
| evidence owner | LeeFo |
| evidence completed at | REPLACE_COMPLETED_AT_ISO8601 |

## Phase 4 Backfill And Reconciliation

Required for `phase_acceptance.phase4_backfill_confirmed`.

Existing evidence already available:

| Evidence | Path | Current conclusion |
| --- | --- | --- |
| Baseline inventory | `docs/state_machine_migrate/audit/2026-06-12-baseline.md` | Legacy object counts and migration inventory recorded. |
| Backfill implementation report | `docs/state_machine_migrate/audit/2026-06-12-backfill-report.md` | Implementation and local checks passed; staging dry-run/apply still marked pending in the report. |
| Cleanup readiness | `docs/state_machine_migrate/audit/2026-06-12-cleanup-readiness.md` | Local cleanup readiness eventually reached `ready: true` with zero blocker references. |
| Source-of-truth execution audit | `docs/state_machine_migrate/2026-06-14-workflow-source-of-truth-execution-audit.md` | Backend/admin checks passed; target DB repair still blocked by pending manual gates/migration queue. |

| Field | Value |
| --- | --- |
| staging tenant id | `3eebca47-961f-4899-b976-a3d3208d326b` |
| dry-run command | `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env.local src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --dry-run --report /Users/leefo/Public/work/gooes/docs/state_machine_migrate/audit/2026-06-16-phase4-backfill-dry-run-after-template.md` |
| dry-run result | passed: scanned 7 rows; planned `customer.dry_run_create=2`, `project.dry_run_create=3`, `expense_request.dry_run_create=1`; skipped `customer.skip.running_instance_exists=1`. |
| apply command | `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env.local src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --apply --report /Users/leefo/Public/work/gooes/docs/state_machine_migrate/audit/2026-06-16-phase4-backfill-apply.md` |
| first apply result | passed: scanned 7 rows; created `customer.create=2`, `project.create=3`, `expense_request.create=1`; skipped `customer.skip.running_instance_exists=1`. |
| second apply idempotency result | passed: scanned 7 rows; created 0 rows; skipped `customer.skip.instance_exists=2`, `customer.skip.running_instance_exists=1`, `project.skip.running_instance_exists=3`, `expense_request.skip.instance_exists=1`. |
| reconciliation command | `docs/state_machine_migrate/audit/2026-06-16-phase4-reconciliation.txt` |
| reconciliation result | passed: customer missing workflow instances returned 0 rows; project missing workflow instances returned 0 rows; expense missing workflow instances returned 0 rows; pending/approved expense missing pending tasks returned `0`. |
| output link/path | `docs/state_machine_migrate/audit/2026-06-16-phase4-backfill-dry-run-after-template.md`; `docs/state_machine_migrate/audit/2026-06-16-phase4-backfill-apply.md`; `docs/state_machine_migrate/audit/2026-06-16-phase4-backfill-idempotency.md`; `docs/state_machine_migrate/audit/2026-06-16-phase4-reconciliation.txt` |

Acceptance criteria:

- Dry-run reports the expected migration plan.
- First apply succeeds.
- Second apply creates no new runtime instances/tasks.
- Reconciliation reports no unresolved customer/project/expense mismatches.

2026-06-16 prerequisite repair: target tenant
`3eebca47-961f-4899-b976-a3d3208d326b` initially lacked active
`construction_main` and `expense_approval` definitions. The definitions were
created from the built-in workflow templates through the backend workflow
template service using employee `5d2c906f-635d-4aa0-9a64-16d7edb380c8`:

| workflow_key | definition_id | active_version_id |
| --- | --- | --- |
| `construction_main` | `8ccf9047-aa88-48ee-abe7-5a79b46845ba` | `b47bf587-3955-4d2a-afce-8bca2dd05dc4` |
| `expense_approval` | `5ef1c218-8a57-4507-9fb1-cd2ab6432e38` | `67b840e8-e98d-4221-8d68-87a3405ae01b` |

Gate status: confirmed by LeeFo on 2026-06-16. Phase 4 dry-run, apply,
idempotency apply, and reconciliation passed for the target tenant.

## Phase 5 Authenticated API Smoke

Required for `phase_acceptance.phase5_api_smoke_confirmed`.

Existing evidence already available:

| Evidence | Path | Current conclusion |
| --- | --- | --- |
| Phase 5 verification record | `docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md` | Static tests/build checks passed; authenticated admin/API/mini-program smoke still pending due missing tokens/session. |
| Mini-program manual gate evidence | `docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md` | Orange implementation summary and automated build checks recorded; manual smoke section still empty. |
| Orange workflow progress handoff | `docs/state_machine_migrate/2026-06-14-orange-workflow-progress-handoff.md` | Backend contract and required orange-side changes documented. |
| Orange rollout commit | `https://github.com/LeeFo-china/orange-taroiyf/commit/3571a88` | Orange pushed workflow progress projection integration to `main`. |

Command:

```bash
cd apps/api
GOOES_API_BASE_URL="REPLACE_API_BASE_URL" \
PHASE5_SMOKE_EMPLOYEE_TOKEN="REPLACE_EMPLOYEE_TOKEN_NOT_IN_DOC" \
PHASE5_SMOKE_CUSTOMER_TOKEN="REPLACE_CUSTOMER_TOKEN_NOT_IN_DOC" \
PHASE5_SMOKE_CUSTOMER_PROJECT_ID="REPLACE_CUSTOMER_PROJECT_ID" \
PHASE5_SMOKE_PROJECT_ID="REPLACE_PROJECT_ID" \
bun run workflow:phase5-smoke
```

Record token presence only. Do not paste tokens into this document.

| Field | Value |
| --- | --- |
| smoke actor | LeeFo |
| smoke started at | 2026-06-14T17:17:02+08:00 |
| smoke completed at | 2026-06-14T17:17:02+08:00 |
| employee token provided | yes |
| customer token provided | no |
| command result | passed: `bun src/scripts/phase5-workflow-smoke.ts` returned `{ "ok": true }`; checks passed for `workflow tasks` and `task center todos`. |
| output link/path | `docs/state_machine_migrate/audit/2026-06-14-manual-gates-evidence.md` |

Acceptance criteria:

- `/workflow-tasks` is paginated.
- `/workflow-subjects/project/:id/state` returns `workflow_state.actions`.
- Customer bootstrap/detail returns workflow data.
- Workflow task action metadata includes required `output_fields`.
- No legacy action endpoint is required by the smoke path.

Gate status: confirmed by LeeFo on 2026-06-14. The authenticated Phase 5 API
smoke script passed against the target API with an employee token. Customer
token smoke was not included in this run.

## API Contract Adoption

Required for `api_contract`.

| Contract | Evidence |
| --- | --- |
| `workflow_state.actions` used as action source | `docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md`; orange commit `3571a88` |
| `/workflow-tasks` used as task source | `docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md`; orange commit `3571a88` |
| `POST /workflow-tasks/:taskId/complete` used for mutation | `docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md`; orange commit `3571a88` |
| legacy fields not required for mutation | `docs/state_machine_migrate/2026-06-14-orange-workflow-progress-handoff.md`; orange commit `3571a88` |
| orange rollout commit | `3571a88 feat(project): 对接工作流进度投影` |
| orange pushed branch | `main` |
| orange remote commit URL | `https://github.com/LeeFo-china/orange-taroiyf/commit/3571a88` |

Suggested local evidence:

- `gooes/docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md`
- `gooes/docs/state_machine_migrate/2026-06-14-orange-workflow-progress-handoff.md`
- orange commit `3571a88`

Gate status: confirmed by LeeFo on 2026-06-14. Evidence paths above are
accepted as sufficient proof that mini-program callers use workflow
actions/tasks and do not require legacy fields for mutation.

## Mini-Program Rollout

Required for `mini_program`.

Existing evidence already available:

| Evidence | Path | Current conclusion |
| --- | --- | --- |
| Orange implementation commit | `https://github.com/LeeFo-china/orange-taroiyf/commit/3571a88` | Workflow progress projection integration pushed to `main`. |
| Orange implementation checks | `docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md` | Prior workflow integration build/type/lint evidence recorded; manual smoke still required. |
| Orange workflow progress handoff | `docs/state_machine_migrate/2026-06-14-orange-workflow-progress-handoff.md` | Details expected employee/customer/task-center behavior. |

| Field | Value |
| --- | --- |
| confirmed | yes |
| confirmed by | LeeFo |
| confirmed at | 2026-06-16T10:59:28+08:00 |
| minimum supported version | 5.0.1 |
| build type | WeChat DevTools |
| build or upload id | 本地开发构建 |
| test device / account | 微信开发者工具，员工账号 `5d2c906f-635d-4aa0-9a64-16d7edb380c8` + 客户账号 `3718dc44-0212-4f3b-b1fd-feea982af0a4` |
| issue / release / screenshot link | `docs/state_machine_migrate/audit/2026-06-14-manual-gates-evidence.md` |

Smoke checklist:

- Employee project detail displays workflow headline from `workflow_progress`.
- Payment gate displays `中期进度款`; next procedure is not highlighted active.
- Customer project detail displays the same workflow-derived progress.
- Task center project-log task opens log edit with workflow task metadata.
- Payment/project workflow task opens a page that can execute workflow action.
- No local fallback advances progress from logs, acceptances, `project.status`,
  or `construction_stages.next_stage`.

Manual smoke result: passed by LeeFo on 2026-06-16 using WeChat DevTools local
development build. Employee-side project detail, customer-side project detail,
task-center workflow action routing, payment gate display, and read-only
submitted acceptance view were accepted for rollout evidence.

Gate status: confirmed by LeeFo on 2026-06-16 for minimum mini-program version
5.0.1.

## Admin Authenticated Smoke

Required for `admin_smoke`.

Existing evidence already available:

| Evidence | Path | Current conclusion |
| --- | --- | --- |
| Source-of-truth execution audit | `docs/state_machine_migrate/2026-06-14-workflow-source-of-truth-execution-audit.md` | `pnpm --dir apps/admin check` passed and admin project progress legacy usage search passed. |
| Phase 5 verification record | `docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md` | Admin app rendered login page; authenticated admin smoke not completed. |

| Field | Value |
| --- | --- |
| confirmed | yes |
| smoke actor | 风清扬 (`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`) |
| smoke at | 2026-06-16T11:47:04+08:00 |
| admin URL | `http://127.0.0.1:3011` with `GOOES_API_BASE_URL=http://192.168.1.5:3000` |
| browser/session | Playwright Chromium authenticated through `/api/auth/login`; tenant `3eebca47-961f-4899-b976-a3d3208d326b` |
| evidence link/path | `docs/state_machine_migrate/audit/2026-06-14-manual-gates-evidence.md` |

Smoke checklist:

- Admin project detail shows workflow runtime/progress as source of truth.
- Admin does not directly complete runtime nodes outside workflow task/action
  flows.
- Admin customer/project/expense pages use workflow actions or workflow tasks
  for actionable buttons.
- Expense approval/payment paths no longer require legacy approval-chain fields.

Authenticated workflow smoke result:

```json
{
  "ok": true,
  "actor": "风清扬",
  "employee_id": "d8ecc522-e6a1-49d6-b7b7-aaa0f3084826",
  "tenant_id": "3eebca47-961f-4899-b976-a3d3208d326b",
  "project_id": "2d710a84-1045-4750-8dfd-51a0f463a4db",
  "customer_id": "3718dc44-0212-4f3b-b1fd-feea982af0a4",
  "project_workflow_instance_id": "40a113b8-3606-4d9f-9f42-f36ce26682e6",
  "customer_workflow_instance_id": "2ed66797-e0cf-4a9b-91fe-eee2133c9d12",
  "workflow_tasks_count": 10,
  "checks": [
    "admin login",
    "admin session",
    "project workflow subject state",
    "customer workflow subject state",
    "workflow tasks pagination",
    "project detail workflow panels"
  ]
}
```

Additional context: the broader `apps/admin/e2e/admin-smoke.spec.ts` run
against the same target API completed with 11 passed and 2 failed. The failures
were legacy UI text assertions for the project acceptance tab heading and
camera empty-state copy, so they were not used as the manual workflow gate.

Gate status: confirmed by LeeFo on 2026-06-16. The authenticated admin session
loaded project/customer workflow subject state through the admin backend proxy,
read paginated workflow tasks, and rendered the project detail workflow panels.

## Backup And Restore Window

Required for `backup_window`.

Existing evidence already available:

| Evidence | Path | Current conclusion |
| --- | --- | --- |
| Destructive cleanup report | `docs/state_machine_migrate/audit/2026-06-12-destructive-cleanup-report.md` | Rollback policy documented as database restore; actual backup id/window still pending. |
| Final cleanup runbook | `docs/state_machine_migrate/final-cleanup-runbook.md` | Requires explicit backup id and restore window before apply. |

| Field | Value |
| --- | --- |
| backup confirmed | yes |
| backup id | `manual-pg-dump:fclnkyatvfvmzgzdqlba:2026-06-16T11:15:28+08:00` |
| backup created at | 2026-06-16T11:15:28+08:00 |
| restore window | 2026-06-16T11:15:28+08:00 to 2026-06-16T23:59:59+08:00 |
| restore owner | LeeFo |
| evidence link/path | `docs/state_machine_migrate/audit/backups/gooes-pre-cleanup-2026-06-16T11-15-28+0800.dump` |

Backup command:

```bash
cd /Users/leefo/Public/work/gooes
/opt/homebrew/opt/libpq/bin/pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --file docs/state_machine_migrate/audit/backups/gooes-pre-cleanup-2026-06-16T11-15-28+0800.dump
```

Backup verification:

| Check | Result |
| --- | --- |
| backup file size | 1,769,071 bytes |
| `pg_restore --list` | passed |
| `pg_restore --list` entry count | 1,712 |

Acceptance criteria:

- Backup exists before destructive migration apply.
- Restore window is approved by the owner of the target environment.
- Rollback method is database restore, not recreating empty legacy tables.

Gate status: confirmed by LeeFo on 2026-06-16. Supabase scheduled backups are
not available on the Free Plan, so the backup evidence uses a manual
custom-format PostgreSQL dump of the target project's `public` schema.

## Preflight Record

Filled after `manual-gates.json` completion.

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

| Command | Result |
| --- | --- |
| `workflow:manual-gates-check` | passed on 2026-06-16T11:47:39+08:00; `manual_gate_evidence` ok. |
| `workflow:destructive-cleanup-preflight` | not applicable after cleanup already applied; rerun with `SUPABASE_DB_DIRECT_URL="$SUPABASE_DB_URL"` reached DB and reported `pending_migrations=[]`, `manual_gates` ok, `cleanup_readiness` ok, `workflow_runtime_consistency` ok, but failed pre-apply checks because destructive migrations were no longer pending and legacy objects were already absent. |
| `workflow:destructive-cleanup-verify` | passed on 2026-06-16T11:52:38+08:00; legacy tables/RPC/expense columns/indexes/policies absent and workflow runtime consistency `total_issues=0`. |
| `workflow:technical-completion-audit --technical-only --evidence-file docs/state_machine_migrate/audit/manual-gates.json` | passed on retry at 2026-06-16T11:53:04+08:00; no pending migrations, migration history aligned `235`, cleanup readiness blockers `0`, destructive cleanup verify ok, generated database types clean, manual gate evidence ok. |
