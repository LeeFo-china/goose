# 微信支付进件 OCR-first 交互重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将租户 Admin 微信支付开通申请重构为“上传资料、核对识别、补充信息、确认提交”的 OCR-first 流程，并支持安全的部分草稿、自动保存、识别冲突保护和可定位的提交阻塞项。

**Architecture:** API 先把“草稿可不完整”和“提交必须完整”拆开：草稿 schema、数据库列和加密敏感载荷允许部分值，正式提交继续由 readiness、preflight 和微信请求构造器严格校验。Admin 保持单个 form 和所有阶段面板常驻 DOM，通过纯 flow model 控制阶段，通过资料状态表承接上传与 OCR，通过串行 latest-write 队列自动保存，避免引入新的状态库或表单依赖。

**Tech Stack:** Bun、TypeScript、Fastify、Zod 4、Supabase/PostgreSQL、Next.js 15、React 19、Tailwind CSS 3、shadcn/Radix、lucide-react、Bun test、Playwright。

---

## 0. 文件职责

### 新建

- `supabase/migrations/20260723130000_allow_partial_wechat_pay_applyment_drafts.sql`
  - 允许草稿阶段的商户简称为空，同时保留非空值校验。
- `supabase/migrations/20260723133000_add_atomic_wechat_pay_applyment_submit.sql`
  - 原子完成租户提交状态转换与 submitted 审计事件，支持同申请 ID 幂等重试。
- `apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.ts`
  - 定义四阶段、资料处理状态、附件状态恢复、必传资料和阶段推进纯函数。
- `apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.test.ts`
  - 覆盖资料范围、阶段进度和推进阻塞。
- `apps/admin/components/finance/finance-wechat-pay-applyment-flow.tsx`
  - 渲染四阶段导航、常驻阶段面板和底部操作区。
- `apps/admin/components/finance/finance-wechat-pay-applyment-recognized-fields.tsx`
  - 按证照类别渲染 OCR 支持字段。
- `apps/admin/components/finance/finance-wechat-pay-applyment-supplement-fields.tsx`
  - 渲染不能由 OCR 稳定获得的业务补充字段。
- `apps/admin/components/finance/finance-wechat-pay-applyment-ocr-review.tsx`
  - 渲染证照预览、识别建议、冲突选择和资料组确认。
- `apps/admin/components/finance/finance-wechat-pay-applyment-autosave.ts`
  - 实现防抖、串行、只保留最新待保存值的草稿队列。
- `apps/admin/components/finance/finance-wechat-pay-applyment-autosave.test.ts`
  - 覆盖保存合并、串行执行、失败恢复和 flush。
- `apps/admin/components/finance/finance-wechat-pay-applyment-readiness.ts`
  - 将后端 blocker 转换为中文说明和目标阶段。
- `apps/admin/components/finance/finance-wechat-pay-applyment-readiness.test.ts`
  - 覆盖字段、附件和未知 blocker。
- `docs/tencent-ocr/2026-07-23-wechat-pay-applyment-ocr-first-handoff.md`
  - 记录最终 API 契约、Admin 行为和小程序只读对接口径。

### 修改

- `apps/api/src/schema/wechat-pay-applyments.ts`
  - 创建和更新接口改为部分草稿校验，字段存在时仍校验格式。
- `apps/api/src/schema/wechat-pay-applyments.test.ts`
  - 将“创建必须完整”测试改为“草稿可部分、提交仍阻塞”。
- `apps/api/src/repositories/wechat-pay-applyments.ts`
  - 将 `merchant_short_name` 类型改为 nullable。
- `apps/api/src/services/wechat-pay-applyments-types.ts`
  - 对齐部分草稿输入和敏感草稿类型。
- `apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts`
  - 区分部分加密草稿与完整提交载荷。
- `apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts`
  - 覆盖部分敏感载荷的加解密。
- `apps/api/src/services/wechat-pay-applyment-draft.ts`
  - 合并部分敏感字段，不在保存草稿时要求一次填全。
- `apps/api/src/services/wechat-pay-applyments.ts`
  - 创建空草稿、按需加密敏感值、更新部分草稿。
- `apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts`
  - 覆盖空草稿、逐字段加密保存和完整提交前校验。
- `apps/api/src/services/wechat-pay-applyment-preflight.ts`
  - 解密后输出缺失敏感字段 blocker。
- `apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts`
  - 覆盖部分敏感草稿的 preflight 结果。
- `apps/api/src/types/database.ts`
  - 通过 Supabase 类型生成同步 nullable 列。
- `apps/api/src/types/database-wechat-pay-contract.test.ts`
  - 编译期验证空商户简称草稿 insert。
- `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`
  - 对齐 nullable 商户简称和附件 OCR review 元数据。
- `apps/admin/components/finance/finance-wechat-pay-applyment-schema.ts`
  - 构建可清空的安全草稿 payload，敏感空值继续表示“保留原值”。
- `apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts`
  - 覆盖 null、附件、敏感替换和联系人切换。
- `apps/admin/components/finance/finance-wechat-pay-applyment-form-fields.tsx`
  - 增加字段来源、状态和人工修改回调。
- `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
  - 改为资料工作区，上传完成后通知父组件自动识别，增加缩略图和预览 Dialog。
- `apps/admin/components/ocr/ocr-field-review-dialog.tsx`
  - 保留通用 Dialog，但复用同一冲突行构造逻辑。
- `apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx`
  - 改为最终摘要和可定位的返回修改操作。
- `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
  - 集成四阶段、自动 OCR、自动保存、字段来源和提交 flush。
- `apps/admin/components/ocr/ocr-requests.ts`
  - 增加按 recognition ID 恢复识别结果的只读请求。
- `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`
  - 更新 OCR-first 页面结构契约。
- `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-table.tsx`
  - 对未填写商户简称的草稿显示安全 fallback。
- `apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx`
  - 对未填写商户简称的草稿显示安全 fallback。

### 删除

- `apps/admin/components/finance/finance-wechat-pay-applyment-steps.tsx`
  - 完成字段拆分和 flow 接入后删除旧 Tabs 步骤实现。

---

### Task 1: 允许数据库保存不完整进件草稿

**Files:**
- Create: `supabase/migrations/20260723130000_allow_partial_wechat_pay_applyment_drafts.sql`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/types/database-wechat-pay-contract.test.ts`
- Modify: `apps/api/src/repositories/wechat-pay-applyments.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-table.tsx`
- Modify: `apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx`

- [ ] **Step 1: 写数据库类型失败测试**

在 `database-wechat-pay-contract.test.ts` 的 `applymentInsert` 中把商户简称改为 null：

```ts
const applymentInsert: Inserts<"tenant_wechat_pay_applyments"> = {
  application_no: "WPA202607010001",
  merchant_short_name: null,
  tenant_id: "00000000-0000-4000-8000-000000000002",
};
```

- [ ] **Step 2: 运行类型检查确认失败**

Run:

```bash
pnpm run api:typecheck
```

Expected: FAIL，`merchant_short_name` 不能赋值为 `null`。

- [ ] **Step 3: 新增 migration**

```sql
ALTER TABLE public.tenant_wechat_pay_applyments
  ALTER COLUMN merchant_short_name DROP NOT NULL;

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.merchant_short_name
IS '商户简称；草稿阶段可为空，正式提交前由 readiness 强制要求';
```

复用既有
`tenant_wechat_pay_applyments_merchant_short_name_not_blank` 约束：
`merchant_short_name` 为 `NULL` 时，`btrim(merchant_short_name) <> ''`
结果为 `UNKNOWN`，因此允许 `NULL`；空白字符串的结果仍为 `FALSE`，
继续被拒绝。不要删除并重建该约束，避免全表重验和额外 DDL 锁。

回滚 SQL 记录在 migration 注释中：

```sql
UPDATE public.tenant_wechat_pay_applyments
SET merchant_short_name = application_no
WHERE merchant_short_name IS NULL;

ALTER TABLE public.tenant_wechat_pay_applyments
  ALTER COLUMN merchant_short_name SET NOT NULL;

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.merchant_short_name
IS NULL;
```

- [ ] **Step 4: 在本地数据库应用并重新生成类型**

Run:

```bash
supabase db reset
supabase gen types typescript --local > apps/api/src/types/database.ts
```

Expected: migration 全部成功，生成类型中的 Row/Insert/Update 均允许
`merchant_short_name: string | null`。

- [ ] **Step 5: 对齐仓库与 Admin 类型**

将 API repository 和 Admin shared type 改为：

```ts
merchant_short_name: string | null;
```

平台列表与详情统一使用：

```tsx
const merchantDisplayName =
  applyment.merchant_short_name?.trim() ||
  applyment.tenant?.name?.trim() ||
  "未填写商户简称";
```

- [ ] **Step 6: 运行验证**

Run:

```bash
bun test apps/api/src/types/database-wechat-pay-contract.test.ts
pnpm run api:typecheck
git diff --check
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add supabase/migrations/20260723130000_allow_partial_wechat_pay_applyment_drafts.sql apps/api/src/types/database.ts apps/api/src/types/database-wechat-pay-contract.test.ts apps/api/src/repositories/wechat-pay-applyments.ts apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-table.tsx 'apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx'
git commit -m "feat(payment): 支持不完整进件草稿"
```

---

### Task 2: 拆分部分草稿校验与完整提交校验

**Files:**
- Modify: `apps/api/src/schema/wechat-pay-applyments.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts`
- Modify: `apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyment-draft.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-content-validation.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-types.ts`
- Modify: `apps/api/src/repositories/wechat-pay-applyments.ts`
- Modify: `apps/api/src/repositories/ocr-recognitions.ts`
- Modify: `apps/api/src/types/database.ts`
- Create: `supabase/migrations/20260723133000_add_atomic_wechat_pay_applyment_submit.sql`
- Modify: `apps/api/src/services/wechat-pay-applyment-submission.ts`
- Modify: `apps/api/src/services/wechat-pay-applyment-submission.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyment-preflight.ts`
- Modify: `apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`

- [ ] **Step 1: 写部分草稿 schema 失败测试**

```ts
test("accepts an incomplete draft but validates fields that are present", () => {
  expect(CreateWechatPayApplymentSchema.safeParse({
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    contact_type: "LEGAL",
    attachments: [],
    draft_update_source: "autosave",
  }).success).toBe(true);

  expect(CreateWechatPayApplymentSchema.safeParse({
    identity_number: "bad-id",
  }).success).toBe(false);

  expect(UpdateWechatPayApplymentSchema.safeParse({
    merchant_short_name: null,
  }).success).toBe(true);

  expect(UpdateWechatPayApplymentSchema.safeParse({
    attachments: [{
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_recognition_id: "11111111-1111-4111-8111-111111111111",
      ocr_review_status: "confirmed",
    }],
  }).success).toBe(true);

  expect(UpdateWechatPayApplymentSchema.safeParse({
    attachments: [{
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_recognition_id: "not-a-uuid",
      ocr_review_status: "unknown",
    }],
  }).success).toBe(false);

  expect(SubmitWechatPayApplymentSchema.safeParse({
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    remark: null,
  }).success).toBe(true);
});
```

把原“requires official identity contact and settlement fields on create”测试删除，
完整性继续由现有 submit/readiness 测试覆盖。

- [ ] **Step 2: 写部分敏感载荷失败测试**

```ts
test("encrypts and decrypts a partial draft payload", () => {
  const payload = {
    identity_name: "张三",
    identity_number: "41000019900101001X",
  };
  const ciphertext = encryptApplymentSensitivePayload({
    context,
    payload,
    rootSecret,
  });

  expect(decryptApplymentSensitivePayload({
    context,
    ciphertext,
    rootSecret,
  })).toEqual(payload);
});
```

在 sensitive integration test 增加：

```ts
test("creates a shell draft without encrypted sensitive data", async () => {
  const service = await createService();
  await service.createDraft(authContext, {
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    contact_type: "LEGAL",
    attachments: [],
  });

  expect(createApplyment).toHaveBeenCalledWith(expect.objectContaining({
    merchant_short_name: null,
    has_sensitive_payload: false,
    sensitive_payload_ciphertext: null,
    sensitive_payload_version: null,
  }));
});

