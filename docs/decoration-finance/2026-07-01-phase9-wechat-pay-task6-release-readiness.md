# Phase 9 微信支付 Task 6：发布前验收与剩余门禁

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本记录用于收口 Phase 9 Task 1-6 的代码侧、数据库侧和对接侧验收。

本轮已覆盖：

1. 支付主体和服务商子商户方案文档。
2. 微信支付数据模型、权限、子商户进件状态和回调查询索引。
3. 租户微信支付配置 API、Admin 配置页和订单只读页。
4. 微信支付订单创建、`payer_openid`、JSAPI 预下单和小程序 `payment_request`。
5. 微信支付回调验签、解密、通知幂等、confirmed payment、应收核销、台账和 workflow 推进。
6. 小程序对接说明和发布前验收记录。

## 代码提交

本阶段关键提交：

```text
81af9080 docs(finance): 明确微信支付主体与子商户方案
80eac6ef feat(finance): 增加租户微信支付进件模型
c225c681 feat(finance): 校验微信支付商户配置状态
2a332885 feat(finance): 支持微信支付订单付款人openid
a906e72d feat(finance): 增加微信支付下单签名基础
236bc20d feat(finance): 接入微信支付预下单网关
09b54cff feat(finance): 接入微信支付回调闭环
```

## Migration 验收

本阶段新增并应用的 migration：

```text
supabase/migrations/20260701093000_wechat_pay_models.sql
supabase/migrations/20260701143000_wechat_pay_submerchant_onboarding.sql
supabase/migrations/20260701170000_wechat_pay_callback_lookup_indexes.sql
```

验证命令：

```bash
PGSSLMODE=disable supabase migration list --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

最新结果摘要：

```text
20260701093000 | 20260701093000 | 2026-07-01 09:30:00
20260701143000 | 20260701143000 | 2026-07-01 14:30:00
20260701170000 | 20260701170000 | 2026-07-01 17:00:00
```

结论：Phase 9 微信支付相关 migration Local/Remote 已对齐。

应用 `20260701143000` 时出现的 notice 为首次执行 `DROP CONSTRAINT IF EXISTS`
的预期输出，不影响 migration 成功：

```text
constraint "..._check" of relation "tenant_payment_configs" does not exist, skipping
```

## 远端只读 schema 核查

使用 Supabase REST 只读查询确认关键对象可访问：

```text
tenant_payment_configs: 200
wechat_payment_orders: 200
wechat_payment_notifications: 200
```

核查字段包括：

- `tenant_payment_configs.principal_type`
- `tenant_payment_configs.applyment_state`
- `tenant_payment_configs.appid_binding_state`
- `wechat_payment_orders.out_trade_no`
- `wechat_payment_orders.prepay_id`
- `wechat_payment_notifications.notify_id`
- `wechat_payment_notifications.processed`

## 自动化验证

后端微信支付相关测试：

```bash
(cd apps/api && bun test \
  src/services/wechat-pay-callback-crypto.test.ts \
  src/services/wechat-pay-callbacks.test.ts \
  src/controllers/wechat-pay-callbacks/routes.test.ts \
  src/services/wechat-pay-migration-contract.test.ts \
  src/services/wechat-pay-secret-bundles.test.ts \
  src/services/wechat-pay-gateway.test.ts \
  src/services/wechat-pay-signatures.test.ts \
  src/services/wechat-pay-jsapi-request-builder.test.ts \
  src/schema/wechat-pay-orders.test.ts \
  src/services/wechat-pay-orders.test.ts \
  src/services/workflow-task-payment-bridge.test.ts)
```

结果：

```text
45 pass
0 fail
147 expect() calls
```

静态检查：

```bash
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/api run check:file-size
git diff --check
```

结果：

- API typecheck 通过。
- API file-size check 通过。
- `git diff --check` 通过。

## 小程序对接结论

对接文档：

```text
docs/decoration-finance/2026-07-01-phase9-wechat-pay-miniprogram-handoff.md
```

小程序侧需要做的事：

1. 在收款 workflow 节点上，根据后端 action 展示微信支付入口。
2. 创建订单时调用：

```text
POST /finance/wechat-pay/orders
```

3. 请求体传：

```json
{
  "project_id": "project-id",
  "receivable_plan_id": "receivable-plan-id",
  "workflow_task_id": "workflow-task-id",
  "amount": 10000,
  "payer_openid": "用户在平台小程序 AppID 下的 openid"
}
```

4. 后端返回 `payment_request` 后调用：

```ts
wx.requestPayment(payment_request)
```

5. 支付完成后只刷新后端状态，不在本地创建 payment、核销应收、写台账或推进 workflow。

## 生产前剩余门禁

以下事项仍需要在正式上线前完成：

1. 轮换已在沟通中暴露过的支付配置敏感材料、证书和公私钥材料。
2. 将真实密钥材料写入密钥管理系统，并让 `tenant_payment_configs.encrypted_config_ref`
   指向该 secret bundle。
3. 确认测试环境回调域名：

```text
https://api-dev.goodcms.cn/pay/wechat/callback
```

4. 确认生产环境回调域名：

```text
https://api.goodcms.cn/pay/wechat/callback
```

5. 准备真实支付 smoke 样本：
   - 可执行的收款 workflow task。
   - 已绑定平台小程序 AppID 的用户 openid。
   - 已配置 active 的微信支付商户配置。
   - 金额建议使用最小可支付金额。

6. 执行真实小额支付 smoke，并回填：
   - project ID
   - workflow task ID
   - wechat_payment_order ID
   - out_trade_no
   - transaction_id
   - payment ID
   - ledger ID
   - receivable allocation ID
   - workflow current node
   - Admin 财务台账截图或接口证据

## 当前结论

Phase 9 微信支付代码侧和数据库侧已经具备联调条件。

正式开放线上支付入口前，必须先完成密钥轮换和真实小额支付 smoke。
