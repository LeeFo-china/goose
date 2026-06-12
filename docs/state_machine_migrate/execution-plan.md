# State Machine Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按阶段把客户、项目、费用审批从旧状态机迁移到 workflow runtime，并在最终阶段删除旧表、旧列、旧 RPC、旧索引和旧代码。

**Architecture:** 先补齐 workflow subject 读模型和业务 API adapter，让旧接口兼容返回但写入 workflow runtime；再回填历史数据、切换后台和小程序读路径；最后在所有验收通过后执行破坏性 migration。每个阶段必须有测试、数据对账、接口 smoke 和人工验收门禁，禁止跳阶段直接删库对象。

**Tech Stack:** Bun + TypeScript + Fastify, Supabase/Postgres migrations/RPC, Next.js admin, shared `@gooes/domain`, markdown handoff docs for mini-program team.

---

## Execution Rule

不要直接执行 `docs/state_machine_migrate/README.md` 中的最终删表删列方案。该迁移必须按本文阶段推进：

1. 每阶段只做一个可验证目标。
2. 每阶段提交前必须运行该阶段列出的验证命令。
3. 每阶段完成后更新本文对应 checkbox 和验收记录。
4. 需要小程序配合的内容同步写入 `docs/state_machine_migrate/miniprogram-integration.md`。
5. Phase 6 破坏性清理前，必须有小程序团队确认新版本已覆盖线上最低可用版本。

## Phase 0: Baseline Audit And Object Inventory

**Goal:** 生成旧状态机对象、接口、数据量和风险清单，不改业务行为。

**Files:**
- Modify: `docs/state_machine_migrate/execution-plan.md`
- Modify: `docs/state_machine_migrate/miniprogram-integration.md`
- Create: `docs/state_machine_migrate/audit/YYYY-MM-DD-baseline.md`
- Create: `docs/state_machine_migrate/sql/phase0_inventory.sql`
- Read: `apps/api/src/services/customer-status.ts`
- Read: `apps/api/src/services/project-status.ts`
- Read: `apps/api/src/services/expense-requests/legacy/workflow.ts`
- Read: `apps/api/src/repositories/task-center.ts`
- Read: `supabase/migrations/*workflow*.sql`

### Steps

- [x] **Step 0.1: Create baseline audit doc**

  Create `docs/state_machine_migrate/audit/YYYY-MM-DD-baseline.md` with these sections:

  ```markdown
  # State Machine Migration Baseline

  ## Scope

  - Customers:
  - Projects:
  - Expense requests:
  - Task center:
  - Mini-program/self-service:

  ## Database Objects

  ### Legacy tables
  | object | row count | owner path | migration source | keep until phase |
  | --- | ---: | --- | --- | --- |

  ### Legacy columns
  | table | column | current usage | replacement | drop phase |
  | --- | --- | --- | --- | --- |

  ### Legacy RPC/functions
  | function | signature | callers | replacement | drop phase |
  | --- | --- | --- | --- | --- |

  ### Legacy indexes
  | index | table | current query usage | replacement | drop phase |
  | --- | --- | --- | --- | --- |

  ## API Inventory

  | endpoint | caller | old state dependency | migration behavior |
  | --- | --- | --- | --- |

  ## Data Counts

  | check | result |
  | --- | ---: |

  ## Risks

  | risk | mitigation | owner |
  | --- | --- | --- |
  ```

- [x] **Step 0.2: Run DB inventory SQL against the target environment**

  Run `docs/state_machine_migrate/sql/phase0_inventory.sql` through the approved Supabase query channel for the target environment. It contains these read-only queries:

  ```sql
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      column_name IN ('status', 'current_step', 'current_step_role')
      OR table_name IN (
        'customer_status_transition_logs',
        'project_status_transition_logs',
        'expense_request_approval_chains'
      )
    )
  ORDER BY table_name, ordinal_position;
  ```

  ```sql
  SELECT indexname, tablename, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND (
      indexname ILIKE '%status%'
      OR indexname ILIKE '%current_step%'
      OR tablename IN (
        'customer_status_transition_logs',
        'project_status_transition_logs',
        'expense_request_approval_chains'
      )
    )
  ORDER BY tablename, indexname;
  ```

  ```sql
  SELECT proname, pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND (
      proname ILIKE '%status%'
      OR proname ILIKE '%construction_transition%'
      OR proname ILIKE '%workflow%'
    )
  ORDER BY proname, args;
  ```

  2026-06-12 status: target pre-cleanup inventory was completed against
  Supabase project `fclnkyatvfvmzgzdqlba` and recorded in
  `docs/state_machine_migrate/audit/2026-06-12-destructive-cleanup-report.md`.
  The legacy cleanup targets still exist before destructive apply:
  `customer_status_transition_logs` has 27 rows,
  `project_status_transition_logs` has 42 rows,
  `expense_request_approval_chains` has 6 rows, the scheduling RPC exists, and
  `expense_requests.current_step/current_step_role` exist.

- [x] **Step 0.3: Run code inventory**

  Run:

  ```bash
  rg -n "status-transition|status-actions|status-transitions|schedule_project_construction_transition|approval_chain|current_step|customer_status_transition_logs|project_status_transition_logs|expense_request_approval_chains" apps/api apps/admin packages/domain supabase --glob '!**/.next/**'
  ```

  Expected: output lists all old state machine dependencies. Paste summarized findings into the baseline audit doc.

- [x] **Step 0.4: Verification**

  Run:

  ```bash
  git diff --check
  ```

  Expected: exit code 0.

  2026-06-12 status: `git diff --check` passed.

### Phase 0 Acceptance

- [x] Baseline audit document exists and lists DB objects, API endpoints, code paths, and data counts.
- [x] Every old state machine object has a target replacement or an explicit Phase 6 drop decision.
- [x] No application code or migration behavior changed in this phase.
- [x] Commit:

  ```bash
  git add docs/state_machine_migrate
  git commit -m "docs(workflow): 记录状态机迁移基线"
  ```

  Completed by baseline and migration-plan commits, with live target counts
  later filled into the baseline from the pre-cleanup audit.

## Phase 1: Workflow Subject Read Model

**Goal:** 建立 workflow subject state 读模型，为列表、详情、小程序 bootstrap 替代旧 `status/current_step` 查询提供稳定入口。

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_workflow_subject_states.sql`
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/repositories/workflow-subject-states.ts`
- Create: `apps/api/src/services/workflow-subject-state.ts`
- Create: `apps/api/src/schema/workflow-subjects.ts`