test("stores sensitive fields incrementally", async () => {
  findById.mockImplementationOnce(async () => ({
    ...applyment,
    has_sensitive_payload: false,
    sensitive_payload_version: null,
  }));
  const service = await createService();
  await service.updateDraft(authContext, applymentId, {
    identity_name: "张三",
  });

  const patch = updateApplyment.mock.calls[0]?.[0]?.patch;
  expect(patch?.has_sensitive_payload).toBe(true);
  expect(decryptApplymentSensitivePayload({
    context: { tenantId, applymentId, version: 1 },
    ciphertext: patch?.sensitive_payload_ciphertext ?? "",
    rootSecret,
  })).toEqual({ identity_name: "张三" });
});

test("does not create empty ciphertext for contact type only", async () => {
  findById.mockImplementationOnce(async () => ({
    ...applyment,
    has_sensitive_payload: false,
    sensitive_payload_version: null,
  }));
  const service = await createService();
  await service.updateDraft(authContext, applymentId, {
    contact_type: "LEGAL",
  });

  const patch = updateApplyment.mock.calls[0]?.[0]?.patch;
  expect(patch).not.toHaveProperty("sensitive_payload_ciphertext");
  expect(patch).not.toHaveProperty("has_sensitive_payload");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
bun test apps/api/src/schema/wechat-pay-applyments.test.ts apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts
```

Expected: FAIL，创建 schema 和敏感载荷仍要求完整字段。

- [ ] **Step 4: 定义草稿字段 schema**

在 `wechat-pay-applyments.ts` 中给附件增加可恢复但不包含 OCR 原始值的核对元数据：

```ts
const ApplymentAttachmentOcrReviewStatusSchema = z.enum([
  "uploaded",
  "review_required",
  "confirmed",
  "manual",
  "failed",
]);

const AttachmentSchema = z.object({
  category: WechatPayApplymentAttachmentCategorySchema.optional(),
  file_object_id: z.uuid("附件文件 ID 格式无效").optional(),
  object_key: requiredText(
    300,
    "附件对象 key 不能为空",
    "附件对象 key 不能超过 300 个字符",
  ),
  file_name: optionalText(120, "附件文件名不能超过 120 个字符"),
  content_type: optionalText(120, "附件类型不能超过 120 个字符"),
  size: z.coerce.number().int().min(0, "附件大小不能为负数").optional(),
  ocr_recognition_id: z
    .uuid("OCR 识别记录 ID 格式无效")
    .nullable()
    .optional(),
  ocr_review_status: ApplymentAttachmentOcrReviewStatusSchema
    .nullable()
    .optional(),
}).strict();
```

`finance-wechat-pay-applyment-shared.ts` 同步公开相同的前端类型：

```ts
export type WechatPayApplymentAttachmentOcrReviewStatus =
  | "uploaded"
  | "review_required"
  | "confirmed"
  | "manual"
  | "failed";

export type WechatPayApplymentAttachment = {
  category?: WechatPayApplymentAttachmentCategory | string | null;
  file_object_id?: string | null;
  object_key: string;
  file_name?: string | null;
  content_type?: string | null;
  size?: number | null;
  ocr_recognition_id?: string | null;
  ocr_review_status?: WechatPayApplymentAttachmentOcrReviewStatus | null;
};
```

附件 JSON 只保存 recognition ID 和审核状态，不得保存识别字段、身份证号、手机号、
银行卡号、签名 URL 或 provider 原始响应。

然后保留字段格式校验，但允许草稿字段缺失或清空：

```ts
const nullableDraft = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, z.null()]).optional();

const DraftTenantApplymentFields = {
  subject_type: nullableDraft(TenantApplymentFields.subject_type),
  merchant_short_name: nullableDraft(
    TenantApplymentFields.merchant_short_name,
  ),
  license_name: nullableDraft(TenantApplymentFields.license_name),
  license_code: nullableDraft(TenantApplymentFields.license_code),
  license_address: nullableDraft(TenantApplymentFields.license_address),
  license_period_begin: nullableDraft(
    TenantApplymentFields.license_period_begin,
  ),
  license_period_end: nullableDraft(
    TenantApplymentFields.license_period_end,
  ),
  legal_representative_name: nullableDraft(
    TenantApplymentFields.legal_representative_name,
  ),
  identity_doc_type: nullableDraft(
    TenantApplymentFields.identity_doc_type,
  ),
  identity_name: nullableDraft(TenantApplymentFields.identity_name),
  identity_number: nullableDraft(TenantApplymentFields.identity_number),
  identity_address: nullableDraft(TenantApplymentFields.identity_address),
  identity_period_begin: nullableDraft(
    TenantApplymentFields.identity_period_begin,
  ),
  identity_period_end: nullableDraft(
    TenantApplymentFields.identity_period_end,
  ),
  contact_type: nullableDraft(TenantApplymentFields.contact_type),
  super_admin_name: nullableDraft(TenantApplymentFields.super_admin_name),
  super_admin_phone: nullableDraft(TenantApplymentFields.super_admin_phone),
  super_admin_email: nullableDraft(TenantApplymentFields.super_admin_email),
  contact_identity_doc_type: nullableDraft(
    TenantApplymentFields.contact_identity_doc_type,
  ),
  contact_identity_number: nullableDraft(
    TenantApplymentFields.contact_identity_number,
  ),
  contact_identity_address: nullableDraft(
    TenantApplymentFields.contact_identity_address,
  ),
  contact_identity_period_begin: nullableDraft(
    TenantApplymentFields.contact_identity_period_begin,
  ),
  contact_identity_period_end: nullableDraft(
    TenantApplymentFields.contact_identity_period_end,
  ),
  service_phone: nullableDraft(TenantApplymentFields.service_phone),
  settlement_account_type: nullableDraft(
    TenantApplymentFields.settlement_account_type,
  ),
  settlement_account_name: nullableDraft(
    TenantApplymentFields.settlement_account_name,
  ),
  settlement_bank_name: nullableDraft(
    TenantApplymentFields.settlement_bank_name,
  ),
  settlement_bank_full_name: nullableDraft(
    TenantApplymentFields.settlement_bank_full_name,
  ),
  settlement_bank_branch_id: nullableDraft(
    TenantApplymentFields.settlement_bank_branch_id,
  ),
  settlement_account_number: nullableDraft(
    TenantApplymentFields.settlement_account_number,
  ),
  settlement_account_summary: nullableDraft(
    TenantApplymentFields.settlement_account_summary,
  ),
  settlement_id: nullableDraft(TenantApplymentFields.settlement_id),
  qualification_type: nullableDraft(
    TenantApplymentFields.qualification_type,
  ),
  business_scene_description: nullableDraft(
    TenantApplymentFields.business_scene_description,
  ),
  contact_address: nullableDraft(TenantApplymentFields.contact_address),
  attachments: TenantApplymentFields.attachments,
  remark: nullableDraft(TenantApplymentFields.remark),
  draft_update_source: z.enum([
    "autosave",
    "manual_save",
    "attachment_change",
    "ocr_review",
    "ocr_confirm",
    "manual_entry",
  ]).optional(),
} satisfies Record<string, z.ZodTypeAny>;

export const CreateWechatPayApplymentSchema = z
  .object(DraftTenantApplymentFields)
  .strict()
  .superRefine((input, context) => {
    addSettlementRuleIssues(
      getSettlementRuleIssues({
        subject_type: input.subject_type ?? undefined,
        settlement_id: input.settlement_id ?? undefined,
        qualification_type: input.qualification_type ?? undefined,
      }, false),
      (issue) => context.addIssue(issue),
    );
  })
  .refine(
    (value) => Object.keys(value).some(
      (key) => key !== "draft_update_source",
    ),
    {
    message: "至少需要提交一个草稿字段",
    },
  );

export const UpdateWechatPayApplymentSchema =
  CreateWechatPayApplymentSchema;
```

实现时必须完整列出原 `TenantApplymentFields` 的全部字段，不能使用未类型化的
`Object.fromEntries` 生成 schema。

- [ ] **Step 5: 区分部分敏感草稿与完整载荷**

```ts
const ApplymentSensitiveDraftPayloadSchema = z.object({
  identity_name: z.string().trim().min(1).nullable().optional(),
  identity_number: z.string().trim().min(1).nullable().optional(),
  identity_address: z.string().trim().min(1).nullable().optional(),
  contact_name: z.string().trim().min(1).nullable().optional(),
  contact_phone: z.string().trim().min(1).nullable().optional(),
  contact_email: z.string().trim().email().nullable().optional(),
  contact_identity_number: z.string().trim().min(1).nullable().optional(),
  contact_identity_address: z.string().trim().min(1).nullable().optional(),
  bank_account_name: z.string().trim().min(1).nullable().optional(),
  bank_account_number: z.string().trim().min(1).nullable().optional(),
}).strict();

export type ApplymentSensitiveDraftPayload = z.infer<
  typeof ApplymentSensitiveDraftPayloadSchema
>;

export type ApplymentSensitivePayload = {
  identity_name: string;
  identity_number: string;
  identity_address?: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  contact_identity_number?: string | null;
  contact_identity_address?: string | null;
  bank_account_name: string;
  bank_account_number: string;
};
```

`encryptApplymentSensitivePayload` 和 `decryptApplymentSensitivePayload`
改用 draft type。新增完整性函数：

```ts
export function getMissingApplymentSensitiveFields(
  payload: ApplymentSensitiveDraftPayload,
  contactType: string | null,
): string[] {
  const required = [
    "identity_name",
    "identity_number",
    "contact_name",
    "contact_phone",
    "contact_email",
    "bank_account_name",
    "bank_account_number",
  ] as const;
  const missing: string[] = required.filter(
    (key) => !String(payload[key] ?? "").trim(),
  );
  if (contactType === "SUPER") {
    for (const key of [
      "contact_identity_number",
      "contact_identity_address",
    ] as const) {
      if (!String(payload[key] ?? "").trim()) missing.push(key);
    }
  }
  return missing;
}

export function requireCompleteApplymentSensitivePayload(
  payload: ApplymentSensitiveDraftPayload,
  contactType: string | null,
): ApplymentSensitivePayload {
  const missing = getMissingApplymentSensitiveFields(payload, contactType);
  if (missing.length > 0) {
    throw Errors.business(
      400,
      "微信支付进件敏感资料不完整",
      "WECHAT_PAY_APPLYMENT_SENSITIVE_FIELDS_MISSING",
      { missing },
    );
  }
  return payload as ApplymentSensitivePayload;
}
```

- [ ] **Step 6: 修改 create/merge 行为**

`buildCreateSensitivePayload` 和 `mergeSensitivePayload` 返回
`ApplymentSensitiveDraftPayload`，移除保存草稿时的缺失字段异常。

`createDraft` 使用：

```ts
const sensitivePayload = buildCreateSensitivePayload(input);
const hasSensitivePayload = Object.values(sensitivePayload).some(
  (value) => value !== null && value !== undefined && String(value).trim() !== "",
);

const sensitivePatch = hasSensitivePayload
  ? {
      has_sensitive_payload: true,
      sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
        context: { tenantId, applymentId, version: 1 },
        payload: sensitivePayload,
        rootSecret: this.encryptionRootSecretFactory(),
      }),
      sensitive_payload_version: 1,
      sensitive_payload_updated_at: now,
    }
  : {
      has_sensitive_payload: false,
      sensitive_payload_ciphertext: null,
      sensitive_payload_version: null,
      sensitive_payload_updated_at: null,
    };
