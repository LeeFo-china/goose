# 租户自定义品牌技术支持：后端批次 A 联调契约

日期：2026-07-27  
适用仓库：`gooes` 后端 / `orange` 小程序  
状态：Batch A 已部署 dev；2026-07-28 `support_text` 原样返回变更待部署与
新版租户隔离 smoke 验证

## 1. 联调信息

| 项目 | 当前值 |
| --- | --- |
| API Base URL | `https://api-dev.goodcms.cn` |
| 后端 Commit | `8734884ef2936100fe2783abb54dbbb858766eb2` |
| 有权益租户账号 | `19907270001`（`branding_batch_a_with`） |
| 无权益租户账号 | `19907270002`（`branding_batch_a_without`） |
| 平台联调账号 | `19900000001` |
| 平台品牌联调名称 | `品牌联调平台` |
| 有权益租户品牌联调名称 | `品牌联调有权益租户` |
| 凭证 | dev 登录接口使用空 `code`；token 按登录响应实时获取 |

Token 不写入仓库或本文档。使用上述手机号请求
`POST /admin/auth/login`，body 为 `{"phone":"...","code":""}`；
联调反馈只回传接口、HTTP、稳定错误码、`requestId` 和
脱敏后的必要字段。上述两个品牌名称是固定、非敏感的 fixture
canary；已按原文创建并发布，不使用真实客户品牌名称。
租户 smoke token 可直接取自现有 `POST /admin/auth/login` 的成功
响应，不要求 token 自身携带租户 claim。

本批次只包含平台/租户品牌、品牌权益、Logo 上传和有效品牌解析。

> Batch A has no addon product/order/payment/refund endpoint.

小程序不要调用或预埋增值商品、年度订单、微信支付、退款申请、
退款状态或退款执行接口。批次 B 才处理年度付费开通。现有积分充值
订单和积分流水语义没有变化。

## 2. 通用约定

### 2.1 鉴权和租户边界

- `GET /branding/effective` 公共可读；合法员工/客户 token 会使用
  服务端验证后的当前租户上下文。
- visitor、无 token、平台无租户上下文均解析为平台品牌。
- `/platform/...` 需要平台管理员身份和对应平台权限。
- `/tenant/...` 只从登录态 `AuthContext.tenantId` 取租户。
- 租户请求的 query/body 不接受 `tenant_id`；多传字段会返回
  `400 VALIDATION_ERROR`。
- 跨租户 Logo 与不存在的 Logo 统一返回
  `404 BRANDING_LOGO_FILE_NOT_FOUND`，不泄漏资源是否存在。

### 2.2 响应外层

成功响应：

```json
{
  "data": {},
  "message": "success"
}
```

业务错误：

```json
{
  "success": false,
  "message": "当前租户尚未开通自定义品牌权益",
  "code": "BRANDING_ENTITLEMENT_REQUIRED",
  "requestId": "req-uuid"
}
```

客户端逻辑以 HTTP 和稳定 `code` 为准，不解析中文 `message`。

### 2.3 核心对象

`effective` 精确为 7 个字段，不会返回内部文件 ID、权益原因、
购买历史或操作人：

```json
{
  "source": "tenant",
  "tenant_id": "10000000-0000-4000-8000-000000000001",
  "display_name": "晴天装饰",
  "logo_url": "https://cdn.example.com/tenant-logo.png",
  "support_text": "晴天装饰",
  "version": 4,
  "updated_at": "2026-07-27T10:00:00.000Z"
}
```

`support_text` 是只读兼容字段，值始终原样等于 `display_name`。
PATCH 请求不接受独立的 `support_text`，客户端也不得再次追加固定文本或将其
作为单独配置项。

管理接口中的 `profile`：

```json
{
  "display_name": "晴天装饰",
  "logo_file_id": "20000000-0000-4000-8000-000000000001",
  "logo_url": "https://cdn.example.com/tenant-logo.png",
  "status": "published",
  "version": 4,
  "published_version": 4,
  "has_unpublished_changes": false,
  "published_at": "2026-07-27T10:00:00.000Z",
  "updated_at": "2026-07-27T10:00:00.000Z"
}
```

没有资料时 `profile` 明确为 `null`。文件失效时管理接口仍返回
`logo_file_id`，但 `logo_url` 为 `null`。

