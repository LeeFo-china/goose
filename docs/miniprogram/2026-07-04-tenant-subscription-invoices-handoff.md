# 租户系统使用费账单小程序对接说明

日期：2026-07-04

## 背景

租户系统使用费按月扣 1000 积分。此前小程序已经支持计费锁定态和积分充值，但用户充值后如果积分被后端立即补扣欠费，页面只能提示“余额可能不会增加”，缺少可追溯的系统使用费账单和扣费明细。

本次后端补充只读账单接口，让小程序能够展示：

- 当前系统使用费方案和租户订阅状态。
- 每月系统使用费账单。
- 已支付账单对应的积分扣费流水。
- 待充值、逾期或扣费失败账单的充值提示。

## 后端新增接口

以下接口均需要登录态和租户上下文。计费锁定态下仍允许访问，避免锁定页和充值后确认链路白屏。

### GET /billing/subscription

用途：读取当前租户系统使用费概览。

响应 `data`：

```json
{
  "plan": {
    "id": "plan-id",
    "code": "system_monthly_1000",
    "name": "系统月度使用费",
    "period": "monthly",
    "monthly_fee_credits": 1000,
    "reminder_days_before_due": 7,
    "enabled": true,
    "version": 1
  },
  "subscription": {
    "id": "subscription-id",
    "tenant_id": "tenant-id",
    "plan_id": "plan-id",
    "status": "active",
    "status_label": "正常",
    "current_period_start": "2026-07-01",
    "current_period_end": "2026-08-01",
    "next_charge_at": "2026-08-01T00:00:00.000Z",
    "locked_at": null,
    "lock_reason": null,
    "last_invoice_id": "invoice-id"
  },
  "current_invoice": null,
  "lock": {
    "locked": false,
    "reason": null,
    "locked_at": null,
    "last_invoice_id": "invoice-id"
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `plan.monthly_fee_credits` | 当前月费积分，现阶段为 1000。 |
| `subscription.status` | `active`、`past_due`、`locked`、`canceled`。 |
| `subscription.status_label` | 后端返回中文展示文案。 |
| `current_invoice` | 当前待处理账单；没有欠费时为 `null`。 |
| `lock.locked` | 是否计费锁定。 |

### GET /billing/subscription-invoices

用途：分页读取系统使用费账单列表。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `page` | 否 | 默认 `1`。 |
| `pageSize` | 否 | 默认 `20`，最大 `100`。 |
| `status` | 否 | `upcoming`、`reminded`、`paid`、`past_due`、`failed`、`void`。 |

响应 `data`：

```json
{
  "list": [
    {
      "id": "invoice-id",
      "tenant_id": "tenant-id",
      "subscription_id": "subscription-id",
      "plan_id": "plan-id",
      "period_start": "2026-07-01",
      "period_end": "2026-08-01",
      "due_at": "2026-08-01T00:00:00.000Z",
      "amount_credits": 1000,
      "status": "paid",
      "status_label": "已支付",
      "reminder_due_at": "2026-07-25T00:00:00.000Z",
      "reminded_at": "2026-07-25T00:00:00.000Z",
      "paid_at": "2026-08-01T00:01:00.000Z",
      "ledger_id": "ledger-id",
      "failure_code": null,
      "failure_message": null,
      "ledger": {
        "id": "ledger-id",
        "tenant_id": "tenant-id",
        "direction": "out",
        "change_credits": 1000,
        "balance_after": 2400,
        "frozen_after": 0,
        "event_type": "subscription_monthly_fee",
        "event_type_label": "系统月度使用费",
        "source_type": "tenant_subscription_invoice",
        "source_id": "invoice-id",
        "source_no": null,
        "source_label": "系统使用费账单 invoice-id",
        "remark": "系统月度使用费",
        "created_at": "2026-08-01T00:01:00.000Z"
      },
      "payment_hint": null,
      "created_at": "2026-07-01T00:00:00.000Z",
      "updated_at": "2026-08-01T00:01:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### GET /billing/subscription-invoices/:id

用途：读取单张系统使用费账单详情。

如果账单为 `reminded`、`past_due` 或 `failed`，会返回 `payment_hint`：

```json
{
  "payment_hint": {
    "required_credits": 1000,
    "action_label": "去充值",
    "message": "充值到账后，系统会自动优先补扣这笔系统使用费。"
  }
}
```

如果账单不存在或不属于当前租户：

```json
{
  "code": "BILLING_SUBSCRIPTION_INVOICE_NOT_FOUND",
  "message": "系统使用费账单不存在"
}
```

## 小程序建议页面

### 入口

建议新增页面：

```text
/packageEmployees/pages/billingSubscription/index
```

建议入口：

- 积分充值页余额卡下方：`系统使用费账单`。
- 计费锁定页：`查看欠费账单`。
- 待办 `billing_payment_due`：优先跳到账单页，再由账单页进入充值页。

现有积分充值页仍保留为支付入口：

```text
/packageEmployees/pages/creditRecharge/index
```

### 页面结构

顶部：

- 当前可用积分：继续调用 `/billing/account`。
- 月费：来自 `/billing/subscription.plan.monthly_fee_credits`。
- 订阅状态：来自 `/billing/subscription.subscription.status_label`。
- 下次扣费：来自 `/billing/subscription.subscription.next_charge_at`。

列表：

- 调用 `/billing/subscription-invoices?page=1&pageSize=20`。
- 每条展示账期、状态、应扣积分、扣费时间或到期时间。
- 已支付展示 `ledger.balance_after`，让用户知道扣完后还剩多少积分。
- 待充值、逾期、失败展示 `payment_hint.message` 和 `去充值`。

### 推荐展示文案

正常状态：

```text
系统使用费 1000 积分/月
下次扣费：2026/08/01
```

已支付账单：

```text
2026/07/01 - 2026/08/01
系统月度使用费 -1000 积分
扣费后余额 2400 积分
```

欠费账单：

```text
系统使用费待缴纳
需充值至少 1000 积分。充值到账后，系统会自动优先补扣这笔系统使用费。
```

充值到账但余额没增加时：

```text
充值积分已到账，并已用于补扣系统使用费。可在系统使用费账单中查看扣费明细。
```

## 小程序改动点

orange 仓库由小程序团队修改，gooes 不直接改。

| 文件 | 建议 |
| --- | --- |
| `src/services/billing.ts` | 新增 `getSubscription`、`listSubscriptionInvoices`、`getSubscriptionInvoice`。 |
| `src/types/api/billing.d.ts` | 新增 `BillingSubscription`、`BillingSubscriptionInvoice`、`BillingSubscriptionLedger` 类型。 |
| `src/packageEmployees/pages/creditRecharge/index.tsx` | 余额卡下方增加“系统使用费账单”入口；充值成功提示引导查看账单。 |
| `src/pages/tenant-suspended/index.tsx` | 计费锁定态增加“查看欠费账单”。 |
| `src/packageTasks/pages/index/model.tsx` | `billing_payment_due` 点击目标改为账单页或带 `from=todo` 的账单页。 |
| `src/app.config.ts` | 注册新增账单页。 |

服务封装示例：

```ts
export const BillingService = {
  getSubscription: () =>
    api.get<BillingSubscriptionPayload>(
      '/billing/subscription',
      {},
      { showErrorToast: false },
    ),

  listSubscriptionInvoices: (
    params: { page?: number; pageSize?: number; status?: string } = {},
  ) =>
    api.get<BillingSubscriptionInvoiceListPayload>(
      '/billing/subscription-invoices',
      {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        status: params.status,
      },
      { showErrorToast: false },
    ),

  getSubscriptionInvoice: (id: string) =>
    api.get<BillingSubscriptionInvoice>(
      `/billing/subscription-invoices/${id}`,
      {},
      { showErrorToast: false },
    ),
};
```

## 联调 smoke

使用 `18800000001 / tenant-sobmzdo5` 验证：

1. 正常态调用 `/billing/subscription`，页面能展示月费、状态和下次扣费。
2. 调用 `/billing/subscription-invoices?page=1&pageSize=20`，账单分页正常。
3. 将租户切到锁定态后，小程序锁定页可以打开账单页。
4. 欠费账单展示 `payment_hint`，管理员可点击去充值。
5. 充值支付成功并到账后，小程序刷新 `/billing/account`、`/billing/subscription`、`/billing/subscription-invoices` 和 `employee/bootstrap`。
6. 后端自动补扣后，账单变为 `paid`，`ledger.event_type_label` 为 `系统月度使用费`，`ledger.balance_after` 可见。
7. 普通员工没有 `billing.recharge.create` 时可以查看账单，但不能发起充值。

## 后端实现位置

- Controller：`apps/api/src/controllers/billing/index.ts`
- Schema：`apps/api/src/schema/billing.ts`
- Service：`apps/api/src/services/billing-subscriptions.ts`
- Repository：`apps/api/src/repositories/billing-subscriptions.ts`
- 合同测试：`apps/api/src/services/billing-subscriptions.test.ts`

## 注意事项

- 小程序不要自行计算账期、月费或扣费状态，全部以后端返回为准。
- 小程序不要根据微信支付成功本地解除锁定，仍需等待订单 `paid` 和 bootstrap 刷新。
- `payment_hint.required_credits` 是本账单应扣积分，不等于一定需要购买的套餐金额；套餐仍以 `/billing/recharge-products` 为准。
- 列表必须分页加载，不要一次拉全量。
