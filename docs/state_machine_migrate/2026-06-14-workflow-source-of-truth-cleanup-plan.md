# Workflow Source Of Truth Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project construction progress, payment gates, procedure stages, and mini-program display strictly follow workflow runtime, removing legacy stage/log/status inference.

**Architecture:** `workflow_instances`, `workflow_instance_nodes`, `workflow_tasks`, and `workflow_subject_states` become the only source of truth for project progress. Construction logs, stage acceptances, and payments remain business evidence used by workflow task validation and display decoration, but they must not independently decide current stage, next stage, or available actions. API responses keep compatibility fields during migration, but all such fields must be derived from workflow runtime, not guessed from logs or acceptances.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations/RPC, existing workflow runtime services, orange Taro mini-program read-only handoff.

---

## 1. Problem Statement

Project `2d710a84-1045-4750-8dfd-51a0f463a4db` exposed the current inconsistency:

| Data source | Current value |
| --- | --- |
| `workflow_subject_states.current_node_key` | `construction_start` |
| `workflow_tasks` | one pending task: `开工` |
| `workflow_instance_nodes` | `start` completed, `construction_start` running |
| `payments` | no `stage_2` record |
| `project_acceptances` | `demolition` and `plumbing_electrical` are `customer_confirmed` |
| `constructionStageStatusService` | `current_stage = tiling`, `next_stage = 瓦工` |

The workflow graph for this tenant explicitly says:

```text
construction_start
  -> procedure_demolition
  -> procedure_plumbing_electrical
  -> payment_stage_2
  -> procedure_tiling
```

Therefore, if demolition and plumbing/electrical have genuinely completed and the
middle payment has not been confirmed, the runtime should be at
`payment_stage_2 / 中期进度款`. The mini-program must not show that the project has
advanced to `tiling / 瓦工`.

Root cause:

1. `construction_stages.current_stage` is still computed from acceptance/log facts.
2. Stage acceptance and project log flows can mutate business data without guaranteeing
   the matching workflow node has advanced.
3. Orange screens still use `construction_stages.current_stage` as progress display
   state, and some fallbacks derive stage from logs or project status.
4. Historical docs already introduced workflow-only rules, but backend compatibility
   fields still preserve legacy inference behavior.

## 2. Non-Negotiable Rules

1. **Workflow runtime is the only progress source.**
   Current node, next node, current payment gate, current procedure, and available
   actions must come from workflow runtime and workflow tasks.

2. **No inferred advancement from logs, acceptances, or payments.**
   These tables are evidence:
   - logs prove a procedure task has required output;
   - acceptances prove a stage acceptance has business status;
   - payments prove a payment node can be completed.

   They do not independently move a project to the next node.

3. **No client-side reconciliation.**
   Orange must not fix backend conflicts locally by reading `next_stage`, latest log,
   accepted stages, or project status. When workflow state is missing or inconsistent,
   the UI shows a blocked/syncing state and asks the backend to refresh/fix.

4. **All database corrections are versioned.**
   Any data repair, projection rebuild, RPC change, trigger change, index, or cleanup
   must be delivered through `supabase/migrations/`.

5. **Backward compatibility fields are allowed only as runtime projections.**
   Fields such as `construction_stages.current_stage`, `next_stage`,
   `project.current_stage`, and `current_stage_label` may remain temporarily, but they
   must be derived from workflow runtime.

## 3. Target Contract

### 3.1 New Progress Object

All project detail/bootstrap endpoints that show construction progress should expose
a workflow-derived object:

```json
{
  "workflow_progress": {
    "source": "workflow_runtime",
    "instance_id": "uuid",
    "instance_status": "running",
    "current_node_key": "payment_stage_2",
    "current_node_title": "中期进度款",
    "current_node_type": "confirmation",
    "current_business_kind": "payment_collection",
    "current_stage_code": null,
    "current_gate": {
      "type": "payment_collection",
      "payment_type": "stage_2",
      "payment_label": "中期进度款",
      "blocked_stage_code": "tiling",
      "blocked_stage_label": "瓦工"
    },
    "pending_task_count": 1,
    "actions": []
  }
}
```

Rules:

