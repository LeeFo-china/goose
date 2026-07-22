# Tencent OCR Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tenant-isolated Tencent OCR platform service and use it in the tenant Admin WeChat Pay applyment form for business-license, ID-card, and bank-card assisted entry.

**Architecture:** Keep the existing COS direct-upload and business save APIs as the source of truth. A new OCR controller/service/repository stack resolves `platform_file_objects`, calls a dedicated Tencent OCR gateway, encrypts short-lived normalized results, and returns reviewable field suggestions; OCR never submits an applyment or advances workflow.

**Tech Stack:** Bun + TypeScript + Fastify, Supabase PostgreSQL migrations, `tencentcloud-sdk-nodejs-ocr@4.1.268`, existing system-settings encryption, Next.js 15 Admin, shadcn/Radix/Tailwind, Bun tests.

---

## Source Documents

- Product PRD: `docs/tencent-ocr/2026-07-22-tencent-ocr-platform-prd.md`
- Mini-program handoff: `docs/tencent-ocr/2026-07-22-tencent-ocr-miniprogram-handoff.md`
- Existing upload controller: `apps/api/src/controllers/uploads/index.ts`
- File-object repository: `apps/api/src/repositories/platform-file-objects.ts`
- File URL policy: `apps/api/src/services/files/file-url-resolver.ts`
- Applyment schema: `apps/api/src/schema/wechat-pay-applyments.ts`
- Applyment sensitive payload: `apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts`
- Applyment Admin upload UI: `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
- Platform settings UI: `apps/admin/app/(console)/settings/page.tsx`
- Tencent API v3 signature reference: <https://cloud.tencent.com/document/product/866/33519>
- Tencent sensitive-data encryption guide: <https://cloud.tencent.com/document/product/1253/115227>
- Tencent OCR SDK source: <https://github.com/TencentCloud/tencentcloud-sdk-nodejs>

## Phase 1 Scope

Included:

- Platform-only OCR configuration.
- `business_license`, `id_card_front`, `id_card_back`, and `bank_card` capabilities.
- Synchronous single-image recognition.
- Encrypted 24-hour result retention.
- Idempotency, file/action deduplication, one platform default daily quota counted independently per tenant, provider concurrency guards.
- Tenant Admin WeChat Pay applyment field review and fill.
- Platform Admin paginated recognition audit.

Excluded:

- Expense invoice UI, VAT invoice verification, storefront OCR, visitor onboarding and PDF/multi-page jobs.
- Automatic applyment save/submit or workflow actions.
- Any modification to `/Users/leefo/Public/work/orange`.

## File Structure

Create backend files:

- `supabase/migrations/20260722130000_create_ocr_recognitions.sql`
  - Creates OCR records, indexes, RLS, platform settings and permissions.
- `packages/domain/src/ocr.ts`
  - Stable scene, document-type, field, warning and response contracts shared by API/Admin.
- `packages/domain/src/ocr.test.ts`
  - Guards stable values and sensitive-field metadata.
- `apps/api/src/schema/ocr.ts`
  - Zod request/query schemas and pagination constraints.
- `apps/api/src/repositories/ocr-recognitions.ts`
  - Direct Supabase access for recognition lifecycle, dedupe lookup, quota count and platform list.
- `apps/api/src/repositories/ocr-recognitions.test.ts`
  - Verifies bounded projections, quota counting, dedupe conflicts and server pagination.
- `apps/api/src/services/ocr/crypto.ts`
  - AES-256-GCM result encryption with tenant/record AAD.
- `apps/api/src/services/ocr/capabilities.ts`
  - Fixed server capability catalog and action-level limits.
- `apps/api/src/services/ocr/normalizers.ts`
  - Tencent responses to stable gooes fields and warnings.
- `apps/api/src/services/ocr/tencent-gateway.ts`
  - Official SDK client and provider error normalization.
- `apps/api/src/services/ocr/service.ts`
  - Authorization, file validation, quota, dedupe, provider call and response projection.
- `apps/api/src/services/ocr/index.ts`
  - Exports the service singleton.
- `apps/api/src/services/ocr/crypto.test.ts`
- `apps/api/src/services/ocr/capabilities.test.ts`
- `apps/api/src/services/ocr/normalizers.test.ts`
- `apps/api/src/services/ocr/tencent-gateway.test.ts`
- `apps/api/src/services/ocr/service.test.ts`
- `apps/api/src/controllers/ocr/index.ts`
- `apps/api/src/controllers/ocr/index.test.ts`
- `apps/api/src/scripts/ocr-result-cleanup.ts`
- `apps/api/src/scripts/ocr-result-cleanup.test.ts`

Modify backend files:

- `apps/api/package.json`
  - Adds pinned OCR SDK and cleanup script.
- `bun.lock`
  - Locks SDK and transitive common package.
- `packages/domain/src/index.ts`
  - Exports OCR contracts.
- `packages/domain/src/permission.ts`
  - Adds tenant recognition and platform audit permissions.
- `apps/api/src/errors/error-codes.ts`
  - Adds stable OCR errors.
- `apps/api/src/routes/index.ts`
  - Registers OCR routes.
- `apps/api/src/types/database.ts`
  - Adds the generated `ocr_recognitions` table contract after migration apply.
- `apps/api/src/repositories/platform-file-objects.ts`
  - Adds a tenant-scoped `findActiveById` projection.
- `apps/api/src/services/system-settings/legacy/definitions-integrations.ts`
  - Adds platform OCR settings definitions.
- `apps/api/src/services/system-settings/legacy/definitions-localization.test.ts`
  - Verifies group/key metadata and secret flags.
- `apps/api/src/schema/wechat-pay-applyments.ts`
  - Persists optional `file_object_id` beside applyment attachment object key.
- `apps/api/src/schema/wechat-pay-applyments.test.ts`
  - Covers attachment file-object ID validation.

Create Admin files:

- `apps/admin/components/ocr/ocr-types.ts`
- `apps/admin/components/ocr/ocr-requests.ts`
- `apps/admin/components/ocr/ocr-field-review-dialog.tsx`
- `apps/admin/components/ocr/ocr-field-review-dialog.test.tsx`
- `apps/admin/components/platform-ocr/platform-ocr-page.tsx`
- `apps/admin/components/platform-ocr/platform-ocr-page.test.tsx`
- `apps/admin/app/(console)/platform/ocr/page.tsx`

Modify Admin files:

- `apps/admin/app/(console)/settings/page.tsx`
  - Adds the `ocr` group label/order.
- `apps/admin/components/settings/settings-tabs.tsx`
  - Shows OCR settings through the existing shadcn settings form and test action.
- `apps/admin/components/layout/menu-config.ts`
  - Adds platform OCR audit navigation using the existing `ScanText` Lucide export.
- `apps/admin/lib/cos-direct-upload.ts`
  - Keeps typed `fileId` available to applyment UI.
- `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`
  - Adds optional `file_object_id` and recognition metadata to attachment state.
- `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
  - Aligns MIME contract to JPEG/PNG and adds explicit recognition interaction.
