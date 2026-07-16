# 本地服务商页装企主动入驻小程序联调说明

日期：2026-07-15  
后端仓库：`/Users/leefo/Public/work/gooes`  
小程序仓库：`/Users/leefo/Public/work/orange`（本次只读检查，未修改）

## 结论

后端“本地服务商页 → 成为服务商 → 装企主动入驻申请”主链路已经可联调。

小程序端可以按现有 `TenantOnboardingService` 继续接入，重点确认页面串联、错误提示、幂等键保留和营业执照私有上传。后端已验证两种归因结果：

1. 当前服务区域没有匹配城市合伙人：申请进入平台审核，`partner_assist_status=not_applicable`。
2. 当前服务区域被 active 城市合伙人覆盖：申请进入平台审核，同时生成城市合伙人协查候选，`partner_assist_status=pending`。

## 本次只读检查的小程序文件

- `/Users/leefo/Public/work/orange/src/services/tenant_onboarding.ts`
- `/Users/leefo/Public/work/orange/src/packageVisitor/pages/visitor-local-services/index.tsx`
- `/Users/leefo/Public/work/orange/src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingController.ts`
- `/Users/leefo/Public/work/orange/src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingLicenseUpload.ts`
- `/Users/leefo/Public/work/orange/src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingIdempotency.ts`
- `/Users/leefo/Public/work/orange/docs/2026-07-15-local-service-provider-onboarding-backend-message.md`

当前 orange 已具备：

- `GET /visitor/local-service-providers` 服务封装。
- `POST /tenant-onboarding/applications/send-code` 服务封装。
- `POST /tenant-onboarding/applications` 服务封装，并传 `Idempotency-Key`。
- `GET /tenant-onboarding/applications/mine` 服务封装。
- 本地服务商页空态和非空列表底部都有“成为服务商”入口。
- 入驻页本地服务模式会读取 visitor 当前定位上下文，并使用 `source_channel=local_services` 提交。
- 营业执照上传使用 `scene=tenant_onboarding_license` 的 COS 直传封装。

## 小程序端调用顺序

### 1. 进入本地服务商页

```http
GET /visitor/location-context
Authorization: Bearer <visitor_session>
```

用于展示当前服务区域。

```http
GET /visitor/local-service-providers?page=1&pageSize=20
Authorization: Bearer <visitor_session>
```

后端规则：

- 只按 visitor 最新有效定位上下文匹配。
- 只返回覆盖当前定位区域的已发布服务商。
- 没有匹配时返回空列表，不跨区域兜底。
- 分页默认 `page=1&pageSize=20`，最大 `pageSize=100`。

### 2. 点击“成为服务商”

跳转：

```text
/packageVisitor/pages/tenant-onboarding/index?source=local_services
```

入驻页需要已有 visitor 定位上下文。如果没有 `context_id` 或 `adcode`，应提示用户先回访客首页选择服务区域。

### 3. 上传营业执照

营业执照必须私有上传，不使用公开 URL。

```http
POST /uploads/cos/direct-init
Authorization: Bearer <visitor_session>
```

请求关键字段：

```json
{
  "scene": "tenant_onboarding_license",
  "filename": "license.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 102400
}
```

然后小程序使用后端返回的签名 URL `PUT` 到 COS。

完成登记：

```http
POST /uploads/cos/direct-complete
Authorization: Bearer <visitor_session>
```

小程序提交申请时只使用返回的 `file_id`，不要持久化或透出 `upload_url`、`object_key`、`upload_intent`。

### 4. 发送验证码

```http
POST /tenant-onboarding/applications/send-code
Authorization: Bearer <visitor_session>
```

请求：

```json
{
  "phone": "13900139000"
}
```

成功：

```json
{
  "data": {
    "success": true,
    "cooldown_seconds": 60
  },
  "message": "success"
}
```

### 5. 提交申请

```http
POST /tenant-onboarding/applications
Authorization: Bearer <visitor_session>
Idempotency-Key: <uuid-v4>
```

请求：

```json
{
  "company_name": "晴天装饰",
  "unified_social_credit_code": "91411525MA9G000000",
  "business_license_file_id": "uuid-from-direct-complete",
  "admin_name": "王总",
  "admin_phone": "13900139000",
  "sms_code": "123456",
  "visitor_context_id": "uuid-from-location-context",
  "company_location": {
    "province": "河南省",
    "city": "信阳市",
    "district": "固始县",
    "region_code": "411525",
    "address": "固始县示例路 1 号",
    "latitude": 32.168,
    "longitude": 115.654
  },
  "service_region_codes": ["411525"],
  "source_channel": "local_services",
  "privacy_policy_version": "2026.07",
  "onboarding_terms_version": "2026.07",
  "agree_privacy": true
}
```