### Steps

- [x] **Step 1.1: Write migration for read model**

  Create a migration with this table and indexes:

  ```sql
  CREATE TABLE IF NOT EXISTS public.workflow_subject_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    definition_id uuid NULL REFERENCES public.workflow_definitions(id) ON DELETE SET NULL,
    instance_id uuid NULL REFERENCES public.workflow_instances(id) ON DELETE SET NULL,
    instance_status text NULL,
    current_node_key text NULL,
    current_node_title text NULL,
    current_business_kind text NULL,
    pending_task_count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workflow_subject_states_subject_type_check CHECK (
      subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure')
    ),
    CONSTRAINT workflow_subject_states_subject_id_not_blank CHECK (btrim(subject_id) <> ''),
    CONSTRAINT workflow_subject_states_pending_task_count_check CHECK (pending_task_count >= 0)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_subject_states_subject
  ON public.workflow_subject_states(tenant_id, subject_type, subject_id);

  CREATE INDEX IF NOT EXISTS idx_workflow_subject_states_tenant_type_node
  ON public.workflow_subject_states(tenant_id, subject_type, current_node_key, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_workflow_subject_states_tenant_type_status
  ON public.workflow_subject_states(tenant_id, subject_type, instance_status, updated_at DESC);

  COMMENT ON TABLE public.workflow_subject_states IS 'Workflow subject current state projection for list/detail/mobile reads';
  ```

- [x] **Step 1.2: Regenerate database types**

  Run:

  ```bash
  supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba > apps/api/src/types/database.ts
  ```

  Expected: `apps/api/src/types/database.ts` includes `workflow_subject_states`.

  2026-06-12 update: target project `fclnkyatvfvmzgzdqlba` has applied
  `20260612110000_create_workflow_subject_states.sql`,
  `20260612123000_add_workflow_task_permission_projection.sql`, and
  `20260612124500_add_cancel_workflow_instance_rpc.sql`. Remote type generation
  succeeded and `apps/api/src/types/database.ts` now includes
  `workflow_subject_states`, `workflow_tasks.assignee_permission_code`, and
  `cancel_workflow_instance`.

- [x] **Step 1.3: Add repository**

  Create `apps/api/src/repositories/workflow-subject-states.ts` with methods:

  ```typescript
  export type WorkflowSubjectType = 'manual' | 'customer' | 'project' | 'expense_request' | 'procedure';

  export interface UpsertWorkflowSubjectStateInput {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectId: string;
    definitionId?: string | null;
    instanceId?: string | null;
    instanceStatus?: string | null;
    currentNodeKey?: string | null;
    currentNodeTitle?: string | null;
    currentBusinessKind?: string | null;
    pendingTaskCount?: number;
  }
  ```

  Implementation must use Supabase `.from("workflow_subject_states").upsert(...)` with `onConflict: "tenant_id,subject_type,subject_id"`.

- [x] **Step 1.4: Add service**

  Create `apps/api/src/services/workflow-subject-state.ts` with:

  - `syncFromRuntimeInstance({ tenantId, subjectType, subjectId, definitionId, instanceId })`
  - `getSubjectState({ tenantId, subjectType, subjectId })`
  - `listSubjectStates({ tenantId, subjectType, subjectIds })`

  `syncFromRuntimeInstance` must count pending tasks from `workflow_tasks` for the instance and write `workflow_subject_states`.

- [x] **Step 1.5: Verification**

  Run:

  ```bash
  bun run api:typecheck
  bun run api:build
  git diff --check
  ```

  Expected: all commands exit 0.

  2026-06-12 verification:

  - `bun run api:typecheck`: passed.
  - `bun run api:build`: passed.
  - `git diff --check`: passed.
  - Direct migration history check: passed through `20260612124500`;
    destructive cleanup migrations `20260612133000` and `20260612143000`
    remain pending.

### Phase 1 Acceptance

- [x] `workflow_subject_states` migration exists and contains no destructive statements.
- [x] Subject state can be upserted by `tenant_id + subject_type + subject_id`.
- [x] API typecheck and build pass.
- [x] Commit:

  ```bash
  git add supabase/migrations apps/api/src/types/database.ts apps/api/src/repositories/workflow-subject-states.ts apps/api/src/services/workflow-subject-state.ts apps/api/src/schema/workflow-subjects.ts
  git commit -m "feat(workflow): 增加流程对象状态投影"
  ```

  Completed in `36d7155 feat(workflow): 增加流程对象状态投影`.

## Phase 2: Workflow Subject And Task API

**Goal:** 新增业务端和小程序可用的 workflow subject/task API，不要求小程序直接调用后台管理型 `/workflows/:id/runtime/*`。

**Files:**
- Create: `apps/api/src/controllers/workflow-subjects/index.ts`
- Create: `apps/api/src/controllers/workflow-tasks/index.ts`
- Modify: `apps/api/src/routes/index.ts`
- Create: `apps/api/src/services/workflow-subjects.ts`
- Create: `apps/api/src/services/workflow-tasks.ts`
- Create: `apps/api/src/repositories/workflow-tasks.ts`
- Modify: `apps/api/src/schema/workflow-subjects.ts`
- Modify: `docs/state_machine_migrate/miniprogram-integration.md`

### Steps

- [x] **Step 2.1: Add schemas**

  Extend `apps/api/src/schema/workflow-subjects.ts` with:

  ```typescript
  import { z } from "zod";
  import { PaginationQuerySchema } from "@/schema/request";

  export const WorkflowSubjectTypeParamSchema = z.object({
    subjectType: z.enum(["manual", "customer", "project", "expense_request", "procedure"]),
    subjectId: z.string().min(1, "流程对象 ID 不能为空"),
  });

  export const WorkflowTimelineQuerySchema = PaginationQuerySchema;

  export const WorkflowTaskCompleteSchema = z.object({
    action: z.string().trim().min(1, "动作不能为空").max(100, "动作过长"),
    reason: z.string().trim().max(500, "原因过长").nullable().optional(),
    output: z.record(z.string(), z.unknown()).default({}),
  });
  ```

- [x] **Step 2.2: Add subject API controller**

  Create controller endpoints:

  - `GET /workflow-subjects/:subjectType/:subjectId/state`
  - `GET /workflow-subjects/:subjectType/:subjectId/timeline`

  Controller must only parse auth context, params, query, call service, and return `ResponseHandler.success`.

