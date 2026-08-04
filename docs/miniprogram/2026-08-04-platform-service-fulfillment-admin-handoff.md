# 平台技术服务履约与验收：小程序三期交接契约

日期：2026-08-04

适用仓库：`gooes` 后端 / Admin，`orange` 小程序

状态：

- Gooes 代码已通过 PR #20 squash merge 到 `main`，merge commit：
  `a73bf77e feat(platform): 平台技术服务履约管理`。
- 开发数据库已应用并验证 `20260804160000_create_platform_service_fulfillment_admin.sql`，
  `supabase migration list --db-url` 显示 Local/Remote 对齐到 `20260804160000`。
- 本次 merge 后的 GitHub Actions `Build Docker Images` run `30886827110` 已成功；
  中间一次 `Auto Deploy Dev` run `30887245991` 失败后，后续 main 提交 `889207f`
  已完成 `Auto Deploy Dev` run `30887458556` 并成功。因此 Orange 可以基于 dev 环境
  开始二期平台技术服务履约状态的只读核对；客户侧验收接口仍需以后端三期契约为准。
- 三期客户侧验收接口的正式对接文档已新增：
  `docs/miniprogram/2026-08-04-platform-service-customer-acceptance-handoff.md`。
  开发库已应用 `20260804170000_create_platform_service_customer_acceptance.sql`
  并验证 Local/Remote 对齐；该能力待三期分支 merge 并发布 dev API 后再进入 Orange 真机联调。
- 本文档只写入 gooes 仓库，不修改 `/Users/leefo/Public/work/orange`。

## 1. 本期后端和 Admin 已完成能力

本期是在一期“平台部署及年度技术服务商品、订单、普通微信支付、支付成功后自动建
实施工单”的基础上，补齐平台超管侧履约管理能力。

已完成能力：

- 平台超管查看平台技术服务订单列表和详情接口；
- 平台超管查看实施工单列表和详情接口；
- 工单分配负责人；
- 工单状态按后端状态机流转，并使用 `expected_version` 防止并发覆盖；
- 记录部署、服务器配置、上门培训、远程培训、年度运维、验收准备、整改等履约记录；
- 履约记录和验收准备可绑定已有 `file_id`；
- 平台超管保存或提交验收准备资料；
- 平台超管审核租户提交的服务退款申请；
- Admin 新增入口：`平台运营 -> 技术服务`，页面路径 `/platform/service-orders`；
- Admin 页面包含 `服务订单`、`实施工单`、`退款审核` 三个 tab。

当前 Admin 入口主要用于平台内部履约处理。小程序三期只需要消费后续客户侧验收接口，
不需要调用平台超管接口。

## 2. 小程序当前暂不需要修改的边界

Orange 当前一期支付链路保持不变：

- 继续使用 `GET /billing/service-products` 读取可购买平台技术服务商品；
- 继续使用 `POST /billing/service-orders` 创建订单；
- 继续使用 `wx.requestPayment` 调起普通微信支付；
- 支付后继续轮询 `GET /billing/service-orders/:id`；
- 退款申请继续使用 `POST /billing/service-orders/:id/refund-requests`。

Orange 暂不需要做的事情：

- 不调用 `/platform/billing/*` 平台超管接口；
- 不传金额、折扣、商户号、支付通道或 `payer_openid`；
- 不实现微信发货信息管理接口上报；
- 不处理微信退款实际出款状态；
- 不把平台技术服务当作微信虚拟商品；
- 不修改现有虚拟支付、虚拟商品、品牌权益商品逻辑。

## 3. 当前平台侧二期接口

以下接口供 Admin 超管侧使用，Orange 只需了解状态和字段含义，不要直接调用。

### 3.1 服务订单列表

```http
GET /platform/billing/service-orders?page=1&pageSize=20
Authorization: Bearer <platform-admin-token>
```

可选 query：