```

创建 repository payload 时明确写入：

```ts
merchant_short_name: input.merchant_short_name ?? null,
```

`buildSensitivePayloadUpdate` 在没有敏感 patch 时返回 `{}`；出现第一个敏感
字段时创建 version 1，后续继续解密合并。

`hasSensitiveReplacement` 不再把单独的 `contact_type` 变化视为首次敏感写入，
避免仅选择“法人”就生成空密文：

```ts
const shouldUpdateSensitivePayload =
  hasSensitiveReplacement(input.input) ||
  (
    input.current.has_sensitive_payload &&
    input.input.contact_type === "LEGAL"
  );
if (!shouldUpdateSensitivePayload) return {};
```

`hasSensitiveReplacement` 的候选字段只保留真实敏感值字段；已有敏感载荷从 `SUPER`
切换到 `LEGAL` 时仍进入 merge，并清空经办人身份证字段。

- [ ] **Step 7: 让安全字段 patch 正确处理 null**

`buildTenantApplymentSafePatch` 中会调用 `trim()` 或脱敏函数的字段不能继续只判断
`!== undefined`。身份证地址、管理员手机和银行账号统一改为：

```ts
if (input.identity_address === null) {
  patch.identity_address_masked = null;
} else if (typeof input.identity_address === "string") {
  patch.identity_address_masked = maskAddress(input.identity_address);
}

if (input.super_admin_phone === null) {
  patch.super_admin_phone_masked = null;
} else if (typeof input.super_admin_phone === "string") {
  patch.super_admin_phone_masked = maskPhone(input.super_admin_phone);
}

if (input.settlement_account_number === null) {
  patch.settlement_account_number_masked = null;
  patch.settlement_account_summary = null;
} else if (typeof input.settlement_account_number === "string") {
  patch.settlement_account_number_masked = maskBankAccountNumber(
    input.settlement_account_number,
  );
  patch.settlement_account_summary = buildSettlementAccountSummary(
    input.settlement_bank_name ?? null,
    input.settlement_account_number,
  );
}
```

对普通 nullable 字段继续使用 `assignIfDefined`，该函数只跳过 `undefined`，允许 null
进入 repository patch。

- [ ] **Step 8: 记录不含敏感值的字段变更审计**

`createDraft` 和 `updateDraft` 的 event metadata 只记录字段名，不记录字段值。
敏感输入字段必须由密文合并使用的同一 source-to-payload 映射派生，禁止再维护独立的
审计字段集合：

```ts
const sensitiveReplacementFields = getSensitiveReplacementFields(input);
```

在 service test 断言 metadata 包含字段名，但序列化结果不包含完整身份证号、手机号或
银行账号。OCR recognition 自身继续记录 recognition ID、操作者、租户和文件对象，
applyment event 不复制 OCR 原始结果。

`updateDraft` 必须先比较 current 安全投影与 patch，并对 attachments 做按对象字段的
结构化比较。服务端先构造完整 patch，`status`、`applyment_state`、`rejected_at`、
`rejected_reason` 等状态重置也必须参与差异和审计；draft 无任何实际变化时直接返回当前
detail，不执行 repository update。仅 `remark`、`business_scene_description` 这类不影响主体、联系人、
证照或结算的低风险叙述字段允许 autosave 抑制事件；其余实际变化和全部敏感替换始终
审计，不能信任客户端 `draft_update_source` 关闭事件。附件来源只从实际变化的附件
派生：非 confirmed 转 confirmed 为 `ocr_confirm`，转 manual 为 `manual_entry`，
文件或其他状态变化为 `attachment_change`。metadata 仍只包含排序后的字段名、
派生来源和非敏感状态。

- [ ] **Step 9: 把完整性校验放到 preflight**

解密后调用 `getMissingApplymentSensitiveFields`，每个缺失项追加：

```ts
for (const field of getMissingApplymentSensitiveFields(
  payload,
  input.applyment.contact_type,
)) {
  input.add({
    code: "APPLYMENT_REQUIRED_FIELD_MISSING",
    field: `sensitive.${field}`,
  });
}
```

正式 submit 仍先执行 readiness/preflight。`wechat-pay-applyment-submission.ts`
解密后必须调用完整性函数，再传给微信请求构造器：

```ts
const sensitiveDraft = decryptApplymentSensitivePayload({
  context: {
    tenantId: applyment.tenant_id,
    applymentId: applyment.id,
    version: sensitiveRecord.sensitive_payload_version,
  },
  ciphertext: sensitiveRecord.sensitive_payload_ciphertext,
  rootSecret: this.encryptionRootSecretFactory(),
});
const sensitive = requireCompleteApplymentSensitivePayload(
  sensitiveDraft,
  applyment.contact_type,
);
```

- [ ] **Step 10: 让租户提交可安全重试**

`SubmitWechatPayApplymentSchema` 增加必填 UUID `idempotency_key`。本申请每次提交使用
稳定 key `applyment.id`；service 先校验 key 与路径 ID 一致，再处理状态：

```ts
if (input.idempotency_key !== id) {
  throw Errors.business(
    409,
    "提交幂等键与申请不匹配",
    "WECHAT_PAY_APPLYMENT_IDEMPOTENCY_MISMATCH",
  );
}
const current = await this.getRequiredApplyment({ id, tenantId });
const editable = ["draft", "rejected", "wechat_editing"].includes(
  current.status,
);
if (!editable && current.submitted_at) {
  return this.toDetail(authContext, current);
}
this.assertEditable(current);
```

租户提交前必须解密敏感草稿并完成完整性、结算组合、企业对公账户和附件 OCR
核对/归属校验。首次提交通过
`submit_tenant_wechat_pay_applyment` RPC 在同一事务内完成状态转换和事件写入；
RPC 对申请行加锁并用 `expected_updated_at` 防止内容校验后的并发草稿覆盖，事件 metadata 只记录
`{ idempotency_key: input.idempotency_key }`。已提交或进入后续状态且
`submitted_at` 非空时，同 key 重试返回幂等结果，不重复事件；editable 状态仍可重新提交。
`wechat-pay-applyments.test.ts` 和 repository migration contract test 只覆盖 service
编排和 SQL 静态契约，不能作为真实数据库并发证明。migration 应用后的双连接并发与
事务回滚验证列入 Task 9 发布门禁。这里的提交只改变平台审核状态，不调用微信进件；
正式微信进件继续使用既有独立幂等机制。

- [ ] **Step 11: 运行 API 定向测试**

Run:

```bash
bun test apps/api/src/schema/wechat-pay-applyments.test.ts apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts apps/api/src/services/wechat-pay-applyment-submission.test.ts apps/api/src/services/wechat-pay-applyments.test.ts
pnpm run api:typecheck
```

Expected: PASS。

- [ ] **Step 12: 提交**

```bash
git add apps/api/src/schema/wechat-pay-applyments.ts apps/api/src/schema/wechat-pay-applyments.test.ts apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts apps/api/src/services/wechat-pay-applyment-draft.ts apps/api/src/services/wechat-pay-applyments.ts apps/api/src/services/wechat-pay-applyments-types.ts apps/api/src/services/wechat-pay-applyment-submission.ts apps/api/src/services/wechat-pay-applyment-submission.test.ts apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts apps/api/src/services/wechat-pay-applyment-preflight.ts apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts
git commit -m "refactor(payment): 拆分进件草稿与提交校验"
```

---

### Task 3: 建立四阶段和资料状态纯模型

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.ts`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.test.ts`

附件数组按 category 建立 last-write-wins 的当前 OCR 附件投影，初始化、资料阶段
和识别阶段必须复用同一投影。只有 `attachmentObjectKey` 与当前附件
`object_key` 一致的 state 才有效；删除附件、`SUPER -> LEGAL` 移除经办人附件、
替换附件或重复 category 时，旧 state 不得继续阻塞或放行。阶段恢复按 canonical
顺序逐级合并 local guard 与 backend blocker，不得先跑完全部 local guard 再统一
查 blocker。

- [ ] **Step 1: 写 flow model 失败测试**

```ts
import { describe, expect, test } from "bun:test";
import {
  APPLYMENT_STAGE_KEYS,
  buildInitialMaterialStates,
  getApplymentProgress,
  getInitialApplymentStage,
  getRequiredApplymentAttachments,
  canLeaveMaterialsStage,
  canLeaveRecognitionStage,
  updateAttachmentOcrReviewMetadata,
} from "./finance-wechat-pay-applyment-flow-model";

describe("wechat pay applyment flow model", () => {
  test("uses the confirmed OCR-first stage order", () => {
    expect(APPLYMENT_STAGE_KEYS).toEqual([
      "materials",
      "recognition",
      "supplement",
      "submit",
    ]);
    expect(getApplymentProgress("recognition")).toBe(50);
  });

  test("adds agent ID cards only for another super administrator", () => {
    expect(getRequiredApplymentAttachments("LEGAL")).toEqual([
      "license_copy",
      "legal_representative_id_card_front",
      "legal_representative_id_card_back",
    ]);
    expect(getRequiredApplymentAttachments("SUPER")).toContain(
      "contact_id_card_front",
    );
  });

  test("restores persisted OCR review state after a page reload", () => {
    expect(buildInitialMaterialStates([{
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_recognition_id: "11111111-1111-4111-8111-111111111111",
      ocr_review_status: "confirmed",
    }])).toEqual({
      license_copy: {
        status: "confirmed",
        attachmentObjectKey: "tenant/license.jpg",
        recognitionId: "11111111-1111-4111-8111-111111111111",
        fields: [],
        warnings: [],
        error: null,
      },
    });
  });

  test("updates only the matching attachment OCR metadata", () => {
    const attachments = [{
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_review_status: "uploaded" as const,
    }];
    expect(updateAttachmentOcrReviewMetadata(
      attachments,
      "tenant/license.jpg",
      {
        ocr_recognition_id: "11111111-1111-4111-8111-111111111111",
        ocr_review_status: "review_required",
      },
    )).toEqual([{
      ...attachments[0],
      ocr_recognition_id: "11111111-1111-4111-8111-111111111111",
      ocr_review_status: "review_required",
    }]);
  });

  test("blocks materials stage while required upload or recognition is busy", () => {
    expect(canLeaveMaterialsStage({
      contactType: "LEGAL",
      attachments: [],
      materialStates: {},
    })).toEqual({
      allowed: false,
      reason: "请先上传全部必传资料",
    });
  });

  test("requires each OCR-capable material to be confirmed or manual", () => {
    expect(canLeaveRecognitionStage({
      attachments: [{
        category: "license_copy",
        object_key: "tenant/license.jpg",
      }],
      materialStates: {
        license_copy: {
          status: "review_required",
          attachmentObjectKey: "tenant/license.jpg",
          recognitionId: "recognition-1",
          fields: [],
          warnings: [],
          error: null,
        },
      },
    })).toEqual({
      allowed: false,
      reason: "请先核对全部证照识别结果或选择手动填写",
    });
  });

  test("resumes at the first unfinished stage", () => {
    const attachments = [{
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_review_status: "review_required" as const,
    }, {
      category: "legal_representative_id_card_front",
      object_key: "tenant/id-front.jpg",
      ocr_review_status: "confirmed" as const,
    }, {
      category: "legal_representative_id_card_back",
      object_key: "tenant/id-back.jpg",
      ocr_review_status: "confirmed" as const,
    }];
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments,
      materialStates: buildInitialMaterialStates(attachments),
      blockerStages: ["supplement"],
    })).toBe("recognition");

    const confirmed = attachments.map((attachment) => ({
      ...attachment,
      ocr_review_status: "confirmed" as const,
    }));
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: confirmed,
      materialStates: buildInitialMaterialStates(confirmed),
      blockerStages: ["supplement"],
    })).toBe("supplement");
  });

  test("prioritizes a materials blocker over unresolved recognition", () => {
    const unresolvedAttachments = [{
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_review_status: "review_required" as const,
    }, {
      category: "legal_representative_id_card_front",
      object_key: "tenant/id-front.jpg",
      ocr_review_status: "confirmed" as const,
    }, {
      category: "legal_representative_id_card_back",
      object_key: "tenant/id-back.jpg",
      ocr_review_status: "confirmed" as const,
    }];
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: unresolvedAttachments,
      materialStates: buildInitialMaterialStates(unresolvedAttachments),
      blockerStages: ["materials"],
    })).toBe("materials");
  });
});
```

测试还必须覆盖孤立 state、附件替换前后 object key、重复 category 的
last-write-wins 行为，以及 readonly state/map 和 metadata 两个必填 key 的
TypeScript 编译契约。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯模型**

```ts
import type {
  OcrFieldSuggestion,
  OcrWarning,
} from "@gooes/domain";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
  WechatPayApplymentAttachmentOcrReviewStatus,
} from "./finance-wechat-pay-applyment-shared";
import {
  WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES,
} from "./finance-wechat-pay-applyment-shared";

