# Supplier Purchase Batch Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将采购批次接入租户级通用 workflow：额度内经过采购审批，超预算再经过财务审批，最终审批原子地按供应商生成并提交采购单，同时向 Admin 与 Orange 提供统一待办、动作、时间线、撤回和灰度能力。

**Architecture:** `supplier_purchase_batches` 继续作为采购金额、预算、拆单和采购单结果的业务事实源；`workflow_instances/workflow_tasks/workflow_subject_states` 负责审批运行态。提交、审批、驳回和撤回均由 service-role PostgreSQL 编排 RPC 在同一事务中调用现有采购命令与 workflow runtime，并通过 API service/repository 桥接；客户端只读取 `workflow_state.actions` 和 `/workflow-tasks`，不自行推断审批节点。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod 4、Supabase JS/PostgREST、PostgreSQL migration/RPC、Next.js 15 Admin、shadcn/Radix、Bun test、Playwright。

---

实施依据：[采购批次通用 Workflow 接入设计](../specs/2026-08-30-supplier-purchase-batch-workflow-design.md)。Orange 仓库 `/Users/leefo/Public/work/orange` 只读；本计划仅在 Gooes 中交付后端、Admin 和对接文档。

## Task 1：扩展共享领域与 HTTP 输入契约

**Files:**

- Modify: `packages/domain/src/workflow.ts`
- Modify: `packages/domain/src/supplier-purchase-batch.ts`
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts`
- Modify: `apps/api/src/schema/workflow-subjects.ts`
- Create: `packages/domain/src/workflow.test.ts`
- Test: `packages/domain/src/supplier-purchase-batch.test.ts`
- Test: `apps/api/src/schema/supplier-purchase-batches.test.ts`
- Create: `apps/api/src/schema/workflow-subjects.test.ts`

- [ ] **Step 1: 先写失败的领域契约测试**

  断言 `WORKFLOW_SUBJECT_TYPE_VALUES` 包含 `supplier_purchase_batch`；断言采购批次命令状态包含 `withdrawn`，并新增命令类型常量 `save_draft | submit | review | cancel | withdraw`，避免 API、repository 和 migration 各自维护字符串。

- [ ] **Step 2: 运行测试确认 RED**

  Run:

  ```bash
  bun test packages/domain/src/workflow.test.ts packages/domain/src/supplier-purchase-batch.test.ts
  ```

  Expected: 新 subject type 与 `withdrawn`/`withdraw` 断言失败。

- [ ] **Step 3: 最小扩展共享领域类型**

  在 `WORKFLOW_SUBJECT_TYPE_VALUES` 末尾加入 `supplier_purchase_batch`；在采购批次文件导出命令类型常量和 `withdrawn` 命令结果状态，不改变现有业务状态集合 `draft | pending_approval | rejected | cancelled | ordered`。

- [ ] **Step 4: 先写失败的 Zod 契约测试**

  覆盖：

  - `SupplierPurchaseBatchWithdrawSchema` 接受 `{ expected_version, reason? }`；`expected_version` 必须为非负整数，`reason` trim 后最大 500 字。
  - `WorkflowTaskCompleteSchema` 对 `approve/reject` 保持通用输入形态，不在公共 schema 中硬编码采购权限。
  - `WorkflowSubjectTypeSchema` 接受 `supplier_purchase_batch`。

- [ ] **Step 5: 实现 schema 并运行 GREEN**

  Run:

  ```bash
  cd apps/api
  bun test src/schema/supplier-purchase-batches.test.ts src/schema/workflow-subjects.test.ts
  cd ../..
  bun test packages/domain/src/workflow.test.ts packages/domain/src/supplier-purchase-batch.test.ts
  ```

- [ ] **Step 6: 提交领域契约**

  ```bash
  git add packages/domain/src/workflow.ts packages/domain/src/supplier-purchase-batch.ts \
    packages/domain/src/workflow.test.ts packages/domain/src/supplier-purchase-batch.test.ts \
    apps/api/src/schema/supplier-purchase-batches.ts apps/api/src/schema/supplier-purchase-batches.test.ts \
    apps/api/src/schema/workflow-subjects.ts apps/api/src/schema/workflow-subjects.test.ts
  git commit -m "feat(supplier): 扩展采购批次审批领域契约"
  ```

## Task 2：建立数据库基础、灰度字段和运行态唯一性

**Files:**

- Create: `supabase/migrations/20260830110500_add_supplier_purchase_batch_workflow_foundation.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-foundation-migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 写 migration 静态契约测试**

  测试必须读取指定 migration 并验证：

  - `supplier_purchase_batches.approval_round integer NOT NULL DEFAULT 0` 与 `CHECK (approval_round >= 0)`。
  - `tenant_supplier_settings.purchase_batch_workflow_enabled boolean NOT NULL DEFAULT false`。
  - 父开关约束：workflow 开启时 `module_enabled` 与 `procurement_snapshot_v1_enabled` 都为 true；父开关关闭前必须先关闭 workflow。
  - `workflow_subject_states.subject_type` 和所有仍限制 subject type 的数据库 CHECK 接受 `supplier_purchase_batch`。
  - running instance 部分唯一索引 `(tenant_id, subject_type, subject_id) WHERE status = 'running' AND subject_type = 'supplier_purchase_batch'`。
  - 查询索引 `(tenant_id, subject_type, subject_id, status, created_at DESC, id DESC)`。
  - 所有新函数/表权限只授予 `service_role`，没有 `authenticated` 执行权。
  - migration 使用 `BEGIN/COMMIT`，末尾写明前向回滚策略注释。