- `keyword`：订单号或商品编码；
- `tenantKeyword`：租户名称；
- `paymentStatus`：支付状态；
- `serviceStatus`：服务状态；
- `createdFrom` / `createdTo`：保留字段，当前列表实现尚未使用。

返回：

- `list[]`
- `pagination`
- `server_time`

### 3.2 服务订单详情

```http
GET /platform/billing/service-orders/:id
Authorization: Bearer <platform-admin-token>
```

返回：

```json
{
  "order": {
    "id": "service-order-id",
    "order_no": "TSO202608040001",
    "tenant_id": "tenant-id",
    "product_code": "platform_service_1y",
    "term_years": 1,
    "amount_fen": 980000,
    "payment_status": "paid",
    "service_status": "waiting_assignment",
    "paid_at": "2026-08-04T10:01:00.000Z",
    "available_actions": {}
  }
}
```

### 3.3 实施工单列表

```http
GET /platform/billing/service-work-orders?page=1&pageSize=20
Authorization: Bearer <platform-admin-token>
```

可选 query：

- `keyword`：订单号；
- `tenantKeyword`：租户名称；
- `status`：工单状态；
- `assigneeEmployeeId`：负责人 ID。

返回的 `list[]` 包含：

- 工单基本信息；
- `version`；
- `available_actions`；
- 关联订单摘要 `order`，包含订单号、商品编码、金额、支付状态、服务状态和租户摘要。

### 3.4 实施工单详情

```http
GET /platform/billing/service-work-orders/:id
Authorization: Bearer <platform-admin-token>
```

当前返回 `work_order` 基本视图和关联订单摘要。履约记录、附件、验收准备的聚合详情视图
尚未作为独立客户侧接口发布，小程序三期需要等待新的客户侧读取接口。

### 3.5 分配工单

```http
POST /platform/billing/service-work-orders/:id/assign
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "assignee_employee_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "expected_version": 1,
  "remark": "分配给实施负责人"
}
```

规则：

- `expected_version` 必填；
- 后端通过 RPC 原子校验版本；
- 成功后工单 `version` 增加并记录工单事件；
- 终态工单不能重新分配，前端应消费 `available_actions.assign`。

### 3.6 推进工单状态

```http
POST /platform/billing/service-work-orders/:id/status-transitions
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "to_status": "deploying",
  "expected_version": 2,
  "remark": "服务器配置完成，进入部署"
}
```

合法状态机：

```text
waiting_assignment -> configuring
configuring -> deploying
deploying -> training
training -> awaiting_acceptance
awaiting_acceptance -> accepted
accepted -> active
awaiting_acceptance -> rectifying
rectifying -> awaiting_acceptance
waiting_assignment/configuring/deploying/training/awaiting_acceptance/rectifying -> canceled
```

规则：

- 后端只接受合法下一状态；
- 成功后同步更新 `tenant_service_orders.service_status`；
- 成功后写入 `tenant_service_work_order_events`。

### 3.7 创建履约记录

```http
POST /platform/billing/service-work-orders/:id/fulfillment-records
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "record_type": "server_configuration",
  "title": "服务器配置",
  "content": "客户专属系统环境已部署，服务器配置及首次操作培训已完成。",
  "occurred_at": "2026-08-04T10:00:00+08:00",
  "file_ids": [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  ]
}
```

`record_type` 可选值：

- `environment_setup`
- `server_configuration`
- `onsite_training`
- `remote_training`
- `annual_operation`
- `acceptance_preparation`
- `rectification`

规则：

- 一次最多绑定 10 个 `file_id`；
- 后端从工单反查 `tenant_id` 和 `service_order_id`，不信任客户端传入租户或订单；
- 当前仅绑定已有文件 ID，不新增上传基础设施。

### 3.8 保存或提交验收准备

```http
POST /platform/billing/service-work-orders/:id/acceptance-preparation
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "status": "submitted",
  "summary": "客户专属系统已完成部署、服务器配置和首次培训，可进入客户验收。",
  "file_ids": [
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  ]
}
```

