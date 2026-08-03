# 平台部署及年度技术服务：总体方案与小程序对接设计

日期：2026-08-03

状态：待方案评审，尚未实施

适用仓库：Gooes（后端与 Admin）；Orange 仅作为小程序对接方，只读参考

## 1. 执行结论

原“积分充值”不再作为新业务入口，也不通过改字段、改文案的方式继续承载交易。新业务独立定义为：

> 平台部署及年度技术服务

它出售的是可举证的综合服务，包括客户专属系统环境部署、服务器配置、首次操作培训、实施指导和年度运维，不赠送积分，不产生积分流水，也不作为微信虚拟支付商品。

目标交易链路为：

```text
选择年度服务套餐
→ 创建服务订单
→ 普通微信小程序支付
→ 创建实施工单
→ 服务器配置
→ 系统部署
→ 培训完成
→ 客户验收
→ 上报微信无实体物流履约（审核适用后）
→ 年度运维中
```

本方案同时保留两条既有支付边界：

1. 平台独立普通微信支付商户能力继续承接本服务、后续平台自营实物商城及其他符合普通支付规则的交易。
2. 微信虚拟支付与虚拟商品目录完整保留，只承接真正的虚拟商品，例如积分、次数包、AI 额度和纯数字功能。

任何前端都不得根据 iOS、Android 或 HarmonyOS 自行切换价格、商户号或支付通道。商品类型、金额、支付路由和履约方式均由后端按服务商品快照决定。

## 2. 已确认的业务规则

### 2.1 套餐与价格

| 套餐 | 原价算法 | 折扣 | 用户售价 | 后端金额 |
| --- | ---: | ---: | ---: | ---: |
| 1 年 | ¥9,800 × 1 | 无 | ¥9,800 | `980000` 分 |
| 2 年 | ¥9,800 × 2 | 8 折 | ¥15,680 | `1568000` 分 |
| 3 年 | ¥9,800 × 3 | 7 折 | ¥20,580 | `2058000` 分 |

规则：

- 金额全部由后端商品表读取并在订单中做不可变快照，小程序只传 `product_code`。
- 不赠送积分，不增加可用额度，不写 `tenant_credit_accounts` 或 `tenant_credit_ledger`。
- 当前不具备自动续费申请条件，因此只做一次性购买的 1/2/3 年服务，不使用“订阅自动续费”表述。
- 续费订单完成验收后：已有有效服务期时从当前 `service_end_at` 顺延；服务已过期时从本次 `accepted_at` 起算。
- 首购服务期从本次 `accepted_at` 起算。客户提出异议时不开始服务期，也不上报微信履约。

### 2.2 服务范围

商品详情和订单快照至少明确：

- 客户专属系统环境部署；
- 服务器基础配置与安全基线配置；
- 首次操作培训及实施指导；
- 约定期限内的年度运维与技术支持；
- 交付边界、客户配合事项、响应时间和不包含事项；
- 验收标准、退款规则和服务期限起算规则。

禁止在商品标题、支付描述或订单详情中使用“积分充值”“会员充值”“购买权益”等与真实交易不一致的表述。

### 2.3 退款规则

- 未支付订单可以由系统到期关闭。
- 已支付且实施工单尚未开始，可申请全额退款，由后端按普通支付退款流程处理。
- 实施工单开始后，客户仍可提交退款申请；平台根据合同、已完成里程碑和未履行部分人工审核退款金额，并保留计算依据。
- 已验收或已上报微信履约的订单不提供前端“一键自动退款”，但仍保留人工售后、争议和法定退款入口。
- 退款成功后再调整服务期；不得先撤销服务期再等待渠道退款。

## 3. 当前系统事实与差距

### 3.1 可以复用的能力

Gooes 当前已经具备：

- 普通微信小程序支付预下单、`wx.requestPayment` 参数生成、支付回调验签、查单与退款基础能力；
- 统一回调 `POST /pay/wechat/callback`，并按订单上下文识别积分充值、品牌增值服务和项目收款；
- 积分充值订单的幂等键、待支付订单、支付倒计时、回调幂等和失败补偿模式；
- COS 直传 `POST /uploads/cos/direct-init`、`PUT upload_url`、`POST /uploads/cos/direct-complete`，完成后返回 `file_id`；
- 文件归属、场景、状态和访问权限校验；
- 工序验收中的提交、驳回、整改、再次确认和操作审计模式；
- Admin 的平台支付配置和独立普通商户配置。

Orange 当前可复用：

- `src/utils/wechat_payment.ts` 的微信支付调用封装；
- `src/utils/image_upload.ts` 的 COS 直传实现；
- `src/utils/idempotency.ts` 的 UUID 幂等键；
- `src/packageEmployees/pages/creditRecharge` 和 `rechargeRecords` 中的支付轮询、服务器时间校准和异常反馈模式；
- `src/packageCustomerPortal/pages/customer-project-acceptance` 的验收/驳回交互模式，但不能复用其“业主身份”和项目验收接口。

### 3.2 不能直接复用或改名的部分

现有 `platform_credit_recharge_products`、`tenant_credit_orders`、积分账户和积分流水表达的是“以付款换积分”。直接改表名或改页面文案会导致：

