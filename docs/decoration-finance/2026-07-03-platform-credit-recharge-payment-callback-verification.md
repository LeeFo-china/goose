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

未成功入库。

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

### 4. 订单状态是否已变更为 paid

未变更。

数据库当前状态：

```text
tenant_credit_orders.status          = pending
tenant_credit_orders.transaction_id  = null
tenant_credit_orders.paid_amount_fen = 0
tenant_credit_orders.paid_at         = null
```

### 5. 积分余额是否增加

未增加。

租户积分账户当前：

```text
balance_credits          = 0
available_credits        = 0
frozen_credits           = 0
total_recharged_credits  = 0
total_granted_credits    = 0
last_recharged_at        = null
```

### 6. 积分流水是否生成

未生成。

数据库核对：

```text
tenant_credit_ledger where source_type='tenant_credit_order'
and source_id='25203845-9497-4856-9c6f-c13c393190cd'
= 0 条
```

## 结论

本次真实支付链路状态：

- 预下单：通过
- 小程序调起支付：通过
- 微信支付结果：已支付成功
- 后端回调入库：未完成
- 后端订单 paid：未完成
- 积分余额增加：未完成
- 积分流水生成：未完成

当前问题已经不是小程序契约，也不是微信支付签名；缺口在后端回调入口未在 api-dev 公开放行，导致
微信支付成功通知没有进入 `WechatPayCallbackService`。

## 后端下一步

优先级 1：修复或发布 api-dev 回调公开入口

- 确保 api-dev 已部署包含 `POST /pay/wechat/callback` 公开白名单的后端版本。
- 如果有 Nginx / API Gateway / 反向代理鉴权层，也必须对该路径放行。
- 发布后用空 POST 探测应返回业务格式校验错误，而不是 `TOKEN_MISSING`：

```bash
curl -i -X POST https://api-dev.goodcms.cn/pay/wechat/callback \
  -H 'Content-Type: application/json' \
  --data '{}'
```

期望类似：

```text
400 VALIDATION_ERROR
微信支付回调缺少请求头 wechatpay-timestamp
```

优先级 2：等待或触发微信回调重试

- 回调入口放行后，观察 `tenant_credit_wechat_notifications` 是否生成记录。
- 观察订单是否自动变更为 `paid`。
- 观察 `tenant_credit_ledger` 是否生成 `wechat_recharge` 入账流水。

优先级 3：补受控查单补偿能力

如果微信不再重试这笔通知，不能手工直接改数据库。建议新增后端受控补偿能力：

- 对 `pending` 的微信充值订单调用微信“商户订单号查询订单”接口。
- 如果微信返回 `trade_state=SUCCESS` 且金额匹配，则通过服务层调用
  `billing_confirm_wechat_recharge` 完成订单 paid、积分账户和积分流水入账。
- 补偿动作需要记录审计日志或系统事件，避免静默改账。

## 给小程序侧的回执

这次小程序无需改代码。后端已确认：

- 创建充值订单成功。
- 微信侧查单为 `SUCCESS`。
- `transaction_id=4200003222202607030242248069`。
- 但 api-dev 回调入口当前返回 `401 TOKEN_MISSING`，支付成功通知未进入后端业务处理。

请小程序侧暂时不要重复支付同一笔订单。后端先修复/发布回调公开入口，等订单变更为 `paid` 后，
小程序再刷新订单和积分账户做最终确认。