- [ ] **Step 2: 运行测试确认 RED**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-workflow-foundation-migration-contract.test.ts
  ```

  Expected: migration 文件不存在。

- [ ] **Step 3: 创建 foundation migration**

  migration 只做字段、约束和索引，不启用任何现有租户。更新已有 subject type CHECK 时先删除已知约束名再按完整集合重建；不得用动态删除所有约束。索引使用 `IF NOT EXISTS`，避免重复发布失败。

- [ ] **Step 4: 本地 dry-run、应用并生成类型**

  ```bash
  supabase db push --local --dry-run
  supabase db push --local
  supabase migration list
  supabase gen types typescript --local > apps/api/src/types/database.ts
  ```

  Expected: dry-run 仅包含本计划未应用 migration；应用后 Local migration 含 `20260830110500`；生成类型含两个新字段。若本地 Supabase 未运行，在此停止数据库步骤并记录阻塞，不得从 dev 生成类型或手写伪造类型。

- [ ] **Step 5: 运行 GREEN 与类型检查**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-workflow-foundation-migration-contract.test.ts
  bun run typecheck
  ```

- [ ] **Step 6: 提交基础 migration**

  ```bash
  git add supabase/migrations/20260830110500_add_supplier_purchase_batch_workflow_foundation.sql \
    apps/api/src/services/supplier-purchase-batch-workflow-foundation-migration-contract.test.ts \
    apps/api/src/types/database.ts
  git commit -m "feat(supplier): 建立采购批次审批数据库基础"
  ```

## Task 3：贯通租户采购审批灰度开关

**Files:**

