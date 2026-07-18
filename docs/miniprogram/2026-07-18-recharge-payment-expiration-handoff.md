# 小程序充值待支付过期与继续支付交接

## 结论

后端将充值支付期限固定为服务端创建订单后的 5 分钟，并把微信支付
`time_expire`、订单 `payment_expires_at` 和小程序可支付状态统一到同一截止时间。

小程序不得自行关闭订单，也不得在页面重新进入时重新开始 5 分钟。页面只负责展示
服务端截止时间、继续发起同一笔微信支付，以及在截止后轮询订单最终状态。后端 worker
按“先查微信、必要时关单、再查一次”的顺序将订单收敛为 `paid` 或 `closed`。

本次后端代码仅在本地分支 `feat/recharge-payment-expiration`，尚未 push、部署或执行远端
migration。小程序侧可先完成兼容，但应在后端 migration、API 和 worker 同时就绪后再开放
真实入口。

最终审查修复后，本次变更涉及的 33 个 API 测试文件已聚合通过 270 条测试、0 失败；API
typecheck、build、文件大小、完整 diff 检查及 worker 禁用态启动/退出 smoke 也已通过。
远程 dev 已获授权并完成只读预检，但 migration、RPC 和真实微信支付查单/关单 smoke 尚未
执行；完成前仍以本文的“尚未部署、不可真实联调”状态为准。

## 接口共同约定

- 使用现有员工 Bearer 登录态和租户上下文，小程序不传 `tenant_id`。
- 账单锁定期间仍允许访问充值接口。
- 创建和继续支付需要 `billing.recharge.create`；列表和详情需要
  `billing.recharge.read` 或 `billing.recharge.create`。
- 成功响应外层仍是 `{ data, message: "success" }`。
- `server_time` 和 `payment_expires_at` 均为 RFC 3339 时间字符串。
- 所有订单展示逻辑只读取 `payment_action.disabled_reason`，不存在也不得兼容
  `payment_action.code`。

### 订单新增字段

```ts
interface BillingRechargeOrder {
  payment_expires_at?: string | null;
  payment_action?: {
    enabled: boolean;
    label?: string | null;
    disabled_reason?:
      | 'ORDER_PAYMENT_EXPIRED'
      | 'ORDER_ALREADY_PAID'
      | 'ORDER_CLOSED'
      | 'ORDER_ALREADY_REFUNDED'
      | 'PAYMENT_REQUEST_UNAVAILABLE'
      | null;
  } | null;
}
```

`payment_action` 的展示规则：

| 条件 | `enabled` | `disabled_reason` | 小程序行为 |
| --- | --- | --- | --- |
| 待支付、未过期且已有 prepay | `true` | `null` | 展示“继续支付” |
| 到达服务端截止时间 | `false` | `ORDER_PAYMENT_EXPIRED` | 禁用支付，进入结果确认 |
| 已支付 | `false` | `ORDER_ALREADY_PAID` | 展示“已支付”，隐藏支付入口 |
| 已关闭 | `false` | `ORDER_CLOSED` | 展示“已关闭”，允许重新创建订单 |
| 已退款 | `false` | `ORDER_ALREADY_REFUNDED` | 展示“已退款”，隐藏支付入口 |
| 缺少可复用支付请求 | `false` | `PAYMENT_REQUEST_UNAVAILABLE` | 隐藏支付入口并提示刷新 |

退款展示继续只读取 `refund_action.disabled_reason`；不要把 `payment_action` 与
`refund_action` 混用。

## 接口契约

### 1. 创建充值订单

```http
POST /billing/recharge-orders
Authorization: Bearer <employee-token>
Content-Type: application/json
```

```json
{
  "package_code": "credit_1000",
  "payer_openid": "openid",
  "idempotency_key": "uuid-v4"
}
```

成功响应：

```json
{
  "data": {
    "idempotent": false,
    "order": {
      "id": "order-uuid",
      "out_trade_no": "TC202607...",
      "status": "pending",
      "payment_expires_at": "2026-07-18T10:05:00.000Z",
      "payment_action": {
        "enabled": true,
        "label": "继续支付",
        "disabled_reason": null
      }
    },
    "product": {},
    "payment_request": {
      "timeStamp": "...",
      "nonceStr": "...",
      "package": "prepay_id=...",
      "signType": "RSA",
      "paySign": "..."
    },
    "server_time": "2026-07-18T10:00:00.000Z"
  },
  "message": "success"
}
```

`payment_request` 的类型必须是上面对象或 `null`。如果微信预下单、配置读取或网络耗时跨过
`payment_expires_at`，后端即使已取得 prepay 结果也会返回 `null`，同时订单的
`payment_action.disabled_reason` 为 `ORDER_PAYMENT_EXPIRED`。小程序不得再调起支付，应转入
结果确认。

网络超时重试同一次创建时必须复用原 `idempotency_key`。只有用户明确开始一笔新充值，
或旧订单已 `closed` 后重新充值，才生成新的 UUID v4；后端会生成新的
`out_trade_no` 和新的 5 分钟截止时间。