当前 `status` 只接受：

- `draft`
- `submitted`

客户确认、驳回、重新提交由小程序三期和后续客户侧接口承接。

### 3.9 退款审核列表

```http
GET /platform/billing/service-refund-requests?page=1&pageSize=20
Authorization: Bearer <platform-admin-token>
```

可选 query：

- `keyword`：退款原因；
- `tenantKeyword`：租户名称；
- `status`：`reviewing`、`approved`、`rejected`、`cancelled`。

### 3.10 退款审核

```http
POST /platform/billing/service-refund-requests/:id/review
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "decision": "rejected",
  "expected_version": 1,
  "review_remark": "服务已开始实施，暂不支持退款。"
}
```

规则：

- 本期只记录平台审核结论；
- 审核通过不调用微信退款实际出款；
- 审核驳回会将订单支付状态从 `refund_reviewing` 恢复为 `paid`；
- 小程序端不得展示“已退款到账”，除非后续实际微信退款出款接口完成并返回明确状态。

## 4. 小程序三期建议接口方向

以下接口尚未发布，属于 Orange 三期前后端对接方向。路径和字段应以后续正式 handoff 为准。

### 4.1 读取客户待验收服务

建议：

```http
GET /billing/service-orders/:id/acceptance
Authorization: Bearer <tenant-employee-token 或 customer-token>
```

建议返回：

```json
{
  "order": {
    "id": "service-order-id",
    "order_no": "TSO202608040001",
    "product_code": "platform_service_1y",
    "term_years": 1,
    "amount_fen": 980000,
    "payment_status": "paid",
    "service_status": "awaiting_acceptance"
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
      "attachments": []
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
  }
}
```

### 4.2 客户确认验收

建议：

```http
POST /billing/service-orders/:id/acceptance/confirm
Authorization: Bearer <tenant-employee-token 或 customer-token>
Content-Type: application/json

{
  "expected_work_order_version": 5,
  "accepted": true,
  "remark": "确认验收通过"
}
```

后端建议：

- 将工单从 `awaiting_acceptance` 流转到 `accepted`，必要时再由平台或定时任务流转到
  `active`；
- 写客户验收事件；
- 回写 `tenant_service_acceptance_preparations.status = accepted`；
- 返回订单、工单和验收记录最新视图。

### 4.3 客户驳回整改

建议：

```http
POST /billing/service-orders/:id/acceptance/reject
Authorization: Bearer <tenant-employee-token 或 customer-token>
Content-Type: application/json

{
  "expected_work_order_version": 5,
  "remark": "培训资料缺少管理员操作说明，请补充。"
}
```

后端建议：

- 将工单从 `awaiting_acceptance` 流转到 `rectifying`；
- 回写 `tenant_service_acceptance_preparations.status = rejected`；
- 写整改事件；
- 平台补充整改履约记录后，可由平台再次提交验收准备。

### 4.4 附件预览

建议复用现有文件预览/签名 URL 能力，后端提供短 TTL 预览 URL。

Orange 侧要求：

- 不缓存私有附件长期 URL；
- 不在日志中输出 URL query、token、身份证件字段、手机号或 OCR 原文；
- 图片和 PDF 均按后端返回的 `mime_type` 渲染；
- 预览失败时展示“附件暂不可预览，请稍后重试”，并脱敏回传 requestId。

## 5. 状态与展示建议

服务状态展示建议：

| 后端状态 | 小程序文案 | 用户动作 |
| --- | --- | --- |
| `waiting_payment` | 待支付 | 继续支付或取消 |
| `waiting_assignment` | 已支付，待安排实施 | 查看订单 |
| `configuring` | 系统配置中 | 查看进度 |
| `deploying` | 系统部署中 | 查看进度 |
| `training` | 培训安排中 | 查看进度 |
| `awaiting_acceptance` | 待验收 | 查看交付资料、确认或要求整改 |
| `rectifying` | 整改中 | 查看整改进度 |
| `accepted` | 已验收 | 查看服务记录 |
| `active` | 服务中 | 查看年度运维 |
| `canceled` | 已取消 | 查看订单 |

