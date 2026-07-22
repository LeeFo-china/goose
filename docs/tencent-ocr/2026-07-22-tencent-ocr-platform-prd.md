# 腾讯云 OCR 平台化接入 PRD

日期：2026-07-22
状态：Phase 1 代码已合入 main，真实腾讯云 Smoke 与生产发布门禁待完成
范围：gooes API、gooes Admin、orange 小程序对接契约

## 1. 结论

项目采用“平台统一 OCR 服务 + 业务场景适配器”的方案：

1. 腾讯云 OCR 凭证由平台统一配置和计费，不让租户单独维护，也不下发到 Admin 或小程序。
2. Admin 和小程序先通过现有 COS 直传完成文件登记，再用 `file_object_id` 请求后端识别。
3. OCR 只返回字段建议、质量信息和风险告警；用户确认后仍通过原有业务接口保存。
4. OCR 不自动提交微信支付进件，不自动审批费用，不自动修改支付状态，也不推进 workflow。
5. Phase 1 先完成 OCR 基础设施和微信支付进件；员工报销、票据核验、门头识别按后续阶段复用同一契约。

不采用以下方案：

- 不在各业务 service 内分别直连腾讯云，避免重复实现鉴权、文件校验、结果映射和计费控制。
- 不在 COS 上传完成后自动识别，避免无意计费、错误文档类型和未授权处理敏感证照。
- 不把腾讯云 SDK 或 `SecretId/SecretKey` 放进浏览器、小程序或租户配置。
- 不把 OCR 识别结果当作证件真实性、账户归属、发票真实性或商户资质的最终结论。

## 2. 背景

当前微信支付进件要求租户手工填写营业执照、法人身份证、经办人身份证和结算账户字段，同时上传对应附件。字段数量较多，手工输入容易发生证件号、有效期、银行账号等录入错误。

员工费用申请已有金额、发生时间、发票号、商户名称和凭证图片字段，也适合通过票据 OCR 减少录入。商户资料采集、门店门头和经营场景图片则可用于识别店名和辅助分类。

当前仓库已经具备可复用基础：

- COS 直传入口：`apps/api/src/controllers/uploads/index.ts`。
- 统一文件索引：`platform_file_objects` 和 `apps/api/src/repositories/platform-file-objects.ts`。
- 文件访问策略：`apps/api/src/services/files/file-url-resolver.ts`。
- 微信支付进件字段：`apps/api/src/schema/wechat-pay-applyments.ts`。
- 微信支付敏感资料加密：`apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts`。
- 员工费用字段：`apps/api/src/schema/expense-requests.ts`。
- 平台系统配置加密：`apps/api/src/services/system-settings/legacy/crypto.ts`。

当前缺口：

- API 尚未安装腾讯云 OCR SDK，也没有统一 OCR gateway。
- `platform_file_objects` repository 尚无按 `file_object_id + tenant_id` 查询的受控入口。
- 微信支付进件附件只保存 `object_key`，未保存对应 `file_object_id`。
- Admin 进件上传控件声明支持 BMP，但后端直传只接受 JPEG、PNG、WebP、HEIC、HEIF，契约不一致。
- orange 费用上传类型没有透出 direct-complete 返回的 `file_id`，无法稳定发起 OCR。
- 尚无识别记录、幂等去重、租户配额、敏感结果过期清理和运营审计。

## 3. 官方能力基线