| Runtime node | `workflow_progress` behavior | Stage timeline behavior |
| --- | --- | --- |
| `procedure` with `config.stage_key` | `current_stage_code = config.stage_key` | matching stage active |
| `payment_collection` | `current_gate.type = payment_collection`; `current_stage_code = null` | next procedure stage is locked by payment node |
| `construction_start` | current node is displayed as workflow step | no procedure stage is marked as active unless graph maps it explicitly |
| `final_acceptance` | current gate/node displayed as final acceptance | completion stage active only when runtime is there |
| no running instance | explicit `workflow_progress.source = missing_runtime` | UI does not infer stage |

### 3.2 Compatibility Fields

During migration:

```json
{
  "construction_stages": {
    "current_stage": null,
    "next_stage": {
      "stage_code": "tiling",
      "stage_label": "瓦工",
      "status": "locked",
      "blocked_reason": "请先完成中期进度款"
    }
  }
}
```

Compatibility rules:

- If workflow current node is a procedure, `current_stage` may equal the procedure
  `stage_key`.
- If workflow current node is a payment gate, `current_stage` must not jump to the
  next procedure stage. It should be `null` or the last runtime procedure stage, but
  orange must use `workflow_progress.current_gate` for the headline.
- `next_stage` is informational only. It must not unlock UI actions.
- `stages[].status` may show accepted/pending acceptance based on acceptance rows, but
  an accepted stage must not imply workflow advanced unless the matching runtime node
  is completed.

### 3.3 Action Source

All mutation buttons come from workflow actions:

```http
GET /workflow-subjects/project/:projectId/state
GET /workflow-tasks?page=1&pageSize=20&subject_type=project&subject_id=:projectId
POST /workflow-tasks/:taskId/complete
```

Project detail bootstraps may embed `workflow_state.actions`, but the source remains
workflow tasks. Orange must not synthesize actions from:

- `construction_stages.current_stage`
- `construction_stages.next_stage`
- latest project log stage
- `project.status`
- `project_acceptances.status`
- legacy project status action maps

## 4. Backend Implementation Plan

### Task 1: Add Runtime Consistency Diagnostic

**Files:**

- Create: `apps/api/src/scripts/project-workflow-source-of-truth-check.ts`
- Create: `apps/api/src/scripts/project-workflow-source-of-truth-check.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Implement a dry-run diagnostic script**

The script must report, without mutation:

- running workflow instance and current node;
- pending workflow tasks;
- completed workflow instance nodes;
- payment collection nodes in graph and matching confirmed payments;
- procedure nodes in graph and matching logs/acceptances;
- mismatches where accepted stages are ahead of workflow completed nodes;
- mismatches where `construction_stages.current_stage` differs from runtime.

Output shape:

```json
{
  "project_id": "2d710a84-1045-4750-8dfd-51a0f463a4db",
  "workflow_current_node_key": "construction_start",
  "construction_stages_current_stage": "tiling",
  "issues": [
    {
      "code": "ACCEPTANCE_AHEAD_OF_WORKFLOW",
      "stage_code": "plumbing_electrical",
      "message": "水电验收已确认，但 workflow 未完成对应工序节点"
    },
    {
      "code": "RUNTIME_STAGE_PROJECTION_MISMATCH",
      "message": "施工阶段 current_stage 不是 workflow runtime 投影"
    }
  ]
}
```

- [ ] **Step 2: Add tests for mismatch classification**

Use pure classification helpers so the test does not require Supabase.

Run:

```bash
bun test src/scripts/project-workflow-source-of-truth-check.test.ts
```

Expected: all classification cases pass.

- [ ] **Step 3: Add package script**

```json
{
  "workflow:project-source-check": "bun --env-file=.env src/scripts/project-workflow-source-of-truth-check.ts"
}
```

- [ ] **Step 4: Verify on the known project**

Run:

```bash
bun --env-file=.env run workflow:project-source-check --project-id 2d710a84-1045-4750-8dfd-51a0f463a4db
```

Expected before fix: reports at least `ACCEPTANCE_AHEAD_OF_WORKFLOW` and
`RUNTIME_STAGE_PROJECTION_MISMATCH`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/project-workflow-source-of-truth-check.ts \
  apps/api/src/scripts/project-workflow-source-of-truth-check.test.ts \
  apps/api/package.json
git commit -m "test(workflow): 增加项目流程源一致性检查"
```