- 历史订单语义被污染；
- 支付回调继续错误入账积分；
- 退款、财务和审计无法区分旧积分与新服务；
- 微信商品描述、实际履约证据和数据库事实不一致。

因此旧积分订单与商品只能进入兼容期：停止新入口、保留历史查询和退款，不做破坏性迁移，不批量改写历史数据。

### 3.3 当前缺口

- 尚无平台年度服务商品、服务订单和服务合同期模型；
- 尚无实施工单、里程碑、培训记录、交付附件和客户服务验收模型；
- 尚未接入微信 `upload_shipping_info` 发货信息上报和后续状态对账；
- 现有直传白名单主要面向图片，服务交付附件需要增加私有 PDF/图片场景；
- Orange 仍使用“积分充值”服务、类型与页面，尚无服务订单详情和验收入口。

截至 2026-08-03，开发小程序检查结果为 `is_trade_managed=true`、`completed=true`：已纳入发货信息管理，且关联商户已完成订单管理授权确认。但这只说明能力生效，不代表当前后端已经上报服务订单。

## 4. 领域边界与职责

| 主体 | 负责内容 | 明确禁止 |
| --- | --- | --- |
| 平台超管 | 服务商品、服务订单、实施人员、工单、里程碑、培训、交付附件、退款审核、微信履约异常处理 | 在支付配置页维护服务商品 |
| 平台实施/技术人员 | 记录服务器配置摘要、部署结果、培训和交付材料 | 上传密码、私钥、API 密钥等敏感配置 |
| 租户管理员/授权员工 | 购买、支付、提交配合材料、查看进度、确认培训、验收或驳回 | 修改金额、服务年限、支付路由、微信履约载荷 |
| Gooes 后端 | 价格快照、权限、幂等、状态机、支付回调、文件归属、验收凭证、微信履约上报与对账 | 接受前端直接传金额或把前端成功当支付成功 |
| Orange 小程序 | 展示后端状态、拉起支付、上传文件、采集客户动作 | 直接调用微信服务端接口或自行判定已结算 |

这里的“客户验收”主体是购买平台服务的租户企业，不是装修项目中的业主。小程序页面应放在 `packageEmployees`，由租户管理员或被授权员工操作；不得复用 `packageCustomerPortal` 的 homeowner/customer 鉴权。

## 5. 状态模型

### 5.1 分离三类状态

订单必须分别保存并返回以下状态，禁止用一个 `status` 同时表达付款、实施和微信结算：

```text
payment_status:
pending | paid | refund_reviewing | refunding | partially_refunded | refunded | closed

service_status:
waiting_payment | waiting_assignment | configuring | deploying | training
| awaiting_acceptance | rectifying | accepted | active | canceled

wechat_fulfillment_status:
not_applicable | waiting_acceptance | pending | submitting
| succeeded | failed | reconciling
```

前端主要显示后端计算的 `display_stage` 和 `available_actions`，但可以用三类原始状态展示辅助信息。

### 5.2 关键状态转换

```text
pending + waiting_payment
  └─ 支付回调确认 → paid + waiting_assignment，并幂等创建实施工单

waiting_assignment
  └─ 分配实施人员 → configuring
  └─ 配置完成 → deploying
  └─ 部署完成 → training
  └─ 培训完成且交付附件齐全 → awaiting_acceptance

awaiting_acceptance
  ├─ 客户通过 → accepted → 微信履约 pending → succeeded → active
  └─ 客户驳回 → rectifying → 重新提交 awaiting_acceptance
```

规则：

- `wx.requestPayment:ok` 只表示客户端支付调用完成，订单仍需等待回调或主动查单确认。
- 客户验收动作和微信订单“确认收货”是两个不同动作。内部验收成功后由后端上报履约；微信侧资金结算仍遵循微信订单管理规则和风控结果。
- 任何异议、退款审核或支付金额不一致都阻断微信履约上报。

## 6. 目标数据模型

所有数据库变更必须通过 `supabase/migrations/` 纳入版本控制，并在开发库应用后用 `supabase migration list` 确认 Local/Remote 对齐。

### 6.1 核心表

| 表 | 作用 | 核心关系/约束 |
| --- | --- | --- |
| `platform_service_products` | 平台服务商品目录 | `code` 唯一；金额为分；1/2/3 年；支持草稿、启用、停用、归档 |
| `tenant_service_orders` | 租户购买订单 | 绑定 tenant、product、付款人；保存商品/价格/条款快照；`order_no`、`out_trade_no` 唯一 |
| `tenant_service_contracts` | 租户当前服务合同期 | 每个租户和服务族最多一个当前合同；不代表自动续费 |
| `tenant_service_contract_periods` | 每张已验收订单贡献的服务期 | 绑定 order；保存本期开始/结束，历史不可覆盖 |
| `tenant_service_work_orders` | 实施工单 | 每张服务订单一张主工单；支付确认时幂等创建 |
| `tenant_service_milestones` | 配置、部署、培训等里程碑 | 唯一 `(work_order_id, code)`；记录完成者、时间和非敏感摘要 |
| `tenant_service_training_records` | 培训记录 | 时间、方式、讲师、参训人、内容、客户确认时间 |
| `tenant_service_attachments` | 业务记录与 `platform_file_objects` 的关联 | 只存 `file_id`；区分客户材料、培训材料、交付材料、异议证据 |
| `tenant_service_acceptances` | 每轮客户验收 | 版本、结果、驳回原因、操作者、时间；禁止覆盖上一轮 |
| `tenant_service_events` | 不可变审计事件 | 状态转换、支付、文件、通知、验收、退款、上报动作 |
| `tenant_service_wechat_fulfillments` | 微信履约上报与对账 | 载荷快照、状态、重试次数、错误码、Request-ID、上报时间 |