- `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
  - Applies selected OCR field suggestions to the current form without submitting it.
- `apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts`
  - Verifies selected suggestions flow through existing create/update payload rules.

## Task 0: Verify the Official SDK under Bun

**Files:**

- Modify: `apps/api/package.json`
- Modify: `bun.lock`
- Create: `apps/api/src/services/ocr/tencent-sdk-compatibility.test.ts`

- [ ] **Step 1: Recheck the current published package before installation**

Run:

```bash
npm view tencentcloud-sdk-nodejs-ocr version types --json
```

Expected on 2026-07-22: version `4.1.268`, types `./tencentcloud/index.d.ts`. If the version has changed, inspect that exact tarball before changing this plan's pin; do not infer exports.

- [ ] **Step 2: Install the inspected product SDK**

Run from `apps/api`:

```bash
bun add tencentcloud-sdk-nodejs-ocr@4.1.268
```

Expected: `apps/api/package.json` contains the exact version and `bun.lock` changes only for this dependency graph.

- [ ] **Step 3: Add a compatibility test using the package's real export**

Create `apps/api/src/services/ocr/tencent-sdk-compatibility.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ocr } from "tencentcloud-sdk-nodejs-ocr";

describe("Tencent OCR SDK compatibility", () => {
  test("exports the 2018-11-19 client actions used by phase 1", () => {
    const prototype = ocr.v20181119.Client.prototype;
    expect(typeof prototype.BizLicenseOCR).toBe("function");
    expect(typeof prototype.RecognizeEncryptedIDCardOCR).toBe("function");
    expect(typeof prototype.BankCardOCR).toBe("function");
  });
});
```

- [ ] **Step 4: Verify Bun import, TypeScript and build before any gateway work**

Run:

```bash
bun test apps/api/src/services/ocr/tencent-sdk-compatibility.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
bun run --cwd apps/api build
```

Expected: test PASS, typecheck/build exit 0. If the ESM import fails, stop and adapt to the inspected package export; do not add a handwritten TC3 signer.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json bun.lock apps/api/src/services/ocr/tencent-sdk-compatibility.test.ts
git commit -m "build(api): 引入腾讯云OCR SDK"
```

## Task 1: Add Shared OCR Contracts and Errors

**Files:**

- Create: `packages/domain/src/ocr.ts`
- Create: `packages/domain/src/ocr.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `apps/api/src/errors/error-codes.ts`

- [ ] **Step 1: Write failing shared-contract tests**

Cover these exact values:

```ts
export const OCR_SCENE_VALUES = [
  "wechat_pay_applyment",
  "expense_request",
  "merchant_material",
] as const;