### Task 2: Build Workflow Progress Projection Service

**Files:**

- Create: `apps/api/src/services/project-workflow-progress.ts`
- Create: `apps/api/src/services/project-workflow-progress.test.ts`
- Modify: `apps/api/src/services/workflow-subject-state.ts`
- Modify: `apps/api/src/repositories/workflow-subject-states.ts`

- [ ] **Step 1: Define workflow progress DTO**

The service should expose one method:

```ts
projectWorkflowProgressService.getProjectProgress({
  tenantId,
  projectId,
  authContext,
});
```

DTO fields:

- `source`
- `instance_id`
- `instance_status`
- `current_node_key`
- `current_node_title`
- `current_node_type`
- `current_business_kind`
- `current_stage_code`
- `current_gate`
- `pending_task_count`
- `actions`

- [ ] **Step 2: Implement graph-aware mapping**

Mapping must use:

- `workflow_subject_states`
- latest running `workflow_instances`
- current `workflow_nodes` snapshot or current graph node
- outgoing edge to identify the blocked next procedure when current node is a payment gate
- pending `workflow_tasks` for action count/action metadata

It must not inspect project logs or acceptances to decide current node.

- [ ] **Step 3: Add tests**

Required test cases:

1. Current procedure node maps `current_stage_code` to `config.stage_key`.
2. Current payment node returns `current_gate.payment_type` and locks the next procedure.
3. Missing runtime returns `source = missing_runtime`.
4. Runtime current node and stale subject projection conflict returns a warning.

Run:

```bash
bun test src/services/project-workflow-progress.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/project-workflow-progress.ts \
  apps/api/src/services/project-workflow-progress.test.ts \
  apps/api/src/services/workflow-subject-state.ts \
  apps/api/src/repositories/workflow-subject-states.ts
git commit -m "feat(workflow): 增加项目流程进度投影"
```

### Task 3: Change Construction Stage Service To Runtime Projection

**Files:**

- Modify: `apps/api/src/services/construction-stage-status/legacy/lists.ts`
- Modify: `apps/api/src/services/construction-stage-status/legacy/stage-item.ts`
- Test: `apps/api/src/services/construction-stage-status/legacy/lists.test.ts`

- [ ] **Step 1: Write failing tests for payment gate behavior**

Test data:

- workflow current node is `payment_stage_2`;
- next procedure node is `procedure_tiling`;
- demolition and plumbing/electrical acceptances are confirmed;
- no confirmed `stage_2` payment.

Expected:

- `workflow_progress.current_node_key = payment_stage_2`;
- `construction_stages.current_stage` is not `tiling`;
- tiling stage status is `locked`;
- tiling `blocked_reason` mentions `中期进度款`.

- [ ] **Step 2: Write failing tests for procedure node behavior**

Expected:

- if runtime current node is `procedure_plumbing_electrical`, only water/electrical
  is active, even if there is a later log row.

- [ ] **Step 3: Refactor builder input**

`buildProjectConstructionStagesFromRows` should accept optional workflow progress:

```ts
workflowProgress?: ProjectWorkflowProgress | null;
```

If provided, it controls:

- `current_stage`
- stage lock/unlock state
- `blocked_reason`
- `can_create_log`
- `can_create_acceptance`

Acceptance/log rows only decorate:

- `acceptance_status`
- latest log summary
- accepted visual state for already completed runtime stages

- [ ] **Step 4: Keep legacy mode behind explicit flag only**

If a caller intentionally wants old derived behavior for diagnostics, it must pass:

```ts
sourceMode: "legacy_derived"
```

Production bootstrap and `/construction-stages` endpoints must use:

```ts
sourceMode: "workflow_runtime"
```

- [ ] **Step 5: Verify**

Run:

```bash
bun test src/services/construction-stage-status/legacy/lists.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/construction-stage-status/legacy/lists.ts \
  apps/api/src/services/construction-stage-status/legacy/stage-item.ts \
  apps/api/src/services/construction-stage-status/legacy/lists.test.ts
git commit -m "fix(workflow): 施工阶段按流程运行态投影"
```

### Task 4: Add Workflow Progress To Project Bootstraps

**Files:**

