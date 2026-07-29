# 装企入驻营业执照 OCR 后端联调交付

日期：2026-07-29

状态：Gooes dev 已发布并开启专项开关，Orange 可以开始接入

## 1. 发布结论

- Gooes `main` 实现提交：`a1693ace`（此前完整实现提交范围：
  `20242565..9e284d46`）。
- `@gooes/domain` 版本：`1.13.0`。
- dev API：`http://127.0.0.1:3000` 对应的 `local.gooes.api` 已重启。
- dev 数据库 migration `20260729120000` 已应用，Local/Remote 对齐。
- dev 专项开关 `TENCENT_OCR_TENANT_ONBOARDING_ENABLED=true`。
- 生产默认值仍由 migration 保持为 `false`，dev 联调通过前不要在生产开启。
- Orange 仓库在本次交付中保持只读，没有修改、格式化、生成、提交或推送任何文件。

## 2. 最终接口

三个接口均只接受：

```http
Authorization: Bearer <visitor_session>
```

接口路径：

```text
GET  /tenant-onboarding/ocr/capabilities
POST /tenant-onboarding/ocr/recognitions
GET  /tenant-onboarding/ocr/recognitions/:id
```

未携带 token、员工 token、customer token 或不受支持的 token 类型均不能当作
visitor OCR 身份。

### 2.1 Capability

```http
GET /tenant-onboarding/ocr/capabilities
```

dev 当前真实响应的脱敏结构：

```json
{
  "data": [
    {
      "scene": "tenant_onboarding_license",
      "document_type": "business_license",
      "label": "识别营业执照",
      "attachment_categories": ["tenant_onboarding_license"],
      "supported_mime_types": ["image/jpeg", "image/png"],
      "max_size_bytes": 5242880,
      "mode": "sync",
      "output_fields": [
        "license_name",
        "license_code",
        "license_address",
        "license_period_begin",
        "license_period_end",
        "legal_representative_name"
      ]
    }
  ],
  "message": "success"
}
```

总开关、专项开关、腾讯凭证或结果加密密钥不可用时，接口返回
HTTP 200 和 `data=[]`。

### 2.2 创建识别

```http
POST /tenant-onboarding/ocr/recognitions
Content-Type: application/json
```

请求体只允许两个 UUID 字段：

```json
{
  "file_object_id": "direct-complete 返回的 file_id",
  "idempotency_key": "客户端生成并在同一次重试中复用的 UUID v4"
}
```

`scene`、`document_type` 和 provider action 均由服务端固定，客户端不能传入。

成功响应：

```json
{
  "data": {
    "recognition": {
      "id": "ocr-recognition-uuid",
      "status": "succeeded",
      "scene": "tenant_onboarding_license",
      "document_type": "business_license",
      "file_object_id": "uuid-from-direct-complete",
      "provider_request_id": "provider-request-id",
      "expires_at": "2026-07-30T10:51:52.569+00:00",
      "fields": [
        {
          "key": "license_name",
          "label": "营业执照主体名称",
          "value": "[REDACTED]",
          "normalized": true,
          "sensitive": false,
          "confidence": null
        }
      ],
      "warnings": [],
      "quality": {}
    },
    "idempotent": false,
    "cached": false
  },
  "message": "success"
}
```

首次创建是同步 HTTP 200；visitor 一期不做跨 idempotency key 缓存，
`cached` 始终为 `false`。

### 2.3 读取识别

```http
GET /tenant-onboarding/ocr/recognitions/:id
```

成功时 `data` 直接是 recognition，不再包一层 `recognition`：

```json
{
  "data": {
    "id": "ocr-recognition-uuid",
    "status": "succeeded",
    "scene": "tenant_onboarding_license",
    "document_type": "business_license",
    "file_object_id": "uuid-from-direct-complete",
    "provider_request_id": "provider-request-id",
    "expires_at": "2026-07-30T10:51:52.569+00:00",
    "fields": [],
    "warnings": [],
    "quality": {}
  },
  "message": "success"
}
```