export const OCR_DOCUMENT_TYPE_VALUES = [
  "business_license",
  "id_card_front",
  "id_card_back",
  "bank_card",
  "general_invoice",
  "vat_invoice_verify",
  "store_name",
  "store_classification",
  "document_classification",
] as const;

export const OCR_RECOGNITION_STATUS_VALUES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "expired",
] as const;
```

The test must also assert `identity_number`, `identity_address`, `contact_identity_number`, `contact_identity_address`, and `settlement_account_number` are marked sensitive in the shared field metadata.

- [ ] **Step 2: Implement focused domain types**

`packages/domain/src/ocr.ts` must export:

- scene/document/status constants and union types;
- `OcrFieldSuggestion`;
- `OcrWarning`;
- `OcrCapability`;
- `OcrRecognitionView`;
- `OCR_SENSITIVE_FIELD_KEYS`.

The response contract must not expose a provider raw response type.

- [ ] **Step 3: Add permissions**

Add:

```ts
'ocr.recognize'
'platform.ocr.recognition.read'
```

with labels `使用证照识别` and `查看平台OCR记录`, modules `ocr` and `platform_ocr`.

- [ ] **Step 4: Add stable errors**

Add the PRD error codes to `apps/api/src/errors/error-codes.ts`; no service may throw a raw `Error` for a business/provider failure.

- [ ] **Step 5: Run focused verification**

```bash
bun test packages/domain/src/ocr.test.ts packages/domain/src/permission.test.ts
pnpm --dir packages/domain exec tsc -p tsconfig.json --noEmit
```

Expected: all tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/ocr.ts packages/domain/src/ocr.test.ts packages/domain/src/index.ts packages/domain/src/permission.ts apps/api/src/errors/error-codes.ts
git commit -m "feat(ocr): 定义平台识别契约"
```

## Task 2: Create the OCR Migration

**Files:**

- Create: `supabase/migrations/20260722130000_create_ocr_recognitions.sql`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: Create the table and constraints**

The migration must create `public.ocr_recognitions` with the columns and constraints defined by the PRD. Use these status and provider checks:

```sql
status text not null check (
  status in ('pending', 'processing', 'succeeded', 'failed', 'expired')
),
provider text not null default 'tencent_cloud' check (
  provider in ('tencent_cloud')
),
billable_units integer not null default 0 check (billable_units >= 0),
duration_ms integer null check (duration_ms is null or duration_ms >= 0),
result_summary jsonb not null default '{}'::jsonb check (
  jsonb_typeof(result_summary) = 'object'
),
warnings jsonb not null default '[]'::jsonb check (
  jsonb_typeof(warnings) = 'array'
),
quality jsonb not null default '{}'::jsonb check (
  jsonb_typeof(quality) = 'object'
)
```

`tenant_id`, `actor_employee_id` and `file_object_id` must reference their current tables. `subject_id` stays UUID without a cross-domain foreign key.

- [ ] **Step 2: Add dedupe and read indexes**

```sql
create unique index ocr_recognitions_tenant_idempotency_idx
  on public.ocr_recognitions(tenant_id, idempotency_key);

create unique index ocr_recognitions_active_dedupe_idx
  on public.ocr_recognitions(tenant_id, dedupe_key)
  where status in ('processing', 'succeeded');

create index ocr_recognitions_tenant_created_idx
  on public.ocr_recognitions(tenant_id, created_at desc);

create index ocr_recognitions_status_created_idx
  on public.ocr_recognitions(status, created_at desc);

create index ocr_recognitions_file_created_idx
  on public.ocr_recognitions(file_object_id, created_at desc);
```

- [ ] **Step 3: Enable RLS and deny direct client access**

Run `alter table public.ocr_recognitions enable row level security;` and create no anon/authenticated policy. The API repository uses the existing service-role client.

- [ ] **Step 4: Seed permissions and platform settings**

Insert/upsert the two permissions and these platform-only settings:

```text
TENCENT_OCR_ENABLED=false
TENCENT_OCR_SECRET_ID=null (secret)
TENCENT_OCR_SECRET_KEY=null (secret)
TENCENT_OCR_REGION=ap-guangzhou
TENCENT_OCR_ENDPOINT=ocr.tencentcloudapi.com
TENCENT_OCR_REQUEST_TIMEOUT_MS=10000
TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT=100
TENCENT_OCR_RESULT_TTL_HOURS=24
TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED=true
TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM=null (secret)
TENCENT_OCR_ENCRYPTION_ALGORITHM=AES-256-CBC
```

Grant `ocr.recognize` with `access_scope='all'` to `system_admin`. Grant `platform.ocr.recognition.read` with `access_scope='all'` only to the tenant-null `platform_admin` role. Phase 1 does not grant OCR to general employee or finance role templates; later scenes add their grants in the migration that enables that scene.

