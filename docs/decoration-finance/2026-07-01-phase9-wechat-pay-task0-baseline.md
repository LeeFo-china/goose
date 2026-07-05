# Phase 9 微信支付接入 Task 0 基线核查

日期：2026-07-01
工作区：`.worktrees/phase9-wechat-pay-baseline`
分支：`feature/phase9-wechat-pay-baseline`

## 目标

Phase 9 进入微信支付接入前，不先写下单和回调代码，先确认当前财务主链路、数据模型、workflow 契约和前后端边界。

本轮 Task 0 只做只读核查和实施决策记录：

- 不创建微信支付订单。
- 不触发 workflow complete。
- 不写入 `payments`、`project_receivable_allocations`、`finance_ledger_entries`。
- 不执行数据库 DDL/DML。
- 不修改 orange 仓库。

## 当前结论

微信支付可以沿用当前装修财务事实链路接入，但第一步不应该新增一张重复的 `tenant_wechat_pay_configs` 表。

当前数据库已经有租户支付配置空壳：

```text
tenant_payment_configs
```

该表已经具备：

- `tenant_id`
- `provider`
- `merchant_mode`
- `merchant_id`
- `sub_merchant_id`
- `app_id`
- `sub_app_id`
- `status`
- `enabled_channels`
- `encrypted_config_ref`
- `risk_switches`

因此 Phase 9 后续建议是在 `tenant_payment_configs` 上扩展微信支付配置字段和 Admin/API 管理能力，而不是再建同语义的 `tenant_wechat_pay_configs`。这样能避免后续出现“两个租户支付配置 source of truth”。

## 已有能力

### 1. payment 已预留支付渠道和外部交易字段

来源：

- `supabase/migrations/20260616170000_decoration_finance_phase1.sql`
- `apps/api/src/schema/payment.ts`
- `apps/api/src/repositories/payments.ts`

当前 `payments` 已有：

```text
workflow_task_id
source_type
source_id
remark
payment_channel
provider
provider_transaction_id
out_trade_no
```

并已有关键唯一约束：

```text
payments_workflow_task_unique_idx
payments_provider_transaction_unique_idx
payments_out_trade_no_unique_idx
payments_source_idx
```

这说明微信支付成功后生成 `confirmed payment` 时，不需要重做 payment 主表，只需要按现有字段落：

```text
payment_channel = wechat_pay
provider = wechat_pay
provider_transaction_id = 微信 transaction_id
out_trade_no = 商户订单号
source_type/source_id = 微信订单或回调来源
```

### 2. 应收核销已预留 wechat_pay_callback 来源

来源：

- `supabase/migrations/20260623170000_decoration_finance_phase2_receivables.sql`
- `apps/api/src/repositories/project-receivable-allocations.ts`
- `apps/api/src/services/project-receivables.ts`

`project_receivable_allocations.source_type` 已允许：

```text
workflow_task
manual
wechat_pay_callback
```

现有人工收款 workflow bridge 调用：

```text
projectReceivablesService.allocateWorkflowPayment(...)
```

当前实现固定写入：

```text
source_type = workflow_task
source_id = workflowTaskId
```

Phase 9 后续如果由微信回调驱动核销，需要新增一个支付回调专用核销入口，或扩展现有 service 支持 `source_type=wechat_pay_callback`，不能在回调代码里直接手写 allocation 更新。

### 3. 财务台账已有项目收款入账幂等入口

来源：

- `supabase/migrations/20260616170000_decoration_finance_phase1.sql`
- `apps/api/src/services/workflow-task-payment-bridge.ts`
- `apps/api/src/services/payments.ts`

当前人工收款 bridge 会创建：

```text
finance_ledger_entries.direction = in
finance_ledger_entries.entry_type = project_payment
finance_ledger_entries.payment_id = payment.id
finance_ledger_entries.workflow_task_id = task.id
metadata.payment_channel = payment.payment_channel
```

`FinanceLedgerService.createProjectPaymentLedger` 已作为项目收款入账统一入口。微信支付成功后也应该复用该入口，不应绕过 service 直接插入 `finance_ledger_entries`。

### 4. workflow 收款节点已有人工确认闭环

来源：

- `apps/api/src/services/workflow-tasks.ts`
- `apps/api/src/services/workflow-task-payment-bridge.ts`
- `apps/api/src/services/workflow-task-action-metadata.ts`

