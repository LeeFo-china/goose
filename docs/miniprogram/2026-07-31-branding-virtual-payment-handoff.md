# 年度品牌权益微信虚拟支付：小程序交接契约

日期：2026-07-31

适用仓库：`gooes` 后端 / `orange` 小程序

状态：后端代码和本地验证资产已完成；十一条 migration 尚未应用到 dev，微信后台
虚拟商品、密钥、真机 sandbox 与生产 iOS 验收仍是发布闸门。本文档不授权修改
`gooes` 的服务端契约，也不代表已经开放生产购买。

## 1. 共享契约与交付物

小程序必须升级到 `@gooes/domain@1.14.0`，直接导入其中的购买模式、环境、平台、
支付、履约和退款状态，不得在 Orange 中复制枚举或修改本地类型绕过升级。

| 项目 | 值 |
| --- | --- |
| 包名与版本 | `@gooes/domain@1.14.0` |
| 仓库内本机联调制品 | `packages/domain/gooes-domain-1.14.0.tgz`（本地生成、Git 忽略） |
| SHA-256 | `06b02cb2f21dc56edfd69aa6c7e1ac9dd4e97f14a8e337eed3dc2038532df3ac` |
| 商品编码 | `custom_support_branding_annual` |
| 权益编码 | `custom_support_branding` |
| 虚拟支付能力 | `wx.requestVirtualPayment` |

tarball 仅供本机联调且不加入 Git。CI 和其他开发机在切换前必须取得版本不可变、
可校验 SHA-256 的制品地址；不能继续引用旧的 `1.13.0` 本机绝对路径。

## 2. 不可变业务边界

- 年度权益是数字商品，只能按服务端 `purchase_mode` 走微信虚拟支付或维护态。
- 首期数量固定为 `1`、周期固定为一个自然年，不实现自动续费。
- iOS、Android、鸿蒙和 Windows 的用户售价一致；客户端不加手续费、不按平台改价。
- 金额、商品名称、退款政策和平台由服务端订单快照决定。
- 虚拟支付异常绝不回退 `wx.requestPayment`。
- 独立商户号普通支付能力完整保留，但只服务后续平台自营实物商城及其他符合普通
  支付规则的交易；不得用于年度品牌权益兜底。
- 支付 API 的 success 回调不等于到账或权益开通，后端订单是唯一事实来源。
- Token、OpenID、AppKey、session key、完整微信订单号和支付签名不得写入日志或联调反馈。

## 3. 小程序固定接入流程

1. 调用 `GET /tenant/branding/entitlement-product`，读取 `capability`、
   `purchase_mode`、`virtual_payment_available` 和 `unavailable_reason`。
2. 调用 `POST /tenant/branding/virtual-payment/orders`；客户端只传
   `product_code`、UUID v4 `idempotency_key` 和 `requested_platform`。
3. 调用 `POST /tenant/branding/virtual-payment/orders/:id/payment-request`，body 为 `{}`。
4. 将响应中的 `payment_request.request_payload` 原样传给
   `wx.requestVirtualPayment`，不增删字段、不自行签名。
5. `wx.requestVirtualPayment` success 只展示“支付结果确认中”，随后轮询
   `GET /tenant/branding/entitlement-orders/:id`。
6. 收到 `BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED`，或客户端支付返回
   `-15007` 时，先重新 `wx.login` 完成后端会话换取，再针对同一订单重新请求
   `payment-request`；不得新建订单。
7. 旧接口收到 `BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED` 时提示用户升级，绝不调用
   `wx.requestPayment`。
8. iOS 不满足条件、用户取消、网络失败和超时均保留原订单并允许后续查单/重试，
   不回退普通支付。
9. 历史订单按服务端 `payment_channel` 展示；客户端不计算手续费、不修改金额，
   也不根据系统平台生成不同售价。

建议轮询采用 `1s、2s、3s、5s` 递增间隔，总时长不超过 30 秒；超时后展示
“结果确认中，可稍后在订单记录查看”，而不是提示支付失败。用户重新进入页面时继续
读取统一订单详情。

## 4. 接口契约

