# 平台微信充值对接积分系统 PRD

日期：2026-07-02

## 背景

当前系统已有租户积分账户体系：

- `tenant_credit_accounts`：租户积分账户余额、冻结积分、累计充值/消耗。
- `tenant_credit_orders`：租户积分充值订单。
- `tenant_credit_ledger`：租户积分总账流水。
- `tenant_billing_events`：AI、短信、短视频等功能的计费事件。

当前平台侧已有人工充值能力：

```text
POST /platform/billing/tenants/:tenantId/manual-recharge
```

该能力由平台超管操作，最终通过 `billing_manual_recharge` RPC 写入积分账户和积分流水。微信支付充值上线后，不能新增一套独立余额，也不能绕过现有积分账本。微信支付只承担收款通道职责，积分账户仍然是租户可用余额的唯一来源。

## 核心决策

### 1. 微信充值必须接入现有积分系统

充值成功后的唯一业务结果是：

- 更新 `tenant_credit_orders.status = paid`。
- 增加 `tenant_credit_accounts.balance_credits`。
- 写入 `tenant_credit_ledger`。
- 刷新 `GET /billing/account` 和 `GET /billing/ledger` 可见的数据。

小程序和 Admin 不读取新的充值余额字段。

### 2. 平台充值与项目收款分离

平台充值不使用当前项目收款接口：

```text
POST /finance/wechat-pay/orders
```

该接口绑定装修项目收款 workflow，依赖：

- `project_id`
- `workflow_task_id`
- `receivable_plan_id`

平台充值不应创建 `payments`，不应写 `finance_ledger_entries`，不应推进装修项目 workflow。

### 3. 入账以微信支付服务端回调为准

小程序 `wx.requestPayment` 成功只代表客户端支付流程完成，不代表积分已经到账。积分到账必须等待服务端微信支付回调验签、解密、金额校验和幂等入账完成。

### 4. 小程序不能传积分数

小程序只能选择后端返回的充值套餐，或提交后端允许的金额。`credits`、`bonus_credits`、兑换比例和赠送规则必须由后端计算，避免前端篡改。

## 目标

1. 支持租户在小程序或租户 Admin 发起平台积分充值。
2. 使用平台独立微信支付商户号完成 JSAPI 支付。
3. 微信支付成功回调后，自动给当前租户积分账户入账。
4. 平台 Admin 能查看充值订单、支付状态、回调状态和积分流水。
5. 租户侧能查看余额、充值记录和积分流水。
6. 重复创建订单、重复回调、回调重试不会重复加积分。

## 非目标

- 不做项目装修款收款。
- 不做项目应收计划核销。
- 不写 `payments`。
- 不写 `finance_ledger_entries`。
- 不推进 workflow task。
- 不做租户提现。
- 不做资金分账。
- 不把微信支付密钥、证书、API key 暴露给小程序或普通 Admin。

## 数据模型

### 充值订单：`tenant_credit_orders`

继续作为平台积分充值订单主表。建议通过 migration 补齐微信支付字段：

| 字段 | 说明 |
| --- | --- |
| `payment_config_id` | 平台微信支付配置 ID |
| `out_trade_no` | 商户订单号，可直接复用 `order_no` 或独立字段 |
| `prepay_id` | 微信预支付 ID |
| `transaction_id` | 微信支付订单号 |
| `paid_amount_fen` | 微信回调实付金额 |
| `closed_at` | 订单关闭时间 |
| `latest_notification_id` | 最近一次回调记录 |

当前已有字段继续使用：

| 字段 | 说明 |
| --- | --- |
| `tenant_id` | 充值归属租户 |
| `order_no` | 平台充值订单号 |
| `idempotency_key` | 创建订单幂等键 |
| `package_code` | 充值套餐编码 |
| `credits` | 正常到账积分 |
| `bonus_credits` | 赠送积分 |
| `amount_fen` | 应付金额，单位分 |
| `channel` | `wechat_pay` |
| `status` | `pending` / `paid` / `closed` / `refunded` |
| `paid_at` | 支付完成时间 |
| `created_by` | 发起充值用户 |
| `metadata` | 微信支付和套餐快照 |

