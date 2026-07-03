# 平台积分充值真实支付回调闭环核对记录

日期：2026-07-03

## 背景

orange 小程序侧重新发起 `smoke_1fen` 真实支付：

- 前端请求契约未变，只提交 `package_code / payer_openid / idempotency_key`
- 创建充值订单成功
- 小程序侧微信支付成功
- 小程序连续查询订单接口均返回 200

本次后端按订单 ID 核对支付、回调、订单状态、积分账户和积分流水闭环。

```text
order.id = 25203845-9497-4856-9c6f-c13c393190cd
```

## 官方依据

微信支付 JSAPI 官方文档明确：前端支付回调不能作为最终支付状态依据，商户后端需要通过查单
API 和支付成功回调确认订单状态。

参考：

- JSAPI 支付开发指引：
  https://pay.weixin.qq.com/doc/v3/merchant/4012791870
- 商户订单号查询订单：
  https://pay.weixin.qq.com/doc/v3/merchant/4012791859
- 支付成功回调通知：
  https://pay.weixin.qq.com/doc/v3/merchant/4012791861

## 后端核对结果

### 1. order_no / out_trade_no

已查到：

```text
order_no     = TC202607030350144069CF5EEF8
out_trade_no = TC202607030350144069CF5EEF8
```

订单基础信息：

```text
channel          = wechat_pay
package_code     = smoke_1fen
amount_fen       = 1
credits          = 1
bonus_credits    = 0
payment_config_id = 10794e96-3007-440c-994a-e5db39a5dc26
```

### 2. 微信 transaction_id

后端已使用商户订单号调用微信支付查单接口：

```http
GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid=1112582521
```

微信返回：

```text
http_status      = 200
trade_state      = SUCCESS
trade_state_desc = 支付成功
transaction_id   = 4200003222202607030242248069
success_time     = 2026-07-03T11:50:22+08:00
amount.total     = 1
amount.payer_total = 1
appid            = wxbac3b1e168fd968a
mchid            = 1112582521
```

结论：微信侧支付已经成功。

### 3. 支付回调是否成功入库

首次核对时未成功入库。

数据库核对：

```text
tenant_credit_wechat_notifications = 0 条
latest_notification_id             = null
```

同时探测回调入口：

```text
本地当前 API:
POST http://127.0.0.1:3000/pay/wechat/callback
返回 400 VALIDATION_ERROR: 微信支付回调缺少请求头 wechatpay-timestamp

api-dev:
POST https://api-dev.goodcms.cn/pay/wechat/callback
返回 401 TOKEN_MISSING
requestId = req-c9n
```

本地当前代码已把 `POST /pay/wechat/callback` 配置为公开路由；缺少微信回调头时返回
`VALIDATION_ERROR` 是符合预期的公开回调入口表现。

api-dev 返回 `TOKEN_MISSING` 说明请求在进入微信回调 controller 前被全局鉴权拦截。当前更像是
api-dev 未部署包含公开回调白名单的后端版本，或网关/部署层仍对该路径做登录鉴权。

发布修复后重新核对：

```text
deploy run = https://github.com/LeeFo-china/goose/actions/runs/28638201654
commit     = 4a24c679 fix(ci): 修复dev发布镜像引用
api-dev callback probe:
POST https://api-dev.goodcms.cn/pay/wechat/callback
返回 400 VALIDATION_ERROR: 微信支付回调缺少请求头 wechatpay-timestamp
requestId = req-4
```

结论：api-dev 回调入口已公开放行，不再返回 `TOKEN_MISSING`。

微信回调重试后已成功入库：

```text
tenant_credit_wechat_notifications.id = ca12f8eb-ba08-4b42-9d4e-d475326fb5e8
notify_id                             = cd0bc789-4ed2-54b6-895b-05da50b5472f
event_type                            = TRANSACTION.SUCCESS
signature_valid                       = true
processed                             = true
processed_at                          = 2026-07-03T04:24:30.151+00:00
error_message                         = null
```

### 4. 订单状态是否已变更为 paid

已变更为 `paid`。

数据库最终状态：

```text
tenant_credit_orders.status                 = paid
tenant_credit_orders.transaction_id         = 4200003222202607030242248069
tenant_credit_orders.paid_amount_fen        = 1
tenant_credit_orders.paid_at                = 2026-07-03T03:50:22+00:00
tenant_credit_orders.latest_notification_id = ca12f8eb-ba08-4b42-9d4e-d475326fb5e8
tenant_credit_orders.updated_at             = 2026-07-03T04:24:30.130431+00:00
```

### 5. 积分余额是否增加

已增加。

租户积分账户当前：

```text
balance_credits          = 1
available_credits        = 1
frozen_credits           = 0
total_recharged_credits  = 1
total_consumed_credits   = 0
last_recharged_at        = 2026-07-03T03:50:22+00:00
```

### 6. 积分流水是否生成

已生成。

数据库核对：

```text
tenant_credit_ledger where source_type='tenant_credit_order'
and source_id='25203845-9497-4856-9c6f-c13c393190cd'
= 1 条

ledger.id        = 776e56fc-89d7-4592-8090-c68ddbd0edbf
event_type       = wechat_recharge
direction        = in
change_credits   = 1
balance_after    = 1
source_no        = TC202607030350144069CF5EEF8
remark           = 微信支付积分充值
created_at       = 2026-07-03T04:24:30.130431+00:00
```

## 结论

本次真实支付链路状态：

- 预下单：通过
- 小程序调起支付：通过
- 微信支付结果：已支付成功
- 后端回调入库：通过
- 后端订单 paid：通过
- 积分余额增加：通过
- 积分流水生成：通过

首次失败根因不是小程序契约，也不是微信支付签名，而是 api-dev 尚未部署公开回调白名单版本；
回调请求在进入 `WechatPayCallbackService` 前被全局鉴权拦截。

发布后微信回调入口已公开放行，微信回调重试已进入后端并完成订单、积分账户和积分流水闭环。

## 发布与验证记录

- `767e7175 fix(billing): 修复微信支付签名头格式`
- `4db1edd7 docs(billing): 记录积分充值支付回调核对`
- `4a24c679 fix(ci): 修复dev发布镜像引用`
- Dev API 发布：`https://github.com/LeeFo-china/goose/actions/runs/28638201654`

当前不需要手工补偿这笔订单。后续仍建议保留“受控查单补偿能力”作为运维能力，用于处理微信不再
重试、网络中断或回调处理失败后的人工审计补偿；补偿必须复用服务层/RPC，不能直接手工改库。

## 给小程序侧的回执

这次小程序无需改代码。后端已确认该笔真实 1 分钱充值闭环通过：

- 创建充值订单成功。
- 微信侧查单为 `SUCCESS`。
- `transaction_id=4200003222202607030242248069`。
- 微信回调已成功入库并处理。
- 订单已变更为 `paid`。
- 租户积分账户已增加 1 积分。
- 积分流水已生成：`776e56fc-89d7-4592-8090-c68ddbd0edbf`。

小程序侧可以刷新订单和积分账户做最终确认；不需要重复支付同一笔订单。
