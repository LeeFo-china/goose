# 微信支付接入 PRD

日期：2026-06-30

## 背景

当前装修财务系统已经形成以 workflow 为中心的人工确认收付款闭环：

- 小程序/员工端按 `workflow_state.actions` 和 `/workflow-tasks` 推进。
- 财务人员人工确认收款后生成 `payments`、核销应收计划、写入 `finance_ledger_entries`。
- 费用审批完成后由财务付款，并形成支出台账。
- Phase 7 已补齐财务对账异常、人工修正和审计。

微信支付接入后，系统会具备真实线上收付款能力。支付接入必须服从现有财务事实模型，不能绕过 workflow、应收计划、台账、对账异常和审计。

## 核心决策：商户配置模式

微信支付能力有两种模式：

### A. 平台统一商户

平台配置一个微信支付商户，所有租户使用平台商户收款。

优点：

- 接入和运维成本低。
- 回调、证书、密钥、对账单统一管理。
- 新租户开通成本低。

风险：

- 租户资金进入平台商户，涉及资金清分、结算、合规和财务责任。
- 平台需要管理租户间资金归属和提现。
- 对装修公司“自己收客户款”的业务心智不一定匹配。

适用：

- 平台代收代付。
- 平台对租户做资金结算。
- SaaS 希望统一支付基础设施。

### B. 租户独立商户

每个装修公司租户配置自己的微信支付商户。

优点：

- 资金直接进入租户商户，责任边界清晰。
- 更符合装修公司独立经营。
- 平台不直接沉淀客户装修款。

风险：

- 每个租户都要完成商户配置、证书、回调验签、权限和上线检查。
- 运维复杂。
- 小租户配置成本高。

适用：

- 租户自行收款。
- 平台只提供业务系统，不碰资金池。

## 建议

第一版建议采用“租户独立商户”为主，“平台统一商户”为未来可选能力。

原因：

- 当前 `tenant_id` 已经是系统内所有业务事实的隔离边界。
- 装修项目收款金额较大，平台统一代收会显著增加合规和资金清分复杂度。
- 现有财务系统是租户经营财务，不是平台资金账户系统。

因此微信支付配置应归属租户：

```text
tenant_wechat_pay_configs
```

平台只保存和托管租户授权的支付配置，并负责回调验签、订单状态同步和系统内对账。

## 目标

1. 支持项目收款节点通过微信支付发起客户付款。
2. 微信支付成功回调后，自动生成 confirmed payment、核销应收计划、写入项目收款台账。
3. 支持退款、手续费、支付对账单和异常对账。
4. 保持 workflow source of truth：支付成功只满足收款事实，workflow 推进仍由后端统一按节点契约执行。
5. 所有支付回调、自动核销、退款和异常修正进入审计。

## 非目标

- 不做平台余额账户。
- 不做租户提现。
- 不做平台代付给施工人员。
- 不做自动费用付款。
- 不用小程序本地判断支付状态推进 workflow。
- 不在微信支付回调里直接跳过 workflow guard。

## 数据模型建议

### 租户微信支付配置

```text
tenant_wechat_pay_configs
```

字段：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID |
| `tenant_id` | 租户 |
| `mode` | `tenant_merchant` / `platform_merchant` |
| `mch_id` | 微信支付商户号 |
| `app_id` | 小程序 appId |
| `merchant_name` | 商户名称 |
| `status` | `draft` / `active` / `disabled` |
| `api_v3_key_ref` | 密钥引用，不明文返回 |
| `serial_no` | 商户证书序列号 |
| `notify_url` | 回调地址 |
| `enabled_at` | 启用时间 |
| `created_by_employee_id` | 创建人 |
| `updated_by_employee_id` | 更新人 |
| `created_at` / `updated_at` | 时间 |

安全要求：

- 不在数据库明文保存私钥/API Key。
- Admin 只显示脱敏信息。
- 配置启用前必须通过验签/下单 dry-run 或配置校验。

### 支付订单

```text
wechat_payment_orders
```