约束建议：

- `out_trade_no` 全局唯一。
- `transaction_id` 唯一，可为空。
- `idempotency_key` 唯一，可为空。
- `channel = wechat_pay` 的订单必须先 `pending`，回调成功后才变更为 `paid`。

### 积分账户：`tenant_credit_accounts`

充值回调成功后更新：

- `balance_credits += credits + bonus_credits`
- `total_recharged_credits += credits`
- `total_granted_credits += bonus_credits`
- `last_recharged_at = now()`
- `last_activity_at = now()`

### 积分流水：`tenant_credit_ledger`

充值成功后写一条入账流水：

| 字段 | 值 |
| --- | --- |
| `direction` | `in` |
| `change_credits` | `credits + bonus_credits` |
| `event_type` | `wechat_recharge` |
| `source_type` | `tenant_credit_order` |
| `source_id` | `tenant_credit_orders.id` |
| `source_no` | `tenant_credit_orders.order_no` |
| `operator_user_id` | 发起充值用户，回调无法识别时可为空 |

当前唯一索引已经能保障同一订单同一事件类型不重复写流水：

```text
tenant_id + source_type + source_id + event_type
```

### 微信充值回调记录

建议新增独立表：

```text
tenant_credit_wechat_notifications
```

字段建议：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID |
| `tenant_id` | 租户 |
| `credit_order_id` | 积分充值订单 |
| `notify_id` | 微信回调通知 ID |
| `event_type` | 微信回调事件类型 |
| `resource_type` | 微信资源类型 |
| `raw_payload` | 原始回调体 |
| `signature_valid` | 签名是否通过 |
| `processed` | 是否处理成功 |
| `processed_at` | 处理时间 |
| `error_message` | 失败原因 |
| `created_at` | 创建时间 |

约束：

- `notify_id` 唯一。
- 同一通知处理成功后再次收到直接返回成功。
- 处理失败可重试，但不得重复入账。

## 后端接口契约

### 1. 充值套餐

```text
GET /billing/recharge-products
```

认证：

- 员工登录 token。
- 必须有租户上下文。
- 需要有充值权限，例如 `billing.recharge.create` 或租户管理员权限。

返回示例：

```json
{
  "list": [
    {
      "code": "credit_1000",
      "title": "1000 积分",
      "amount_fen": 10000,
      "credits": 1000,
      "bonus_credits": 0,
      "enabled": true
    }
  ]
}
```

### 2. 创建充值订单

```text
POST /billing/recharge-orders
```

请求示例：

```json
{
  "package_code": "credit_1000",
  "payer_openid": "openid-under-platform-miniprogram",
  "idempotency_key": "client-generated-uuid"
}
```

返回示例：

```json
{
  "order": {
    "id": "credit-order-id",
    "order_no": "TC202607020001",
    "amount_fen": 10000,
    "credits": 1000,
    "bonus_credits": 0,
    "channel": "wechat_pay",
    "status": "pending"
  },
  "payment_request": {
    "timeStamp": "1782873600",
    "nonceStr": "nonce",
    "package": "prepay_id=wx-prepay-id",
    "signType": "RSA",
    "paySign": "signature"
  }
}
```

后端行为：

1. 校验租户账户状态为 `active`。
2. 校验套餐存在且启用。
3. 计算 `amount_fen`、`credits`、`bonus_credits`。
4. 创建 `tenant_credit_orders` pending 订单。
5. 使用平台独立微信支付商户号发起 JSAPI 预下单。
6. 保存 `prepay_id`。
7. 返回 `payment_request` 给小程序。

### 3. 查询充值订单

```text
GET /billing/recharge-orders/:id
```

返回：

```json
{
  "order": {
    "id": "credit-order-id",
    "order_no": "TC202607020001",
    "amount_fen": 10000,
    "credits": 1000,
    "bonus_credits": 0,
    "status": "paid",
    "paid_at": "2026-07-02T10:00:00+08:00"
  },
  "account": {
    "balance_credits": 1200,
    "available_credits": 1200,
    "frozen_credits": 0
  }
}
```

### 4. 余额和流水

继续使用现有接口：

```text
GET /billing/account
GET /billing/ledger
```

