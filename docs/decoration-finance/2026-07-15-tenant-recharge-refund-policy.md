# 租户积分充值退款申请策略

## 退款边界

小程序只允许提交退款申请，不允许直接触发微信退款。
真实退款只能由平台 Admin 或后端运营流程审核后执行。

后端不得提供“把订单状态改成 `refunded`”的简化接口。退款必须同时考虑资金、积分、积分流水、订阅账单、平台收入、佣金或后续结算。

## 退款窗口

订单 `paid_at` 起 `30` 天内可申请退款。

超过退款窗口时，租户侧申请接口返回：

```text
BILLING_RECHARGE_REFUND_WINDOW_EXPIRED
```

## 金额和积分口径

- 退款金额：`tenant_credit_orders.paid_amount_fen`
- 反向积分：`tenant_credit_orders.credits + tenant_credit_orders.bonus_credits`
- 本阶段不支持部分退款。
- 退款申请金额必须等于原微信支付实付金额。

## 自助申请拦截

当 `tenant_credit_account_balances.available_credits < credits + bonus_credits` 时，后端拒绝创建退款申请并返回：

```text
BILLING_RECHARGE_CREDITS_CONSUMED
```

当可用积分足够时，后端也只创建 `pending_review` 申请，不执行资金退款。

原因是当前系统没有充值积分批次消耗模型，无法证明“这笔充值的积分”完全未被消费；可用积分足够只代表可以进入人工审核。

## 状态机

退款申请状态：

```text
pending_review -> approved -> refunding -> refunded
pending_review -> rejected
approved -> rejected
refunding -> failed
failed -> refunding
```

订单镜像字段：

| 字段 | 含义 |
| --- | --- |
| `refund_status` | 当前退款流程状态 |
| `refund_requested_at` | 首次提交退款申请时间 |
| `refund_amount_fen` | 实际退款金额，单位分 |
| `refunded_at` | 微信退款成功并完成积分反向流水的时间 |

订单主状态 `tenant_credit_orders.status` 只有在真实退款成功并完成积分反向流水后，才能更新为 `refunded`。

## 小程序展示

小程序只消费后端返回的 `refund_action`，不得本地推导退款资格。

建议展示规则：

| 后端返回 | 小程序展示 |
| --- | --- |
| `enabled = true` | 展示“申请退款”并要求填写原因 |
| `disabled_reason = REFUND_REQUEST_NOT_SUPPORTED` | 展示“退款申请暂未开放”或不展示入口 |
| `disabled_reason = REFUND_REQUEST_PENDING` | 展示“退款审核中” |
| `disabled_reason = ORDER_ALREADY_REFUNDED` | 展示“已退款” |
| 其他不可退原因 | 不展示按钮，详情中展示不可退款原因 |

## 租户侧申请接口

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

接口只创建退款申请，不执行微信退款。

权限：

- 长期权限：`billing.recharge.refund.request`
- 若产品决定短期兼容，可临时允许 `billing.recharge.create`，但需要在代码和交付说明中明确这是过渡策略。

后端必须校验：

1. 订单属于当前租户。
2. 订单 `channel = wechat_pay`。
3. 订单 `status = paid`。
4. 订单不是已退款。
5. 没有已有处理中退款申请。
6. 未超过退款窗口。
7. 当前可用积分足够覆盖 `credits + bonus_credits`。
8. `idempotency_key` 可重复提交并返回同一申请。

## 错误码

| 错误码 | 场景 |
| --- | --- |
| `BILLING_RECHARGE_ORDER_NOT_FOUND` | 订单不存在或不属于当前租户 |
| `BILLING_RECHARGE_ORDER_NOT_PAID` | 订单不是已支付状态 |
| `BILLING_RECHARGE_ORDER_ALREADY_REFUNDED` | 订单已退款 |
| `BILLING_RECHARGE_REFUND_REQUEST_PENDING` | 已有处理中退款申请 |
| `BILLING_RECHARGE_CREDITS_CONSUMED` | 可用积分不足，不能自助申请 |
| `BILLING_RECHARGE_REFUND_WINDOW_EXPIRED` | 超过退款窗口 |
| `FORBIDDEN` | 无退款申请权限 |
| `VALIDATION_ERROR` | 请求参数非法 |

## 平台审核边界

平台 Admin 审核只改变退款申请状态，不等同于微信退款成功。

建议分三步：

1. `pending_review -> approved`：运营审核同意，可进入退款执行。
2. `approved -> refunding`：调用微信退款前置状态。
3. `refunding -> refunded`：微信退款成功回调并完成积分反向流水。

驳回时：

```text
pending_review -> rejected
approved -> rejected
```

## 真实微信退款边界

真实退款执行必须单独设计并验证：

- `out_refund_no`
- 微信退款 ID
- 微信退款状态
- 微信退款回调
- 退款失败补偿
- 退款成功后的积分反向流水
- 退款导致系统账单欠费时是否锁定租户
- 平台收入、合伙人佣金或结算冲回
- 审计日志和操作人记录

小程序不得调用真实退款执行接口。
