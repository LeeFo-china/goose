# 腾讯云 OCR 小程序对接文档

日期：2026-07-22
状态：目标契约；须等待 gooes 对应 Phase 发布后开始真实联调
Owner：gooes 提供 API 契约，orange 团队实现小程序
仓库边界：本文仅写入 gooes，`/Users/leefo/Public/work/orange` 保持只读

## 1. 对接结论

orange 不直接接腾讯云 OCR，也不保存腾讯云密钥。小程序统一走：

```text
拍照/选图
  -> gooes COS direct upload
  -> 保存 direct-complete 返回的 file_id
  -> GET /ocr/capabilities
  -> POST /ocr/recognitions
  -> 展示识别结果和告警
  -> 用户选择并修改字段
  -> 调用原有业务保存接口
```

OCR 是录入辅助能力，不是 workflow 动作：

- 不调用 `/workflow-tasks/:taskId/complete`。
- 不自动提交微信支付进件。
- 不自动提交、审批或打款费用申请。
- 不自动改变项目、费用或商户状态。
- 识别失败时必须保留手工填写和原附件。

## 2. 后端发布阶段

| 后端阶段                                   | 小程序影响                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Phase 1：OCR 基础设施 + Admin 微信支付进件 | orange 只读核对 API；通用 service 可以开发，但费用入口不应提前上线                |
| Phase 2：费用票据 capability 发布          | orange 对接员工报销票据识别和字段回填                                             |
| Phase 3：门头/商户资料 capability 发布     | orange 对接商户资料、门头和经营场景采集                                           |
| 访客证照专项发布                           | 再评估 `tenant_onboarding_license` 的 visitor session 权限，不复用员工 token 假设 |

客户端必须以 `/ocr/capabilities` 返回为准。后端未返回某项能力时，不展示对应识别按钮，也不使用本地 fallback Action。

## 3. orange 当前只读核对

已读取以下现有文件，没有修改 orange：

| 现有能力                 | 文件                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| 费用申请 API 和 COS 上传 | `src/services/expense_request.ts`                                                      |
| direct COS 上传工具      | `src/utils/image_upload.ts`                                                            |
| direct upload 类型       | `src/utils/image_upload_helpers.ts`                                                    |
| 费用 API 类型            | `src/types/api/expense_request.d.ts`                                                   |
| 费用明细输入 UI          | `src/packageEmployees/pages/expenseDetail/components/ExpenseItemsSection.tsx`          |
| 费用图片处理             | `src/packageEmployees/pages/expenseDetail/hooks/useExpenseDetailImages.ts`             |
| 费用保存和动作           | `src/packageEmployees/pages/expenseDetail/hooks/useExpenseDetailActions.ts`            |
| 费用本地模型             | `src/packageEmployees/pages/expenseDetail/model.ts`                                    |
| 访客租户入驻执照上传     | `src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingLicenseUpload.ts` |

当前差距：

- `DirectCosUploadComplete` 的 API 实际可返回 `file_id`，但 orange 通用上传泛型和费用图片类型没有稳定暴露该字段。
- 费用本地图片模型主要保存 `url/path`，OCR 请求需要同时保留 `file_object_id`。
- orange 当前没有可确认的租户微信支付进件小程序页面；不能凭空把 Admin 页面路径映射成小程序页面。
- visitor 入驻使用独立登录态和私有上传凭证，不能直接按员工 OCR 权限接入。

## 4. 认证与权限

员工场景请求头：

```http
Authorization: Bearer <employee-token>
```

租户上下文沿用员工登录 token，不要额外拼接或伪造租户 ID。后端校验：

- 当前员工属于当前租户；
- 具备 `ocr.recognize`；
- 具备场景业务权限，例如 `expense_request.create` 或 `wechat_pay.applyment.submit`；
- `file_object_id` 属于当前租户且 scene 匹配；
- 可选 `subject_id` 属于当前租户且当前员工可编辑。

## 5. 上传契约调整

现有上传流程保持：

```http
POST /uploads/cos/direct-init
PUT <upload_url>
POST /uploads/cos/direct-complete
```

direct-complete 重点返回：

```json
{
  "file_id": "platform-file-object-uuid",
  "object_key": "tenants/.../expense-request/...jpg",
  "storage_path": "tenants/.../expense-request/...jpg",
  "path": "tenants/.../expense-request/...jpg"
}
```

当前 direct-complete 响应不保证返回 `mime_type` 和 `size_bytes`；客户端继续使用本次上传文件的本地 MIME/大小做界面校验，后端 OCR 会以 `platform_file_objects` 中的登记值再次校验。