本地服务商入口要求：

- 固定 `source_channel=local_services`。
- 不传 `invite_code`。
- `service_region_codes` 当前可先传 1 个当前定位/选择区域，后续如果支持多服务区域再扩展。
- `Idempotency-Key` 在一次提交完成前必须保持稳定，网络重试不能重新生成。
- 成功响应 HTTP 状态码是 `202`，语义是“申请已提交，等待审核”，不是“已入驻成功”。

成功响应关键字段：

```json
{
  "data": {
    "application": {
      "id": "uuid",
      "application_no": "ZQ-20260715-CPVQL2",
      "company_name": "晴天装饰",
      "status": "submitted",
      "partner_assist_status": "pending",
      "version": 1,
      "created_at": "2026-07-15T06:04:13.074609+00:00",
      "updated_at": "2026-07-15T06:04:13.074609+00:00"
    },
    "next_action": "wait_for_review",
    "estimated_review_hours": 48,
    "created": true,
    "idempotent": false
  },
  "message": "success"
}
```

重复提交同一个 `Idempotency-Key` 时：

```json
{
  "data": {
    "created": false,
    "idempotent": true
  }
}
```

小程序应继续展示同一条申请已提交，不要提示重复申请。

## 状态展示建议

申请最终状态只看 `status`：

| status | 小程序文案 |
| --- | --- |
| `submitted` | 申请已提交，等待平台审核 |
| `reviewing` | 平台审核中 |
| `supplement_required` | 需要补充资料 |
| `approved` | 审核通过 |
| `rejected` | 审核未通过 |
| `withdrawn` | 已撤回 |

`partner_assist_status` 只表示城市合伙人协查进度，不是最终审核结论：

| partner_assist_status | 小程序文案 |
| --- | --- |
| `not_applicable` | 无需城市合伙人协查 |
| `pending` | 城市合伙人协查中 |
| `verified` | 城市合伙人已核实 |
| `supplement_suggested` | 城市合伙人建议补充资料 |
| `not_recommended` | 城市合伙人不建议通过 |
| `expired` | 城市合伙人协查超时 |

小程序不要把 `partner_assist_status=verified` 展示为平台审核通过。最终通过只能由 `status=approved` 表示。

## 后端 smoke 结果

### 场景 A：无城市合伙人匹配

- 定位区域：`330106`
- 申请 ID：`dbc5440e-7b2a-4c80-9731-12a75885dfe1`
- HTTP：首次提交 `202`
- 重复提交：同一 `Idempotency-Key` 返回同一申请，`created=false`，`idempotent=true`
- DB 核验：
  - `status=submitted`
  - `source_channel=local_services`
  - `service_region_codes=["330106"]`
  - `candidate_partner_id=null`
  - `candidate_match_reason=no_eligible_partner`
  - `partner_assist_status=not_applicable`
  - `idempotency_count=1`

### 场景 B：有城市合伙人匹配

- active 城市合伙人：`b4b7517c-9db2-4d5e-bac8-80ffd6725bd0`
- 城市合伙人覆盖区域：`411500`
- 申请服务区域：`411525`
- 申请 ID：`04659e6f-694f-4b9e-bfdc-5d1244491e70`
- 申请编号：`ZQ-20260715-CPVQL2`
- HTTP：首次提交 `202`
- 重复提交：同一 `Idempotency-Key` 返回同一申请，`created=false`，`idempotent=true`
- DB 核验：
  - `status=submitted`
  - `source_channel=local_services`
  - `service_region_codes=["411525"]`
  - `candidate_partner_id=b4b7517c-9db2-4d5e-bac8-80ffd6725bd0`
  - `candidate_match_reason=region`
  - `partner_assist_status=pending`
  - `partner_assist_requested_at` 有值
  - `partner_assist_due_at` 有值
  - `idempotency_count=1`

### 场景 C：平台审核通过并自动归因城市合伙人

- 平台审核员：`Dev 超级管理员`
- 审核申请 ID：`04659e6f-694f-4b9e-bfdc-5d1244491e70`
- `GET /platform/tenant-onboarding/applications`：返回该 `submitted` 申请
- `POST /platform/tenant-onboarding/applications/:id/start-review`：HTTP `200`
  - 审核后状态：`reviewing`
  - 版本：`2`
- `POST /platform/tenant-onboarding/applications/:id/approve`：HTTP `200`
  - 审核模式：`attribution_mode=auto`
  - 审核结果：`approved`
  - 版本：`3`
