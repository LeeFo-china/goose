# Phase 9 微信支付 Task 4 前置：签名与 JSAPI 请求构造

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮完成真实微信支付下单前置基础设施，不调用微信支付远端接口。

已完成：

1. 微信支付 API v3 请求签名：
   - 构造请求签名串。
   - 生成 `WECHATPAY2-SHA256-RSA2048` Authorization header。
   - 测试用临时 RSA key 验证签名可被公钥校验。

2. 小程序支付参数签名：
   - 根据 `appId`、`prepay_id`、时间戳、随机串生成签名串。
   - 返回小程序 `wx.requestPayment` 需要的：
     - `timeStamp`
     - `nonceStr`
     - `package`
     - `signType=RSA`
     - `paySign`
   - 测试用临时 RSA key 验证 `paySign` 可被公钥校验。

3. JSAPI 下单请求体构造：
   - 直连商户：`/v3/pay/transactions/jsapi`
   - 服务商子商户：`/v3/pay/partner/transactions/jsapi`
   - 金额从元转换为分。
   - 直连模式使用 `payer.openid`。
   - 服务商子商户模式使用 `payer.sub_openid`。

4. 创建订单接口支持 `payer_openid`：
   - `POST /finance/wechat-pay/orders` 可接收 `payer_openid`。
   - 后端会 trim 后保存到 `wechat_payment_orders.payer_openid`。
   - 真实 JSAPI 下单需要该字段。

## 未完成

本轮还没有：

- 从密钥管理系统读取真实私钥/APIv3 key。
- 调用微信支付 HTTPS API。
- 保存真实 `prepay_id`。
- 返回非空 `payment_request`。
- 实现 `/pay/wechat/callback`。
- 自动创建 confirmed payment、核销应收、写台账、推进 workflow。

## 验证记录

```bash
(cd apps/api && bun test \
  src/services/wechat-pay-signatures.test.ts \
  src/services/wechat-pay-jsapi-request-builder.test.ts \
  src/schema/wechat-pay-orders.test.ts \
  src/services/wechat-pay-orders.test.ts)
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/api run check:file-size
git diff --check
```

结果：

- API 微信支付 Task 4 前置相关测试 18 pass。
- API typecheck 通过。
- API file-size check 通过。
- `git diff --check` 通过。

## 小程序边界

本轮小程序仍无必改。

后续当后端真实返回 `payment_request` 后，小程序再接：

```ts
wx.requestPayment(payment_request)
```

在此之前，小程序只需要确保创建订单时能传平台小程序 openid：

```json
{
  "payer_openid": "用户在平台小程序 AppID 下的 openid"
}
```