### 6.2 关键约束与索引

- 唯一 `(tenant_id, idempotency_key)`，且幂等键非空时生效；
- 唯一 `order_no`、`out_trade_no`、非空 `transaction_id`；
- 唯一 `(order_id)` 主实施工单和 `(order_id, acceptance_version)`；
- 唯一 `(order_id, report_version)` 微信上报记录；
- 列表索引至少覆盖 `(tenant_id, created_at desc)`、`(payment_status, created_at desc)`、`(service_status, updated_at desc)`、`(wechat_fulfillment_status, next_retry_at)`；
- 金额、年限、时间范围和状态转换使用 check constraint 或受控 RPC；
- 租户 RLS 只能读取当前租户数据；平台角色通过既有平台权限访问；
- 支付确认、验收通过后生成服务期、退款后调整服务期等跨表事务通过数据库 RPC 原子完成。

商品快照可以使用 `jsonb` 保存展示标题、服务范围、条款版本和价格明细；支付状态、实施状态、金额、年限、服务期等可查询字段必须使用独立列，不能埋入 JSON。

## 7. 后端分层与模块设计

遵循现有 controller/service/repository 约束：

```text
controllers/billing-service-orders
  只做 request 读取、Zod 校验、权限上下文和 ResponseHandler.success

services/tenant-service-orders
services/tenant-service-fulfillment
services/tenant-service-acceptance
services/tenant-service-refunds
services/wechat-order-shipping
  负责编排、状态机、幂等、快照和领域转换

repositories/tenant-service-orders
repositories/tenant-service-work-orders
repositories/tenant-service-acceptances
repositories/tenant-service-wechat-fulfillments
  只访问 Supabase/RPC

gateways/wechat-order-shipping
  封装微信发货信息管理 API
```

所有异常必须通过 `error-factory.ts` 的 `Errors.*` 包装。第三方微信字段、枚举和签名实现必须在编码时再次核对本项目依赖版本及微信官方文档，不凭名称猜测。

### 7.1 支付回调扩展

统一保留：

```http
POST /pay/wechat/callback
```

扩展 `WechatPayCallbackContextMatcher`，增加 `tenant_service_order` 上下文。回调处理必须：

1. 验签并解密通知；
2. 按 `out_trade_no` 定位服务订单；
3. 校验 AppID、商户号、币种、订单金额和交易状态；
4. 按微信通知 ID 和交易号幂等；
5. 原子更新 `payment_status=paid`、写支付事件并创建实施工单；
6. 不写积分账户、不创建项目 `payments`、不推进装修项目 workflow；
7. 重复成功回调返回微信要求的成功响应。

## 8. 小程序 API 目标契约

本节定义实施后的最终契约。当前环境尚未提供这些新接口，小程序团队应等 Gooes dev 发布、版本号与真实响应样例同步后再接入。

### 8.1 通用约定

- Base URL：开发环境由 Orange 环境配置决定，不在页面硬编码；生产使用正式 API 域名。
- 鉴权：`Authorization: Bearer <employee token>`，必须带租户上下文。
- 角色：租户管理员默认具备购买和验收权限，其他员工按权限点控制。
- 成功响应：`{ "data": ..., "message": "success" }`。
- 错误响应：沿用全局错误封装，前端读取 `code`、`message`、`requestId`；不得展示第三方原始报文或密钥。
- 列表：默认 `page=1&pageSize=20`，`pageSize<=100`。
- 时间：ISO 8601；倒计时必须使用响应 `server_time` 校准。
- 金额：整数分；小程序只负责格式化显示。
- 幂等：所有创建/动作接口传 UUID `idempotency_key`；网络重试必须复用原键，用户重新发起新动作才生成新键。
- 并发：动作请求传 `expected_version`；版本冲突后刷新详情，不在本地强行覆盖。

### 8.2 查询可售服务商品

```http
GET /billing/service-products?page=1&pageSize=20
```

权限：`billing.service_order.create`，即使租户处于 billing locked 也允许访问续费入口。

响应：

```json
{
  "data": {
    "list": [
      {
        "code": "platform_service_1y",
        "title": "平台部署及年度技术服务（1年）",
        "term_years": 1,
        "list_amount_fen": 980000,
        "amount_fen": 980000,
        "price_rate_percent": 100,
        "service_scope": [
          "客户专属系统环境部署",
          "服务器基础配置",
          "首次操作培训",
          "年度运维与技术支持"
        ],
        "terms_version": 1
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 3,
      "totalPages": 1
    },
    "server_time": "2026-08-03T10:00:00.000Z"
  },
  "message": "success"
}
```

### 8.3 创建服务订单并获取支付参数

```http
POST /billing/service-orders
```

请求：

```json
{
  "product_code": "platform_service_1y",
  "terms_version": 1,
  "terms_accepted": true,
  "idempotency_key": "UUID"
}
```

