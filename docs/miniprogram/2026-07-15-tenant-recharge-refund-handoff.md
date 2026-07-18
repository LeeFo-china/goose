# 小程序租户积分充值退款后端交接

## 责任边界

小程序只允许展示充值记录、展示后端返回的退款状态、提交退款申请。

小程序不得调用真实微信退款执行接口。真实退款由平台 Admin 审核后执行，并由微信退款回调触发积分反向流水。

## 充值记录列表

```http
GET /billing/recharge-orders?page=1&pageSize=20&status=paid&keyword=TC...
```

前端不传 `tenant_id`，后端根据当前员工登录态识别租户。

后端保证：

- 只返回当前租户订单。
- 只返回 `channel = wechat_pay`。
- 支持分页，默认 `page=1&pageSize=20`。
- 支持 `status`：`pending`、`paid`、`closed`、`refunded`。
- 支持 `keyword` 匹配 `order_no`、`out_trade_no`、`transaction_id`。
- 固定按 `created_at desc` 排序。
- 账单锁定期间允许访问。

返回字段包含：

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "order_no": "TC202607...",
  "package_code": "credit_1000",
  "product_title": "1000 积分套餐",
  "amount_fen": 10000,
  "credits": 1000,
  "bonus_credits": 100,
  "channel": "wechat_pay",
  "status": "paid",
  "paid_at": "2026-07-14T09:20:00.000Z",
  "paid_amount_fen": 10000,
  "out_trade_no": "TC202607...",
  "transaction_id": "420000...",
  "refund_status": "pending_review",
  "refund_requested_at": "2026-07-14T10:00:00.000Z",
  "refunded_at": null,
  "refund_amount_fen": null,
  "refund_action": {
    "enabled": false,
    "label": "退款审核中",
    "disabled_reason": "REFUND_REQUEST_PENDING",
    "requires_reason": true
  },
  "created_at": "2026-07-14T09:18:00.000Z",
  "updated_at": "2026-07-14T10:00:00.000Z"
}
```

`product_title` 优先来自 `metadata.product_snapshot.title`，为空时小程序可 fallback 到 `package_code`。

`refund_action` 的当前契约不包含 `code` 字段。不可用原因只通过
`disabled_reason` 返回；小程序不应读取或依赖 `refund_action.code`。

## 退款申请

```http
POST /billing/recharge-orders/:id/refund-requests
```

请求体：

```json
{
  "reason": "客户误充值，需要申请退款",
  "idempotency_key": "uuid-v4"
}
```

成功响应：

```json
{
  "request": {
    "id": "uuid",
    "order_id": "uuid",
    "status": "pending_review",
    "reason": "客户误充值，需要申请退款",
    "created_at": "2026-07-14T10:00:00.000Z"
  },
  "order": {
    "id": "uuid",
    "status": "paid",
    "refund_status": "pending_review",
    "refund_action": {
      "enabled": false,
      "label": "退款审核中",
      "disabled_reason": "REFUND_REQUEST_PENDING",
      "requires_reason": true
    }
  }
}
```

权限：

- `billing.recharge.refund.request`

后端校验：

- 订单属于当前租户。
- 订单 `channel = wechat_pay`。
- 订单 `status = paid`。
- 订单未退款。
- 没有处理中退款申请。
- 未超过 30 天退款窗口。
- 可用积分不少于 `credits + bonus_credits`。
- `idempotency_key` 重复提交返回同一申请。

## 小程序展示规则

小程序只消费 `refund_action`，不本地推导退款资格。
状态分支统一读取 `refund_action.disabled_reason`，不读取 `refund_action.code`。

| 后端状态 | 小程序建议 |
| --- | --- |
| `refund_action.enabled = true` | 展示“申请退款”，二次确认并要求填写原因 |
| `disabled_reason = REFUND_REQUEST_PENDING` | 展示“退款审核中” |
| `disabled_reason = ORDER_ALREADY_REFUNDED` | 展示“已退款” |
| `disabled_reason = ORDER_NOT_PAID` | 不展示退款按钮 |
| `disabled_reason = ORDER_CLOSED` | 不展示退款按钮 |

当前后端已支持完整退款状态：

```text
pending_review -> approved -> refunding -> refunded
pending_review -> rejected
approved -> rejected
refunding -> failed
failed -> refunding
```

其中：

- `pending_review`、`approved`、`refunding`：小程序显示审核/处理中，不允许重复申请。
- `refunded`：显示已退款。
- `rejected`、`failed`：后端会重新返回可申请状态，前端可再次展示申请入口。

## 错误码

| 错误码 | 含义 |
| --- | --- |
| `BILLING_RECHARGE_ORDER_NOT_FOUND` | 订单不存在或不属于当前租户 |
| `BILLING_RECHARGE_ORDER_NOT_PAID` | 订单不是已支付状态 |
| `BILLING_RECHARGE_ORDER_ALREADY_REFUNDED` | 订单已退款 |
| `BILLING_RECHARGE_REFUND_REQUEST_PENDING` | 已有处理中退款申请 |
| `BILLING_RECHARGE_CREDITS_CONSUMED` | 可用积分不足 |
| `BILLING_RECHARGE_REFUND_WINDOW_EXPIRED` | 超过 30 天退款窗口 |
| `BILLING_RECHARGE_REFUND_IDEMPOTENCY_CONFLICT` | 幂等键被其他订单使用 |
| `FORBIDDEN` | 无权限 |
| `VALIDATION_ERROR` | 请求参数非法 |

## 后端执行链路

平台 Admin 审核通过后，后端可执行：

```http
POST /platform/billing/recharge-refund-requests/:id/execute
```

该接口仅供平台侧使用。执行后状态进入 `refunding`。

微信退款成功回调 `REFUND.SUCCESS` 后，后端会：

- 调用 `billing_confirm_wechat_recharge_refund`。
- 扣减 `credits + bonus_credits`。
- 写入 `tenant_credit_ledger` 反向流水。
- 更新申请为 `refunded`。
- 更新订单为 `status = refunded`、`refund_status = refunded`。

微信退款失败回调 `REFUND.ABNORMAL` 或 `REFUND.CLOSED` 后，后端会：

- 更新申请为 `failed`。
- 更新订单镜像 `refund_status = failed`。
- 允许平台侧后续从 `failed` 重新执行退款。