- Create: `supabase/migrations/20260830111000_extend_supplier_workflow_rollout_command.sql`
- Modify: `apps/api/src/schema/platform-suppliers.ts`
- Modify: `apps/api/src/repositories/platform-supplier-records.ts`
- Modify: `apps/api/src/repositories/tenant-suppliers-mappers.ts`
- Modify: `apps/api/src/repositories/platform-suppliers.ts`
- Modify: `apps/api/src/services/platform-suppliers.ts`
- Modify: `apps/api/src/services/platform-supplier-service-utils.ts`
- Modify: `apps/api/src/services/supplier-rollout-settings.ts`
- Modify: `apps/api/src/services/supplier-rollout-settings-migration-contract.test.ts`
- Modify: `apps/api/src/services/supplier-rollout-settings.test.ts`
- Modify: `apps/api/src/services/platform-suppliers.regression.test.ts`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/admin/components/suppliers/supplier-types.ts`
- Modify: `apps/admin/components/suppliers/supplier-settings-api.ts`
- Modify: `apps/admin/components/platform-tenants/tenant-supplier-settings-rules.ts`
- Modify: `apps/admin/components/platform-tenants/tenant-supplier-settings-rules.test.ts`
- Modify: `apps/admin/components/platform-tenants/tenant-supplier-settings-card.tsx`
- Modify: `apps/admin/app/e2e-harness/supplier-rollout/page.tsx`
- Modify: `apps/admin/e2e/supplier-rollout-workflow.spec.ts`

- [ ] **Step 1: 写失败的 rollout 规则和 API 测试**

  将 `purchase_batch_workflow_enabled` 作为 `SUPPLIER_ROLLOUT_FLAGS` 最后一项。测试开启顺序必须为 `ownership -> private supplier -> private catalog -> procurement snapshot -> purchase workflow`；停用顺序相反。测试 settings schema、SELECT、RPC 参数、默认值和 Admin 请求体都包含该字段。

- [ ] **Step 2: 运行测试确认 RED**

  ```bash
  cd apps/api
  bun test src/services/supplier-rollout-settings.test.ts \
    src/services/supplier-rollout-settings-migration-contract.test.ts \
    src/services/platform-suppliers.regression.test.ts
  cd ../admin
  bun test components/platform-tenants/tenant-supplier-settings-rules.test.ts
  ```

- [ ] **Step 3: 用 migration 替换 settings command RPC**

  `set_tenant_supplier_rollout_settings` 增加 `p_purchase_batch_workflow_enabled boolean`，将其纳入请求 fingerprint、previous/next setting、顺序约束、审计事件和返回 JSON。保持现有函数签名的权限收口模式；显式 revoke 旧签名并 grant 新签名给 `service_role`。

- [ ] **Step 4: 更新 API repository/service/schema**

  所有 settings mapper、Zod record、默认值和 command input 都携带该字段。`supplier-rollout-settings.ts` 的 rollout level 从 5 扩为 6；`isProcurementSnapshotEnabled` 不得隐式等同 workflow 开关，新增独立 `isPurchaseBatchWorkflowEnabled` 判定供采购 service 使用。

- [ ] **Step 5: 更新 Admin 租户设置卡片**

  新增“采购批次 Workflow”开关，说明“开启后批次提交进入统一任务中心审批；关闭前必须不存在依赖该开关的新提交”。复用现有 `Switch`、冲突刷新和幂等命令，不新增组件库。

- [ ] **Step 6: 运行 focused tests 与 Admin check**

  ```bash
  cd apps/api
  bun test src/services/supplier-rollout-settings.test.ts \
    src/services/supplier-rollout-settings-migration-contract.test.ts \
    src/services/platform-suppliers.regression.test.ts
  cd ../admin
  bun test components/platform-tenants/tenant-supplier-settings-rules.test.ts
  pnpm run check
  ```

  migration 应用到本地后再次运行 `supabase gen types typescript --local > apps/api/src/types/database.ts`，确认 settings RPC 新参数和返回字段进入生成类型。

- [ ] **Step 7: 提交灰度开关**

  ```bash
  git add supabase/migrations/20260830111000_extend_supplier_workflow_rollout_command.sql \
    apps/api/src/schema/platform-suppliers.ts \
    apps/api/src/repositories/platform-supplier-records.ts \
    apps/api/src/repositories/tenant-suppliers-mappers.ts \
    apps/api/src/repositories/platform-suppliers.ts \
    apps/api/src/services/platform-suppliers.ts apps/api/src/services/platform-supplier-service-utils.ts \
    apps/api/src/services/supplier-rollout-settings.ts \
    apps/api/src/services/supplier-rollout-settings.test.ts \
    apps/api/src/services/supplier-rollout-settings-migration-contract.test.ts \
    apps/api/src/services/platform-suppliers.regression.test.ts apps/api/src/types/database.ts \
    apps/admin/components/suppliers/supplier-types.ts apps/admin/components/suppliers/supplier-settings-api.ts \
    apps/admin/components/platform-tenants/tenant-supplier-settings-rules.ts \
    apps/admin/components/platform-tenants/tenant-supplier-settings-rules.test.ts \
    apps/admin/components/platform-tenants/tenant-supplier-settings-card.tsx \
    apps/admin/app/e2e-harness/supplier-rollout/page.tsx \
    apps/admin/e2e/supplier-rollout-workflow.spec.ts
  git commit -m "feat(supplier): 增加采购审批灰度开关"
  ```

## Task 4：提供租户级默认采购审批模板

**Files:**

- Create: `supabase/migrations/20260830112000_seed_supplier_purchase_batch_workflow.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-template-migration-contract.test.ts`
- Modify: `apps/api/src/schema/workflows.ts`
- Modify: `apps/api/src/schema/workflows.test.ts`
- Modify: `apps/api/src/services/workflow-templates.ts`
- Modify: `apps/api/src/services/workflow-templates.test.ts`
- Modify: `apps/admin/components/workflows/workflow-types.ts`
- Modify: `apps/admin/components/workflows/workflow-template-actions.tsx`
- Modify: `apps/admin/components/workflows/workflow-display-labels.ts`
- Modify: `apps/admin/components/workflows/workflow-display-labels.test.ts`

- [ ] **Step 1: 写失败的模板测试**

  模板 key 固定为 `supplier_purchase_batch_approval`，subject type 为 `supplier_purchase_batch`，category 为 `approval`。断言节点与边：

  ```text
  start -> purchase_review
  purchase_review --reject--> rejected_end
  purchase_review --approve + budget_status != over_budget--> approved_end
  purchase_review --approve + budget_status == over_budget--> finance_review
  finance_review --approve--> approved_end
  finance_review --reject--> rejected_end
  ```

  `purchase_review.required_permissions = ["supplier.purchase-requisition.approve"]`；`finance_review.required_permissions = ["finance.budget.manage"]`；两个节点都暴露 `approve/reject`。

- [ ] **Step 2: 运行测试确认 RED**

  ```bash
  cd apps/api
  bun test src/schema/workflows.test.ts src/services/workflow-templates.test.ts \
    src/services/supplier-purchase-batch-workflow-template-migration-contract.test.ts
  ```

- [ ] **Step 3: 实现 API/Admin 模板定义**

  扩展 template create enum、workflow template service switch、Admin template 按钮与中文标签。模板的条件值读取实例 context 中的 `budget_status`，不得查询客户端传入的临时金额。

- [ ] **Step 4: 编写幂等 seed migration**

  对已开启供应商模块的租户：不存在 definition 时创建并发布 v1；存在自定义 active definition/version 时保持不变；存在同 key 无 published version 时只补默认 v1。新租户初始化所调用的公共 seed helper 同样创建该模板。migration 不把 `purchase_batch_workflow_enabled` 自动改为 true。

- [ ] **Step 5: 验证 GREEN**

  ```bash
  cd apps/api
  bun test src/schema/workflows.test.ts src/services/workflow-templates.test.ts \
    src/services/supplier-purchase-batch-workflow-template-migration-contract.test.ts
  cd ../admin
  bun test components/workflows/workflow-display-labels.test.ts
  pnpm run check
  ```

- [ ] **Step 6: 提交模板**

  ```bash
  git add supabase/migrations/20260830112000_seed_supplier_purchase_batch_workflow.sql \
    apps/api/src/schema/workflows.ts apps/api/src/schema/workflows.test.ts \
    apps/api/src/services/workflow-templates.ts apps/api/src/services/workflow-templates.test.ts \
    apps/api/src/services/supplier-purchase-batch-workflow-template-migration-contract.test.ts \
    apps/admin/components/workflows/workflow-types.ts \
    apps/admin/components/workflows/workflow-template-actions.tsx \
    apps/admin/components/workflows/workflow-display-labels.ts \
    apps/admin/components/workflows/workflow-display-labels.test.ts
  git commit -m "feat(workflow): 增加采购批次审批模板"
  ```

## Task 5：原子化“提交批次并启动审批”

**Files:**

- Create: `supabase/migrations/20260830113000_create_supplier_purchase_batch_workflow_submit.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-submit-migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/repositories/supplier-purchase-batch-workflow.ts`
- Create: `apps/api/src/repositories/supplier-purchase-batch-workflow.test.ts`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-runtime.ts`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-runtime.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts`

- [ ] **Step 1: 写失败的 SQL 原子性契约测试**

  新 RPC 名称固定为 `submit_supplier_purchase_batch_with_workflow`。测试函数按以下顺序执行：幂等 replay 与 payload fingerprint 校验；锁 tenant settings/batch；校验 flag、版本、状态、项目范围输入；解析 active default/custom definition；确认当前 context 可达的每个审批节点都有实际候选审批人（额度内验证采购节点，超预算同时验证采购和财务节点）；调用现有 `submit_supplier_purchase_batch`；`approval_round + 1`；调用 `start_workflow_instance`；把 `batch_id/batch_version/approval_round/budget_status/project_id/submitted_by_employee_id` 写入 context；原子 upsert `workflow_subject_states`；记录审计；返回 `batch/workflow_state/requisition_ids/version/idempotent`。

- [ ] **Step 2: 运行 migration test 确认 RED**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-workflow-submit-migration-contract.test.ts
  ```