export const APPLYMENT_STAGE_KEYS = [
  "materials",
  "recognition",
  "supplement",
  "submit",
] as const;

export type ApplymentStageKey =
  (typeof APPLYMENT_STAGE_KEYS)[number];

export type ApplymentMaterialStatus =
  | "missing"
  | "uploaded"
  | "recognizing"
  | "review_required"
  | "confirmed"
  | "manual"
  | "failed";

export type ApplymentMaterialState = {
  readonly status: ApplymentMaterialStatus;
  readonly attachmentObjectKey: string | null;
  readonly recognitionId: string | null;
  readonly fields: readonly OcrFieldSuggestion[];
  readonly warnings: readonly OcrWarning[];
  readonly error: string | null;
};

export type ApplymentMaterialStateMap = Readonly<
  Partial<
    Record<WechatPayApplymentAttachmentCategory, ApplymentMaterialState>
  >
>;

export type ApplymentAttachmentOcrReviewMetadata = {
  readonly ocr_recognition_id: string | null;
  readonly ocr_review_status:
    | WechatPayApplymentAttachmentOcrReviewStatus
    | null;
};

const BASE_REQUIRED = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
] as const;

const OCR_SUPPORTED_CATEGORIES: ReadonlySet<unknown> = new Set(
  Object.keys(WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES),
);

function isOcrSupportedCategory(
  category: WechatPayApplymentAttachment["category"],
): category is WechatPayApplymentAttachmentCategory {
  return typeof category === "string" &&
    OCR_SUPPORTED_CATEGORIES.has(category);
}

function buildCurrentOcrAttachments(
  attachments: readonly WechatPayApplymentAttachment[],
) {
  const current = new Map<
    WechatPayApplymentAttachmentCategory,
    WechatPayApplymentAttachment
  >();
  for (const attachment of attachments) {
    if (!isOcrSupportedCategory(attachment.category)) continue;
    current.set(attachment.category, attachment);
  }
  return current;
}

function restoreMaterialStatus(
  status: WechatPayApplymentAttachment["ocr_review_status"],
): ApplymentMaterialStatus {
  switch (status) {
    case "review_required":
    case "confirmed":
    case "manual":
    case "failed":
      return status;
    default:
      return "uploaded";
  }
}

export function buildInitialMaterialState(
  attachment: WechatPayApplymentAttachment,
): ApplymentMaterialState {
  return {
    status: restoreMaterialStatus(attachment.ocr_review_status),
    attachmentObjectKey: attachment.object_key,
    recognitionId: attachment.ocr_recognition_id ?? null,
    fields: [],
    warnings: [],
    error: null,
  };
}

export function buildInitialMaterialStates(
  attachments: readonly WechatPayApplymentAttachment[],
): ApplymentMaterialStateMap {
  const states: Partial<
    Record<WechatPayApplymentAttachmentCategory, ApplymentMaterialState>
  > = {};
  for (const [category, attachment] of buildCurrentOcrAttachments(attachments)) {
    states[category] = buildInitialMaterialState(attachment);
  }
  return states;
}

export function updateAttachmentOcrReviewMetadata(
  attachments: readonly WechatPayApplymentAttachment[],
  objectKey: string,
  metadata: ApplymentAttachmentOcrReviewMetadata,
): WechatPayApplymentAttachment[] {
  return attachments.map((attachment) =>
    attachment.object_key === objectKey
      ? { ...attachment, ...metadata }
      : attachment
  );
}

export function getApplymentProgress(stage: ApplymentStageKey): number {
  return (
    ((APPLYMENT_STAGE_KEYS.indexOf(stage) + 1) /
      APPLYMENT_STAGE_KEYS.length) *
    100
  );
}

export function getRequiredApplymentAttachments(contactType: string) {
  return contactType === "SUPER"
    ? [...BASE_REQUIRED, "contact_id_card_front", "contact_id_card_back"] as const
    : [...BASE_REQUIRED] as const;
}

export function canLeaveMaterialsStage(input: {
  contactType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
}) {
  const currentAttachments = buildCurrentOcrAttachments(input.attachments);
  const missing = getRequiredApplymentAttachments(input.contactType)
    .some((category) => !currentAttachments.has(category));
  if (missing) {
    return { allowed: false, reason: "请先上传全部必传资料" } as const;
  }
  const busy = Array.from(currentAttachments).some(([category, attachment]) => {
    const state = input.materialStates[category];
    return state?.attachmentObjectKey === attachment.object_key &&
      state.status === "recognizing";
  });
  return busy
    ? { allowed: false, reason: "证照正在识别，请稍候" } as const
    : { allowed: true, reason: null } as const;
}

export function canLeaveRecognitionStage(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
}) {
  const unresolved = Array.from(
    buildCurrentOcrAttachments(input.attachments),
  ).some(([category, attachment]) => {
    const state = input.materialStates[category];
    if (state?.attachmentObjectKey !== attachment.object_key) return true;
    return state.status !== "confirmed" && state.status !== "manual";
  });
  return unresolved
    ? {
        allowed: false,
        reason: "请先核对全部证照识别结果或选择手动填写",
      } as const
    : { allowed: true, reason: null } as const;
}

