# 小程序本地服务商页装企主动入驻对接

日期：2026-07-14  
后端仓库：`/Users/leefo/Public/work/gooes`  
小程序仓库：`/Users/leefo/Public/work/orange`，本次 orange 只读核查，gooes 不修改 orange 文件。  
状态：后端契约已在当前分支实现，待小程序端对接、联调和灰度。

## 结论

小程序本地服务商页新增“成为服务商”入口。装修公司从这个入口提交入驻资料后，后端只创建一条待平台审核的申请，不再立即创建租户。平台审核通过后才创建装修公司租户和管理员，并按公司服务区域自动归因城市合伙人。城市合伙人可以做“装企协查”，但协查不是最终审核，不能在小程序端展示为平台已通过。

旧接口 `POST /partner-onboarding/tenant-applications` 是历史邀请入驻路径，语义是“邀请入驻成功即创建租户”。旧接口首发不改成功响应，避免旧小程序误判；等新小程序全量可用后，运维配置 `LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_AT`，截止时间最多为全量发布时间后 14 日。到期后旧发送验证码和旧提交接口统一返回 `410 TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED`。

## orange 侧预计改造点

只读核查到的现有文件：

- `src/packageVisitor/pages/visitor-local-services/index.tsx`：当前页面从 `readVisitorLocalServicesSnapshot()` 读取 `matched_tenants` 快照，需要改成实时调用 `GET /visitor/local-service-providers`，并增加“成为服务商”CTA。
- `src/packageVisitor/pages/tenant-onboarding/*`：已有城市合伙人邀约入驻页，当前调用旧 `partner-onboarding` 即时创建租户接口。新本地服务入口不要复用旧提交接口，可以复用表单组件但必须换成新 `tenant-onboarding` API。
- `src/utils/image_upload.ts`、`src/utils/image_upload_helpers.ts`：已有 COS 直传工具，但营业执照场景完成登记必须带回 `upload_intent`，当前通用工具没有传该字段，需要扩展。
- `src/utils/api.ts`、`src/utils/https.ts`：已有 API 封装，支持 `skipAuth`、普通 token 请求和自定义请求头。
- `src/services/visitor_location_context.ts`、`src/utils/location_context.ts`：可复用定位上下文和区域展示。
- 合伙人端可新增或扩展 `src/services/partner.ts` 下的 partner portal API 调用。

gooes 侧源文件断言：

- 新申请入口：`apps/api/src/controllers/tenant-onboarding/index.ts`
- 新申请业务：`apps/api/src/services/tenant-onboarding-applications.ts`
- 私有营业执照直传：`apps/api/src/controllers/uploads/index.ts`
- 合伙人协查：`apps/api/src/controllers/partner-onboarding-applications/index.ts`
- 公开服务商列表：`apps/api/src/controllers/visitor-local-service-providers/index.ts`
- 服务商资料和发布：`apps/api/src/controllers/tenant-service-provider/index.ts`、`apps/api/src/controllers/platform-tenant-onboarding/index.ts`
- 历史合伙人即时入驻截止门禁：`apps/api/src/services/platform-partner-tenant-onboarding.ts`
- 历史参考：LightRAG 返回 `docs/2026-07-04-city-partner-platform-prd.md`、`docs/2026-07-07-platform-partner-unbind-rebind-identity-switch-handoff.md` 等城市合伙人资料。

## 页面流

1. 访客进入本地服务商页。
2. 页面使用 visitor 登录态调用 `GET /visitor/local-service-providers?page=1&pageSize=20` 展示当前定位区域内已发布服务商。
3. 无匹配服务商时展示空态和“成为服务商”CTA；有匹配时列表底部也展示 CTA。
4. 点击 CTA 后检查 visitor 登录态和定位上下文。没有 visitor 登录态先走现有 visitor 登录；没有定位上下文先引导选择服务区域。
5. 进入装企入驻表单，填写公司资料、服务区域、管理员手机号。
6. 营业执照走 `tenant_onboarding_license` 私有 COS 直传，拿到 `file_id`。
7. 发送短信验证码。
8. 提交申请，必须带 `Idempotency-Key`。
9. 提交成功进入状态页，展示“已提交，等待平台审核”。
10. 后续通过 `GET /tenant-onboarding/applications/mine` 或详情接口刷新状态。
11. 平台要求补充时，表单进入补充模式，提交 `PATCH /tenant-onboarding/applications/:id/supplement`。
12. 申请仍处于可撤回状态时允许撤回。