只允许读取当前 `visitor_id` 的记录。跨 visitor 和不存在统一返回
`404 OCR_RECOGNITION_NOT_FOUND`；到期返回
`410 OCR_RECOGNITION_EXPIRED`。

## 3. 文件与 ID 关系

以下三个字段必须使用同一个 UUID：

```text
direct-complete.data.file_id
  = OCR file_object_id
  = application.business_license_file_id
```

不要传 COS `object_key`。

识别前服务端会同时检查：

```text
tenant_id IS NULL
owner_type = visitor
owner_visitor_id = current visitor_id
scene = tenant_onboarding_license
provider = tencent_cos
visibility = private
public_url IS NULL
status = active
deleted_at IS NULL
```

还会使用短期签名 URL 有界读取图片，校验数据库 MIME、COS Content-Type、
ETag、实际字节数及 Sharp 解码结果。OCR 只接受真实 JPEG/PNG，最大 5 MiB。
签名 URL、对象键和图片内容不会返回客户端。

## 4. dev 配置

| 配置 | dev 当前值 |
| --- | ---: |
| 全局 OCR | 开启 |
| 装企入驻 visitor OCR | 开启 |
| visitor UTC 单日额度 | 5 |
| IP 固定窗口 | 60 秒 |
| IP 窗口额度 | 20 |
| processing 租约 | 30 秒 |
| 单 visitor 并发 | 1 |
| visitor 全局并发 | 8 |
| 结果 TTL | 24 小时 |

腾讯 OCR SecretId、SecretKey 和 `OCR_RESULT_ENCRYPTION_KEY` 均已确认存在，
交接文档不记录其值。

## 5. 幂等、并发与恢复

- 相同 key + 相同文件 + succeeded/failed：HTTP 200 返回原记录，
  `idempotent=true`、`cached=false`，不再次调用 provider。
- 相同 key + 相同文件 + processing：HTTP 409
  `OCR_RECOGNITION_IN_PROGRESS`，`details.recognition_id` 指向原记录。
- 相同 key + 不同文件：HTTP 409 `OCR_IDEMPOTENCY_CONFLICT`。
- 不同 key + 相同文件：发起新的识别并重新计费。
- provider 或 normalizer 失败时先落库为 failed，再返回安全错误；
  同 key 重试读取原 failed 记录。
- `processing` 前端每 1 秒 GET 一次，最多 10 次；超限后停止自动查询并保留手工填写。
- visitor/IP/全局并发受限返回 429，并同时返回整数
  `Retry-After` 响应头和 `details.retry_after_seconds`。

真实 dev 并发恢复证据：

```json
{
  "http": 409,
  "code": "OCR_RECOGNITION_IN_PROGRESS",
  "details": {
    "recognition_id": "matched-existing-recognition-id"
  },
  "requestId": "present"
}
```

紧接着 GET 同一 ID 得到 HTTP 200、`status=processing`、`fields=[]`。

真实 dev 限流证据：

```json
{
  "http": 429,
  "code": "OCR_PROVIDER_RATE_LIMITED",
  "retry_after": "1",
  "details": {
    "retry_after_seconds": 1
  }
}
```

## 6. 稳定错误

| HTTP | code | Orange 处理 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` / `TOKEN_INVALID` | 重新建立 visitor 会话 |
| 404 | `OCR_FILE_NOT_FOUND` | 提示重新上传 |
| 404 | `OCR_RECOGNITION_NOT_FOUND` | 不暴露其他 visitor 记录 |
| 400 | `OCR_FILE_FORMAT_UNSUPPORTED` | 仅使用清晰 JPEG/PNG |
| 400 | `OCR_FILE_TOO_LARGE` | 压缩或重拍 |
| 503 | `OCR_CAPABILITY_UNAVAILABLE` | 停止自动识别，保留手工填写 |
| 503 | `OCR_DISABLED` | 停止自动识别 |
| 503 | `OCR_RESULT_ENCRYPTION_KEY_MISSING` | 使用统一安全文案 |
| 503 | `OCR_CONFIG_MISSING` | 使用统一安全文案 |
| 409 | `OCR_IDEMPOTENCY_CONFLICT` | 文件变化后生成新 key |
| 409 | `OCR_RECOGNITION_IN_PROGRESS` | GET 原 recognition |
| 410 | `OCR_RECOGNITION_EXPIRED` | 清理旧建议并允许新 key |
| 429 | `OCR_DAILY_LIMIT_EXCEEDED` | 保留手工填写 |
| 429 | `OCR_PROVIDER_RATE_LIMITED` | 遵循 Retry-After |
| 502 | `OCR_PROVIDER_FAILED` | 保留原图和手工填写 |
| 502 | `OCR_RESULT_INVALID` | 提示未识别到有效信息 |

创建接口的前置错误顺序为：

```text
UNAUTHORIZED
  -> OCR_DISABLED
  -> OCR_CAPABILITY_UNAVAILABLE
  -> OCR_RESULT_ENCRYPTION_KEY_MISSING
  -> OCR_CONFIG_MISSING
  -> OCR_FILE_NOT_FOUND
  -> OCR_FILE_FORMAT_UNSUPPORTED / OCR_FILE_TOO_LARGE
  -> 幂等、配额和 provider 错误
