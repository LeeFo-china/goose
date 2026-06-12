# 状态机到 Workflow 彻底迁移方案

## 背景

方案制定时，系统已经具备新的 workflow 基础设施，包括流程定义、版本快照、节点/连线、运行实例、运行节点、待办任务和流转日志。与此同时，客户、项目、费用审批仍保留旧状态机写路径和旧读模型：

- 客户状态接口仍使用 `CustomerStatusActionConfig`、`resolveCustomerStatusTransition`、`customer_status_transition_logs`。
- 项目状态接口仍使用 `ProjectStatusActionConfig`、`resolveProjectStatusTransition`、`project_status_transition_logs`，排期开工还依赖 `schedule_project_construction_transition` RPC。
- 费用申请仍使用 `status`、`current_step`、`current_step_role`、`expense_request_approval_chains` 和 legacy workflow service。
- 任务中心、后台详情 bootstrap、小程序自助端接口仍读取旧状态字段或旧动作列表。

目标不是再做一层兼容，而是最终让系统只以 workflow runtime 作为状态流转事实来源，并清除旧状态机的表、列、RPC、索引、领域配置和 API 写路径。

## 当前执行状态

截至 2026-06-12，本方案已经按
`docs/state_machine_migrate/execution-plan.md` 分阶段执行到 Phase 6
远端预清理状态：

- 客户/项目旧 `status-actions`、`status-transition`、
  `status-transitions` API 路由已移除，后台正常流程改用
  workflow subject state、workflow timeline 和 workflow task complete。
- 任务中心、费用列表、费用详情、客户/项目相关 bootstrap 已切到
  `workflow_tasks` / `workflow_subject_states` 读路径。
- 费用申请不再读写旧 `expense_request_approval_chains`，也不再读写
  `expense_requests.current_step/current_step_role`；直接费用
  `submit/approve/reject/cancel/pay` 接口作为业务快捷入口保留，但内部
  使用 workflow task/subject state 推进流程。
- 回填脚本不再读取 `expense_requests.current_step`；费用 pending 节点由
  `expense_request_approvals` 审计记录推导。
- 本地 `workflow:cleanup-readiness` 已达到 `ready: true`、`0` 个 blocker。
- 目标 Supabase project `fclnkyatvfvmzgzdqlba` 已应用到
  `20260612124500_add_cancel_workflow_instance_rpc.sql`；迁移状态现在通过
  `workflow:migration-status` / `workflow:final-completion-audit` 直连
  `supabase_migrations.schema_migrations` 与本地 migration 文件比较确认。
- 目标库已补齐 `workflow_subject_states` projection：先 dry-run 发现
  `1` 条 customer、`20` 条 project projection 缺失，随后
  `workflow:subject-states-rebuild --apply` upsert `21` 条，远端
  `workflow:runtime-consistency-check` 已通过 `total_issues: 0`。
- `apps/api/src/types/database.ts` 已从目标 project 重新生成，包含
  `workflow_subject_states`、`workflow_tasks.assignee_permission_code` 和
  `cancel_workflow_instance`。
- 破坏性清理 migration 已准备：
  `supabase/migrations/20260612143000_drop_legacy_state_machine_objects.sql`。
- 已新增破坏性清理 preflight：
  `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight`。
  当前自动技术检查通过；没有
  `docs/state_machine_migrate/audit/manual-gates.json` 证据文件时会因
  小程序、admin smoke、备份窗口仍未确认而失败。证据文件模板见
  `docs/state_machine_migrate/audit/manual-gates.example.json`。其中小程序
  确认必须包含确认人、可解析的确认时间和最低可用版本，admin smoke 必须包含执行人
  和可解析的执行时间；各 evidence 字段必须是 `http(s)` URL 或
  `docs/state_machine_migrate/` 下已存在文件路径，不能只填写自由文本说明。
- 已新增破坏性清理后 verifier：
  `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-verify`。
  该命令只读检查旧表、旧 RPC、旧列、旧索引、旧 policy 是否已经不存在，
  并再次运行 workflow runtime 一致性检查；它应只在 destructive migration apply 后通过。
- 最终执行步骤和证据记录模板见
  `docs/state_machine_migrate/final-cleanup-runbook.md`。

仍未在本工作区完成的外部门禁：

