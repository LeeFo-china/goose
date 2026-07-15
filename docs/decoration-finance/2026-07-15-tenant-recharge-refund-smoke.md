# 租户积分充值退款 Phase 2F Smoke 清单

## 范围

本清单覆盖租户侧退款申请、平台侧审核和执行、微信退款回调、积分反向流水以及小程序展示状态。

真实微信退款只允许平台 Admin 或后端运营流程触发，小程序不得直接触发退款执行。

## 前置条件

- 已应用 `20260715103000_create_tenant_credit_refund_requests.sql`。
- 已应用 `20260715120000_confirm_tenant_credit_recharge_refunds.sql`。
- 平台微信支付配置为 `active`，并启用 `tenant_recharge` 通道。
- 待测订单为 `channel = wechat_pay` 且 `status = paid`。
- 租户积分账户 `available_credits >= credits + bonus_credits`。

## 租户侧申请

- 已支付微信充值订单可以创建退款申请。
- `pending`、`closed`、`refunded` 订单不能创建退款申请。
- 非 `wechat_pay` 订单不能创建退款申请。
- 超过 `paid_at + 30 days` 的订单不能创建退款申请。
- 可用积分不足时返回 `BILLING_RECHARGE_CREDITS_CONSUMED`。
- 相同 `idempotency_key` 重复提交返回同一退款申请。
- 同一 `idempotency_key` 不能跨订单复用。
- 已有 `pending_review`、`approved`、`refunding` 申请时不能再次创建。

## 订单列表展示

- `GET /billing/recharge-orders` 返回当前租户订单，不返回跨租户数据。
- 列表固定 `channel = wechat_pay`。
- 列表按 `created_at desc` 排序。
- `status` 筛选支持 `pending`、`paid`、`closed`、`refunded`。
- `keyword` 可匹配 `order_no`、`out_trade_no`、`transaction_id`。
- `refund_action` 由后端返回，小程序不本地推导退款资格。
- `pending_review`、`approved`、`refunding` 显示“退款审核中”。
- `refunded` 显示“已退款”。
- `rejected`、`failed` 或无退款状态的已支付订单允许重新展示“申请退款”。

## 平台审核

- 有 `platform.billing.recharge_refund.read` 的平台员工可以查看列表和详情。
- 有 `platform.billing.recharge_refund.review` 的平台员工可以审核。
- `pending_review -> approved` 可以执行。
- `pending_review -> rejected` 可以执行。
- `approved -> rejected` 可以执行。
- `refunding`、`refunded`、`failed` 不能再走审核通过。
- 审核通过和驳回写入平台审计日志。

## 平台执行

- `POST /platform/billing/recharge-refund-requests/:id/execute` 只允许平台 Admin 调用。
- 只有 `approved` 或 `failed` 申请可以执行。
- 订单必须有 `transaction_id`。
- 没有 `out_refund_no` 时使用 `request_no` 生成确定性退款单号。
- 调用微信退款前，申请和订单镜像状态先更新为 `refunding`。
- 微信退款请求成功后保存 `out_refund_no`、`wechat_refund_id`、微信原始响应和退款金额。
- 微信退款请求失败时申请和订单镜像状态更新为 `failed`，后续可从 `failed` 重试。
- 执行成功和失败都写入平台审计日志。

## 微信退款回调

- `REFUND.SUCCESS` 回调按 `out_refund_no` 匹配退款申请。
- 重复的已处理 `notify_id` 直接返回成功，不重复写积分流水。
- 成功回调调用 `billing_confirm_wechat_recharge_refund`。
- RPC 锁定退款申请、订单和积分账户。
- RPC 要求申请状态为 `refunding`，订单状态为 `paid`。
- RPC 要求可用积分足够覆盖 `credits + bonus_credits`。
- RPC 写入一条 `tenant_credit_ledger`：
  - `direction = out`
  - `event_type = wechat_recharge_refund`
  - `source_type = tenant_credit_refund_request`
  - `source_id = refund_request.id`
- RPC 更新退款申请为 `refunded`。
- RPC 更新订单为 `status = refunded`、`refund_status = refunded`。
- `REFUND.ABNORMAL` 或 `REFUND.CLOSED` 回调更新申请为 `failed`，订单镜像 `refund_status = failed`。

## 验证命令

```bash
bun test src/services/wechat-pay-callbacks.test.ts src/services/wechat-pay-callbacks-credit-recharge.test.ts src/services/wechat-pay-migration-contract.test.ts
bun test src/controllers/billing-recharge/routes.test.ts src/controllers/platform-billing-recharge-refunds/routes.test.ts src/services/billing-recharge.test.ts src/services/billing-recharge-refunds.test.ts src/services/billing-recharge-views.test.ts src/services/platform-billing-recharge-refunds.test.ts src/services/platform-billing-recharge-refund-execution.test.ts src/services/wechat-pay-gateway.test.ts src/services/wechat-pay-callbacks.test.ts src/services/wechat-pay-callbacks-credit-recharge.test.ts src/services/wechat-pay-migration-contract.test.ts
pnpm --filter api typecheck
pnpm --filter api build
supabase db push --dry-run --db-url "$DB_URL"
```
