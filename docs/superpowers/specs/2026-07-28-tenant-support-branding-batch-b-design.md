# 租户自定义品牌技术支持后端批次 B 设计

## 1. 目标

在不改变批次 A 品牌解析、草稿、发布和平台回退语义的前提下，
提供年度品牌权益商品、微信支付购买订单、自动开通与续期、超时
关单、租户购买记录和平台审计能力。

批次 B 必须满足：

- 品牌资料、商品、订单、权益和权益事件继续独立建模。
- 租户接口只信任登录态中的 `tenant_id`。
- 仅拥有租户品牌设置管理权限的当前租户管理员可以购买。
- 商品和订单金额统一使用整数分。
- 支付成功只按服务端验签回调或主动查单结果确认。
- 一笔订单最多开通或延长权益一次。
- 数字权益开通后不提供普通退款入口、状态或接口。
- 不修改积分充值订单、积分账户和积分流水语义。

## 2. 方案选择

### 2.1 采用的方案

新增独立的增值商品和订单模型，复用微信支付基础设施：

- 新增 `platform_addon_products`。
- 新增 `tenant_addon_orders`。
- 新增 `tenant_addon_wechat_notifications`。
- 复用平台微信支付配置、密钥加载、APIv3 请求签名、JSAPI/小程序
  下单、支付参数签名、回调验签解密、查单和关单网关。
- 新增品牌权益订单 service、repository 和原子支付确认 RPC。

### 2.2 未采用的方案

不新建通用订阅/商城内核。本批次只有一个固定年度商品，提前引入
购物车、优惠、库存、账单或订阅计划会扩大范围。

不扩展 `tenant_credit_orders`。积分充值包含积分、奖励积分、积分
流水和退款语义，不能承载年度品牌权益订单。

## 3. 固定业务规则

### 3.1 商品

首个商品固定为：

```text
product_code = custom_support_branding_annual
entitlement_code = custom_support_branding
term_years = 1
```

平台超管可以修改：

- `name`
- `amount_fen`
- `purchase_notes`
- `enabled`

商品编码、权益编码和周期不可通过配置接口修改。初始化商品保持
`enabled=false` 且 `amount_fen=NULL`，禁止在 migration 中猜测价格；
平台配置正整数分价格后才能启用。商品关闭时允许价格继续未配置。
商品下架后不允许新建订单；既有订单和订单快照不受商品后续修改
影响。

### 3.2 订单有效期与重复提交

- 支付窗口固定为 5 分钟。
- `payment_expires_at` 由服务端生成，并作为微信下单
  `time_expire`。
- 同一租户和商品同时最多存在一笔 `pending` 订单。
- `idempotency_key` 为 UUID v4，在租户内唯一。
- 同幂等键重放返回原订单；订单仍可支付时返回新的本地
  `payment_request` 签名。
- 使用新幂等键重复点击时，如果已有可支付 `pending` 订单，返回
  该订单并标记 `reused_pending=true`，不创建第二笔订单。
- 已关闭订单不能重新支付，客户端需使用新幂等键重新下单。

### 3.3 权益时间

数据库以微信支付 `success_time` 作为 `paid_at`：

- 不存在、已过期：`starts_at = paid_at`，
  `expires_at = paid_at + make_interval(years => 1)`。
- 当前有效：保留原 `starts_at`，
  `expires_at = current expires_at + make_interval(years => 1)`。

使用 PostgreSQL 自然年运算。闰日顺延遵循 PostgreSQL
`make_interval(years => 1)` 的日历规则。

权益的 `source_type` 更新为 `purchase`，`source_id` 保存订单 ID。
响应额外通过订单关联返回稳定 `order_no`。权益事件使用：

```text
event_type = granted | renewed
source_type = purchase
source_id = tenant_addon_orders.id
```

### 3.4 暂停、恢复和撤销

平台风控状态优先于购买：