用户提供的 [签名方法 v3](https://cloud.tencent.com/document/product/866/33519) 是腾讯云 API 的 TC3-HMAC-SHA256 鉴权说明，不是具体 OCR 接口。项目使用官方 Node.js 产品 SDK，不自行拼接签名。

Phase 1 使用 `Version=2018-11-19`、endpoint `ocr.tencentcloudapi.com`，具体能力如下：

| 内部文档类型                     | 腾讯云 Action                                                                          | 主要用途               | Phase            |
| -------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- | ---------------- |
| `business_license`               | [`BizLicenseOCR`](https://cloud.tencent.com/document/api/866/36215)                    | 营业执照字段提取       | P0               |
| `id_card_front` / `id_card_back` | [`RecognizeEncryptedIDCardOCR`](https://cloud.tencent.com/document/product/866/103433) | 身份证敏感信息加密识别 | P0               |
| `bank_card`                      | [`BankCardOCR`](https://cloud.tencent.com/document/product/866/36216)                  | 卡号、银行、卡类型提取 | P0               |
| `general_invoice`                | [`RecognizeGeneralInvoice`](https://cloud.tencent.com/document/product/866/90802)      | 员工报销票据提取       | P1               |
| `vat_invoice_verify`             | [`VatInvoiceVerifyNew`](https://cloud.tencent.com/document/product/866/73674)          | 增值税发票真实性核验   | P1，可选付费能力 |
| `store_name`                     | [`RecognizeStoreName`](https://cloud.tencent.com/document/product/866/110000)          | 门头店名识别           | P2               |
| `store_classification`           | [`ClassifyStoreName`](https://cloud.tencent.com/document/product/866/110001)           | 门店场景分类建议       | P2               |
| `document_classification`        | [`ClassifyDetectOCR`](https://cloud.tencent.com/document/api/866/46770)                | 通用卡证预分类         | P3               |

接口限制必须由后端 capability 契约统一收口，不由各客户端自行维护：

- 身份证、银行卡通常支持 JPEG、PNG、BMP，文件 Base64 后不超过 10MB。
- 营业执照支持 JPEG、PNG，文件 Base64 后不超过 7MB。
- 通用票据支持图片、PDF 等格式，但多页 PDF 需要异步任务模式。
- 门头识别和分类单接口 QPS 较低，首期必须设置独立并发限制。
- 腾讯云返回的复印件、翻拍、模糊、反光等告警只能辅助人工判断，不能单独作为审核结论。

安全加密版身份证还要求按腾讯云[敏感数据加密指引](https://cloud.tencent.com/document/product/866/106048)处理请求和响应：每次请求生成 32 字节 AES 密钥和 16 字节 IV，使用 AES-256-CBC/PKCS#7 加密请求体，使用腾讯 OCR 提供的 1024 位 RSA PKCS#1 公钥加密 AES 密钥，并用同一 AES 密钥和 IV 解密响应 `EncryptedBody`。腾讯 OCR 加密公钥需要在实施前向腾讯 OCR 支持渠道获取并核验；官方 Node.js Demo 仅作为可选的交叉核验材料，文档公开的无 SDK 协议足以完成实现。

## 4. 产品目标

### 4.1 Phase 1 目标

1. 平台超管可以安全配置并验证腾讯云 OCR。
2. 租户员工可以对已上传的营业执照、身份证和银行卡主动发起识别。
3. Admin 微信支付进件页面可以展示识别结果与当前表单值的差异，并由用户选择回填字段。
4. 敏感识别结果加密保存、按租户隔离，并在 24 小时后失效清理。
5. 相同租户、相同文件、相同文档类型的并发或重复请求不会重复调用腾讯云。
6. 平台超管可以分页查看识别调用记录、成功率、失败原因和计费单元，不显示证件明文。
7. 后端输出稳定的小程序契约，为后续报销、进件和商户资料采集提供统一入口。

### 4.2 后续目标

- 员工报销上传票据后，识别金额、日期、发票号和销售方并辅助填写费用明细。
- 按需调用发票核验接口，将“字段识别”和“真实性核验”作为两个独立动作。
- 商户资料采集时识别门店名称、门头文字和经营场景分类建议。
- 支持多张票据和多页 PDF 的异步识别、任务轮询和批量回填。

## 5. 非目标

以下内容不属于本期：

- 不自动判断微信支付进件是否通过。
- 不自动选择微信支付 `settlement_id`、`qualification_type` 或经营类目。
- 不使用银行卡 OCR 证明账户持有人或结算账户归属。
- 不把发票 OCR 结果当作发票真实性核验结果。
- 不自动覆盖用户已经填写的非空字段。
- 不在 OCR 服务中创建或完成 workflow task。
- 不修改 orange 仓库；小程序实现由 orange 团队按 handoff 文档完成。
- 不在 Phase 1 支持访客态租户入驻证照识别，访客私有文件授权另行评审。
- 不在 Phase 1 提供租户自定义额度；所有租户按平台默认日额度独立计数，差异化套餐和额度留到运营阶段。

## 6. 用户与权限

| 角色                   | 能力                                                            |
| ---------------------- | --------------------------------------------------------------- |
| 平台技术管理员         | 配置 OCR 密钥、区域、endpoint、全局开关、平台默认日配额和超时。 |
| 平台运营               | 分页查看识别记录、失败原因、用量和腾讯云 RequestId。            |
| 租户微信支付进件操作人 | 对当前租户进件附件发起识别、确认并回填字段。                    |
| 费用申请人             | 对本人可编辑的费用申请票据发起识别并回填费用明细。              |
| 商户资料采集员工       | 对有权限的商户资料图片发起门头或证照识别。                      |

权限采用双重校验：

1. 通用能力权限：`ocr.recognize`。
2. 业务对象权限：例如 `wechat_pay.applyment.submit`、`expense_request.create`。

平台记录读取使用 `platform.ocr.recognition.read`。平台密钥继续由平台 Admin 身份和现有系统配置权限保护，不开放租户覆盖。

## 7. 场景与字段映射

### 7.1 微信支付进件

| 附件类别                             | OCR 文档类型       | 可建议回填字段                                                                                                               | 不能自动处理的字段                                           |
| ------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `license_copy`                       | `business_license` | `license_name`、`license_code`、`license_address`、`license_period_begin`、`license_period_end`、`legal_representative_name` | `merchant_short_name`、`qualification_type`、`settlement_id` |
| `legal_representative_id_card_front` | `id_card_front`    | `identity_name`、`identity_number`、`identity_address`                                                                       | 法人身份一致性结论                                           |
| `legal_representative_id_card_back`  | `id_card_back`     | `identity_period_begin`、`identity_period_end`                                                                               | 证件真实性结论                                               |
| `contact_id_card_front`              | `id_card_front`    | `super_admin_name`、`contact_identity_number`、`contact_identity_address`                                                    | 联系人是否有授权                                             |
| `contact_id_card_back`               | `id_card_back`     | `contact_identity_period_begin`、`contact_identity_period_end`                                                               | 联系人是否有授权                                             |
| `settlement_account_proof`           | `bank_card`        | `settlement_account_number`、`settlement_bank_name`                                                                          | `settlement_account_name`、账户归属、联行号                  |
| `business_scene_material`            | `store_name`       | 店名和场景文本建议                                                                                                           | 行业资质、结算规则                                           |

字段标准化规则：

- 身份证号统一转大写 `X`，但仍走现有 Zod 校验。
- 日期统一为 `YYYY-MM-DD`；长期有效统一为 `长期`。
- 银行卡号只保留数字，回填前展示脱敏对比。
- 腾讯云原始字段名不进入客户端契约，由后端 normalizer 转成 gooes 字段名。
- OCR 建议不得覆盖用户非空值；默认只勾选空字段，存在差异时必须逐项确认。

### 7.2 员工费用申请

| OCR 字段           | 费用明细字段        |
| ------------------ | ------------------- |
| 含税金额或价税合计 | `amount`            |
| 开票日期或票据日期 | `occurred_at`       |
| 发票号码           | `invoice_no`        |
| 销售方名称         | `vendor_name`       |
| 原图对象 key       | `evidence_images[]` |

通用票据可能一次识别出多张票据。客户端必须先展示拆分结果，由用户选择创建一条或多条费用明细，不能直接写入申请。

### 7.3 门头与商户资料

门头识别结果只作为以下内容的建议：

- 门店名称。
- 图片旋转方向。
- 门头文字区域。
- 经营场景标签。

系统不得把场景标签直接映射为微信支付行业资质或结算规则。

## 8. 总体架构

```text
Admin / orange
  -> POST /uploads/cos/direct-init
  -> PUT COS
  -> POST /uploads/cos/direct-complete
  -> 获得 file_id + object_key
  -> POST /ocr/recognitions
      -> OCR controller：认证、Zod、ResponseHandler
      -> OCR service：业务权限、幂等、配额、文件校验、结果编排
      -> file repository：按 tenant_id + file_object_id 取文件
      -> Tencent OCR gateway：官方 SDK 调用
      -> normalizer：腾讯字段转内部字段
      -> recognition repository：加密结果、摘要、告警、计费记录
  <- 返回标准化建议
  -> 用户确认
  -> 原有进件 create/update 或费用 create/update
```

### 8.1 为什么不在上传完成时自动识别

- 上传接口不知道附件业务类别，例如身份证正反面或经营场景材料。
- 自动调用会产生不可控费用和重复识别。
- 敏感证件处理需要明确的用户动作和用途提示。
- 上传成功不代表当前员工有权修改目标业务对象。

因此 OCR 请求必须显式携带 `scene`、`document_type`、`file_object_id` 和可选业务对象信息。

### 8.2 同步与异步

- 单张营业执照、身份证、银行卡和门头图片使用同步接口，API 总超时建议 10 秒。
- 多张票据、多页 PDF 使用异步任务，客户端轮询 `GET /ocr/recognitions/:id`。
- Phase 1 只开放同步图片识别，但数据库状态必须兼容 `pending/processing/succeeded/failed/expired`。

## 9. API 契约

### 9.1 能力查询

```http
GET /ocr/capabilities?scene=wechat_pay_applyment
Authorization: Bearer <employee-token>
```

响应示例：

```json
{
  "scene": "wechat_pay_applyment",
  "capabilities": [
    {
      "document_type": "business_license",
      "label": "营业执照识别",
      "attachment_categories": ["license_copy"],
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
  ]
}
```

`capabilities` 是内部固定辅助数据，明确保证总量不超过 50，因此不分页；实现处必须留下该豁免说明。

### 9.2 创建识别

```http
POST /ocr/recognitions
Authorization: Bearer <employee-token>
Content-Type: application/json
```

```json
{
  "scene": "wechat_pay_applyment",
  "document_type": "business_license",
  "file_object_id": "uuid",
  "subject_type": "wechat_pay_applyment",
  "subject_id": "optional-applyment-uuid",
  "idempotency_key": "uuid"
}
```

响应示例：

```json
{
  "recognition": {
    "id": "uuid",
    "status": "succeeded",
    "scene": "wechat_pay_applyment",
    "document_type": "business_license",
    "file_object_id": "uuid",
    "provider_request_id": "tencent-request-id",
    "expires_at": "2026-07-23T10:00:00.000Z",
    "fields": [
      {
        "key": "license_name",
        "label": "营业执照主体名称",
        "value": "示例装饰工程有限公司",
        "normalized": true,
        "sensitive": false,
        "confidence": null
      }
    ],
    "warnings": [
      {
        "code": "IMAGE_BLURRED",
        "level": "warning",
        "message": "图片可能模糊，请人工核对"
      }
    ]
  },
  "idempotent": false,
  "cached": false
}
```

同一 `idempotency_key` 重试返回同一记录。相同租户、文件摘要、文档类型和 provider action 在有效期内再次请求时返回 `cached=true`，不重复调用腾讯云。

### 9.3 读取识别结果

```http
GET /ocr/recognitions/:id
Authorization: Bearer <employee-token>
```

仅允许创建者或具备同一业务对象权限的当前租户员工读取。平台列表不返回 `fields[].value`。

### 9.4 平台调用记录

```http
GET /platform/ocr/recognitions?page=1&pageSize=20&status=failed&document_type=business_license
Authorization: Bearer <platform-admin-token>
```

必须分页，默认 `page=1&pageSize=20`，`pageSize` 最大 100。列表返回租户、场景、文档类型、状态、耗时、计费单元、错误码、RequestId 和时间，不返回证件内容、文件 signed URL 或结果密文。

### 9.5 平台配置验证

```http
POST /platform/ocr/config-test
Authorization: Bearer <platform-admin-token>
Content-Type: multipart/form-data
```

平台管理员手动选择一张合成样本或已获明确授权的非生产营业执照测试图，接口固定调用 `BizLicenseOCR`，只返回配置是否可用、腾讯 RequestId、耗时和告警码，不返回识别字段，也不保存测试图。单张仅支持 JPEG/PNG 且不超过 2MB。该动作会产生一次可能计费的腾讯 OCR 调用，UI 必须在调用前明确提示。

## 10. 数据模型

通过 migration 新增 `ocr_recognitions`：

- `id`
- `tenant_id`
- `actor_employee_id`
- `scene`
- `document_type`
- `provider`
- `provider_action`
- `file_object_id`
- `file_checksum`
- `subject_type`
- `subject_id`
- `status`
- `idempotency_key`
- `dedupe_key`
- `result_ciphertext`
- `result_summary`
- `warnings`
- `quality`
- `provider_request_id`
- `provider_error_code`
- `provider_error_message_safe`
- `billable_units`
- `duration_ms`
- `processed_at`
- `expires_at`
- `created_at`
- `updated_at`

约束和索引：

- 唯一索引：`tenant_id + idempotency_key`。
- 活跃去重索引：`tenant_id + dedupe_key`，仅覆盖 `processing/succeeded`。
- 平台列表索引：`tenant_id + created_at desc`、`status + created_at desc`。
- 文件回查索引：`file_object_id + created_at desc`。
- `result_summary` 只保存字段名、数量和脱敏摘要，不保存身份证号、银行卡号或完整地址。
- `result_ciphertext` 使用独立 `OCR_RESULT_ENCRYPTION_KEY` 做 AES-256-GCM 加密，AAD 包含租户和识别记录 ID。
- `expires_at` 默认 24 小时；读取到期后立即拒绝解密，自动清理任务每小时运行并在一个调度窗口内将记录改为 `expired`、清空 `result_ciphertext`。
- 表启用 RLS，不提供客户端直连 policy；API 仅通过 service-role repository 访问。

Phase 1 不新增独立用量汇总表，平台统计直接基于带索引的识别记录聚合。数据量达到性能门槛后再通过 migration 增加日汇总表，避免提前引入重复数据。

## 11. 配置

平台系统配置新增 `ocr` 分组：

- `TENCENT_OCR_ENABLED`
- `TENCENT_OCR_SECRET_ID`，加密存储
- `TENCENT_OCR_SECRET_KEY`，加密存储
- `TENCENT_OCR_REGION`
- `TENCENT_OCR_ENDPOINT`
- `TENCENT_OCR_REQUEST_TIMEOUT_MS`
- `TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT`
- `TENCENT_OCR_RESULT_TTL_HOURS`
- `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED`
- `TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM`，按敏感配置存储和掩码展示
- `TENCENT_OCR_ENCRYPTION_ALGORITHM`，Phase 1 固定为 `AES-256-CBC`

要求：

- 使用 OCR 专用 CAM 子用户或角色，不复用 COS、物联网视频、ASR 或微信支付密钥。
- CAM 权限只包含已启用的 OCR Action，并配置来源 IP、MFA 和密钥轮换。
- 租户不能读取或覆盖 OCR 平台配置；Phase 1 所有租户按平台默认额度分别计数。
- “验证配置”必须由平台管理员主动选择非敏感测试图并点击，明确说明会产生一次 OCR 调用；不能在保存时静默调用计费接口。

## 12. Admin 交互

### 12.1 平台系统配置

在 `/settings?group=ocr` 展示：

- 服务启用状态。
- SecretId、SecretKey 的加密配置状态和替换入口。
- endpoint、region、超时、默认日配额和结果保留时间。
- 身份证加密接口开关。
- 主动“验证配置”按钮、非敏感 JPEG/PNG 测试图选择和最近验证结果。

所有控件复用现有 shadcn/ui 和系统配置组件，不显示密钥明文。

### 12.2 平台 OCR 记录

新增 `/platform/ocr`：

- 汇总：今日调用、成功、失败、缓存命中、计费单元。
- 筛选：租户、场景、文档类型、状态、日期。
- 分页表格：识别记录、耗时、RequestId、错误码。
- 详情抽屉：只显示脱敏摘要、告警和排障信息。

### 12.3 租户微信支付进件

附件上传成功后显示“识别并填入”：

1. 用户主动点击。
2. 页面显示处理中状态，不阻塞其他附件上传。
3. 成功后打开字段差异确认面板。
4. 默认勾选当前为空的字段；有值且不同的字段默认不勾选。
5. 敏感字段采用适当脱敏预览，但用户可在已有安全输入控件内确认完整值。
6. 用户确认后只更新当前表单状态，再通过原有 create/update 接口保存。
7. OCR 失败时保留原附件和手工录入能力。

Phase 1 不新增绕过现有进件 schema、敏感字段加密和状态机的写入接口。

## 13. 小程序交互

小程序使用和 Admin 相同的后端契约：

```text
选择或拍摄图片
  -> COS direct upload
  -> 保留 direct-complete 的 file_id
  -> 查询 scene capabilities
  -> POST /ocr/recognitions
  -> 展示识别告警和字段确认
  -> 用户应用字段
  -> 调用现有业务保存接口
```

小程序必须遵守：

- 不引入腾讯云 OCR SDK，不保存腾讯云密钥。
- 不根据附件文件名猜文档类型；类型来自页面槽位或后端 capabilities。
- 不自动提交费用、进件或商户资料。
- OCR 失败、超时、配额耗尽时允许继续手工填写。
- 日志不得记录完整身份证号、银行卡号、地址、signed URL 或 OCR 原始响应。
- OCR 不是 workflow v2 推进动作；业务状态仍只按后端 workflow/action 契约处理。

具体改动和 smoke 清单见 [小程序对接文档](./2026-07-22-tencent-ocr-miniprogram-handoff.md)。

## 14. 安全与隐私

1. 上传前提示证照处理用途，用户必须主动触发识别。
2. 原图继续按现有 COS 场景策略访问，腾讯云只接收短期 signed URL 或后端读取后的加密请求内容。
3. signed URL 有效期控制在调用所需最短时间内，且不得写入日志或识别记录。
4. 敏感 OCR 结果只保存密文，24 小时到期后立即不可读，并由自动任务在一小时内清除；平台运营只看脱敏摘要。
5. API 返回完整敏感字段时必须同时满足租户、员工和业务对象权限。
6. provider 异常只记录安全错误码、RequestId 和脱敏信息。
7. 腾讯云说明 OCR 不保存用户图片、脱敏日志保留三天；gooes 自身保存的原图仍必须按平台文件生命周期治理，不能依赖供应商策略。
8. 所有数据库变更通过 `supabase/migrations/`，禁止远端手工建表或补数据。

## 15. 性能、配额与计费

- 单图同步识别 API 目标 P95 小于 3 秒，整体超时 10 秒。
- 按腾讯 Action 设置独立并发：门头类不超过 1，票据类不超过 5，营业执照/银行卡不超过 10，身份证不超过 20；最终值不得超过官方 QPS。
- 每租户默认日配额由平台配置，超额返回明确的 429 业务错误。
- 仅对网络安全类错误做有限重试；对于未知是否计费的 provider 响应不盲目重试。
- 使用 idempotency 和文件 checksum 去重，防止重复点击造成重复计费。
- 平台监控成功率、P95、超时率、缓存命中率、计费单元和租户分布。

腾讯云存在免费额度、预付费资源包和后付费模式，且部分失败请求也可能计费。上线前需按 [计费说明](https://cloud.tencent.com/document/product/866/17619) 和 [失败计费说明](https://cloud.tencent.com/document/product/866/45470) 核对当前账户状态，不能依赖免费额度维持生产服务。

## 16. 错误契约

新增错误码建议：

- `OCR_CONFIG_MISSING`
- `OCR_DISABLED`
- `OCR_CAPABILITY_UNAVAILABLE`
- `OCR_FILE_NOT_FOUND`
- `OCR_FILE_ACCESS_DENIED`
- `OCR_FILE_FORMAT_UNSUPPORTED`
- `OCR_FILE_TOO_LARGE`
- `OCR_DAILY_LIMIT_EXCEEDED`
- `OCR_IDEMPOTENCY_CONFLICT`
- `OCR_RECOGNITION_NOT_FOUND`
- `OCR_RECOGNITION_EXPIRED`
- `OCR_RECOGNITION_IN_PROGRESS`
- `OCR_PROVIDER_RATE_LIMITED`
- `OCR_PROVIDER_FAILED`
- `OCR_RESULT_INVALID`

错误必须通过 `error-factory.ts` 包装。客户端只展示安全中文提示，排障使用响应中的 request ID 和后端记录的腾讯 RequestId。

## 17. 验收标准

### 17.1 后端

- SDK 的真实导出和类型已经按安装版本核对，并通过 Bun typecheck/build。
- 不向客户端或日志暴露腾讯云密钥、OCR 原始响应、signed URL 或敏感明文。
- 跨租户 `file_object_id` 按租户范围查询后返回
  `404 OCR_FILE_NOT_FOUND`，不泄露该文件在其他租户是否存在。
- 非支持 scene、MIME、文档类型和过大文件在调用腾讯云前被拒绝。
- 同一 idempotency key 不重复调用 provider。
- 同一 idempotency key 只能绑定原文件、场景、文档类型和业务对象，换请求复用时返回 409。
- 同一有效文件和文档类型的重复请求命中缓存。
- 识别结果到期后立即返回 410，密文由每小时清理任务在一个调度窗口内清除。
- 平台列表正确分页，`pageSize` 最大 100。

### 17.2 微信支付进件

- 营业执照、法人身份证正反面和银行卡均可主动识别。
- 识别结果以差异确认方式回填，不覆盖未勾选字段。
- 保存后仍通过现有进件 schema 和敏感字段加密测试。
- 模糊、翻拍、反光等告警可见，但不自动拒绝申请。
- OCR 失败不影响附件查看、替换和手工填写。

### 17.3 小程序

- direct-complete 的 `file_id` 能传入 OCR 请求。
- 只从 `/ocr/capabilities` 获取可用能力和格式限制。
- 重复点击受本地 pending 状态和后端 idempotency 双重保护。
- OCR 不触发 `/workflow-tasks/:taskId/complete`。
- 费用申请保存前可修改每一个识别字段。
- 真机日志和错误上报无敏感明文。

## 18. 实施阶段

| 阶段    | 范围                                                 | 交付结果                         |
| ------- | ---------------------------------------------------- | -------------------------------- |
| Phase 0 | SDK、Bun、CAM、加密身份证技术验证                    | 确认可实现并形成固定依赖版本     |
| Phase 1 | OCR 基础设施、平台配置、识别记录、微信支付进件 Admin | 营业执照/身份证/银行卡可识别回填 |
| Phase 2 | orange 通用 OCR service、员工费用票据                | 费用明细可人工确认回填           |
| Phase 3 | 门头、商户资料、访客授权评审                         | 商户资料采集效率提升             |
| Phase 4 | 多页票据、发票核验、运营告警                         | 异步批量和风控增强               |

Phase 1 执行步骤见 [实施计划](./2026-07-22-tencent-ocr-phase1-implementation-plan.md)。

## 19. 风险与控制

| 风险                     | 控制措施                                           |
| ------------------------ | -------------------------------------------------- |
| OCR 误识别关键证件号     | 人工确认、现有 Zod 校验、差异展示，不自动提交      |
| 敏感数据泄露             | 后端调用、密文存储、短期保留、日志脱敏、租户隔离   |
| 重复调用产生费用         | idempotency、checksum 去重、客户端 pending、配额   |
| 腾讯云限流或不可用       | Action 级并发、有限重试、手工录入 fallback         |
| 前后端支持格式不一致     | capabilities 作为单一来源，Phase 1 只开放 JPEG/PNG |
| OCR 与 workflow 混淆     | OCR 只改表单草稿，不产生业务状态动作               |
| 识别结果被当作真实性结论 | UI 明确“识别建议”，核验能力单独设计和收费          |

## 20. 参考资料

- [腾讯云 OCR API 概览](https://cloud.tencent.com/document/product/866/33515)
- [腾讯云签名方法 v3](https://cloud.tencent.com/document/product/866/33519)
- [腾讯云 Node.js SDK](https://github.com/TencentCloud/tencentcloud-sdk-nodejs)
- [腾讯云敏感数据加密指引](https://cloud.tencent.com/document/product/1253/115227)
- [腾讯云 OCR 数据处理说明](https://cloud.tencent.com/document/product/866/33511)
- `docs/decoration-finance/2026-07-21-admin-official-wechat-pay-applyment-design.md`
- `docs/decoration-finance/2026-07-01-phase9-wechat-pay-onboarding-application-prd.md`
- `docs/2026-05-14-platform-storage-to-tencent-cos-migration-plan.md`
- `docs/state_machine_migrate/2026-06-18-workflow-node-contract-v2-miniprogram-handoff.md`
