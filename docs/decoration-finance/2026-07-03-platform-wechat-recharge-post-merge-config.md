# 平台微信充值 post-merge 配置记录

日期：2026-07-03

## 合并与清理

已将 `feature/platform-wechat-recharge` fast-forward merge 回 `main`。

已清理：

- worktree：`/Users/leefo/Public/work/gooes/.worktrees/platform-wechat-recharge`
- 分支：`feature/platform-wechat-recharge`

保留未处理：

- `main` 工作区原有 `.gitignore` 本地改动，未纳入本轮提交。

## 远端 migration

已使用 `.env.local` 中的 `SUPABASE_DB_DIRECT_URL` 和 `sslmode=disable`
执行远端 migration。

本轮已应用并复核 Local/Remote 对齐：

```text
20260702150000_platform_wechat_recharge_credit.sql
20260702161000_platform_payment_configs.sql
20260702170000_platform_credit_recharge_products.sql
20260703110000_platform_wechat_pay_secret_setting.sql
```

说明：

- `supabase migration list` 直连 linked project 会因 postgres 密码认证失败。
- 已按仓库历史口径使用 direct db url 复核。
- `20260703110000` 用于补齐 `PLATFORM_WECHAT_PAY_SECRET_BUNDLE` 系统设置 key。

## 平台微信支付配置

已通过应用层 service 写入远端配置，没有直接手写业务表。

平台配置只读结果：

```json
{
  "status": "active",
  "merchant_id": "1112582521",
  "app_id": "wxbac3b1e168fd968a",
  "notify_url": "https://api-dev.goodcms.cn/pay/wechat/callback",
  "enabled_channels": ["tenant_recharge"],
  "encrypted_config_ref": "secret://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  "has_serial_no": true
}
```

密钥包只读校验结果：

```json
{
  "private_key_pem": "present",
  "api_v3_key": "present-32",
  "wechat_pay_public_key_id": "PUB_KEY_ID_0111125825212026051200292008001403",
  "wechat_pay_public_key_pem": "present",
  "base_url": "https://api.mch.weixin.qq.com"
}
```

安全说明：

- 文档不记录私钥、APIv3 Key 或微信支付公钥正文。
- `api_v3_key` 使用“解密回调 key”，不是 APIv2 商户密钥。
- 当前回调地址按 dev smoke 配置为 `api-dev.goodcms.cn`。

## 充值套餐

远端已创建小额 smoke 套餐：

```json
{
  "id": "dd9cb0c7-2472-4b09-9cab-525832afc805",
  "code": "smoke_1fen",
  "title": "1分钱测试充值",
  "amount_fen": 1,
  "credits": 1,
  "bonus_credits": 0,
  "enabled": true,
  "sort_order": 1
}
```

租户侧只读验证：

```json
{
  "total": 1,
  "products": [
    {
      "code": "smoke_1fen",
      "title": "1分钱测试充值",
      "amount_fen": 1,
      "credits": 1,
      "bonus_credits": 0
    }
  ]
}
```

## 已执行验证

合并前后均执行过：

```text
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
bun test src/schema/billing-recharge.test.ts src/schema/platform-billing-recharge.test.ts src/services/billing-recharge.test.ts src/services/platform-billing-recharge.test.ts src/services/wechat-pay-callbacks.test.ts src/services/wechat-pay-callbacks-credit-recharge.test.ts src/controllers/billing-recharge/routes.test.ts src/controllers/platform-billing-recharge/routes.test.ts src/services/platform-payment-configs.test.ts
pnpm --dir apps/admin run check
bun test 'app/(console)/platform/billing/billing-page-data.test.ts' components/platform/platform-list-page-layout.test.ts
```

新增系统设置补丁执行过：

```text
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
bun test src/services/system-settings/legacy/definitions-payment.test.ts src/services/wechat-pay-secret-bundles.test.ts src/services/billing-recharge.test.ts src/services/platform-payment-configs.test.ts
```

## 未执行真实支付

未执行真实 `wx.requestPayment` 支付。

原因：

- 需要小程序侧提供当前支付用户在平台小程序 AppID 下的 `payer_openid`。
- 需要微信客户端完成真实支付动作。
- 后端终端不能替代小程序 JSAPI 支付流程。

## 小程序下一步

小程序可以按以下参数做真实 smoke：

- API：当前 dev API。
- 套餐：`package_code=smoke_1fen`
- 下单接口：`POST /billing/recharge-orders`
- 支付参数：使用响应里的 `payment_request` 原样调用 `wx.requestPayment`
- 支付后轮询：`GET /billing/recharge-orders/:id`

回填证据：

- `tenant_credit_orders.id`
- `order_no` / `out_trade_no`
- 微信 `transaction_id`
- `tenant_credit_ledger` 入账流水
- 支付前后 `GET /billing/account` 余额
- Admin `/platform/billing?tab=recharge` 订单可见性