响应：

```json
{
  "data": {
    "idempotent": false,
    "order": {
      "id": "UUID",
      "order_no": "TS202608030001ABCDEF12",
      "product_code": "platform_service_1y",
      "product_title": "平台部署及年度技术服务（1年）",
      "term_years": 1,
      "amount_fen": 980000,
      "payment_status": "pending",
      "service_status": "waiting_payment",
      "wechat_fulfillment_status": "waiting_acceptance",
      "display_stage": "待支付",
      "payment_expires_at": "2026-08-03T10:30:00.000Z",
      "version": 1
    },
    "payment_request": {
      "timeStamp": "1785741600",
      "nonceStr": "nonce",
      "package": "prepay_id=wx-prepay-id",
      "signType": "RSA",
      "paySign": "signature"
    },
    "server_time": "2026-08-03T10:00:00.000Z"
  },
  "message": "success"
}
```

后端从当前员工登录态解析其在平台小程序 AppID 下的 openid，并从商品快照生成支付金额和描述。请求不允许包含 `payer_openid`、`amount_fen`、折扣、商户号、AppID 或支付通道；登录态缺少 openid 时应要求小程序刷新登录态，不能信任客户端补传任意 openid。

`terms_version` 必须等于当前可售商品条款版本，后端把用户确认动作和条款快照写入订单审计。若幂等命中已有订单，返回同一订单和 `idempotent=true`。后端可以在安全且未过期时返回可复用的 `payment_request`；若为空，小程序进入订单详情并根据 `available_actions.continue_payment` 决定是否调用继续支付接口，不能重复创建订单。

### 8.4 继续支付

```http
POST /billing/service-orders/:id/payment-request
```

请求：

```json
{
  "idempotency_key": "UUID",
  "expected_version": 1
}
```

仅 `pending` 且未过期订单可用。响应包含最新 `order`、`payment_request` 和 `server_time`。

### 8.5 查询订单列表与详情

```http
GET /billing/service-orders?page=1&pageSize=20&paymentStatus=paid&serviceStatus=deploying
GET /billing/service-orders/:id
GET /billing/service-orders/:id/events?page=1&pageSize=20
```

详情响应至少包含：

```json
{
  "data": {
    "order": {
      "id": "UUID",
      "order_no": "TS202608030001ABCDEF12",
      "product_title": "平台部署及年度技术服务（1年）",
      "term_years": 1,
      "amount_fen": 980000,
      "payment_status": "paid",
      "service_status": "awaiting_acceptance",
      "wechat_fulfillment_status": "waiting_acceptance",
      "display_stage": "待客户验收",
      "paid_at": "2026-08-03T10:02:00.000Z",
      "accepted_at": null,
      "service_start_at": null,
      "service_end_at": null,
      "version": 8
    },
    "work_order": {
      "work_order_no": "SW202608030001",
      "assignee_name": "实施工程师（脱敏展示）",
      "milestones": [
        { "code": "server_configuration", "label": "服务器配置", "status": "completed", "completed_at": "2026-08-04T03:00:00.000Z" },
        { "code": "system_deployment", "label": "系统部署", "status": "completed", "completed_at": "2026-08-04T06:00:00.000Z" },
        { "code": "initial_training", "label": "首次培训", "status": "completed", "completed_at": "2026-08-05T03:00:00.000Z" }
      ]
    },
    "training_records": [
      {
        "id": "UUID",
        "title": "首次管理员操作培训",
        "training_at": "2026-08-05T03:00:00.000Z",
        "customer_confirmed_at": "2026-08-05T03:30:00.000Z",
        "attachments": []
      }
    ],
    "attachments": [],
    "latest_acceptance": null,
    "available_actions": {
      "continue_payment": { "enabled": false, "label": "继续支付", "disabled_reason": "订单已支付" },
      "confirm_training": { "enabled": false, "label": "确认培训", "disabled_reason": "培训记录已确认" },
      "accept": { "enabled": true, "label": "确认验收", "disabled_reason": null },
      "reject": { "enabled": true, "label": "提交问题", "disabled_reason": null },
      "request_refund": { "enabled": true, "label": "申请售后", "disabled_reason": null }
    },
    "server_time": "2026-08-05T04:00:00.000Z"
  },
  "message": "success"
}
```

`assignee_name`、附件访问地址和操作人信息按权限返回；任何服务器密码、密钥、内网拓扑和支付密钥都不能出现在详情接口。

### 8.6 上传客户材料与验收证据

新增私有上传场景：

- `platform_service_customer_material`：租户提交实施所需材料；
- `platform_service_acceptance_evidence`：租户驳回时的图片/PDF 证据；
- `platform_service_training_attachment`：平台人员上传培训记录；
- `platform_service_delivery_attachment`：平台人员上传交付附件。

直传链路保持不变：

```text
POST /uploads/cos/direct-init
→ PUT upload_url
→ POST /uploads/cos/direct-complete
→ 取得 file_id
→ 将 file_id 提交到对应业务动作接口
```

初始化示例：

```json
{
  "scene": "platform_service_acceptance_evidence",
  "business_id": "service-order-id",
  "filename": "acceptance-issue.pdf",
  "mimetype": "application/pdf",
  "size_bytes": 838860
}
```