```

## 7. 真实 dev smoke

2026-07-29 使用合成、无真实企业信息的 PNG 营业执照完成：

- 无 token capability：HTTP 401。
- visitor capability：HTTP 200，唯一 capability 为 business license。
- direct-init → COS PUT → direct-complete：HTTP 200。
- 腾讯 `BizLicenseOCR`：HTTP 200，`status=succeeded`。
- 返回字段 key：
  `license_name`、`license_code`、`license_address`、
  `license_period_begin`、`license_period_end`、
  `legal_representative_name`。
- 同 key 重放：HTTP 200，`idempotent=true`、`cached=false`。
- GET：HTTP 200，文件 ID 与上传结果一致。
- 其他 visitor 使用文件：`404 OCR_FILE_NOT_FOUND`。
- 其他 visitor 读取结果：`404 OCR_RECOGNITION_NOT_FOUND`。
- WebP 上传后识别：`400 OCR_FILE_FORMAT_UNSUPPORTED`。
- 并发恢复：`409 OCR_RECOGNITION_IN_PROGRESS`，随后 GET 为 processing。
- 并发限制：`429 OCR_PROVIDER_RATE_LIMITED`，`Retry-After=1`。

证据仅记录状态、code、ID 是否匹配、字段 key 和 warning code；未记录 token、
signed URL、object key、provider 原始响应或 `fields[].value`。

## 8. Orange 接入范围

Orange 团队可按原对接单修改：

- `src/services/tenant_onboarding.ts`
- `src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingLicenseUpload.ts`
- `src/packageVisitor/pages/tenant-onboarding/model.ts`
- `src/packageVisitor/pages/tenant-onboarding/components/TenantOnboardingApplicationForm.tsx`
- 对应样式和测试

前端规则保持：

- OCR 只回填空白的公司名称和信用代码，已有输入不静默覆盖。
- 注册地址只作为“使用注册地址”候选。
- 法定代表人不回填管理员姓名。
- 不从 OCR 地址推导地图位置、行政区和服务区域。
- 上传新文件后生成新 idempotency key，并用 `file_object_id` 防止旧结果覆盖。
- OCR 失败不阻断原 `POST /tenant-onboarding/applications` 手工提交。

## 9. 验证记录

- OCR/入驻/上传/清理目标测试：210 pass，0 fail。
- auth allowlist、visitor service、controller 收口测试：45 pass，0 fail。
- API typecheck、build、文件大小检查：通过。
- domain build、packed consumer 校验：通过。
- tarball 的 `dist/ocr.d.ts` 已包含 `tenant_onboarding_license`。
- dev migration `20260729120000`：Local/Remote 对齐。
- RPC 权限：anon 被拒绝（SQLSTATE `42501`），service role 可达参数校验。

仓库完整 `bun test` 仍存在与本功能无关的历史失败；例如
`sensitive-service-role-tables-rls-contract.test.ts` 在改动前的 `main`
同样因 `customer_wechat_pay_smoke_orders` 既有迁移缺少 RLS 声明而失败。
本次未越界修改该历史问题。
