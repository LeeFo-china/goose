# 租户充值记录列表后端验收确认

## 结论

后端已完成并验证租户侧充值记录列表接口：

```http
GET /billing/recharge-orders?page=1&pageSize=20&status=paid&keyword=TC...
```

小程序可以继续使用当前接入方案：

- 不传 `tenant_id`。
- 使用当前员工登录态识别租户。
- 账单锁定期间仍允许访问。
- 退款入口当前不开放，按后端 `refund_action` 展示。

## 已验证能力

| 场景 | 结果 |
| --- | --- |
| 有 `billing.recharge.read` 或 `billing.recharge.create` 权限的员工访问 | 通过 |
| 无权限员工访问 | 返回 `403 FORBIDDEN` |
| 不传 `tenant_id` | 通过，后端按登录态租户过滤 |
| 只返回当前租户订单 | 通过 |
| 强制 `channel = wechat_pay` | 通过 |
| 按 `created_at desc` 排序 | 通过 |
| `status=paid` 筛选 | 通过 |
| `keyword` 搜索 `order_no` | 通过 |
| `keyword` 搜索 `out_trade_no` | 通过 |
| `keyword` 搜索 `transaction_id` | 通过 |
| 分页字段 `page/pageSize/total/totalPages` | 通过 |
| 账单锁定期间访问列表 | 通过 |

## 实测摘要

### 有订单租户数据校验

使用有充值订单的租户员工验证：

- 返回 `18` 条当前租户微信支付订单。
- `status=paid` 返回 `8` 条。
- `order_no`、`out_trade_no`、`transaction_id` 关键字均可命中。
- 返回数据未出现跨租户订单。
- 所有记录 `channel` 均为 `wechat_pay`。
- 排序为 `created_at desc`。

### 无权限校验

同租户无充值查看/创建权限员工访问：

```http
GET /billing/recharge-orders?page=1&pageSize=20
```

结果：

```text
403 FORBIDDEN
```

### 账单锁定校验

使用验收租户 `5H 验收租户 A` 临时构造锁定态：

- 锁定前接口返回 `200`。
- 锁定后订阅状态为 `locked`，`lock_reason = credits_insufficient`。
- 锁定期间 `GET /billing/recharge-orders?page=1&pageSize=20` 继续返回 `200`。
- 验收结束后已恢复租户订阅状态为 `active`，`open_invoice = null`。

该验收租户没有充值订单，因此这项只证明“锁定态仍可访问接口”；真实列表内容、筛选和排序已在有订单租户上单独验证。

## 当前退款字段策略

当前列表响应中会返回：

```json
{
  "refund_status": null,
  "refund_requested_at": null,
  "refunded_at": null,
  "refund_amount_fen": null,
  "refund_action": {
    "enabled": false,
    "label": "申请退款",
    "disabled_reason": "REFUND_REQUEST_NOT_SUPPORTED",
    "requires_reason": true
  }
}
```

小程序处理建议保持不变：

- `refund_action.enabled = false` 时不展示可点击的“申请退款”按钮。
- 可在详情中把 `REFUND_REQUEST_NOT_SUPPORTED` 映射为“退款申请暂未开放”。
- 不要在小程序端根据 `status = paid` 自行打开退款入口。

## 后续边界

二期退款申请会新增独立接口：

```http
POST /billing/recharge-orders/:id/refund-requests
```

该接口只创建退款申请，不直接执行微信退款。真实退款仍由平台 Admin 或后端运营流程审核后执行。

## 责任边界

- `gooes`：已提供租户侧充值记录分页接口、锁定态访问能力、保守退款入口状态。
- `orange`：保持当前列表接入，不需要传 `tenant_id`，按 `refund_action` 展示退款入口。
- 后续退款申请、平台审核、真实微信退款执行另行分阶段对接。