### 2. 获取充值订单列表

```http
GET /billing/recharge-orders?status=pending&page=1&pageSize=1
```

列表始终分页，`pageSize` 最大 100。充值页重新进入时用上面的查询恢复最新一笔待支付
订单，不传 `tenant_id`。响应数据为：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 1,
      "total": 0,
      "totalPages": 0
    },
    "server_time": "2026-07-18T10:00:00.000Z"
  },
  "message": "success"
}
```

### 3. 获取充值订单详情

```http
GET /billing/recharge-orders/:id
```

```json
{
  "data": {
    "order": {},
    "account": {},
    "server_time": "2026-07-18T10:00:00.000Z"
  },
  "message": "success"
}
```

详情是倒计时归零、微信支付返回成功、页面重新显示时确认最终状态的权威来源。

### 4. 继续支付

```http
POST /billing/recharge-orders/:id/payment-request
Authorization: Bearer <employee-token>
Content-Type: application/json

{}
```

该接口不创建新订单，只基于原订单的 `prepay_id` 重新生成小程序调起支付所需签名。

```json
{
  "data": {
    "order": {
      "id": "order-uuid",
      "status": "pending",
      "payment_expires_at": "2026-07-18T10:05:00.000Z",
      "payment_action": {
        "enabled": true,
        "label": "继续支付",
        "disabled_reason": null
      }
    },
    "payment_request": {
      "timeStamp": "...",
      "nonceStr": "...",
      "package": "prepay_id=...",
      "signType": "RSA",
      "paySign": "..."
    },
    "server_time": "2026-07-18T10:00:30.000Z"
  },
  "message": "success"
}
```

只有 `payment_action.enabled = true` 时才展示并调用此接口。不要保存并长期复用创建订单
响应里的签名参数。继续支付响应的 `payment_request` 同样可能因请求期间刚好到期而为
`null`；此时按同一响应中的 `order.payment_action` 展示并刷新详情，不调用
`Taro.requestPayment`。

## 推荐的小程序状态机

```text
进入充值页
  -> 查询最新 pending 订单
  -> 可支付：按服务端绝对截止时间倒计时，展示“继续支付”
  -> 已过期：展示“正在确认支付结果”，轮询详情
  -> paid：刷新余额，展示已到账
  -> closed：展示已关闭，允许创建新订单
```

### 倒计时

1. 以响应的 `server_time` 作为当前时间，以 `payment_expires_at` 作为绝对截止时间。
2. 请求开始和结束时间可用于扣除网络往返耗时；不要直接使用“本地当前时间 + 5 分钟”。
3. 前台计时器只负责刷新显示，不拥有订单状态，也不调用关闭订单接口。
4. 页面进入后台时暂停显示计时；`useDidShow` 后重新请求订单详情，用新的
   `server_time` 重算剩余时间。这样后台停留和用户修改设备时间都不会重置期限。
5. 到零立即禁用支付按钮并显示“正在确认支付结果”，但保持订单状态为后端返回的
   `pending`，直到详情返回 `paid` 或 `closed`。

worker 默认每 10 秒扫描一次。倒计时归零后建议沿用现有 1200ms 轮询间隔，但把这一轮
确认窗口覆盖到至少两个 worker 周期（约 20 至 25 秒）。超过窗口仍为 `pending` 时停止
密集轮询，提示“支付结果确认中，请稍后刷新”，并在下次 `useDidShow` 或下拉刷新时继续
查询，避免无限轮询。

### 微信支付取消

`Taro.requestPayment` 返回 cancel 时：

- 不关闭订单；
- 不创建新订单；
- 保留当前订单和原绝对截止时间；
- 若 `payment_action.enabled = true`，展示“继续支付”；
- 用户再次点击时调用 `POST /billing/recharge-orders/:id/payment-request`，再把响应里的
  `payment_request` 交给 `Taro.requestPayment`。

### 支付成功或异常

- 微信前端返回成功不等于积分已入账，继续轮询 `GET /billing/recharge-orders/:id`。
- 前端返回失败也不应本地关单；可立即查详情，再按后端状态展示。
- 支付与关单竞态由后端以微信查单结果裁决，最终只接受 `paid` 或 `closed`。
- 订单 `closed` 后重新充值必须重新调用创建接口并生成新幂等键，不能继续旧
  `out_trade_no`。

## 需要 orange 团队修改的文件

以下文件来自只读核查，小程序团队自行修改；本次后端工作不会写入 orange：

1. `src/types/api/billing.d.ts`
   - 给 `BillingRechargeOrder` 增加 `payment_expires_at`、`payment_action`。
   - 给创建、列表、详情响应增加 `server_time`。
   - 新增继续支付响应类型。
2. `src/services/billing.ts`
   - 新增 `BillingService.createRechargePaymentRequest(orderId)`，POST
     `/billing/recharge-orders/:id/payment-request`。
3. `src/packageEmployees/pages/creditRecharge/index.tsx`
   - 页面进入时恢复最新 pending 订单。
   - 处理绝对倒计时、前后台恢复、cancel 后继续支付、归零后结果确认。
   - 当前 `8 × 1200ms` 的支付轮询不足以稳定覆盖 10 秒 worker 周期，需要按上文调整。
4. `src/packageEmployees/pages/creditRecharge/model.ts`
   - 增加支付动作映射、剩余时间计算、倒计时文案和可单测的状态转换。
5. `src/packageEmployees/pages/creditRecharge/components/RechargeStatusPanels.tsx`
   - 展示剩余时间、“继续支付”、“正在确认支付结果”和关闭状态。
6. `src/packageEmployees/pages/rechargeRecords/components/RechargeRecordCard.tsx`
   - 可选：对 pending 记录展示后端 `payment_action`，并跳转充值页继续支付。

当前 orange 的 `.env.development` 已指向 `http://192.168.1.19:3000`。本机联调前确认该
地址仍是运行 API 的电脑局域网 IP；微信开发者工具需关闭合法域名校验。真机不能使用
`localhost` 指向电脑，生产环境仍必须使用已备案且配置到微信后台的 HTTPS 域名。