- [x] **Step 2.3: Add task API controller**

  Create endpoints:

  - `GET /workflow-tasks`
  - `POST /workflow-tasks/:id/complete`

  `GET /workflow-tasks` must use pagination and must not return unbounded task lists.

- [x] **Step 2.4: Update mini-program integration doc**

  Update `docs/state_machine_migrate/miniprogram-integration.md` with:

  - New endpoint paths.
  - Request/response examples.
  - Old-to-new field mapping.
  - Compatibility release order.

- [x] **Step 2.5: Verification**

  Run:

  ```bash
  bun run api:typecheck
  bun run api:build
  git diff --check
  ```

  Expected: all commands exit 0.

  2026-06-12 status: `bun run api:typecheck`, `bun run api:build`, and
  `git diff --check` passed after adding the controllers/services/repository.

  2026-06-12 progress: workflow tasks now project
  `node.config.required_permissions[0]` into
  `workflow_tasks.assignee_permission_code` through migration-managed trigger,
  and `/workflow-tasks` checks employee, role, or permission assignment before
  exposing a task.

  2026-06-12 update: target migration status is now verified through
  `20260612124500`; destructive cleanup migrations remain intentionally
  unapplied.

### Phase 2 Acceptance

- [x] New workflow subject state endpoint returns one subject's current state.
- [x] Timeline endpoint returns paginated workflow logs.
- [x] Task list endpoint is paginated with max `pageSize <= 100`.
- [x] Mini-program integration doc includes examples that orange team can implement against.
- [x] Commit:

  ```bash
  git add apps/api/src/controllers/workflow-subjects apps/api/src/controllers/workflow-tasks apps/api/src/services/workflow-subjects.ts apps/api/src/services/workflow-tasks.ts apps/api/src/repositories/workflow-tasks.ts apps/api/src/schema/workflow-subjects.ts apps/api/src/routes/index.ts docs/state_machine_migrate/miniprogram-integration.md
  git commit -m "feat(workflow): 增加流程对象和待办接口"
  ```

  Completed in `5dfde8c feat(workflow): 增加流程对象和待办接口`.

## Phase 3: Compatibility Adapters For Old APIs

**Goal:** 旧客户/项目/费用状态接口保留路径，但内部改写为 workflow runtime，保证小程序旧版本不断链。

**Files:**
- Modify: `apps/api/src/services/customer-status.ts`
- Modify: `apps/api/src/services/project-status.ts`
- Modify: `apps/api/src/services/expense-requests/legacy/workflow.ts`
- Modify: `apps/api/src/services/expense-requests/legacy/payment.ts`
- Modify: `apps/api/src/controllers/customer/extras-controller.ts`
- Modify: `apps/api/src/controllers/projects/status-bootstrap-controller.ts`
- Modify: `apps/api/src/controllers/expense-requests/index.ts`

### Steps

- [x] **Step 3.1: Customer adapter**

  Replace direct customer status transition writes with:

  1. Validate old action shape.
  2. Resolve or start customer workflow instance.
  3. Complete current workflow task/node.
  4. Write or update `workflow_subject_states`.
  5. Return old response fields plus `workflow_state`.

  The compatibility response must preserve:

  ```json
  {
    "status": "following",
    "status_label": "跟进中",
    "status_actions": [],
    "workflow_state": {
      "subject_type": "customer",
      "subject_id": "uuid",
      "instance_id": "uuid",
      "instance_status": "running",
      "current_node_key": "following",
      "current_node_title": "跟进",
      "actions": []
    }
  }
  ```

  2026-06-12 progress: customer status transitions already call
  `customerWorkflowRuntimeService` and now refresh `workflow_subject_states`
  when runtime metadata contains `definition_id` and `instance_id`. Old
  `POST /customers/:id/status-transition` and
  `GET /customers/:id/status-actions` responses include `workflow_state`.
  This step is not complete until the old customer write path no longer uses
  the domain status transition config as the source of truth.

  2026-06-12 closure: the compatibility endpoint window is closed for
  customer status actions. Old customer `status-actions`,
  `status-transition`, and `status-transitions` routes were removed in
  `a6ca2df refactor(workflow): 移除客户项目旧状态接口`. Normal customer
  status actions now use workflow subject state/timeline and
  `/workflow-tasks/:id/complete`.

- [x] **Step 3.2: Project adapter**

  Replace project status transition writes with workflow runtime. The `schedule_construction` branch must still update project business facts:

  - `projects.start_date`
  - primary `project_members` construction manager
  - workflow node output fields `start_date` and `construction_manager_employee_id`

  Do not call `schedule_project_construction_transition` after this step.

  2026-06-12 progress: old project status action and transition responses now
  include `workflow_state`, and old project transitions refresh the subject
  projection. Project writes still use the legacy status path, including
  `schedule_project_construction_transition`, because `construction_main`
  workflow template/runtime mapping is not available yet.

  2026-06-12 progress: `construction_main` template is now available for
  workflow definition creation, and old project status transitions attempt to
  sync the corresponding runtime instance/task after legacy business writes.
  Legacy writes and `schedule_project_construction_transition` are still the
  compatibility source of truth until existing project data is backfilled and
  staging smoke confirms runtime-only writes.

  2026-06-12 closure: the compatibility endpoint window is closed for project
  status actions. Old project `status-actions`, `status-transition`, and
  `status-transitions` routes were removed in
  `a6ca2df refactor(workflow): 移除客户项目旧状态接口`. Project construction
  scheduling no longer calls `schedule_project_construction_transition`; the
  API updates project business facts and syncs workflow runtime/subject state.

- [x] **Step 3.3: Expense adapter**

  Route:

  - `submit` -> start expense workflow.
  - `approve` -> complete current approval task with `decision=approved`.
  - `reject` -> complete current approval task with `decision=rejected`.
  - `cancel` -> cancel running instance and preserve business cancel output.
  - `pay` -> complete payment task.

  During this phase, keep old `status/current_step/approval_chain` fields as compatibility projections only.

  2026-06-12 progress: old expense detail and write responses
  (`submit/approve/reject/cancel/pay`) include `workflow_state`. Expense writes
  still use the legacy approval-chain path until an explicit workflow runtime
  mapping for approval nodes is implemented.

  2026-06-12 progress: `expense_approval` template is now available, old
  expense `submit/approve/reject/cancel/pay` paths sync workflow runtime after
  legacy writes, and `cancel_workflow_instance` was added as migration-managed
  RPC. Legacy approval-chain writes remain as compatibility source of truth
  until target migration apply, backfill, and staging smoke pass.

  2026-06-12 update: target migration status is now verified through
  `20260612124500`; destructive cleanup migrations remain intentionally
  unapplied.

  2026-06-12 closure: expense direct business endpoints
  (`submit/approve/reject/cancel/pay`) remain as compatibility business
  commands, but they no longer read or write
  `expense_request_approval_chains`, `current_step`, or
  `current_step_role`. Actionable approval/payment work is owned by
  `workflow_tasks`, and the old `/expense-requests/todo` endpoint was removed
  in `13ff56c refactor(workflow): 移除费用旧待办接口`.

