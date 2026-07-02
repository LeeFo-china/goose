# 平台微信充值积分实现与验证记录

日期：2026-07-03

分支：`feature/platform-wechat-recharge`

## 本轮范围

本轮完成平台独立微信支付充值积分链路的后端、Admin 和小程序对接文档。

已完成：

1. 增加平台微信充值积分 PRD。
2. 增加积分充值订单、微信支付字段、回调记录、套餐初始化等 migration。
3. 增加租户侧充值接口：
   - `GET /billing/recharge-products`
   - `POST /billing/recharge-orders`
   - `GET /billing/recharge-orders/:id`
4. 接入平台充值微信支付回调：
   - 通过 `out_trade_no` 匹配 `tenant_credit_orders`。
   - 写入 `tenant_credit_wechat_notifications`。
   - 校验回调金额。
   - 幂等调用积分入账。
5. 增加平台侧充值管理接口：
   - `GET /platform/billing/recharge-products`
   - `POST /platform/billing/recharge-products`
   - `PATCH /platform/billing/recharge-products/:id`
   - `GET /platform/billing/recharge-orders`
6. 增加 Admin 平台计费中心“微信充值”页：
   - 平台微信支付配置摘要与编辑入口。
   - 充值套餐管理。
   - 充值订单查看与筛选。
7. 增加小程序对接文档：
   - `docs/decoration-finance/2026-07-03-platform-wechat-recharge-miniprogram-handoff.md`

## 提交记录

```text
6b8c125f docs(billing): 增加平台微信充值小程序对接文档
82ca7d71 feat(admin): 增加平台微信充值管理
00c7f237 feat(billing): 增加平台充值管理接口
ad571ff2 feat(billing): 接入积分充值微信回调
b132f93f feat(billing): 增加积分充值订单接口
2740aa15 feat(payment): 增加平台微信支付配置
05bd3503 feat(billing): 增加微信积分充值迁移
5618ab71 docs(finance): 增加平台微信充值积分PRD
```

## 验证结果

### API 类型检查

```text
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

结果：通过，退出码 `0`。

### API 关键单测

```text
bun test src/schema/billing-recharge.test.ts \
  src/schema/platform-billing-recharge.test.ts \
  src/services/billing-recharge.test.ts \
  src/services/platform-billing-recharge.test.ts \
  src/services/wechat-pay-callbacks.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  src/controllers/billing-recharge/routes.test.ts \
  src/controllers/platform-billing-recharge/routes.test.ts \
  src/services/platform-payment-configs.test.ts
```

结果：

```text
29 pass
0 fail
73 expect() calls
```

### Admin 检查

```text
pnpm --dir apps/admin run check
```

结果：

```text
admin file size check passed: 649 TS/TSX files <= 500 lines
tsc -p tsconfig.json --noEmit
```

退出码 `0`。

### Admin 页面数据单测

```text
bun test 'app/(console)/platform/billing/billing-page-data.test.ts' \
  components/platform/platform-list-page-layout.test.ts
```

结果：

```text
21 pass
0 fail
239 expect() calls
```

### Git 空白检查

```text
git diff --check
```

结果：通过，退出码 `0`。

## 未执行项

未执行真实微信支付小额支付 smoke。原因：

- 真实 JSAPI 支付需要小程序侧提供当前支付用户在平台小程序 AppID 下的 `openid`。
- 需要用户在微信客户端完成真实支付动作。
- 后端终端不能替代 `wx.requestPayment` 客户端流程。

小程序侧拿到本文档后，可以按小额套餐完成真实 smoke，并回填：

- `tenant_credit_orders.id`
- `order_no` / `out_trade_no`
- 微信 `transaction_id`
- `tenant_credit_ledger` 入账流水
- 支付前后 `GET /billing/account` 余额
- 平台 Admin `/platform/billing?tab=recharge` 订单截图或接口结果

## 当前边界

平台积分充值不使用项目收款 workflow：

- 不调用 `/finance/wechat-pay/orders`。
- 不调用 `/payments`。
- 不写项目 `finance_ledger`。
- 不调用 `/workflow-tasks/:taskId/complete`。

项目装修款仍按租户项目收款 workflow 处理；平台积分充值只改变租户积分账户。
