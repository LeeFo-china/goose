# 平台微信充值积分小程序对接说明

日期：2026-07-03

适用范围：orange 小程序对接参考。本仓库不修改 orange。

## 当前结论

平台积分充值已经和项目收款拆开：

- 平台积分充值使用平台独立微信支付配置。
- 充值成功后只写租户积分账户、积分订单和积分流水。
- 不创建项目 `payments`。
- 不写项目财务台账。
- 不推进装修项目 workflow。
- 小程序不需要判断商户号、服务商、`sub_mchid` 或支付路由。

小程序侧建议在员工首页抽屉增加“积分充值”入口，进入后只按本文接口完成套餐选择、下单、拉起微信支付和刷新余额。

当前 dev smoke 已配置一个小额套餐：

```json
{
  "code": "smoke_1fen",
  "title": "1分钱测试充值",
  "amount_fen": 1,
  "credits": 1,
  "bonus_credits": 0
}
```

小程序真实小额支付 smoke 可优先使用 `package_code=smoke_1fen`。

## 小程序接口流程

### 1. 读取积分账户

用于进入充值页前展示当前余额，也用于支付后刷新。

```text
GET /billing/account
```

认证：

- 员工登录 token。
- 必须有租户上下文。

小程序只展示后端返回的余额，不在本地计算可用积分。

### 2. 读取可用充值套餐

```text
GET /billing/recharge-products?page=1&pageSize=20
```

认证：

- 员工登录 token。
- 必须有租户上下文。
- 当前员工需要具备充值权限，例如 `billing.recharge.create`。

分页：

- 默认 `page=1&pageSize=20`。
- `pageSize` 最大 `100`。
- 后端只返回启用中的套餐。

返回重点：