Do not put `OCR_RESULT_ENCRYPTION_KEY` in the database; it is a server deployment secret. OCR settings are platform-only and must not be added to `TENANT_OVERRIDABLE_SETTING_KEYS`. Phase 1 has one platform default limit and counts each tenant independently; it does not add tenant-specific limit configuration.

- [ ] **Step 5: Validate SQL locally before remote migration**

```bash
rg -n "ocr_recognitions|TENCENT_OCR|ocr.recognize" supabase/migrations/20260722130000_create_ocr_recognitions.sql
supabase migration list
```

Expected before apply: the new local migration is present and remote is not yet marked applied.

- [ ] **Step 6: Apply only after reviewing the migration**

```bash
supabase db push
supabase migration list
```

Expected after apply: Local/Remote align for `20260722130000`. Rollback is a forward migration that disables OCR, deletes the seeded settings/permissions, and drops `ocr_recognitions` only after confirming no retained audit is required.

- [ ] **Step 7: Synchronize the generated database type**

Regenerate `apps/api/src/types/database.ts` from the migrated target database. If the installed Supabase CLI requires unavailable Docker for `--db-url`, add only the exact `ocr_recognitions` table contract derived from the applied migration and prove it with API typecheck; do not use `any` or regenerate from a different project.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260722130000_create_ocr_recognitions.sql apps/api/src/types/database.ts
git commit -m "feat(db): 建立OCR识别记录"
```

## Task 3: Add Repository and Result Encryption

**Files:**

- Modify: `apps/api/src/repositories/platform-file-objects.ts`
- Create: `apps/api/src/repositories/ocr-recognitions.ts`
- Create: `apps/api/src/services/ocr/crypto.ts`
- Create: `apps/api/src/services/ocr/crypto.test.ts`

- [ ] **Step 1: Add failing crypto tests**

Tests must prove:

- round-trip succeeds with tenant ID, recognition ID and encryption key;
- ciphertext does not contain an ID number or address;
- changing tenant or recognition ID fails authentication;
- missing `OCR_RESULT_ENCRYPTION_KEY` produces `OCR_RESULT_ENCRYPTION_KEY_MISSING` through `Errors.business`.

- [ ] **Step 2: Implement domain-separated AES-256-GCM**

Use HKDF-SHA256, salt `gooes:ocr-result:v1`, purpose `normalized-result`, a 12-byte IV and AAD:

```text
ocr:<tenant-id>:<recognition-id>:v1
```

The ciphertext prefix must be `ocr:v1`. Do not reuse WeChat Pay applyment ciphertext functions or key purpose.

- [ ] **Step 3: Add tenant-scoped file lookup**

Add to `PlatformFileObjectRepository`:

```ts
async findActiveById(input: { id: string; tenantId: string })
```

Select only fields needed by OCR:

```text
id, tenant_id, owner_type, owner_id, scene, provider, bucket, region,
object_key, mime_type, size_bytes, checksum, visibility, status, deleted_at
```

Use `.eq("id", input.id)`, `.eq("tenant_id", input.tenantId)`, `.eq("status", "active")`, `.is("deleted_at", null)` and `.maybeSingle()`.

- [ ] **Step 4: Implement the OCR repository**

Repository methods:

```text
createProcessing
findByTenantAndIdempotencyKey
findActiveByDedupeKey
markSucceeded
markFailed
findByIdForTenant
countTenantSince
listPlatform (range pagination, selected columns only)
expireResultsBefore
```

`listPlatform` must use `.range(offset, offset + pageSize - 1)` and `{ count: "exact" }`; it must not select `result_ciphertext`.

- [ ] **Step 5: Add repository unit tests with mocked Supabase chains**

Cover tenant filters, range pagination, selected columns and expiry clearing `result_ciphertext`.

- [ ] **Step 6: Verify**

```bash
bun test apps/api/src/services/ocr/crypto.test.ts apps/api/src/repositories/platform-file-objects.test.ts apps/api/src/repositories/ocr-recognitions.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/repositories/platform-file-objects.ts apps/api/src/repositories/platform-file-objects.test.ts apps/api/src/repositories/ocr-recognitions.ts apps/api/src/repositories/ocr-recognitions.test.ts apps/api/src/services/ocr/crypto.ts apps/api/src/services/ocr/crypto.test.ts
git commit -m "feat(ocr): 增加识别存储与加密"
```

## Task 4: Implement Capability Catalog, Gateway and Normalizers

**Files:**

- Create: `apps/api/src/services/ocr/capabilities.ts`
- Create: `apps/api/src/services/ocr/capabilities.test.ts`
- Create: `apps/api/src/services/ocr/tencent-gateway.ts`
- Create: `apps/api/src/services/ocr/tencent-gateway.test.ts`
- Create: `apps/api/src/services/ocr/normalizers.ts`
- Create: `apps/api/src/services/ocr/normalizers.test.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions-integrations.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions-localization.test.ts`

- [ ] **Step 1: Define the Phase 1 capability catalog**

The catalog is the only place that maps scene/document type to Action, MIME, size, concurrency, output fields and attachment categories. Phase 1 entries:

```text
wechat_pay_applyment + business_license -> BizLicenseOCR, JPEG/PNG, 5MB, concurrency 8
wechat_pay_applyment + id_card_front -> RecognizeEncryptedIDCardOCR, JPEG/PNG, 5MB, concurrency 16
wechat_pay_applyment + id_card_back -> RecognizeEncryptedIDCardOCR, JPEG/PNG, 5MB, concurrency 16
wechat_pay_applyment + bank_card -> BankCardOCR, JPEG/PNG, 5MB, concurrency 8
```

The configured limits intentionally remain below provider QPS. Capability output must include no provider credential or Action implementation details that clients do not need.

- [ ] **Step 2: Add platform settings definitions**

Add the PRD keys under `groupCode: "ocr"`; SecretId, SecretKey and the encryption public-key PEM must have `isSecret: true`. OCR keys must not be added to `TENANT_OVERRIDABLE_SETTING_KEYS`.

- [ ] **Step 3: Implement a gateway with dependency injection**

Use the inspected SDK export:

```ts
import { ocr } from "tencentcloud-sdk-nodejs-ocr";

