# 平台部署及年度技术服务：小程序支付一期交接契约

日期：2026-08-04

适用仓库：`gooes` 后端 / `orange` 小程序

状态：后端一期代码实现已完成并发布到 dev API，开发库 migration 已应用到
`api-dev.goodcms.cn:8000` 并验证 Local/Remote 对齐；数据库类型已从开发库重新生成。
发布完成门槛仍需补齐本地 migration reset 验证和真实小额支付/回调 smoke。当前文档
只覆盖商品、订单、普通微信支付、回调确认后自动建实施工单、退款申请基础能力；
不包含 Admin 页面、履约采集、培训记录、交付附件、客户验收和微信发货信息管理上报。

## 1. 业务边界

- 本业务名称固定为“平台部署及年度技术服务”，不是积分充值，也不是微信虚拟商品。
- 支付通道使用平台独立普通微信支付商户号的小程序 JSAPI 支付，客户端调用
  `wx.requestPayment`。
- 独立普通商户号能力完整保留，后续继续承接平台自营实物商城及其他符合普通支付
  规则的交易。
- 微信虚拟支付和虚拟商品目录继续保留，但只承接真正的数字商品，例如次数包、AI
  额度、积分等；不得用来承接本平台技术服务。
- 小程序不得传金额、商户号、支付通道、`payer_openid` 或价格折扣；这些都由后端
  当前已发布商品版本和订单快照决定。
- `wx.requestPayment:ok` 只表示客户端调起完成，不代表后端已确认支付；订单状态必须
  以后端查询为准。

## 2. Dev 环境

| 项目 | 值 |
| --- | --- |
| Dev API base URL | `https://api-dev.goodcms.cn` |
| Dev API release | GitHub Actions `Release Dev` run `30862755105`，commit `9217f5340858eabae3fb2fc7fc51a0ceaaf7a6a6` |
| Dev Supabase API host | `api-dev.goodcms.cn:8000` |
| 已应用 migration | `20260803110000`、`20260803113000`、`20260803114000` |
| 数据库类型 | `apps/api/src/types/database.ts` 已从开发库生成，包含平台服务商品、订单、工单、通知、退款表及 `platform_service_create_pending_order`、`platform_service_confirm_payment` RPC |
| Smoke 脚本 | `bun --cwd apps/api src/scripts/platform-service-payment-smoke.ts --dry-run` |
| Smoke token 环境变量 | `PLATFORM_SERVICE_SMOKE_TENANT_TOKEN`、`PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN` |

说明：本轮已使用当前 worktree API、本地 `http://127.0.0.1:3099`、开发库
`api-dev.goodcms.cn:8000` 和临时内存 JWT 完成 dry-run smoke。脚本未创建订单、
未发起支付，输出仅包含商品、readiness 和脱敏 Request-ID。随后已发布 dev API，并
使用 dev 登录接口获取的租户管理员与平台超管 token 对 `https://api-dev.goodcms.cn`
补跑 dry-run smoke，结果 `ok=true`、readiness 全部为 `true`、Request-ID：`req-e`。
本地 `.env` 自签 token 不被 dev 容器认可，曾返回 `TOKEN_INVALID`，后续 smoke 应使用
dev 登录接口或该环境认可的 smoke token。`.env` 中仍未固化 smoke 专用 token；后续 CI
或其他开发机执行时仍需显式注入上述两个 token。

## 3. 权限与开关

租户侧需要以下权限：

- `billing.service_order.create`：读取可购买服务商品、创建订单、继续支付；
- `billing.service_order.read`：读取订单列表和详情；
- `billing.service_order.refund.request`：提交售后/退款申请。

平台超管需要以下权限：

- `platform.service_product.manage`：管理平台服务商品草稿、发布版本、归档；
- `platform.service_order.read`：后续 Admin 订单查看；
- `platform.service_work_order.manage`：后续 Admin 实施工单处理。

支付配置开关：普通微信支付配置必须启用，且 `enabled_channels` 包含
`platform_service`。如果配置不完整、密钥版本不匹配或存在待支付平台服务订单，后端
会拒绝相关操作。

## 4. 初始化商品