export function getInitialApplymentStage(input: {
  contactType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  blockerStages: readonly ApplymentStageKey[];
}): ApplymentStageKey {
  const blockerStages = new Set(input.blockerStages);
  if (
    !canLeaveMaterialsStage(input).allowed ||
    blockerStages.has("materials")
  ) {
    return "materials";
  }
  if (
    !canLeaveRecognitionStage(input).allowed ||
    blockerStages.has("recognition")
  ) {
    return "recognition";
  }
  return blockerStages.has("supplement") ? "supplement" : "submit";
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.ts apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.test.ts
git commit -m "feat(admin): 建立进件OCR流程模型"
```

---

### Task 4: 重构资料上传、预览和自动 OCR

**Files:**
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/ocr/ocr-requests.ts`

**异步与安全约束：**

- 上传完成后，父级必须以 `attachmentsRef.current` 为权威，按 category/object key
  将新附件 rebase 到最新列表；子组件回传的 `nextAttachments` 只用于兼容契约，不能覆盖
  上传等待期间已经写入的其他附件 OCR metadata。
- OCR create 成功即进入 `review_required` 并保留 recognition id、fields、warnings；
  随后的草稿保存失败只记录“识别结果保存失败”，重试时仅保存当前结果，不再次创建 OCR。
  只有 create 请求或恢复 GET 失败才进入 `failed`。
- 私有预览只根据 `file_object_id` 构造同源鉴权代理 URL，由后端校验租户、权限和附件场景后
  临时签名；不得直通外部 URL，也不得用 `object_key`、签名 URL 作为可见文件名 fallback。
  `wechat_pay_applyment` direct upload 必须登记为 private file object、强制 HEAD 确认，且
  storage response 不生成或返回永久 public URL。
- 私有预览权限与进件详情保持一致：平台身份必须有
  `platform.wechat_pay.applyment.read`，租户身份必须有
  `wechat_pay.applyment.read` 或 `wechat_pay.applyment.submit`，并继续校验租户归属、
  文件场景和 provider。权限判断位于 service/access-policy 边界。
- materials hook 的 mounted ref effect 在每次 setup 时显式恢复为 `true`，cleanup 置为
  `false`，保证 React Strict Mode 的 setup→cleanup→setup 重放后仍可提交状态更新。
- 选择手动填写时，同 object key 的 material state 必须立即切换为 `manual`，保留附件、
  recognition id、fields 与 warnings，并清除 OCR error；若 `manual_entry` 草稿保存失败，
  本地 manual 意图不回退为 failed，显示保存错误且重试仅再次持久化。
- 进件详情显式返回 `can_edit`：只有租户拥有 `wechat_pay.applyment.submit` 且申请处于
  draft/rejected/wechat_editing 时为 true。Admin 上传、OCR 授权、保存、重试和提交写控件
  必须以该服务端 capability 为准；进件 direct upload init/complete 在 upload service
  层对该 scene 强制 submit 权限，不能让只读账号产生 file object。
  尚无 applyment 记录时按“可创建新 draft”处理，但仍必须拥有 submit 权限；此时
  `can_edit` 可为 true，`can_submit` 必须为 false。
- 上传附件 checkpoint 失败时保留未持久化 object key，并将对应 tile 标记为
  “附件保存失败”；“重试保存”只提交当前 attachments。保存成功后才清 key/error，并在
  已授权且 capability 支持时最多启动一次 OCR。经营场景等非 OCR 附件使用相同错误与
  persistence-only 重试路径，但保存成功后不得触发 OCR。替换或删除附件同步清理旧 key/error。
- capability 不可用触发的 automatic manual 与显式 manual 共用持久化失败语义：
  本地保持 manual，失败显示“手动填写状态保存失败”，重试只保存且不触发 OCR。
- 私有预览 302 必须返回 `Cache-Control: private, no-store, max-age=0`、
  `Pragma: no-cache`、`Referrer-Policy: no-referrer`；Admin proxy 对 redirect 只转发
  Location 和这三个安全响应头。缩略图使用 lazy loading，加载失败显示稳定失败状态，
  Dialog 提供重试和关闭。
- materials 异步任务捕获 reset generation；reset/unmount 后旧恢复、capability、checkpoint
  或 recognition 结果不得写回，也不得在新草稿上启动 persist/OCR。识别和持久化编排拆到
  单一职责 coordinator，materials hook 保持低于 500 行；save callback 的 applymentRef
  更新及 save/recognition/manual/checkpoint reject 的错误报告也必须在同一个 generation
  guard 内，旧草稿请求完成或失败后不得提交状态、checkpoint error 或全局错误副作用。
- checkpoint 等待附件保存期间允许用户撤销 OCR 授权；保存完成后必须从 ref 实时读取
  consent，并再次核对 generation 与当前 category/object key，满足全部条件后才能启动 OCR，
  不得使用保存开始时捕获的布尔快照。
- `wechat_pay_applyment` 私有上传 complete 必须从对象存储 HEAD 取得权威 size/MIME：
  size 必须大于 0 且不超过场景上限，MIME 必须为允许图片，并与 init 声明完全一致；
  HEAD 缺失时不得回退客户端声明。复用 onboarding 私有上传的服务层验证模式。
- `wechat_pay_applyment` init/complete 必须使用实时 AuthContext 的 tenant/employee，并在
  JWT 同时携带旧 claim 时校验两者完全一致；不一致直接拒绝，但不得改变其他 upload scene
  的既有身份解析语义。两端共用 storage service 导出的单一 scene policy（2MB、JPEG/PNG），
  init 签入 Content-Length、Content-Type 和禁止覆盖头，并用短时 intent 绑定 scene、
  tenant、object key、size 与 MIME；complete 先验证 intent，再以 HEAD 权威复核。
- retry/retrySave 加入队列时不能固化旧 state/action；真正执行前按 object key 重取当前附件、
  material state、checkpoint error 和 retry action。相同 object key 的 in-flight 操作共享
  一个 Promise，连续双击最多创建一次 OCR，已经进入 review_required 的附件不得再次 OCR。
- 删除附件以及 SUPER→LEGAL 自动移除经办人证件采用 optimistic update 时，checkpoint
  保存失败必须回滚至操作前的附件和联系人类型，并显示可见错误，不允许本地静默消失。
- 隐藏 file input 由可见 shadcn Button 触发时必须设置 `tabIndex={-1}` 和
  `aria-hidden="true"`，避免成为无标签焦点；上传按钮、重试 coordinator、联系人切换
  helper 和请求文件校验按职责拆分，使 materials hook、附件组件和 controller 明显低于
  500 行。
- 浏览器直传失败改走同源 proxy 时，proxy 会重新 init 新对象；成功响应必须返回完整的
  第二次 init 和 private complete 结果，client 的 DirectUploadResult.init 必须原样采用该
  init，包括 object key、upload URL、headers 和 intent，禁止将第二个 object key 拼接到
  第一次 init。proxy 的 init/COS/complete 网络异常统一返回脱敏 JSON 502，COS 非 2xx
  正文不得回传前端。
- 删除附件或联系人切换触发自动删除前，必须同时快照 attachments、material states、
  unpersisted object keys 和 checkpoint errors；保存失败恢复完整快照，使原附件继续显示
  “仅重试保存”，且恢复本身不得绕过 checkpoint 启动 OCR。
- 附件删除和 SUPER→LEGAL 自动删除使用 object-key mutation intent；执行时在同一材料
  operation queue 内基于最新 attachments 重算目标列表，再依次捕获快照、乐观更新、持久化
  和失败回滚。联系人类型 override 与附件列表同次保存，重叠 mutation 不得造成服务端与
  本地列表分叉。

- [ ] **Step 1: 写资料工作区结构失败测试**

在 page layout test 增加：

```ts
test("uses materials as the first stage and removes per-file OCR buttons", () => {
  const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
  const attachmentSource = readSource(
    "./finance-wechat-pay-applyment-attachments.tsx",
  );
  const ocrRequestSource = readSource("../ocr/ocr-requests.ts");

  expect(panelSource).toContain("getInitialApplymentStage");
  expect(attachmentSource).toContain("onUploaded");
  expect(attachmentSource).toContain("AttachmentPreviewDialog");
  expect(attachmentSource).toContain("证照识别暂不可用");
  expect(attachmentSource).not.toContain("识别并回填");
  expect(ocrRequestSource).toContain("fetchApplymentOcrRecognition");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: FAIL，当前仍使用旧步骤和手动 OCR 按钮。

- [ ] **Step 3: 修改附件组件契约**

```ts
type AttachmentsFieldProps = {
  attachments: WechatPayApplymentAttachment[];
  contactType: string;
  editable: boolean;
  disabled?: boolean;
  materialStates: ApplymentMaterialStateMap;
  supportedOcrDocumentTypes: ReadonlySet<string>;
  onUploaded: (input: {
    attachment: WechatPayApplymentAttachment;
    nextAttachments: WechatPayApplymentAttachment[];
  }) => void;
  onRetryRecognition: (
    attachment: WechatPayApplymentAttachment,
  ) => void;
  onChange: (
    attachments: WechatPayApplymentAttachment[],
  ) => void;
};
```

`uploadAttachment` 完成后先构造 `nextAttachments`，再调用
`onUploaded({ attachment: nextAttachment, nextAttachments })`。新附件明确带上：

```ts
const nextAttachment: WechatPayApplymentAttachment = {
  category,
  file_object_id: uploaded.id,
  object_key: uploaded.object_key,
  file_name: uploaded.file_name,
  content_type: uploaded.content_type,
  size: uploaded.size,
  ocr_recognition_id: null,
  ocr_review_status: "uploaded",
};
```

删除
`onRecognize` 和每张证照的“识别并回填”按钮。

- [ ] **Step 4: 增加一次性 OCR 授权**

资料清单上方使用 shadcn Checkbox，授权状态只保存在当前页面会话：

```tsx
<Field orientation="horizontal">
  <Checkbox
    id="wechat-pay-applyment-ocr-consent"
    checked={ocrConsent}
    onCheckedChange={(checked) => {
      handleOcrConsentChange(checked === true);
    }}
  />
  <FieldLabel htmlFor="wechat-pay-applyment-ocr-consent">
    同意使用已上传证照进行信息识别和申请资料回填
  </FieldLabel>
</Field>
```

首次勾选后，对已上传且状态仍为 `uploaded` 的支持资料逐个调用
`recognizeAttachment`；后端现有 dedupe 保证同一文件不会重复计费。取消勾选只停止新的
自动识别，不删除已经保存的 recognition 记录或已确认字段。

- [ ] **Step 5: 增加缩略图和 shadcn Dialog 预览**

每个上传项使用固定 `aspect-[4/3]` 预览区：

```tsx
<button
  type="button"
  className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted"
  onClick={() => setPreviewAttachment(attachment)}
>
  <Image
    src={previewUrl}
    alt={getWechatPayApplymentAttachmentCategoryLabel(category)}
    fill
    unoptimized
    className="object-contain"
    sizes="(max-width: 768px) 100vw, 320px"
  />
</button>
```

预览 Dialog 使用稳定尺寸、`object-contain`、文件名、状态和关闭按钮。不要把证照
URL 写入可见文本或日志。

- [ ] **Step 6: 在 panel 中实现上传后自动识别**

```ts
async function handleAttachmentUploaded(input: {
  attachment: WechatPayApplymentAttachment;
  nextAttachments: WechatPayApplymentAttachment[];
}) {
  setAttachments(input.nextAttachments);
  await saveApplymentDraft({
    attachments: input.nextAttachments,
    draft_update_source: "attachment_change",
  });

  const category = input.attachment.category as
    | WechatPayApplymentAttachmentCategory
    | undefined;
  const documentType = category
    ? WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category]
    : undefined;
  if (!ocrConsent || !category || !documentType) return;
  if (!supportedOcrDocumentTypes.has(documentType)) {
    const nextAttachments = updateAttachmentOcrReviewMetadata(
      input.nextAttachments,
      input.attachment.object_key,
      {
        ocr_recognition_id: null,
        ocr_review_status: "manual",
      },
    );
    setAttachments(nextAttachments);
    setMaterialState(category, {
      status: "manual",
      attachmentObjectKey: input.attachment.object_key,
      recognitionId: null,
      fields: [],
      warnings: [],
      error: null,
    });
    await saveApplymentDraft({
      attachments: nextAttachments,
      draft_update_source: "manual_entry",
    });
    return;
  }
  await recognizeAttachment(input.attachment);
}
```

上传完成但未授权 OCR 时，把当前资料状态设置为：

```ts
setMaterialState(category, {
  status: "uploaded",
  attachmentObjectKey: input.attachment.object_key,
  recognitionId: null,
  fields: [],
  warnings: [],
  error: null,
});
```

`recognizeAttachment` 不再打开 Dialog，而是写入 category 对应状态：

```ts
const nextAttachments = updateAttachmentOcrReviewMetadata(
  attachmentsRef.current,
  attachment.object_key,
  {
    ocr_recognition_id: result.recognition.id,
    ocr_review_status: "review_required",
  },
);
attachmentsRef.current = nextAttachments;
setAttachments(nextAttachments);
setMaterialState(category, {
  status: "review_required",
  attachmentObjectKey: attachment.object_key,
  recognitionId: result.recognition.id,
  fields: mapApplymentOcrFields(category, result.recognition.fields),
  warnings: result.recognition.warnings,
  error: null,
});
await saveApplymentDraft({
  attachments: nextAttachments,
  draft_update_source: "ocr_review",
});
```

首次勾选 OCR 授权后使用 `for...of` 逐个 `await recognizeAttachment`，不并发写同一份
attachments 草稿。Task 7 再把这里的直接保存统一替换为 latest-write 自动保存队列。

- [ ] **Step 7: 支持刷新后恢复待核对结果**

在 `ocr-requests.ts` 增加现有只读接口封装。GET 返回单个 recognition view，不是 POST
创建接口的 `{ recognition, idempotent, cached }` 包装：

```ts
export function fetchApplymentOcrRecognition(recognitionId: string) {
  return requestBackendJson<OcrRecognitionResult["recognition"]>(
    `/ocr/recognitions/${encodeURIComponent(recognitionId)}`,
    { fallbackMessage: "证照识别结果加载失败" },
  );
}
```

panel 的资料状态用 `buildInitialMaterialStates(applyment.attachments)` 初始化。组件首次加载
时，只对 `ocr_review_status === "review_required"` 且包含
`ocr_recognition_id` 的附件调用 `fetchApplymentOcrRecognition`，按附件类别重新执行
`mapApplymentOcrFields` 并恢复 fields/warnings：

```ts
const persistedReviewAttachments = useMemo(
  () => (applyment?.attachments ?? []).filter(
    (attachment) =>
      attachment.ocr_review_status === "review_required" &&
      attachment.ocr_recognition_id,
  ),
  [applyment?.attachments],
);

useEffect(() => {
  let cancelled = false;
  void Promise.all(persistedReviewAttachments.map(async (attachment) => {
    const recognitionId = attachment.ocr_recognition_id;
    const category = attachment.category;
    if (
      !recognitionId ||
      typeof category !== "string" ||
      !(category in WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES)
    ) {
      return;
    }
    const typedCategory = category as WechatPayApplymentAttachmentCategory;
    try {
      const recognition = await fetchApplymentOcrRecognition(
        recognitionId,
      );
      if (cancelled) return;
      setMaterialState(typedCategory, {
        status: "review_required",
        attachmentObjectKey: attachment.object_key,
        recognitionId: recognition.id,
        fields: mapApplymentOcrFields(
          typedCategory,
          recognition.fields,
          contactType,
        ),
        warnings: recognition.warnings,
        error: null,
      });
    } catch (error) {
      if (cancelled) return;
      setMaterialState(typedCategory, {
        ...buildInitialMaterialState(attachment),
        status: "failed",
        error: error instanceof Error
          ? error.message
          : "证照识别结果加载失败，请重试",
      });
    }
  }));
  return () => {
    cancelled = true;
  };
}, [contactType, persistedReviewAttachments]);
```

实现时把单附件初始化提取为 flow model 导出的
`buildInitialMaterialState(attachment)`，`buildInitialMaterialStates` 复用它，避免
复制状态恢复逻辑。`confirmed` 和 `manual` 在刷新后直接保留已持久化状态，不重复 OCR；
`review_required` 的识别记录若过期或加载失败，保留附件并显示“重新识别”或“手动填写”，
不得把失败吞掉或把资料当作已确认。

- [ ] **Step 8: 处理 capability 降级**

capabilities 为空或加载失败时保留上传入口，显示 shadcn Alert：

```tsx
<Alert>
  <Info />
  <AlertTitle>证照识别暂不可用</AlertTitle>
  <AlertDescription>
    已上传资料仍会保存，请在下一步手动填写。
  </AlertDescription>
</Alert>
```

- [ ] **Step 9: 运行测试和 Admin 类型检查**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
pnpm --dir apps/admin check
```

Expected: PASS。

- [ ] **Step 10: 提交**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx apps/admin/components/ocr/ocr-requests.ts
git commit -m "feat(admin): 上传证照后自动识别"
```

---

### Task 5: 将 OCR 核对改为页面内工作区

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-ocr-review.tsx`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-recognized-fields.tsx`
- Modify: `apps/admin/components/ocr/ocr-field-review-dialog.tsx`
- Modify: `apps/admin/components/ocr/ocr-field-review-dialog.test.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-form-fields.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [ ] **Step 1: 扩展 OCR 冲突测试**