orange 需要：

1. 在 direct-complete 结果类型中增加 `file_id?: string`。
2. 上传成功后把 `file_id` 转成客户端统一字段 `file_object_id`。
3. 本地草稿图片同时保留 `file_object_id` 和原有 `url/path`。
4. 原有业务保存接口如果只需要 `evidence_images[]`，继续只提交 object key/path；不要把 `file_object_id` 塞进旧字符串数组。
5. 没有 `file_object_id` 的历史附件不允许本地用 object key 猜测识别；提示重新上传或手工录入。

Phase 1 OCR 图片只支持 JPEG/PNG。小程序拍摄/压缩后应确认 MIME；不要上传 HEIC/WebP 后再尝试 OCR。

## 6. 能力查询

```http
GET /ocr/capabilities?scene=expense_request
```

响应：

以下示例是客户端请求层解包顶层 `data` 后的业务值；原始 HTTP 成功响应仍使用项目统一的
`{ "data": ..., "message": "success" }` 包装。

```json
[
  {
    "scene": "expense_request",
    "document_type": "general_invoice",
    "label": "识别票据",
    "attachment_categories": ["expense_evidence"],
    "supported_mime_types": ["image/jpeg", "image/png"],
    "max_size_bytes": 2097152,
    "mode": "sync",
    "output_fields": ["amount", "occurred_at", "invoice_no", "vendor_name"]
  }
]
```

规则：

- 能力列表总量由后端保证不超过 50，不分页。
- 解包后的业务值为 `[]` 表示当前场景未开放，不是客户端错误。
- 按页面进入时查询一次即可；不要长期跨版本缓存。
- 按 `document_type`、MIME、大小和 `mode` 渲染，不维护本地腾讯 Action/QPS 表。

## 7. 创建识别

```http
POST /ocr/recognitions
Content-Type: application/json
```

费用票据请求：

```json
{
  "scene": "expense_request",
  "document_type": "general_invoice",
  "file_object_id": "uuid",
  "subject_type": "expense_request",
  "subject_id": "optional-expense-request-uuid",
  "idempotency_key": "uuid"
}
```

支付进件营业执照请求：

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

约束：

- 一次用户点击生成一个 UUID，并在该次重试中复用。
- 用户重新选择文件或文档类型时生成新的 UUID。
- pending 状态禁止同一图片重复点击，但后端 idempotency 仍是最终保护。
- `subject_id` 仅在业务草稿已经存在时传；不要生成假的业务 ID。

同步成功响应：

```json
{
  "recognition": {
    "id": "recognition-uuid",
    "status": "succeeded",
    "scene": "expense_request",
    "document_type": "general_invoice",
    "file_object_id": "file-uuid",
    "provider_request_id": "provider-request-id",
    "expires_at": "2026-07-23T10:00:00.000Z",
    "fields": [
      {
        "key": "amount",
        "label": "金额",
        "value": 128.5,
        "normalized": true,
        "sensitive": false,
        "confidence": null
      },
      {
        "key": "vendor_name",
        "label": "销售方名称",
        "value": "示例材料有限公司",
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

`fields[].value` 类型为 `string | number | boolean | null`。客户端必须按 `key` 白名单映射，不要把未知字段动态写入业务 payload。

## 8. 读取识别状态

```http
GET /ocr/recognitions/:id
```

Phase 1 单图片正常直接返回终态。为后续异步票据兼容，客户端 service 需要识别：

- `pending`
- `processing`
- `succeeded`
- `failed`
- `expired`

只有 `pending/processing` 才可短轮询。建议间隔 1 秒、最多 10 次；页面退出后停止。`expired` 不读取旧字段，提示重新识别或手工输入。

## 9. 小程序通用类型建议

在 orange 新增 `src/services/ocr.ts`，建议类型：

```ts
export type OcrFieldSuggestion = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  normalized: boolean;
  sensitive: boolean;
  confidence: number | null;
};

export type OcrWarning = {
  code: string;
  level: 'info' | 'warning' | 'error';
  message: string;
};

