# Decoration Finance Phase 2 Receivables Implementation Plan

日期：2026-06-23

> 执行本计划前，先在独立 worktree `feat/finance-receivables-phase2` 中实施。数据库变更必须通过 `supabase/migrations/`，列表接口必须分页，所有 workflow 推进仍以后端 runtime/task 为唯一事实来源。

## 目标

第二阶段把项目收款从“记录已发生收款”升级为“管理应该收款”。核心结果是：

- 项目能看到合同金额、应收金额、已收金额、未收金额和逾期状态。
- 收款节点可关联应收计划，财务确认收款后自动核销应收计划。
- 管理者能在 Admin 查看逾期应收列表。
- 小程序继续只消费 workflow v2 的 `timeline_nodes`、`attributes`、`actions`，不本地推导财务规则。

## 当前基线

已在新 worktree 完成基线检查：

- 分支：`feat/finance-receivables-phase2`
- worktree：`.worktrees/finance-phase2-receivables`
- 基准提交：`53803fb fix(projects): 修复交房项目列表状态`
- `pnpm install --frozen-lockfile`：通过
- `pnpm run api:check`：通过
- `pnpm run admin:check`：通过
- `supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"`：Local/Remote 已对齐到 `20260623143000`

## 当前实现事实

### 已有收款事实

- `payments` 是项目实收事实表。
- `PaymentService` 负责 `/payments` CRUD，当前创建收款仍要求项目访问权限。
- `PaymentRepository.findProjectSignedAmount(projectId)` 已能读取 `projects.signed_amount`。
- `workflow-task-payment-bridge` 当前链路是：
  1. 根据 `workflow_task_id` 查找既有 payment。
  2. 不存在时创建 `payments.status = confirmed`。
  3. 写入 `finance_ledger_entries`。
  4. 完成 workflow runtime node。
  5. 同步 workflow subject state。
- `finance_ledger_entries` 已有幂等写入能力，按 `tenant_id + source_type + source_id + entry_type` 唯一。

### 已有 workflow 财务节点

- `payment_collection` 节点已有配置：
  - `payment_type`
  - `requirement_mode`
  - `required_percentage`
  - `min_amount`
  - `finance_reviewer_employee_id`
  - `block_message`
- Admin 模板配置页已有收款类型、收款要求、比例规则和财务负责人配置。
- workflow v2 timeline 已会把 `payment_type`、`finance_reviewer_employee_id`、`finance_reviewer_employee_name`、确认人等信息下发给前端。

### 已有 Admin 财务入口

- 当前 Admin 财务模块只有 `/finance/ledger`。
- `FinanceController` 目前只有 `GET /finance/ledger`。
- `finance-requests.ts` 只封装台账列表请求。

## 产品决策

1. 第二阶段先使用 `projects.signed_amount` 作为合同金额来源，不引入合同主表。
2. 应收计划是财务事实表，不从 workflow 历史临时计算。
3. 实收继续落 `payments`，台账继续落 `finance_ledger_entries`。
4. 核销关系单独落表，不把多计划核销明细塞进 `payments.metadata`。
5. 逾期天数在查询时按租户当前日期派生，不建议长期存储；如后续有性能压力，再加快照或物化统计。
6. 已运行实例不强制 retroactive 生效新配置。对历史项目可提供受控生成或补建计划脚本，不能静默改变已运行 workflow 行为。
7. 没有应收计划的旧 payment collection 节点继续保持一期行为；只有节点配置启用应收计划或存在绑定计划时，才执行二阶段计划校验。

## 数据模型

### `project_receivable_plans`

建议新增应收计划表：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `tenant_id` | 租户 ID |
| `project_id` | 项目 ID |
| `workflow_instance_id` | 可选，来源 workflow instance |
| `workflow_node_key` | 可选，来源节点 key |
| `source_type` | `workflow_node`、`manual`、`migration`、`add_on` |
| `source_id` | 来源 ID，workflow 来源可用 task/node run/idempotency key |
| `payment_type` | `deposit`、`stage_1`、`stage_2`、`stage_3`、`add_on` |
| `title` | 应收计划标题 |
| `amount` | 应收金额，`numeric(12,2)` |
| `due_date` | 应收日期 |
| `paid_amount` | 已核销金额，`numeric(12,2)`，默认 0 |
| `status` | `pending`、`partially_paid`、`paid`、`overdue`、`canceled` |
| `created_by` | 创建人，可为空 |
| `metadata` | 节点配置、生成来源、备注等 |
| `created_at` / `updated_at` | 审计时间 |

约束和索引：