- [ ] **Step 3: 编写 submit migration**

  RPC 必须是 `SECURITY DEFINER SET search_path = public, pg_temp`，仅 `service_role` 可执行。若模板、审批人或运行实例冲突，返回稳定状态并由 repository 映射成：

  - `SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING`
  - `SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT`
  - `SUPPLIER_PURCHASE_BATCH_NO_APPROVER`
  - `SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT`

  任何 start 失败必须回滚现有 submit 所创建的 requisitions 和预算占用。

- [ ] **Step 4: 先写 repository/service 失败测试**

  覆盖 flag=false 继续调用现有 `submit_supplier_purchase_batch`；flag=true 只调用新 workflow RPC；重复相同 Idempotency-Key 返回 replay；同 key 不同 payload 返回 409；缺审批人不降级到固定 review。

- [ ] **Step 5: 实现 repository/runtime/service 路由选择**

  `supplier-purchase-batch-workflow-runtime.ts` 只负责开关判定、定义解析与运行态 DTO，不直接访问 Supabase；所有数据库调用放在新 repository。`supplier-purchase-batches.ts` service 保持权限、项目范围、幂等 header 和错误包装边界。

- [ ] **Step 6: 运行 GREEN**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-workflow-submit-migration-contract.test.ts \
    src/repositories/supplier-purchase-batch-workflow.test.ts \
    src/services/supplier-purchase-batch-workflow-runtime.test.ts \
    src/services/supplier-purchase-batches.test.ts
  bun run typecheck
  ```

  在本地应用 submit migration 后重新运行 `supabase gen types typescript --local > src/types/database.ts`，再执行 typecheck；不得手写新 RPC 类型。

- [ ] **Step 7: 提交原子提交链路**

  ```bash
  git add supabase/migrations/20260830113000_create_supplier_purchase_batch_workflow_submit.sql \
    apps/api/src/repositories/supplier-purchase-batch-workflow.ts \
    apps/api/src/repositories/supplier-purchase-batch-workflow.test.ts \
    apps/api/src/repositories/supplier-purchase-batches.ts \
    apps/api/src/services/supplier-purchase-batch-workflow-runtime.ts \
    apps/api/src/services/supplier-purchase-batch-workflow-runtime.test.ts \
    apps/api/src/services/supplier-purchase-batch-workflow-submit-migration-contract.test.ts \
    apps/api/src/services/supplier-purchase-batches.ts apps/api/src/services/supplier-purchase-batches.test.ts \
    apps/api/src/types/database.ts
  git commit -m "feat(supplier): 提交采购批次时启动审批流程"
  ```

## Task 6：向批次列表与详情投影 Workflow 状态和动作

**Files:**

- Modify: `apps/api/src/repositories/supplier-purchase-batch-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batch-access.ts`
- Modify: `apps/api/src/services/supplier-purchase-batch-access.test.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`

- [ ] **Step 1: 写失败的投影和权限测试**

  flag=true 时列表返回紧凑 `workflow_state`（`instance_id, instance_status, current_node_key, current_node_title, pending_task_count, actions`），详情再返回完整 `timeline_nodes`；顶层 `actions` 增加 `can_withdraw`。断言：

  - `rejected` 与 `draft` 对有编辑权限的申请人 `can_edit=true`。
  - `pending_approval` 只有提交人且流程允许撤回时 `can_withdraw=true`。
  - workflow 开启时 `can_review` 不再由固定权限直接计算，而由 workflow task/action 得出。
  - 无项目数据范围、非 assignee、自审限制不因 projection 绕过。

- [ ] **Step 2: 实现批量查询，禁止 N+1**

  列表先分页采购批次，再用本页最多 100 个 batch id 批量查询 `workflow_subject_states` 和当前员工可处理的 pending tasks；只选择投影所需字段并将两个 map 注入 serializer。详情可复用现有 subject state/timeline service 读取完整节点。不得在每一条 batch 上调用 workflow repository。

- [ ] **Step 3: 运行 GREEN**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-access.test.ts \
    src/services/supplier-purchase-batches.test.ts \
    src/controllers/supplier-purchase-batches/routes.test.ts
  ```

- [ ] **Step 4: 提交读取契约**

  ```bash
  git add apps/api/src/repositories/supplier-purchase-batch-records.ts \
    apps/api/src/repositories/supplier-purchase-batches.ts \
    apps/api/src/services/supplier-purchase-batch-access.ts \
    apps/api/src/services/supplier-purchase-batch-access.test.ts \
    apps/api/src/services/supplier-purchase-batches.ts \
    apps/api/src/services/supplier-purchase-batches.test.ts \
    apps/api/src/controllers/supplier-purchase-batches/routes.test.ts
  git commit -m "feat(supplier): 返回采购批次审批状态"
  ```

## Task 7：让统一任务中心识别采购审批

**Files:**

- Create: `apps/api/src/services/workflow-task-supplier-purchase-batch-action-metadata.ts`
- Create: `apps/api/src/services/workflow-task-supplier-purchase-batch-action-metadata.test.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.test.ts`
- Modify: `apps/api/src/services/workflow-task-card-context-types.ts`
- Modify: `apps/api/src/services/workflow-task-card-context.ts`
- Modify: `apps/api/src/services/workflow-task-card-context.test.ts`
- Modify: `apps/api/src/repositories/workflow-task-card-context.ts`
- Create: `apps/api/src/repositories/workflow-task-card-context.test.ts`

