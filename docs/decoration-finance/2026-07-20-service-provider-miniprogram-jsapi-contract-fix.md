# 服务商小程序 JSAPI 支付契约修正

日期：2026-07-20

## 结论

租户项目收款使用服务商模式时，后端同时支持以下两种微信官方合法场景：

| 支付发起小程序 | 下单 AppID | 付款人字段 | 调起支付签名 AppID |
| --- | --- | --- | --- |
| 服务商小程序 | `sp_appid` | `payer.sp_openid` | `sp_appid` |
| 子商户小程序 | `sp_appid + sub_appid` | `payer.sub_openid` | `sub_appid` |

本平台当前优先采用“服务商小程序”模式。租户支付配置中的字段含义为：

- `merchant_id`：服务商商户号，即 `sp_mchid`。
- `sub_merchant_id`：租户特约商户号，即 `sub_mchid`。
- `app_id`：实际服务商小程序 AppID，即 `sp_appid`。
- `sub_app_id`：仅在租户使用自己的子商户小程序发起支付时填写；使用服务商小程序时为空。
- `payer_openid`：小程序提交当前登录用户在实际支付小程序下的 openid。后端根据支付配置决定映射为 `sp_openid` 或 `sub_openid`。

## 官方依据

- [服务商 JSAPI/小程序下单](https://pay.weixin.qq.com/doc/v3/partner/4012759974.md)：`sub_appid` 非必填，`sp_openid` 与 `sub_openid` 二选一。
- [服务商小程序支付开发指引](https://pay.weixin.qq.com/doc/v3/partner/4012076732.md)：在服务商小程序内下单时可不传 `sub_appid`；调起支付签名使用 `sp_appid`。
- [服务商小程序调起支付](https://pay.weixin.qq.com/doc/v3/partner/4012085827.md)：签名 AppID 必须是实际调起支付的小程序 AppID，且与下单时的 `sp_appid` 或 `sub_appid` 一致。

## 根因

平台支付配置界面已允许服务商模式不填写默认子商户 AppID，但后端旧实现仍存在三处强制假设：

1. 租户进件激活必须存在 `sub_appid`。
2. 项目微信支付订单创建必须存在 `sub_app_id`。
3. 服务商预下单固定发送 `sub_appid + payer.sub_openid`。

这使“平台统一服务商小程序 + 多租户 `sub_mchid`”无法进入真实支付链路，也可能让 openid 所属 AppID 与微信下单字段不一致。

## 修正后的后端行为

### 服务商小程序模式

配置条件：

- `merchant_mode = service_provider_sub_merchant`
- `merchant_id`、`sub_merchant_id`、`app_id` 已配置
- `sub_app_id = null`
- `applyment_state = opened`
- `appid_binding_state = bound`

微信预下单请求：

```json
{
  "sp_appid": "<config.app_id>",
  "sp_mchid": "<config.merchant_id>",
  "sub_mchid": "<config.sub_merchant_id>",
  "payer": {
    "sp_openid": "<order.payer_openid>"
  }
}
```

请求体不发送 `sub_appid`，后端返回给小程序的 `payment_request.paySign` 使用 `config.app_id` 参与签名。

### 子商户小程序模式

当 `sub_app_id` 有值时，后端保持原有能力：

```json
{
  "sp_appid": "<config.app_id>",
  "sp_mchid": "<config.merchant_id>",
  "sub_appid": "<config.sub_app_id>",
  "sub_mchid": "<config.sub_merchant_id>",
  "payer": {
    "sub_openid": "<order.payer_openid>"
  }
}
```

此时 `payment_request.paySign` 使用 `config.sub_app_id` 参与签名。

## API 兼容性

本轮没有新增或修改路由、请求字段和响应字段，也不需要数据库 migration。

租户项目在线收款仍使用：

```http
POST /finance/wechat-pay/orders
Authorization: Bearer <employee-token>
Content-Type: application/json
```

```json
{
  "project_id": "<project-id>",
  "receivable_plan_id": "<receivable-plan-id>",
  "workflow_task_id": "<pending-payment-task-id>",
  "amount": 100,
  "payer_openid": "<current-mini-program-openid>"
}
```

小程序继续直接消费响应中的 `payment_request` 调用 `wx.requestPayment`。小程序不得自行判断或提交 `sp_openid/sub_openid` 字段名，也不得自行选择签名 AppID。

## 小程序影响

只读检查 `/Users/leefo/Public/work/orange` 后，当前 orange 尚未接入租户项目的 `/finance/wechat-pay/orders` 在线支付入口。本轮后端修正不会影响现有平台积分充值和人工确认收款流程，因此 orange 当前无必改代码。

后续新增租户项目在线支付时，小程序团队只需：

1. 从当前小程序登录态取得 openid。
2. 按上述请求体创建项目微信支付订单。
3. 使用后端返回的 `payment_request` 调起支付。
4. 支付前端回调后查询后端订单状态，不以前端 `requestPayment:ok` 作为最终入账依据。
5. 不在小程序内维护服务商/子商户 AppID、商户号、证书或密钥。

## 验收清单

- 服务商小程序模式下，租户配置 `sub_app_id = null` 可以激活。
- 创建订单请求成功，微信下单 body 不包含 `sub_appid`。
- 微信下单 body 使用 `payer.sp_openid`。
- `payment_request.paySign` 使用实际服务商小程序 AppID 签名。
- 配置了 `sub_app_id` 的既有子商户小程序模式继续使用 `sub_openid`。
- 微信回调和主动查单以 `sp_mchid + sub_mchid + out_trade_no + amount` 校验资金归属。
- 平台直连积分充值链路不受影响。

真实小额支付 smoke 需在服务商支付权限、特约商户授权和实际 `sp_appid` 绑定均已确认后单独执行；本轮不创建真实微信支付订单。
