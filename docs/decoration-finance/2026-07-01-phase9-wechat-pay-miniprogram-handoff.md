# Phase 9 微信支付小程序对接说明

日期：2026-07-01

适用范围：orange 小程序只读/对接参考。本仓库不修改 orange。

## 当前后端契约

### 1. 创建微信支付订单

接口：

```text
POST /finance/wechat-pay/orders
```

认证：

- 员工登录 token。
- 必须有租户上下文。
- 当前员工必须能执行对应收款 workflow task。

请求：

```json
{
  "project_id": "project-id",
  "receivable_plan_id": "receivable-plan-id",
  "workflow_task_id": "workflow-task-id",
  "amount": 10000,
  "payer_openid": "用户在平台小程序 AppID 下的 openid"
}
```

返回重点：

```json
{
  "payment_request": {
    "timeStamp": "1782873600",
    "nonceStr": "nonce",
    "package": "prepay_id=xxx",
    "signType": "RSA",
    "paySign": "signature"
  },
  "order": {
    "id": "wechat-payment-order-id",
    "out_trade_no": "WX202607010001",
    "status": "pending",
    "prepay_id": "wx-prepay-id"
  }
}
```

小程序拿到 `payment_request` 后调用：

```ts
wx.requestPayment(payment_request)
```

### 2. 支付结果来源

支付成功后的最终状态以服务端微信支付回调为准。

小程序不要在本地：

- 创建 `payments`。
- 写财务台账。
- 核销应收计划。
- complete workflow task。
- 本地推进 timeline。

支付完成后只需要刷新：

- 项目详情 `workflow_state` / `workflow_progress`
- 应收计划
- 收款待办
- 财务展示页或相关状态

### 3. 回调后端行为

微信支付回调成功后，后端会自动：

- 写 `wechat_payment_notifications`
- 创建 confirmed `payments`
- 核销当前收款节点应收计划
- 写 `finance_ledger`
- complete 当前收款 workflow task
- 更新 `wechat_payment_orders.status=paid`

小程序只消费刷新后的后端状态。

## 小程序需要注意

1. `payer_openid` 必须是用户在平台小程序 AppID 下的 openid。
2. 不要把 `payment_request` 缓存在本地长期复用。
3. `wx.requestPayment` 成功只代表客户端支付流程完成，不代表业务已入账。
4. 若支付后立刻刷新仍显示 pending，可以短轮询订单/项目状态，等待服务端回调完成。
5. 遇到重复点击创建订单，后端会按 `workflow_task_id` 返回已有 pending 订单。

## 建议 smoke 路径

1. 员工进入收款 workflow 待办。
2. 从后端 action/output_fields 读取应收上下文。
3. 调用 `POST /finance/wechat-pay/orders`，传 `payer_openid`。
4. 调用 `wx.requestPayment(payment_request)`。
5. 等待服务端回调。
6. 刷新项目详情：
   - 当前收款节点应为 done。
   - 下一节点应为 current。
   - 应收计划状态应为 paid 或 partially_paid。
7. Admin 财务台账可见项目收款入账流水。

## 当前上线前置

- 后端还需要执行真实微信支付小额 smoke。
- 生产前需要轮换已暴露过的微信支付密钥。
- 远端 Supabase migration 需要在数据库认证恢复后应用并验证。
