# 平台技术服务客户验收三期：Orange 对接契约

日期：2026-08-04

适用范围：Gooes 后端；Orange 小程序员工端只读对接参考

状态：客户验收主链路已发布到 dev；开发库已应用 `20260804170000_create_platform_service_customer_acceptance.sql` 并通过 `supabase migration list` 验证 Local/Remote 对齐。本分支补充租户员工履约附件短 TTL 预览 URL 契约，待合并并发布 dev API 后，Orange 可补附件预览真机验收。

## 1. 业务边界

平台技术服务客户验收的操作主体是租户企业员工，不是装修项目业主。

本期接口只面向员工登录态：

- 页面建议继续放在 `packageEmployees`；
- 不复用 `packageCustomerPortal` 的业主/客户验收 token；
- 不调用 `/platform/billing/*` 平台超管接口；
- 不涉及微信发货上报、微信退款出款或虚拟支付；
- 不由小程序传金额、折扣、支付通道或商户号。

## 2. 接口清单

### 2.1 读取验收资料

```http
GET /billing/service-orders/:id/acceptance
Authorization: Bearer <tenant-employee-token>
```

用途：订单支付后，平台完成部署、服务器配置和培训并提交验收准备时，小程序读取交付资料。

返回核心结构：

```json
{
  "order": {
    "id": "service-order-id",
    "order_no": "TSO202608040001",
    "product_code": "platform_service_1y",
    "term_years": 1,
    "amount_fen": 980000,
    "payment_status": "paid",
    "service_status": "awaiting_acceptance",
    "display_stage": "awaiting_acceptance",
    "version": 4
  },
  "work_order": {
    "id": "work-order-id",
    "status": "awaiting_acceptance",
    "version": 5
  },
  "acceptance_preparation": {
    "id": "acceptance-id",
    "status": "submitted",
    "summary": "客户专属系统已完成部署、服务器配置和首次培训。",
    "submitted_at": "2026-08-04T10:00:00.000Z"
  },
  "fulfillment_records": [
    {
      "id": "record-id",
      "record_type": "server_configuration",
      "title": "服务器配置",
      "content": "已完成服务器基础配置与安全基线配置。",
      "occurred_at": "2026-08-04T09:30:00.000Z",
      "attachments": [
        {
          "id": "attachment-id",
          "file_id": "file-id",
          "file_name": "交付说明.pdf",
          "mime_type": "application/pdf",
          "size_bytes": 1024
        }
      ]
    }
  ],
  "available_actions": {
    "accept": {
      "enabled": true,
      "label": "确认验收",
      "disabled_reason": null
    },
    "reject": {
      "enabled": true,
      "label": "要求整改",
      "disabled_reason": null
    }
  },
  "server_time": "2026-08-04T10:01:00.000Z"
}
```

展示建议：

- `available_actions.accept.enabled=true` 时展示“确认验收”；
- `available_actions.reject.enabled=true` 时展示“要求整改”；
- 禁止前端根据状态硬推按钮，按钮是否可用以后端 `available_actions` 为准；
- 附件预览必须调用 2.4 的平台技术服务专用短 TTL URL 接口，不复用微信支付进件材料预览接口。

### 2.2 确认验收

```http
POST /billing/service-orders/:id/acceptance/confirm
Authorization: Bearer <tenant-employee-token>
Content-Type: application/json

{
  "expected_work_order_version": 5,
  "remark": "确认验收通过"
}
```

后端行为：

- 原子校验订单、工单、验收准备；
- 工单 `awaiting_acceptance -> accepted`；
- 订单 `service_status -> accepted`；
- 验收准备 `submitted -> accepted`；
- 写审计事件 `customer_accept`；
- 返回订单、工单和验收准备最新视图。

### 2.3 要求整改

```http
POST /billing/service-orders/:id/acceptance/reject
Authorization: Bearer <tenant-employee-token>
Content-Type: application/json

{
  "expected_work_order_version": 5,
  "remark": "培训资料缺少管理员操作说明，请补充。"
}
```

后端行为：

- 原子校验订单、工单、验收准备；
- 工单 `awaiting_acceptance -> rectifying`；
- 订单 `service_status -> rectifying`；
- 验收准备 `submitted -> rejected`；
- 写审计事件 `customer_reject`；
- 返回订单、工单和验收准备最新视图。

### 2.4 履约附件短 TTL 预览 URL

```http
GET /billing/service-orders/:id/fulfillment-attachments/:attachmentId/preview-url
Authorization: Bearer <tenant-employee-token>
```

用途：租户员工在验收详情中预览平台技术服务履约附件。该接口只生成短 TTL 私有文件访问 URL，不长期公开文件。

鉴权和归属：

- 仅租户员工登录态可用；
- 需要 `billing.service_order.read` 或 `billing.service_order.create`；
- `:id` 必须是当前租户的平台技术服务订单；
- `:attachmentId` 必须属于同一订单、同一租户；
- 附件文件必须是 `platform_file_objects.scene = tenant_service_fulfillment_attachment`、`provider = tencent_cos`、`visibility = private`、`status = active`。