- [ ] **Step 1: 写失败的动作 metadata 测试**

  `supplier_purchase_batch` 的 `purchase_review` 和 `finance_review` 均返回：

  - `approve`: label `审批通过`，`business_domain: supplier_purchase_batch`，reason 可选。
  - `reject`: label `驳回修改`，同一 business domain，reason 必填。

  非 pending、非当前 assignee 或权限不足时 actions 为空/disabled，复用现有 assignee access 结果。

- [ ] **Step 2: 写失败的 card context 测试**

  新增 todo type `supplier_purchase_batch`；卡片包含批次号、项目名、总额、商品数、供应商数、申请人、提交时间和 `target_url=/packageProcurement/pages/batch-review/index?id=<batchId>&workflowTaskId=<taskId>`。同一页多条任务只发一次批次摘要查询和已有项目/员工批量查询。

- [ ] **Step 3: 实现 action builder 与批量 card context repository**

  repository `.in("id", batchIds).eq("tenant_id", tenantId).limit(100)`，只选 `id,batch_no,project_id,total_amount,item_count,supplier_count,submitted_by_employee_id,updated_at` 及现有安全关系字段；若关系不可用则分两次批量查询，禁止 PostgREST 猜 join hint。

- [ ] **Step 4: 运行 GREEN**

  ```bash
  cd apps/api
  bun test src/services/workflow-task-supplier-purchase-batch-action-metadata.test.ts \
    src/services/workflow-task-action-metadata.test.ts \
    src/services/workflow-task-card-context.test.ts \
    src/repositories/workflow-task-card-context.test.ts
  ```

- [ ] **Step 5: 提交统一待办读取**

  ```bash
  git add apps/api/src/services/workflow-task-supplier-purchase-batch-action-metadata.ts \
    apps/api/src/services/workflow-task-supplier-purchase-batch-action-metadata.test.ts \
    apps/api/src/services/workflow-task-action-metadata.ts \
    apps/api/src/services/workflow-task-action-metadata.test.ts \
    apps/api/src/services/workflow-task-card-context-types.ts \
    apps/api/src/services/workflow-task-card-context.ts \
    apps/api/src/services/workflow-task-card-context.test.ts \
    apps/api/src/repositories/workflow-task-card-context.ts \
    apps/api/src/repositories/workflow-task-card-context.test.ts
  git commit -m "feat(workflow): 展示采购批次审批待办"
  ```

## Task 8：原子完成采购/财务审批任务

**Files:**

- Create: `supabase/migrations/20260830114000_create_supplier_purchase_batch_workflow_review.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-review-migration-contract.test.ts`
- Create: `apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.ts`
- Create: `apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batch-workflow.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batch-workflow.test.ts`
- Modify: `apps/api/src/services/workflow-tasks.ts`
- Modify: `apps/api/src/services/workflow-tasks.test.ts`
- Modify: `apps/api/src/controllers/workflow-tasks/index.ts`
- Create: `apps/api/src/controllers/workflow-tasks/routes.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 写失败的审批 RPC 契约测试**

  RPC 名称固定为 `complete_supplier_purchase_batch_workflow_task`。测试锁顺序稳定为 instance -> task -> batch -> budget commitments -> child requisitions -> purchase orders；重新校验 tenant、task pending、assignee、权限、project scope、batch version、approval round 和当前 node。分支必须为：

  - `purchase_review + approve + within_budget`: 调现有 `review_supplier_purchase_batch(approve)`，完成 workflow，批次 `ordered`。
  - `purchase_review + approve + over_budget`: 只完成当前 workflow node 并生成 finance task，批次仍 `pending_approval`，不得生成采购单。
  - `finance_review + approve`: 调现有 final review，完成 workflow，批次 `ordered`。
  - 任一 review node `reject`: 调现有 review reject 释放预算，完成 rejected end，批次 `rejected`。
  - 现有 review 返回 `revision_required`: 批次回 `draft`、释放预算、task/instance canceled、subject state 同步，并透传既有 `*_CHANGED` 错误详情。

- [ ] **Step 2: 写失败的 bridge/controller 测试**

  supplier task 必须进入新 bridge，其他 task 保持现有 customer/project/payment/expense/generic 分支。`POST /workflow-tasks/:id/complete` 对采购任务要求 `Idempotency-Key`；相同 task/action/reason/output/key replay，payload 不同返回 conflict。拒绝缺 reason 返回 400。

- [ ] **Step 3: 实现审批 migration**

  action 只接受 `approve/reject`。幂等记录必须先查再变更，fingerprint 包含 task id、action、规范化 reason/output、当前 approval round。完成每个分支后在同一事务 upsert `workflow_subject_states` 并写采购 command event 与 workflow event。最终 approve 复用现有采购订单生成逻辑，不复制拆单 SQL。

- [ ] **Step 4: 实现 workflow bridge**

  bridge 将通用 complete input 与 header key 转换为 repository RPC 参数；service 仍先做用户可见的访问错误，但数据库 RPC 是最终并发/权限防线。错误必须经 `Errors.business`/`Errors.dbError` 包装，禁止 `throw new Error()`。

- [ ] **Step 5: 运行 GREEN**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-workflow-review-migration-contract.test.ts \
    src/repositories/supplier-purchase-batch-workflow.test.ts \
    src/services/workflow-task-supplier-purchase-batch-bridge.test.ts \
    src/services/workflow-tasks.test.ts \
    src/controllers/workflow-tasks/routes.test.ts
  bun run typecheck
  ```

  在本地应用 review migration 后重新生成 `apps/api/src/types/database.ts`，确认 complete RPC 的参数和返回类型来自真实数据库。

