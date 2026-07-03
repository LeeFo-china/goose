# 平台积分充值微信支付 SIGN_ERROR 修复对接记录

日期：2026-07-03

## 背景

orange 小程序侧真实支付 smoke 已越过订单外键问题，最新失败点在微信支付预下单：

```text
requestId: req-60
接口: POST /billing/recharge-orders
后端错误码: WECHAT_PAY_PREPAY_FAILED
微信 HTTP 状态: 401
微信错误码: SIGN_ERROR
微信返回: 签名信息错误，验签失败
```

这类错误表示微信支付网关拒绝的是后端请求头里的 `Authorization` 签名，不是小程序
payload，也不是 openid 缺失。

## 官方规则复核

本次对照了微信支付 APIv3 官方文档：

- 如何构造接口请求签名：
  https://pay.weixin.qq.com/doc/v3/merchant/4012365336
- 小程序 JSAPI 下单：
  https://pay.weixin.qq.com/doc/v3/merchant/4012791897
- 小程序支付错误码：
  https://pay.weixin.qq.com/doc/v3/merchant/4020770421

关键约束：

- 请求签名串必须是 `METHOD\nURL\ntimestamp\nnonce\nbody\n`。
- 参与签名的 `body` 必须和实际发送给微信的请求体完全一致。
- `Authorization` 头使用 `WECHATPAY2-SHA256-RSA2048`。
- 签名信息里的 `mchid`、`nonce_str`、`signature`、`timestamp`、`serial_no` 之间用英文逗号分隔。
- `serial_no` 是商户 API 证书序列号，不是微信平台证书序列号，也不是微信支付公钥 ID。

## 已排除项

已按 req-60 方向复核后端本地配置和运行配置：

- 当前平台配置是直连商户模式：`direct_merchant`。
- `merchant_id` 指向平台独立收款商户。
- `serial_no` 与本地商户 API 证书序列号一致。
- 运行时 secret bundle 中的私钥与本地商户 API 证书匹配。
- 代码里签名使用的 `body` 和 `fetch` 实际发送的 `body` 是同一个 `JSON.stringify(...)` 结果。

未在文档中记录 APIv3 Key、私钥内容或敏感明文。

## 根因

后端 `buildWechatPayAuthorization` 生成的 `Authorization` 头中，签名信息字段此前使用空格分隔：

```text
WECHATPAY2-SHA256-RSA2048 mchid="..." nonce_str="..." signature="..." timestamp="..." serial_no="..."
```

官方要求是认证类型后跟逗号分隔的签名信息：

```text
WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",signature="...",timestamp="...",serial_no="..."
```

字段分隔格式不符合官方规范，会导致微信支付网关解析或验签失败，表现为 `401 SIGN_ERROR`。

## 修复

修改文件：

```text
apps/api/src/services/wechat-pay-signatures.ts
apps/api/src/services/wechat-pay-signatures.test.ts
```

修复内容：

- `Authorization` 头的签名字段改为英文逗号分隔。
- 单测增加严格格式断言，防止退回空格分隔格式。
- 未修改小程序请求契约、openid 逻辑、下单 body、商户证书配置和回调逻辑。

## 验证

已执行：

```bash
bun test src/services/wechat-pay-signatures.test.ts src/services/wechat-pay-gateway.test.ts src/services/wechat-pay-orders.test.ts src/services/billing-recharge.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

结果：

```text
18 pass
0 fail
API TypeScript noEmit 通过
```

## 小程序复测口径

API 重启或发布后，orange 可以按原契约重新做真实小额支付 smoke：

```http
POST /billing/recharge-orders
Authorization: Bearer <employee-token>
Content-Type: application/json
```

请求体仍只提交：

```json
{
  "package_code": "smoke_1fen",
  "payer_openid": "<当前平台小程序 openid>",
  "idempotency_key": "<新的幂等键>"
}
```

注意：

- 建议使用新的 `idempotency_key`，避免复用失败订单。
- 小程序仍不要上传金额、积分、`payment_config_id` 或支付配置。
- 如果后端返回 `payment_request`，小程序继续调用 `wx.requestPayment`。
- 如果仍失败，请回传新的 `requestId`、`order.id`、`order_no/out_trade_no`、微信错误码和微信返回 message。
- 如果支付成功，请回填微信交易号、回调结果、积分账户余额、积分流水和页面截图或接口日志。

## 当前状态

后端签名格式问题已修复并通过本地验证。真实支付链路仍需要小程序侧重新发起小额支付 smoke
来验证微信预下单、`wx.requestPayment`、回调解密验签、积分入账和流水闭环。