```ts
test("never selects a manual conflict for silent replacement", () => {
  const rows = buildOcrFieldReviewRows([
    field("license_name", "新识别名称"),
  ], {
    license_name: "人工修正名称",
  });

  expect(rows).toEqual([
    expect.objectContaining({
      selected: false,
      state: "conflict",
    }),
  ]);
});

test("copies legal identity name to the legal super administrator", () => {
  expect(mapApplymentOcrFields(
    "legal_representative_id_card_front",
    [field("identity_name", "张三")],
    "LEGAL",
  )).toEqual([
    expect.objectContaining({ key: "identity_name", value: "张三" }),
    expect.objectContaining({ key: "super_admin_name", value: "张三" }),
  ]);
});
```

在 page layout test 增加：

```ts
expect(panelSource).toContain("FinanceWechatPayApplymentOcrReview");
expect(panelSource).not.toContain("OcrFieldReviewDialog");
expect(panelSource).not.toContain("setOcrDialogOpen");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test apps/admin/components/ocr/ocr-field-review-dialog.test.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: page layout contract FAIL。

- [ ] **Step 3: 给字段组件增加来源状态**

`TextField`、`TextareaField` 和 `SelectField` 增加：

```ts
type FieldSource = "ocr" | "manual" | "tenant" | "stored";

type FieldSourceProps = {
  source?: FieldSource;
  onValueChange?: (value: string) => void;
};
```

标签右侧显示非颜色唯一状态：

```tsx
{source ? (
  <Badge variant="outline">
    {source === "ocr"
      ? "证照识别"
      : source === "manual"
        ? "已修改"
        : source === "tenant"
          ? "租户资料"
          : "已安全保存"}
  </Badge>
) : null}
```

输入变化时调用 `onValueChange(event.currentTarget.value)`，由 panel 把字段来源改为
`manual`。程序设置 `appliedValue` 时不触发人工修改回调。

- [ ] **Step 4: 按证照类别拆分实际字段**

`finance-wechat-pay-applyment-recognized-fields.tsx` 明确映射：

| 资料类别 | 字段 |
| --- | --- |
| `license_copy` | `license_name`、`license_code`、`license_address`、`license_period_begin`、`license_period_end`、`legal_representative_name` |
| `legal_representative_id_card_front` | `identity_name`、`identity_number`、`identity_address` |
| `legal_representative_id_card_back` | `identity_period_begin`、`identity_period_end` |
| `contact_id_card_front` | `super_admin_name`、`contact_identity_number`、`contact_identity_address` |
| `contact_id_card_back` | `contact_identity_period_begin`、`contact_identity_period_end` |
| `settlement_account_proof` | `settlement_account_number`、`settlement_bank_name` |

当 `contact_type === "LEGAL"` 时，法人身份证人像面的 `identity_name` 同时生成
`identity_name` 和 `super_admin_name` 两条建议；当 `contact_type === "SUPER"`
时，`super_admin_name` 只来自经办人身份证人像面。映射使用 `flatMap` 明确返回两个
字段，不能在渲染层根据标签猜测：

```ts
export function mapApplymentOcrFields(
  category: string,
  fields: readonly OcrFieldSuggestion[],
  contactType: string,
) {
  const fieldMap = category === "contact_id_card_front"
    ? CONTACT_FRONT_FIELD_MAP
    : category === "contact_id_card_back"
      ? CONTACT_BACK_FIELD_MAP
      : null;
  return fields.flatMap((field) => {
    const mapped = fieldMap?.[field.key];
    const candidates: OcrFieldSuggestion[] = [
      mapped
        ? { ...field, key: mapped[0], label: mapped[1] }
        : field,
    ];
    if (
      category === "legal_representative_id_card_front" &&
      field.key === "identity_name" &&
      contactType === "LEGAL"
    ) {
      candidates.push({
        ...field,
        key: "super_admin_name",
        label: "超级管理员姓名",
      });
    }
    return candidates.filter((item) => APPLYMENT_FIELD_KEYS.has(item.key));
  });
}
```

现有经办人测试调用改为：

```ts
mapApplymentOcrFields("contact_id_card_front", fields, "SUPER");
```

每个类别面板始终挂载，只使用 `hidden={selectedCategory !== category}` 隐藏，保证
FormData 和原生校验能读取所有字段。

- [ ] **Step 5: 实现页面内核对布局**

```tsx
<div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
  <section className="min-w-0 border-r pr-4">
    <AttachmentDocumentPreview
      attachment={selectedAttachment}
      status={selectedState.status}
    />
  </section>
  <section className="min-w-0">
    <RecognitionWarnings warnings={selectedState.warnings} />
    <FinanceWechatPayApplymentRecognizedFields
      selectedCategory={selectedCategory}
      applyment={applyment}
      appliedValues={ocrAppliedValues}
      fieldSources={fieldSources}
      onManualChange={onManualChange}
    />
    <OcrConflictRows
      rows={buildOcrFieldReviewRows(
        selectedState.fields,
        currentValues,
      )}
      onApply={onApply}
    />
  </section>
</div>
```

窄屏改为单列。识别正常字段可折叠，冲突和缺失字段保持展开。没有 confidence 时不显示
百分比。

- [ ] **Step 6: 提供明确的手动填写降级**

OCR 不支持、识别失败或用户不希望采用识别结果时，显示：

```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => onUseManualEntry(selectedCategory)}
>
  <PencilLine data-icon="inline-start" />
  改为手动填写
</Button>
```

该操作把资料状态设为 `manual`，保留已上传证照和 recognition 记录，右侧实际字段继续
可编辑。切换到手动填写不自动清空已经应用的值；用户修改后字段来源标记为“已修改”。
处理函数同时持久化附件核对状态，刷新后不能重新阻塞：

```ts
async function useManualEntry(
  category: WechatPayApplymentAttachmentCategory,
) {
  const selected = attachmentsRef.current.find(
    (attachment) => attachment.category === category,
  );
  if (!selected) return;
  const nextAttachments = updateAttachmentOcrReviewMetadata(
    attachmentsRef.current,
    selected.object_key,
    {
      ocr_recognition_id: selected.ocr_recognition_id ?? null,
      ocr_review_status: "manual",
    },
  );
  const nextSelected = nextAttachments.find(
    (attachment) => attachment.object_key === selected.object_key,
  );
  if (!nextSelected) return;
  attachmentsRef.current = nextAttachments;
  setAttachments(nextAttachments);
  setMaterialState(category, {
    ...buildInitialMaterialState(nextSelected),
    status: "manual",
  });
  await saveApplymentDraft({
    attachments: nextAttachments,
    draft_update_source: "manual_entry",
  });
}
```

- [ ] **Step 7: 应用值时保护人工修改**

默认只应用 `row.selected === true` 的字段。用户显式勾选冲突项后才允许覆盖：

```ts
async function applyRecognitionRows(rows: readonly OcrFieldReviewRow[]) {
  const values = Object.fromEntries(
    rows
      .filter((row) => row.selected)
      .map((row) => [row.field.key, String(row.field.value ?? "")]),
  );
  const selected = attachmentsRef.current.find(
    (attachment) => attachment.category === selectedCategory,
  );
  const form = formRef.current;
  if (!selected || !form) return;
  const nextAttachments = updateAttachmentOcrReviewMetadata(
    attachmentsRef.current,
    selected.object_key,
    {
      ocr_recognition_id: selectedState.recognitionId,
      ocr_review_status: "confirmed",
    },
  );
  attachmentsRef.current = nextAttachments;
  setAttachments(nextAttachments);
  setOcrAppliedValues((current) => ({ ...current, ...values }));
  setFieldSources((current) => ({
    ...current,
    ...Object.fromEntries(Object.keys(values).map((key) => [key, "ocr"])),
  }));
  setMaterialState(selectedCategory, {
    ...selectedState,
    status: "confirmed",
    error: null,
  });
  await saveApplymentDraft({
    ...buildCurrentApplymentPayload(
      form,
      nextAttachments,
    ),
    ...values,
    attachments: nextAttachments,
    draft_update_source: "ocr_confirm",
  });
}
```

把 `buildCurrentApplymentPayload` 的第二个参数改为可选 attachments override。OCR 值和
`ocr_review_status="confirmed"` 必须在同一个 PUT 中保存，不能先把附件标记为已确认、
再异步保存识别值；否则请求中断会形成“已确认但字段未入草稿”的假状态。Task 7 接入自动
保存队列后仍保留这一原子 payload。

- [ ] **Step 8: 运行测试**

Run:

```bash
bun test apps/admin/components/ocr/ocr-field-review-dialog.test.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
pnpm --dir apps/admin check
```

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-ocr-review.tsx apps/admin/components/finance/finance-wechat-pay-applyment-recognized-fields.tsx apps/admin/components/ocr/ocr-field-review-dialog.tsx apps/admin/components/ocr/ocr-field-review-dialog.test.tsx apps/admin/components/finance/finance-wechat-pay-applyment-form-fields.tsx apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
git commit -m "feat(admin): 内联核对进件OCR结果"
```

---

### Task 6: 拆分业务补充字段并替换旧 Tabs 流程

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-flow.tsx`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-supplement-fields.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`
- Delete: `apps/admin/components/finance/finance-wechat-pay-applyment-steps.tsx`

- [ ] **Step 1: 写四阶段页面失败测试**

```ts
test("renders sequential OCR-first stages without Radix Tabs", () => {
  const flowSource = readSource("./finance-wechat-pay-applyment-flow.tsx");
  const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");

  expect(flowSource).toContain("上传资料");
  expect(flowSource).toContain("核对识别");
  expect(flowSource).toContain("补充信息");
  expect(flowSource).toContain("确认提交");
  expect(flowSource).toContain("data-applyment-stage");
  expect(flowSource).not.toContain("@/components/ui/tabs");
  expect(panelSource).toContain("FinanceWechatPayApplymentFlow");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: FAIL，flow 文件不存在。

- [ ] **Step 3: 实现阶段导航**

```tsx
const STAGE_LABELS: Record<ApplymentStageKey, string> = {
  materials: "上传资料",
  recognition: "核对识别",
  supplement: "补充信息",
  submit: "确认提交",
};

