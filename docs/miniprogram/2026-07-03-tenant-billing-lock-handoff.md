# 租户计费锁定小程序对接说明

日期：2026-07-03

## 目标

租户系统使用费按月扣 1000 积分。到期积分不足时，员工小程序进入计费锁定态；具备积分充值权限的管理员仍可进入购买积分通道。

## 当前后端状态

- 已合入 `main`。
- Supabase migration：`20260703161000_create_tenant_subscription_billing.sql`。
- 默认计费方案：`system_monthly_1000`，`monthly_fee_credits = 1000`，`reminder_days_before_due = 7`。
- 远端 migration 已对齐，后端 live DB smoke 已验证：
  - 余额不足扣费后账单变为 `past_due`。
  - 订阅变为 `locked`，`lock_reason = credits_insufficient`。
  - 补充积分后 `billing_recover_subscription_after_recharge` 自动补扣欠费，账单变为 `paid`，订阅恢复 `active`。

## 后端错误码

| HTTP | code | 小程序处理 |
| --- | --- | --- |
| 402 | `TENANT_BILLING_LOCKED` | 展示计费锁定页 |
| 402 | `TENANT_CREDITS_INSUFFICIENT` | 展示余额不足提示 |

## 小程序行为

- bootstrap 或普通业务接口返回 `TENANT_BILLING_LOCKED` 时进入锁定页。
- 有 `billing.recharge.create` 权限：显示“购买积分”按钮，并继续使用现有积分充值接口。
- 无 `billing.recharge.create` 权限：显示“请联系管理员充值”。
- 充值页继续调用租户积分充值接口，不走项目收款接口。
- 充值支付成功后重新请求 bootstrap 和 `/billing/account`，不要在本地直接解除锁定。

## orange 侧建议改动点

以下是只读检查 orange 后定位到的现有文件；小程序团队在 orange 仓库内修改，gooes 不直接改 orange。

| 文件 | 当前职责 | 本次建议 |
| --- | --- | --- |
| `src/utils/https_helpers.ts` | 租户暂停态 `TENANT_NOT_AVAILABLE` 的判断和跳转 | 增加 `TENANT_BILLING_LOCKED`，判断 `statusCode === 402`，复用或扩展跳转函数 |
| `src/utils/https.ts` | 业务错误和 HTTP 错误统一分流 | 在 2xx 业务错误和非 2xx 错误两处都识别 `TENANT_BILLING_LOCKED` |
| `src/pages/tenant-suspended/index.tsx` | 服务暂停页 | 扩展为可根据 query 区分 `tenant_suspended` 和 `billing_locked`；计费锁定时显示充值入口 |
| `src/services/billing.ts` | 已有积分充值接口封装 | 继续复用，不新增支付链路 |
| `src/packageEmployees/pages/creditRecharge/index.tsx` | 已有积分充值页 | 支付成功后刷新 `/billing/account`，再触发一次 employee bootstrap 刷新锁定态 |
| `src/packageTasks/pages/index/index.tsx` | 待办中心展示和跳转 | 增加 `billing_payment_due` 的 label/icon/tone/跳转 |
| `src/types/api/task_center.d.ts` | 待办类型 | 将 `billing_payment_due` 加入明确 union |

建议跳转规则：

```ts
const TENANT_BILLING_LOCKED_CODE = 'TENANT_BILLING_LOCKED';
const TENANT_SUSPENDED_PAGE = '/pages/tenant-suspended/index';

const isTenantBillingLockedError = (statusCode?: number, code?: string) =>
  statusCode === 402 && code === TENANT_BILLING_LOCKED_CODE;

const navigateToTenantBillingLocked = () => {
  Taro.reLaunch({
    url: `${TENANT_SUSPENDED_PAGE}?reason=billing_locked`,
  });
};
```

注意：锁定页里的“购买积分”按钮只能在当前员工有 `billing.recharge.create` 权限时显示。权限来自 employee bootstrap / auth store 里的权限集合，不要前端硬编码手机号或角色名。

## 待办入口

后端待办中心会返回 `billing_payment_due`：

```json
{
  "type": "billing_payment_due",
  "title": "系统使用费待充值",
  "action_label": "去充值",
  "target_url": "/billing",
  "target_type": "billing"
}
```

小程序可以将该待办跳转到积分充值页。若用户没有 `billing.recharge.create` 权限，后端不会给该用户生成这条待办。

建议 orange 映射：

- label：`系统使用费`
- icon：可复用金币/账单类图标
- tone：`danger` 或 `warning`
- 点击：`/packageEmployees/pages/creditRecharge/index`

完整字段示例：

```json
{
  "id": "billing_invoice:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "type": "billing_payment_due",
  "title": "系统使用费已到期",
  "subtitle": "需充值至少 1,000 积分",
  "status": "pending",
  "status_label": "待处理",
  "priority": "high",
  "priority_label": "高优先级",
  "action_label": "去充值",
  "target_url": "/billing",
  "target_type": "billing",
  "target_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "metadata": {
    "invoice_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "amount_credits": 1000,
    "invoice_status": "past_due"
  }
}
```

