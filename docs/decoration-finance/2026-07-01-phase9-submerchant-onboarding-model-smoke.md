# Phase 9 租户特约商户进件模型 Smoke

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮完成支付主体和租户服务商子商户进件状态的基础模型。

已完成：

1. 新增 migration：
   - `supabase/migrations/20260701143000_wechat_pay_submerchant_onboarding.sql`

2. `tenant_payment_configs` 增加租户进件和 AppID 绑定字段：
   - `principal_type`
   - `applyment_business_code`
   - `applyment_id`
   - `applyment_state`
   - `applyment_state_message`
   - `appid_binding_state`
   - `appid_binding_message`
   - `opened_at`
   - `suspended_at`

3. 新增约束和索引：
   - `tenant_payment_configs_principal_type_check`
   - `tenant_payment_configs_applyment_state_check`
   - `tenant_payment_configs_appid_binding_state_check`
   - `tenant_payment_configs_sub_merchant_unique_idx`
   - `tenant_payment_configs_applyment_business_code_unique_idx`
   - `tenant_payment_configs_applyment_state_idx`
   - `tenant_payment_configs_appid_binding_state_idx`

4. API 配置读写扩展：
   - `GET /finance/wechat-pay/config` 返回进件和 AppID 绑定状态。
   - `PUT /finance/wechat-pay/config` 可保存进件和 AppID 绑定状态。
   - 新字段不在 schema 层自动默认，避免旧客户端保存时误重置已有状态。
   - 不接收任何 APIv3 key、私钥、证书内容或回调解密 key 明文字段。

5. Admin 配置页扩展：
   - 收款主体。
   - 进件业务编号。
   - 微信申请单号。
   - 进件状态。
   - 进件状态说明。
   - AppID 绑定状态。
   - AppID 绑定说明。

6. 微信支付订单创建 guard：
   - 配置必须为 `active`。
   - 服务商子商户必须已有 `sub_mchid` / `sub_appid`。
   - 服务商子商户必须 `applyment_state=opened` 且 `appid_binding_state=bound`。
   - 订单 `metadata` 记录非敏感路由信息，供后续真实下单和回调闭环使用。

## 状态枚举

### principal_type

```text
platform
tenant
```

### applyment_state

```text
not_started
draft
submitted
reviewing
rejected
account_verifying
signing
opened
suspended
closed
```

### appid_binding_state

```text
not_required
not_bound
pending_confirm
bound
rejected
```

## 验证记录

API 单测和类型检查：

```bash
(cd apps/api && bun test src/schema/wechat-pay-configs.test.ts \
  src/services/wechat-pay-configs.test.ts \
  src/services/wechat-pay-migration-contract.test.ts \
  src/services/wechat-pay-orders.test.ts \
  src/types/database-wechat-pay-contract.test.ts)
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/api run check:file-size
```

结果：

- 微信支付相关 API 测试 26 pass。
- API typecheck 通过。
- API file-size check 通过。

Admin 测试和类型检查：

```bash
(cd apps/admin && bun test components/finance/finance-wechat-pay-page-layout.test.ts)
pnpm --dir apps/admin check
```

结果：

- Admin 微信支付页面布局测试 3 pass。
- Admin check 通过。

全局：

```bash
git diff --check
```

结果：通过。

## 小程序边界

本轮小程序无必改。

原因：

- 本轮只扩展 Admin/API 的微信支付配置和租户进件状态。
- 小程序仍不选择商户号、不管理 `sub_mchid`、不保存支付密钥。
- 后续真实支付联调时，小程序继续只消费后端返回的 workflow action 和 `payment_request`。

## 未完成事项

以下留到后续任务：

1. 平台级直连支付配置的独立管理入口。
2. 服务商/直连双模式真实微信支付下单 adapter。
3. `/pay/wechat/callback` 回调验签、解密、通知落库和幂等处理。
4. 支付成功后自动创建 confirmed payment、核销应收、写台账、推进 workflow。