当前收款节点识别条件：

```text
current_node_snapshot.business_kind = payment_collection
action = complete
```

当前人工确认链路：

```text
POST /workflow-tasks/:taskId/complete
-> workflowTaskPaymentBridge.complete
-> create confirmed payment
-> allocate receivable plan
-> create project payment ledger
-> complete runtime node
-> sync workflow state
```

小程序当前只需要消费：

```text
workflow_state.actions
/workflow-tasks.actions
```

并统一走：

```text
POST /workflow-tasks/:taskId/complete
```

### 5. 权限体系已有财务权限，但没有微信支付权限

来源：

- `packages/domain/src/permission.ts`
- `supabase/migrations/20260616170000_decoration_finance_phase1.sql`

当前已有：

```text
finance.payment.confirm
finance.ledger.view
finance.receivable.view
finance.receivable.manage
finance.reconciliation.manage
finance.reports.read
finance.reports.export
finance.closing.read
finance.closing.manage
```

但还没有：

```text
wechat_pay.config.read
wechat_pay.config.manage
wechat_pay.order.read
wechat_pay.notify.read
wechat_pay.refund.request
wechat_pay.refund.review
```

Phase 9 Task 1 需要通过 migration 和 `@gooes/domain` 权限常量补齐。

## 当前缺口

### 数据模型缺口

当前没有微信支付订单表：

```text
wechat_payment_orders
```

当前没有微信支付回调记录表：

```text
wechat_payment_notifications
```

当前没有微信支付退款表：

```text
wechat_payment_refunds
```

退款不建议放在 Phase 9 第一批实现，除非产品确认马上要处理线上退款。第一批可以先规划表结构，实际退款动作放 Phase 9.3 或后续阶段。

### 配置模型缺口

`tenant_payment_configs` 已存在，但还缺少微信支付上线所需的部分展示和审计字段，例如：

```text
merchant_name
serial_no
notify_url
validation_status
last_validated_at
created_by_employee_id
updated_by_employee_id
```

是否补充这些字段，应在 Task 1 migration 中一次性确定。

敏感字段仍然不能明文入库。`encrypted_config_ref` 应继续作为密钥引用字段，真实 API v3 key、私钥、证书内容必须放外部密钥/对象存储方案中，Admin 只展示脱敏摘要。

### API 缺口

当前未发现微信支付配置管理 API、订单创建 API、通知回调 API。

建议后续新增接口分层：

```text
controller: 只处理 HTTP、校验、ResponseHandler
service: 编排商户配置、订单、回调、现有 payment/ledger/workflow service
repository/gateway: Supabase 表访问、微信支付网关调用
```

初始接口建议：

```http
GET /wechat-pay/config
PUT /wechat-pay/config
POST /wechat-pay/orders
GET /wechat-pay/orders?page=1&pageSize=20
POST /wechat-pay/notify
GET /wechat-pay/notifications?page=1&pageSize=20
```

如果后续按 Admin 菜单归类，也可以使用：

```http
GET /finance/wechat-pay/config
PUT /finance/wechat-pay/config
POST /finance/wechat-pay/orders
GET /finance/wechat-pay/orders
POST /finance/wechat-pay/notify
GET /finance/wechat-pay/notifications
```

最终路由前缀需要在 Task 1/2 确认一次，避免 Admin 和小程序分别接不同路径。

### Admin 缺口

当前未发现租户微信支付配置页。

Phase 9 后续 Admin 需要新增：

- 系统设置或财务管理下的微信支付配置入口。
- 商户配置只读/编辑页。
- 配置状态：`disabled`、`pending`、`active`、`suspended`。
- 订单列表和回调记录只读页。
- 脱敏展示：商户号、AppID、证书序列号、启用时间、最近校验时间。

第一版不需要在 Admin 里做真实退款。

### 小程序缺口

当前小程序不需要在 Task 0 改代码。

Phase 9 后续真正开放支付时，小程序只需要按后端 action 渲染：

```json
{
  "key": "create_wechat_payment",
  "label": "微信支付收款",
  "business_domain": "payment_collection",
  "business_action": "create_wechat_payment",
  "task_id": "workflow-task-id",
  "attributes": {
    "payment_channel": "wechat_pay",
    "receivable_plan_id": "receivable-plan-id",
    "amount": 10000
  }
}
```