实施时需要为服务场景增加 `business_id`，并按场景分别校验 MIME 与大小，不能把现有全局图片枚举直接无限放宽。建议：图片单文件不超过 10 MB，PDF 不超过 20 MB；仅允许 JPEG、PNG、WebP 和 PDF。

所有场景使用 private visibility。业务接口只接收 `file_id`，后端校验：

- 文件 `status=active`；
- scene 与业务用途匹配；
- 文件归属当前租户/平台操作者；
- `business_id` 与订单一致；
- 同一 `file_id` 未被越权复用。

预览复用受鉴权的文件预览能力并扩展为通用私有文件预览，不能把 COS 原始 URL 作为数据真相，也不能在客户端长期缓存签名 URL。

### 8.7 提交客户配合材料

```http
POST /billing/service-orders/:id/customer-materials
```

```json
{
  "file_ids": ["UUID"],
  "note": "已提供域名和服务器账号交接说明",
  "idempotency_key": "UUID",
  "expected_version": 3
}
```

禁止上传真实密码或私钥；敏感凭据应走线下安全交接或后续专用密钥管理能力，工单只记录“已安全交接”的审计事实。

### 8.8 确认培训记录

```http
POST /billing/service-orders/:id/training-records/:trainingRecordId/confirm
```

```json
{
  "comment": "培训内容已完成并可正常操作",
  "idempotency_key": "UUID",
  "expected_version": 6
}
```

客户只能确认平台已创建且属于本订单的培训记录，不能修改讲师、培训时间或附件。

### 8.9 客户验收或驳回

```http
POST /billing/service-orders/:id/acceptances
```

通过：

```json
{
  "decision": "accepted",
  "comment": "已确认系统环境、服务器配置和首次培训均已完成",
  "evidence_file_ids": [],
  "idempotency_key": "UUID",
  "expected_version": 8
}
```

驳回：

```json
{
  "decision": "rejected",
  "comment": "培训材料中的管理员操作步骤缺少说明",
  "evidence_file_ids": ["UUID"],
  "idempotency_key": "UUID",
  "expected_version": 8
}
```

规则：

- 仅 `awaiting_acceptance` 可操作；
- `rejected` 必须有具体原因；
- 后端记录租户、用户、员工、时间、客户端版本、订单版本、IP/UA 摘要和幂等键；
- 后端生成不可变验收凭证，附件只是证据的一部分，不能用“用户上传一张验收图”代替验收动作；
- 通过后原子生成/顺延服务合同期，并把微信履约状态置为 `pending`；
- 驳回后进入 `rectifying`，平台完成整改并重新提交，形成下一版本验收，不能覆盖旧记录。

### 8.10 申请售后/退款

```http
POST /billing/service-orders/:id/refund-requests
```

```json
{
  "reason": "服务尚未开始，申请取消",
  "evidence_file_ids": [],
  "idempotency_key": "UUID",
  "expected_version": 2
}
```

响应只表示申请已受理，不表示渠道退款成功。详情页分别显示审核状态、退款渠道状态和实际退款金额。

## 9. Admin 目标交互与接口

### 9.1 信息架构

在平台超管侧新增一级业务板块“平台服务”，包含：

- 服务商品；
- 服务订单；
- 实施工单；
- 履约异常。

“系统配置 → 支付配置”只维护普通支付与虚拟支付的渠道参数、密钥、回调和 readiness，不放服务商品 CRUD、图片、价格、工单或履约按钮。

### 9.2 平台接口

```http
GET    /platform/billing/service-products?page=1&pageSize=20
POST   /platform/billing/service-products
PATCH  /platform/billing/service-products/:id
POST   /platform/billing/service-products/:id/archive

GET    /platform/billing/service-orders?page=1&pageSize=20
GET    /platform/billing/service-orders/:id
POST   /platform/billing/service-orders/:id/work-order/assign
POST   /platform/billing/service-orders/:id/milestones/:code/complete
POST   /platform/billing/service-orders/:id/training-records
POST   /platform/billing/service-orders/:id/delivery-attachments
POST   /platform/billing/service-orders/:id/submit-acceptance
POST   /platform/billing/service-orders/:id/wechat-fulfillment/retry
POST   /platform/billing/service-orders/:id/refund-decisions
```

商品已有订单后禁止物理删除，只能停用或归档。商品编辑不回写历史订单快照。

“提交客户验收”前必须由后端校验服务器配置、系统部署、首次培训三个必需里程碑完成，并至少存在一份交付附件；前端禁用按钮只是提示，不能替代后端校验。

## 10. 微信普通支付与发货信息管理

### 10.1 支付通道

本服务使用平台现有独立普通微信支付 APIv3 配置。支付下单描述应与真实商品一致，例如：

```text
平台部署及年度技术服务（1年）
```

支付成功不等于服务已交付，也不等于资金已经到银行卡。后端以微信回调/主动查单确认支付，以微信订单管理状态和商户平台账务结果判断结算。

### 10.2 履约方式

服务没有实体快递时，不能伪装为“同城配送”或“用户自提”。在小程序类目和交易类型审核确认允许后，后端通过微信发货信息管理接口按“无实体物流履约”上报。

建议的真实履约描述模板：