- Modify: `apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts`
- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/orchestration.ts`
- Modify: `apps/api/src/services/projects/legacy/detail-bootstrap.ts`
- Modify: shared response serializers/types near each existing bootstrap implementation

- [ ] **Step 1: Add `workflow_progress` to employee bootstrap**

`GET /projects/:id/employee-detail-bootstrap` should return:

```json
{
  "workflow_state": {},
  "workflow_progress": {},
  "construction_stages": {}
}
```

`workflow_state.actions` remains the action source. `workflow_progress` is the
read-only display source.

- [ ] **Step 2: Add `workflow_progress` to customer bootstrap**

`GET /customer/projects/:id/detail-bootstrap` should expose the safe read-only subset:

```json
{
  "workflow_progress": {
    "source": "workflow_runtime",
    "current_node_key": "payment_stage_2",
    "current_node_title": "中期进度款",
    "current_business_kind": "payment_collection",
    "current_gate": {
      "type": "payment_collection",
      "payment_type": "stage_2",
      "payment_label": "中期进度款"
    }
  }
}
```

Do not expose employee-only assignee data to customer endpoints.

- [ ] **Step 3: Add partial error behavior**

If workflow progress fails:

- do not infer from construction stages;
- add `partial_errors[]` module `workflow_progress`;
- set `workflow_progress.source = unavailable`.

- [ ] **Step 4: Verify known project response**

Expected after backend fixes and data repair:

- customer and employee bootstrap show `workflow_progress.current_node_key =
  payment_stage_2`;
- `construction_stages.current_stage` does not show `tiling` as active while
  payment is pending.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts \
  apps/api/src/services/employee-project-detail-bootstrap/legacy/orchestration.ts \
  apps/api/src/services/projects/legacy/detail-bootstrap.ts
git commit -m "feat(project): 项目详情返回流程进度投影"
```

### Task 5: Gate Legacy Mutations Behind Workflow

**Files:**

- Modify: `apps/api/src/services/project-acceptances/legacy-service.ts`
- Modify: `apps/api/src/services/project-acceptances/legacy/*.ts`
- Modify: `apps/api/src/services/project-logs/legacy-service.ts` or current project log create path
- Modify: `apps/api/src/services/workflow-runtime-guards.ts`

- [ ] **Step 1: Audit mutation paths**

List every endpoint that can create or progress construction facts:

- project log create;
- stage acceptance create;
- acceptance review;
- customer acceptance confirm;
- payment create/confirm;
- direct project status transition.

- [ ] **Step 2: Add workflow context validation**

Mutation rules:

| Mutation | Required workflow condition |
| --- | --- |
| create construction log for workflow procedure | matching pending workflow task or current procedure node |
| create stage acceptance | matching procedure node completed or explicit workflow acceptance action |
| customer confirm stage acceptance | acceptance must belong to current/previous workflow-approved stage |
| complete payment node | confirmed matching payment exists |
| create log without workflow task | allowed only as ordinary log; must not advance progress |

- [ ] **Step 3: Return explicit errors**

Use `Errors.business` with stable codes:

- `WORKFLOW_STAGE_NOT_CURRENT`
- `WORKFLOW_ACCEPTANCE_NOT_AVAILABLE`
- `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`
- `WORKFLOW_PROGRESS_CONFLICT`

- [ ] **Step 4: Add regression tests**

At minimum:

1. Directly confirming water/electrical acceptance does not make tiling current.
2. Creating acceptance ahead of workflow returns 409.
3. Payment node cannot complete without confirmed `stage_2`.
4. Ordinary logs do not affect workflow progress.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/project-acceptances apps/api/src/services/project-logs \
  apps/api/src/services/workflow-runtime-guards.ts
