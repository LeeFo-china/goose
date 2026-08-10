# 平台技术服务待支付订单取消接口交接

## 发布状态

- Gooes 本地实现完成，尚未发布 dev；
- migration：`20260810100000_cancel_pending_platform_service_orders.sql`；
- 接口和现有创建订单、继续支付接口兼容。

## 取消接口

```http
POST /billing/service-orders/:id/cancel
Authorization: Bearer <tenant_employee_session>
Content-Type: application/json
```

```json
{
  "idempotency_key": "uuid-v4",
  "expected_version": 3,
  "reason": "user_changed_product"
}
```

- `idempotency_key`：必填；同一次取消的网络重试必须复用；
- `expected_version`：必填，取当前订单 `version`；
- `reason`：可选枚举 `user_changed_product | user_cancelled`，默认 `user_cancelled`；
- 权限：沿用 `billing.service_order.create`；
- 租户隔离：只能取消当前员工所属租户的订单。

成功响应：

```json
{
  "idempotent": false,
  "order": {
    "id": "uuid",
    "payment_status": "closed",
    "service_status": "waiting_payment",
    "display_stage": "closed",
    "closed_at": "2026-08-10T05:00:00.000Z",
    "version": 4,
    "available_actions": {
      "continue_payment": {
        "enabled": false,
        "label": "继续支付",
        "disabled_reason": "订单不是待支付状态"
      },
      "cancel_payment": {
        "enabled": false,
        "label": "取消订单",
        "disabled_reason": "订单已关闭"
      },
      "request_refund": {
        "enabled": false,
        "label": "申请售后",
        "disabled_reason": "仅已支付订单可申请售后"
      }
    }
  },
  "server_time": "2026-08-10T05:00:00.000Z"
}
```

重复取消 closed 订单返回 HTTP 200，`idempotent=true`。

## `available_actions` 变更

以下所有订单响应都会新增 `order.available_actions.cancel_payment`：

- 创建订单；
- 订单列表；
- 订单详情；
- 继续支付；
- 取消订单；
- 客户验收详情。

启用规则：仅 `payment_status=pending` 时启用；即使本地支付时限已过，也允许用户执行关单。

## 稳定错误码

| HTTP | code | 前端处理 |
| --- | --- | --- |
| 404 | `SERVICE_ORDER_NOT_FOUND` | 提示订单不存在并返回列表 |
| 409 | `SERVICE_ORDER_VERSION_CONFLICT` | 刷新详情，使用新版本重试 |
| 409 | `SERVICE_ORDER_ALREADY_PAID` | 刷新详情并进入已支付状态，不再创建新订单 |
| 409 | `SERVICE_ORDER_CANCEL_NOT_ALLOWED` | 刷新详情，按最新 action 展示 |
| 409 | `SERVICE_ORDER_IDEMPOTENCY_CONFLICT` | 生成新幂等键后重试当前订单 |
| 409 | `SERVICE_ORDER_CANCEL_IN_PROGRESS` | 保留订单并复用原取消请求重试 |
| 409 | `SERVICE_ORDER_CANCEL_PREPAY_CHANGED` | 刷新订单；如仍可取消，使用新版本重试 |
| 409 | `SERVICE_ORDER_PAYMENT_STATE_CHANGED` | 预支付并发状态已变化，刷新订单，不得拉起支付 |
| 502 | `SERVICE_ORDER_CANCEL_WECHAT_UNCERTAIN` | 保留当前订单，提示稍后重试，禁止仅清本地状态 |

## 微信支付并发语义

后端会先在数据库原子预占取消请求，再查微信订单。预占后继续支付和新的预支付单写入会被拒绝；微信未支付时关单并复查，只有明确为 `CLOSED` 才把本地订单改为 closed。仅当订单没有 `prepay_id` 且微信明确返回 `ORDER_NOT_EXIST` 时，最终 RPC 会再次检查 `prepay_id` 仍为空后关闭。若查到微信已经支付，后端会先补记支付和实施工单，再返回 `SERVICE_ORDER_ALREADY_PAID`。因此前端不能把 409 已支付当作取消成功。

取消预占租约为 15 分钟。租约有效时订单 action 会同时禁用继续支付和新的取消操作；原请求仍可使用同一幂等键自动重试。若客户端丢失原幂等键或原操作员工失效，租约到期后其他具备购买权限的员工可使用新幂等键接管取消，不会永久锁单。

## Orange 接入建议

1. 仅当 `cancel_payment.enabled=true` 时展示“更换套餐/取消订单”；
2. 二次确认后调用取消接口，提交期间禁用按钮；
3. 同一次网络重试复用幂等键；
4. HTTP 200 closed 后再清空本页订单、套餐和条款确认状态；
5. 版本冲突、已支付或状态不允许时立即刷新订单；
6. 502 状态不确定时保留当前订单和操作上下文。
7. 收到 `SERVICE_ORDER_PAYMENT_STATE_CHANGED` 时不调用 `wx.requestPayment`，刷新订单后按最新 action 展示。

## 验收矩阵

- 待支付订单取消成功，旧微信订单不可继续支付；
- 同一请求重复取消幂等成功；
- 取消后可选择其他套餐并创建新订单；
- 取消与支付并发时最终只进入 paid 或 closed，不出现本地 closed、微信 paid；
- 历史 closed 订单不展示继续支付或取消入口；
- 跨租户、无购买权限员工不能取消；
- 支付过期但仍 pending 的订单可以主动关闭。