- `suspended`：禁止新建购买订单；恢复不延长原到期时间。
- `revoked`：禁止新建购买订单；必须由平台重新授予后才能购买。
- 平台暂停或撤销时，关闭该租户尚未支付的品牌权益订单。
- 极端竞态中已完成付款但回调晚于暂停或撤销时，订单仍记录真实
  `paid` 状态和支付审计，权益期限只应用一次，但不把状态改回
  `active`。平台限制仍生效。
- 购买不能充当 `resume` 或重新授予操作。

## 4. 数据模型

### 4.1 `platform_addon_products`

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `code` | text | 商品编码，唯一 |
| `entitlement_code` | text | 权益编码 |
| `name` | text | 商品名称 |
| `amount_fen` | integer nullable | 关闭状态允许未配置；启用时必须为正整数分 |
| `term_years` | integer | 本商品固定 1 |
| `purchase_notes` | text | 购买说明 |
| `refund_policy` | text | 固定“不支持退款”政策 |
| `enabled` | boolean | 上下架 |
| `version` | integer | 配置乐观锁 |
| `updated_by_employee_id` | uuid nullable | 最近操作人 |
| `created_at` / `updated_at` | timestamptz | 时间 |

初始化 migration 创建一条 `enabled=false`、`amount_fen=NULL` 的
正式商品。dev 部署后通过平台配置接口将测试价格调整为 1 分并启用，
避免 migration 猜测价格或将测试价格带入其他环境。

### 4.2 `tenant_addon_orders`

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `tenant_id` | uuid | 租户隔离键 |
| `order_no` | text | 稳定业务订单号 |
| `out_trade_no` | text | 微信商户订单号 |
| `idempotency_key` | uuid | 租户内幂等键 |
| `product_id` | uuid | 商品 |
| `product_code` | text | 商品编码快照 |
| `entitlement_code` | text | 权益编码快照 |
| `product_name` | text | 商品名称快照 |
| `amount_fen` | integer | 金额快照 |
| `term_years` | integer | 周期快照 |
| `purchase_notes` | text | 购买说明快照 |
| `refund_policy` | text | 不支持退款政策快照 |
| `status` | text | `pending/paid/closed/failed` |
| `channel` | text | 固定 `wechat_pay` |
| `payer_openid` | text | 当前 appid 下 OpenID |
| `payment_config_id` | uuid | 支付配置版本绑定 |
| `prepay_id` | text nullable | 微信预支付 ID |
| `payment_expires_at` | timestamptz | 支付截止时间 |
| `transaction_id` | text nullable | 微信支付订单号 |
| `paid_amount_fen` | integer nullable | 实付总额 |
| `paid_at` | timestamptz nullable | 微信支付完成时间 |
| `closed_at` | timestamptz nullable | 关单时间 |
| `failure_code/message` | text nullable | 稳定失败摘要 |
| `entitlement_event_id` | uuid nullable | 本订单唯一权益事件 |
| `created_by` | uuid | 租户管理员员工 ID |
| `metadata` | jsonb | 受控诊断信息 |
| `created_at` / `updated_at` | timestamptz | 时间 |

关键约束：

- `UNIQUE (tenant_id, idempotency_key)`
- `UNIQUE (order_no)`
- `UNIQUE (out_trade_no)`
- `UNIQUE (transaction_id)`，允许空
- `UNIQUE (entitlement_event_id)`，允许空
- 部分唯一索引：
  `(tenant_id, product_code) WHERE status = 'pending'`
- 状态和支付字段一致性约束。

### 4.3 `tenant_addon_wechat_notifications`

保存通知 ID、订单、租户、事件类型、原始加密通知、验签结果、
处理状态、失败摘要和处理时间。

`notify_id` 唯一。重复通知直接返回成功；未完成处理的通知可以重试
同一个原子确认命令。

### 4.4 权益事件幂等

在 `tenant_entitlement_events` 增加部分唯一索引：

```text
UNIQUE (source_type, source_id)
WHERE source_type = 'purchase' AND source_id IS NOT NULL
```

该约束与订单行锁共同保证同一订单不会重复延长。

## 5. 原子支付确认

新增 service-role-only RPC：

```text
branding_confirm_addon_purchase
```

一次事务完成：