```text
客户专属系统环境已部署，服务器配置及首次操作培训已完成
```

实际提交时必须根据本订单已完成的里程碑生成，不能在未配置、未部署或未培训时固定套用。

若未来交付实体服务器硬件，应拆分为“硬件商品订单”和“技术服务订单”：硬件订单按真实快递/同城配送上报，服务订单按审核通过的无实体物流方式上报。

### 10.3 后端上报控制

仅满足以下条件才允许进入上报：

- 普通支付已确认且金额一致；
- 订单无退款处理中或争议阻断；
- 必需里程碑和交付附件齐全；
- 最新一轮客户验收为 `accepted`；
- 小程序仍处于发货信息管理范围且商户授权有效；
- 类目和交易类型已审核确认支持当前履约方式。

后端调用微信服务端接口，Orange 不直接调用：

```text
POST /wxa/sec/order/upload_shipping_info
```

对于本服务，预期使用官方“无实体物流/虚拟发货”枚举和统一发货模式；正式编码前必须以当时微信官方 API 字段为准再次校验，不在小程序契约中暴露或让前端拼装第三方载荷。

上报采用 Outbox 思路但不新增 Redis/队列依赖：验收事务内只写 `tenant_service_wechat_fulfillments=pending`，现有后端定时补偿任务扫描待处理记录，调用微信并保存成功/失败、Request-ID 和下次重试时间。网络超时不得直接判成功，应进入 `reconciling` 并通过微信订单查询确认，避免重复发货。

客户在 Gooes 内完成验收，不等于已经在微信订单组件点击“确认收货”。微信侧主动确认可加快结算；若用户未操作，自动确认时间、争议处理和资金结算以微信当时规则及风控为准。

## 11. Orange 小程序改造清单

Orange 仓库由小程序团队实施，Gooes 不直接修改。

### 11.1 新增模块

建议新增：

```text
src/services/platform_service.ts
src/types/api/platform_service.d.ts

src/packageEmployees/pages/platformService/index.tsx
src/packageEmployees/pages/platformServiceOrders/index.tsx
src/packageEmployees/pages/platformServiceOrderDetail/index.tsx
```

并在 `src/app.config.ts` 的 `packageEmployees` 分包注册页面。

页面职责：

- `platformService`：展示服务说明、1/2/3 年套餐、条款确认与支付；
- `platformServiceOrders`：分页展示订单、支付/实施/验收状态和继续支付；
- `platformServiceOrderDetail`：时间线、工单、培训、附件、验收、整改、售后。

### 11.2 复用与禁止复用

复用：

- `requestWechatPayment`；
- UUID 幂等键；
- COS 直传底层函数；
- 充值记录里的服务器时间校准、待支付倒计时和短轮询策略；
- 项目验收页面的“通过/提交问题/整改历史”视觉交互。

禁止：

- 继续调用 `BillingService.listRechargeProducts/createRechargeOrder`；
- 展示 `credits`、`bonus_credits` 或积分余额；
- 使用 `packageCustomerPortal` 的业主 token 调服务验收接口；
- 复用 `/project-acceptances` 作为平台服务验收；
- 本地写死套餐金额或根据操作系统改价；
- 把 `wx.requestPayment:ok` 直接展示为“服务已开通”。

### 11.3 旧页面兼容

后端 dev 新接口发布并通过真实支付 smoke 后：

1. 员工首页和 billing locked 引导从“积分充值”切换为“平台服务”；
2. `src/packageEmployees/pages/billingSubscription/model.ts` 中旧充值跳转改到新服务页；
3. 旧 `creditRecharge` 和 `rechargeRecords` 页面保留一个版本，只提供历史订单入口或跳转，不再创建积分订单；
4. 历史积分订单继续由旧接口只读展示，不能混入新服务订单列表；
5. 观察期结束后再删除旧页面代码，删除动作单独评审。

### 11.4 小程序调用时序

```text
进入服务页
→ GET /billing/service-products
→ 用户选择套餐并确认真实服务条款
→ POST /billing/service-orders（一次点击一个新幂等键）
→ wx.requestPayment
→ GET /billing/service-orders/:id 短轮询支付结果
→ paid 后进入详情，不显示“立即到账”
→ 查看实施进度、培训和交付附件
→ 上传异议证据时走 COS 直传并提交 file_id
→ POST /billing/service-orders/:id/acceptances
→ 刷新详情，展示服务期和微信履约状态
```

支付轮询建议：首次立即查询，随后 2 秒、3 秒、5 秒、5 秒，最长约 30 秒；超时提示“支付结果确认中，请稍后刷新”，不能创建第二张订单。页面重新进入后以详情接口状态为准。

### 11.5 前端状态反馈

- 所有按钮使用接口返回的 `available_actions`，禁用时展示 `disabled_reason`；
- 上传、支付、验收各自使用独立 loading，避免整张 Card 高度跳变；
- 提交动作后按钮区域预留固定反馈高度；
- 列表、详情、附件和时间线分别提供骨架屏、空状态、失败重试；
- 429 按后端 `retry_after_seconds` 倒计时；
- 409 版本冲突自动刷新详情并提示“订单状态已更新”；
- 驳回原因和验收确认提交前二次确认；
- 不在日志上报 token、openid、服务器凭据、OCR/业务字段值或微信支付签名。

