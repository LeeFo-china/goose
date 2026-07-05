# 平台积分充值建单外键修复对接记录

日期：2026-07-03

## 背景

orange 小程序侧反馈 `POST /billing/recharge-orders` 返回：

```json
{
  "message": "创建积分充值订单失败"
}
```

小程序侧请求体只提交：

```json
{
  "package_code": "smoke_1fen",
  "payer_openid": "<openid>",
  "idempotency_key": "<client-generated-key>"
}
```

这符合后端契约：金额、积分、支付配置由后端按套餐和平台支付配置决定，小程序不应上传
`amount`、`credits` 或 `payment_config_id`。

## 根因

`BillingRechargeService` 使用平台统一收款配置创建积分充值订单：

- 配置来源：`platform_payment_configs`
- 写入字段：`tenant_credit_orders.payment_config_id = platform_payment_configs.id`

但历史 migration `20260702150000_platform_wechat_recharge_credit.sql` 把
`tenant_credit_orders.payment_config_id` 外键建到了 `tenant_payment_configs(id)`。

这会导致平台支付配置 ID 写入租户订单时被数据库外键拒绝，最终在 repository 层包装成
`创建积分充值订单失败`。

## 修复

新增 migration：

```text
supabase/migrations/20260703123000_fix_tenant_credit_order_platform_payment_fk.sql
```

修复内容：

- 删除旧外键：`tenant_credit_orders_payment_config_id_fkey`
- 重建外键到：`public.platform_payment_configs(id)`
- 保持 `ON DELETE SET NULL`

不改历史已发布 migration。

## 远端 migration 状态

已执行：

```bash
supabase db push --db-url <remote> --dry-run
supabase db push --db-url <remote> --yes
supabase migration list --db-url <remote>
```

确认 Local/Remote 已对齐到：

```text
20260703123000 | 20260703123000 | 2026-07-03 12:30:00
```

## 后端 smoke

为避免真实扣款，本次 smoke 使用真实 repository + 远端数据库，mock 微信预支付网关，
只验证数据库外键和建单链路。

执行账号上下文：

- 租户：固始晴天装饰工程有限公司
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- 套餐：`smoke_1fen`

结果：

```json
{
  "order_id": "909becbf-47a4-463b-bdcc-efb3285bc6d6",
  "order_no": "TCFIX1783046943248",
  "out_trade_no": "TCFIX1783046943248",
  "status": "pending",
  "amount_fen": 1,
  "credits": 1,
  "prepay_id": "prepay-smoke-TCFIX1783046943248",
  "product_code": "smoke_1fen"
}
```

订单落库复核：

```json
{
  "order_id": "909becbf-47a4-463b-bdcc-efb3285bc6d6",
  "order_no": "TCFIX1783046943248",
  "order_status": "pending",
  "payment_config_id": "10794e96-3007-440c-994a-e5db39a5dc26",
  "platform_config_provider": "wechat_pay",
  "platform_config_status": "active",
  "enabled_channels": ["tenant_recharge"]
}
```

## 小程序复测口径

小程序侧可以按原契约重新复测：

```http
POST /billing/recharge-orders
Authorization: Bearer <employee-token>
Content-Type: application/json
```

请求体：

```json
{
  "package_code": "smoke_1fen",
  "payer_openid": "<当前平台小程序 openid>",
  "idempotency_key": "<新的幂等键>"
}
```

注意：

- 如果之前失败发生在订单插入阶段，建议使用新的 `idempotency_key` 复测。
- 小程序不要传金额、积分、`payment_config_id`。
- 后端返回 `payment_request` 后，小程序再调用 `wx.requestPayment`。
- 真实支付成功后，请回填 `order.id`、`order_no/out_trade_no`、微信交易号、回调结果、
  积分账户余额和积分流水截图或接口日志。

## 未覆盖项

本次后端 smoke 没有发起真实微信支付，所以没有验证：

- 微信真实预支付返回
- 用户真实支付
- 微信回调解密与验签
- `billing_confirm_wechat_recharge` 入账
- 积分账户余额和积分流水最终变化

这些需要小程序侧用真实 openid 和 `wx.requestPayment` 完成小额支付 smoke 后闭环。
