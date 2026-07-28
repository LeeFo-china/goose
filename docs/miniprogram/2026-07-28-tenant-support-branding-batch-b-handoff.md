# 租户自定义品牌技术支持：后端批次 B 联调契约

日期：2026-07-28

适用仓库：`gooes` 后端 / `orange` 小程序

状态：本地实现与联调契约初稿；dev 部署、测试商品和远端 smoke 证据待
Task 12 回填

## 1. 联调信息

| 项目 | 当前值 |
| --- | --- |
| API Base URL | `https://api-dev.goodcms.cn`（待本批次部署确认） |
| 后端 API Commit | `待 Task 12 回填` |
| Migration | `20260728120000_create_branding_addon_commerce.sql`（待远端对齐确认） |
| 商品编码 | `custom_support_branding_annual` |
| 权益编码 | `custom_support_branding` |
| dev 商品 | `待 Task 12 配置为 1 分、1 年、enabled=true` |
| 有权益租户管理员 | `19907270001`（候选，待 Task 12 复核微信登录态和购买权限） |
| 无权益隔离租户管理员 | `19907270002`（候选，待 Task 12 复核微信登录态和购买权限） |
| 平台管理员 | `19900000001`（候选，平台订单审计 smoke 可选） |

Token、OpenID、微信支付签名、APIv3 密钥和证书不写入仓库、本文档或
联调反馈。创建订单和获取支付参数必须使用小程序微信登录态 JWT；
OpenID 完全由后端从已验证 JWT 读取，小程序不传 `payer_openid`。

## 2. 范围和不可变规则

批次 B 只增加年度品牌权益商品、购买订单、微信支付和自动开通。

- 购买周期固定为自然年 1 年，字段为 `term_years=1`。
- 首购从支付成功时间生效。
- 有效权益续费从当前 `expires_at` 顺延一个自然年。
- 过期后重新购买从本次支付成功时间重新计算。
- 支付确认后自动开通或续期，不需要人工审核。
- 数字权益开通后不支持退款；本批次没有退款申请、退款状态或退款接口。
- 金额统一为整数分。
- 订单保存商品名称、金额、周期、购买说明和不退款政策快照。
- 租户 ID 只从登录态解析，租户接口不接受 `tenant_id`。
- 小程序不能根据 `wx.requestPayment` 成功回调判定权益已开通，必须继续
  查询后端订单和 `/tenant/branding` 权益状态。
- 批次 A 的 `/branding/effective`、草稿、发布和平台回退语义不变。
- 现有积分充值订单、积分流水和退款语义不变。

## 3. 通用约定

### 3.1 鉴权与权限

| 接口类型 | 身份与权限 |
| --- | --- |
| 平台商品读写 | 平台管理员 + `platform.branding_product.manage` |
| 平台订单读/审计 | 平台管理员 + `platform.branding_order.read` |
| 租户查询订单 | 当前租户员工 + `brand.entitlement_order.read` |
| 租户查询商品、创建订单、获取支付参数 | 当前租户 `system_admin` + `brand.entitlement.purchase` |

创建订单和获取支付参数还要求 JWT 来自微信小程序登录通道，并且包含
经过后端验证的 OpenID。OpenID 只用于绑定付款人，不是租户选择器。

### 3.2 响应外层

成功：

```json
{
  "data": {},
  "message": "success"
}
```

错误：

```json
{
  "success": false,
  "message": "年度品牌权益订单不存在",
  "code": "BRANDING_ADDON_ORDER_NOT_FOUND",
  "requestId": "req-uuid"
}
```

客户端按 HTTP 状态和稳定 `code` 分支，不解析中文 `message`。

### 3.3 分页

租户订单列表和平台订单列表均使用：

```text
page=1&pageSize=20
```

- 默认 `page=1`、`pageSize=20`。
- `pageSize` 最大 100。
- 响应使用 `pagination.page/pageSize/total/totalPages`。
- 租户列表不接受 `tenant_id`。

### 3.4 时间与两个 `expires_at`