git commit -m "fix(workflow): 阻止施工事实绕过流程推进"
```

### Task 6: Repair Historical Runtime Data

**Files:**

- Create: `supabase/migrations/YYYYMMDDHHMMSS_repair_project_workflow_runtime_source.sql`
- Modify or create: `apps/api/src/scripts/workflow-runtime-consistency-check.ts`
- Create: `docs/state_machine_migrate/YYYY-MM-DD-workflow-runtime-repair-report.md`

- [ ] **Step 1: Generate dry-run report**

Run the diagnostic from Task 1 across active construction projects:

```bash
bun --env-file=.env run workflow:project-source-check --all-active-construction
```

Report buckets:

- runtime behind accepted stages;
- runtime ahead of business evidence;
- payment gate skipped without payment;
- missing runtime instance;
- stale `workflow_subject_states`.

- [ ] **Step 2: Decide repair strategy per bucket**

For project `2d710a84-1045-4750-8dfd-51a0f463a4db`, if business confirms demolition
and water/electrical are accepted and no `stage_2` payment exists, repair target is:

```text
current_node_key = payment_stage_2
pending task = 中期进度款
procedure_tiling locked until payment complete
```

- [ ] **Step 3: Write migration**

The migration must:

- insert or update `workflow_instance_nodes` for explicitly completed nodes only;
- update `workflow_instances.current_node_key/current_node_snapshot/current_node_id`;
- cancel stale pending tasks;
- create the correct pending task for the current node;
- upsert `workflow_subject_states`;
- include comments with project IDs and reason.

No ad hoc remote SQL.

- [ ] **Step 4: Verify migration status**

Run:

```bash
supabase migration list
bun --env-file=.env run workflow:project-source-check --project-id 2d710a84-1045-4750-8dfd-51a0f463a4db
```

Expected:

- Local/Remote migrations align after apply.
- Known project reports no source-of-truth mismatch.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_repair_project_workflow_runtime_source.sql \
  docs/state_machine_migrate/*workflow-runtime-repair-report.md \
  apps/api/src/scripts/workflow-runtime-consistency-check.ts
git commit -m "fix(workflow): 修复历史项目流程运行态"
```

## 5. Orange Mini-Program Handoff Plan

Writable repository remains `gooes`. Orange repository
`/Users/leefo/Public/work/orange` is read-only for this plan.

### Task 7: Orange Contract Update

**Orange files to change by mini-program team:**

| File | Required change |
| --- | --- |
| `src/services/projects/types/customer.ts` | Add `workflow_progress` response type |
| `src/services/projects/types/status.ts` | Add shared `WorkflowProgress` type |
| `src/packageCustomerPortal/pages/customer-project-detail/hooks/useCustomerProjectDetailData.ts` | Store `payload.workflow_progress`; do not derive progress from logs |
| `src/packageCustomerPortal/pages/customer-project-detail/model.ts` | Remove fallback that derives current stage from latest logs/project status for progress display |
| `src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts` | Store and prefer `workflow_progress` for progress headline |
| `src/packageProjects/pages/detail/hooks/useProjectStatusViewModel.ts` | Project action and headline must prefer `workflow_state.actions` and `workflow_progress` |
| `src/packageProjects/pages/detail/sections/ConstructionStagePanel.tsx` | If `workflow_progress.current_gate` exists, display gate/blocked state instead of marking next procedure active |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` | Keep workflow actions as the only mutation source |
| `src/packageProjects/pages/detail/hooks/useProjectNavigationActions.ts` | Use workflow task metadata when navigating to log/payment flows |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` | Continue completing workflow task after log create; no fallback complete-less progression |
| `src/packageTasks/pages/index/index.tsx` | Payment/procedure tasks must open a page that can execute the workflow action |

Mini-program forbidden fallbacks:

- do not use latest `project_logs.stage_code` to set current progress;
- do not use `next_stage` as current stage;
- do not create acceptance from local stage position when `acceptance_action` is not enabled;
- do not show payment-gated next procedure as active;
- do not synthesize workflow task IDs.

### Task 8: Orange Display Rules

Employee and customer detail pages should display:

| Backend state | Display |
| --- | --- |
| `workflow_progress.current_gate.type = payment_collection` | headline: `中期进度款`; next procedure shown locked |
| `workflow_progress.current_node_type = procedure` | active procedure stage from `current_stage_code` |
| `workflow_progress.source = missing_runtime` | show `流程同步中` / disable mutation buttons |
| `workflow_progress.source = unavailable` | show retry; do not infer from construction stages |

### Task 9: Orange Smoke Checklist

Mini-program team should verify:

1. Known project shows `中期进度款`, not `瓦工`, after backend data repair.
2. If no `stage_2 + confirmed` payment exists, completing payment task returns
   `WORKFLOW_PAYMENT_COLLECTION_BLOCKED` and UI remains at payment gate.