const TencentOcrClient = ocr.v20181119.Client;
```

The gateway constructor accepts a client factory for tests. Runtime config uses `TENCENT_OCR_SECRET_ID/KEY`, region, endpoint and request timeout from `systemSettingsService`.

Provider calls:

- `BizLicenseOCR`: signed COS `ImageUrl`, `EnableCopyWarn: true`, `EnablePeriodComplete: true`.
- `BankCardOCR`: signed COS `ImageUrl`, copy/reshoot/border/quality checks enabled, no cut-image output.
- `RecognizeEncryptedIDCardOCR`: follow Tencent's [sensitive-data encryption guide](https://cloud.tencent.com/document/product/1253/115227). Generate a fresh 32-byte AES key and 16-byte IV for every request; serialize the Tencent request body as JSON, apply PKCS#7 padding, encrypt it with AES-256-CBC, and Base64 the result as `EncryptedBody`. Encrypt the AES key with the Tencent OCR 1024-bit RSA public key using PKCS#1 v1.5 and Base64 it as `Encryption.CiphertextBlob`; set `Encryption.Algorithm="AES-256-CBC"`, `Encryption.EncryptList=["EncryptedBody"]`, `Encryption.TagList=[]`, and `Encryption.Iv` to the Base64 IV. Decrypt the response `EncryptedBody` with the same AES key and IV. Enable copy, border, reshoot, PS, invalid-date, quality and reflection warnings in the encrypted inner request.

The encrypted ID implementation is a release gate. Obtain and verify the current Tencent OCR encryption public key and official Node.js Demo through Tencent OCR support before enabling the capability. If the Phase 0 test cannot produce and decrypt a valid request with that material, keep ID capabilities disabled; do not silently fall back to plaintext `IDCardOCR`.

- [ ] **Step 4: Normalize provider errors**

Map rate limiting to `OCR_PROVIDER_RATE_LIMITED`, invalid credentials/config to `OCR_CONFIG_MISSING`, and other provider failures to `OCR_PROVIDER_FAILED`. Preserve only safe provider code and RequestId. Never attach request body, ImageUrl, response payload or secrets to the error.

- [ ] **Step 5: Implement pure normalizers**

Normalizer outputs must use gooes field keys listed in the PRD. Tests use synthetic provider fixtures and cover:

- business-license legal representative, period and copy warning;
- ID front number/address and ID back validity dates/`长期`;
- bank number/bank name/type and quality warning;
- malformed provider responses returning `OCR_RESULT_INVALID`.

- [ ] **Step 6: Verify**

```bash
bun test apps/api/src/services/ocr/capabilities.test.ts apps/api/src/services/ocr/tencent-gateway.test.ts apps/api/src/services/ocr/normalizers.test.ts apps/api/src/services/system-settings/legacy/definitions-localization.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/ocr apps/api/src/services/system-settings/legacy/definitions-integrations.ts apps/api/src/services/system-settings/legacy/definitions-localization.test.ts
git commit -m "feat(ocr): 接入腾讯云识别网关"
```

## Task 5: Implement OCR Business Orchestration

**Files:**

- Create: `apps/api/src/services/ocr/service.ts`
- Create: `apps/api/src/services/ocr/service.test.ts`
- Create: `apps/api/src/services/ocr/index.ts`
- Modify: `apps/api/src/services/files/file-url-resolver.ts`

- [ ] **Step 1: Write service tests before implementation**

Cover these cases:

1. valid applyment file creates a processing record, calls the matching gateway once and stores encrypted success;
2. cross-tenant file ID is rejected before provider call;
3. file scene mismatch is rejected;
4. MIME and size mismatch are rejected before provider call;
5. caller lacks `ocr.recognize` or `wechat_pay.applyment.submit`;
6. idempotency replay returns the existing record;
7. same active dedupe key returns `cached=true`;
8. daily quota returns 429 before provider call;
9. provider failure stores a safe failed record;
10. expired recognition cannot return decrypted fields.

- [ ] **Step 2: Add a dedicated short-lived OCR URL resolver**

Add a service-only function that signs the verified `platform_file_objects.object_key` for at most 120 seconds. It must not accept an arbitrary URL or client-provided object key.

- [ ] **Step 3: Implement authorization**

For `wechat_pay_applyment`:

- require tenant + employee context;
- require `ocr.recognize`;
- require `wechat_pay.applyment.submit`;
- if `subject_id` is present, load the applyment and verify the same tenant;
- verify attachment category/document-type mapping when the object is already attached.

- [ ] **Step 4: Implement idempotency and dedupe ordering**

Order:

```text
validate request -> authorize -> load file -> validate capability/file
-> find idempotency -> find active dedupe -> count daily quota
-> create processing -> sign URL -> call gateway -> normalize/encrypt -> mark success
```

Build `dedupe_key` with SHA-256 over tenant ID, checksum or object key, document type and provider action. A unique conflict must re-read and return the winning record rather than call the provider again.

- [ ] **Step 5: Add action-level concurrency guards**

Use an in-process semaphore keyed by provider action with limits from the capability catalog. This protects a single API process; provider 429 remains the cross-process backstop. Do not add Redis or a queue in Phase 1.

- [ ] **Step 6: Project safe responses**

Tenant result detail decrypts fields only after access checks. Platform list/detail returns `result_summary`, warnings, quality, RequestId and error data without field values.

- [ ] **Step 7: Verify**

```bash
bun test apps/api/src/services/ocr/service.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/ocr apps/api/src/services/files/file-url-resolver.ts apps/api/src/services/files/file-url-resolver-private.test.ts
git commit -m "feat(ocr): 编排租户证照识别"
```

## Task 6: Add OCR HTTP Endpoints

**Files:**

- Create: `apps/api/src/schema/ocr.ts`
- Create: `apps/api/src/controllers/ocr/index.ts`
- Create: `apps/api/src/controllers/ocr/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Define Zod schemas**