- `amount > 0`
- `paid_amount >= 0`
- `paid_amount <= amount`
- `status in (...)`
- `metadata` 必须是 object
- 唯一幂等索引：`tenant_id, source_type, source_id, payment_type`，其中 `source_id` 非空时生效。
- 查询索引：
  - `tenant_id, status, due_date`
  - `project_id, due_date`
  - `tenant_id, payment_type, due_date`

### `project_receivable_allocations`

建议新增实收核销明细表：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `tenant_id` | 租户 ID |
| `project_id` | 项目 ID |
| `receivable_plan_id` | 应收计划 ID |
| `payment_id` | 实收记录 ID |
| `amount` | 本次核销金额 |
| `allocated_by` | 核销人 |
| `allocated_at` | 核销时间 |
| `source_type` | `workflow_task`、`manual`、`wechat_pay_callback` |
| `source_id` | 来源 ID |
| `metadata` | 备注和上下文 |

约束和索引：

- `amount > 0`
- 唯一幂等索引：`tenant_id, source_type, source_id, receivable_plan_id`
- 查询索引：
  - `receivable_plan_id`
  - `payment_id`
  - `tenant_id, allocated_at desc`

## 后端 API

### 新增 schema/repository/service

建议新增：

- `apps/api/src/schema/finance-receivables.ts`
- `apps/api/src/repositories/project-receivable-plans.ts`
- `apps/api/src/repositories/project-receivable-allocations.ts`
- `apps/api/src/services/project-receivables.ts`

service 职责：

- 生成应收计划。
- 查询应收计划列表。
- 查询项目应收摘要。
- 将 confirmed payment 核销到应收计划。
- 根据 paid amount 计算计划状态。
- 派生 overdue days。

repository 职责：

- 只访问 Supabase。
- 列表必须 `.range(from, to)`。
- 查询字段必须限定，不使用 `select("*")`。
- 复杂统计优先服务层组合，不引入缓存或新依赖。

### `GET /finance/receivables`

分页查询应收计划，供 Admin 使用。

Query：

- `page=1`
- `pageSize=20`
- `project_id`
- `status`
- `payment_type`
- `due_date_from`
- `due_date_to`
- `overdue_only=true|false`

返回：

