# 租户计费锁定小程序对接说明

日期：2026-07-03

## 目标

租户系统使用费按月扣 1000 积分。到期积分不足时，员工小程序进入计费锁定态；具备积分充值权限的管理员仍可进入购买积分通道。

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