所有租户接口从 JWT 读取租户、员工和已验证 OpenID，不接受 `tenant_id`、
`payer_openid`、金额或商品映射字段。错误分支按 HTTP 状态和稳定 `code` 处理，
不解析中文 `message`。

### 4.1 读取商品 capability

```http
GET /tenant/branding/entitlement-product
```

成功示例：

```json
{
  "data": {
    "product": {
      "code": "custom_support_branding_annual",
      "entitlement_code": "custom_support_branding",
      "name": "年度品牌技术支持",
      "amount_fen": 100,
      "term_years": 1,
      "purchase_mode": "wechat_virtual",
      "payment_channel": "wechat_virtual",
      "virtual_payment_available": true,
      "unavailable_reason": null,
      "minimum_amount_fen": 100,
      "capability": "wx.requestVirtualPayment"
    },
    "server_time": "2026-07-31T08:00:00.000Z"
  },
  "message": "success"
}
```

维护态仍返回商品，但 `purchase_mode=maintenance`、
`virtual_payment_available=false`、`unavailable_reason=PURCHASE_MAINTENANCE`。

### 4.2 创建虚拟订单

```http
POST /tenant/branding/virtual-payment/orders
Content-Type: application/json
```

```json
{
  "product_code": "custom_support_branding_annual",
  "idempotency_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "requested_platform": "android"
}
```

`requested_platform` 只能使用共享包中的 `android | harmony | windows | ios | unknown`。
网络超时重试必须复用同一幂等键；同键重放由后端复用同一订单。

成功示例：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "order_no": "BV202607310001",
      "out_trade_no": "masked",
      "product_code": "custom_support_branding_annual",
      "amount_fen": 100,
      "term_years": 1,
      "environment": "production",
      "requested_platform": "android",
      "payment_status": "pending",
      "fulfillment_status": "pending",
      "refund_status": "none",
      "payment_expires_at": "2026-07-31T08:05:00.000Z"
    },
    "server_time": "2026-07-31T08:00:00.000Z"
  },
  "message": "success"
}
```

### 4.3 获取虚拟支付参数

```http
POST /tenant/branding/virtual-payment/orders/:id/payment-request
Content-Type: application/json

{}
```

成功示例：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "payment_status": "pending",
      "fulfillment_status": "pending",
      "refund_status": "none"
    },
    "payment_request": {
      "kind": "wechat_virtual",
      "environment": "production",
      "request_payload": {
        "signData": "masked",
        "mode": "short_series_goods",
        "paySig": "masked",
        "signature": "masked"
      }
    },
    "server_time": "2026-07-31T08:00:02.000Z"
  },
  "message": "success"
}
```

调用方式必须保持对象原样：

```ts
wx.requestVirtualPayment(paymentRequest.request_payload);
```

### 4.4 查询统一订单

```http
GET /tenant/branding/entitlement-orders/:id
GET /tenant/branding/entitlement-orders?page=1&pageSize=20
```