## 12. 错误码契约

新增错误码建议：

| HTTP | code | 小程序处理 |
| ---: | --- | --- |
| 400 | `SERVICE_PRODUCT_NOT_FOUND` | 刷新商品列表 |
| 400 | `SERVICE_TERMS_VERSION_STALE` | 刷新商品和条款，重新确认 |
| 400 | `SERVICE_ORDER_INVALID_STATE` | 刷新订单详情 |
| 400 | `SERVICE_MILESTONES_INCOMPLETE` | 展示后端缺失项，不允许验收 |
| 400 | `SERVICE_ACCEPTANCE_REASON_REQUIRED` | 聚焦驳回原因 |
| 400 | `SERVICE_FILE_INVALID` | 删除无效附件并重新上传 |
| 401 | `UNAUTHORIZED` | 重新登录 |
| 401 | `PAYER_OPENID_REQUIRED` | 强制刷新小程序登录态后重试，复用原幂等键 |
| 403 | `SERVICE_ORDER_FORBIDDEN` | 返回上一页并提示无权限 |
| 404 | `SERVICE_ORDER_NOT_FOUND` | 展示订单不存在 |
| 409 | `SERVICE_ORDER_VERSION_CONFLICT` | 刷新详情，不重复提交 |
| 409 | `SERVICE_ORDER_IDEMPOTENCY_CONFLICT` | 保留原键查询原动作结果 |
| 429 | `RATE_LIMITED` | 按 `retry_after_seconds` 倒计时 |
| 502 | `WECHAT_PAY_PREPAY_FAILED` | 保留订单，允许稍后继续支付 |
| 502 | `WECHAT_FULFILLMENT_REJECTED` | 仅 Admin 展示脱敏原因并修复后重试 |
| 503 | `WECHAT_FULFILLMENT_PENDING` | 显示处理中，不重复点击 |

微信原始错误码和 Request-ID 写入平台审计和履约异常页；租户端只展示稳定业务文案。

## 13. 分阶段实施计划

### 阶段 0：合规与配置确认

- 在微信公众平台确认小程序类目“商业服务—软件/建站/技术开发”及当前交易类型适用于实际综合服务；
- 确认普通商户号、AppID、回调、证书、发货信息管理授权均为目标环境；
- 用测试订单确认无实体物流履约字段和订单中心展示；
- 若审核结论不允许，不上线普通支付入口，回到商品拆分或类目调整，不用同城/自提绕过。

### 阶段 1：后端领域与支付闭环

- 新增 migration、领域常量、权限和三款初始化商品；
- 完成商品、订单、普通支付、回调确认、查询和退款申请；
- 旧积分充值入口切只读/关闭新建；
- API dev 发布后同步版本、路径、权限、开关和真实脱敏响应样例。

验收：三种金额准确；重复点击只产生一张订单；回调只创建一次实施工单；没有积分流水。

### 阶段 2：Admin 实施履约

- 完成服务商品、订单、实施工单、里程碑、培训、交付附件和退款审核页面；
- 增加私有文件场景和 PDF 支持；
- 完成状态机、操作审计和通知。

验收：未完成必需里程碑不能提交客户验收；敏感文件无法越租户预览。

### 阶段 3：Orange 小程序对接

- 新增服务商品、订单列表和详情；
- 接入支付、轮询、材料上传、培训确认、验收/驳回和售后；
- 更新入口并保留旧积分历史访问。

验收：真机完成首购、取消支付、继续支付、重复点击、回调延迟、上传失败重试、验收驳回与再次验收。

### 阶段 4：微信履约与结算观测

- 接入是否纳管/授权检查、无实体物流履约上报、查询对账和重试；
- Admin 增加履约异常与人工重试；
- 建立支付成功但未建工单、验收成功但未上报、上报长期失败等监控。

验收：真实小额订单在微信订单中心可见正确服务描述；重复任务不重复上报；超时可查询后收敛到唯一状态。

### 阶段 5：灰度与旧链路收口

- 先对白名单租户开放，再逐步放量；
- 比对订单、支付、工单、验收、微信履约和商户账单；
- 停止创建新积分充值订单，但保留历史查询、退款和审计；
- 观察期后再评审旧 API 与页面的弃用时间。

## 14. 发布、回滚与可观测性

### 14.1 开关

至少分开控制：

- `platform_service_sales_enabled`：是否允许展示/下单；
- `platform_service_payment_enabled`：是否允许预下单；
- `platform_service_wechat_fulfillment_enabled`：是否自动上报微信履约。

关闭履约开关不能回滚已支付或已验收状态，只暂停新上报并保留待处理记录。

### 14.2 回滚

- 代码回滚：关闭销售和履约开关，保留查询、支付回调、退款和补偿；
- 数据库回滚：首期只新增表/索引/权限，不删除旧积分结构；回滚时不 drop 已产生业务数据；
- 商品回滚：停用/归档，不删除有订单引用的商品；
- 微信失败：记录为 pending/failed，人工核对后重试，不伪造成功。

### 14.3 监控指标

- 创建订单成功率、预下单成功率、支付回调延迟；
- 已支付未建工单数量；
- 各实施阶段停留时长；
- 待验收时长与驳回率；
- 已验收未上报数量、微信上报成功率和重试次数；
- 退款申请率、审核时长和渠道退款失败数；
- 文件上传失败率和越权访问拦截数。

