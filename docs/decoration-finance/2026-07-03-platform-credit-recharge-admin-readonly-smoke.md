# 平台积分充值 Admin 只读 Smoke

日期：2026-07-03

## 范围

本轮只验证平台 Admin 能否只读看到真实 1 分钱积分充值闭环结果。

不执行以下操作：

- 不创建新充值订单。
- 不重复支付。
- 不手工修改积分账户、订单状态或流水。
- 不执行人工充值。

## 验证对象

```text
tenant_id      = 3eebca47-961f-4899-b976-a3d3208d326b
tenant_name    = 固始晴天装饰工程有限公司
order_id       = 25203845-9497-4856-9c6f-c13c393190cd
order_no       = TC202607030350144069CF5EEF8
transaction_id = 4200003222202607030242248069
ledger_id      = 776e56fc-89d7-4592-8090-c68ddbd0edbf
```

## 登录账号

平台超管：

```text
phone       = 19900000001
employee   = Dev 超级管理员
employee_id = bcf573b8-79e1-4451-a2c1-a1582c8fed72
roles      = system_admin, platform_admin
tenant     = null
```

对照核查：

- `18800000001 / 风清扬` 是固始晴天租户管理员，不是平台超管。
- 该账号访问 `/platform/billing/*` 返回 `403 FORBIDDEN`，符合权限边界。

## 只读接口结果

### 充值订单

接口：

```http
GET /platform/billing/recharge-orders?page=1&pageSize=10&status=paid&keyword=TC202607030350144069CF5EEF8
```

结果：

```text
message         = success
pagination.total = 1
order.status    = paid
amount_fen      = 1
paid_amount_fen = 1
credits         = 1
bonus_credits   = 0
paid_at         = 2026-07-03T03:50:22+00:00
transaction_id  = 4200003222202607030242248069
tenant_name     = 固始晴天装饰工程有限公司
```

结论：平台 Admin 充值订单列表可见该笔微信充值订单。

### 租户积分账户

接口：

```http
GET /platform/billing/tenants?page=1&pageSize=10&keyword=固始晴天
```

结果：

```text
message                  = success
pagination.total          = 1
balance_credits           = 1
available_credits         = 1
frozen_credits            = 0
total_recharged_credits   = 1
total_consumed_credits    = 0
status                    = active
last_recharged_at         = 2026-07-03T03:50:22+00:00
```

结论：平台 Admin 租户账户列表可见积分余额已增加 1。

### 积分流水

接口：

```http
GET /platform/billing/ledger?page=1&pageSize=10&source_type=tenant_credit_order&keyword=TC202607030350144069CF5EEF8
```

结果：

```text
message        = success
pagination.total = 1
ledger.id      = 776e56fc-89d7-4592-8090-c68ddbd0edbf
event_type     = wechat_recharge
direction      = in
change_credits = 1
balance_after  = 1
source_type    = tenant_credit_order
source_id      = 25203845-9497-4856-9c6f-c13c393190cd
source_no      = TC202607030350144069CF5EEF8
remark         = 微信支付积分充值
created_at     = 2026-07-03T04:24:30.130431+00:00
```

结论：平台 Admin 计费流水列表可按订单号筛选到该笔 `wechat_recharge` 入账流水。

## 顺带发现并修复的问题

首次只读 smoke 时，流水接口不带 `keyword` 能返回该流水，但带订单号 keyword 返回：

```text
500 DB_ERROR
message = 查询积分流水失败
details.message = column tenant_credit_ledger.order_no does not exist
```

根因：

- `tenant_credit_ledger` 表真实字段是 `source_no`。
- repository 的 keyword 查询误用了不存在的 `order_no` 字段。

修复：

```text
59d8c167 fix(billing): 修复积分流水订单号搜索
```

修复后 dev API 发布成功：

```text
deploy run = https://github.com/LeeFo-china/goose/actions/runs/28641163248
```

回归验证：

- `GET /platform/billing/ledger?...&keyword=TC202607030350144069CF5EEF8` 返回 `200 success`。
- `pagination.total = 1`。
- 返回流水为 `776e56fc-89d7-4592-8090-c68ddbd0edbf`。

## 本地验证

```text
bun test ./src/repositories/billing/legacy/events.test.ts ./src/services/platform-billing-recharge.test.ts ./src/controllers/platform-billing-recharge/routes.test.ts
结果：7 pass

pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
结果：通过

git diff --check
结果：通过
```

## 结论

平台积分充值 Admin 只读 smoke 通过：

- 平台超管权限边界正常。
- 充值订单可见。
- 租户积分账户余额可见。
- 积分流水可见。
- 订单号 keyword 搜索已修复并完成 dev 发布验证。

小程序侧无需新增改动；小程序只需要刷新订单和积分账户确认 paid 与余额变更。