处理中示例：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "status": "pending",
      "payment_channel": "wechat_virtual",
      "payment_platform": "android",
      "payment_status": "pending",
      "fulfillment_status": "pending",
      "refund_status": "none",
      "entitlement": null,
      "payment_action": {
        "enabled": true,
        "disabled_reason": null
      }
    },
    "audit_summary": {},
    "server_time": "2026-07-31T08:00:05.000Z"
  },
  "message": "success"
}
```

只有 `payment_status=succeeded` 且 `fulfillment_status=granted`、并返回有效
`entitlement` 时，页面才展示“已开通/已续期”。`grant_failed` 表示支付已确认但
履约待后端补偿，客户端继续展示“开通处理中”，不能再次支付。

列表默认 `page=1&pageSize=20`，`pageSize` 最大 100。历史普通支付订单返回
`payment_channel=legacy_direct`，新订单返回 `wechat_virtual`。

## 5. 错误与降级样例

维护态：

```json
{
  "success": false,
  "message": "年度品牌权益当前不可使用虚拟支付",
  "code": "BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE",
  "requestId": "req-masked"
}
```

需要重新登录：

```json
{
  "success": false,
  "message": "微信会话已失效，请重新登录",
  "code": "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
  "requestId": "req-masked"
}
```

旧支付渠道已迁移：

```json
{
  "success": false,
  "message": "品牌权益购买渠道已迁移",
  "code": "BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED",
  "requestId": "req-masked"
}
```

一般失败：

```json
{
  "success": false,
  "message": "生产虚拟商品映射不可用",
  "code": "BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE",
  "requestId": "req-masked"
}
```

客户端动作对照：

| 条件 | 动作 |
| --- | --- |
| capability 的 `PURCHASE_MAINTENANCE` / 下单的 `BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE` | 禁用购买，展示维护说明 |
| `BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED` / `-15007` | `wx.login` 后对同一订单重取支付参数 |
| `BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED` | 提示升级，停止旧流程 |
| 用户取消 | 保留订单，回到页面；不宣告支付失败 |
| 网络错误或超时 | 查询统一订单；不新建订单、不切普通支付 |
| `payment=succeeded, fulfillment=pending/grant_failed` | 展示“开通处理中”，等待后端补偿 |
| `payment=succeeded, fulfillment=granted` | 刷新 `/tenant/branding` 与有效品牌状态 |

## 6. Orange 需要修改的文件

以下路径仅为交接影响清单；本次后端实施没有修改 Orange：

- `src/services/branding.ts`：增加虚拟订单创建和 payment-request，停止品牌权益旧创建接口。
- `src/packageEmployees/pages/brandingSettings/hooks/useBrandingEntitlementPurchase.ts`：
  用 `wx.requestVirtualPayment`、重新登录和后端轮询替换 `requestWechatPayment`。
- `src/packageEmployees/pages/brandingSettings/components/BrandingEntitlementPurchase.tsx`：
  增加 capability、维护态、确认中和会话刷新状态。
- `src/packageEmployees/pages/brandingSettings/purchaseModel.ts`：接入共享状态和统一展示模型。
- `src/packageEmployees/pages/brandingEntitlementOrders/model.ts`：按三套状态和渠道建模。
- `src/packageEmployees/pages/brandingEntitlementOrders/BrandingOrderCard.tsx`：展示
  `payment_channel`、支付/履约/退款状态，虚拟订单不走普通支付按钮。
- `src/types/api/branding.d.ts`：删除可由 `@gooes/domain@1.14.0` 提供的重复枚举，
  仅保留 API 组合 DTO。
- `package.json` 及 lockfile：将 `@gooes/domain` 升级为可移植的 `1.14.0` 制品。

## 7. 联调与验收清单

- [ ] dev 十一条 migration 的 Local/Remote 对齐。
- [ ] dev 配置 sandbox 与 production mapping，状态为 active/valid，金额一致。
- [ ] Orange 使用 `@gooes/domain@1.14.0`，制品 SHA-256 校验一致。
- [ ] Android、鸿蒙、Windows sandbox 创建、支付、通知和一次性履约通过。
- [ ] success 回调丢失、通知屏蔽、重复通知和主动查单补偿通过。
- [ ] `-15007` 重新登录后复用同一订单，幂等键和订单 ID 不变。
- [ ] 取消、网络失败和超时均不调用 `wx.requestPayment`。
- [ ] iOS 生产受控真实支付金额不低于 1 元，Apple 外部退款状态通过。
- [ ] 普通独立商户号下单、通知、查单、关单、退款、账单完整回归。
- [ ] 联调反馈只包含接口、HTTP 状态、错误码、requestId、订单 ID、微信订单标识
  哈希、环境和三套最终状态。

## 8. 当前发布事实

- 本地 migration list 与 dry-run 已确认仅待应用本方案十一条 migration，未执行 apply。
- smoke 默认只读，不调用客户端支付或退款。
- 显式设置 `VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER=true` 后，脚本仍要求租户
  capability 同时确认 `environment=sandbox` 和
  `sandbox_order_creation_supported=true`；当前租户 API 与数据库 claim 链路只允许
  production mapping，capability 未开放这两个声明，因而会在 POST 真实订单前以
  `VIRTUAL_PAYMENT_SMOKE_SANDBOX_RUNTIME_UNCONFIRMED` 安全中止。
- 真实 sandbox、生产 iOS 支付、通知、退款和 EXPLAIN 必须在 dev migration 应用且
  微信后台配置完成后人工执行；自动脚本不会扣款。