小程序和 Admin 充值完成后都刷新这两个接口。

## 微信支付回调

回调地址仍可使用统一入口：

```text
POST /pay/wechat/callback
```

但回调处理必须能根据 `out_trade_no` 区分订单类型：

| 订单类型 | 表 | 后续动作 |
| --- | --- | --- |
| 项目收款 | `wechat_payment_orders` | 创建 `payments`、核销应收、推进 workflow |
| 积分充值 | `tenant_credit_orders` | 给积分账户入账 |

建议商户订单号增加可读前缀：

- `WP...`：项目微信收款。
- `TC...`：租户积分充值。

充值回调处理步骤：

1. 验证微信支付回调签名。
2. 解密 resource。
3. 读取 `out_trade_no`。
4. 定位 `tenant_credit_orders`。
5. 校验订单为 `pending` 或已 `paid`。
6. 校验回调金额等于 `amount_fen`。
7. 校验 `trade_state = SUCCESS`。
8. 调用 `billing_confirm_wechat_recharge` RPC 入账。
9. 写回调通知处理状态。
10. 返回微信支付 `SUCCESS`。

## RPC 建议

新增：

```text
billing_confirm_wechat_recharge(
  p_order_id uuid,
  p_transaction_id text,
  p_paid_amount_fen integer,
  p_paid_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
```

RPC 职责：

- `FOR UPDATE` 锁定充值订单。
- 若订单已 `paid`，返回已有账户和流水，标记 `idempotent = true`。
- 若订单不是 `pending` 或 `paid`，抛出稳定业务错误。
- 校验支付金额与订单金额一致。
- 锁定或创建 `tenant_credit_accounts`。
- 更新 `tenant_credit_orders` 为 `paid`。
- 更新 `tenant_credit_accounts`。
- 写入 `tenant_credit_ledger(event_type = 'wechat_recharge')`。
- 返回 `order`、`account`、`ledger`、`idempotent`。

不要复用 `billing_manual_recharge` 直接做微信充值，因为它会创建 `channel = manual` 的订单，并写 `event_type = manual_recharge`。可以抽公共逻辑，但最终事件类型必须可区分。

## 平台 Admin 对接

平台 Admin 需要增加：

1. 平台独立微信支付商户号配置页。
   - 只保存密钥引用和证书引用，不展示明文密钥。
   - 支持启用/停用。
   - 显示配置校验状态。

2. 充值套餐配置。
   - 套餐编码、标题、金额、积分、赠送积分、启用状态、排序。
   - 后续可加有效期和活动赠送规则。

3. 充值订单列表。
   - 按租户、状态、订单号、交易号、时间筛选。
   - 展示金额、积分、赠送积分、支付状态、到账状态。
   - 可查看回调通知和失败原因。

4. 积分流水关联跳转。
   - 订单详情展示对应 `tenant_credit_ledger`。
   - 支持定位某个租户的账户余额变化。

## 租户 Admin 对接

租户 Admin 可以增加或复用现有 billing 页面：

- 当前积分余额。
- 可用积分。
- 冻结积分。
- 充值记录。
- 积分流水。
- 在线充值入口。

租户 Admin 不应配置平台独立商户号，也不应看到平台商户密钥。

## 小程序对接

员工首页抽屉可以增加“充值”入口，但展示条件必须由后端权限或开关控制。

建议流程：

1. 进入员工首页时读取 `GET /billing/account`。
2. 若后端返回可充值权限或入口开关，则展示“充值”。
3. 点击后调用 `GET /billing/recharge-products`。
4. 用户选择套餐。
5. 小程序获取或透传当前用户在平台小程序 AppID 下的 `openid`。
6. 调用 `POST /billing/recharge-orders`。
7. 使用返回的 `payment_request` 调用 `wx.requestPayment`。
8. 支付客户端完成后查询 `GET /billing/recharge-orders/:id`。
9. 若订单仍为 `pending`，短轮询等待服务端回调。
10. 订单变为 `paid` 后刷新 `GET /billing/account`。

小程序禁止：