Implement:

```text
OcrCapabilitiesQuerySchema
CreateOcrRecognitionSchema
OcrRecognitionParamsSchema
PlatformOcrRecognitionListQuerySchema
PlatformOcrConfigTestSchema
```

`idempotency_key` is a required UUID. Platform list extends the existing `PaginationQuerySchema`; `pageSize` remains capped at 100. The config-test schema accepts one multipart JPEG/PNG file no larger than 2MB.

- [ ] **Step 2: Add controller routes**

```text
GET  /ocr/capabilities
POST /ocr/recognitions
GET  /ocr/recognitions/:id
GET  /platform/ocr/recognitions
POST /platform/ocr/config-test
```

Controllers only read/validate requests, resolve auth context, call services and return `ResponseHandler.success`. All errors come from `Errors`/`error-factory`.

`POST /platform/ocr/config-test` is platform-admin-only and deliberately does not use a tenant file object. It accepts a manually selected synthetic sample or explicitly authorized non-production business-license image as multipart data, keeps the upload in memory only, calls fixed action `BizLicenseOCR` with `ImageBase64`, and discards both image bytes and recognized fields after the call. Return only `ok`, safe warning codes, Tencent RequestId and duration. The endpoint must never persist the sample or recognition fields, and the UI must state that the test may be billable.

- [ ] **Step 3: Keep capability list exemption explicit**

Add a code comment next to the capability response: the server-owned catalog is guaranteed to stay at or below 50 entries, so this auxiliary list is intentionally not paginated.

- [ ] **Step 4: Test routes and auth boundaries**

Tests assert route registration, Zod failures, tenant context, platform-only list/test and no provider call on unauthorized requests.

- [ ] **Step 5: Verify**

```bash
bun test apps/api/src/controllers/ocr/index.test.ts
bun run --cwd apps/api check
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/ocr.ts apps/api/src/controllers/ocr apps/api/src/routes/index.ts
git commit -m "feat(api): 提供OCR识别接口"
```

## Task 7: Add Expiry Cleanup and Operational Proof

**Files:**