```json
{
  "list": [
    {
      "id": "receivable-id",
      "project_id": "project-id",
      "project": {
        "id": "project-id",
        "name": "张三项目",
        "status": "constructing"
      },
      "payment_type": "stage_2",
      "title": "中期进度款",
      "amount": 10000,
      "paid_amount": 3000,
      "remaining_amount": 7000,
      "due_date": "2026-06-30",
      "status": "overdue",
      "overdue_days": 3,
      "workflow_instance_id": "instance-id",
      "workflow_node_key": "payment_stage_2"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

权限：

- `finance.receivable.view`，或阶段内复用 `finance.view`。

建议二阶段新增权限码：

- `finance.receivable.view`
- `finance.receivable.manage`

### `GET /projects/:projectId/receivables`

分页或受限列表查询项目应收计划。项目详情可以用它展示项目回款进度。

要求：

- 默认 `page=1&pageSize=20`。
- 如果项目应收计划总数业务上确定不超过 50，也必须在代码注释说明豁免理由；建议仍分页，保持一致。
- 权限至少要求项目可读或财务可读。

### 项目详情摘要

二阶段需要项目详情可拿到应收摘要，建议在现有详情 bootstrap 中增加：

```json
{
  "finance_receivable_summary": {
    "contract_amount": 100000,
    "receivable_amount": 60000,
    "paid_amount": 45000,
    "remaining_amount": 15000,
    "overdue_amount": 5000,
    "overdue_count": 1
  }
}
```

小程序可只展示摘要，不需要本地计算逾期。

## workflow 集成

### 节点配置扩展

在 `payment_collection` 节点配置中新增应收计划配置：

```json
{
  "receivable_plan_enabled": true,
  "receivable_amount_mode": "signed_amount_percentage",
  "receivable_fixed_amount": null,
  "receivable_percentage": 30,
  "receivable_due_offset_days": 0,
  "receivable_due_date_rule": "node_entered_at",
  "receivable_title": "中期进度款"
}
```

字段含义：

- `receivable_plan_enabled`：是否为该节点生成或绑定应收计划。
- `receivable_amount_mode`：`fixed_amount` 或 `signed_amount_percentage`。
- `receivable_fixed_amount`：固定应收金额。
- `receivable_percentage`：按 `projects.signed_amount` 的百分比计算。
- `receivable_due_offset_days`：基于触发日偏移的应收日期。
- `receivable_due_date_rule`：二阶段先支持 `node_entered_at`，以后可扩展到 `project_start_date`、`procedure_completed_at`。
- `receivable_title`：默认使用节点标题。

发布校验：

- 开启 `receivable_plan_enabled` 时，必须选择合法金额模式。
- 固定金额必须大于 0。
- 百分比必须大于 0 且不超过 100。
- 百分比模式要求项目签约金额存在；运行时不存在则阻断并返回明确错误。

### 计划生成时机

二阶段建议优先在进入 `payment_collection` 节点时生成应收计划，而不是在前一节点完成时提前生成。

理由：

- 更容易保证和当前 workflow instance/node 一一对应。
- 老实例可以在进入节点后按当前已发布快照生成计划，不需要回写历史节点。
- 小程序和 Admin 在当前节点立即能看到应收金额、欠款和财务确认动作。

生成逻辑：

1. workflow runtime 进入 payment collection 节点。
2. 后端读取节点 snapshot 的应收配置。
3. 若 `receivable_plan_enabled=true`，调用 receivable service 幂等创建计划。
4. timeline node attributes 和 task actions 返回 receivable 摘要。

### 收款完成时核销

`workflow-task-payment-bridge` 在创建或复用 confirmed payment 后，调用 receivable service：

1. 查找当前 task/node 绑定的应收计划。
2. 如果有计划，按本次 payment amount 核销。
3. 更新计划 `paid_amount` 和 `status`。
4. 校验当前节点的放行条件：
   - `requirement_mode=any_confirmed`：只要本次或累计已收大于 0 可放行。
   - `requirement_mode=signed_amount_percentage`：累计已收达到签约金额比例可放行。
   - 开启 receivable plan 后，优先按 plan 的 `paid_amount / amount` 判断是否完成。
5. 写台账仍保持幂等，不重复入账。
6. 完成 workflow runtime node。

失败规则：

- payment 创建失败：task 保持 pending。
- payment 已创建但核销失败：重试时复用 payment，不重复创建。
- payment 和核销已完成但 workflow complete 失败：重试时复用 payment 和 allocation，不重复核销。
- 应收计划金额未满足放行规则：返回 409，task 保持 pending，并返回差额信息。

### workflow v2 下发字段

payment collection timeline node 的 `attributes` 建议增加：

```json
{
  "receivable_plan_id": "plan-id",
  "receivable_title": "中期进度款",
  "receivable_amount": 10000,
  "receivable_paid_amount": 3000,
  "receivable_remaining_amount": 7000,
  "receivable_due_date": "2026-06-30",
  "receivable_status": "partially_paid",
  "receivable_overdue_days": 0
}
```

task action `output_fields` 中建议增加同样的只读上下文，帮助小程序在收款弹窗展示：

```json
{
  "name": "receivable_context",
  "label": "应收信息",
  "type": "receivable_summary",
  "required": false,
  "readonly": true,
  "receivable_plan_id": "plan-id",
  "receivable_amount": 10000,
  "receivable_paid_amount": 3000,
  "receivable_remaining_amount": 7000,
  "receivable_due_date": "2026-06-30",
  "receivable_status": "partially_paid"
}
```

## Admin 对接

### workflow 编排页

在收款节点配置里新增“应收计划”设置区：

- 是否生成应收计划。
- 应收金额模式：固定金额 / 签约金额比例。
- 固定金额输入。
- 百分比输入。
- 应收日期规则。
- 应收日期偏移天数。
- 应收标题。

发布后的历史版本不 retroactive 修改运行实例；UI 需要继续保持“修改只影响下一次发布后的新实例”的提示。

### 财务应收页

新增页面：

- `/finance/receivables`

页面能力：

- 应收计划列表。
- 状态筛选：待收、部分收款、已收、逾期、已取消。
- 收款类型筛选。
- 到期日期筛选。
- 只看逾期。
- 显示项目、阶段、应收金额、已收金额、剩余金额、应收日期、逾期天数、状态。
- 行操作先做查看项目详情，不做手工核销。

### 项目详情

项目详情财务区域增加：

- 合同金额。
- 应收总额。
- 已收总额。
- 未收金额。
- 逾期金额。
- 近几条应收计划。

workflow 面板继续只读 runtime/timeline，不从 construction stages 或本地规则推导财务节点。

## 小程序对接

小程序不需要直接管理应收计划，只需要继续消费后端契约：

- 项目详情显示 `finance_receivable_summary`。
- timeline 节点展示 `node.attributes.receivable_*`。
- 收款按钮仍来自 `workflow_state.actions`、`node.actions` 或 `/workflow-tasks?status=pending`。
- 财务确认收款仍只调用 `POST /workflow-tasks/:taskId/complete`。
- complete output 仍提交：
  - `amount`
  - `paid_at`
  - `evidence_images`
  - `remark`
- 小程序不直接调用 `/payments` 创建收款。
- 小程序不直接调用 `/finance/receivables` 做核销。
- 小程序不根据节点名、收款类型、本地枚举或旧项目状态推导逾期和欠款。

## 任务拆分

### Task 1: Migration 和权限

- [ ] 新增 `project_receivable_plans`。
- [ ] 新增 `project_receivable_allocations`。
- [ ] 新增 `finance.receivable.view`、`finance.receivable.manage` 权限。
- [ ] 增加必要索引和约束。
- [ ] 应用 migration 后执行 `supabase migration list --linked` 验证 Local/Remote 对齐。

验证：

- migration 可重复执行不会失败。
- 权限数据存在且 active。
- 表约束能阻止负数金额和非法状态。

### Task 2: API 应收服务

- [ ] 新增 finance receivable schema。
- [ ] 新增 receivable plan repository。
- [ ] 新增 allocation repository。
- [ ] 新增 receivable service。
- [ ] 新增 `GET /finance/receivables`。
- [ ] 新增或接入项目 receivable summary。

验证：

- `GET /finance/receivables?page=1&pageSize=20` 返回分页结构。
- 无权限用户返回 403。
- `overdue_only=true` 由后端过滤并返回正确 `pagination.total`。
- 查询不出现 N+1。

### Task 3: workflow 计划生成和核销

- [ ] 扩展 workflow payment collection config schema。
- [ ] 扩展 Admin workflow config 类型。
- [ ] 发布校验补充应收计划字段。
- [ ] runtime 进入 payment collection 节点时幂等创建计划。
- [ ] `workflow-task-payment-bridge` 完成 confirmed payment 后核销应收计划。
- [ ] task action metadata 返回 receivable context。
- [ ] timeline node attributes 返回 `receivable_*`。

验证：

- payment task 重复提交不会重复 payment、ledger、allocation。
- 应收未达标时返回 409，workflow 不推进。
- 应收达标后 workflow 推进，计划状态更新。
- 老节点未开启应收计划时保持一期行为。

### Task 4: Admin UI

- [ ] 收款节点配置增加应收计划设置区。
- [ ] 新增 `/finance/receivables` 页面。
- [ ] 财务菜单增加“应收计划”。
- [ ] 项目详情展示 receivable summary。

验证：

- `pnpm --dir apps/admin check` 通过。
- 应收计划列表分页、筛选、空状态、错误态可用。
- workflow 发布页能保存并回显新配置。

### Task 5: 小程序交接文档

- [ ] 在 `docs/decoration-finance/` 落小程序二阶段对接说明。
- [ ] 明确小程序只读 summary/attributes/actions。
- [ ] 明确 complete payload 不变。
- [ ] 明确小程序不做核销和逾期计算。

验证：

- 文档包含示例字段、接口、验收路径和回填证据。
- 不修改 `/Users/leefo/Public/work/orange`。

### Task 6: 端到端 smoke

建议准备一个测试项目和一个开启应收计划的 `payment_collection` 节点：

1. 项目签约金额存在。
2. workflow 进入收款节点。
3. 后端生成 receivable plan。
4. 小程序或 curl 完成收款 task。
5. 后端创建 confirmed payment。
6. 后端核销 receivable plan。
7. 后端写 finance ledger。
8. workflow 推进到下一节点。
9. Admin `/finance/receivables` 和 `/finance/ledger` 可见一致数据。

回填证据：

- project ID
- workflow instance ID
- task ID
- receivable plan ID
- payment ID
- allocation ID
- ledger ID
- complete 请求/响应
- workflow current node
- Admin 页面或接口结果

## 验收标准

二阶段完成时至少满足：

- 新项目进入配置了应收计划的收款节点后，会生成应收计划。
- 财务确认收款后，收款记录、核销记录、财务台账三者一致且幂等。
- 应收计划状态能从 `pending` 推进到 `partially_paid` 或 `paid`。
- 逾期应收列表由后端分页返回，筛选 total 正确。
- Admin 能看到应收计划和逾期应收。
- 小程序不需要本地推导应收和逾期，只展示后端返回的 workflow v2 和财务摘要。
- 未开启应收计划的旧 workflow 节点不被二阶段改动破坏。

## 风险和边界

- 签约金额为空时，百分比生成计划必须阻断并给出明确错误；不能生成 0 元应收。
- 历史运行实例不会因为模板修改自动获得新应收配置，需要受控补建。
- 多笔 payment 核销同一计划、单笔 payment 部分核销都需要通过 allocation 表表达。
- 退款和冲销不纳入本阶段主流程，但数据模型要允许后续通过负向调整或退款记录反向影响应收。
- 微信支付后续接入时仍归一到 `payments.status=confirmed`，再复用 receivable allocation service。