以下为开发库当前已发布版本的真实非敏感字段。金额单位均为分，折扣由
`amount_fen / list_amount_fen` 计算，前端只展示，不参与计算。

```json
[
  {
    "code": "platform_service_1y",
    "status": "enabled",
    "title": "平台部署及年度技术服务（1年）",
    "term_years": 1,
    "list_amount_fen": 980000,
    "amount_fen": 980000,
    "price_rate_basis_points": 10000,
    "pricing_version": 1,
    "terms_version": 1,
    "service_scope": [
      "客户专属系统环境部署",
      "服务器基础配置与安全基线配置",
      "首次操作培训及实施指导",
      "1年年度运维与技术支持"
    ]
  },
  {
    "code": "platform_service_2y",
    "status": "enabled",
    "title": "平台部署及年度技术服务（2年）",
    "term_years": 2,
    "list_amount_fen": 1960000,
    "amount_fen": 1568000,
    "price_rate_basis_points": 8000,
    "pricing_version": 1,
    "terms_version": 1,
    "service_scope": [
      "客户专属系统环境部署",
      "服务器基础配置与安全基线配置",
      "首次操作培训及实施指导",
      "2年年度运维与技术支持"
    ]
  },
  {
    "code": "platform_service_3y",
    "status": "enabled",
    "title": "平台部署及年度技术服务（3年）",
    "term_years": 3,
    "list_amount_fen": 2940000,
    "amount_fen": 2058000,
    "price_rate_basis_points": 7000,
    "pricing_version": 1,
    "terms_version": 1,
    "service_scope": [
      "客户专属系统环境部署",
      "服务器基础配置与安全基线配置",
      "首次操作培训及实施指导",
      "3年年度运维与技术支持"
    ]
  }
]
```

这些是初始化默认值，不是代码常量。上线后平台可在服务商品管理中调整原价和实际
售价并发布新版本；新订单使用新版本，历史订单继续使用下单快照。

## 5. 租户侧接口

所有接口从登录态读取租户、员工和小程序 OpenID。小程序只处理 HTTP 状态和稳定
`code`，不要解析中文 `message`。

### 5.1 读取服务商品

```http
GET /billing/service-products?page=1&pageSize=20
Authorization: Bearer <tenant-token>
```

响应字段：

- `list[].code`
- `list[].title`
- `list[].term_years`
- `list[].list_amount_fen`
- `list[].amount_fen`
- `list[].price_rate_basis_points`
- `list[].pricing_version`
- `list[].service_scope`
- `list[].terms_version`
- `pagination`

列表默认 `page=1&pageSize=20`，`pageSize` 最大 100。

### 5.2 创建服务订单

```http
POST /billing/service-orders
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "product_code": "platform_service_1y",
  "terms_version": 1,
  "terms_accepted": true,
  "idempotency_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```

规则：

- `idempotency_key` 必须是 UUID；网络重试必须复用同一个值；
- 客户端不得传 `amount_fen`、`payer_openid`、`mchid`、`payment_channel`；
- 如果商品条款已更新，后端返回 `SERVICE_TERMS_VERSION_STALE`，小程序需要重新拉取
  商品并让用户再次确认；
- 同一租户同一幂等键只会产生一张订单。

成功响应示例：

```json
{
  "data": {
    "idempotent": false,
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "order_no": "TSO202608030001",
      "product_code": "platform_service_1y",
      "term_years": 1,
      "amount_fen": 980000,
      "payment_status": "pending",
      "service_status": "waiting_payment",
      "display_stage": "waiting_payment",
      "payment_expires_at": "2026-08-04T10:05:00.000Z",
      "paid_at": null,
      "closed_at": null,
      "terms_version": 1,
      "version": 1,
      "available_actions": {
        "continue_payment": {
          "enabled": true,
          "label": "继续支付",
          "disabled_reason": null
        },
        "request_refund": {
          "enabled": false,
          "label": "申请售后",
          "disabled_reason": "仅已支付订单可申请售后"
        }
      },
      "created_at": "2026-08-04T10:00:00.000Z",
      "updated_at": "2026-08-04T10:00:00.000Z"
    },
    "product": {
      "code": "platform_service_1y",
      "title": "平台部署及年度技术服务（1年）",
      "term_years": 1,
      "amount_fen": 980000,
      "list_amount_fen": 980000,
      "price_rate_basis_points": 10000,
      "pricing_version": 1,
      "terms_version": 1
    },
    "payment_request": {
      "timeStamp": "masked",
      "nonceStr": "masked",
      "package": "prepay_id=masked",
      "signType": "RSA",
      "paySign": "masked"
    },
    "server_time": "2026-08-04T10:00:00.000Z"
  },
  "message": "success"
}
```