- 破坏性 migration 尚未在目标 Supabase 环境 apply；当前仅剩
  `20260612133000_drop_schedule_project_construction_transition.sql` 和
  `20260612143000_drop_legacy_state_machine_objects.sql` 未上远端。
- 破坏性清理后还需再次重新生成 `apps/api/src/types/database.ts`，届时旧表、
  旧 RPC、旧列应从类型中消失。
- destructive migration apply 后必须运行
  `workflow:destructive-cleanup-verify`，确认旧状态机数据库对象全部消失且
  workflow runtime 仍一致。
- 小程序最低版本和 staging/admin/mini-program smoke 仍需外部验收确认。

注意：`customers.status`、`projects.status`、`expense_requests.status`
目前保留为业务状态字段。workflow runtime 已经负责可操作节点状态，
但删除这些业务状态列需要单独的数据产品决策和读模型验收。

## 目标

1. 所有客户、项目、费用审批状态推进统一通过 workflow runtime 完成。
2. 小程序和后台 API 在迁移期间不断链，旧接口先兼容返回，再逐步升级到 workflow 语义。
3. 历史状态流转和审批链数据完整迁移到 workflow runtime / workflow_transition_logs。
4. 破坏性清理通过 migration 完成，最终删除旧状态机表、列、RPC、索引和代码。
5. 迁移完成后，列表、详情、任务中心、小程序 bootstrap 都从 workflow 派生状态读取。

## 非目标

- 不修改 orange 小程序仓库。小程序端需要的改造只在本文列出接口契约，由小程序团队执行。
- 不手动改远端数据库。所有 DDL/DML 清理都必须落到 `supabase/migrations/`。
- 不删除历史迁移文件。旧 migration 保留，新建清理 migration 向前演进。

## 现状盘点

### 新 workflow 能力

已存在的核心表：

- `workflow_definitions`
- `workflow_versions`
- `workflow_nodes`
- `workflow_edges`
- `workflow_instances`
- `workflow_instance_nodes`
- `workflow_tasks`
- `workflow_transition_logs`

已存在的核心 RPC：

- `start_workflow_instance`
- `complete_workflow_instance_node`
- `replace_workflow_draft_graph`
- `publish_workflow_definition`
- `workflow_edge_condition_matches`

已存在 API：

- `GET /workflows`
- `POST /workflows`
- `GET /workflows/:id/graph`
- `PUT /workflows/:id/graph`
- `POST /workflows/:id/publish`
- `POST /workflows/:id/archive`
- `GET /workflows/:id/runtime/instances`
- `POST /workflows/:id/runtime/instances`
- `POST /workflows/:id/runtime/instances/:instanceId/complete-node`

### 旧状态机范围

基线审计时在代码和 migration 中发现的旧系统范围：

| 域 | 旧入口 | 旧存储/配置 | 迁移目标 |
| --- | --- | --- | --- |
| 客户 | `POST /customers/:id/status-transition` | `customers.status`、`customer_status_transition_logs`、domain customer status config | `workflow_instances(subject_type='customer')` + workflow task/action |
| 客户 | `GET /customers/:id/status-actions` | domain action list | 从当前 workflow node/task 派生可执行动作 |
| 客户 | `GET /customers/:id/status-transitions` | `customer_status_transition_logs` | 从 `workflow_transition_logs` 兼容输出 |
| 项目 | `POST /projects/:id/status-transition` | `projects.status`、domain project status config | `workflow_instances(subject_type='project')` |
| 项目 | 排期开工动作 | `schedule_project_construction_transition` RPC | workflow node completion + 项目字段补丁 |
| 项目 | `GET /projects/:id/status-actions` | domain action list | 从 workflow 派生 |
| 项目 | `GET /projects/:id/status-transitions` | `project_status_transition_logs` | 从 `workflow_transition_logs` 兼容输出 |
| 费用 | `submit/approve/reject/cancel/pay` | `expense_requests.status/current_step/current_step_role`、`expense_request_approval_chains` | `workflow_instances(subject_type='expense_request')` + `workflow_tasks` |
| 任务中心 | 费用审批 builder | `expense_request_approval_chains`、`current_step` | 统一查询 `workflow_tasks` |
| 一致性检查 | `status-machine-consistency-check.ts` | 旧状态字段规则 | workflow runtime consistency checker |