小程序不应该：

- 根据节点名称判断能否微信支付。
- 自己判断租户是否配置商户。
- 自己创建 payment、allocation、ledger。
- 自己推进 workflow。
- 轮询后本地改 timeline。

小程序应该：

1. 读取 `workflow_state.actions` 或 `/workflow-tasks.actions`。
2. 看到 `create_wechat_payment` 时调用后端创建订单接口。
3. 使用后端返回的 `wechat_pay_params` 拉起微信支付。
4. 支付完成后刷新项目详情和 workflow state。
5. 以服务端返回的 workflow current node 为准。

## Phase 9 后续建议拆分

### Task 1：数据模型和权限 migration

目标：

- 复用并扩展 `tenant_payment_configs`。
- 新增 `wechat_payment_orders`。
- 新增 `wechat_payment_notifications`。
- 新增微信支付权限。
- 暂不实现退款，最多预留文档。

建议 migration 包含：

```text
ALTER TABLE tenant_payment_configs ADD COLUMN ...
CREATE TABLE wechat_payment_orders ...
CREATE TABLE wechat_payment_notifications ...
INSERT INTO permissions ...
```

约束要求：

- `tenant_id + out_trade_no` 唯一。
- `transaction_id` 唯一，可为空。
- 同一个 `workflow_task_id` 同一个未支付订单可幂等复用。
- `notify_id` 唯一，防止重复处理。
- 所有列表索引必须考虑分页和租户过滤。

### Task 2：后端配置和订单骨架

目标：

- 微信支付配置 CRUD。
- 订单创建接口。
- 订单幂等复用。
- 不接真实微信 SDK 时可先返回 mock/dry-run 结构，但必须把状态标记清楚。

### Task 3：回调落库和幂等处理

目标：

- 回调验签入口。
- 通知原文落库。
- 幂等处理保护。
- 成功回调生成 confirmed payment、核销应收、写台账。
- workflow 推进必须走现有 guard，不允许硬改 runtime node。

### Task 4：Admin 配置页和订单/回调只读页

目标：

- 租户配置微信支付。
- 查看订单和回调处理状态。
- 显示支付链路异常。

### Task 5：小程序 handoff 和联调 smoke

目标：

- 输出小程序对接文档。
- 明确 `create_wechat_payment` action、创建订单响应、支付成功后刷新策略。
- 使用测试商户或 dry-run 样本完成只读/半自动 smoke。

## 关键风险

### 1. 不要重复配置表

历史 PRD 中曾写过 `tenant_wechat_pay_configs`，但当前数据库已存在更通用的 `tenant_payment_configs`。

后续应优先复用现有表；如果产品坚持重命名，必须通过 migration 迁移并给出回滚方案，不能并存两个配置源。

### 2. 回调不能绕过 workflow guard

微信支付成功只是“收款事实成立”，不是“可以任意跳节点”。

后端处理成功回调时仍应复用现有 payment bridge 或抽取共享服务，最终推进 workflow 必须经过 runtime complete / guard 逻辑。

### 3. 微信支付密钥不能明文落库

Admin/API 不能返回 API v3 key、私钥、证书原文。

`encrypted_config_ref` 或后续密钥引用字段只存外部密钥引用。

### 4. 支付金额和应收金额必须由后端校验

小程序传入金额不能作为最终事实。订单金额应来自收款节点 `receivable_context`、应收计划或后端重新计算结果。

### 5. 对账异常必须覆盖微信支付链路

Phase 7/8 已有对账异常和月结差异闭环。微信支付接入后，至少需要继续扩展以下异常：

- 微信订单已支付但无 payment。
- payment 为微信支付但无订单。
- 微信支付金额与 payment 金额不一致。
- payment 已入账但 allocation 或 ledger 缺失。
- 回调验签失败或处理失败。

## Task 0 验收结论

Phase 9 可以进入实现，但需要按以下原则执行：

1. 租户支付配置复用 `tenant_payment_configs`，不要新建重复配置表。
2. 新增微信支付订单和通知表必须通过 migration。
3. 支付成功后复用现有 `payments -> receivable allocation -> finance ledger -> workflow runtime complete` 链路。
4. Admin 先做配置、订单、回调可见性，不做退款。
5. 小程序第一轮无必改；真正支付联调时只消费 `create_wechat_payment` action。