- 审核通过后创建的数据：
  - 租户 ID：`f3ada63b-0e99-449f-bd7a-321e434bbae4`
  - 租户状态：`active`
  - 负责人/管理员员工 ID：`063c2bc8-9083-4785-98b2-a7a88c369e77`
  - 城市合伙人绑定 ID：`ce2ef28e-364d-4bf1-8a93-7d884e9a4217`
  - 服务商 profile ID：`36638cf0-ecbc-4af3-8b96-e77ab3f9e058`
  - 服务区域：`411525`
- DB 核验：
  - `status=approved`
  - `converted_tenant_id=f3ada63b-0e99-449f-bd7a-321e434bbae4`
  - `final_partner_id=b4b7517c-9db2-4d5e-bac8-80ffd6725bd0`
  - `attribution_source_type=region_auto_assignment`
  - `tenant_partner_bindings.status=active`
  - `tenant_partner_bindings.source_type=region_auto_assignment`
  - `tenant_service_provider_profiles.status=draft`
  - `tenant_service_areas.status=inactive`

### 场景 D：服务商公开资料发布后 visitor 本地服务商列表可见

- 测试租户 ID：`f3ada63b-0e99-449f-bd7a-321e434bbae4`
- 服务商 profile ID：`36638cf0-ecbc-4af3-8b96-e77ab3f9e058`
- 服务区域 ID：`189f276d-a244-45a1-b18c-9c39d6a84426`
- 服务区域：`411525`
- 发布前可见性：
  - profile 状态：`draft`
  - 服务区域状态：`inactive`
  - visitor 定位 `411525` 调用 `GET /visitor/local-service-providers`：不返回该服务商
- 租户侧资料发布准备：
  - 调用 `update_tenant_service_provider_profile` 补齐 `public_phone/introduction/address`
  - 调用 `upsert_tenant_service_provider_area` 确认区域 `411525`
  - 调用 `submit_tenant_service_provider_profile`
  - profile 状态变为 `pending_review`
  - visitor 定位 `411525`：仍不返回该服务商
- 平台发布：
  - `GET /platform/service-provider-publications?status=pending_review`：能看到该租户
  - `GET /platform/service-provider-publications/:tenantId`：返回 `pending_review/version=4`
  - `GET /platform/service-provider-publications/:tenantId/areas`：返回 1 个服务区域
  - `POST /platform/service-provider-publications/:tenantId/publish`：HTTP `200`
  - profile 状态变为 `published/version=5`
  - 服务区域状态变为 `active`
- visitor 可见性：
  - visitor 定位 `411525`：返回该服务商，`matched_region_code=411525`
  - visitor 定位 `330106`：不返回该服务商
- 返回给小程序的服务商字段包含：
  - `tenant_id=f3ada63b-0e99-449f-bd7a-321e434bbae4`
  - `public_name=合伙人匹配Smoke装饰445654`
  - `public_phone=13900000002`
  - `address_region_code=411525`
  - `address_latitude=32.168`
  - `address_longitude=115.654`
  - `matched_region_code=411525`

### 场景 E：服务商发布状态负向可见性

执行日期：2026-07-17

说明：当前 smoke 测试租户管理员员工 `063c2bc8-9083-4785-98b2-a7a88c369e77` 尚未绑定 `user_id`，无法生成正常租户登录态；因此租户侧资料编辑/提交步骤使用 service-role RPC 验证状态机，平台审核和 visitor 可见性均走 HTTP API。

- 起始状态：
  - profile 状态：`published/version=5`
  - 服务区域：`411525`
  - 服务区域状态：`active`
  - visitor 定位 `411525`：返回该服务商
  - visitor 定位 `330106`：不返回该服务商
- 平台暂停展示：
  - `POST /platform/service-provider-publications/:tenantId/suspend`：HTTP `200`
  - profile 状态：`suspended/version=6`
  - 服务区域状态：`inactive`
  - visitor 定位 `411525`：不返回该服务商
- 暂停后恢复发布：
  - 租户侧核心资料重新进入 `pending_review`
  - `POST /platform/service-provider-publications/:tenantId/publish`：HTTP `200`
  - profile 状态：`published/version=8`
  - 服务区域状态：`active`
  - visitor 定位 `411525`：重新返回该服务商
- 核心资料变更待审：
  - profile 状态：`pending_review/version=9`
  - 服务区域状态：`inactive`
  - visitor 定位 `411525`：不返回该服务商