执行前还需要用 `pg_indexes`、`information_schema.columns` 和 `pg_proc` 做一次数据库实况复核，防止遗漏后续 migration 添加的状态索引或函数。

## 目标架构

### 状态事实来源

迁移完成后，业务对象不再通过本表 `status/current_step` 控制状态流转。状态事实来源改为：

- 当前流程：`workflow_instances.status/current_node_key/current_node_snapshot`
- 当前待办：`workflow_tasks`
- 历史轨迹：`workflow_instance_nodes` 和 `workflow_transition_logs`
- 分支条件：`workflow_edges.condition`
- 审批节点：`workflow_tasks.assignee_employee_id/assignee_role_code` + node config

业务表只保留业务事实字段，例如项目 `start_date`、`signed_amount`、工程负责人、费用实际付款信息等。展示状态需要通过 workflow 派生，或者通过新的只读投影视图读取。

### 推荐新增读模型

为避免列表页和小程序 bootstrap 做复杂 JOIN，建议在切写前新增只读投影视图或物化表：

- `workflow_subject_states`
  - `tenant_id`
  - `subject_type`
  - `subject_id`
  - `definition_id`
  - `instance_id`
  - `instance_status`
  - `current_node_key`
  - `current_node_title`
  - `current_business_kind`
  - `pending_task_count`
  - `updated_at`

如果采用表而非 view，需要通过 workflow runtime 写路径同步更新，并通过 migration 添加唯一索引：

```sql
CREATE UNIQUE INDEX idx_workflow_subject_states_subject
ON public.workflow_subject_states(tenant_id, subject_type, subject_id);
```

该读模型替代旧 `customers.status`、`projects.status`、`expense_requests.current_step` 在列表筛选、详情展示和小程序首页中的职责。

## API 升级方案

API 升级必须先于破坏性 DB 清理完成。否则小程序仍调用旧字段和旧动作时会直接失败。

### 分层策略

1. 旧接口保留路径，内部改为调用 workflow runtime。
2. 旧响应字段继续返回一段灰度期，但全部由 workflow 派生。
3. 新增 workflow 语义接口，供小程序和后台逐步切换。
4. 待小程序最低可用版本全部升级后，删除旧字段和旧接口。

### 兼容接口改造

| 旧接口 | 迁移期行为 | 最终状态 |
| --- | --- | --- |
| `GET /customers/:id/status-actions` | 从当前 customer workflow task 派生旧 action shape | 删除或标记 deprecated |
| `POST /customers/:id/status-transition` | 将 action 映射为 complete workflow node/task，返回旧 customer detail + `workflow_runtime` | 删除 |
| `GET /customers/:id/status-transitions` | 从 `workflow_transition_logs` 转成旧列表格式，保持分页 | 删除或改为 workflow timeline |
| `GET /projects/:id/status-actions` | 从 project workflow 派生 | 删除或标记 deprecated |
| `POST /projects/:id/status-transition` | 将 sign/schedule/pause/resume/acceptance 等动作映射为 workflow action | 删除 |
| `GET /projects/:id/status-transitions` | 从 workflow logs 兼容输出 | 删除或改为 workflow timeline |
| `POST /expense-requests/:id/submit` | 启动或推进费用审批 workflow | 可保留为业务快捷接口，但不得写旧状态机字段 |
| `POST /expense-requests/:id/approve` | 完成当前审批 task | 可保留为 workflow task action 包装 |
| `POST /expense-requests/:id/reject` | complete task with reject output，按边条件回退或结束 | 可保留 |
| `POST /expense-requests/:id/cancel` | cancel workflow instance + 业务取消 | 可保留 |
| `POST /expense-requests/:id/pay` | 完成 payment 节点 task | 可保留 |
| `GET /expense-requests/todo` | 查询 `workflow_tasks`，再聚合费用详情 | 改名到统一 task API |

### 新增 workflow API

建议补齐面向业务端和小程序端的 workflow API，避免小程序直接使用后台管理型 `/workflows/:id/runtime/*`：

| 接口 | 用途 |
| --- | --- |
| `GET /workflow-subjects/:subjectType/:subjectId/state` | 查询对象当前 workflow 状态、当前节点、可执行动作 |
| `GET /workflow-subjects/:subjectType/:subjectId/timeline` | 查询对象 workflow 时间线，分页 |
| `GET /workflow-tasks` | 查询当前员工/客户可处理待办，分页 |
| `POST /workflow-tasks/:taskId/complete` | 完成待办，支持 `action`、`output`、`reason` |
| `POST /workflow-subjects/:subjectType/:subjectId/cancel` | 取消对象流程实例 |