`payment_request` 原样传给 `wx.requestPayment`。不要缓存或打印其中任何字段。

### 5.3 继续支付

```http
POST /billing/service-orders/:id/payment-request
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "idempotency_key": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "expected_version": 1
}
```

只有 `payment_status=pending` 且未超过 `payment_expires_at` 时可继续支付。若订单
版本变化，后端返回 `SERVICE_ORDER_VERSION_CONFLICT`，小程序应刷新订单再展示操作。

### 5.4 查询订单列表与详情

```http
GET /billing/service-orders?page=1&pageSize=20
GET /billing/service-orders/:id
```

列表支持：

- `paymentStatus`
- `serviceStatus`
- `keyword`

订单状态示例：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "order_no": "TSO202608030001",
      "product_code": "platform_service_1y",
      "term_years": 1,
      "amount_fen": 980000,
      "payment_status": "paid",
      "service_status": "waiting_assignment",
      "display_stage": "waiting_assignment",
      "payment_expires_at": "2026-08-04T10:05:00.000Z",
      "paid_at": "2026-08-04T10:01:00.000Z",
      "closed_at": null,
      "terms_version": 1,
      "version": 2,
      "available_actions": {
        "continue_payment": {
          "enabled": false,
          "label": "继续支付",
          "disabled_reason": "订单不是待支付状态"
        },
        "request_refund": {
          "enabled": true,
          "label": "申请售后",
          "disabled_reason": null
        }
      }
    },
    "server_time": "2026-08-04T10:01:03.000Z"
  },
  "message": "success"
}
```

后端不会向小程序返回 `payer_openid`、支付配置、原始商品快照、完整微信交易号、
`prepay_id`、回调明文或证书信息。

### 5.5 提交售后/退款申请

```http
POST /billing/service-orders/:id/refund-requests
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "idempotency_key": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "expected_version": 2,
  "reason": "暂不需要实施服务"
}
```

本期只创建退款审核记录，并把订单置为 `refund_reviewing`，不直接调用微信退款。
幂等键重复时返回原申请；非已支付订单返回 `SERVICE_ORDER_INVALID_STATE`。

退款审核中示例：

```json
{
  "data": {
    "request": {
      "id": "20000000-0000-4000-8000-000000000001",
      "order_id": "10000000-0000-4000-8000-000000000001",
      "status": "pending_review",
      "reason": "暂不需要实施服务",
      "created_at": "2026-08-04T10:03:00.000Z",
      "updated_at": "2026-08-04T10:03:00.000Z"
    },
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "payment_status": "refund_reviewing",
      "service_status": "waiting_assignment",
      "display_stage": "refund_reviewing",
      "version": 3
    }
  },
  "message": "success"
}
```

## 6. 平台商品管理接口

一期后端已提供接口，Admin 页面不在本期范围。

```http
GET /platform/billing/service-products?page=1&pageSize=20
POST /platform/billing/service-products
PATCH /platform/billing/service-products/:id
POST /platform/billing/service-products/:id/publish
POST /platform/billing/service-products/:id/archive
```

字段：

- `code`
- `title`
- `term_years`
- `list_amount_fen`
- `amount_fen`
- `service_scope`
- `terms_content`
- `expected_version`
- `idempotency_key`

平台只维护原价和实际售价；`price_rate_basis_points` 由后端根据已发布版本实时计算。

## 7. 小程序推荐流程

1. 页面进入时调用 `GET /billing/service-products`；
2. 用户选择套餐并勾选条款，生成 UUID v4 `idempotency_key`；
3. 调用 `POST /billing/service-orders`；
4. 如果返回 `payment_request`，原样调用 `requestWechatPayment`/`wx.requestPayment`；
5. 微信支付 success 后展示“支付完成，正在确认”，立即刷新订单详情；
6. 若仍是 `pending`，按 `1s、2s、3s、5s` 轮询，最长 30 秒；
7. 超时仍未确认时展示“结果确认中，可稍后在订单记录查看”，不要提示支付失败；
8. 订单 `paid + waiting_assignment` 时展示“已支付，等待平台分配实施人员”；
9. 如需售后，调用退款申请接口，不要自行判断可退款金额。

## 8. 错误码处理

| code | 建议提示/处理 |
| --- | --- |
| `PAYER_OPENID_REQUIRED` | 请用户重新登录小程序后再发起支付 |
| `SERVICE_PRODUCT_NOT_FOUND` | 商品不存在或已停用，刷新商品列表 |
| `SERVICE_TERMS_VERSION_STALE` | 条款已更新，刷新商品并重新确认 |
| `SERVICE_PAYMENT_CONFIG_INVALID` | 平台微信支付暂未启用，请稍后重试 |
| `SERVICE_PAYMENT_PREPAY_FAILED` | 微信预下单失败，保留订单并允许继续支付 |
| `SERVICE_ORDER_INVALID_STATE` | 订单状态已变化，刷新订单详情 |
| `SERVICE_ORDER_VERSION_CONFLICT` | 订单版本冲突，刷新后再操作 |
| `SERVICE_REFUND_ALREADY_PENDING` | 已有售后申请处理中 |
| `VALIDATION_ERROR` | 请求参数不完整或字段多传 |
| `FORBIDDEN` | 当前账号没有平台服务购买或查看权限 |

## 9. Orange 侧影响模块

只读检查到的现有模块：

- `src/services/billing.ts`：新增服务商品、服务订单、继续支付、退款申请 API 方法；
- `src/types/api/billing.d.ts`：新增服务商品、服务订单、状态、动作、支付响应类型；
- `src/packageEmployees/pages/creditRecharge`：可参考商品选择、幂等下单和支付反馈，但不要
  复用“积分充值”文案和积分字段；
- `src/packageEmployees/pages/rechargeRecords`：可参考订单倒计时、继续支付、轮询和售后
  sheet，但新页面字段必须使用服务订单状态；
- `src/utils/wechat_payment.ts`：普通支付封装可复用；
- `src/app.config.ts`：后续新增页面路径时需要注册到 `packageEmployees`。

Orange 仓库本轮保持只读，Gooes 不提交任何 orange 改动。

## 10. 本期明确不包含

- 实施工单详情页；
- 服务器配置记录；
- 培训记录；
- 交付附件上传；
- 客户验收/驳回凭证；
- 微信发货信息管理上报；
- 服务合同期生成；
- Admin 商品、订单、工单页面；
- 旧积分充值入口关闭。

这些能力应进入后续二期至五期，不能由小程序在本期自行补状态或伪造履约完成。

## 11. Smoke 与验收清单

后端提供脚本：

```bash
API_BASE_URL=https://api-dev.goodcms.cn \
PLATFORM_SERVICE_SMOKE_TENANT_TOKEN=<tenant-token> \
PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN=<platform-token> \
bun --cwd apps/api src/scripts/platform-service-payment-smoke.ts --dry-run
```

脚本只输出 API 环境、商品 code/金额、订单 ID/no、三类状态、Request-ID 和 readiness；
不会输出 token、OpenID、`prepay_id`、`paySign`、证书或回调明文。

发布前需要完成：

- dry-run HTTP smoke exit 0；本轮本地 API + dev DB、正式 dev 域名
  `https://api-dev.goodcms.cn` 均已验证通过；
- 真机使用测试租户创建 1 笔小额订单；
- 确认 `wx.requestPayment` 成功后，后端订单变为 `paid`；
- 确认支付成功后恰好创建 1 张 `tenant_service_work_orders`；
- 重复刷新或重复回调不会重复建工单；
- 退款申请只进入 `refund_reviewing`，不直接退款；
- Orange 日志和异常反馈不得包含 token、OpenID、完整微信单号和支付签名。