- 订单对象顶层 `expires_at` 是支付截止时间，创建后约 5 分钟。
- 订单内 `entitlement.expires_at` 是已开通权益到期时间。
- 所有时间均为 RFC 3339 字符串。
- 倒计时使用响应的 `server_time` 校准，不能用手机本地时间重新计算
  5 分钟。

## 4. 九个批次 B API

### 4.1 `GET /platform/branding/entitlement-product`

读取平台商品配置。鉴权见 3.1；query 必须为空。

```json
{
  "data": {
    "product": {
      "code": "custom_support_branding_annual",
      "entitlement_code": "custom_support_branding",
      "name": "年度品牌技术支持",
      "amount_fen": 1,
      "term_years": 1,
      "purchase_notes": "支付成功后自动开通或续期一年",
      "enabled": true,
      "version": 2
    }
  },
  "message": "success"
}
```

商品首次初始化可以是 `amount_fen=null`、`enabled=false`；启用前必须
配置正整数分价格。

### 4.2 `PATCH /platform/branding/entitlement-product`

部分更新商品配置，使用乐观版本。query 必须为空。

```json
{
  "name": "年度品牌技术支持",
  "amount_fen": 1,
  "purchase_notes": "支付成功后自动开通或续期一年",
  "enabled": true,
  "version": 1
}
```

- `version` 必填且大于 0。
- `name/amount_fen/purchase_notes/enabled` 至少提交一项。
- `amount_fen` 为 `1..2147483647` 的整数。
- `name` 最长 100 字符；`purchase_notes` 最长 500 字符。
- 响应结构同 4.1，并返回更新后的 `version`。
- 商品更新不修改既有订单快照。

### 4.3 `GET /tenant/branding/entitlement-product`

当前租户管理员读取可购买商品。query 必须为空，不接受 `tenant_id`。

```json
{
  "data": {
    "product": {
      "code": "custom_support_branding_annual",
      "entitlement_code": "custom_support_branding",
      "name": "年度品牌技术支持",
      "amount_fen": 1,
      "term_years": 1,
      "purchase_notes": "支付成功后自动开通或续期一年",
      "refund_policy": "数字权益支付成功并开通后不支持退款",
      "purchase_action": {
        "enabled": true,
        "disabled_reason": null
      }
    },
    "server_time": "2026-07-28T08:00:00.000Z"
  },
  "message": "success"
}
```

`purchase_action`：

| 权益状态 | enabled | disabled_reason |
| --- | --- | --- |
| 无权益、active、expired | `true` | `null` |
| suspended | `false` | `ENTITLEMENT_SUSPENDED` |
| revoked | `false` | `ENTITLEMENT_REVOKED` |

商品未上架或价格未配置时返回
`404 BRANDING_ADDON_PRODUCT_NOT_FOUND`，不返回不可购买的商品对象。

### 4.4 `POST /tenant/branding/entitlement-orders`

创建订单。query 必须为空；不接受 `tenant_id` 或 `payer_openid`。

```json
{
  "product_code": "custom_support_branding_annual",
  "idempotency_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```

`idempotency_key` 必须为 UUID v4：

- 网络超时重试必须复用同一个幂等键。
- 用户重新点击“立即开通/续费”生成新幂等键。
- 同一租户、同一商品已有有效 pending 订单时，新幂等键也复用该订单，
  不新建第二笔 pending。

成功：

```json
{
  "data": {
    "idempotent": false,
    "reused_pending": false,
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "order_no": "BA202607280001",
      "product_code": "custom_support_branding_annual",
      "product_name": "年度品牌技术支持",
      "amount_fen": 1,
      "term_years": 1,
      "status": "pending",
      "paid_at": null,
      "expires_at": "2026-07-28T08:05:00.000Z",
      "entitlement": null,
      "payment_action": {
        "enabled": true,
        "disabled_reason": null
      },
      "created_at": "2026-07-28T08:00:00.000Z",
      "updated_at": "2026-07-28T08:00:00.000Z"
    },
    "payment_request": {
      "timeStamp": "1785225600",
      "nonceStr": "wechat-nonce",
      "package": "prepay_id=wx-prepay-id",
      "signType": "RSA",
      "paySign": "wechat-signature"
    },
    "server_time": "2026-07-28T08:00:00.000Z"
  },
  "message": "success"
}
```