- 平台退回草稿：
  - `POST /platform/service-provider-publications/:tenantId/return-draft`：HTTP `200`
  - profile 状态：`draft/version=10`
  - 服务区域状态：`inactive`
  - visitor 定位 `411525`：不返回该服务商
- 最终恢复：
  - profile 状态：`published/version=12`
  - 服务区域状态：`active`
  - visitor 定位 `411525`：返回该服务商
  - visitor 定位 `330106`：不返回该服务商

结论：`GET /visitor/local-service-providers` 只展示 `published + active area` 的服务商；`draft`、`pending_review`、`suspended` 均不会展示，也不会跨区域兜底。

### 场景 F：装企入驻申请负向校验

执行日期：2026-07-17

测试访客：`smoke-visitor-license-write`

- 缺少 `Idempotency-Key`
  - `POST /tenant-onboarding/applications`
  - HTTP `400`
  - `code=VALIDATION_ERROR`
  - message 包含：`缺少有效的 Idempotency-Key`
- 本地服务来源携带邀请码
  - `source_channel=local_services`
  - `invite_code=INVITE123`
  - HTTP `400`
  - `code=VALIDATION_ERROR`
  - message/details 包含：`本地服务来源不能使用邀请码`
- 验证码错误
  - HTTP `400`
  - `code=SMS_CODE_INVALID`
- 统一社会信用代码存在待处理申请
  - 使用已有 `submitted` 申请主体：`91330106MA9G854833`
  - HTTP `409`
  - `code=TENANT_ONBOARDING_APPLICATION_DUPLICATED`
- 营业执照文件不可用或不归属当前访客
  - 使用不存在/非当前访客归属的 `business_license_file_id`
  - HTTP `403`
  - `code=TENANT_ONBOARDING_DOCUMENT_FORBIDDEN`

结论：小程序端应按以上错误码做可恢复提示；这些错误不会创建新的入驻申请。测试中临时插入的短信验证码记录已清理。

### 营业执照私有上传 smoke

- 文件 ID：`1025146c-703d-42cb-a9bd-e936ea08cb33`
- `scene=tenant_onboarding_license`
- `visibility=private`
- `owner_type=visitor`
- `status=active`
- `public_url=null`

## 小程序端需要确认的点

1. 本地服务商页进入入驻页前，用户必须已有 visitor 定位上下文；没有则先引导选择区域。
2. 本地服务入口只走新接口，不走旧 `partner-onboarding/tenant-applications`。
3. 入驻页提交成功后展示“申请已提交，等待平台审核”，不要展示“入驻成功”。
4. 如果返回 `partner_assist_status=pending`，可以辅助展示“城市合伙人协查中”，但仍以平台审核为准。
5. 统一社会信用代码重复、验证码错误、营业执照不可用、缺少幂等键时，按后端错误码展示可恢复提示。
6. `GET /tenant-onboarding/applications/mine?page=1&pageSize=20` 可用于“我的入驻申请”列表，必须分页。

## 推荐联调验收清单

1. 当前定位区域无公开服务商：本地服务商列表为空，展示“成为服务商”入口。
2. 当前定位区域有公开服务商：只展示覆盖当前定位区域的服务商，不展示跨区域服务商。
3. 本地服务商页点击“成为服务商”：进入 `/packageVisitor/pages/tenant-onboarding/index?source=local_services`。
4. 未选择定位区域直接进入入驻页：提示先选择服务区域。
5. 营业执照上传成功后，表单保存 `business_license_file_id`。
6. 发送验证码成功后进入倒计时。
7. 提交成功返回 `202` 后，展示“申请已提交，等待平台审核”。
8. 网络重试同一 `Idempotency-Key`，页面保持同一申请成功态，不重复创建。
9. 城市合伙人覆盖区域提交后，展示平台审核中；如果展示协查进度，文案使用“城市合伙人协查中”。
10. 小程序仓库修改完成后，跑 `npm run build:weapp` 做构建验证。

## 后端后续建议

平台审核通过后，服务商公开资料仍是 `draft`，服务区域仍是 `inactive`。这是后端当前设计：入驻通过只完成租户初始化和服务商资料草稿创建，不会自动发布到 visitor 本地服务商列表。

本轮已验证发布链路。后续建议补充以下负向和回归场景：

1. `pending_review` 未发布时，visitor 列表始终不可见。
2. 平台退回 `return-draft` 后，服务区域应回到 `inactive`，visitor 不可见。
3. 平台暂停 `suspend` 后，服务区域应回到 `inactive`，visitor 不可见。
4. 小程序端完成后，用真机验证导航坐标和服务商列表 UI。