export type OcrRecognition = {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';
  scene: string;
  document_type: string;
  file_object_id: string;
  expires_at: string;
  fields: OcrFieldSuggestion[];
  warnings: OcrWarning[];
};
```

Service 方法：

```ts
OcrService.getCapabilities(scene);
OcrService.recognize(payload);
OcrService.getRecognition(id);
```

不要在小程序中定义腾讯云 Action 名、SecretId、SecretKey、endpoint 或签名逻辑。

## 10. 员工报销 UI 对接

建议修改点：

- `src/utils/image_upload_helpers.ts`
  - direct-complete 类型增加 `file_id`。
- `src/utils/image_upload.ts`
  - 保留后端 `file_id`，不要在 fallback normalizer 中丢弃。
- `src/types/api/expense_request.d.ts`
  - `UploadExpenseRequestImageItem` 增加 `file_id?: string`。
- `src/packageEmployees/pages/expenseDetail/model.ts`
  - `LocalImage` 增加 `file_object_id?: string` 和本地 `ocr_status`。
- `src/packageEmployees/pages/expenseDetail/hooks/useExpenseDetailImages.ts`
  - 上传成功后保留 file ID。
- `src/packageEmployees/pages/expenseDetail/components/ExpenseItemsSection.tsx`
  - 对有 file ID 且 capability 可用的凭证展示“识别票据”。
- `src/packageEmployees/pages/expenseDetail/hooks/useExpenseDetailActions.ts`
  - 仅在用户确认后把建议映射到现有费用草稿字段。

交互规则：

1. 用户上传票据后主动点击“识别票据”。
2. 显示金额、日期、发票号、销售方和告警。
3. 当前为空字段默认选中；已有值且不同的字段默认不选中。
4. 用户可以修改识别值后应用。
5. 应用只修改本地费用草稿。
6. 用户仍需点击现有保存/提交按钮。
7. 多票据结果在 Phase 2 契约明确前，不自动拆成多条费用明细。

费用业务 payload 继续使用：

```json
{
  "occurred_at": "ISO datetime or null",
  "amount": 128.5,
  "invoice_no": "invoice number or null",
  "vendor_name": "vendor or null",
  "evidence_images": ["COS object key"]
}
```

## 11. 微信支付进件 UI 对接

orange 当前没有已确认的租户微信支付进件页面。后续新增页面时复用同一 `OcrService`，附件类别映射：

| 附件类别                             | `document_type`    |
| ------------------------------------ | ------------------ |
| `license_copy`                       | `business_license` |
| `legal_representative_id_card_front` | `id_card_front`    |
| `legal_representative_id_card_back`  | `id_card_back`     |
| `contact_id_card_front`              | `id_card_front`    |
| `contact_id_card_back`               | `id_card_back`     |
| `settlement_account_proof`           | `bank_card`        |

进件页面不能：

- 根据附件标题推导后端不支持的文档类型；
- 用银行卡 OCR 自动填写结算账户开户名；
- 用门头分类自动选择 `settlement_id` 或 `qualification_type`；
- 识别完成后自动提交申请。

## 12. 商户资料与门头

后端 Phase 3 返回以下 capabilities 后再接入：

```text
merchant_material + store_name
merchant_material + store_classification
```

小程序只把识别结果用于店名和经营场景建议。门头分类不是商户资质证明，不得直接写入支付进件类目。

visitor `tenant_onboarding_license` 暂不接员工 OCR API。后端需要先提供 visitor 专用 capability、用途授权、频率限制和私有文件读取契约。

## 13. 错误处理

| code                          | 小程序处理                                                    |
| ----------------------------- | ------------------------------------------------------------- |
| `OCR_DISABLED`                | 隐藏入口或提示“证照识别暂不可用”，保留手工填写                |
| `OCR_CAPABILITY_UNAVAILABLE`  | 刷新 capabilities，不本地 fallback                            |
| `OCR_FILE_NOT_FOUND`          | 提示重新上传；跨租户文件也按 404 返回，不判断远端文件是否存在 |
| `OCR_FILE_ACCESS_DENIED`      | 重新登录；不要改传 object key 绕过                            |
| `OCR_FILE_FORMAT_UNSUPPORTED` | 提示选择 JPEG/PNG                                             |
| `OCR_FILE_TOO_LARGE`          | 压缩或重新选择                                                |
| `OCR_DAILY_LIMIT_EXCEEDED`    | 提示今日额度已用完，保留手工填写                              |
| `OCR_IDEMPOTENCY_CONFLICT`    | 当前请求已变化时生成新的 UUID；禁止继续复用冲突 key           |
| `OCR_RECOGNITION_EXPIRED`     | 清空识别建议，允许重新识别                                    |
| `OCR_RECOGNITION_IN_PROGRESS` | 继续读取已有 recognition，不创建新请求                        |
| `OCR_PROVIDER_RATE_LIMITED`   | 短暂提示稍后重试，不循环重放                                  |
| `OCR_PROVIDER_FAILED`         | 展示安全提示并保留原图/表单                                   |
| `OCR_RESULT_INVALID`          | 提示无法识别，改为手工填写                                    |

错误上报允许记录：

- gooes request ID；
- recognition ID；
- document type；
- error code；
- HTTP status；
- 发生时间。

禁止记录：

- 腾讯云密钥；
- signed URL；
- 身份证号、银行卡号、地址；
- OCR `fields[].value`；
- 原图 Base64 或完整 provider response。

## 14. Workflow 边界

OCR 不进入以下数据源：

- `workflow_state.actions`
- `timeline_nodes[].actions`
- `/workflow-tasks[].actions`

原因是 OCR 不改变业务状态。小程序业务推进仍然：

- 只消费后端 workflow v2 `actions[].key`；
- 只通过 `POST /workflow-tasks/:taskId/complete` 完成业务动作；
- 不因 OCR 成功或失败改变 timeline。

只有未来某个 workflow 节点明确把“资料采集确认”建模成业务动作时，才由后端另外返回 workflow action；不能复用 `recognize` 代替该动作。

## 15. 幂等和重复点击

- 点击一次生成一个 idempotency UUID。
- 同一网络重试复用该 UUID。
- 文件、场景、文档类型或业务对象变化后必须生成新的 UUID；冲突时后端返回 409。
- 页面 pending 时禁用同一附件识别按钮。
- 409 `OCR_RECOGNITION_IN_PROGRESS` 时读取后端已有 recognition。
- `cached=true` 仍按成功结果展示，不提示用户再次支付或再次上传。
- 客户端不自行判断文件 hash，后端基于已登记文件和 checksum 去重。

## 16. Smoke 清单

### 16.1 Phase 1 只读契约

- [ ] 员工登录成功，租户上下文正常。
- [ ] `GET /ocr/capabilities?scene=wechat_pay_applyment` 返回 200。
- [ ] capabilities 只包含后端已启用文档类型。
- [ ] 响应不包含 SecretId、SecretKey、腾讯 Action 请求体或 signed URL。
- [ ] 未调用 `POST /workflow-tasks/:taskId/complete`。

### 16.2 费用票据真实 smoke（Phase 2 发布后）

- [ ] 上传 JPEG/PNG 票据，direct-complete 返回 `file_id`。
- [ ] 创建 `general_invoice` recognition 返回 200。
- [ ] 识别金额、日期、发票号和销售方可见并可编辑。
- [ ] 只应用用户选中字段。
- [ ] 保存费用草稿后重新读取字段一致。
- [ ] OCR 成功没有自动提交费用申请。
- [ ] 相同 idempotency key 重放返回同一 recognition。
- [ ] 相同文件再次识别返回 `cached=true`。
- [ ] 模糊图显示告警，仍允许手工填写。
- [ ] 越权 file ID 返回 `404 OCR_FILE_NOT_FOUND`，不泄露其他租户文件存在性。

回填证据：

```text
employee account:
tenant ID:
expense request ID:
file object ID:
recognition ID:
document type:
provider RequestId:
idempotent/cached:
saved item ID:
API request IDs:
orange commit:
orange document path:
```

所有截图和请求日志必须脱敏。

## 17. 验证命令建议

orange 实现后运行：

```bash
pnpm run typecheck
pnpm run check:file-size
pnpm run build:weapp:dev
git diff --check
```

真机验证必须补充网络请求证据，静态构建不能代替真实 OCR smoke。

## 18. 给小程序团队的回复模板

```text
gooes 已确认腾讯云 OCR 采用后端统一网关，小程序不要接腾讯 SDK 或保存腾讯云密钥。

对接文档：
/Users/leefo/Public/work/gooes/docs/tencent-ocr/2026-07-22-tencent-ocr-miniprogram-handoff.md

核心口径：
1. 图片继续走现有 COS direct upload，但必须保留 direct-complete 返回的 file_id。
2. 可用能力只读 GET /ocr/capabilities，不在小程序维护文档类型或腾讯 Action fallback。
3. 识别统一走 POST /ocr/recognitions，使用 file_object_id 和每次点击生成的 idempotency_key。
4. OCR 结果只填本地表单，必须让用户核对和修改，再走原有业务保存/提交接口。
5. OCR 不属于 workflow action，不调用 complete，也不自动提交进件或费用申请。
6. 错误和配额耗尽时保留手工填写，日志不得记录证件号、银行卡号、地址、signed URL 或识别原文。

请先完成通用上传结果 file_id 透传和 OcrService 封装。费用票据、门头和访客证照入口要等后端对应 capability 发布后再启用，不能提前用本地规则猜测。
```