## 关键错误码

| HTTP | code | 小程序处理 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 参数错误，记录 `requestId` 并提示刷新 |
| 401 | `UNAUTHORIZED` | 走现有重新登录流程 |
| 403 | `FORBIDDEN` | 无充值或查看权限 |
| 404 | `BILLING_RECHARGE_ORDER_NOT_FOUND` | 清理本地当前订单并刷新列表 |
| 409 | `BILLING_RECHARGE_ORDER_NOT_PENDING` | 请求详情，以最新状态为准 |
| 409 | `BILLING_RECHARGE_ORDER_EXPIRED` | 禁用支付并进入结果确认 |
| 409 | `BILLING_RECHARGE_PAYMENT_CHANNEL_UNSUPPORTED` | 隐藏继续支付入口 |
| 409 | `BILLING_RECHARGE_PAYMENT_REQUEST_UNAVAILABLE` | 刷新详情；仍不可用则提示重新下单 |
| 409 | `BILLING_RECHARGE_PAYMENT_CONFIG_MISMATCH` | 停止支付并上报 `requestId` |
| 502 | `WECHAT_PAY_PREPAY_FAILED` | 不重建订单；刷新详情，未过期时允许用户重试继续支付 |

错误响应格式为 `{ success: false, message, code, details?, requestId }`。不要把完整 token、
openid、支付签名或密钥写入日志；联调反馈只提供订单号、接口、错误码、`requestId` 和脱敏
响应体。

## 联调与验收清单

- [ ] 创建订单后显示服务端 5 分钟绝对倒计时。
- [ ] 页面前后台切换不会重置倒计时。
- [ ] 修改设备时间后重新显示页面，倒计时仍以新的 `server_time` 为准。
- [ ] 用户取消微信支付后订单保持 pending，剩余时间内可继续支付。
- [ ] 继续支付调用新接口，不创建第二笔订单。
- [ ] 到零后立即禁用支付，只显示“正在确认支付结果”，前端不关单。
- [ ] 已支付/关单竞态最终展示 `paid` 或 `closed`，不长期停留在可支付状态。
- [ ] `closed` 后重新充值得到新的 `out_trade_no` 和新的 UUID v4 幂等键。
- [ ] 充值记录列表仍使用分页，不传 `tenant_id`。
- [ ] 支付动作和退款动作均只读取各自的 `disabled_reason`，不读取 `code`。
- [ ] 网络超时重试同一创建请求复用原幂等键，用户发起新充值才生成新键。
- [ ] 日志和问题反馈不包含 token、openid、支付签名或密钥。

## 后端上线前置条件

后端必须作为一个完整单元上线：

1. 依次执行并核对以下 migration：
   - `20260718110000_tenant_credit_recharge_payment_expiration.sql`
   - `20260718121000_confirm_recharge_and_recover_atomically.sql`
   - `20260718122000_guard_pending_recharge_payment_config.sql`
   - `20260718122500_serialize_recharge_config_creation.sql`
   - `20260718123000_extend_recharge_claim_exclusions.sql`
2. 部署包含新接口和状态字段的 API。
3. 独立启动 `worker:billing-recharge-expiration`，默认 10 秒一次、每批 50 笔且不重叠。
4. 确认 worker 的结构化日志可观测 `claimed/paid/closed/retried/failed/release_failed`。
5. 完成真实的未支付过期、取消后继续支付、临界点已支付三类 smoke 后，再通知小程序开放。

## 责任边界

- gooes：migration、API 契约、微信查单/关单、原子入账、过期 worker 和监控。
- orange：倒计时展示、继续支付交互、页面恢复、轮询与错误文案。
- 小程序不调用 `/platform/billing/...`，不直接关闭订单，也不本地推导支付或退款资格。