export function ApplymentStagePanel(props: {
  stage: ApplymentStageKey;
  activeStage: ApplymentStageKey;
  children: ReactNode;
}) {
  return (
    <section
      data-applyment-stage={props.stage}
      hidden={props.stage !== props.activeStage}
      className="min-h-[30rem]"
    >
      {props.children}
    </section>
  );
}
```

顶部步骤状态条使用普通列表、Button 和 Progress，不使用 Tabs。未完成前置阶段的按钮
禁用，已完成阶段可返回。

下一步处理统一使用：

```ts
function handleNextStage() {
  if (activeStage === "materials") {
    const result = canLeaveMaterialsStage({
      contactType,
      attachments,
      materialStates,
    });
    if (!result.allowed) return setStageError(result.reason);
    return setActiveStage("recognition");
  }
  if (activeStage === "recognition") {
    const result = canLeaveRecognitionStage({
      attachments,
      materialStates,
    });
    if (!result.allowed) return setStageError(result.reason);
    return setActiveStage("supplement");
  }
  if (activeStage === "supplement") {
    if (!validateStage(formRef.current, "supplement")) return;
    return setActiveStage("submit");
  }
}
```

`validateStage` 只查询指定 `[data-applyment-stage]` 内的 `:invalid` 控件，定位并聚焦
第一个错误；正式提交继续使用 `validateAllStages` 检查整个 form。

- [ ] **Step 4: 拆分补充字段**

补充字段组件只包含：

```ts
const SUPPLEMENT_FIELD_NAMES = [
  "merchant_short_name",
  "super_admin_phone",
  "super_admin_email",
  "service_phone",
  "settlement_account_type",
  "settlement_account_name",
  "settlement_bank_full_name",
  "settlement_bank_branch_id",
  "settlement_id",
  "qualification_type",
  "business_scene_description",
  "contact_address",
  "remark",
] as const;
```

主体类型和超级管理员身份在资料阶段使用现有 shadcn Select。补充阶段只读展示其当前
选择，并提供“返回上传资料修改”按钮。

- [ ] **Step 5: 更新最终复核**

`FinanceWechatPayApplymentReview` 改为四个摘要区：

```ts
const REVIEW_SECTIONS = [
  { key: "subject", label: "主体和营业执照", target: "recognition" },
  { key: "contact", label: "法人和超级管理员", target: "recognition" },
  { key: "settlement", label: "经营及结算", target: "supplement" },
  { key: "attachments", label: "申请附件", target: "materials" },
] as const;
```

每区使用文本按钮“返回修改”，调用 `onStageChange(target)`，不再依赖旧 Tabs。

- [ ] **Step 6: 删除旧 steps 文件并更新 import**

确认以下内容已经迁移后删除旧文件：

- 主体类型和联系人类型 Select
- 所有 OCR 字段
- 所有补充字段
- `PeriodEndField`
- 结算规则字段

- [ ] **Step 7: 运行测试和文件大小检查**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts
pnpm --dir apps/admin check
```

Expected: PASS，且所有新增/修改组件满足仓库文件大小限制。

- [ ] **Step 8: 提交**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-flow.tsx apps/admin/components/finance/finance-wechat-pay-applyment-supplement-fields.tsx apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-steps.tsx
git commit -m "refactor(admin): 重构进件四阶段工作流"
```

---

### Task 7: 实现安全自动保存和提交前 flush

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-autosave.ts`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-autosave.test.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-schema.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [ ] **Step 1: 写 latest-write 队列失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { ApplymentDraftSaveQueue } from "./finance-wechat-pay-applyment-autosave";

test("serializes saves and keeps only the latest waiting payload", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const saved: string[] = [];
  const queue = new ApplymentDraftSaveQueue(async (payload) => {
    saved.push(String(payload.version));
    if (payload.version === 1) await firstGate;
  });

  const first = queue.enqueue({ version: 1 });
  const second = queue.enqueue({ version: 2 });
  const third = queue.enqueue({ version: 3 });
  releaseFirst?.();
  await Promise.all([first, second, third]);
  await queue.flush();

  expect(saved).toEqual(["1", "3"]);
});

test("continues after a failed save", async () => {
  let attempt = 0;
  const queue = new ApplymentDraftSaveQueue(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("network");
  });

  await expect(queue.enqueue({ version: 1 })).rejects.toThrow("network");
  await queue.enqueue({ version: 2 });
  await queue.flush();
  expect(attempt).toBe(2);
});

test("flush waits for a drain scheduled while the previous drain settles", async () => {
  const saved: string[] = [];
  const queue = new ApplymentDraftSaveQueue(async (payload) => {
    saved.push(String(payload.version));
    await Promise.resolve();
  });

  await queue.enqueue({ version: 1 });
  const second = queue.enqueue({ version: 2 });
  await queue.flush();
  await second;

  expect(saved).toEqual(["1", "2"]);
});
```

在 page layout test 增加创建响应丢失后的恢复契约：

```ts
const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
expect(panelSource).toContain("WECHAT_PAY_APPLYMENT_EXISTS");
expect(panelSource).toContain("/finance/wechat-pay/applyment/current");
expect(panelSource).toContain("retryLastSave");
expect(panelSource).toContain("重试保存");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-autosave.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现串行队列**

```ts
export class ApplymentDraftSaveQueue {
  private pending: Record<string, unknown> | null = null;
  private drainPromise: Promise<void> | null = null;
  private waiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(
    private readonly save: (
      payload: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {}

  enqueue(payload: Record<string, unknown>): Promise<void> {
    this.pending = payload;
    const promise = new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
    void this.ensureDrain();
    return promise;
  }

  async flush(): Promise<void> {
    while (this.pending || this.drainPromise) {
      await this.ensureDrain();
    }
  }

  private ensureDrain(): Promise<void> {
    if (!this.drainPromise) {
      this.drainPromise = this.drain().finally(() => {
        this.drainPromise = null;
        if (this.pending) void this.ensureDrain();
      });
    }
    return this.drainPromise;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const payload = this.pending;
      this.pending = null;
      const batch = this.waiters.splice(0);
      try {
        await this.save(payload);
        batch.forEach((waiter) => waiter.resolve());
      } catch (error) {
        batch.forEach((waiter) => waiter.reject(error));
      }
    }
  }
}
```

- [ ] **Step 4: 构建部分草稿 payload**

安全字段空字符串转换为 null，敏感字段空字符串继续省略以保留已加密原值：

```ts
function nullableText(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

for (const field of SAFE_DRAFT_TEXT_FIELDS) {
  payload[field] = nullableText(form, field);
}

for (const field of SENSITIVE_REPLACEMENT_FIELDS) {
  const value = String(form.get(field) ?? "").trim();
  if (value) payload[field] = normalizeIdentityNumber(field, value);
}
```

始终提交 `subject_type`、`contact_type` 和 `attachments`。联系人从 `SUPER`
切换为 `LEGAL` 时继续删除经办人身份证字段和附件。

在 schema test 明确断言 `buildWechatPayApplymentPayload` 原样保留附件的
`ocr_recognition_id` 和 `ocr_review_status`，且不会把 OCR fields/warnings 混入
attachments。

- [ ] **Step 5: 集成防抖自动保存**

panel 保留当前服务端草稿引用：

```ts
const [currentApplyment, setCurrentApplyment] = useState(applyment);
const currentApplymentRef = useRef(currentApplyment);
const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

queue 的 save 回调根据最新 ID 选择 POST/PUT：

```ts
const saveQueueRef = useRef<ApplymentDraftSaveQueue | null>(null);
if (!saveQueueRef.current) {
  saveQueueRef.current = new ApplymentDraftSaveQueue(async (payload) => {
    const current = currentApplymentRef.current;
    let result: WechatPayApplymentDetailData;
    try {
      result = await saveApplymentDraftRequest(current?.id, payload);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
      if (current || code !== "WECHAT_PAY_APPLYMENT_EXISTS") throw error;
      const existing = await requestBackendJson<WechatPayApplymentDetailData>(
        "/finance/wechat-pay/applyment/current",
      );
      if (!existing.applyment) throw error;
      currentApplymentRef.current = existing.applyment;
      result = await saveApplymentDraftRequest(existing.applyment.id, payload);
    }
    if (result.applyment) {
      currentApplymentRef.current = result.applyment;
      setCurrentApplyment(result.applyment);
    }
  });
}
```

实现 `scheduleDraftSave(overrides = {})`：先从常驻 DOM 构建完整草稿 payload，再用
显式 overrides 覆盖刚发生但 React 尚未提交到 DOM 的 Select、附件或 OCR 值，800ms
debounce 后附加 `draft_update_source: "autosave"` 交给 queue。表单
`onInputCapture` 和普通 Select 变化走 debounce。
成功切换阶段后也调用 `scheduleDraftSave()`，满足离开当前阶段前保存最新字段。

保存状态和重试 payload 必须显式保留：

```ts
const [saveState, setSaveState] = useState<
  "idle" | "saving" | "saved" | "failed"
>("idle");
const lastFailedPayloadRef = useRef<Record<string, unknown> | null>(null);

async function enqueueDraftPayload(payload: Record<string, unknown>) {
  setSaveState("saving");
  try {
    await saveQueueRef.current?.enqueue(payload);
    lastFailedPayloadRef.current = null;
    setSaveState("saved");
    return true;
  } catch (saveError) {
    lastFailedPayloadRef.current = payload;
    setError(
      saveError instanceof Error
        ? saveError.message
        : "微信支付开通申请保存失败",
    );
    setSaveState("failed");
    return false;
  }
}

async function retryLastSave() {
  const payload = lastFailedPayloadRef.current;
  if (payload) await enqueueDraftPayload(payload);
}
```

`failed` 状态使用 shadcn Alert 和小尺寸 Button 显示“保存失败 / 重试保存”；重试成功后
恢复“已自动保存”。失败期间保留所有本地 form、附件、识别状态和字段来源，不调用
`router.refresh()` 覆盖本地状态。

上传成功、识别完成、改为手动填写和“应用识别结果”属于状态边界，不等待 debounce，
直接 enqueue：

```ts
function enqueueMaterialCheckpoint(
  nextAttachments: WechatPayApplymentAttachment[],
  source:
    | "attachment_change"
    | "ocr_review"
    | "ocr_confirm"
    | "manual_entry",
  values: Record<string, string> = {},
) {
  const form = formRef.current;
  if (!form) return Promise.resolve();
  return saveQueueRef.current?.enqueue({
    ...buildCurrentApplymentPayload(form, nextAttachments),
    ...values,
    attachments: nextAttachments,
    draft_update_source: source,
  }) ?? Promise.resolve();
}
```

用 `enqueueMaterialCheckpoint` 替换 Task 4/5 中所有直接 `saveApplymentDraft`
检查点调用，并保留对应 source；“应用识别结果”继续把 OCR values 和
`ocr_review_status="confirmed"` 放在同一个 payload。显式“保存申请”按钮使用
`draft_update_source: "manual_save"`。不得把附件核对状态拆成另一个异步请求。顶部只
显示 `保存中 / 已自动保存 / 保存失败`。

- [ ] **Step 6: 提交前 flush**

```ts
async function submitApplyment() {
  const form = formRef.current;
  if (!form || !validateAllStages(form, setActiveStage)) return;
  const payload = {
    ...buildCurrentApplymentPayload(form),
    draft_update_source: "manual_save",
  };
  if (!await enqueueDraftPayload(payload)) return;
  await saveQueueRef.current?.flush();

  const target = currentApplymentRef.current;
  if (!target) throw new Error("微信支付开通申请草稿尚未创建");
  await requestBackendJson(
    `/finance/wechat-pay/applyments/${target.id}/submit`,
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: target.id,
        remark: payload.remark,
      }),
    },
  );
  router.refresh();
}
```

前端异常继续进入现有错误展示边界；API 后端不得新增直接 `throw new Error()`。

- [ ] **Step 7: 运行测试**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-autosave.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
pnpm --dir apps/admin check
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-autosave.ts apps/admin/components/finance/finance-wechat-pay-applyment-autosave.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-schema.ts apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
git commit -m "feat(admin): 自动保存进件申请草稿"
```

---

### Task 8: 收敛 readiness 阻塞项和最终提交体验

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-readiness.ts`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-readiness.test.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`

- [ ] **Step 1: 写 blocker 映射失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { presentApplymentBlocker } from "./finance-wechat-pay-applyment-readiness";