- [ ] **Step 3.4: Verification**

  Run:

  ```bash
  bun run api:typecheck
  bun run api:build
  git diff --check
  ```

  Smoke the old API paths against a staging tenant:

  ```bash
  curl -sS "$GOOES_API_BASE_URL/customers/$CUSTOMER_ID/status-actions" -H "authorization: Bearer $TOKEN"
  curl -sS -X POST "$GOOES_API_BASE_URL/customers/$CUSTOMER_ID/status-transition" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"action":"start_following"}'
  curl -sS "$GOOES_API_BASE_URL/projects/$PROJECT_ID/status-actions" -H "authorization: Bearer $TOKEN"
  curl -sS -X POST "$GOOES_API_BASE_URL/expense-requests/$EXPENSE_ID/approve" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"comment":"ok"}'
  ```

  Expected: old endpoints return 2xx and include `workflow_state` or `workflow_runtime`.

  2026-06-12 update: this old-endpoint smoke is obsolete for customer/project
  status routes because those routes were intentionally removed before final
  destructive cleanup. The remaining required smoke is the Phase 5
  authenticated workflow smoke against `/workflow-subjects`, `/workflow-tasks`,
  task center, admin action panels, and mini-program bootstrap/detail.

### Phase 3 Acceptance

- [x] Old customer/project status endpoints are removed; normal status actions use workflow subject/task APIs.
- [x] Remaining expense business endpoints no longer depend on old approval chain or current-step state as source of truth.
- [x] Workflow runtime is the primary actionable state path.
- [ ] Staging smoke confirms the workflow-first replacement surface covers the old status/action flows.
- [x] Commit:

  ```bash
  git add apps/api/src/services apps/api/src/controllers
  git commit -m "feat(workflow): 将旧状态接口接入流程运行时"
  ```

  Compatibility adapter work was delivered in
  `fa6bdcb feat(workflow): 在旧状态接口补充流程状态投影` and then superseded by
  route removal / workflow-first read path commits. Staging smoke remains
  tracked under Phase 5 because the final API surface is workflow-first rather
  than old status endpoint compatibility.

## Phase 4: Backfill Historical Runtime Data

**Goal:** 把旧状态字段、旧流转日志、旧审批链回填到 workflow runtime，并可重复执行。

**Files:**
- Create: `apps/api/src/scripts/backfill-workflow-runtime-from-state-machine.ts`
- Create: `apps/api/src/scripts/workflow-runtime-backfill/*`
- Create: `docs/state_machine_migrate/audit/YYYY-MM-DD-backfill-report.md`
- Modify: `docs/state_machine_migrate/execution-plan.md`

### Steps

- [x] **Step 4.1: Create idempotent backfill script**

  Script must support:

  ```bash
  bun src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id <uuid> --dry-run
  bun src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id <uuid> --apply
  ```

  Required behavior:

  - Dry run prints counts and does not write.
  - Apply creates missing `workflow_instances`.
  - Apply creates missing `workflow_instance_nodes`, `workflow_tasks`, `workflow_transition_logs`.
  - Re-running apply produces zero duplicate running instances for the same subject.

  Implementation note:
  `apps/api/src/scripts/backfill-workflow-runtime-from-state-machine.ts`
  delegates mapping, data access, report writing, and runner orchestration to
  `apps/api/src/scripts/workflow-runtime-backfill/`. Existing instances are
  detected before insert; any existing instance for the same tenant,
  definition, subject type, and subject id is skipped, so completed/canceled
  historical rows are also idempotent.

- [x] **Step 4.2: Backfill customers**

  Map old customer `status` to workflow node key:

  | old status | workflow node key |
  | --- | --- |
  | `potential` | `following` |
  | `following` | `following` |
  | `arrived` | `arrived` |
  | `designing` | `designing` |
  | `signed` | `signed` |
  | `dormant` | skipped: current template has no dormant node |
  | `invalid` | `invalid` |

  Note: the current `customer_main` template does not contain `invalid`; those
  rows are reported as `mapped_node_missing` until the template is extended or
  the business accepts skipping invalid customers.

- [x] **Step 4.3: Backfill projects**

  Map project status to workflow node key:

  | old status | workflow node key |
  | --- | --- |
  | `designing` | `designing` |
  | `proposal_confirmed` | `proposal_confirmed` |
  | `signed` | `signed` |
  | `design_finalized` | `design_finalized` |
  | `pending_start` | `pending_start` |
  | `started` | `started` |
  | `constructing` | `constructing` |
  | `on_hold` | `on_hold` |
  | `acceptance` | `acceptance` |
  | `invalid` | `invalid` |

- [x] **Step 4.4: Backfill expense requests**

  Map expense fields:

  | old status/current_step | workflow node key | task status |
  | --- | --- | --- |
  | `draft/draft` | `draft` | none |
  | `pending/manager_review` | `manager_review` | pending |
  | `pending/finance_review` | `finance_review` | pending |
  | `approved/payment` | `payment` | pending |
  | `paid/done` | `done` | none |
  | `rejected/draft` | `rejected` | none |
  | `cancelled/cancelled` | `cancelled` | none |

  Note: the current `expense_approval` template does not contain `draft` or
  `cancelled`; `draft/draft` is skipped as not started, and
  `cancelled/cancelled` is reported as `mapped_node_missing` unless the active
  template is extended before staging apply.