这些接口必须走现有 controller/service/repository 分层：

- controller 只读 request、校验 schema、调用 service、包装 `ResponseHandler.success`
- service 处理权限、业务校验、动作映射、事务边界
- repository 直接访问 Supabase/RPC
- 错误通过 `error-factory.ts` 包装

### 小程序契约

小程序端需要至少完成以下升级：

1. 首页/项目详情/客户详情不再强依赖 `status` 和 `status_actions` 控制按钮。
2. 优先读取 `workflow_runtime` 或新接口返回的 `workflow_state`：

```json
{
  "workflow_state": {
    "subject_type": "project",
    "subject_id": "uuid",
    "instance_id": "uuid",
    "instance_status": "running",
    "current_node_key": "construction_start",
    "current_node_title": "排期开工",
    "actions": [
      {
        "key": "complete",
        "label": "完成",
        "task_id": "uuid",
        "requires_reason": false
      }
    ]
  }
}
```

3. 旧字段在迁移期仍保留，但只作为展示 fallback：
   - `status`
   - `status_label`
   - `status_actions`
   - `current_step`
4. 费用审批、项目验收、施工节点按钮统一按 `workflow_state.actions` 渲染。
5. 小程序发版完成前，不执行最终删列 migration。

## 数据迁移方案

### Phase 0：冻结和审计

1. 冻结旧状态机新增需求，只允许修复线上 bug。
2. 生成数据库对象清单：

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
  );
```

3. 输出旧状态值到 workflow 节点的映射表，并让业务确认。
4. 在生产执行前备份数据库，并记录回滚窗口。

### Phase 1：补齐 workflow 模板

为以下主体发布 active workflow definition：

- `customer_main` 或 `sales_main`：线索、跟进、到店、设计、签约。
- `project_main`：签约、排期开工、施工中、暂停/恢复、竣工验收、结算。
- `expense_request_approval`：草稿、经理审批、财务审批、付款、完成、驳回、取消。
- 后续可扩展 `acceptance`、`procedure` 子流程，但本次迁移只覆盖替代旧状态机所需节点。

每个旧 action 必须有明确映射：

| 旧 action | 新 workflow 表达 |
| --- | --- |
| 客户跟进/到店/设计/签约 | complete 当前节点，进入下一业务节点 |
| 项目签约 | complete contract node，输出 `signed_amount` |
| 项目排期开工 | complete construction_start node，输出 `start_date`、`construction_manager_employee_id` |
| 项目暂停 | cancel 或进入 on_hold 分支节点 |
| 项目恢复 | complete on_hold node，回到暂停前节点 |
| 费用提交 | start expense workflow |
| 费用审批通过 | complete approval task with `decision=approved` |
| 费用驳回 | complete approval task with `decision=rejected` |
| 费用付款 | complete payment task |

### Phase 2：API 兼容层切写

1. 新增 workflow subject service，封装按 `subject_type + subject_id` 查找当前实例、任务和动作。
2. 改造客户/项目旧 status 接口，让旧 path 调用 workflow service。
3. 改造费用 submit/approve/reject/cancel/pay，让动作完成 workflow task。
4. 保留旧响应结构，但响应中新增 `workflow_runtime` 或 `workflow_state`。
5. 任务中心先并行支持旧费用审批链和 `workflow_tasks`，再切到只查 workflow。

此阶段可以短期双写旧日志，但必须以 workflow 写入成功为主事务；旧写入失败只能记录告警，不能影响 workflow 主链路。

### Phase 3：历史数据回填

回填必须幂等，建议新建一次性 migration 或受控脚本，按租户分批处理。

客户回填：

- 按 `customers.status` 映射到 workflow 当前节点。
- 为每个客户创建或复用 `workflow_instances(subject_type='customer')`。
- 根据 `customer_status_transition_logs` 回放 `workflow_transition_logs.context.legacy`。
- 对当前节点生成 pending task。

项目回填：

- 按 `projects.status` 映射到 project workflow 当前节点。
- 将签约金额、开工日期、暂停来源状态写入 instance context。
- 根据 `project_status_transition_logs` 回放 workflow timeline。
- 排期开工相关负责人写入节点 output 或 context。

费用回填：

- 按 `expense_requests.status` 和 `expense_request_approvals` 审计记录推导
  费用 workflow 当前节点；pending 状态下，最新轮次已有经理通过时进入
  `finance_review`，否则进入 `manager_review`。
- 旧 `expense_request_approval_chains` 不再作为运行时或回填输入。
- `manager_review`、`finance_review`、`payment` 分别对应 approval/payment 节点。
- 保留审批人、动作人、原因、时间到 `workflow_transition_logs.context.legacy`。

回填完成后必须执行数据对账：

```sql
-- 每个仍有效客户都应有客户 workflow 实例
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

