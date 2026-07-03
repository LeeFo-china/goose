# 平台积分充值微信查单补偿记录

日期：2026-07-03

## 背景

平台积分充值已经完成小程序拉起支付、微信回调、订单 paid、积分余额增加和积分流水生成的闭环验证。为处理“用户实际已支付，但微信回调未到或处理失败导致订单仍 pending”的运维场景，本次补充平台侧受控查单补偿能力。

## 新增能力

- 平台超管接口：`POST /platform/billing/recharge-orders/:id/compensate`
- 可选请求体：`{ "reason": "..." }`
- 接口只处理 `channel=wechat_pay` 且 `status=pending` 的积分充值订单。
- 后端按订单 `out_trade_no` 调用微信支付 APIv3 查单：`GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid={mchid}`。
- 微信返回 `trade_state=SUCCESS` 时，校验 `amount.total` 必须等于订单 `amount_fen`。
- 入账仍统一调用 `billing_confirm_wechat_recharge` RPC，不直接改订单、账户或流水表。
- 补偿会生成 `tenant_credit_wechat_notifications` 记录，`notify_id=query-compensation:{transaction_id}`，并写入平台审计日志。

## 边界

- 微信返回非 `SUCCESS` 时只返回查单结果，不创建 notification，不执行入账。
- 金额不一致时返回 409，不执行入账。
- 已 paid 订单按幂等结果返回，不重复入账。
- 该能力是平台/Admin 运维兜底入口，小程序不需要新增调用。

## 验证

- `bun test src/services/platform-billing-recharge.test.ts src/controllers/platform-billing-recharge/routes.test.ts src/services/wechat-pay-gateway.test.ts`
- `bun run typecheck`