日志关联键统一使用 `requestId`、`order_id`、`order_no`、`work_order_id`、微信 Request-ID；禁止记录 token、支付签名、证书、密钥和服务器凭据。

## 15. 联调验收清单

### Gooes 后端

- [ ] migration 仅通过 `supabase/migrations/` 应用，Local/Remote 对齐；
- [ ] 列表分页默认 20、最大 100，查询限定字段且无 N+1；
- [ ] 三款金额分别为 980000、1568000、2058000 分；
- [ ] 前端篡改金额、年限、租户和 file_id 均被拒绝；
- [ ] 相同幂等键重试不重复下单、验收、退款或上报；
- [ ] 支付回调重复投递只确认一次、只创建一张工单；
- [ ] 新订单不写积分账户、积分流水或项目财务；
- [ ] 验收通过生成不可变凭证和正确服务期；
- [ ] 驳回形成新整改轮次，历史不被覆盖；
- [ ] 微信上报前置条件和重试/对账有效；
- [ ] 所有错误经过 error factory；
- [ ] API 类型检查、契约测试、构建和 smoke 通过。

### Admin

- [ ] 支付配置页不混入服务商品和履约操作；
- [ ] 商品 CRUD、订单、工单、里程碑、培训、附件、验收和履约异常关系清晰；
- [ ] 操作按钮有稳定 loading、成功/失败反馈，不造成 Card 跳高；
- [ ] 敏感服务器信息不出现在列表、详情、日志和附件标题；
- [ ] 退款和微信履约重试有二次确认与审计。

### Orange 小程序

- [ ] 只使用 `packageEmployees` 的租户员工鉴权；
- [ ] 商品、订单和详情全部使用新接口，不展示积分字段；
- [ ] `wx.requestPayment:ok` 后轮询服务端，不直接标记 paid；
- [ ] 网络重试复用幂等键，重新发起才创建新键；
- [ ] 上传、培训、验收、驳回、售后都有明确 loading 与错误反馈；
- [ ] 只提交 `file_id`，旧文件结果不会串到新动作；
- [ ] 客户可查看工单进度、培训记录、交付附件和验收凭证；
- [ ] 真机完成完整首购与整改复验链路；
- [ ] 异常回传仅包含接口、HTTP 状态、业务错误码、requestId、order ID、file ID 和幂等键复用情况，不回传 token、支付参数或业务敏感值。

## 16. 双方交付物与对接顺序

Gooes 先交付：

1. dev API 版本与 migration 状态；
2. 最终接口路径、权限点和功能开关；
3. 三款商品的真实响应；
4. 创建订单、支付中、已支付、实施、待验收、驳回、已验收、履约失败的脱敏样例；
5. 文件场景、MIME、大小、TTL 和预览规则；
6. 错误码表、幂等规则和 smoke 账号/订单说明；
7. 微信发货信息管理 readiness 与测试上报结果。

Orange 再交付：

1. 接口/类型/字段映射清单；
2. 页面入口、状态机和动作映射；
3. 开发构建使用的 API 地址；
4. 类型检查、契约测试、包体积与微信开发构建结果；
5. 真机支付、上传、培训确认、验收、驳回、重试和刷新验收记录；
6. 异常按约定脱敏回传。

在 Gooes dev 契约发布前，Orange 不应根据本设计提前写死第三方字段；可以先完成页面骨架和本地类型，但最终必须以发布契约与真实响应为准。

## 17. 参考资料

项目内：

- `docs/decoration-finance/2026-07-02-platform-wechat-recharge-credit-prd.md`
- `docs/decoration-finance/2026-07-03-platform-wechat-recharge-miniprogram-handoff.md`
- `docs/superpowers/specs/2026-07-31-platform-digital-entitlement-virtual-payment-migration-design.md`
- `docs/2026-05-08-project-acceptance-api-integration-guide.md`
- `docs/application_integration_documentation/2026-05-15-miniprogram-project-acceptance-cos-direct-upload.md`

微信官方：

- [小程序支付开发指引](https://pay.weixin.qq.com/doc/v3/merchant/4012791911)
- [支付回调与查单指引](https://pay.weixin.qq.com/doc/v3/merchant/4012075249)
- [小程序开放类目](https://developers.weixin.qq.com/miniprogram/product/material/)
- [小程序发货信息管理](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html)
- [上传发货信息 API](https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_uploadshippinginfo)
- [查询是否纳入发货信息管理](https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_istrademanaged)
- [查询商户授权确认状态](https://developers.weixin.qq.com/miniprogram/dev/server/API/order_shipping/api_istrademanagementconfirmationcompleted)
- [微信虚拟支付](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html)

## 18. 方案验收结论

本方案把四件容易混淆的事情彻底分开：

1. 普通支付只确认“钱已付”；
2. 实施工单证明“服务正在做”；
3. 客户验收证明“约定成果已确认”；
4. 微信履约上报用于微信订单管理和结算，不替代内部服务验收。

同时，旧积分、真实虚拟商品、平台综合技术服务和未来实物商城保持各自独立的数据模型与支付/履约规则，能在不污染历史账务的前提下逐步上线。