字段：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID |
| `tenant_id` | 租户 |
| `project_id` | 项目 |
| `workflow_instance_id` | workflow 实例 |
| `workflow_task_id` | 收款 task |
| `receivable_plan_id` | 应收计划 |
| `payment_id` | 成功后关联 payment |
| `out_trade_no` | 商户订单号 |
| `transaction_id` | 微信支付订单号 |
| `amount` | 应付金额 |
| `paid_amount` | 实付金额 |
| `currency` | 默认 CNY |
| `status` | `pending` / `paid` / `closed` / `refunded` / `failed` |
| `payer_openid` | 支付用户 openid |
| `prepay_id` | 预支付 ID |
| `paid_at` | 支付成功时间 |
| `raw_notify_id` | 最近回调记录 |
| `created_at` / `updated_at` | 时间 |

约束：

- `tenant_id + out_trade_no` 唯一。
- `transaction_id` 唯一，可为空。
- 同一 `workflow_task_id` 同一未支付订单幂等复用。

### 支付回调记录

```text
wechat_payment_notifications
```

字段：

- `tenant_id`
- `order_id`
- `notify_id`
- `event_type`
- `resource_type`
- `summary`
- `raw_payload`
- `signature_valid`
- `processed`
- `processed_at`
- `error_message`
- `created_at`

回调必须幂等：

- 同一个 `notify_id` 只能处理一次。
- 同一个 `transaction_id` 只能生成一个 payment。
- 处理失败可重试，但不能重复入账。

### 退款记录

```text
wechat_payment_refunds
```

字段：

- `tenant_id`
- `order_id`
- `payment_id`
- `out_refund_no`
- `refund_id`
- `amount`
- `reason`
- `status`
- `requested_by_employee_id`
- `requested_at`
- `succeeded_at`
- `raw_payload`

退款不应直接删除原 payment，应生成反向流水或退款台账，后续单独定义财务口径。

## Workflow 对接

### 发起支付

当前收款节点仍由 workflow 决定可执行动作。

后端可以在收款节点 actions 中新增：

```json
{
  "key": "create_wechat_payment",
  "label": "微信支付收款",
  "type": "payment",
  "task_id": "workflow-task-id",
  "attributes": {
    "payment_channel": "wechat_pay",
    "receivable_plan_id": "receivable-id",
    "amount": 10000
  }
}
```

小程序只按 action 展示按钮，不本地判断当前节点是否可支付。

### 支付成功后

微信支付回调成功后，后端应按现有财务链路执行：

1. 校验回调签名。
2. 幂等更新 `wechat_payment_orders.status=paid`。
3. 创建或读取 `payments`：
   - `status=confirmed`
   - `payment_channel=wechat_pay`
   - `external_trade_no=transaction_id`
4. 核销 `project_receivable_allocations`。
5. 写入 `finance_ledger_entries` 项目收款台账。
6. 记录支付回调处理审计。
7. 根据 workflow task 和收款节点契约推进 workflow。

注意：workflow 推进必须经过后端现有 complete/guard 逻辑，不能在回调里硬改 `current_node`。

### 支付中状态

如果客户已拉起支付但未完成：

- 小程序显示“等待支付”或“继续支付”。
- 财务台账不入账。
- workflow 不推进。
- 应收计划仍为未收或部分已收。

## API 建议

### Admin 配置

```http
GET /admin/wechat-pay/config
PUT /admin/wechat-pay/config
POST /admin/wechat-pay/config/verify
POST /admin/wechat-pay/config/enable
POST /admin/wechat-pay/config/disable
```

### 小程序发起支付

```http
POST /workflow-tasks/:taskId/wechat-payment
```

请求：

```json
{
  "action": "create_wechat_payment"
}
```

返回：

```json
{
  "order_id": "uuid",
  "out_trade_no": "tenant-project-task-timestamp",
  "amount": 10000,
  "wechat_pay_params": {
    "timeStamp": "...",
    "nonceStr": "...",
    "package": "prepay_id=...",
    "signType": "RSA",
    "paySign": "..."
  }
}
```

### 支付状态查询

```http
GET /wechat-pay/orders/:orderId
```

返回：

- `status`
- `amount`
- `paid_amount`
- `paid_at`
- `payment_id`
- `receivable_allocation_id`
- `ledger_id`
- `workflow_state`

### 微信回调

```http
POST /wechat-pay/notify
```

要求：

- 验签。
- 解密 resource。
- 幂等处理。
- 不返回敏感错误。

## Admin 对接

新增配置页：

```text
系统设置 / 微信支付配置
```

能力：