describe("applyment readiness presentation", () => {
  test("maps attachment blocker to materials stage", () => {
    expect(presentApplymentBlocker({
      code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
      category: "legal_representative_id_card_back",
    })).toEqual({
      label: "缺少法人身份证国徽面",
      targetStage: "materials",
    });
  });

  test("maps sensitive field blocker to recognition stage", () => {
    expect(presentApplymentBlocker({
      code: "APPLYMENT_REQUIRED_FIELD_MISSING",
      field: "sensitive.identity_number",
    })).toEqual({
      label: "请核对法人身份证号码",
      targetStage: "recognition",
    });
  });

  test("keeps unknown server blocker visible", () => {
    expect(presentApplymentBlocker({ code: "UNKNOWN" })).toEqual({
      label: "申请资料尚未满足提交条件",
      targetStage: "submit",
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-readiness.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 blocker 映射**

使用显式字典，不根据字段名生成中文：

```ts
const FIELD_BLOCKERS: Record<string, {
  label: string;
  targetStage: ApplymentStageKey;
}> = {
  subject_type: { label: "请选择主体类型", targetStage: "materials" },
  merchant_short_name: {
    label: "请填写商户简称",
    targetStage: "supplement",
  },
  license_name: {
    label: "请核对营业执照主体名称",
    targetStage: "recognition",
  },
  license_code: {
    label: "请核对统一社会信用代码",
    targetStage: "recognition",
  },
  legal_representative_name: {
    label: "请核对法人姓名",
    targetStage: "recognition",
  },
  identity_doc_type: {
    label: "请确认法人证件类型",
    targetStage: "recognition",
  },
  identity_address: {
    label: "请核对法人身份证地址",
    targetStage: "recognition",
  },
  identity_period_begin: {
    label: "请核对身份证有效期开始日期",
    targetStage: "recognition",
  },
  identity_period_end: {
    label: "身份证有效期尚未确认",
    targetStage: "recognition",
  },
  contact_type: {
    label: "请选择超级管理员身份",
    targetStage: "materials",
  },
  super_admin_name: {
    label: "请核对超级管理员姓名",
    targetStage: "recognition",
  },
  super_admin_phone_masked: {
    label: "请填写超级管理员手机号",
    targetStage: "supplement",
  },
  super_admin_email: {
    label: "请填写超级管理员邮箱",
    targetStage: "supplement",
  },
  contact_identity_doc_type: {
    label: "请确认经办人证件类型",
    targetStage: "recognition",
  },
  contact_identity_period_begin: {
    label: "请核对经办人证件有效期开始日期",
    targetStage: "recognition",
  },
  contact_identity_period_end: {
    label: "请核对经办人证件有效期结束日期",
    targetStage: "recognition",
  },
  service_phone: {
    label: "请填写客服电话",
    targetStage: "supplement",
  },
  settlement_account_type: {
    label: "请选择结算账户类型",
    targetStage: "supplement",
  },
  settlement_account_name: {
    label: "请填写结算账户开户名",
    targetStage: "supplement",
  },
  settlement_bank_name: {
    label: "请核对开户银行",
    targetStage: "recognition",
  },
  settlement_account_number_masked: {
    label: "请核对银行账号",
    targetStage: "recognition",
  },
  settlement_account_summary: {
    label: "结算账户信息尚未完整保存",
    targetStage: "recognition",
  },
  settlement_id: {
    label: "请选择经营行业与结算规则",
    targetStage: "supplement",
  },
  qualification_type: {
    label: "请选择经营行业与结算规则",
    targetStage: "supplement",
  },
  business_scene_description: {
    label: "请填写经营场景说明",
    targetStage: "supplement",
  },
  contact_address: {
    label: "请填写经营联系地址",
    targetStage: "supplement",
  },
  "sensitive.identity_number": {
    label: "请核对法人身份证号码",
    targetStage: "recognition",
  },
  "sensitive.identity_name": {
    label: "请核对法人身份证姓名",
    targetStage: "recognition",
  },
  "sensitive.contact_name": {
    label: "请核对超级管理员姓名",
    targetStage: "recognition",
  },
  "sensitive.contact_phone": {
    label: "请填写超级管理员手机号",
    targetStage: "supplement",
  },
  "sensitive.contact_email": {
    label: "请填写超级管理员邮箱",
    targetStage: "supplement",
  },
  "sensitive.contact_identity_number": {
    label: "请核对经办人身份证号码",
    targetStage: "recognition",
  },
  "sensitive.contact_identity_address": {
    label: "请核对经办人身份证地址",
    targetStage: "recognition",
  },
  "sensitive.bank_account_name": {
    label: "请填写结算账户开户名",
    targetStage: "supplement",
  },
  "sensitive.bank_account_number": {
    label: "请核对银行账号",
    targetStage: "recognition",
  },
};
```

附件类别使用现有
`getWechatPayApplymentAttachmentCategoryLabel`。未知 code 保留通用中文，
不得直接显示后端技术 code 作为主文案。
`APPLYMENT_SENSITIVE_PAYLOAD_MISSING` 固定映射为“请完整核对法人、联系人和结算账户
信息”，目标阶段为 `recognition`。

- [ ] **Step 4: 在最终页集中展示 blockers**

先把后端 readiness 转成展示模型，并将目标阶段传给 flow model，恢复草稿时定位到首个
未完成位置：

```ts
const presentedBlockers = data.submission_readiness.blockers.map(
  presentApplymentBlocker,
);
const [activeStage, setActiveStage] = useState<ApplymentStageKey>(() =>
  getInitialApplymentStage({
    contactType,
    attachments,
    materialStates,
    blockerStages: presentedBlockers.map((blocker) => blocker.targetStage),
  })
);
```

新建空草稿仍进入 `materials`；缺资料或识别中进入 `materials`；待核对、识别失败进入
`recognition`；OCR 已闭环但业务字段缺失进入 `supplement`；全部满足后进入 `submit`。
未知 blocker 留在 `submit` 集中显示，不能因为无法定位就隐藏。

```tsx
{blockers.length > 0 ? (
  <Alert>
    <CircleAlert />
    <AlertTitle>还有 {blockers.length} 项需要处理</AlertTitle>
    <AlertDescription>
      <div className="mt-2 divide-y">
        {blockers.map((blocker) => (
          <button
            key={blocker.key}
            type="button"
            className="flex w-full items-center justify-between py-2 text-left"
            onClick={() => onStageChange(blocker.targetStage)}
          >
            <span>{blocker.label}</span>
            <ChevronRight className="size-4" />
          </button>
        ))}
      </div>
    </AlertDescription>
  </Alert>
) : null}
```

- [ ] **Step 5: 运行测试和类型检查**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-readiness.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
pnpm --dir apps/admin check
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-readiness.ts apps/admin/components/finance/finance-wechat-pay-applyment-readiness.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts
git commit -m "feat(admin): 集中展示进件提交阻塞项"
```

---

### Task 9: 全量验证、迁移核对和对接文档

**Files:**
- Create: `docs/tencent-ocr/2026-07-23-wechat-pay-applyment-ocr-first-handoff.md`
- Modify: `docs/superpowers/specs/2026-07-23-wechat-pay-applyment-ocr-first-ux-design.md`

- [ ] **Step 1: 运行 API 全量验证**

Run:

```bash
pnpm run api:check
bun test apps/api/src/schema/wechat-pay-applyments.test.ts apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts apps/api/src/services/wechat-pay-applyments.test.ts
```

Expected: PASS。

- [ ] **Step 2: 运行 Admin 全量验证**

Run:

```bash
bun test apps/admin/components/finance/finance-wechat-pay-applyment-flow-model.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-autosave.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-readiness.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts apps/admin/components/ocr/ocr-field-review-dialog.test.tsx
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Expected: PASS。

- [ ] **Step 3: 核对 migration**

应用到目标数据库前先查看待执行 migration：

```bash
supabase migration list
supabase db push --dry-run
```

确认只包含以下七项后再执行：

- `20260723130000_allow_partial_wechat_pay_applyment_drafts.sql`
- `20260723133000_add_atomic_wechat_pay_applyment_submit.sql`
- `20260724110000_add_wechat_pay_applyment_draft_revision.sql`
- `20260724130000_add_wechat_pay_applyment_draft_epoch.sql`
- `20260724150000_atomic_wechat_pay_applyment_draft_audit.sql`
- `20260724170000_atomic_wechat_pay_applyment_create.sql`
- `20260724173000_index_wechat_pay_applyment_attachments.sql`

后五项分别收口乱序草稿 revision、跨页面 epoch fencing、需要审计的草稿更新与事件
同事务写入、首次草稿与 `created` 事件原子创建，以及附件对象级授权查询索引；它们
属于 Task 7 与合并前安全审查后追加的发布门禁修正。

```bash
supabase db push
supabase migration list
```

Expected: Local/Remote 对齐。不得直接在远端执行 ALTER TABLE。

- [ ] **Step 4: 用真实数据库验证原子提交并发与回滚**

仅在上述 migration 已应用到受控测试数据库后执行，必须使用两个独立数据库连接同时
调用 `submit_tenant_wechat_pay_applyment`，不能用 repository mock 代替。验证：

1. 两个相同幂等 key 的并发调用只发生一次 `draft/rejected/wechat_editing -> submitted`
   状态转换。
2. `tenant_wechat_pay_applyment_events` 只产生一条 `submitted` 事件。
3. 在受控事务中令事件插入失败时，RPC 整体失败且 applyment 状态、`submitted_at` 均回滚。
4. 清理测试数据后再次核对 applyment 和 event 计数，保存连接级执行日志作为发布证据。

当前 Docker 不可用时只保留此门禁，不运行远端 migration，也不得以现有 mock 并发测试
宣称真实数据库验证通过。

- [ ] **Step 5: 启动隔离服务做浏览器 smoke**

在实施 worktree 使用不同端口，不影响 main 工作区服务：

```bash
PORT=3100 bun run api:start
GOOES_API_BASE_URL=http://127.0.0.1:3100 NEXT_PUBLIC_GOOES_API_BASE_URL=http://127.0.0.1:3100 pnpm --dir apps/admin exec next dev -p 3110
```

验证桌面 `1440x900` 和窄屏 `390x844`：

1. 首屏只显示主体类型、超级管理员身份和资料上传。
2. 上传营业执照后显示缩略图并自动进入识别中。
3. OCR 成功后进入待核对，不出现逐文件“识别并回填”。
4. 人工修改冲突字段后重新识别，不被静默覆盖。
5. OCR capability 关闭时仍可上传并手工填写。
6. 在待核对状态刷新后，附件、recognition ID、核对状态、识别建议和已保存字段恢复；
   已确认或手动填写的资料不重复 OCR。
7. 最终页 blocker 可点击定位。
8. 不执行“提交平台审核”，不创建真实微信进件。
9. 控制台无 error，接口无非预期 4xx/5xx。
10. 页面无横向溢出、按钮文字换行或内容重叠。

真实 OCR smoke 仅使用经授权的非生产测试资料；证件图片不得复制到仓库、截图或日志。

- [ ] **Step 6: 输出对接文档**

文档必须记录：

- 四阶段和状态名称。
- OCR capability、recognition、file object 和 applyment draft 接口。
- 上传后自动识别与 dedupe/idempotency 行为。
- 字段来源和冲突保护规则。
- readiness blocker 的定位契约。
- Admin 验收结果。
- 小程序后续只消费同一后端契约，不在 orange 仓库直接改代码。

把设计文档状态改为：

```md
> 状态：已实现，待发布验证
```

- [ ] **Step 7: 最终检查**

Run:

```bash
git diff --check
git status --short
```

确认没有密钥、token、身份证号码、银行卡号、签名 URL 或证照文件进入 diff。

- [ ] **Step 8: 提交**

```bash
git add docs/tencent-ocr/2026-07-23-wechat-pay-applyment-ocr-first-handoff.md docs/superpowers/specs/2026-07-23-wechat-pay-applyment-ocr-first-ux-design.md
git commit -m "docs(payment): 记录OCR进件重构验收"
```

---

## 实施顺序和检查点

1. Task 1 至 Task 2 是后端草稿基础，完成后先做 API review。
2. Task 3 至 Task 6 是 Admin 主交互，完成后做视觉和契约 review。
3. Task 7 至 Task 8 是可靠性和提交收敛，完成后做端到端 review。
4. Task 9 只做验证、migration 和文档，不新增业务逻辑。

任一检查点发现现有 OCR recognition、applyment draft 或 readiness 契约与本计划不符时，
先更新本计划和测试，再继续实现；禁止通过前端硬编码绕过后端约束。