1. 锁定订单。
2. 校验商品/权益编码、订单金额、商户号、appid、支付状态和
   `transaction_id`。
3. 若订单已经由相同交易确认，返回 `idempotent=true`。
4. 将订单更新为 `paid`。
5. 锁定或创建 `tenant_entitlements`。
6. 按首次、过期或有效续费规则计算自然年期限。
7. 追加唯一 `tenant_entitlement_events`。
8. 追加 `platform_audit_logs`。
9. 回写 `entitlement_event_id` 并返回订单和权益。

金额、商户号、appid、`out_trade_no` 或交易号冲突时整个事务回滚。
repository 将 RPC 错误映射为稳定业务错误，不能透出 SQL。

## 6. 微信支付链路

项目使用境内普通商户 APIv3 小程序支付：

1. 创建订单前验证平台支付配置和密钥版本。
2. 插入订单后重新读取绑定的配置版本。
3. 调用 JSAPI/小程序下单，传整数分、OpenID、真实商品描述、
   `notify_url` 和 5 分钟 `time_expire`。
4. 保存 `prepay_id`，由服务端生成小程序 `payment_request`。
5. 统一回调入口验签、解密后按 `out_trade_no` 匹配增值订单。
6. 只有 `TRANSACTION.SUCCESS` 且金额、商户号、appid 均匹配时进入
   原子确认。
7. 回调缺失时，订单查询和后台任务主动查微信订单。
8. 到期订单先查单；SUCCESS 确认支付，NOTPAY 调微信关单后关闭，
   CLOSED 同步本地关闭，未知状态保持可重试。

小程序 `requestPayment`：

- cancel：保持 `pending`。
- success/fail：立即查询后端订单。
- 查询仍为 `pending`：有限轮询，最终回到购买记录继续恢复。
- 只在后端返回 `paid` 且权益已刷新后展示开通成功。

## 7. API 契约

### 7.1 平台商品

```text
GET   /platform/branding/entitlement-product
PATCH /platform/branding/entitlement-product
```

PATCH 请求：

```json
{
  "name": "年度品牌技术支持",
  "amount_fen": 1,
  "purchase_notes": "支付成功后自动开通一年",
  "enabled": true,
  "version": 1
}
```

### 7.2 租户商品与订单

```text
GET  /tenant/branding/entitlement-product
POST /tenant/branding/entitlement-orders
POST /tenant/branding/entitlement-orders/:id/payment-request
GET  /tenant/branding/entitlement-orders
GET  /tenant/branding/entitlement-orders/:id
```

创建请求：

```json
{
  "product_code": "custom_support_branding_annual",
  "payer_openid": "openid",
  "idempotency_key": "UUID v4"
}
```

创建响应包含：

```json
{
  "idempotent": false,
  "reused_pending": false,
  "server_time": "2026-07-28T00:00:00.000Z",
  "order": {
    "id": "uuid",
    "order_no": "BA...",
    "status": "pending",
    "amount_fen": 1,
    "term_years": 1,
    "paid_at": null,
    "expires_at": "2026-07-28T00:05:00.000Z"
  },
  "payment_request": {
    "timeStamp": "string",
    "nonceStr": "string",
    "package": "prepay_id=...",
    "signType": "RSA",
    "paySign": "string"
  }
}
```

列表默认 `page=1&pageSize=20`，`pageSize<=100`，支持 `status` 和
`keyword`。详情和列表都只返回当前登录租户的订单。

商品响应提供 `purchase_action`：

```json
{
  "enabled": false,
  "disabled_reason": "ENTITLEMENT_SUSPENDED"
}
```

小程序只读取 `disabled_reason`，不读取 `code`。

### 7.3 平台订单和审计

```text
GET /platform/branding/entitlement-orders
GET /platform/branding/entitlement-orders/:id
```

列表分页并支持租户、状态、订单号和时间筛选。详情包含订单快照、
支付摘要、关联权益、权益事件和平台审计摘要，不返回密钥、完整通知
密文或 OpenID。

## 8. 权限

新增：