- 传 `credits` 或 `bonus_credits`。
- 自己计算兑换比例。
- 本地直接增加余额。
- 调用平台人工充值接口。
- 使用项目收款接口做充值。
- 保存商户号密钥、证书、API key。

## 权限建议

新增或确认权限：

| 权限 | 说明 |
| --- | --- |
| `billing.recharge.create` | 发起租户积分在线充值 |
| `billing.recharge.read` | 查看本租户充值订单 |
| `platform.billing.recharge.manage` | 平台查看和管理充值订单 |
| `platform.payment.config.manage` | 平台配置独立微信支付商户 |
| `platform.billing.recharge_product.manage` | 平台配置充值套餐 |

如果第一版只允许租户管理员充值，也可以先复用租户管理员角色判断，但接口层仍建议保留独立权限，便于后续授权给财务人员。

## 错误码建议

| 错误码 | 场景 |
| --- | --- |
| `BILLING_RECHARGE_DISABLED` | 当前租户不可充值 |
| `BILLING_RECHARGE_PRODUCT_NOT_FOUND` | 套餐不存在 |
| `BILLING_RECHARGE_PRODUCT_DISABLED` | 套餐已停用 |
| `BILLING_RECHARGE_ORDER_NOT_FOUND` | 充值订单不存在 |
| `BILLING_RECHARGE_ORDER_STATUS_INVALID` | 订单状态不允许当前操作 |
| `BILLING_RECHARGE_AMOUNT_MISMATCH` | 微信回调金额与订单金额不一致 |
| `BILLING_RECHARGE_PAYMENT_CONFIG_MISSING` | 平台微信支付配置缺失 |
| `BILLING_RECHARGE_PAYMENT_CONFIG_INVALID` | 平台微信支付配置不可用 |
| `BILLING_RECHARGE_CALLBACK_VERIFY_FAILED` | 微信回调验签或解密失败 |

## 安全要求

- 不在文档、代码、提交记录中写入微信支付密钥明文。
- 密钥、私钥、API v3 key 只能保存为安全引用。
- Admin 只显示脱敏商户信息和证书序列号。
- 小程序永远不接触商户证书、私钥和 API key。
- 回调必须验签、解密、校验金额。
- 积分入账必须幂等。
- 订单创建必须带幂等键，防止重复点击生成多笔待支付订单。
- 生产上线前应轮换曾经暴露过的支付密钥。

## Smoke 验收

### 后端小额真实支付

1. 平台配置独立微信支付商户号。
2. 配置一个低金额测试套餐。
3. 租户员工创建充值订单。
4. 小程序调起微信支付并完成支付。
5. 微信支付回调返回成功。
6. `tenant_credit_orders.status = paid`。
7. `tenant_credit_accounts.balance_credits` 增加正确。
8. `tenant_credit_ledger.event_type = wechat_recharge`。
9. 重放同一回调不重复加积分。
10. `GET /billing/account` 返回最新余额。

### Admin 验收

1. 平台 Admin 可见充值订单。
2. 平台 Admin 可见微信交易号和回调处理状态。
3. 平台 Admin 可从订单跳转到积分流水。
4. 租户 Admin 可见余额、充值记录和积分流水。

### 小程序验收

1. 员工首页抽屉按权限展示“充值”入口。
2. 充值套餐来自 `GET /billing/recharge-products`。
3. 小程序创建订单后能拿到 `payment_request`。
4. `wx.requestPayment` 可成功调起。
5. 支付完成后订单从 `pending` 变为 `paid`。
6. 余额刷新正确。
7. 支付取消不增加积分。
8. 网络中断后重新进入页面可查询订单状态。

## 与现有 Phase 9 的关系

当前 Phase 9 微信支付项目收款能力继续服务装修财务系统：

- 订单表：`wechat_payment_orders`
- 业务结果：`payments`、应收计划、`finance_ledger_entries`、workflow 推进

本 PRD 新增的是平台积分充值能力：

- 订单表：`tenant_credit_orders`
- 业务结果：`tenant_credit_accounts`、`tenant_credit_ledger`
- 不涉及装修项目 workflow

两条链路可以复用微信支付签名、预下单、证书加载、回调验签和解密能力，但订单定位、业务入账和审计必须分离。