## API 合同

锁定态仍允许访问以下租户积分接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/billing/account` | 展示当前积分余额 |
| `GET` | `/billing/summary` | 展示计费摘要 |
| `GET` | `/billing/ledger` | 展示积分流水 |
| `GET` | `/billing/feature-estimates` | 展示功能预估消耗 |
| `GET` | `/billing/recharge-products?page=1&pageSize=20` | 充值套餐 |
| `POST` | `/billing/recharge-orders` | 创建微信支付充值订单 |
| `GET` | `/billing/recharge-orders/:id` | 轮询订单到账状态 |

`POST /billing/recharge-orders` 请求继续沿用当前小程序实现：

```json
{
  "package_code": "credit_1000",
  "payer_openid": "wechat-openid",
  "idempotency_key": "uuid-v4"
}
```

响应中的 `payment_request` 继续交给 `Taro.requestPayment`。若订单已存在或支付请求为空，按现有 `creditRecharge` 页面逻辑轮询订单即可。

## 刷新和解锁规则

- 支付成功只代表微信支付完成，不代表前端可以本地解锁。
- 小程序应等待 `/billing/recharge-orders/:id` 返回 `order.status = paid`。
- 订单 paid 后重新请求：
  - `/billing/account`
  - `employee/bootstrap`
- 如果后端已完成欠费补扣，普通业务接口会恢复正常；否则继续展示锁定页或提示“后端确认中”。
- 充值接口必须防重复提交：继续使用 `idempotency_key`，支付按钮 loading 期间禁用。

## 联调准备建议

联调不建议只插入员工表，因为小程序登录依赖微信身份、手机号验证和 employee bootstrap。推荐两种方式：

1. 复用已有可登录员工账号，后端把该员工所属租户切入锁定态。
2. 如果必须新建测试租户，需同时准备：
   - 租户：`tenants.status = active`
   - 员工：`employees.status` 为可登录状态，并有手机号
   - 员工可通过小程序微信身份绑定流程登录
   - 充值管理员授予 `billing.recharge.create`
   - 普通员工不授予 `billing.recharge.create`

后端可用受控脚本把测试租户切为锁定态：

```bash
cd apps/api

# 只读查看租户当前计费状态
bun run billing:subscription-lock -- --action status --tenant-id <tenant-id>

# 把指定测试租户切为锁定态；写入操作必须显式确认 tenant id
bun run billing:subscription-lock -- \
  --action lock \
  --tenant-id <tenant-id> \
  --apply \
  --confirm-tenant <tenant-id>

# 验收完成后恢复；写入操作也必须显式确认 tenant id
bun run billing:subscription-lock -- \
  --action recover \
  --tenant-id <tenant-id> \
  --apply \
  --confirm-tenant <tenant-id>
```

脚本行为：

- 默认 `status`，不会写库。
- `lock` 会在租户可用积分低于 1000 时创建一张 1000 积分到期账单，并调用 `billing_charge_subscription_invoice`，预期失败码 `TENANT_CREDITS_INSUFFICIENT`。
- `lock` 如果发现该租户已有非联调脚本创建的订阅记录，会拒绝覆盖真实订阅。
- `recover` 会补足欠费所需积分并调用 `billing_recover_subscription_after_recharge`，预期恢复 `active`。
- 脚本创建的订阅 metadata 会带 `source = mini_program_billing_lock_joint_test`，便于审计。

## 不需要小程序实现的逻辑

- 不计算账期。
- 不判断是否该扣 1000 积分。
- 不本地解锁。
- 不修改 orange 仓库代码。

## 后端已保证

- 账期、提醒、扣费和锁定状态由后端维护。
- 锁定后普通租户业务接口返回 `TENANT_BILLING_LOCKED`。
- `/billing/account`、`/billing/summary`、`/billing/ledger`、`/billing/feature-estimates`、`/billing/recharge-products`、`/billing/recharge-orders` 仍可用于展示账单和发起充值。
- 充值回调或平台补偿确认到账后，后端会自动尝试补扣欠费并恢复订阅状态。

## 验收清单

- 普通业务接口在锁定态返回 `402 TENANT_BILLING_LOCKED`。
- 小程序全局拦截后进入计费锁定页，不进入普通页面空白或循环登录。
- 有 `billing.recharge.create` 权限的管理员能看到“购买积分”并进入积分充值页。
- 无 `billing.recharge.create` 权限的员工只能看到“联系管理员充值”。
- 待办中心展示 `billing_payment_due`，点击进入积分充值页。
- 支付取消时不解锁，不误提示到账。
- 支付成功但后端未确认到账时展示“支付处理中/等待确认”。
- 订单 `paid` 后刷新 `/billing/account` 和 employee bootstrap。
- 后端完成补扣后，业务接口恢复正常。
- 重复点击支付不会创建多笔有效订单，`idempotency_key` 生效。