```json
{
  "list": [
    {
      "code": "credit_1000",
      "title": "1000 积分",
      "amount_fen": 10000,
      "credits": 1000,
      "bonus_credits": 0
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

小程序展示建议：

- 金额按 `amount_fen / 100` 展示人民币。
- 到账积分展示 `credits`。
- 赠送积分展示 `bonus_credits`，为 `0` 时可以不显示。
- 不允许小程序本地传入或改写金额、积分数、赠送规则。

### 3. 创建充值订单

```text
POST /billing/recharge-orders
```

请求：

```json
{
  "package_code": "credit_1000",
  "payer_openid": "用户在平台小程序 AppID 下的 openid",
  "idempotency_key": "可选 UUID"
}
```

字段说明：

- `package_code`：来自 `GET /billing/recharge-products` 的 `code`。
- `payer_openid`：当前支付用户在平台小程序 AppID 下的 openid，真实 JSAPI 支付必填。
- `idempotency_key`：可选，建议每次用户点击“确认支付”时生成一个 UUID，用于防重复点击。

返回：

```json
{
  "idempotent": false,
  "order": {
    "id": "tenant-credit-order-id",
    "tenant_id": "tenant-id",
    "order_no": "TC202607030001ABCDEF12",
    "package_code": "credit_1000",
    "amount_fen": 10000,
    "credits": 1000,
    "bonus_credits": 0,
    "channel": "wechat_pay",
    "status": "pending",
    "paid_at": null,
    "paid_amount_fen": null,
    "out_trade_no": "TC202607030001ABCDEF12",
    "prepay_id": "wx-prepay-id",
    "transaction_id": null,
    "created_at": "2026-07-03T10:00:00.000Z",
    "updated_at": "2026-07-03T10:00:00.000Z"
  },
  "product": {
    "code": "credit_1000",
    "title": "1000 积分",
    "amount_fen": 10000,
    "credits": 1000,
    "bonus_credits": 0
  },
  "payment_request": {
    "timeStamp": "1783072800",
    "nonceStr": "nonce",
    "package": "prepay_id=wx-prepay-id",
    "signType": "RSA",
    "paySign": "signature"
  }
}
```

小程序拿到 `payment_request` 后直接调用：

```ts
wx.requestPayment({
  timeStamp: paymentRequest.timeStamp,
  nonceStr: paymentRequest.nonceStr,
  package: paymentRequest.package,
  signType: paymentRequest.signType,
  paySign: paymentRequest.paySign,
})
```

幂等返回：

```json
{
  "idempotent": true,
  "order": {
    "id": "existing-order-id",
    "status": "pending"
  },
  "product": null,
  "payment_request": null
}
```

出现 `idempotent=true` 且 `payment_request=null` 时，小程序不要再次拉起支付；应提示已有待支付订单或读取订单状态后让用户重新进入支付流程。

### 4. 查询充值订单

```text
GET /billing/recharge-orders/:id
```

返回：

```json
{
  "order": {
    "id": "tenant-credit-order-id",
    "order_no": "TC202607030001ABCDEF12",
    "amount_fen": 10000,
    "credits": 1000,
    "bonus_credits": 0,
    "status": "paid",
    "paid_at": "2026-07-03T10:01:00.000Z",
    "paid_amount_fen": 10000,
    "transaction_id": "4200000000202607030000000000"
  },
  "account": {
    "balance_credits": 1000,
    "available_credits": 1000,
    "frozen_credits": 0
  }
}
```

支付完成后的业务状态以服务端微信支付回调为准。`wx.requestPayment` 成功后，如果订单仍是 `pending`，小程序可以短轮询 `GET /billing/recharge-orders/:id`，直到：

- `paid`：充值到账，刷新 `GET /billing/account`。
- `closed`：订单关闭，提示重新下单。
- `refunded`：订单已退款，按退款态展示。
- 超时仍 `pending`：提示“支付处理中，请稍后刷新”。

## 后端回调行为

微信支付回调统一走：

```text
POST /pay/wechat/callback
```

后端会根据 `out_trade_no` 自动识别是否为平台积分充值订单。识别为积分充值后会：

1. 写入 `tenant_credit_wechat_notifications`。
2. 校验回调金额等于订单 `amount_fen`。
3. 调用积分入账逻辑。
4. 更新 `tenant_credit_orders.status=paid`。
5. 更新 `tenant_credit_accounts` 余额。
6. 写入 `tenant_credit_ledger`，`event_type=wechat_recharge`。

回调具备幂等处理能力。小程序不要直接写积分账户、积分流水或订单支付状态。

## 错误处理

小程序需要重点识别：

- `BILLING_RECHARGE_PRODUCT_NOT_FOUND`：套餐不存在或已停用，刷新套餐列表。
- `BILLING_RECHARGE_PAYMENT_CONFIG_INVALID`：平台微信支付配置未启用或未启用积分充值，提示暂不可充值。
- `BILLING_RECHARGE_PAYMENT_CONFIG_MISSING`：平台微信支付配置不完整，提示暂不可充值。
- `WECHAT_PAY_PREPAY_FAILED`：微信预下单失败，提示稍后重试。
- `TENANT_CONTEXT_REQUIRED`：登录态或租户上下文异常，重新登录或切换租户。
- `FORBIDDEN`：当前员工没有充值权限。
- `VALIDATION_ERROR`：请求字段格式错误。

不要把这些错误转成项目收款或 workflow 错误。

## 和项目收款的边界

平台积分充值不使用以下项目收款接口：

- `POST /finance/wechat-pay/orders`
- `/payments`
- `/finance/ledger`
- `/workflow-tasks/:taskId/complete`

项目装修款仍按原有 workflow 收款节点处理；平台积分充值只服务于租户积分余额。

## 建议 orange 改动点

只读建议，gooes 不修改 orange：

1. 员工首页抽屉增加“积分充值”入口。
2. 新增或复用积分服务模块：
   - `GET /billing/account`
   - `GET /billing/recharge-products`
   - `POST /billing/recharge-orders`
   - `GET /billing/recharge-orders/:id`
3. 新增充值套餐列表页：
   - 展示余额、套餐、赠送积分、支付按钮。
   - 点击支付时生成 `idempotency_key`。
4. 封装 `wx.requestPayment`：
   - 只使用后端返回的 `payment_request`。
   - 不缓存长期复用。
5. 支付完成后刷新：
   - 订单详情。
   - 积分账户。
   - 需要展示的积分流水页面。

## 建议 smoke 路径

1. 员工登录小程序。
2. 打开员工首页抽屉，进入“积分充值”。
3. `GET /billing/account` 显示当前积分。
4. `GET /billing/recharge-products` 显示可用套餐。
5. 选择小额套餐，调用 `POST /billing/recharge-orders`。
6. 使用返回的 `payment_request` 调起 `wx.requestPayment`。
7. 支付成功后轮询 `GET /billing/recharge-orders/:id`。
8. 确认订单 `status=paid`。
9. 确认 `GET /billing/account` 余额增加。
10. 平台 Admin `/platform/billing?tab=recharge` 可见充值订单。
11. 后端只读核查 `tenant_credit_ledger.event_type=wechat_recharge`。

本轮 smoke 不需要也不应该执行任何项目 workflow 推进。