```sql
-- pending 费用申请应都有对应 workflow task
SELECT count(*) AS missing_task_count
FROM public.expense_requests requests
LEFT JOIN public.workflow_instances wi
  ON wi.tenant_id = requests.tenant_id
 AND wi.subject_type = 'expense_request'
 AND wi.subject_id = requests.id::text
LEFT JOIN public.workflow_tasks task
  ON task.tenant_id = requests.tenant_id
 AND task.instance_id = wi.id
 AND task.status = 'pending'
WHERE requests.status IN ('pending', 'approved')
  AND task.id IS NULL;
```

### Phase 4：读路径切换

1. 客户列表、客户详情、客户 detail activity 从 workflow 派生状态和日志读取。
2. 项目列表、项目详情 bootstrap、施工阶段入口从 workflow 派生状态读取。
3. 费用列表、统计、todo 从 `workflow_tasks` 和 workflow subject state 读取。
4. 小程序 bootstrap/detail 增加 `workflow_state`，按钮按新 actions 渲染。
5. 后台 admin 面板去掉旧 status action 配置依赖。

切换后旧表只读保留一个发布周期，禁止再写。

### Phase 5：破坏性数据库清理

新增 migration，例如：

```text
supabase/migrations/YYYYMMDDHHMMSS_drop_legacy_state_machine.sql
```

候选清理清单如下，执行前必须以 Phase 0 的数据库对象清单复核。

删除旧 RPC：

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
```

删除旧表和随表索引/约束：

```sql
DROP TABLE IF EXISTS public.customer_status_transition_logs;
DROP TABLE IF EXISTS public.project_status_transition_logs;
DROP TABLE IF EXISTS public.expense_request_approval_chains;
```

删除旧列和相关索引/约束：

```sql
ALTER TABLE public.expense_requests
  DROP CONSTRAINT IF EXISTS expense_requests_current_step_check,
  DROP COLUMN IF EXISTS current_step,
  DROP COLUMN IF EXISTS current_step_role;

