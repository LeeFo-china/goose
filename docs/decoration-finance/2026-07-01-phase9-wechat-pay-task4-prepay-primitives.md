# Phase 9 微信支付 Task 4：JSAPI 预下单基础闭环

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮完成真实微信支付 JSAPI 预下单基础闭环。单元测试通过注入
`fetch` 模拟微信支付远端响应，不在测试中访问公网。

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

5. 密钥引用加载：
   - 支持 `env://KEY`。
   - 支持 `secret://KEY` / `setting://KEY` / 直接系统设置 key。
   - secret bundle 使用 JSON，至少包含：
     - `private_key_pem`
     - `api_v3_key`
   - 可选包含：
     - `wechat_pay_public_key_id`
     - `wechat_pay_public_key_pem`
     - `base_url`
   - 错误响应不返回任何明文密钥。

6. 真实预下单 gateway：
   - 使用微信支付 API v3 Authorization 签名。
   - 调用直连或服务商 JSAPI 预下单 endpoint。
   - 解析 `prepay_id`。
   - 构造并返回小程序 `payment_request`。
   - 上游错误映射为 `WECHAT_PAY_PREPAY_FAILED`。

7. 订单服务接入：
   - 创建 `wechat_payment_orders` 后调用预下单 gateway。
   - 成功后回写 `wechat_payment_orders.prepay_id`。
   - `POST /finance/wechat-pay/orders` 返回非空 `payment_request`。

## 未完成

本轮还没有：

- 实现 `/pay/wechat/callback`。
- 自动创建 confirmed payment、核销应收、写台账、推进 workflow。
- 对真实微信支付环境执行小额 smoke。
- 生产密钥轮换与证书文件权限治理。

## 验证记录

```bash
(cd apps/api && bun test \
  src/services/wechat-pay-signatures.test.ts \
  src/services/wechat-pay-jsapi-request-builder.test.ts \
  src/services/wechat-pay-secret-bundles.test.ts \
  src/services/wechat-pay-gateway.test.ts \
  src/schema/wechat-pay-orders.test.ts \
  src/services/wechat-pay-orders.test.ts)
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/api run check:file-size
git diff --check
```

结果：

- API 微信支付 Task 4 相关测试 23 pass。
- API typecheck 通过。
- API file-size check 通过。
- `git diff --check` 通过。

## 小程序边界

本轮小程序需要准备 `payer_openid` 透传，但在后端未完成真实环境 smoke
之前，不建议直接放开线上支付入口。

当后端返回 `payment_request` 后，小程序调用：

```ts
wx.requestPayment(payment_request)
```

创建订单时传平台小程序 openid：

```json
{
  "payer_openid": "用户在平台小程序 AppID 下的 openid"
}
```