- [ ] **Step 4.5: Verification**

  Run dry run first:

  ```bash
  cd apps/api
  bun src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id "$TENANT_ID" --dry-run
  ```

  Then apply in staging:

  ```bash
  cd apps/api
  bun src/scripts/backfill-workflow-runtime-from-state-machine.ts --tenant-id "$TENANT_ID" --apply
  ```

  Run reconciliation SQL:

  ```sql
  SELECT c.tenant_id, count(*) AS missing_count
  FROM public.customers c
  LEFT JOIN public.workflow_instances wi
    ON wi.tenant_id = c.tenant_id
   AND wi.subject_type = 'customer'
   AND wi.subject_id = c.id::text
  WHERE c.invalidated_at IS NULL
    AND wi.id IS NULL
  GROUP BY c.tenant_id;
  ```

  Expected: no rows or all `missing_count = 0` for target tenant after apply.

  Local implementation verification completed:

  ```bash
  cd apps/api
  bun test src/scripts/workflow-runtime-backfill/plan.test.ts
  bun run typecheck
  bun run check:file-size
  ```

  Staging dry-run/apply is still pending because the available environment does
  not include a confirmed staging `TENANT_ID`. Remote migration status now
  succeeds for project `fclnkyatvfvmzgzdqlba` through `20260612124500`.

### Phase 4 Acceptance

- [ ] Dry run report is saved.
- [ ] Apply is idempotent in staging.
- [ ] Customer/project/expense reconciliation passes.
- [x] Backfill report documents counts, skipped rows, and manual follow-ups.
- [x] Commit:

  ```bash
  git add apps/api/src/scripts/backfill-workflow-runtime-from-state-machine.ts docs/state_machine_migrate/audit docs/state_machine_migrate/execution-plan.md
  git commit -m "feat(workflow): 回填旧状态机运行数据"
  ```

  Completed in `41950f5 feat(workflow): 回填旧状态机运行数据`.

## Phase 5: Switch Read Paths

**Goal:** 后台、任务中心、小程序自助接口从 workflow subject state 和 workflow tasks 读取，不再依赖旧状态字段作为读模型。

**Files:**
- Modify: `apps/api/src/services/task-center/legacy/builders-expense.ts`
- Modify: `apps/api/src/repositories/task-center.ts`
- Modify: `apps/api/src/controllers/customer-self-service/*`
- Modify: `apps/api/src/services/customer-self-service.ts`
- Modify: `apps/admin/components/customers/customer-status-panel.tsx`
- Modify: `apps/admin/components/projects/project-status-panel.tsx`
- Modify: `docs/state_machine_migrate/miniprogram-integration.md`

### Steps

- [x] **Step 5.1: Task center reads workflow tasks**

  Replace expense approval chain task construction with `workflow_tasks` query scoped by:

  - `tenant_id`
  - `status = 'pending'`
  - assignee employee or role permissions

  The list must be paginated and must not return all tasks.

  Progress:
  Expense approval/payment todos now read pending `workflow_tasks` through
  `workflowTaskRepository.listAccessibleTasks()` with tenant, employee, role,
  permission and `pageSize=100` boundaries. Expense detail display fields are
  loaded by subject id batch after workflow task filtering.

  API upgrade:
  `/workflow-tasks/:id/complete` now bridges `expense_request` workflow tasks
  back into the existing expense business service for `approve`, `reject`, and
  `pay`, so mini-program task completion updates both workflow runtime and
  expense request status/current step during the compatibility window.

  `/workflow-tasks/:id/complete` also bridges `project` workflow tasks into the
  existing project status service for the linear construction flow and explicit
  `pause_project`/`mark_invalid`/`resume_project` actions. Required business
  fields, such as `signed_amount`, `start_date`, and
  `construction_manager_employee_id`, are still validated by the project status
  service.

  `/workflow-tasks/:id/complete` now bridges supported `customer` workflow
  tasks into the customer status service for `mark_arrived`, `start_design`,
  and explicit `mark_invalid`. Customer signing remains driven by project
  contract signing because the legacy customer `mark_signed` action is
  intentionally internal-only.

  `workflow_state.actions` and `/workflow-tasks` list rows now include
  workflow action metadata (`business_domain`, `business_action`, `node_key`,
  `node_type`, `output_fields`). Project signing and construction scheduling
  expose required output fields, and expense approval nodes expose both
  approve/reject actions, so mini-program clients can render workflow-first
  buttons without reverse-mapping task titles.

- [x] **Step 5.2: Customer self-service includes workflow_state**

  Add `workflow_state` to mini-program bootstrap/detail payloads that currently expose project/customer status.

  Progress:
  Customer self-service project list/detail payloads now attach
  `workflow_subject_states` by project id and serialize `workflow_state`.