## 本地服务商列表规则

必须调用：

```http
GET /visitor/local-service-providers?page=1&pageSize=20
Authorization: Bearer <visitor_session token>
```

不要把 `POST /visitor/location-bootstrap` 的 `matched_tenants` 当成权威服务商列表。`matched_tenants` 是历史定位快照，只能作为定位流程候选或旧页面兼容数据。新本地服务商页必须以 `GET /visitor/local-service-providers` 的实时返回为准。

区域隔离规则：

- 后端按 visitor 最新定位 `adcode` 解析省、市、区县路径。
- 只返回覆盖这些区域路径的已发布服务商。
- 如果定位区域没有匹配的已发布公司，返回空列表。
- 禁止跨区域兜底展示，禁止把其他城市或其他区县服务商补进来。

成功响应示例：

```json
{
  "data": {
    "list": [
      {
        "tenant_id": "uuid",
        "public_name": "晴天装饰",
        "introduction": "本地装修服务介绍",
        "public_phone": "13900139000",
        "address_province": "河南省",
        "address_city": "信阳市",
        "address_district": "固始县",
        "address_region_code": "411525",
        "address": "固始县示例路 1 号",
        "address_latitude": 32.0,
        "address_longitude": 115.6,
        "matched_region_code": "411525"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

分页：默认 `page=1&pageSize=20`，最大 `pageSize=100`。第一页为空时展示空态：“当前区域暂无公开服务商，可提交资料成为服务商。”

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 重新获取 visitor 登录态 |
| 400 | `VALIDATION_ERROR` | 修正分页参数 |
| 500 | `DB_ERROR` | 展示重试 |

## 营业执照私有直传

营业执照只能使用私有直传，不允许公开 URL。

### 1. 初始化直传

```http
POST /uploads/cos/direct-init
Authorization: Bearer <visitor_session token>
```

请求：

```json
{
  "scene": "tenant_onboarding_license",
  "filename": "license.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 102400
}
```

成功响应核心字段：

```json
{
  "data": {
    "provider": "tencent_cos",
    "object_key": "private/tenant-onboarding-license/visitors/<visitor-id>/...",
    "upload_url": "https://...",
    "method": "PUT",
    "headers": {
      "content-type": "image/jpeg",
      "content-length": "102400",
      "x-cos-forbid-overwrite": "true"
    },
    "upload_intent": "v1.<payload>.<signature>",
    "expires_at": "2026-07-14T10:05:00.000Z"
  }
}
```

小程序上传到 `upload_url` 时必须使用后端返回的 headers。需要覆盖：

- `content-type`
- `content-length`
- `x-cos-forbid-overwrite`
- 签名 URL 查询参数里已包含的 COS 授权参数，不要写入日志。

### 2. 完成登记

```http
POST /uploads/cos/direct-complete
Authorization: Bearer <visitor_session token>
```

请求：

```json
{
  "scene": "tenant_onboarding_license",
  "filename": "license.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 102400,
  "object_key": "private/tenant-onboarding-license/visitors/<visitor-id>/...",
  "etag": "\"etag-from-cos\"",
  "upload_intent": "v1.<payload>.<signature>"
}
```

成功响应：

```json
{
  "data": {
    "file_id": "uuid",
    "status": "active"
  }
}
```

禁止事项：

- 不要请求 `/uploads/public-url` 获取营业执照地址。
- 不要把 `upload_url`、签名参数、`object_key`、`upload_intent` 写入埋点或错误日志。
- 不要把同一个 `object_key` 重复上传作为“覆盖更新”。

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 重新获取 visitor 登录态 |
| 403 | `FORBIDDEN` | 当前身份不能上传此场景 |
| 400 | `VALIDATION_ERROR` | 参数缺失或 `upload_intent` 缺失 |
| 400 | `FILE_STORAGE_UPLOAD_FAILED` | COS 文件不存在、head 校验失败或私有凭证无效 |
| 503 | `FILE_STORAGE_CONFIG_MISSING` | 存储未配置，提示稍后重试 |

## 装企申请接口

### 1. 发送验证码

```http
POST /tenant-onboarding/applications/send-code
Authorization: Bearer <visitor_session token>
```

请求：

```json
{
  "phone": "13900139000"
}
```

成功响应：

```json
{
  "data": {
    "success": true,
    "cooldown_seconds": 60
  }
}
```

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 获取 visitor 登录态后重试 |
| 400 | `VALIDATION_ERROR` | 校验手机号 |
| 429 | `SMS_CODE_RATE_LIMITED` | 禁用按钮并显示倒计时 |

### 2. 提交申请

```http
POST /tenant-onboarding/applications
Authorization: Bearer <visitor_session token>
Idempotency-Key: <uuid>
```

`Idempotency-Key` 规则：

- 每次用户明确发起一次提交意图时生成一个 UUID。
- 同一个提交意图的网络重试必须复用同一个 `Idempotency-Key`。
- 请求超时、断网、客户端未收到响应时不要生成新 key，先用原 key 重试或查询申请列表。
- 用户修改申请资料后再次点击提交，才生成新的 key。
- key 建议保存到本地草稿，直到请求成功或用户明确放弃本次提交。

请求：

```json
{
  "company_name": "晴天装饰",
  "unified_social_credit_code": "91411525MA0000000X",
  "business_license_file_id": "uuid-from-direct-complete",
  "admin_name": "王总",
  "admin_phone": "13900139000",
  "sms_code": "123456",
  "visitor_context_id": "uuid",
  "company_location": {
    "province": "河南省",
    "city": "信阳市",
    "district": "固始县",
    "region_code": "411525",
    "address": "固始县示例路 1 号",
    "latitude": 32.0,
    "longitude": 115.6
  },
  "service_region_codes": ["411525"],
  "source_channel": "local_services",
  "privacy_policy_version": "2026-07-14",
  "onboarding_terms_version": "2026-07-14",
  "agree_privacy": true
}
```

合伙人二维码来源才使用：

```json
{
  "source_channel": "partner_invite",
  "invite_code": "CP-411500-0001"
}
```

本地服务商页来源必须使用 `source_channel=local_services`，不能传 `invite_code`。

成功响应：HTTP `202`

```json
{
  "data": {
    "application": {
      "id": "uuid",
      "application_no": "ZQ-20260714-ABC123",
      "company_name": "晴天装饰",
      "status": "submitted",
      "partner_assist_status": "not_applicable",
      "version": 1,
      "created_at": "2026-07-14T10:00:00.000Z",
      "updated_at": "2026-07-14T10:00:00.000Z"
    },
    "next_action": "wait_for_review",
    "estimated_review_hours": 48,
    "created": true,
    "idempotent": false
  }
}
```

重复使用同一个 `Idempotency-Key` 时返回同一申请，`created=false`、`idempotent=true`。小程序不能把旧即时创建租户接口的“入驻成功”文案套用到这个响应。这里的语义是“申请已提交，等待平台审核”。

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 展示字段错误 |
| 400 | `SMS_CODE_INVALID` | 验证码错误或过期 |
| 400 | `TENANT_ONBOARDING_INVITE_INVALID` | 合伙人邀请来源的邀请码无效，重新扫码 |
| 401 | `UNAUTHORIZED` | 重新获取 visitor 登录态 |
| 403 | `TENANT_ONBOARDING_DOCUMENT_FORBIDDEN` | 营业执照不属于当前 visitor、不是私有文件或不是 license 场景 |
| 404 | `TENANT_ONBOARDING_APPLICATION_NOT_FOUND` | 定位上下文不存在或不属于当前 visitor |
| 409 | `TENANT_ONBOARDING_APPLICATION_DUPLICATED` | 同一统一社会信用代码已有待处理申请，进入状态页或联系平台 |
| 409 | `TENANT_ONBOARDING_STATE_CONFLICT` | 版本变化，刷新详情 |

### 3. 我的申请列表

```http
GET /tenant-onboarding/applications/mine?page=1&pageSize=20
Authorization: Bearer <visitor_session token>
```

分页：默认 `20`，最大 `100`。

成功响应：

```json
{
  "data": {
    "list": [
      {
        "id": "uuid",
        "application_no": "ZQ-20260714-ABC123",
        "company_name": "晴天装饰",
        "status": "submitted",
        "partner_assist_status": "pending",
        "version": 2,
        "created_at": "2026-07-14T10:00:00.000Z",
        "updated_at": "2026-07-14T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### 4. 申请详情

```http
GET /tenant-onboarding/applications/:id
Authorization: Bearer <visitor_session token>
```

返回当前 visitor 自己的完整申请。用于状态页、补充资料页和轮询刷新。

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 重新登录 visitor |
| 404 | `TENANT_ONBOARDING_APPLICATION_NOT_FOUND` | 展示申请不存在或已不可访问 |

### 5. 补充资料

```http
PATCH /tenant-onboarding/applications/:id/supplement
Authorization: Bearer <visitor_session token>
```

请求只传平台要求补充的字段和当前 `version`，至少一个业务字段：

```json
{
  "version": 3,
  "company_name": "晴天装饰工程有限公司",
  "business_license_file_id": "new-private-file-id",
  "service_region_codes": ["411525"]
}
```

成功响应：返回更新后的申请，状态回到 `submitted`。

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 403 | `TENANT_ONBOARDING_DOCUMENT_FORBIDDEN` | 新营业执照文件不可用 |
| 409 | `TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED` | 当前状态不允许补充 |
| 409 | `TENANT_ONBOARDING_STATE_CONFLICT` | 版本变化，刷新详情 |

### 6. 撤回申请

```http
POST /tenant-onboarding/applications/:id/withdraw
Authorization: Bearer <visitor_session token>
```

请求：

```json
{
  "version": 2,
  "reason": "暂不申请"
}
```

可撤回状态：`submitted`、`reviewing`、`supplement_required`。成功响应返回更新后的申请，状态为 `withdrawn`。

## 状态与小程序动作

主申请状态：

| status | 小程序标签 | 可展示动作 |
| --- | --- | --- |
| `submitted` | 已提交，等待审核 | 查看详情、撤回 |
| `reviewing` | 平台审核中 | 查看详情、撤回 |
| `supplement_required` | 待补充资料 | 补充资料、撤回 |
| `approved` | 平台审核通过 | 查看详情，提示等待或前往装修公司登录 |
| `rejected` | 未通过 | 查看原因、重新发起申请 |
| `withdrawn` | 已撤回 | 查看记录、重新发起申请 |

协查状态必须独立展示：

| partner_assist_status | 小程序标签 | 展示要求 |
| --- | --- | --- |
| `not_applicable` | 无需协查 | 不强调 |
| `pending` | 城市合伙人协查中 | 只能作为辅助进度 |
| `verified` | 合伙人已核实 | 不能等同平台通过 |
| `supplement_suggested` | 合伙人建议补充 | 等平台发起补充后再让用户补资料 |
| `not_recommended` | 合伙人不建议 | 不能等同平台拒绝 |
| `expired` | 协查超时 | 不能等同平台拒绝 |

小程序端规则：

- 最终结果只看 `status`。
- `partner_assist_status` 不能展示为最终审批。
- 合伙人协查不能触发租户创建、不能改归因、不能直接拒绝申请。

## 字段映射

| 小程序字段 | 后端字段 | 说明 |
| --- | --- | --- |
| 公司名称 | `company_name` | 必填，最长 120 |
| 统一社会信用代码 | `unified_social_credit_code` | 18 位，自动大写 |
| 营业执照图片 | `business_license_file_id` | 私有直传返回 `file_id` |
| 负责人姓名 | `admin_name` | 审核通过后创建管理员员工 |
| 负责人手机号 | `admin_phone` | 用于短信验证码和管理员账号 |
| 验证码 | `sms_code` | `tenant_onboarding_application` 场景 |
| 定位上下文 | `visitor_context_id` | 来自 visitor 定位确认 |
| 公司地址 | `company_location.address` | 详细地址 |
| 地址区域码 | `company_location.region_code` | 6 位行政区代码 |
| 服务区域 | `service_region_codes` | 1 到 20 个 6 位行政区代码 |
| 来源 | `source_channel` | 本地服务入口填 `local_services` |
| 隐私版本 | `privacy_policy_version` | 小程序当前展示版本 |
| 入驻条款版本 | `onboarding_terms_version` | 小程序当前展示版本 |
| 同意勾选 | `agree_privacy` | 必须为 `true` |

## 合伙人端“装企协查”

认证：`platform_partner` token。接口只按 token 中的 `partner_id` 隔离数据，不接受小程序传 `partner_id`。

### 1. 协查列表

```http
GET /partner/onboarding-applications?page=1&pageSize=20&status=pending
Authorization: Bearer <platform_partner token>
```

分页：默认 `20`，最大 `100`。

成功响应字段：返回协查任务列表，管理员手机号已脱敏，例如 `139****9000`。

### 2. 协查详情

```http
GET /partner/onboarding-applications/:id
Authorization: Bearer <platform_partner token>
```

成功响应：返回该合伙人可见的协查任务详情。

### 3. 提交协查意见

```http
POST /partner/onboarding-applications/:id/assist-review
Authorization: Bearer <platform_partner token>
```

请求：

```json
{
  "version": 2,
  "decision": "verified",
  "remark": "已电话核实"
}
```

`decision` 可选：

- `verified`
- `supplement_suggested`
- `not_recommended`

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 合伙人重新登录 |
| 404 | `TENANT_ONBOARDING_APPLICATION_NOT_FOUND` | 任务不存在或不属于当前合伙人 |
| 409 | `TENANT_ONBOARDING_STATE_CONFLICT` | 任务已过期、已处理或版本变化 |

明确排除：

- 合伙人不能审批通过。
- 合伙人不能创建装修公司租户。
- 合伙人不能决定最终归因。
- 合伙人不能覆盖平台审核意见。

## 装修公司服务商资料接口

这些接口用于审核通过后的装修公司维护公开服务商资料，通常在装修公司后台或小程序装企端使用，不用于 visitor 申请页。

认证：`tenant_employee` token，且需要 `service_provider.profile.manage`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/tenant/service-provider-profile` | 获取公开资料 |
| PATCH | `/tenant/service-provider-profile` | 更新公开资料，必须传 `version` |
| GET | `/tenant/service-provider-areas?page=1&pageSize=20` | 服务区域列表 |
| POST | `/tenant/service-provider-areas` | 新增服务区域 |
| PATCH | `/tenant/service-provider-areas/:id` | 更新服务区域 |
| POST | `/tenant/service-provider-profile/submit` | 提交平台发布审核 |

服务区域列表分页：默认 `20`，最大 `100`。

资料状态：

| status | 小程序或后台标签 |
| --- | --- |
| `draft` | 草稿 |
| `pending_review` | 公开资料审核中 |
| `published` | 已公开展示 |
| `suspended` | 已暂停展示 |

稳定错误：

| HTTP | code | 处理 |
| --- | --- | --- |
| 403 | `FORBIDDEN` | 当前账号无权限 |
| 404 | `SERVICE_PROVIDER_PROFILE_NOT_FOUND` | 资料不存在 |
| 400 | `SERVICE_PROVIDER_PROFILE_INVALID` | 资料或服务区域不完整 |
| 409 | `SERVICE_PROVIDER_STATE_CONFLICT` | 版本或状态变化，刷新后重试 |

## 平台审核与发布接口

这些接口归 gooes admin 使用，orange 不直接调用，但小程序需要理解状态来源。

认证：平台管理员 token。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/platform/tenant-onboarding/applications?page=1&pageSize=20` | 申请审核列表 |
| GET | `/platform/tenant-onboarding/applications/:id` | 申请详情 |
| GET | `/platform/tenant-onboarding/applications/:id/reviews?page=1&pageSize=20` | 审核事件 |
| GET | `/platform/tenant-onboarding/applications/:id/notifications?page=1&pageSize=20` | 通知记录 |
| POST | `/platform/tenant-onboarding/applications/:id/license-access` | 获取营业执照短时签名 URL |
| POST | `/platform/tenant-onboarding/applications/:id/start-review` | 开始审核 |
| POST | `/platform/tenant-onboarding/applications/:id/request-partner-assist` | 请求城市合伙人协查 |
| POST | `/platform/tenant-onboarding/applications/:id/request-supplement` | 要求补充 |
| POST | `/platform/tenant-onboarding/applications/:id/approve` | 平台审核通过并创建租户 |
| POST | `/platform/tenant-onboarding/applications/:id/reject` | 平台拒绝 |
| POST | `/platform/tenant-onboarding/applications/:id/notifications/:deliveryId/retry` | 重试通知 |
| GET | `/platform/service-provider-publications?page=1&pageSize=20` | 服务商发布审核列表 |
| GET | `/platform/service-provider-publications/:tenantId` | 服务商发布详情 |
| GET | `/platform/service-provider-publications/:tenantId/areas?page=1&pageSize=20` | 服务区域 |
| POST | `/platform/service-provider-publications/:tenantId/publish` | 发布展示 |
| POST | `/platform/service-provider-publications/:tenantId/return-draft` | 退回草稿 |
| POST | `/platform/service-provider-publications/:tenantId/suspend` | 暂停展示 |

分页接口默认 `20`，最大 `100`。

平台审核通过后才会创建租户、管理员和默认模板，并插入服务商资料草稿。公开列表仍不会展示，直到租户维护资料并由平台执行发布。

## 旧即时入驻接口兼容

旧接口：

```http
POST /partner-onboarding/tenant-applications/send-code
POST /partner-onboarding/tenant-applications
```

只用于旧城市合伙人邀约页面。首发不配置 `LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_AT`，旧成功响应保持“创建租户成功”的结构，不返回新 `202 submitted` envelope。

新小程序全量可用后，发布负责人需要记录：

- 新小程序全量发布时间。
- `LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_AT` 配置值。
- 截止时间必须不晚于全量发布时间后 14 日。
- 旧入口下线和代码删除跟进人。

截止到达后：

```json
{
  "statusCode": 410,
  "code": "TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED",
  "message": "请升级小程序后重新申请"
}
```

小程序处理：提示“当前版本入驻入口已升级，请更新小程序后重新申请”，并跳转新本地服务商入驻入口。

## 加载、空态、错误和离线

- 本地服务商列表加载：骨架屏或轻量 loading，避免直接展示旧快照。
- 本地服务商空态：显示当前区域暂无公开服务商，并展示“成为服务商”。
- 定位缺失：先引导选择服务区域，不允许跨区域兜底。
- 申请提交中：禁用按钮，保存草稿和 `Idempotency-Key`。
- 网络超时：不要生成新 `Idempotency-Key`，提示用户重试或进入“我的申请”查询。
- 营业执照上传失败：保留表单草稿，允许重新选择图片；不要保存签名 URL。
- 410 升级错误：仅旧接口会出现，跳转新入口。
- 离线：表单允许本地草稿保存，但不能发送验证码、上传营业执照或提交申请。

## 埋点建议

| event | 触发点 | 关键属性 |
| --- | --- | --- |
| `local_service_provider_list_view` | 打开本地服务商页 | `adcode`、`provider_count`、`page` |
| `local_service_provider_empty` | 列表为空 | `adcode` |
| `service_provider_onboarding_cta_click` | 点击成为服务商 | `entry=visitor_local_services` |
| `tenant_onboarding_license_upload_start` | 开始营业执照上传 | `mime_type`、`size_bucket` |
| `tenant_onboarding_license_upload_success` | 完成私有登记 | `file_id_present=true` |
| `tenant_onboarding_sms_send` | 发送验证码 | `scene=tenant_onboarding_application` |
| `tenant_onboarding_submit` | 点击提交 | `source_channel`、`idempotency_key_reused` |
| `tenant_onboarding_submit_result` | 提交返回 | `status`、`created`、`idempotent`、`error_code` |
| `tenant_onboarding_status_view` | 查看状态页 | `status`、`partner_assist_status` |
| `tenant_onboarding_supplement_submit` | 补充资料 | `fields` |
| `tenant_onboarding_withdraw` | 撤回申请 | `status_before` |

埋点禁止记录手机号、统一社会信用代码、营业执照 URL、`object_key`、`upload_intent`、COS 签名参数。

## 文案建议

- 本地服务商 CTA：`成为服务商`
- 本地服务商空态：`当前区域暂无公开服务商`
- 空态说明：`如果你是本地装修公司，可以提交资料入驻，平台审核通过后展示给本地访客。`
- 提交按钮：`提交入驻申请`
- 提交成功：`申请已提交，平台将在审核后通知你`
- 补充资料：`平台需要你补充资料`
- 撤回确认：`撤回后本次申请不会继续审核，确认撤回吗？`
- 旧入口 410：`当前入驻入口已升级，请更新小程序后重新申请`
- 合伙人协查中：`城市合伙人正在协助核实资料，最终结果以平台审核为准`

## Smoke 矩阵

| 场景 | 预期 |
| --- | --- |
| 当前区域无发布服务商 | `GET /visitor/local-service-providers` 返回空列表，页面不展示跨区域公司，显示“成为服务商” |
| 当前区域有发布服务商 | 列表只展示覆盖定位区域的公司和公开资料 |
| 唯一合伙人覆盖服务区域 | 提交申请成功，后端记录候选合伙人，平台自动通过时可归因 |
| 多个同优先级合伙人覆盖 | 提交申请成功但不自动选择最终合伙人，平台审核时手动选择 |
| 统一社会信用代码重复 | 返回 `TENANT_ONBOARDING_APPLICATION_DUPLICATED`，提示查看已有申请 |
| 平台要求补充 | 状态为 `supplement_required`，小程序允许补充指定资料 |
| 平台通过 | 状态为 `approved`，创建租户但公开列表仍不展示 |
| 服务商资料发布 | 平台发布后，匹配区域 visitor 列表出现该服务商 |
| 禁止跨区域 | 其他城市或不在服务区域路径内的 visitor 收到空列表 |
| 重复提交同一 key | 第二次提交返回同一申请，`idempotent=true`，不会创建两条申请 |
| 旧入口截止 | 到 `LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_AT` 后旧接口返回 410，不发短信、不创建租户 |

## 归属矩阵

| 范围 | 负责人 |
| --- | --- |
| 后端 API、数据库 migration、状态机、错误码 | gooes |
| 管理后台平台审核和发布 | gooes |
| 小程序本地服务商页、成为服务商 CTA、申请表单、状态页 | orange |
| 小程序 API client、直传工具扩展、Idempotency-Key 本地保存 | orange |
| 城市合伙人协查页面 | orange |
| 发布窗口、旧入口截止配置、删除旧入口跟踪 | gooes 负责配置，orange 负责版本全量时间确认 |