同幂等键重放返回 `idempotent=true`；新幂等键复用已有 pending 返回
`reused_pending=true`。只要订单仍可支付，二者都可以再次返回
`payment_request`，小程序不能因为 `idempotent=true` 而阻止支付。

### 4.5 `POST /tenant/branding/entitlement-orders/:id/payment-request`

为当前租户的同一笔 pending 订单重新生成小程序支付签名。query 和 body
均严格为空；建议发送 `{}`，不传 OpenID。

响应：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "order_no": "BA202607280001",
      "status": "pending",
      "expires_at": "2026-07-28T08:05:00.000Z",
      "payment_action": {
        "enabled": true,
        "disabled_reason": null
      }
    },
    "payment_request": {
      "timeStamp": "1785225600",
      "nonceStr": "wechat-nonce",
      "package": "prepay_id=wx-prepay-id",
      "signType": "RSA",
      "paySign": "wechat-signature"
    },
    "server_time": "2026-07-28T08:01:00.000Z"
  },
  "message": "success"
}
```

支付签名仅用于本次 `wx.requestPayment`，不得持久化或记录日志。

### 4.6 `GET /tenant/branding/entitlement-orders`

当前租户购买记录：

```text
GET /tenant/branding/entitlement-orders?page=1&pageSize=20&status=pending&keyword=BA202607
```

`status` 可选值：`pending/paid/closed/failed`。`keyword` 当前匹配订单号，
最长 120 字符。响应：

```json
{
  "data": {
    "list": [
      {
        "id": "10000000-0000-4000-8000-000000000001",
        "order_no": "BA202607280001",
        "product_code": "custom_support_branding_annual",
        "product_name": "年度品牌技术支持",
        "amount_fen": 1,
        "term_years": 1,
        "status": "paid",
        "paid_at": "2026-07-28T08:02:00.000Z",
        "expires_at": "2026-07-28T08:05:00.000Z",
        "entitlement": {
          "starts_at": "2026-07-28T08:02:00.000Z",
          "expires_at": "2027-07-28T08:02:00.000Z",
          "status": "active",
          "source": "purchase",
          "order_no": "BA202607280001"
        },
        "payment_action": {
          "enabled": false,
          "disabled_reason": "ORDER_ALREADY_PAID"
        },
        "created_at": "2026-07-28T08:00:00.000Z",
        "updated_at": "2026-07-28T08:02:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    },
    "server_time": "2026-07-28T08:02:01.000Z"
  },
  "message": "success"
}
```

`entitlement` 只在当前权益确实由该订单开通/续期时返回；人工授予或后续
订单已成为当前来源时可以为 `null`。客户端不要把 `entitlement=null`
解释为支付失败，先看订单 `status`，再刷新 `/tenant/branding`。

### 4.7 `GET /tenant/branding/entitlement-orders/:id`

当前租户订单详情。query 必须为空。除列表字段外，订单还返回：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "order_no": "BA202607280001",
      "product_code": "custom_support_branding_annual",
      "product_name": "年度品牌技术支持",
      "amount_fen": 1,
      "term_years": 1,
      "purchase_notes": "支付成功后自动开通或续期一年",
      "refund_policy": "数字权益支付成功并开通后不支持退款",
      "status": "paid",
      "paid_amount_fen": 1,
      "paid_at": "2026-07-28T08:02:00.000Z",
      "expires_at": "2026-07-28T08:05:00.000Z",
      "entitlement": {
        "starts_at": "2026-07-28T08:02:00.000Z",
        "expires_at": "2027-07-28T08:02:00.000Z",
        "status": "active",
        "source": "purchase",
        "order_no": "BA202607280001"
      },
      "payment_action": {
        "enabled": false,
        "disabled_reason": "ORDER_ALREADY_PAID"
      },
      "created_at": "2026-07-28T08:00:00.000Z",
      "updated_at": "2026-07-28T08:02:00.000Z"
    },
    "server_time": "2026-07-28T08:02:01.000Z"
  },
  "message": "success"
}
```

跨租户读取与不存在订单统一返回
`404 BRANDING_ADDON_ORDER_NOT_FOUND`。

### 4.8 `GET /platform/branding/entitlement-orders`

平台订单列表，支持：

```text
page
pageSize
tenant_id
status=pending|paid|closed|failed
keyword
created_from
created_to
```

`created_from/created_to` 为 RFC 3339，开始时间不能晚于结束时间。
响应列表包含租户摘要、支付截止时间、支付时间、关单时间和失败码：

```json
{
  "data": {
    "list": [
      {
        "id": "10000000-0000-4000-8000-000000000001",
        "tenant_id": "20000000-0000-4000-8000-000000000001",
        "order_no": "BA202607280001",
        "product_code": "custom_support_branding_annual",
        "product_name": "年度品牌技术支持",
        "amount_fen": 1,
        "term_years": 1,
        "status": "paid",
        "payment_expires_at": "2026-07-28T08:05:00.000Z",
        "paid_at": "2026-07-28T08:02:00.000Z",
        "closed_at": null,
        "failure_code": null,
        "created_at": "2026-07-28T08:00:00.000Z",
        "updated_at": "2026-07-28T08:02:00.000Z",
        "tenant": {
          "id": "20000000-0000-4000-8000-000000000001",
          "name": "联调租户",
          "slug": "branding-smoke"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

### 4.9 `GET /platform/branding/entitlement-orders/:id`

平台订单审计详情。query 必须为空。响应不包含付款人 OpenID、prepay ID、
支付配置密钥或通知原文：

```json
{
  "data": {
    "order": {
      "id": "10000000-0000-4000-8000-000000000001",
      "tenant_id": "20000000-0000-4000-8000-000000000001",
      "order_no": "BA202607280001",
      "out_trade_no": "BA202607280001",
      "product_code": "custom_support_branding_annual",
      "entitlement_code": "custom_support_branding",
      "product_name": "年度品牌技术支持",
      "amount_fen": 1,
      "term_years": 1,
      "purchase_notes": "支付成功后自动开通或续期一年",
      "refund_policy": "数字权益支付成功并开通后不支持退款",
      "status": "paid",
      "channel": "wechat_pay",
      "payment_expires_at": "2026-07-28T08:05:00.000Z",
      "transaction_id": "wechat-transaction-id",
      "paid_amount_fen": 1,
      "paid_at": "2026-07-28T08:02:00.000Z",
      "closed_at": null,
      "failure_code": null,
      "failure_message": null,
      "entitlement_event_id": "30000000-0000-4000-8000-000000000001",
      "created_by": "40000000-0000-4000-8000-000000000001",
      "created_at": "2026-07-28T08:00:00.000Z",
      "updated_at": "2026-07-28T08:02:00.000Z",
      "tenant": {
        "id": "20000000-0000-4000-8000-000000000001",
        "name": "联调租户",
        "slug": "branding-smoke"
      }
    },
    "entitlement": {
      "starts_at": "2026-07-28T08:02:00.000Z",
      "expires_at": "2027-07-28T08:02:00.000Z",
      "status": "active",
      "source": "purchase",
      "order_no": "BA202607280001"
    },
    "entitlement_event": {
      "id": "30000000-0000-4000-8000-000000000001",
      "event_type": "granted",
      "source_type": "purchase",
      "source_id": "10000000-0000-4000-8000-000000000001",
      "reason": "Annual branding add-on purchase confirmed",
      "created_at": "2026-07-28T08:02:00.000Z"
    },
    "audit": {
      "id": "50000000-0000-4000-8000-000000000001",
      "action": "branding_addon_purchase.confirm",
      "status": "success",
      "summary": "Annual branding add-on purchase confirmed",
      "created_at": "2026-07-28T08:02:00.000Z"
    }
  },
  "message": "success"
}
```

## 5. 小程序状态映射

### 5.1 `payment_action`

客户端只读取 `payment_action.disabled_reason`，不存在 `code` 字段。

| 订单/权益状态 | enabled | disabled_reason | 小程序行为 |
| --- | --- | --- | --- |
| pending、未过期 | `true` | `null` | 展示“继续支付” |
| pending、到达服务端截止时间 | `false` | `ORDER_PAYMENT_EXPIRED` | 立即禁用，轮询订单 |
| paid | `false` | `ORDER_ALREADY_PAID` | 展示已开通/续费，刷新权益 |
| closed | `false` | `ORDER_CLOSED` | 展示已关闭，允许重新购买 |
| failed | `false` | `ORDER_FAILED` | 展示失败，允许重新购买 |
| pending + suspended | `false` | `ENTITLEMENT_SUSPENDED` | 隐藏支付，提示联系平台 |
| pending + revoked | `false` | `ENTITLEMENT_REVOKED` | 隐藏支付，提示联系平台 |

倒计时归零只是客户端停止发起支付的信号，不代表数据库已经变为
`closed`；继续轮询，最终以后端 `status` 为准。

### 5.2 订单恢复和支付确认

推荐流程：

1. 进入品牌设置页，先请求 `/tenant/branding` 和商品接口。
2. 查询订单列表，恢复尚未结束的 pending 订单。
3. 创建订单时防重复点击；网络超时复用原幂等键。
4. 使用后端 `server_time` 与订单 `expires_at` 显示倒计时。
5. 调用 `wx.requestPayment(payment_request)`。
6. 用户取消时保留 pending，允许在截止前继续支付。
7. `wx.requestPayment` 成功、失败或小程序被关闭，都重新查询订单详情。
8. 只有后端订单为 `paid` 后才刷新 `/tenant/branding`；权益
   `starts_at/expires_at/status/source/order_no` 以后端为准。
9. 查询暂时失败时保留“确认中”，按退避策略重试，不能显示已开通。

## 6. 稳定错误码

| HTTP | code | 客户端处理 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 修正请求字段；不要传 `tenant_id`/OpenID |
| 401 | `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` | 重新登录 |
| 403 | `FORBIDDEN` | 无对应读写权限 |
| 403 | `BRANDING_ENTITLEMENT_PURCHASE_FORBIDDEN` | 仅当前租户管理员可购买 |
| 403 | `BRANDING_ADDON_WECHAT_LOGIN_REQUIRED` | 切换为小程序微信登录态 |
| 404 | `BRANDING_ADDON_PRODUCT_NOT_FOUND` | 商品未配置、未上架或无有效价格 |
| 404 | `BRANDING_ADDON_ORDER_NOT_FOUND` | 订单不存在或不属于当前租户 |
| 409 | `BRANDING_ADDON_PRODUCT_PRICE_REQUIRED` | 平台启用商品前先配置价格 |
| 409 | `BRANDING_ADDON_PRODUCT_VERSION_CONFLICT` | 平台刷新商品后重试 |
| 409 | `BRANDING_ENTITLEMENT_SUSPENDED` | 暂停期间不可购买或支付 |
| 409 | `BRANDING_ENTITLEMENT_REVOKED` | 撤销期间不可购买或支付 |
| 409 | `BRANDING_ADDON_ORDER_PAYER_MISMATCH` | 当前微信身份与原订单付款人不同 |
| 409 | `BRANDING_ADDON_ORDER_NOT_PENDING` | 刷新订单，不再拉起支付 |
| 409 | `BRANDING_ADDON_ORDER_EXPIRED` | 刷新并等待收敛为 closed |
| 409 | `BRANDING_ADDON_PAYMENT_REQUEST_UNAVAILABLE` | 刷新订单后再决定是否重建 |
| 409 | `BRANDING_ADDON_PAYMENT_CONFIG_INVALID` | dev 支付配置未就绪，反馈后端 |
| 409 | `BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED` | 旧单不可继续，刷新后重新购买 |
| 500 | `DB_ERROR` / `INTERNAL_ERROR` | 保留 requestId，稍后重试并反馈 |

创建并发冲突由后端恢复为同一幂等订单或同一 pending 订单；客户端正常
情况下不需要处理数据库内部的唯一约束码。

## 7. Smoke 使用

脚本：

```bash
cd apps/api
API_BASE_URL=https://api-dev.goodcms.cn \
BRANDING_ADDON_SMOKE_ADMIN_TOKEN='<wechat-tenant-admin-token>' \
BRANDING_ADDON_SMOKE_ISOLATION_TOKEN='<other-tenant-admin-token>' \
BRANDING_ADDON_SMOKE_PLATFORM_TOKEN='<optional-platform-token>' \
bun run branding:addon:batch-b-smoke
```

`API_BASE_URL` 是 smoke 的主变量。仅为兼容既有脚本环境，主变量缺失时
允许读取 `GOOES_API_BASE_URL`；若两者同时存在，规范化后的地址必须完全
一致，否则脚本在发送请求前失败。package 命令通过
`bun --env-file=/dev/null` 禁止 Bun 默认向当前目录或父目录发现 `.env`。
调用方必须显式 `export` 目标地址和本次临时 token，避免误连其他环境。

前置条件：

- 商品已启用且为正整数分价格。
- 两个 token 必须属于不同租户的管理员，并有购买/订单读取权限。
- 创建订单的 token 必须是带后端已验证 OpenID 的小程序微信登录态。
- 第二个 token 应使用无权益隔离租户；两个 token 不能相同。

脚本验证平台/租户商品、批次 A effective、创建订单、同幂等键重放、
新幂等键复用 pending、分页、详情、跨租户 404、支付参数和可选的平台
订单审计。输出包含 `order_no`、HTTP、稳定错误码、`request_id` 和脱敏
响应，不输出 token、OpenID、支付签名、prepay、交易号或密钥。

脚本绝不调用微信支付回调、伪造支付通知、直接写权益，也不能从命令行
拉起小程序 `wx.requestPayment`。传入 `--real-pay` 只把输出模式标记为
`manual_real_pay_ready`，真实支付仍由小程序开发构建人工完成：

```bash
bun run branding:addon:batch-b-smoke -- --real-pay
```

## 8. Dev 证据（待 Task 12 回填）

| 检查 | 结果 |
| --- | --- |
| Migration Local/Remote 对齐 | 待回填 |
| API commit 与部署 | 待回填 |
| 单元测试 / 类型检查 / build / file-size | 待回填 |
| 有权益管理员商品与订单 | 待回填 |
| 无权益租户隔离 404 | 待回填 |
| 幂等重放 / pending 复用 | 待回填 |
| 5 分钟超时关单 | 待回填 |
| 真实支付首购或续费 | 待回填 |
| 重复回调权益只延长一次 | 待回填 |
| 平台订单和权益来源审计 | 待回填 |
| 批次 A effective 回归 | 待回填 |

真实支付验收反馈只回传订单号、接口、HTTP、错误码、`requestId` 和脱敏
响应，不回传 token、OpenID、支付签名或微信密钥。

## 9. Orange 接入位置（只读核对）

后端本轮未修改 orange。小程序团队可在现有位置扩展：

- `src/services/branding.ts`：增加商品、创建订单、支付参数、列表和详情
  service；所有租户请求都不传 `tenant_id` 或 OpenID。
- `src/types/api/branding.d.ts`：增加商品、订单、分页、
  `purchase_action/payment_action` 类型。
- `src/packageEmployees/pages/brandingSettings/`：增加立即开通/续费、
  pending 恢复、服务端倒计时和订单结果刷新。
- 复用现有充值支付的服务端时钟校准、继续支付、防重复点击和支付后查单
  思路，但不得复用积分充值订单、积分流水或退款语义。

批次 A 合法域名无需因批次 B 修改：

- request：
  `https://api-dev.goodcms.cn`、
  `https://windwill-1259348056.cos.accelerate.myqcloud.com`
- downloadFile：
  `https://windwill-1259348056.cos.ap-nanjing.myqcloud.com`

批次 B 新接口全部使用现有 API 域名，不增加上传或下载域名。