DROP INDEX IF EXISTS public.idx_expense_requests_current_step;
```

客户、项目、费用的 `status` 是否删除要按最终读模型确认：

- 如果 `workflow_subject_states` 已覆盖所有列表筛选和展示，删除 `customers.status`、`projects.status`、`expense_requests.status`。
- 如果还需要状态展示字段，必须改名或重建为 workflow projection，不能沿用旧状态机语义。

候选 SQL：

```sql
ALTER TABLE public.customers DROP COLUMN IF EXISTS status;
ALTER TABLE public.projects DROP COLUMN IF EXISTS status;
ALTER TABLE public.expense_requests DROP COLUMN IF EXISTS status;
```

此段必须在小程序和后台都不再读取旧字段后执行。

### Phase 6：代码清理

删除或重写以下代码区域：

- `packages/domain/src/customer.ts` 中旧客户状态 action/transition 配置。
- `packages/domain/src/project.ts` 中旧项目状态 action/transition 配置。
- `apps/api/src/services/customer-status.ts` 改为 workflow adapter 或删除。
- `apps/api/src/services/project-status.ts` 改为 workflow adapter 或删除。
- `apps/api/src/repositories/customer-status-transitions.ts` 删除。
- `apps/api/src/repositories/project-status-transitions.ts` 删除。
- `apps/api/src/services/expense-requests/legacy/workflow.ts` 删除。
- `apps/api/src/services/expense-requests/legacy/approval-chain.ts` 删除。
- `apps/api/src/repositories/expense-requests/legacy/approvals.ts` 删除。
- `apps/api/src/services/task-center/legacy/builders-expense.ts` 改为 workflow task builder。
- `apps/api/src/scripts/status-machine-consistency-check.ts` 替换为 workflow runtime consistency checker。
- `apps/api/src/types/database.ts` 重新生成，移除旧表/列/RPC 类型。

## 回滚方案

破坏性清理前：

- workflow 为主写，旧表只读或双写。
- 如新 workflow 出现阻塞，可临时把旧接口 adapter 切回旧 service。
- 回填脚本必须幂等，可重复执行修复缺失实例和任务。

破坏性清理后：

- 不能依赖普通反向 migration 恢复完整历史，因为旧表已删除。
- 执行前必须保留生产备份，并确认恢复耗时。
- 如需 SQL 级回滚，只能从 `workflow_transition_logs.context.legacy` 反向重建旧日志表和审批链，无法保证 100% 恢复旧业务列写时语义。
- 因此删表删列 migration 必须放在最后一个阶段，并要求小程序、后台、API smoke 全部通过。

## 验证清单

### 静态验证

```bash
bun run api:build
```

如涉及 admin：

```bash
pnpm --dir apps/admin check
```

### 数据库验证

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

必须确认 local/remote migration history 对齐。该脚本会读取
`SUPABASE_DB_DIRECT_URL` 或 `SUPABASE_DB_URL`，不要在文档或提交信息中输出
数据库连接串。最终清理脚本不会回退到 linked Supabase project；缺少显式
目标库 URL 时必须先补齐环境变量再继续。

`manual-gates.json` 里的 evidence 字段必须可追溯：使用 `http(s)` URL，
或使用 `docs/state_machine_migrate/` 下已存在的文件路径。自由文本说明会被
`workflow:destructive-cleanup-preflight` 判定为无效证据。

对 workflow task 高频查询执行 `EXPLAIN ANALYZE`，至少覆盖：

- 当前员工待办列表。
- 对象详情页 workflow state 查询。
- 小程序首页项目列表 workflow state 查询。

### API smoke

至少覆盖：

- 客户状态动作列表、状态推进、时间线分页。
- 项目签约、排期开工、暂停、恢复、验收流转。
- 费用提交、经理审批、财务审批、驳回、取消、付款。
- 任务中心列表和完成任务。
- 小程序 `customer/bootstrap`、项目详情、验收/工序相关接口。

### 数据对账

- 旧有效业务对象数 = workflow subject instance 数。
- 旧 pending 审批链数 = workflow pending task 数。
- 旧 transition log 数可追溯到 workflow transition log legacy context。
- 列表筛选结果在切换前后抽样一致。

## 实施顺序

1. 完成 Phase 0 审计清单和业务映射确认。
2. 发布 workflow 模板和缺失 runtime 能力。
3. 新增 workflow subject/task API。
4. 改造旧 API 为 workflow adapter。
5. 回填历史 workflow 实例、节点、任务和日志。
6. 切换后台、小程序、任务中心读路径。
7. 运行一个发布周期，只读保留旧表，观察告警。
8. 准备破坏性清理 migration。当前已完成：
   `20260612143000_drop_legacy_state_machine_objects.sql`。
9. 在目标环境完成 migration apply 后重新生成数据库类型。
10. 完成 smoke、migration list、数据对账和小程序合同测试。

## 关键风险

- 小程序旧版本仍读取 `status/current_step/status_actions` 时，提前删列会导致线上不可用。
- 费用审批链存在审批人、角色、金额阈值等业务细节，必须先完整映射到 workflow node config 和 task。
- 项目排期开工 RPC 同时更新项目字段、成员角色和日志，迁移时不能只替换状态字段。
- 删除 `customers.status/projects.status/expense_requests.status` 会影响列表筛选索引，必须提前用 workflow read model 补齐性能边界。
- workflow runtime 当前是单 current node 模型；如需要并行审批或并行工序，必须先扩展 runtime，再迁移对应流程。

## 决策点

执行前需要确认：

1. `status` 字段是否彻底删除，还是重建为 workflow 投影视图字段。
2. 旧客户/项目 status action 接口保留几个版本周期。
3. 小程序最低兼容版本和强更策略。
4. 费用审批是否需要支持并行审批、会签或加签。
5. workflow subject state 使用 view、materialized view 还是普通表。