- [ ] **Step 6: 提交审批推进链路**

  ```bash
  git add supabase/migrations/20260830114000_create_supplier_purchase_batch_workflow_review.sql \
    apps/api/src/services/supplier-purchase-batch-workflow-review-migration-contract.test.ts \
    apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.ts \
    apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.test.ts \
    apps/api/src/repositories/supplier-purchase-batch-workflow.ts \
    apps/api/src/repositories/supplier-purchase-batch-workflow.test.ts \
    apps/api/src/services/workflow-tasks.ts apps/api/src/services/workflow-tasks.test.ts \
    apps/api/src/controllers/workflow-tasks/index.ts apps/api/src/controllers/workflow-tasks/routes.test.ts \
    apps/api/src/types/database.ts
  git commit -m "feat(workflow): 原子处理采购批次审批任务"
  ```

## Task 9：实现撤回、驳回后编辑和重新提交新轮次

**Files:**

- Create: `supabase/migrations/20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-workflow-withdraw-migration-contract.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batch-workflow.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batch-workflow.test.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-batches/index.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/tenant-service-capability-map.test.ts`
- Modify: `apps/api/src/services/tenant-service-route-inventory.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 写失败的撤回 migration 测试**

  `withdraw_supplier_purchase_batch_workflow` 必须：先 replay；按稳定顺序锁 running instance/task/batch/commitments；只允许同时具备 `supplier.purchase-requisition.manage`、项目更新数据范围且为提交人的员工撤回 `pending_approval`；进入 `finance_review` 后 reason 必填；取消 pending tasks/instance；释放预算占用；批次回 `draft` 且 version+1；保留 items、child requisitions、split snapshot 与 timeline；同步 subject state；记录 `withdraw` command event。`ordered/cancelled/rejected/draft` 返回 `SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED`。

- [ ] **Step 2: 写失败的业务状态测试**

  覆盖：

  - `POST /supplier-purchase-batches/:id/withdraw` 使用 Idempotency-Key 和 expected_version。
  - rejected 可以保存；第一次保存后状态为 draft，原审批时间线仍可查。
  - draft/rejected 可以 cancel；pending 只能 withdraw；ordered 不可 withdraw。
  - 重新 submit 时 `approval_round` 增加，并创建新 instance；旧 task 无法推进且返回 `SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE`。

- [ ] **Step 3: 实现 migration、repository、service、controller**

  controller 只做 header/params/body 解析并调用 service。service 校验提交人和项目范围，repository 只调用 RPC。保存 rejected 时由现有 save RPC 的前向 migration 明确允许 `rejected -> draft`，不得在 TypeScript 中伪造状态。

- [ ] **Step 4: 更新 route capability 全量分类测试**

  新 withdraw 路由沿用 `supplier-purchase-batches` 顶层 `excluded/not_trial_capability` 分类；workflow task complete 保持 `core.workflows`。测试完整 controller inventory，确保没有 `TENANT_SERVICE_ROUTE_CAPABILITY_UNMAPPED` 回归。

- [ ] **Step 5: 运行 GREEN**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batch-workflow-withdraw-migration-contract.test.ts \
    src/repositories/supplier-purchase-batch-workflow.test.ts \
    src/services/supplier-purchase-batches.test.ts \
    src/controllers/supplier-purchase-batches/routes.test.ts \
    src/services/tenant-service-capability-map.test.ts \
    src/services/tenant-service-route-inventory.test.ts
  ```

  在本地应用 withdraw migration 后重新生成 `apps/api/src/types/database.ts`，再运行 API typecheck。

- [ ] **Step 6: 提交撤回与新轮次**

  ```bash
  git add supabase/migrations/20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql \
    apps/api/src/services/supplier-purchase-batch-workflow-withdraw-migration-contract.test.ts \
    apps/api/src/repositories/supplier-purchase-batch-workflow.ts \
    apps/api/src/repositories/supplier-purchase-batch-workflow.test.ts \
    apps/api/src/services/supplier-purchase-batches.ts apps/api/src/services/supplier-purchase-batches.test.ts \
    apps/api/src/controllers/supplier-purchase-batches/index.ts \
    apps/api/src/controllers/supplier-purchase-batches/routes.test.ts \
    apps/api/src/schema/supplier-purchase-batches.ts \
    apps/api/src/services/tenant-service-capability-map.test.ts \
    apps/api/src/services/tenant-service-route-inventory.test.ts \
    apps/api/src/types/database.ts
  git commit -m "feat(supplier): 支持撤回和重提采购审批"
  ```

## Task 10：保留旧 review 的受控兼容桥

**Files:**

- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`
- Modify: `apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.ts`
- Modify: `apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.test.ts`

- [ ] **Step 1: 写失败的兼容矩阵测试**

  - flag=false：`/review` 保持原固定审批行为。
  - flag=true：`/review` 必须解析当前 pending workflow task，并调用同一个 supplier workflow bridge；不能直接调用 `review_supplier_purchase_batch`。
  - flag=true 且没有唯一 running instance/task：返回 `SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING/CONFLICT`，不 fallback。
  - workflow task 和旧 review 并发只允许一个成功；另一请求得到幂等 replay 或 `WORKFLOW_TASK_NOT_PENDING`。

- [ ] **Step 2: 实现兼容路由选择**

  将旧请求 `{expected_version, action, remark}` 映射为 workflow complete `{action, reason: remark, output: {compat_source: "supplier_purchase_batch_review"}}`，沿用请求的 Idempotency-Key。响应仍适配旧 `ReviewedProcurementCommand`，以便 Orange 灰度期间不同时切断旧页面。

- [ ] **Step 3: 运行 GREEN**

  ```bash
  cd apps/api
  bun test src/services/supplier-purchase-batches.test.ts \
    src/services/workflow-task-supplier-purchase-batch-bridge.test.ts \
    src/controllers/supplier-purchase-batches/routes.test.ts
  ```

- [ ] **Step 4: 提交兼容桥**

  ```bash
  git add apps/api/src/services/supplier-purchase-batches.ts \
    apps/api/src/services/supplier-purchase-batches.test.ts \
    apps/api/src/controllers/supplier-purchase-batches/routes.test.ts \
    apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.ts \
    apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.test.ts
  git commit -m "refactor(supplier): 旧审批路由复用 workflow 桥"
  ```

## Task 11：补齐 Admin 显示、API 示例和 Orange 对接文档

**Files:**

- Modify: `apps/admin/components/workflows/workflow-runtime-panel.tsx`
- Modify: `apps/admin/components/workflows/workflow-display-labels.ts`
- Modify: `apps/admin/components/workflows/workflow-display-labels.test.ts`
- Create: `docs/miniprogram/2026-08-30-supplier-purchase-batch-workflow-handoff.md`

- [ ] **Step 1: 写失败的 Admin 显示测试**

  `supplier_purchase_batch` 显示“采购批次”，节点显示“采购审批/财务审批”，runtime panel 不回退成“业务对象”。仅补标签与模板管理兼容，不新建采购批次 Admin 工作台。

- [ ] **Step 2: 更新对接文档，给出最终契约**

  文档必须包含以下可复制请求：

  ```http
  GET /supplier-purchase-batches/:id
  GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=supplier_purchase_batch
  POST /workflow-tasks/:taskId/complete
  Idempotency-Key: <uuid>

  {"action":"approve","reason":null,"output":{}}
  ```

  ```http
  POST /supplier-purchase-batches/:id/withdraw
  Idempotency-Key: <uuid>

  {"expected_version":3,"reason":"采购计划调整"}
  ```

  同时列出 Orange 只读核对到的实际改动位置：

  - `src/types/api/supplier_procurement.d.ts`：增加 `workflow_state`、`can_withdraw`、withdraw/result 类型。
  - `src/types/api/workflow_task.d.ts`：增加明确 subject/todo/business domain 类型。
  - `src/services/supplier_procurement.ts`：增加 withdraw；旧 review 仅作灰度 fallback。
  - `src/services/workflow_task.ts`：`complete` 增加稳定 Idempotency-Key header。
  - `src/services/task_center.ts`：识别 `supplier_purchase_batch` 并跳转 review 页面。
  - `src/packageProcurement/pages/batch-detail/index.tsx`：按钮只读 `actions/workflow_state.actions`，支持撤回、驳回后编辑。
  - `src/packageProcurement/pages/batch-review/index.tsx`：接收 `workflowTaskId` 并调用统一 complete。

  文档还要说明 400/403/409/500 处理、幂等 key 生命周期、审批后刷新详情/订单/任务中心、近 7 天项目筛选契约不受影响，以及“新建商品一次填写商品+SKU+供货价后仍立即可采购，不进入审批”。

- [ ] **Step 3: 运行文档与 Admin 检查**

  ```bash
  cd apps/admin
  bun test components/workflows/workflow-display-labels.test.ts
  pnpm run check
  cd ../..
  rg -n "supplier_purchase_batch|Idempotency-Key|can_withdraw|workflowTaskId" \
    docs/miniprogram/2026-08-30-supplier-purchase-batch-workflow-handoff.md
  ```

- [ ] **Step 4: 提交 Admin 与交接文档**

  ```bash
  git add apps/admin/components/workflows/workflow-runtime-panel.tsx \
    apps/admin/components/workflows/workflow-display-labels.ts \
    apps/admin/components/workflows/workflow-display-labels.test.ts \
    docs/miniprogram/2026-08-30-supplier-purchase-batch-workflow-handoff.md
  git commit -m "docs(miniprogram): 交接采购批次审批流程"
  ```

## Task 12：增加数据库集成验收、性能检查和发布证据

**Files:**

- Create: `apps/api/src/services/supplier-purchase-batch-workflow-database.test.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-workflow-smoke.test.ts`
- Modify: `apps/api/package.json`
- Create: `docs/runbooks/supplier-purchase-batch-workflow-release.md`
- Create: `docs/operations/evidence/2026-08-30-supplier-purchase-batch-workflow-dev.md`

- [ ] **Step 1: 写数据库集成测试矩阵**

  使用现有 supplier rollout database helper/fixture 模式覆盖：

  1. 额度内：submit -> purchase approve -> 一供应商一单且订单 `submitted`。
  2. 超预算：purchase approve 不生成订单 -> finance approve 后生成订单。
  3. purchase/finance reject：批次 rejected、预算释放、无订单。
  4. withdraw：批次 draft、任务/实例 canceled、预算释放。
  5. rejected edit/resubmit：approval_round 增加、旧 task stale。
  6. 缺采购或财务审批人：提交前失败且无 requisition/预算/instance 残留。
  7. 并发/replay：同 key 相同 payload 一致，不同 payload conflict；双审批只有一次生成订单。
  8. tenant/project/assignee/self-review 越权均失败。

- [ ] **Step 2: 实现可重复 dev smoke 脚本**

  脚本只接受显式 `--tenant-id --project-id --applicant-employee-id --purchase-approver-id --finance-approver-id`，默认 dry-run；`--execute` 才创建带固定前缀的测试批次。输出 requestId、batchId、approvalRound、instance/task ids、budget state、order ids 和清理建议；不自动删除业务证据。

- [ ] **Step 3: 增加 package script 与脚本测试**

  在 `apps/api/package.json` 增加：

  ```json
  "supplier:purchase-batch-workflow:smoke": "bun src/scripts/supplier-purchase-batch-workflow-smoke.ts"
  ```

  测试参数缺失、dry-run 无写入、分页 pageSize<=100、错误包装和脱敏输出。

- [ ] **Step 4: 检查查询性能**

  在本地/授权 dev 数据库对以下查询运行 `EXPLAIN (ANALYZE, BUFFERS)`：running instance lookup、pending task lookup、subject state batch lookup。计划应命中本轮索引且无大表顺序扫描；将脱敏计划摘要写入 evidence。不得为通过检查引入 Redis/缓存。

- [ ] **Step 5: 编写发布 runbook**

  固定顺序：确认 main commit -> `supabase db push --dry-run` -> 应用 6 个 migration -> `supabase migration list` Local/Remote 对齐 -> 发布 API/Admin -> flag=false smoke -> 为内部 dev tenant 创建/确认默认模板和审批人 -> 开启 `purchase_batch_workflow_enabled` -> 运行全矩阵 -> 通知 Orange 真机验收。回滚采用前向 migration 修正，紧急止血先关闭新提交开关，不删除 workflow 历史和已生成采购单。

- [ ] **Step 6: 运行 focused database/smoke tests**

  ```bash
  cd apps/api
  bun --env-file=.env test src/services/supplier-purchase-batch-workflow-database.test.ts \
    src/scripts/supplier-purchase-batch-workflow-smoke.test.ts
  bun run supplier:purchase-batch-workflow:smoke -- \
    --tenant-id <DEV_TENANT_ID> \
    --project-id <DEV_PROJECT_ID> \
    --applicant-employee-id <DEV_APPLICANT_ID> \
    --purchase-approver-id <DEV_PURCHASE_APPROVER_ID> \
    --finance-approver-id <DEV_FINANCE_APPROVER_ID>
  ```

  Expected: test PASS；未加 `--execute` 的 smoke 明确输出 dry-run 且无写入。

- [ ] **Step 7: 提交验收工具**

  ```bash
  git add apps/api/src/services/supplier-purchase-batch-workflow-database.test.ts \
    apps/api/src/scripts/supplier-purchase-batch-workflow-smoke.ts \
    apps/api/src/scripts/supplier-purchase-batch-workflow-smoke.test.ts \
    apps/api/package.json docs/runbooks/supplier-purchase-batch-workflow-release.md \
    docs/operations/evidence/2026-08-30-supplier-purchase-batch-workflow-dev.md
  git commit -m "test(supplier): 增加采购审批发布验收"
  ```

## Task 13：全量验证、代码审查与 main/dev 发布门禁

**Files:**

- Modify only if verification exposes a root-cause defect; do not perform unrelated cleanup.

- [ ] **Step 1: 运行静态和 focused 验证**

  ```bash
  bun run api:check
  bun run admin:check
  bun run check:file-size
  bun run test
  git diff --check origin/main...HEAD
  ```

  Expected: 全部 exit 0；稳定测试基线不低于计划开始时的 release-contracts/domain/api-route-capabilities/web 全绿结果。

- [ ] **Step 2: 运行迁移一致性验证**

  ```bash
  supabase db push --local --dry-run
  supabase migration list
  ```

  Expected: local 已应用本计划 migration；待发布目标清单与 runbook 完全一致。不得手工在远端执行 DDL/DML。

- [ ] **Step 3: 请求代码审查**

  使用 `requesting-code-review` 检查设计覆盖、SQL 锁顺序、幂等、权限、项目范围、N+1、错误码、旧 review 旁路和 Orange 契约。逐条验证反馈；若反馈技术上不成立，按 `receiving-code-review` 给出代码/测试证据，不盲改。

- [ ] **Step 4: 修复审查发现并重跑最小相关测试**

  每个缺陷先写复现测试再修复；只提交根因修复。完成后重跑 Step 1 和 Step 2。

- [ ] **Step 5: 最终提交与 clean check**

  ```bash
  git status --short
  git log --oneline origin/main..HEAD
  ```

  Expected: 工作区 clean；提交按任务拆分且没有 Orange 文件。

- [ ] **Step 6: 合入和发布前门禁**

  使用 `finishing-a-development-branch` 决定合并方式。只有用户明确授权后才能推送 main 和执行既定迁移/发布流程；发布前记录 main commit，发布后记录 dev API/Admin revision、`supabase migration list`、flag 状态和 smoke requestId。未完成 Orange 真机验收前不扩大租户灰度，也不删除 `/review` 兼容桥。

## 完成定义

- [ ] 额度内与超预算两条审批分支均在统一 workflow 中可见、可审批、可追溯。
- [ ] 最终审批按供应商拆单且自动提交，每个 supplier 只产生对应采购单，重复请求不重复建单。
- [ ] 驳回、撤回、修改、重提、旧轮次防并发和预算释放均有自动化证据。
- [ ] 缺审批人、权限越界、项目越界、自审、版本冲突与幂等冲突均返回稳定错误码。
- [ ] 列表分页、必要字段、批量投影、索引与 EXPLAIN 证据满足性能边界。
- [ ] tenant flag 默认关闭，迁移可追踪，Local/Remote 对齐，回滚为前向修复且不丢审批历史。
- [ ] Admin 能配置模板和灰度；Orange 获得完整契约但 Gooes 未修改 Orange 仓库。
- [ ] `bun run test`、API/Admin 检查、route capability 全量分类和 dev smoke 全绿。