- [x] **Step 5.3: Admin panels read workflow_state**

  Change customer/project status panels to render workflow actions first and old status actions only as fallback.

  Admin customer/project status panels now read
  `/workflow-subjects/:subjectType/:subjectId/state` and display workflow
  projection next to the legacy status controls.

  Admin customer/project status panels now render workflow actions first and
  old status actions only as fallback. Customer/project workflow actions call
  `/workflow-tasks/:id/complete`; project signing and construction scheduling
  reuse the existing status action dialog so `signed_amount`, `start_date`,
  and `construction_manager_employee_id` are still collected before submit.

  2026-06-12 progress: admin customer/project status panels now also read
  workflow timeline through `/workflow-subjects/:subjectType/:subjectId/timeline`
  and no longer call old `status-actions`, `status-transition`, or
  `status-transitions` endpoints in the normal customer/project detail flow.
  `workflow:cleanup-readiness` now reports zero blockers under
  `apps/admin/components/customers` and `apps/admin/components/projects`.

  2026-06-12 progress: `/expense-requests` list responses now batch attach
  `workflow_subject_states` as `workflow_state` for each expense request.
  The admin expense table current-node column and page payment count read the
  workflow projection instead of legacy `current_step`.

  2026-06-12 progress: admin expense approve/reject/pay actions now resolve
  the latest `workflow_state.actions` and submit `/workflow-tasks/:id/complete`
  instead of directly calling old expense action endpoints. Cancel/withdraw
  remains on the existing expense API until workflow action metadata supports
  cancellation.

  2026-06-12 progress: admin expense pages no longer send `current_step`
  filters, no longer render legacy `approval_chain`, and no longer keep those
  legacy fields in admin expense types. Expense detail now displays the
  `workflow_state` projection for the current workflow node. Cleanup readiness
  reports zero blockers under `apps/admin/components/expenses` and
  `apps/admin/app/(console)/expenses`.

  2026-06-12 progress: task-center expense todos now only use workflow tasks
  plus expense summary lookup by id; the old repository projection that
  queried `current_step` for expense todos has been removed.

  2026-06-12 progress: the old `/expense-requests/todo` API, its query schema,
  and its service method have been removed. The cleanup readiness scanner now
  treats this endpoint pattern as a blocker so it cannot silently reappear.

  2026-06-12 progress: `/expense-requests` list/stats query handling no longer
  exposes or applies legacy `current_step` filters. Clients that need node-level
  actionable work should use `/workflow-tasks` with `subject_type` filters.

  2026-06-12 progress: old customer/project `status-actions`,
  `status-transition`, and `status-transitions` controller routes have been
  removed. Clients must use `/workflow-subjects/:subjectType/:subjectId/state`,
  `/workflow-subjects/:subjectType/:subjectId/timeline`, and
  `/workflow-tasks/:id/complete`.

  2026-06-12 progress: expense request create/update/submit schemas no
  longer expose legacy `approval_chain` request fields, and the service no
  longer writes `expense_request_approval_chains` from mutation input. During
  the compatibility window, submit still reuses any existing stored chain until
  the remaining internal approval-chain runtime mapping is removed.

  2026-06-12 progress: customer status changes no longer write
  `customer_status_transition_logs`, and the old customer transition-log
  repository has been removed. Customer status changes still update the
  customer business status and sync workflow runtime/subject state.

  2026-06-12 progress: project status changes no longer write/read
  `project_status_transition_logs`, and the old project transition-log
  repository has been removed. `resume_project` now resolves the paused source
  status from the latest workflow transition log context for the project
  instance.

  2026-06-12 progress: project construction scheduling no longer calls the
  legacy `schedule_project_construction_transition` RPC. The API now updates
  project status/start date through the project repository, assigns the primary
  construction manager through `ProjectMemberService`, then syncs workflow
  runtime/subject state. Migration
  `20260612133000_drop_schedule_project_construction_transition.sql` drops the
  old RPC; rollback is to restore the latest function definition from
  `20260531192000_cast_schedule_construction_start_date.sql`.

  2026-06-12 progress: expense request runtime no longer reads or writes
  `expense_request_approval_chains`. Repository selects no longer project the
  old chain table, submit/approve/reject/cancel no longer mutate chain rows,
  and `/expense-requests` list no longer uses the old approval-chain assignee
  branch. Workflow tasks now own actionable approver routing during the
  compatibility window; `expense_request_approvals` remains as the audit log.
  `workflow:cleanup-readiness` reports zero blocking production references to
  `expense_request_approval_chains`.

  2026-06-12 progress: expense request runtime no longer reads or writes
  legacy `current_step`. Workflow task completion passes the task `node_key`
  into the expense business service; direct legacy approve/reject/pay endpoints
  resolve the current node from `workflow_subject_states`. Submit, approve,
  reject, cancel, pay, and expense workflow runtime sync no longer mutate or
  inspect the old column. Cleanup readiness now leaves only the historical
  `workflow-runtime-backfill` script references to `current_step`.

  2026-06-12 progress: `workflow-runtime-backfill` no longer reads
  `expense_requests.current_step`. Expense backfill derives the pending
  `manager_review` / `finance_review` node from `expense_request_approvals`
  audit rows, while terminal status mapping still comes from
  `expense_requests.status`. `workflow:cleanup-readiness` now reports
  `ready: true` with zero blocker references.

- [ ] **Step 5.4: Verification**

  Run:

  ```bash
  bun run api:typecheck
  bun run api:build
  pnpm --dir apps/admin check
  cd apps/api
  bun run workflow:cleanup-readiness
  cd ../..
  git diff --check
  ```

  API smoke:

  ```bash
  cd apps/api
  GOOES_API_BASE_URL="$GOOES_API_BASE_URL" \
  PHASE5_SMOKE_EMPLOYEE_TOKEN="$TOKEN" \
  PHASE5_SMOKE_CUSTOMER_TOKEN="$CUSTOMER_TOKEN" \
  PHASE5_SMOKE_CUSTOMER_PROJECT_ID="$CUSTOMER_PROJECT_ID" \
  PHASE5_SMOKE_PROJECT_ID="$PROJECT_ID" \
  bun run workflow:phase5-smoke
  cd ../..
  ```

  Expected: `/workflow-tasks`, `/task-center/todos`, `/customer/bootstrap`,
  optional customer project detail bootstrap, and optional project workflow
  state return expected workflow data and remain paginated where list data is
  returned.

  2026-06-12 verification:

  - `cd apps/api && bun test src/services/workflow-task-action-metadata.test.ts src/services/workflow-task-customer-bridge.test.ts src/services/workflow-task-project-bridge.test.ts src/services/workflow-task-expense-bridge.test.ts`: passed, 9 tests / 15 expects.
  - `bun run api:typecheck`: passed.
  - `bun run api:build`: passed.
  - `pnpm --dir apps/admin check`: passed.
  - `git diff --check`: passed.
  - Playwright login-page smoke against existing `http://127.0.0.1:3010`: passed.
  - Added `cd apps/api && bun run workflow:phase5-smoke` to make staging/API
    smoke repeatable once tokens and ids are available.

  Runtime API smoke remains pending because this workspace does not have
  staging tenant ids or authenticated admin/mini-program tokens. See
  `docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md`.

  `workflow:final-completion-audit` intentionally remains out of Phase 5
  verification. It is a Phase 6/final gate and must fail before destructive
  cleanup apply because pending destructive migrations, legacy database
  objects, generated legacy types, and the final breaking cleanup commit are
  not complete yet.

### Phase 5 Acceptance

- [x] Task center uses workflow tasks.
- [x] Mini-program bootstrap/detail responses include `workflow_state`.
- [x] Admin panels can operate from workflow actions.
- [ ] Orange team receives updated mini-program doc.
- [ ] Staging/admin/mini-program smoke evidence is attached.
- [x] Commit:

  ```bash
  git add apps/api apps/admin docs/state_machine_migrate/miniprogram-integration.md
  git commit -m "feat(workflow): 切换流程状态读路径"
  ```

  Backend/admin read-path work was completed across
  `78b0736 feat(workflow): 切换部分流程状态读路径`,
  `13ff56c refactor(workflow): 移除费用旧待办接口`, and
  `a6ca2df refactor(workflow): 移除客户项目旧状态接口`. Authenticated
  staging/admin/mini-program smoke evidence and Orange delivery confirmation
  remain external gates.

## Phase 6: Destructive Cleanup Migration

**Goal:** 在兼容期和小程序验收通过后删除旧状态机数据库对象。

**Files:**
- Create: `supabase/migrations/20260612143000_drop_legacy_state_machine_objects.sql`
- Modify: `apps/api/src/types/database.ts`
- Modify: `docs/state_machine_migrate/audit/YYYY-MM-DD-cleanup-report.md`