- Create: `apps/api/src/scripts/ocr-result-cleanup.ts`
- Create: `apps/api/src/scripts/ocr-result-cleanup.test.ts`
- Create: `docs/tencent-ocr/2026-07-22-tencent-ocr-operations-runbook.md`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Implement bounded cleanup**

Add `ocr:results:cleanup` script. Each run processes at most 500 expired rows ordered by `expires_at`, sets `status=expired`, clears `result_ciphertext`, and leaves redacted audit metadata.

- [ ] **Step 2: Test dry-run and apply modes**

Dry-run reports candidate count/oldest expiry without updates. Apply mode requires `--apply` and reports updated count. Logs contain IDs and counts only.

- [ ] **Step 3: Configure the production retention schedule**

Document the actual production scheduler, owner and alert destination in the operations runbook. Run `bun run --cwd apps/api ocr:results:cleanup --apply` every hour with overlapping executions disabled and a 10-minute timeout. Reading an expired record must return 410 even before cleanup runs. Keep OCR disabled until the scheduler has one successful production dry-run and one successful apply run. Alert when a run fails or still reports 500 remaining candidates so capacity can be reviewed without silently extending retention.

- [ ] **Step 4: Verify**

```bash
bun test apps/api/src/scripts/ocr-result-cleanup.test.ts
bun run --cwd apps/api ocr:results:cleanup
```

Expected: test PASS; default script performs dry-run only. The runbook identifies the real scheduler and contains no credentials.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/ocr-result-cleanup.ts apps/api/src/scripts/ocr-result-cleanup.test.ts apps/api/package.json docs/tencent-ocr/2026-07-22-tencent-ocr-operations-runbook.md
git commit -m "feat(ocr): 清理过期识别结果"
```

## Task 8: Build Platform Admin Configuration and Audit

**Files:**

- Modify: `apps/admin/app/(console)/settings/page.tsx`
- Modify: `apps/admin/components/settings/settings-tabs.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Create: `apps/admin/components/platform-ocr/platform-ocr-page.tsx`
- Create: `apps/admin/components/platform-ocr/platform-ocr-page.test.tsx`
- Create: `apps/admin/app/(console)/platform/ocr/page.tsx`

- [ ] **Step 1: Add failing layout tests**

Assert:

- settings group label is `腾讯云 OCR` and appears after storage/location integrations;
- secrets use existing masked secret controls;
- test action requires a synthetic or explicitly authorized non-production JPEG/PNG sample, is explicit and warns it performs a billable recognition request;
- `/platform/ocr` uses page/pageSize server pagination and no client-side total filtering;
- no result field values or image URLs render in platform rows.

- [ ] **Step 2: Add settings group and test action**

Reuse existing settings shadcn controls. The test action opens a file picker, shows the selected filename and size, requires confirmation, then calls `POST /platform/ocr/config-test`; render only safe configuration status, RequestId, duration and warning codes. Do not introduce raw `<input>`, `<select>` or custom secret widgets.

- [ ] **Step 3: Add platform audit page**

Use existing Admin page header, filters, table, pagination and status components. Add `ScanText` from the installed `lucide-react` export to platform navigation.

- [ ] **Step 4: Verify**

```bash
bun test apps/admin/components/platform-ocr/platform-ocr-page.test.tsx apps/admin/components/settings/platform-payment-settings-panel.test.ts
pnpm --dir apps/admin check
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/'(console)'/settings/page.tsx apps/admin/components/settings apps/admin/components/layout/menu-config.ts apps/admin/components/platform-ocr apps/admin/app/'(console)'/platform/ocr/page.tsx
git commit -m "feat(admin): 增加OCR配置与调用记录"
```

## Task 9: Integrate OCR into WeChat Pay Applyment Admin

**Files:**

- Modify: `apps/api/src/schema/wechat-pay-applyments.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.test.ts`
- Create: `apps/admin/components/ocr/ocr-types.ts`
- Create: `apps/admin/components/ocr/ocr-requests.ts`
- Create: `apps/admin/components/ocr/ocr-field-review-dialog.tsx`
- Create: `apps/admin/components/ocr/ocr-field-review-dialog.test.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts`

- [ ] **Step 1: Persist file-object identity in attachment JSON**

Add optional UUID `file_object_id` to backend `AttachmentSchema` and Admin `WechatPayApplymentAttachment`. After direct-complete, assign `uploaded.fileId`; fail the OCR action with a clear reload/re-upload message when a legacy attachment has no file ID.

- [ ] **Step 2: Fix the MIME mismatch**

Change the applyment upload control to JPEG/PNG only so Admin, upload API and Phase 1 OCR agree. Remove BMP from `accept`, allowed types and visible help text.

- [ ] **Step 3: Add a recognition button per supported slot**

Show the action only when:

- attachment exists and has `file_object_id`;
- form is editable;
- `/ocr/capabilities?scene=wechat_pay_applyment` contains the mapped document type;
- no recognition request for that slot is pending.

