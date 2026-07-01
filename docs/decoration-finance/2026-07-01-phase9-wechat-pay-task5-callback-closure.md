# Phase 9 微信支付 Task 5：支付回调闭环

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮完成微信支付 JSAPI 支付成功后的服务端回调闭环。

已完成：

1. 公共回调接口：
   - `POST /pay/wechat/callback`
   - 不需要员工 token。
   - 已加入 API auth public route 白名单。
   - 使用 Fastify route-level `preParsing` 捕获原始 body 用于验签。
   - 返回微信支付要求的成功结构：

```json
{
  "code": "SUCCESS",
  "message": "成功"
}
```

2. 回调安全校验：
   - 使用 `Wechatpay-Timestamp`、`Wechatpay-Nonce`、原始 body 验签。
   - 使用密钥 bundle 中的 `wechat_pay_public_key_pem` 校验签名。
   - 使用 APIv3 key 解密 `resource.ciphertext`。
   - 解密算法：AES-256-GCM。
   - 不在错误响应中返回密钥、证书或明文敏感信息。

3. 多主体配置匹配：
   - 回调先读取 active 的微信支付候选配置。
   - 按密钥引用加载 secret bundle。
   - 如果 `Wechatpay-Serial` 与 `wechat_pay_public_key_id` 不一致，则跳过该候选。
   - 某个候选解密失败时继续尝试下一个候选。
   - 解密后按 `out_trade_no` 找到微信支付订单。
   - 订单的 `payment_config_id` 必须与命中的配置一致。

4. 幂等通知：
   - 写入 `wechat_payment_notifications`。
   - 同一租户同一 `notify_id` 已处理时直接返回成功。
   - 处理失败会记录 `error_message`，等待微信支付重试。

5. 支付成功闭环：
   - 校验回调金额与订单金额一致。
   - 创建 `status=confirmed` 的 `payments`：
     - `payment_channel=wechat_pay`
     - `provider=wechat_pay`
     - `provider_transaction_id=transaction_id`
     - `out_trade_no=out_trade_no`
     - `source_type=wechat_pay_order`
     - `source_id=wechat_payment_orders.id`
   - 复用 `workflowTaskPaymentBridge`：
     - 核销应收计划。
     - 写入项目收款财务台账。
     - 完成当前收款 workflow task。
     - 同步 workflow subject state。
   - 回写 `wechat_payment_orders`：
     - `status=paid`
     - `payment_id`
     - `transaction_id`
     - `paid_amount`
     - `paid_at`
     - `latest_notification_id`

6. 查询性能边界：
   - 新增 `wechat_payment_orders_out_trade_no_idx`。
   - 新增 `tenant_payment_configs_wechat_callback_candidates_idx`。
   - migration：`supabase/migrations/20260701170000_wechat_pay_callback_lookup_indexes.sql`

## Secret Bundle 要求

`tenant_payment_configs.encrypted_config_ref` 指向的 JSON 至少需要：

```json
{
  "private_key_pem": "PEM 私钥",
  "api_v3_key": "32 字节 APIv3 key",
  "wechat_pay_public_key_id": "微信支付公钥 ID",
  "wechat_pay_public_key_pem": "微信支付公钥 PEM"
}
```

说明：

- `private_key_pem` 用于 API v3 请求签名和小程序支付参数签名。
- `api_v3_key` 用于解密回调 resource。
- `wechat_pay_public_key_pem` 用于验证微信支付回调签名。
- `wechat_pay_public_key_id` 用于匹配 `Wechatpay-Serial`，减少错误候选。

## 未完成

- 尚未对真实微信支付环境执行小额支付 smoke。
- 远端 Supabase migration 尚未成功验证；当前阻塞是数据库密码认证失败。
- 生产密钥轮换和证书文件权限治理仍需要上线前完成。
- 退款、关单、查单和对账下载不在本轮范围。

## 验证记录

```bash
(cd apps/api && bun test \
  src/services/wechat-pay-callback-crypto.test.ts \
  src/services/wechat-pay-callbacks.test.ts \
  src/controllers/wechat-pay-callbacks/routes.test.ts \
  src/services/wechat-pay-migration-contract.test.ts)
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/api run check:file-size
git diff --check
```

结果：

- 回调相关测试 14 pass。
- API typecheck 通过。
- API file-size check 通过。
- `git diff --check` 通过。