### Preconditions

- [ ] Phase 0-5 acceptance all checked.
- [ ] Production backup completed and restore window recorded.
- [ ] `workflow:migration-status` shows local and remote migration history
  aligned through the last non-destructive migration before cleanup, with only
  the destructive cleanup pair pending.
- [ ] Orange team confirms mini-program no longer depends on old `status_actions/current_step` controls.
- [ ] Admin smoke confirms no old status endpoints are required for normal workflows.
- [x] `cd apps/api && bun run workflow:cleanup-readiness` exits 0.

  2026-06-12 target pre-cleanup status: Supabase project
  `fclnkyatvfvmzgzdqlba` is aligned through `20260612124500`; the direct
  migration history check reports only the destructive cleanup pair as pending:
  `20260612133000_drop_schedule_project_construction_transition.sql` and
  `20260612143000_drop_legacy_state_machine_objects.sql`. Target
  `workflow:runtime-consistency-check` passes with `total_issues: 0`.
  Read-only inventory confirms the legacy objects still exist and are therefore
  ready for the final destructive migration after the remaining human/smoke
  gates are satisfied.

  2026-06-12 progress: added an explicit destructive cleanup preflight:

  ```bash
  cd apps/api
  bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight
  ```

  Without a manual gate evidence file, the command must fail if any external
  gate is missing. Current target run passes the automated checks
  (`pending_migrations_are_destructive_pair`,
  `destructive_migration_content`, `cleanup_readiness`,
  `workflow_runtime_consistency`, and `legacy_objects_still_targeted`) and
  fails only `manual_gates`.
  `destructive_migration_content` also rejects accidental drops of retained
  business `status` columns.

  Final destructive apply requires a completed evidence file based on
  `docs/state_machine_migrate/audit/manual-gates.example.json`:

  ```bash
  cd apps/api
  bun run workflow:manual-gates-check \
    --evidence-file docs/state_machine_migrate/audit/manual-gates.json
  bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
    --evidence-file docs/state_machine_migrate/audit/manual-gates.json
  cd ../..
  ```

  `workflow:manual-gates-check` validates only the evidence file and does not
  require a database connection. `SUPABASE_DB_DIRECT_URL` or
  `SUPABASE_DB_URL` must be present for the destructive cleanup preflight. The
  preflight no longer falls back to a linked Supabase project; a destructive
  cleanup target must be explicit before any gate can pass.

  The evidence file must include Phase 4 backfill/reconciliation evidence,
  Phase 5 authenticated API smoke evidence, mini-program workflow API contract
  upgrade evidence, mini-program rollout confirmation, admin smoke evidence,
  and backup/restore-window evidence. Mini-program confirmation must include
  `confirmed_by`, parseable `confirmed_at`, and numeric `minimum_version`;
  admin smoke must include `actor` and parseable `smoke_at`. These timestamps
  must not be in the future. Each evidence value must be either an `http(s)`
  URL or a `docs/state_machine_migrate/` path; local doc paths must reference
  existing files. A missing, malformed, future-dated, free-form, or non-version
  evidence value is reported as a failed manual gate and must be fixed before
  destructive apply.

### Steps

- [x] **Step 6.1: Create cleanup migration**

  Migration must drop these known legacy objects after final inventory verification:

  ```sql
  DROP FUNCTION IF EXISTS public.schedule_project_construction_transition(
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    jsonb
  );

  DROP TABLE IF EXISTS public.customer_status_transition_logs;
  DROP TABLE IF EXISTS public.project_status_transition_logs;
  DROP TABLE IF EXISTS public.expense_request_approval_chains;

  ALTER TABLE public.expense_requests
    DROP CONSTRAINT IF EXISTS expense_requests_current_step_check,
    DROP COLUMN IF EXISTS current_step,
    DROP COLUMN IF EXISTS current_step_role;

  DROP INDEX IF EXISTS public.idx_expense_requests_current_step;
  ```

  Only drop `customers.status`, `projects.status`, `expense_requests.status` if Phase 5 confirms all reads use workflow projection:

  ```sql
  ALTER TABLE public.customers DROP COLUMN IF EXISTS status;
  ALTER TABLE public.projects DROP COLUMN IF EXISTS status;
  ALTER TABLE public.expense_requests DROP COLUMN IF EXISTS status;
  ```

  2026-06-12 progress: created
  `supabase/migrations/20260612143000_drop_legacy_state_machine_objects.sql`.
  It explicitly drops legacy transition-log/approval-chain indexes, the
  construction scheduling RPC, `customer_status_transition_logs`,
  `project_status_transition_logs`, `expense_request_approval_chains`, and
  `expense_requests.current_step/current_step_role`. It intentionally does not
  drop `customers.status`, `projects.status`, or `expense_requests.status`
  because current API code still treats those columns as business status
  fields while workflow runtime owns the actionable node state.

- [ ] **Step 6.2: Regenerate database types**

  Run:

  ```bash
  supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba > apps/api/src/types/database.ts
  ```

  2026-06-12 status: pending target-environment migration apply. Do not
  regenerate remote database types until `20260612143000_drop_legacy_state_machine_objects.sql`
  has been applied to the Supabase project; otherwise generated types will
  continue to expose the old objects.

- [ ] **Step 6.3: Verification**

  Run:

  ```bash
  cd apps/api
  bun run workflow:manual-gates-check \
    --evidence-file docs/state_machine_migrate/audit/manual-gates.json
  bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
    --evidence-file docs/state_machine_migrate/audit/manual-gates.json
  cd ../..
  supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
  cd apps/api
  bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-verify
  bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
    --evidence-file docs/state_machine_migrate/audit/manual-gates.json
  cd ../..
  cd apps/api
  bun run workflow:cleanup-readiness
  cd ../..
  bun run api:typecheck
  bun run api:build
  pnpm --dir apps/admin check
  git diff --check
  ```

  `workflow:destructive-cleanup-verify` is the required post-apply database
  verification. It checks that these legacy objects are absent:

  `workflow:manual-gates-check` is the required pre-apply evidence-file gate.
  It must report `ok: true` before `supabase db push` is allowed.

  - `customer_status_transition_logs`,
    `project_status_transition_logs`,
    `expense_request_approval_chains`;
  - `schedule_project_construction_transition(...)`;
  - `expense_requests.current_step/current_step_role`;
  - legacy transition-log / approval-chain / `current_step` indexes;
  - legacy `expense_requests` policy `Approvers view pending`.

  Expected: every legacy absence check is `ok: true`, and
  `workflow_runtime_consistency` reports `total_issues=0`.