- 查看当前租户商户配置状态。
- 填写/更新商户号、appId、证书序列号、密钥引用。
- 上传/绑定证书或配置密钥引用。
- 配置校验。
- 启用/停用。
- 查看最近回调状态和错误。

财务页面增强：

- 收款台账显示 `payment_channel=微信支付`。
- payment 详情显示微信订单号。
- 对账异常支持微信订单缺失、回调未入账、金额不一致、重复回调等类型。

## 小程序对接

小程序需要在后端提供 action 后接入：

1. 项目详情/任务中心继续只读 workflow v2。
2. 当 action key 为 `create_wechat_payment` 时，调用：

```http
POST /workflow-tasks/:taskId/wechat-payment
```

3. 使用返回的 `wechat_pay_params` 调起微信支付。
4. 支付完成后只刷新后端状态：
   - `GET /wechat-pay/orders/:orderId`
   - `GET /projects/:projectId/employee-detail-bootstrap`
   - `GET /workflow-subjects/project/:projectId/state`
5. 小程序不得本地 complete workflow。
6. 小程序不得本地生成 payment/ledger/allocation。

## 对账异常新增方向

微信支付接入后，Phase 7 对账可扩展：

| 异常码 | 含义 | 建议等级 |
| --- | --- | --- |
| `wechat_order_paid_without_payment` | 微信订单已支付但系统 payment 缺失 | error |
| `payment_without_wechat_order` | payment 标记微信支付但没有微信订单 | warning |
| `wechat_amount_mismatch` | 微信支付金额与 payment 金额不一致 | error |
| `wechat_paid_without_ledger` | 微信 payment 已确认但台账缺失 | error |
| `wechat_notify_failed` | 回调验签或处理失败 | error |
| `wechat_refund_without_reverse_ledger` | 退款成功但缺少反向流水 | warning |

## 权限

建议新增：

| 权限 | 用途 |
| --- | --- |
| `wechat_pay.config.read` | 查看微信支付配置 |
| `wechat_pay.config.manage` | 管理微信支付配置 |
| `wechat_pay.order.read` | 查看支付订单 |
| `wechat_pay.refund.request` | 发起退款 |
| `wechat_pay.refund.review` | 审核退款 |
| `wechat_pay.notify.read` | 查看回调记录 |

## 实施阶段建议

### Task 0：支付模式确认

- 确认第一版是否采用租户独立商户。
- 确认证书/密钥托管方式。
- 确认微信支付小程序 appId 与租户商户关系。

### Task 1：配置模型和 Admin 配置页

- migration 新增配置表。
- Admin 支持配置、校验、启用、停用。
- 密钥脱敏。

### Task 2：支付订单和发起支付

- migration 新增订单表。
- 后端按 workflow task 创建订单。
- 小程序按 action 调起微信支付。

### Task 3：支付回调和自动入账

- 回调验签、解密、幂等。
- 创建 confirmed payment、allocation、ledger。
- 推进 workflow。
- 写审计。

### Task 4：支付对账

- 查询微信账单或订单状态。
- 扩展对账异常。
- Admin 展示支付对账异常。

### Task 5：退款

- 退款申请、审核、调用微信退款。
- 退款回调。
- 反向流水和应收状态影响单独验收。

### Task 6：发布 smoke

- 沙箱/测试商户下单。
- 小程序调起支付。
- 回调入账。
- workflow 推进。
- 台账与对账异常核验。

## 验收标准

1. 租户未配置微信支付时，小程序不展示微信支付 action。
2. 租户配置启用后，收款节点可返回 `create_wechat_payment` action。
3. 同一 task 重复发起支付时，未支付订单幂等复用。
4. 支付成功回调重复到达，不重复生成 payment/allocation/ledger。
5. 支付成功后 workflow 按后端 guard 推进。
6. 金额不一致时不入账或进入异常状态。
7. Admin 能看到订单、回调和台账关联。
8. 小程序不本地推进 workflow。
9. 对账异常能发现微信支付链路断点。
10. 所有敏感密钥不明文返回。

## 风险

- 平台统一商户会引入资金清分和合规责任，第一版不建议默认采用。
- 微信回调和 workflow 推进必须幂等，否则会重复入账。
- 退款会影响收入、应收和利润，需要单独设计反向流水口径。
- 证书、密钥、回调验签属于高风险安全边界，不能用普通配置表明文保存。
