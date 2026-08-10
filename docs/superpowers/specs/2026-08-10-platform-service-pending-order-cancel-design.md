# 平台技术服务待支付订单取消设计

## 目标

为租户员工提供 `POST /billing/service-orders/:id/cancel`，让用户取消误选套餐产生的待支付订单，并安全释放重新选购入口。

## 接口契约

请求体：

```json
{
  "idempotency_key": "uuid-v4",
  "expected_version": 3,
  "reason": "user_changed_product"
}
```

- `idempotency_key` 必填，同一次取消重试复用；
- `expected_version` 必填；
- `reason` 可选，支持 `user_changed_product`、`user_cancelled`，默认 `user_cancelled`；
- 仅当前租户、具备 `billing.service_order.create` 权限的员工可调用。

成功响应沿用订单响应结构，增加顶层 `idempotent`，订单状态为 `payment_status=closed`、`display_stage=closed`。所有订单响应的 `available_actions` 增加 `cancel_payment`。

## 支付安全流程

1. 在数据库中按租户、订单、版本和幂等键原子预占取消权；跨订单复用幂等键在任何微信侧操作前失败。
2. 继续支付在读取订单和保存新 `prepay_id` 两处检查取消预占，防止取消与预下单竞态。
3. 按订单快照绑定的支付配置加载密钥，调用微信支付商户订单号查单。
4. 微信状态为 `SUCCESS` 时，使用现有支付确认 RPC 补记支付并生成唯一实施工单，随后返回 `SERVICE_ORDER_ALREADY_PAID`；支付状态迁移会清理未完成的取消预占。
5. 微信状态为 `NOTPAY` 时调用 APIv3 关单，再次查单确认结果。复查仍为 `NOTPAY` 时不得关闭本地订单。
6. 微信状态明确为 `CLOSED` 时调用最终关闭 RPC。订单没有 `prepay_id` 且微信明确返回 `ORDER_NOT_EXIST` 时，最终 RPC 必须再次确认 `prepay_id` 仍为空。
7. 微信状态不确定、查单或关单失败时保留 pending 和取消预占，返回稳定错误；相同请求可安全重试。

## 数据与并发

通过 migration 为 `tenant_service_orders` 增加取消幂等键、15 分钟取消租约、取消原因和操作员工，并新增“预占取消”和“最终关闭”两个 RPC。两者使用事务级 advisory lock、行锁和 `expected_version`；预占不递增订单版本，最终 RPC 只允许 `pending -> closed`，写入 `closed_at` 并递增版本。

同一幂等键在租约内外都可续租重试；不同幂等键在租约有效期内返回 `SERVICE_ORDER_CANCEL_IN_PROGRESS`，租约到期后允许其他当前有效员工接管，避免客户端重启或员工停用造成永久锁单。租约有效时公共订单 action 不再宣称可以继续支付或再次取消。

预支付单保存使用 `payment_status=pending AND cancel_idempotency_key IS NULL` 条件更新；无预支付单关闭路径还会在最终 RPC 内检查 `prepay_id IS NULL`，消除查询微信与本地关闭之间的竞态窗口。

- 同一请求重试或订单已经关闭：返回当前 closed 订单，`idempotent=true`；
- 版本冲突：`SERVICE_ORDER_VERSION_CONFLICT`；
- 已支付：`SERVICE_ORDER_ALREADY_PAID`；
- 其他状态：`SERVICE_ORDER_CANCEL_NOT_ALLOWED`；
- 同订单已有其他取消请求：`SERVICE_ORDER_CANCEL_IN_PROGRESS`；
- 无预支付单路径发现支付状态已变化：`SERVICE_ORDER_CANCEL_PREPAY_CHANGED`；
- 预支付写入输掉状态竞态：`SERVICE_ORDER_PAYMENT_STATE_CHANGED`；
- 不存在或跨租户：`SERVICE_ORDER_NOT_FOUND`。

## 验证

- schema、路由、视图和取消服务单元测试；
- migration 契约测试；
- API 类型检查；
- Colima 隔离空库完整应用 migration，并核对 Local/Remote 版本列表；
- 本地 RPC smoke 覆盖跨订单幂等冲突、取消预占阻止预支付写入、缺失预支付保护和重复关闭；
- dev 发布时再次执行 migration list 对齐检查；
- migration 在加约束前主动检查历史 `closed_at` 状态不变量；发现旧数据不一致时安全中止，由发布人员先评估独立修复 migration，不自动篡改历史订单。
- dev 使用真实待支付订单 smoke：取消、重复取消、重新选购及支付竞态。

## 回滚

发布前可直接撤回代码和本 migration。发布后如需停用，先回滚 API 路由并保留新增列与 RPC，避免丢失取消审计数据；确认不存在已取消订单依赖后，才可通过新的逆向 migration 删除函数、索引、约束和列，禁止手工回退远端数据库。