| 权限 | 默认角色 |
| --- | --- |
| `platform.branding_product.manage` | `platform_admin` |
| `platform.branding_order.read` | `platform_admin` |
| `brand.entitlement.purchase` | 租户 `system_admin` |
| `brand.entitlement_order.read` | 租户 `system_admin` |

接口同时要求有效员工身份、当前租户上下文和对应权限。客户端不能
传 `tenant_id`。

## 9. 稳定错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 404 | `BRANDING_ADDON_PRODUCT_NOT_FOUND` | 商品不存在或未上架 |
| 409 | `BRANDING_ADDON_PRODUCT_VERSION_CONFLICT` | 商品配置版本冲突 |
| 409 | `BRANDING_ADDON_PRODUCT_PRICE_REQUIRED` | 启用前尚未配置正整数分价格 |
| 403 | `BRANDING_ENTITLEMENT_PURCHASE_FORBIDDEN` | 非当前租户管理员 |
| 409 | `BRANDING_ENTITLEMENT_SUSPENDED` | 权益暂停，不能购买 |
| 409 | `BRANDING_ENTITLEMENT_REVOKED` | 权益撤销，不能购买 |
| 404 | `BRANDING_ADDON_ORDER_NOT_FOUND` | 当前租户订单不存在 |
| 409 | `BRANDING_ADDON_ORDER_NOT_PENDING` | 订单不可继续支付 |
| 409 | `BRANDING_ADDON_ORDER_EXPIRED` | 支付窗口已过 |
| 409 | `BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED` | 支付配置并发变更 |
| 409 | `BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH` | 回调金额不一致 |
| 409 | `BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH` | 商户或 appid 不一致 |
| 409 | `BRANDING_ADDON_TRANSACTION_CONFLICT` | 微信交易号冲突 |

微信上游错误继续由现有错误包装保留稳定 HTTP/code，并仅透出允许的
上游诊断字段和 `request_id`。

## 10. 测试与验证

自动化覆盖：

- schema、金额、分页和权限。
- 商品版本冲突和上下架。
- 同幂等键重放、新幂等键复用 pending、并发唯一约束。
- 租户 A 无法读取或支付租户 B 订单。
- 回调验签路由、通知重复、金额/商户/appid 不一致。
- 首购、有效续费、过期重购的自然年时间。
- 重复回调不重复延长。
- suspend/resume/revoke 与在途订单竞态。
- 支付取消、回调缺失、主动查单、过期关单和查询错误重试。
- 平台订单分页、权益来源和审计关联。
- 批次 A `/branding/effective`、草稿、发布和回退回归。
- 积分充值相关测试回归。

dev smoke 使用：

- 一个有权益租户管理员。
- 一个无权益租户管理员。
- 1 分启用商品。
- 创建后取消支付。
- 创建后超时关单。
- 一笔真实支付首购或续费。
- 重复投递同一支付通知并核对权益只延长一次。

## 11. Migration、部署与回滚

所有表、约束、索引、RPC、权限和初始化商品都由
`supabase/migrations/` migration 管理。

应用前后执行 `supabase migration list`，确认 Local/Remote 对齐。
部署顺序：

1. 应用 migration。
2. 部署 API。
3. 通过平台 API 配置 dev 1 分商品并启用。
4. 创建联调账号与测试订单。
5. 执行 API 和真实微信支付 smoke。

回滚时先下架商品并停止创建新单，再回滚 API。已支付订单和权益
事件属于资金审计记录，不做破坏性删除；数据库 migration 的回滚
方案是保留表和数据、撤销入口，待确认无在途订单后再通过新的
migration 删除新增 RPC、索引和表。

## 12. 交接

交接文档提供：

- API Base URL、提交号和 migration 状态。
- 全部接口、请求/响应示例和错误码。
- 支付测试账号、1 分商品配置和订单样本。
- 自动化测试、租户隔离、超时关单和真实支付 smoke 结果。
- 小程序页面的 `purchase_action`、订单状态和轮询映射。

Orange 仓库保持只读。小程序团队在后端 dev 验收通过后自行接入
“立即开通/续费”、支付确认、订单恢复和权益刷新流程。