租户品牌接口中的权益摘要精确为 4 个字段：

```json
{
  "code": "custom_support_branding",
  "status": "active",
  "expires_at": "2027-07-27T10:00:00.000Z",
  "version": 1
}
```

没有权益时 `entitlement` 明确为 `null`。

## 3. 12 个批次 A API

### 3.1 `GET /branding/effective`

鉴权：公共；可选 Bearer token。  
Query：严格为空；任意额外参数（包括 `tenant_id`）返回
`400 VALIDATION_ERROR`。
Body：GET 客户端不发送请求体；服务端不定义 body schema。
响应头：`Cache-Control: private, no-store`。

无权益、权益暂停/过期/撤销、租户非 active、租户品牌未发布或
Logo 文件异常时，均返回 `source=platform`：

```json
{
  "data": {
    "source": "platform",
    "tenant_id": null,
    "display_name": "字节跳动",
    "logo_url": "https://cdn.example.com/platform-logo.png",
    "support_text": "字节跳动",
    "version": 3,
    "updated_at": "2026-07-27T09:00:00.000Z"
  },
  "message": "success"
}
```

有效权益且租户已发布完整品牌时，`data` 使用 2.3 的 tenant 示例。
接口异常不应阻断业务页面；客户端还需保留本地平台默认兜底。

### 3.2 `GET /platform/branding`

鉴权：平台管理员 + `platform.branding.manage`。  
Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
Body：GET 客户端不发送请求体；服务端不定义 body schema。

```json
{
  "data": {
    "profile": null,
    "effective": {
      "source": "platform",
      "tenant_id": null,
      "display_name": "字节跳动",
      "logo_url": "https://cdn.example.com/platform-logo.png",
      "support_text": "字节跳动",
      "version": 0,
      "updated_at": "1970-01-01T00:00:00.000Z"
    }
  },
  "message": "success"
}
```

### 3.3 `PATCH /platform/branding`

鉴权：平台管理员 + `platform.branding.manage`。  
Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
用途：只保存草稿，不改变线上发布快照。

Body：

```json
{
  "display_name": "字节跳动",
  "logo_file_id": "20000000-0000-4000-8000-000000000010",
  "version": 0
}
```

- 第一次创建传 `version=0`。
- 后续传最近一次 GET/PATCH 返回的 `profile.version`。
- 名称 trim 后为 2–40 个 Unicode 字符，不能含控制字符或仅标点。
- 只接受 `logo_file_id`，不接受客户端提交 Logo URL。

响应：

```json
{
  "data": {
    "profile": {
      "display_name": "字节跳动",
      "logo_file_id": "20000000-0000-4000-8000-000000000010",
      "logo_url": "https://cdn.example.com/platform-logo.png",
      "status": "draft",
      "version": 1,
      "published_version": null,
      "has_unpublished_changes": true,
      "published_at": null,
      "updated_at": "2026-07-27T10:00:00.000Z"
    },
    "effective": {
      "source": "platform",
      "tenant_id": null,
      "display_name": "字节跳动",
      "logo_url": "https://cdn.example.com/previous-platform-logo.png",
      "support_text": "字节跳动",
      "version": 3,
      "updated_at": "2026-07-27T09:00:00.000Z"
    }
  },
  "message": "success"
}
```

### 3.4 `POST /platform/branding/publish`

鉴权：平台管理员 + `platform.branding.manage`。

Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
Body：

```json
{
  "version": 1
}
```

成功后 `profile.status=published`、`published_version=version`、
`has_unpublished_changes=false`，并返回同版本的 `effective`：

```json
{
  "data": {
    "profile": {
      "display_name": "字节跳动",
      "logo_file_id": "20000000-0000-4000-8000-000000000010",
      "logo_url": "https://cdn.example.com/platform-logo.png",
      "status": "published",
      "version": 1,
      "published_version": 1,
      "has_unpublished_changes": false,
      "published_at": "2026-07-27T10:01:00.000Z",
      "updated_at": "2026-07-27T10:01:00.000Z"
    },
    "effective": {
      "source": "platform",
      "tenant_id": null,
      "display_name": "字节跳动",
      "logo_url": "https://cdn.example.com/platform-logo.png",
      "support_text": "字节跳动",
      "version": 1,
      "updated_at": "2026-07-27T10:01:00.000Z"
    }
  },
  "message": "success"
}
```