支付状态展示建议：

| 后端状态 | 小程序文案 |
| --- | --- |
| `pending` | 待支付 |
| `paid` | 已支付 |
| `refund_reviewing` | 退款审核中 |
| `refunding` | 退款处理中 |
| `partially_refunded` | 部分退款 |
| `refunded` | 已退款 |
| `closed` | 已关闭 |

## 6. 错误码和脱敏回传格式

小程序应以稳定 `code` 为准，不解析中文 `message`。

当前二期已使用或建议关注的错误码：

- `SERVICE_ORDER_NOT_FOUND`
- `SERVICE_WORK_ORDER_NOT_FOUND`
- `SERVICE_WORK_ORDER_VERSION_CONFLICT`
- `SERVICE_WORK_ORDER_INVALID_STATE`
- `SERVICE_REFUND_REVIEW_INVALID_STATE`
- `SERVICE_REFUND_REVIEW_FORBIDDEN`
- `FORBIDDEN`
- `VALIDATION_ERROR`

Orange 回传问题时请提供：

```json
{
  "api": "GET /billing/service-orders/:id/acceptance",
  "http_status": 409,
  "code": "SERVICE_WORK_ORDER_VERSION_CONFLICT",
  "request_id": "req-xxx",
  "order_id": "可提供时填写",
  "work_order_id": "可提供时填写",
  "file_id": "仅附件问题提供",
  "idempotency_key_reused": true,
  "client_action": "confirm_acceptance",
  "network": "wifi/4g/5g",
  "platform": "ios/android/harmony/devtools"
}
```

禁止回传：

- token；
- OpenID；
- 手机号；
- 身份证件号；
- 营业执照识别原文；
- 私有附件预览 URL query；
- 微信支付签名参数。

## 7. 真机 smoke 验收清单

后端发布三期客户侧验收接口后，Orange 真机 smoke 建议按以下顺序执行：

1. 使用 dev 登录态读取已支付平台技术服务订单；
2. 进入订单详情，确认状态为 `awaiting_acceptance` 时出现验收入口；
3. 读取验收准备资料，展示摘要、履约记录和附件；
4. 预览图片附件；
5. 预览 PDF 附件；
6. 点击确认验收，携带 `expected_work_order_version`，接口返回 2xx；
7. 重复点击确认验收，后端返回幂等成功或稳定版本冲突，不产生重复事件；
8. 新建另一张待验收工单，点击要求整改并填写原因；
9. 平台补充整改记录并再次提交验收，小程序重新读取后可再次确认；
10. 弱网或接口 409 时展示可恢复提示，不清空已读取资料；
11. 退款审核通过时不展示“已到账”，只展示“退款审核已通过，等待后续退款处理”；
12. 回传异常时按第 6 节脱敏格式提供 requestId 和状态码。

## 8. 对 Orange 的建议回复

可以这样回复小程序端：

> Gooes 二期平台技术服务履约能力已合并到 main，开发库 migration 已应用并对齐到
> `20260804160000`。本期新增的是平台超管侧服务订单、实施工单、履约记录、验收准备
> 和退款审核能力；Orange 当前支付链路暂不需要调整，也不要调用 `/platform/billing/*`
> 平台接口。
>
> 三期客户侧“读取验收资料、确认验收、要求整改”接口已形成后端契约，详见
> `docs/miniprogram/2026-08-04-platform-service-customer-acceptance-handoff.md`。
> 开发库已应用 `20260804170000_create_platform_service_customer_acceptance.sql`
> 并验证 Local/Remote 对齐；待三期分支 merge 并发布 dev API 后，Orange 可按该文档开始员工端真机联调。