Do not show OCR on `business_scene_material` in Phase 1.

- [ ] **Step 4: Add review dialog behavior**

The dialog lists current value, recognized value, warning and checkbox per field. Defaults:

- current field empty: checked;
- current field non-empty and equal after normalization: unchecked and marked consistent;
- current field non-empty and different: unchecked and highlighted for review.

“应用所选字段” updates form state only. It must not call create, update, submit or any workflow endpoint.

- [ ] **Step 5: Keep existing validation and encryption as the save path**

After applying suggestions, the existing `buildWechatPayApplymentPayload` and existing create/update service remain unchanged except for attachment `file_object_id`. Tests must prove OCR-originated identity/bank values still pass through current schema and sensitive-payload encryption.

- [ ] **Step 6: Verify focused frontend and backend tests**

```bash
bun test apps/api/src/schema/wechat-pay-applyments.test.ts apps/api/src/services/wechat-pay-applyments-sensitive-integration.test.ts
bun test apps/admin/components/ocr/ocr-field-review-dialog.test.tsx apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts
pnpm --dir apps/admin check
bun run --cwd apps/api check
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/schema/wechat-pay-applyments.ts apps/api/src/schema/wechat-pay-applyments.test.ts apps/admin/components/ocr apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx apps/admin/components/finance/finance-wechat-pay-applyment-schema.test.ts
git commit -m "feat(finance): 支持进件证照识别回填"
```

## Task 10: Run Real Smoke and Release Audit

**Files:**

- Create after execution: `docs/tencent-ocr/2026-07-22-tencent-ocr-phase1-smoke-record.md`

- [ ] **Step 1: Run the full static gate**

```bash
(cd packages/domain && bun test src/ocr.test.ts)
(cd apps/api && bun test src/services/ocr src/controllers/ocr src/schema/wechat-pay-applyments.test.ts)
bun run --cwd apps/api check
pnpm --dir apps/admin check
git diff --check
```

- [ ] **Step 2: Verify migration alignment**

```bash
supabase migration list
```

Expected: Local/Remote align for `20260722130000`.

- [ ] **Step 3: Configure a least-privilege test credential**

Use platform Admin `/settings?group=ocr`. Save an OCR-only CAM credential and enable only business-license capability first. Do not place secrets in `.env` examples, docs, screenshots or smoke logs.

- [ ] **Step 4: Execute controlled smoke samples**

Use synthetic or explicitly authorized non-production test documents:

1. valid business license;
2. blurred business license to verify warning/manual fallback;
3. ID front/back through encrypted interface;
4. bank card with test data;
5. cross-tenant file ID negative test;
6. same idempotency key replay;
7. same file/document cached replay;
8. daily-limit negative test.

- [ ] **Step 5: Verify Admin applyment behavior**

Confirm upload, recognition, diff dialog, selected-field fill and manual edit. Do not submit a real WeChat applyment during OCR smoke.

- [ ] **Step 6: Record sanitized evidence**

The smoke record must include recognition IDs, tenant ID, document type, status, duration, cache/idempotency result, provider RequestId, warning codes, API status and screenshots with all document values masked. Do not include object signed URLs or source images.

- [ ] **Step 7: Final completion audit**

Confirm every Phase 1 PRD acceptance item has direct test, API, migration or UI evidence. Phase 1 is not complete if encrypted ID recognition, expiry clearing, cross-tenant denial or existing sensitive applyment save remains unverified.

- [ ] **Step 8: Commit smoke evidence**

```bash
git add docs/tencent-ocr/2026-07-22-tencent-ocr-phase1-smoke-record.md
git commit -m "docs(ocr): 记录一期识别验收"
```

## Rollback Strategy

1. Set `TENCENT_OCR_ENABLED=false`; Admin and clients hide recognition actions while manual forms remain usable.
2. Revert API/Admin code without changing existing applyment or expense data.
3. Keep `ocr_recognitions` as redacted audit until retention expires.
4. Use a forward migration only if the table/settings/permissions must be removed.
5. No rollback step changes workflow runtime, WeChat Pay applyment status or existing COS objects.

## Completion Definition

Phase 1 is complete only when:

- official SDK works under Bun and no handwritten signing exists;
- migration Local/Remote status aligns;
- platform settings are encrypted and tenant-inaccessible;
- business license, encrypted ID front/back and bank card all have real smoke evidence;
- duplicate requests do not duplicate provider calls;
- sensitive results expire and are cleared;
- Admin field review never auto-saves or auto-submits;
- existing applyment schema/encryption tests still pass;
- platform audit is paginated and redacted;
- the hourly cleanup scheduler has dry-run/apply evidence and expired reads return 410;
- API/Admin full checks and `git diff --check` pass.