### 3.5 `GET /platform/tenants/:id/entitlements`

鉴权：平台管理员 + `platform.tenant_entitlement.manage`。  
Query：`page=1&pageSize=20`，默认 1/20，`pageSize` 最大 100。  
除 `page/pageSize` 外任意额外参数返回 `400 VALIDATION_ERROR`。
Body：GET 客户端不发送请求体；服务端不定义 body schema。
`:id` 是平台管理员选择的目标租户 UUID。

```json
{
  "data": {
    "list": [
      {
        "id": "30000000-0000-4000-8000-000000000001",
        "tenant_id": "10000000-0000-4000-8000-000000000001",
        "code": "custom_support_branding",
        "status": "active",
        "starts_at": "2026-07-27T10:00:00.000Z",
        "expires_at": "2027-07-27T10:00:00.000Z",
        "source_type": "manual_grant",
        "source_id": null,
        "suspended_at": null,
        "suspend_reason": null,
        "version": 1,
        "updated_at": "2026-07-27T10:00:00.000Z"
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

### 3.6 `POST /platform/tenants/:id/entitlements/custom_support_branding/grant`

鉴权：平台管理员 + `platform.tenant_entitlement.manage`。

Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
Body：

```json
{
  "term_years": 1,
  "reason": "平台赠送一年品牌权益"
}
```

`term_years` 可省略，后端默认 `1`，允许 `1..10`。客户端不传
`expires_at`；数据库以当前时间加自然年计算必填到期时间。不存在时
创建；`expired/revoked` 时从当前时间重新授予；`active/suspended`
返回状态冲突。

动作成功统一返回：

```json
{
  "data": {
    "entitlement": {
      "id": "30000000-0000-4000-8000-000000000001",
      "tenant_id": "10000000-0000-4000-8000-000000000001",
      "code": "custom_support_branding",
      "status": "active",
      "starts_at": "2026-07-27T10:00:00.000Z",
      "expires_at": "2027-07-27T10:00:00.000Z",
      "source_type": "manual_grant",
      "source_id": null,
      "suspended_at": null,
      "suspend_reason": null,
      "version": 1,
      "updated_at": "2026-07-27T10:00:00.000Z"
    }
  },
  "message": "success"
}
```

### 3.7 `POST /platform/tenants/:id/entitlements/custom_support_branding/suspend`

鉴权：平台管理员 + `platform.tenant_entitlement.manage`。
Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
Body：

```json
{
  "version": 1,
  "reason": "品牌内容待核验"
}
```

只允许尚未过期的 `active`。成功响应沿用 3.6，状态变为
`suspended`，写入 `suspended_at/suspend_reason`，到期时间不变。

### 3.8 `POST /platform/tenants/:id/entitlements/custom_support_branding/resume`

鉴权：平台管理员 + `platform.tenant_entitlement.manage`。
Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
Body：

```json
{
  "version": 2,
  "reason": "品牌内容已核验"
}
```

只允许未过期的 `suspended`。成功响应沿用 3.6，状态变回
`active`、清空暂停字段；恢复绝不延长原 `expires_at`。

### 3.9 `POST /platform/tenants/:id/entitlements/custom_support_branding/revoke`

鉴权：平台管理员 + `platform.tenant_entitlement.manage`。
Query：严格为空；任意额外参数返回 `400 VALIDATION_ERROR`。
Body：

```json
{
  "version": 3,
  "reason": "租户主动终止服务",
  "confirm": true
}
```

只允许 `active/suspended`。必须显式 `confirm=true`。成功响应沿用
3.6，状态变为 `revoked`，保留原起止时间。

四种超管动作均由单个数据库事务原子写入：

- 当前权益；
- `tenant_entitlement_events` 事件；
- `platform_audit_logs` 平台审计。

### 3.10 `GET /tenant/branding`

鉴权：租户员工 + `brand.settings.read`。  
Query：严格为空；任意额外参数（包括 `tenant_id`）返回
`400 VALIDATION_ERROR`；租户 ID 只来自登录态。
Body：GET 客户端不发送请求体；服务端不定义 body schema。

```json
{
  "data": {
    "profile": null,
    "entitlement": {
      "code": "custom_support_branding",
      "status": "active",
      "expires_at": "2027-07-27T10:00:00.000Z",
      "version": 1
    },
    "can_customize": true,
    "effective": {
      "source": "platform",
      "tenant_id": null,
      "display_name": "字节跳动",
      "logo_url": "https://cdn.example.com/platform-logo.png",
      "support_text": "字节跳动",
      "version": 3,
      "updated_at": "2026-07-27T09:00:00.000Z"
    }
  },
  "message": "success"
}
```

`can_customize` 同时受更新权限和有效权益控制。无权益仍允许有读取
权限的员工读取，但返回 `entitlement=null`、`can_customize=false`。

### 3.11 `PATCH /tenant/branding`

鉴权：租户员工 + `brand.settings.update` + 当前有效权益。

Query：严格为空；任意额外参数（包括 `tenant_id`）返回
`400 VALIDATION_ERROR`。
Body：

```json
{
  "display_name": "晴天装饰",
  "logo_file_id": "20000000-0000-4000-8000-000000000001",
  "version": 0
}
```

字段和版本规则同平台 PATCH。`logo_file_id` 必须属于当前登录租户。
响应为：

```json
{
  "data": {
    "profile": {
      "display_name": "晴天装饰",
      "logo_file_id": "20000000-0000-4000-8000-000000000001",
      "logo_url": "https://cdn.example.com/tenant-logo.png",
      "status": "draft",
      "version": 1,
      "published_version": null,
      "has_unpublished_changes": true,
      "published_at": null,
      "updated_at": "2026-07-27T10:00:00.000Z"
    },
    "entitlement": {
      "code": "custom_support_branding",
      "status": "active",
      "expires_at": "2027-07-27T10:00:00.000Z",
      "version": 1
    },
    "can_customize": true,
    "effective": {
      "source": "platform",
      "tenant_id": null,
      "display_name": "字节跳动",
      "logo_url": "https://cdn.example.com/platform-logo.png",
      "support_text": "字节跳动",
      "version": 3,
      "updated_at": "2026-07-27T09:00:00.000Z"
    }
  },
  "message": "success"
}
```

保存草稿不会改变 `effective`。

### 3.12 `POST /tenant/branding/publish`

鉴权：租户员工 + `brand.settings.update` + 当前有效权益。

Query：严格为空；任意额外参数（包括 `tenant_id`）返回
`400 VALIDATION_ERROR`。
Body：

```json
{
  "version": 1
}
```

响应结构同 3.11。成功后 `profile.status=published`、
`published_version=version`、`has_unpublished_changes=false`，
`effective.source=tenant`。发布前会重新校验当前 Logo 文件。

## 4. `brand_logo` 直传契约

### 4.1 文件规则

- 格式：`image/jpeg`、`image/png`、`image/webp`。
- 声明和实际大小：`1..2097152` bytes（最大 2 MiB）。
- 实际宽、高都至少 128 px；建议 256×256 或更高。
- 宽高比：`0.8..1.25`；不支持动画图片。
- 文件必须是 `visibility=public`、`scene=brand_logo`、`status=active`。
- 平台路径：`public/brand-logo/YYYY/MM/DD/{uuid-v4}.{ext}`。
- 租户路径：
  `tenants/{AuthContext.tenantId}/brand-logo/YYYY/MM/DD/{uuid-v4}.{ext}`。

平台上传需要平台管理员 + `platform.branding.manage`；租户上传需要
租户员工 + `brand.settings.update` + 当前有效权益。客户和 visitor
不能上传。

### 4.2 第一步：初始化

```http
POST /uploads/cos/direct-init
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "scene": "brand_logo",
  "filename": "logo.png",
  "mimetype": "image/png",
  "size_bytes": 10152
}
```

```json
{
  "data": {
    "provider": "tencent_cos",
    "bucket": "bucket-name",
    "region": "ap-guangzhou",
    "object_key": "tenants/tenant-uuid/brand-logo/2026/07/27/file-uuid.png",
    "storage_path": "tenants/tenant-uuid/brand-logo/2026/07/27/file-uuid.png",
    "upload_url": "https://signed-cos-put-url",
    "method": "PUT",
    "headers": {
      "content-type": "image/png",
      "content-length": "10152",
      "x-cos-forbid-overwrite": "true"
    },
    "expires_in": 600,
    "expires_at": "2026-07-27T10:10:00.000Z",
    "upload_intent": "v1.<payload>.<signature>"
  },
  "message": "success"
}
```

### 4.3 第二步：PUT 到 COS

对 `upload_url` 执行 `PUT`，原样携带 init 返回的全部 `headers`，
body 为文件原始字节。不要携带 API Bearer token。记录响应 ETag，
且不要修改 init 返回的 `object_key`。相同对象禁止覆盖。

### 4.4 第三步：完成

```http
POST /uploads/cos/direct-complete
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "scene": "brand_logo",
  "filename": "logo.png",
  "mimetype": "image/png",
  "size_bytes": 10152,
  "object_key": "tenants/tenant-uuid/brand-logo/2026/07/27/file-uuid.png",
  "etag": "cos-response-etag",
  "upload_intent": "v1.<payload>.<signature>"
}
```

服务端会 HEAD 并以强 ETag 条件下载最多 2 MiB 的真实对象，解码验证
格式、帧数、尺寸和比例；只有通过后才创建可绑定文件记录。
`upload_intent` 必须原样回传。凭证绑定初始化时的租户范围、员工、
`object_key`、MIME、大小和过期时间；缺失、篡改、跨租户复用或过期
均在访问 COS 和写入文件记录前拒绝。

```json
{
  "data": {
    "url": "https://cdn.example.com/tenants/.../file-uuid.png",
    "path": "tenants/tenant-uuid/brand-logo/2026/07/27/file-uuid.png",
    "file_id": "20000000-0000-4000-8000-000000000001",
    "provider": "tencent_cos",
    "bucket": "bucket-name",
    "region": "ap-guangzhou",
    "object_key": "tenants/tenant-uuid/brand-logo/2026/07/27/file-uuid.png",
    "storage_path": "tenants/tenant-uuid/brand-logo/2026/07/27/file-uuid.png",
    "public_url": "https://cdn.example.com/tenants/.../file-uuid.png"
  },
  "message": "success"
}
```

品牌 PATCH 只提交这里的 `file_id`，不提交 `public_url`。

## 5. 权限初始化

批次 A 只新增：

| 权限 | 默认角色 |
| --- | --- |
| `platform.branding.manage` | 平台 `platform_admin` |
| `platform.tenant_entitlement.manage` | 平台 `platform_admin` |
| `brand.settings.read` | 租户 `system_admin` |
| `brand.settings.update` | 租户 `system_admin` |

权限决定员工能否操作；权益决定租户能否使用。两者不能互相替代。
`GET /branding/effective` 不要求业务权限。

## 6. 权益状态机与并发

| 动作 | 允许前态 | 结果 | 到期时间 |
| --- | --- | --- | --- |
| grant | 不存在 | active | now + `term_years` 自然年 |
| grant | expired/revoked | active | 从 now 重新计算 |
| suspend | 未过期 active | suspended | 不变 |
| resume | 未过期 suspended | active | 不变，不补暂停时间 |
| revoke | active/suspended | revoked | 保留 |

- grant 到 active/suspended 必须失败，不隐式续期或恢复。
- 所有非 grant 动作必须传当前 `version`。
- 版本过期返回 `409 TENANT_ENTITLEMENT_VERSION_CONFLICT`。
- 非法前态返回 `409 TENANT_ENTITLEMENT_STATE_CONFLICT`。
- 客户端操作后重新 GET，以最新状态和版本为准。
- 批次 A 没有手动续费 API。

## 7. 稳定业务错误码

| HTTP | code | 客户端处理 |
| --- | --- | --- |
| 403 | `BRANDING_ENTITLEMENT_REQUIRED` | 无权益，表单只读 |
| 403 | `BRANDING_ENTITLEMENT_SUSPENDED` | 已暂停，回退平台品牌 |
| 403/409 | `BRANDING_ENTITLEMENT_EXPIRED` | 已过期；恢复动作时为冲突 |
| 403 | `BRANDING_ENTITLEMENT_REVOKED` | 已撤销，回退平台品牌 |
| 409 | `BRANDING_PROFILE_VERSION_CONFLICT` | 刷新 profile 后再编辑 |
| 400 | `BRANDING_PROFILE_INCOMPLETE` | 补全名称和 Logo 后发布 |
| 404 | `BRANDING_LOGO_FILE_NOT_FOUND` | 文件不存在或不属于当前作用域 |
| 400 | `BRANDING_LOGO_FILE_INVALID` | 文件 scene/状态/MIME/尺寸等无效 |
| 400 | `VALIDATION_ERROR` | Logo 完成请求缺少 `upload_intent` |
| 400 | `FILE_STORAGE_UPLOAD_FAILED` | Logo 上传凭证无效、篡改或过期 |
| 404 | `TENANT_ENTITLEMENT_NOT_FOUND` | 目标权益不存在 |
| 409 | `TENANT_ENTITLEMENT_VERSION_CONFLICT` | 刷新权益版本 |
| 409 | `TENANT_ENTITLEMENT_STATE_CONFLICT` | 刷新并按状态机选择动作 |

请求格式错误仍返回 `400 VALIDATION_ERROR`；未登录/无权限使用项目
通用 401/403 错误。

## 8. 回退、缓存和兼容边界

有效品牌只读取发布快照；PATCH 后未 publish 的草稿不会影响展示。
以下任一条件成立时立即回退平台品牌：

- 无权益、暂停、过期或撤销；
- 租户非 active；
- 租户品牌未发布或发布快照不完整；
- 当前发布 Logo 文件失效、越权或 URL 异常。

平台资料也异常时，服务端使用受控代码默认。部署配置有效的
`BRANDING_FALLBACK_LOGO_URL` 后，正常兜底 `logo_url` 是 HTTPS URL；
配置缺失/非法时最后兜底可能是
`data:image/png;base64,...`（内置 256×256 PNG）。Orange 的图片层需
兼容 data URI；若运行环境不支持或图片加载失败，再使用小程序本地
平台 Logo。不要把 data URI 写回品牌资料。

客户端建议：

- 品牌请求失败不阻断业务页面、不弹业务错误；
- 显式 props > 当前有效品牌 > 小程序本地平台默认；
- 身份/租户切换和退出时先清品牌状态，避免闪现上一租户；
- 后端返回 `private, no-store`，批次 A 不做跨身份持久缓存；
- 旧小程序不调用新接口时继续展示本地品牌，业务不受影响。

## 9. Orange 接入清单

后端 Task 12 smoke 通过后，Orange 团队再修改自己的仓库：

1. 新增 `src/services/branding.ts`、`src/store/branding.ts`、
   `src/types/api/branding.d.ts`。
2. `BrandAttribution` 保留 `logoSrc/text` 显式覆盖，默认读取
   effective brand，并保留本地失败兜底。
3. 员工 bootstrap 后和客户选定租户后加载 effective；身份切换、
   租户切换、退出登录时清理。
4. 新增品牌设置页；入口受 `brand.settings.read` 控制，
   `can_customize=false` 时只读。
5. 上传严格执行 direct-init → COS PUT → direct-complete；init 200
   必须检查非空 `upload_intent`，否则立即中止，complete 时原样回传，
   最后再把 `file_id` 用于 PATCH。
6. 保存成功仅更新草稿态；发布成功后重新 GET
   `/branding/effective`。
7. 平台入口/visitor 页面显式使用平台品牌，不能复用上一租户状态。
8. 不传 `tenant_id`，不提交任意 Logo URL，不读取内部权益事件。
9. 不接入任何批次 B 商品、订单、支付或退款能力。

首轮 UI smoke：

- 无 token、visitor、平台入口显示平台品牌；
- 有权益员工显示本租户已发布品牌；
- 无权益/暂停/过期/撤销均显示平台品牌；
- 草稿保存后展示品牌不变，发布后刷新生效；
- A/B 租户切换时不短暂显示另一租户品牌；
- 有权益租户不能绑定非本租户 Logo；本轮 dev fixture 使用平台
  Logo 验证，页面只显示稳定 404 业务提示；
- 版本冲突后刷新，不覆盖其他管理员的修改；
- 图片加载失败不影响业务页面；
- 退出登录立即恢复本地平台品牌。

## 10. 后端验收证据

| 验证项 | 证据 |
| --- | --- |
| migration Local/Remote 对齐 | [plan run 30270041769](https://github.com/LeeFo-china/goose/actions/runs/30270041769)：远端 373 条，latest `20260727120000`，pending `0` |
| Batch A migration 应用 | [apply run 30268241457](https://github.com/LeeFo-china/goose/actions/runs/30268241457)：只应用 `20260727120000` |
| 定向单元/路由测试 | Batch A focused 303 pass / 0 fail / 1154 expect；branding routes 9 pass / 0 fail / 60 expect；共享迁移契约 5 pass / 0 fail / 19 expect |
| typecheck/build/file-size | `api:typecheck`、`api:build`、permission boundaries、API/Admin file-size 全部通过 |
| 真实 Logo 上传 | 平台和有权益租户各 complete 成功；相同 key 第二次 PUT 均返回 409 |
| 有/无权益账号 smoke | 本机 13 pass / 0 fail；dev 远程 13 pass / 0 fail |
| 跨作用域 Logo 404 | 租户绑定平台 Logo 时，dev 返回 `404 BRANDING_LOGO_FILE_NOT_FOUND`，响应未泄漏文件或租户 ID |
| 部署健康检查 | [Release Dev 30270087844](https://github.com/LeeFo-china/goose/actions/runs/30270087844)：`gooes-api-dev` running / healthy，revision `8734884ef2936100fe2783abb54dbbb858766eb2` |

自动隔离 smoke：

```bash
BRANDING_API_BASE_URL=https://api-dev.goodcms.cn \
BRANDING_PLATFORM_TOKEN='<secret>' \
BRANDING_TENANT_WITH_ENTITLEMENT_TOKEN='<secret>' \
BRANDING_TENANT_WITHOUT_ENTITLEMENT_TOKEN='<secret>' \
BRANDING_FOREIGN_FILE_ID='<uuid not owned by the entitled tenant>' \
bun scripts/verify-branding-tenant-isolation.ts
```

脚本只输出 tenant 标签、HTTP、稳定 code、`request_id` 和汇总，不
输出 token、Authorization header 或完整响应体。远程 API 地址必须
使用 HTTPS；HTTP 只允许 `127.0.0.1`、`localhost` 或 `[::1]`。
每次请求固定 15 秒超时，响应体通过 `Content-Length` 和实际流读取
双重限制为最大 1 MiB。

脚本首先分别使用有权益和无权益 token 请求
`GET /admin/auth/me`，从服务端已认证响应的 `data.tenant.id`
严格读取 canonical UUID，并确认两个 token 属于不同租户；不解码
或信任 token claim。两次身份检查均计入 smoke 检查和安全 marker，
但响应体、token 和租户 ID 均不会输出。获取两个租户 ID 后，后续
响应才启用跨租户 ID 泄漏扫描；平台权益列表的目标租户也使用
`/admin/auth/me` 返回的有权益租户 ID。完整正常流程共 13 项检查。

两条 PATCH 都固定使用不可用的哨兵版本
`version=2147483647`，绝不读取或提交当前资料版本。正常业务门禁会
分别在持久化前以无权益 403、跨作用域文件 404 终止；即使门禁发生
回归，保存 RPC 也会因版本不匹配或版本递增越界而回滚，不能写入
品牌资料，因此可安全重复执行。

隔离 fixture 还会严格校验响应字段集合：有权益租户必须返回已发布
profile、active entitlement、`can_customize=true` 和本租户
effective；无权益租户必须返回 null profile/entitlement、
`can_customize=false` 和平台 effective；平台 fixture 必须已有
已发布 profile。平台 profile/display 必须使用 `品牌联调平台`，
有权益租户必须使用 `品牌联调有权益租户`；两者都必须无未发布
变更，且 effective 的名称、Logo、版本必须与已发布快照一致，
`support_text` 必须原样等于 `display_name`。结构合法但属于第三租户的品牌
资料也不能通过。错误响应缺少安全的非空 `request_id`
时整项失败。

仓库边界：本文档和 Batch A 代码只写入 `gooes`；Orange 原始契约和
现有组件仅做只读核对，本次未修改 Orange。