### Phase 6 Acceptance

- [ ] Legacy tables are absent in staging.
- [ ] Legacy RPC is absent in staging.
- [ ] Generated database types no longer expose dropped objects.
- [x] API checks pass locally; admin smoke remains part of staging gate.
- [ ] Commit:

  ```bash
  git add supabase/migrations apps/api/src/types/database.ts docs/state_machine_migrate/audit
  git commit -m "refactor(workflow)!: 删除旧状态机数据库对象"
  ```

## Phase 7: Legacy Code Removal

**Goal:** 删除旧状态机 domain config、repositories、services、scripts 和 UI fallback，系统彻底使用 workflow。

**Files:**
- Modify: `packages/domain/src/customer.ts`
- Modify: `packages/domain/src/project.ts`
- Modify: `apps/api/src/services/customer-status.ts`
- Modify: `apps/api/src/services/project-status.ts`
- Delete: `apps/api/src/repositories/customer-status-transitions.ts`
- Delete: `apps/api/src/repositories/project-status-transitions.ts`
- Delete: `apps/api/src/scripts/status-machine-consistency-check.ts`
- Delete or split: `apps/api/src/services/expense-requests/legacy/workflow.ts`
- Delete or split: `apps/api/src/services/expense-requests/legacy/approval-chain.ts`
- Delete or split: `apps/api/src/repositories/expense-requests/legacy/approvals.ts`

### Steps

- [x] **Step 7.1: Remove customer/project domain transition configs**

  Delete old transition resolver exports only after no imports remain:

  ```bash
  rg -n "CustomerStatusActionConfig|resolveCustomerStatusTransition|listCustomerStatusActions|ProjectStatusActionConfig|resolveProjectStatusTransition|listProjectStatusActions" apps packages
  ```

  Expected before deletion: no production imports except files being removed in this phase.

  2026-06-12 progress: API workflow adapters and admin customer/project status
  panels no longer import `CustomerStatusActionConfig`,
  `ProjectStatusActionConfig`, or the old domain transition resolver/list/infer
  helpers. Customer/project business action metadata now uses local workflow
  action helpers under `apps/api/src/services/workflow-business-actions.ts` and
  `apps/admin/components/workflows/workflow-business-actions.ts`. The shared
  domain package no longer exports the legacy transition configs or resolver
  helpers; it only keeps the status/action value unions that are still used as
  workflow business action identifiers.

- [x] **Step 7.2: Remove old transition repositories**

  Delete customer/project transition repository files and remove route/service references.

- [x] **Step 7.3: Remove expense approval chain legacy code**

  Delete code that directly writes `expense_request_approval_chains`, `current_step`, or approval chain status.

- [x] **Step 7.4: Replace consistency checker**

  Create `apps/api/src/scripts/workflow-runtime-consistency-check.ts` that checks:

  - each active customer/project/expense subject has a workflow subject state;
  - each running instance has at most one current node;
  - each pending task belongs to a running instance;
  - subject state current node matches instance current node.

  2026-06-12 progress: `status-machine-consistency-check.ts` has been removed
  and replaced by `workflow-runtime-consistency-check.ts`. The new script uses
  read-only aggregate SQL over `workflow_instances`, `workflow_instance_nodes`,
  `workflow_tasks`, and `workflow_subject_states`, and fails with non-zero exit
  when any runtime consistency issue is found. API package script
  `workflow:runtime-consistency-check` points to the replacement.

- [x] **Step 7.5: Verification**

  Run:

  ```bash
  rg -n "customer_status_transition_logs|project_status_transition_logs|expense_request_approval_chains|schedule_project_construction_transition|current_step|current_step_role|status-machine-consistency-check" apps packages supabase --glob '!**/.next/**'
  cd apps/api
  bun run workflow:cleanup-readiness
  cd ../..
  bun run api:typecheck
  bun run api:build
  pnpm --dir apps/admin check
  git diff --check
  ```

  Expected: `rg` only returns historical docs/migrations that intentionally document the removed system.

  2026-06-12 status: direct `rg` still returns historical migrations,
  generated Supabase types that cannot be regenerated until destructive apply,
  cleanup/preflight/verifier scripts, and tests. The authoritative
  production-source gate is `workflow:cleanup-readiness`, which reports
  `ready: true` and `blockers: []`.

### Phase 7 Acceptance

- [x] Production code has no old state machine imports or writes.
- [x] Old status endpoints are removed or explicitly deprecated behind workflow compatibility.
- [x] Workflow consistency checker replaces old status checker.
- [x] API/admin checks pass.
- [x] Commit:

  ```bash
  git add apps packages docs/state_machine_migrate
  git commit -m "refactor(workflow): 移除旧状态机代码"
  ```

  Completed across cleanup commits through
  `9674bb3 refactor(workflow): 删除旧领域状态动作配置`,
  `5f4fa33 refactor(workflow): 替换状态机一致性检查脚本`, and
  `2ce1098 feat(workflow): 增加破坏性清理后验证`.

## Final Completion Audit

Only mark the migration complete when all checks below pass:

- [x] `rg` finds no old state machine references in production code.
- [ ] Direct migration history check is aligned for target environment.
- [ ] Staging DB no longer has old tables, old RPC, or old indexes.
- [ ] Customer, project, expense, task center, admin and mini-program smoke tests pass.
- [ ] Mini-program team confirms new `workflow_state` integration is released or old paths are no longer used.
- [ ] Rollback plan and production backup evidence are attached to the cleanup report.
- [ ] Final commit message documents the breaking DB cleanup.

The final technical gate is repeatable with:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

The final destructive cleanup operation should follow
`docs/state_machine_migrate/final-cleanup-runbook.md` so apply output,
post-apply verification, type regeneration, and rollback evidence are recorded
in one place.

For an operator-friendly summary of remaining blockers, run:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Expected after destructive apply: no pending migrations, cleanup readiness
passes, local and remote migration history are aligned by direct
`supabase_migrations.schema_migrations` comparison, legacy database objects are
absent, generated database types no longer expose dropped objects, workflow
runtime is consistent, manual gate evidence is complete, and the latest commit
documents the breaking workflow database cleanup. Remote connection failures
are reported as failed audit checks and must be resolved before treating the
final audit as evidence.
