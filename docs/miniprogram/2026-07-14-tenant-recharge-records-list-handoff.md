# 租户充值记录列表接口对接说明

## 背景

小程序积分充值页计划新增 `充值记录` 入口，进入当前租户的微信支付充值订单列表。

后端已新增租户侧分页列表接口。平台 Admin 的
`GET /platform/billing/recharge-orders` 是跨租户接口，小程序不要使用。

## 接口

```http
GET /billing/recharge-orders?page=1&pageSize=20&status=paid&keyword=TC...
```

### 认证和租户上下文

- 使用现有员工登录态。
- 前端不要传 `tenant_id`。
- 后端只返回当前登录员工所在租户的数据。
- 后端强制 `channel = wechat_pay`。
- 账单锁定期间允许访问，和现有充值接口一致。

### 权限

满足任一权限即可查看：

- `billing.recharge.read`
- `billing.recharge.create`

无权限时按现有错误响应返回 `FORBIDDEN`。

## Query 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | number | 否 | `1` | 页码，从 1 开始 |
| `pageSize` | number | 否 | `20` | 每页数量，最大 `100` |
| `status` | string | 否 | 无 | `pending`、`paid`、`closed`、`refunded` |
| `keyword` | string | 否 | 无 | 最大 120 字符，匹配 `order_no`、`out_trade_no`、`transaction_id` |

排序固定为：

```text
created_at desc
```

## Response

```json
{
  "list": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "order_no": "TC202607...",
      "package_code": "credit_1000",
      "product_title": "1000 积分",
      "amount_fen": 10000,
      "credits": 1000,
      "bonus_credits": 100,
      "channel": "wechat_pay",
      "status": "paid",
      "paid_at": "2026-07-14T09:20:00.000Z",
      "paid_amount_fen": 10000,
      "out_trade_no": "TC202607...",
      "prepay_id": "wx...",
      "transaction_id": "420000...",
      "refund_status": null,
      "refund_requested_at": null,
      "refunded_at": null,
      "refund_amount_fen": null,
      "refund_action": {
        "enabled": false,
        "label": "申请退款",
        "disabled_reason": "REFUND_REQUEST_NOT_SUPPORTED",
        "requires_reason": true
      },
      "created_at": "2026-07-14T09:18:00.000Z",
      "updated_at": "2026-07-14T09:20:00.000Z"
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

### 字段说明

| 字段 | 说明 |
| --- | --- |
| `product_title` | 从订单 `metadata.product_snapshot.title` 读取；为空时小程序 fallback 到 `package_code` |
| `amount_fen` | 订单应付金额，单位分 |
| `paid_amount_fen` | 微信回调确认的实付金额，单位分 |
| `credits` | 基础到账积分 |
| `bonus_credits` | 赠送积分 |
| `status` | 订单状态：`pending`、`paid`、`closed`、`refunded` |
| `refund_status` | 退款流程预留字段；本期通常为 `null` |
| `refund_action` | 后端计算的小程序退款入口状态，小程序不要本地推导 |

## 本期退款入口策略

本期只交付充值记录列表，不交付退款申请接口。

因此已支付订单也会返回：

```json
{
  "refund_action": {
    "enabled": false,
    "label": "申请退款",
    "disabled_reason": "REFUND_REQUEST_NOT_SUPPORTED",
    "requires_reason": true
  }
}
```

小程序处理建议：

- `refund_action.enabled = false` 时，不展示可点击的 `申请退款` 按钮。
- 如果详情页需要解释原因，可将 `REFUND_REQUEST_NOT_SUPPORTED` 映射为
  `退款申请暂未开放`。
- 不要在小程序端自行判断 `paid` 后即可退款。
- 后续二期接入 `POST /billing/recharge-orders/:id/refund-requests` 后，再按后端返回的
  `refund_action.enabled = true` 展示申请入口。

## 小程序改动建议

建议改动位置：

- `src/app.config.ts`
  - 增加 `/packageEmployees/pages/rechargeRecords/index`
- `src/types/api/billing.d.ts`
  - 增加充值记录列表 payload 类型
- `src/services/billing.ts`
  - 增加 `BillingService.listRechargeOrders(params, options?)`
- `src/packageEmployees/pages/creditRecharge/index.tsx`
  - 在 `系统账单` 左侧增加 `充值记录` 入口
- `src/packageEmployees/pages/rechargeRecords/index.tsx`
  - 新增列表页，支持首屏加载、下拉刷新、触底分页

## 调用流程

1. 用户进入积分充值页。
2. 点击 `充值记录`。
3. 小程序请求：

```http
GET /billing/recharge-orders?page=1&pageSize=20
```

4. 列表页按 `created_at desc` 展示。
5. 触底加载下一页：

```http
GET /billing/recharge-orders?page=2&pageSize=20
```

6. 筛选已支付订单：

```http
GET /billing/recharge-orders?page=1&pageSize=20&status=paid
```

7. 搜索订单号或微信交易号：

```http
GET /billing/recharge-orders?page=1&pageSize=20&keyword=TC202607
```

## 错误处理

| 场景 | 建议处理 |
| --- | --- |
| `401` / 未登录 | 回到登录态处理 |
| `403` / `FORBIDDEN` | 展示无查看权限 |
| query 参数非法 | 展示通用错误或重置筛选条件 |
| 网络错误 | 保留当前列表，允许用户重试 |

## 验收清单

- 有 `billing.recharge.read` 或 `billing.recharge.create` 的员工可打开充值记录页。
- 前端不传 `tenant_id`。
- 列表只展示当前租户微信支付充值订单。
- 记录按 `created_at desc` 排序。
- `pageSize` 不超过 `100`。
- `status=paid` 只返回已支付订单。
- `keyword` 可搜索 `order_no`、`out_trade_no`、`transaction_id`。
- `product_title` 为空时展示 `package_code`。
- `refund_action.enabled=false` 时不展示可点击退款按钮。
- 账单锁定期间仍可访问充值记录页。

## 责任边界

- `gooes`：已提供租户侧充值记录分页接口和保守退款入口状态。
- `orange`：新增入口、列表页、分页加载和展示逻辑。
- 真实退款和退款申请接口不在本期范围内，后续二期单独对接。