3. After confirmed `stage_2` payment exists and task complete succeeds, detail refresh
   shows `瓦工`.
4. Creating a log without workflow task does not move current progress.
5. Refresh after every `POST /workflow-tasks/:taskId/complete`; no local optimistic node advance.
6. Customer portal and employee project detail show the same workflow-derived progress,
   with customer-safe fields only.

## 6. Admin Impact

Admin should not derive project progress from `project.status` or accepted stages either.

Admin follow-up areas:

- project detail progress labels;
- workflow runtime/timeline detail page;
- payment gate review visibility;
- diagnostics page or script output for source-of-truth conflicts.

Admin acceptance:

- For a project at `payment_stage_2`, admin sees payment gate as current workflow node.
- Admin can inspect accepted stages as evidence but not as the current progress source.

## 7. API Acceptance Matrix

| Scenario | Expected backend response |
| --- | --- |
| Runtime at `construction_start` | progress says `开工`; construction stages do not jump to demolition from logs |
| Runtime at `procedure_plumbing_electrical` | active stage is 水电 |
| Runtime at `payment_stage_2`, no confirmed payment | progress says 中期进度款; tiling locked |
| Runtime at `payment_stage_2`, confirmed payment exists | workflow complete can advance to tiling |
| Demolition/water acceptance confirmed but runtime still at start | diagnostic reports mismatch; UI follows runtime |
| `construction_stages` module fails | UI receives partial error; no local inference |
| `workflow_progress` fails | UI disables mutation/progress advance; no local inference |

## 8. Verification Commands

Backend:

```bash
bun test src/services/project-workflow-progress.test.ts
bun test src/services/construction-stage-status/legacy/lists.test.ts
bun test src/scripts/project-workflow-source-of-truth-check.test.ts
bun run typecheck
bun run check
```

Known project smoke:

```bash
bun --env-file=.env run workflow:project-source-check --project-id 2d710a84-1045-4750-8dfd-51a0f463a4db
```

Migration verification, if data repair is included:

```bash
supabase migration list
```

Orange smoke, run by mini-program team:

```text
customer detail -> workflow_progress = 中期进度款
employee project detail -> workflow_progress = 中期进度款
task center -> 中期进度款 workflow task visible and actionable
payment blocked -> backend 409 message displayed
payment confirmed -> complete task -> refresh -> 瓦工 visible
```

## 9. Rollout Plan

1. Ship diagnostics first; no behavior change.
2. Ship backend `workflow_progress` while keeping legacy fields.
3. Change `construction_stages` production mode to workflow runtime projection.
4. Repair historical data through migrations after dry-run report review.
5. Orange switches display headline/actions to `workflow_progress` and `workflow_state`.
6. Remove or ignore legacy local fallbacks in orange.
7. After one release cycle, deprecate legacy-derived fields:
   - `project.current_stage`
   - `project.current_stage_label`
   - any `current_stage` value not backed by workflow runtime

## 10. Open Decisions

1. During a payment gate, should compatibility `construction_stages.current_stage`
   be `null` or the previous completed procedure stage? Recommendation: `null`, with
   `workflow_progress.current_gate` as the display source.
2. Should stage acceptance confirmation auto-complete a workflow node, or must workflow
   node completion happen before acceptance creation? Recommendation: keep workflow task
   completion as the only node transition; acceptance is post-node evidence/action.
3. Should customer portal show workflow task labels directly? Recommendation: yes for
   read-only progress labels, no for employee-only action metadata.

## 11. References

- `docs/state_machine_migrate/orange-construction-current-stage-handoff.md`
- `docs/state_machine_migrate/miniprogram-payment-collection-node-integration.md`
- `docs/state_machine_migrate/miniprogram-procedure-construction-log-integration.md`
- `orange/docs/2026-06-13-project-construction-current-stage-backend-check.md`
- `apps/api/src/services/construction-stage-status/legacy/lists.ts`
- `apps/api/src/services/project-workflow-runtime.ts`
- `apps/api/src/services/workflow-runtime-guards.ts`
- `apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts`
- `orange/src/packageCustomerPortal/pages/customer-project-detail/model.ts`
- `orange/src/packageProjects/pages/detail/sections/ConstructionStagePanel.tsx`