返回结构：

```json
{
  "preview_url": "https://example.cos.ap-guangzhou.myqcloud.com/...?sign=...",
  "ttl_seconds": 600,
  "expires_at": "2026-08-04T10:11:00.000Z",
  "file": {
    "id": "file-id",
    "attachment_id": "attachment-id",
    "file_name": "交付说明.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 1024
  },
  "server_time": "2026-08-04T10:01:00.000Z"
}
```

小程序处理：

- 图片可用 `preview_url` 做临时预览；
- PDF 建议先 `wx.downloadFile` 到本地临时文件，再用 `wx.openDocument`；
- 不要持久化 `preview_url`，过期后重新调用本接口；
- 失败时保留附件卡片，提示“附件预览地址已失效，请重试”。

## 3. 错误码

| HTTP | code | 小程序处理 |
| --- | --- | --- |
| 401 | `PAYER_OPENID_REQUIRED` 或登录态错误 | 重新登录 |
| 403 | `FORBIDDEN` | 提示当前账号无权限 |
| 404 | `SERVICE_ORDER_NOT_FOUND` | 提示订单不存在或已不可访问 |
| 404 | `SERVICE_WORK_ORDER_NOT_FOUND` | 提示实施工单尚未生成 |
| 404 | `SERVICE_FULFILLMENT_ATTACHMENT_NOT_FOUND` | 提示附件不存在或无权访问 |
| 409 | `SERVICE_WORK_ORDER_VERSION_CONFLICT` | 刷新详情后重试 |
| 409 | `SERVICE_ACCEPTANCE_INVALID_STATE` | 刷新详情，按最新状态展示 |
| 500 | `DB_ERROR` 或统一错误码 | 展示“提交失败，请稍后重试”，脱敏回传 |

## 4. 脱敏回传格式

异常回传给后端时只包含：

```json
{
  "api": "POST /billing/service-orders/:id/acceptance/confirm",
  "http_status": 409,
  "code": "SERVICE_WORK_ORDER_VERSION_CONFLICT",
  "request_id": "req-xxx",
  "service_order_id": "service-order-id",
  "work_order_version": 5,
  "client_action": "confirm_acceptance"
}
```

不要回传 token、附件签名 URL、手机号、联系人、企业证照字段、OCR 原文或客户备注全文。

## 5. 真机 smoke 清单

后端发布 dev 后，Orange 建议按以下顺序验收：

1. 使用具备平台技术服务订单权限的员工登录；
2. 打开一张已支付、平台已提交验收准备的服务订单；
3. 请求 `GET /billing/service-orders/:id/acceptance` 返回 200；
4. 展示摘要、履约记录和附件；
5. 点击确认验收，携带当前 `work_order.version`；
6. 接口返回 2xx，状态变为 `accepted`；
7. 重复点击确认验收，返回稳定 409，不重复创建事件；
8. 新建另一张待验收订单，点击要求整改；
9. 状态变为 `rectifying`，平台补充整改后可再次提交验收；
10. 弱网和 409 场景不清空已读取资料。

## 6. dev 验收订单

已在 `api-dev.goodcms.cn` 对应开发库准备两张隔离订单，租户为 `固始晴天装饰工程有限公司`，数据标记为 `orange_acceptance_smoke_20260804`。

| 用途 | service_order_id | order_no | expected_work_order_version |
| --- | --- | --- | --- |
| 确认验收 | `631d97af-c96f-4701-8d00-305aa144b29e` | `TSOORANGEMSEEQVYZACCEPT` | `4` |
| 要求整改 | `ff0fee83-6a31-4970-9da3-41bdcb726428` | `TSOORANGEMSEER27BRECTIFY` | `4` |

两张订单均为：

- `payment_status = paid`；
- `service_status = awaiting_acceptance`；
- 工单 `status = awaiting_acceptance`；
- 验收准备 `status = submitted`；
- 各含 1 条履约记录和 2 个附件元数据（图片 + PDF）。

## 7. 给 Orange 的回复模板

> Gooes 已准备两张隔离的 `awaiting_acceptance` dev 订单，分别用于确认验收和要求整改，订单均含履约记录及图片/PDF 附件元数据。客户验收主链路可先用现有 dev API 联调。
>
> 附件预览后端采用平台技术服务专用短 TTL URL 契约：`GET /billing/service-orders/:id/fulfillment-attachments/:attachmentId/preview-url`，不复用微信支付进件材料预览接口。该接口待本分支合并并发布 dev API 后可联调；签名 URL TTL 为 600 秒，小程序不要持久化。
>
> `@gooes/domain@1.14.0` 已包含平台服务履约状态和履约记录枚举；后端会同步提供可安装制品供 Orange 更新。
