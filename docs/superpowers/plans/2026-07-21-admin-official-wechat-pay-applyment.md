# Admin Official WeChat Pay Applyment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the platform Admin applyment page into the complete APIv3 entry point for reviewing, submitting, tracking, signing, and activating enterprise and individual-business WeChat Pay sub-merchants.

**Architecture:** Extend the existing application aggregate with encrypted sensitive payloads and official status evidence, then add a dedicated WeChat Pay applyment gateway for media upload, RSA-OAEP field encryption, submission, and status queries. Keep controllers HTTP-only, orchestrate state transitions in services, persist through repositories/RPCs, and make both tenant and platform Admin render backend-provided fields and actions.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations, Node crypto, Tencent COS, Next.js 15, React 19, shadcn/ui, Tailwind CSS, Bun test, Playwright.

**Source Design:** `docs/decoration-finance/2026-07-21-admin-official-wechat-pay-applyment-design.md`

---

### Task 1: Add the official applyment persistence and permission model

**Files:**

- Create: `supabase/migrations/20260721130000_wechat_pay_official_applyment.sql`
- Create: `apps/api/src/services/wechat-pay-official-applyment-migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [x] **Step 1: Write the failing migration contract test**

Create a Bun test that reads the migration and asserts the sensitive payload, official evidence, media table, permissions, and claim RPC exist:

```typescript
import { describe, expect, test } from "bun:test";

const migration = await Bun.file(
  new URL(
    "../../../../supabase/migrations/20260721130000_wechat_pay_official_applyment.sql",
    import.meta.url,
  ),
).text();

describe("official WeChat Pay applyment migration", () => {
  test("adds encrypted payload and official status evidence", () => {
    expect(migration).toContain("sensitive_payload_ciphertext text NULL");
    expect(migration).toContain("wechat_applyment_state_raw text NULL");
    expect(migration).toContain("sign_url text NULL");
    expect(migration).toContain("audit_detail jsonb NOT NULL DEFAULT '[]'::jsonb");
  });

  test("adds media reuse and an atomic submission claim", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyment_media");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_wechat_pay_applyment_submission");
    expect(migration).toContain("UNIQUE (applyment_id, object_key, sha256)");
  });
});
```

- [x] **Step 2: Run the contract test and verify RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-official-applyment-migration-contract.test.ts
```

Expected: FAIL because the migration does not exist.

- [x] **Step 3: Add the additive migration**

Add these application columns with non-blank/JSON constraints where applicable:

```sql
ALTER TABLE public.tenant_wechat_pay_applyments
  ADD COLUMN IF NOT EXISTS subject_type text NULL,
  ADD COLUMN IF NOT EXISTS license_address text NULL,
  ADD COLUMN IF NOT EXISTS license_period_begin date NULL,
  ADD COLUMN IF NOT EXISTS license_period_end text NULL,
  ADD COLUMN IF NOT EXISTS identity_doc_type text NULL,
  ADD COLUMN IF NOT EXISTS identity_address_masked text NULL,
  ADD COLUMN IF NOT EXISTS identity_period_begin date NULL,
  ADD COLUMN IF NOT EXISTS identity_period_end text NULL,
  ADD COLUMN IF NOT EXISTS contact_type text NULL,
  ADD COLUMN IF NOT EXISTS contact_identity_doc_type text NULL,
  ADD COLUMN IF NOT EXISTS contact_identity_period_begin date NULL,
  ADD COLUMN IF NOT EXISTS contact_identity_period_end text NULL,
  ADD COLUMN IF NOT EXISTS service_phone text NULL,
  ADD COLUMN IF NOT EXISTS settlement_id text NULL,
  ADD COLUMN IF NOT EXISTS qualification_type text NULL,
  ADD COLUMN IF NOT EXISTS sensitive_payload_ciphertext text NULL,
  ADD COLUMN IF NOT EXISTS sensitive_payload_version integer NULL,
  ADD COLUMN IF NOT EXISTS sensitive_payload_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS has_sensitive_payload boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wechat_applyment_state_raw text NULL,
  ADD COLUMN IF NOT EXISTS sign_url text NULL,
  ADD COLUMN IF NOT EXISTS audit_detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_wechat_request_id text NULL,
  ADD COLUMN IF NOT EXISTS last_wechat_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS submission_claimed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS submission_attempt_count integer NOT NULL DEFAULT 0;
```

Support `wechat_editing` and `opening` in the main status constraint. Add the media table with tenant/applyment foreign keys, category, object key, SHA256, MediaID, upload time, and request ID. Add `platform.wechat_pay.applyment.submit`, `.sync`, and `.repair`; grant submit/sync to the platform admin role, but do not grant repair automatically.

Implement `claim_wechat_pay_applyment_submission(p_applyment_id, p_employee_id)` as `SECURITY DEFINER`, lock the application row `FOR UPDATE`, allow only `approved`, `wechat_editing`, or retryable `applying`, reject a live claim newer than five minutes, increment attempts, set `status='applying'`, and return the claimed row. Revoke public execution and grant only `service_role`.

- [x] **Step 4: Synchronize generated database types**

Apply the migration to the configured Supabase project, then run:

```bash
supabase migration list
pnpm run gen
```

Expected: Local/Remote include `20260721130000`; `apps/api/src/types/database.ts` contains all new columns, the media table, and the claim RPC signature. If project-linked generation is unavailable, query the applied catalog and update only the exact generated table/RPC blocks; never replace the file with an empty result.

- [x] **Step 5: Verify and commit**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-official-applyment-migration-contract.test.ts
pnpm --dir .. exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

Commit:

```bash
git add supabase/migrations/20260721130000_wechat_pay_official_applyment.sql \
  apps/api/src/services/wechat-pay-official-applyment-migration-contract.test.ts \
  apps/api/src/types/database.ts
git commit -m "feat(finance): add official applyment persistence"
```

### Task 2: Encrypt and merge sensitive application payloads

**Files:**

- Create: `apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.test.ts`

- [x] **Step 1: Write failing crypto and schema tests**

Cover round trips, tenant/application AAD isolation, wrong keys, partial draft updates, and conditional enterprise/individual fields:

```typescript
const context = { tenantId: "tenant-1", applymentId: "applyment-1", version: 1 };
const encrypted = encryptApplymentSensitivePayload({
  context,
  payload: {
    identity_name: "张三",
    identity_number: "41000019900101001X",
    contact_name: "张三",
    contact_phone: "18800000000",
    contact_email: "finance@example.com",
    contact_identity_number: null,
    contact_identity_address: null,
    bank_account_name: "示例装饰有限公司",
    bank_account_number: "6222000000000000",
  },
  rootSecret: "test-root-secret",
});

expect(decryptApplymentSensitivePayload({ context, ciphertext: encrypted, rootSecret: "test-root-secret" }))
  .toMatchObject({ bank_account_number: "6222000000000000" });
```

Schema tests must require `subject_type`, mainland identity validity dates, service phone, settlement ID, qualification type, contact email, and the original sensitive values on first create. When `contact_type=SUPER`, also require the agent identity number, address, validity dates, and identity attachments. Update schemas allow omitted sensitive fields only when an existing encrypted payload already contains them.

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-applyment-sensitive-payload.test.ts \
  src/schema/wechat-pay-applyments.test.ts \
  src/services/wechat-pay-applyments.test.ts
```

Expected: FAIL because the cipher and new fields do not exist.

- [x] **Step 3: Implement the purpose-bound cipher**

Implement AES-256-GCM with a key derived from `APP_CONFIG_ENCRYPTION_KEY` using HKDF-SHA256:

```typescript
type ApplymentSensitivePayload = {
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

const aad = Buffer.from(
  `wechat-pay-applyment:${context.tenantId}:${context.applymentId}:v${context.version}`,
  "utf8",
);
```

Serialize as `wpa:v1:<iv-base64url>:<tag-base64url>:<ciphertext-base64url>`. Wrap missing/invalid keys with `Errors.business(...)`; do not use `throw new Error()`.

- [x] **Step 4: Persist encrypted payloads and safe projections**

Generate the application UUID in the service before insert so AAD is stable. On create, encrypt all sensitive values; on update, decrypt and merge only supplied fields. Store only masked phone, masked bank account, safe names/email, `has_sensitive_payload=true`, and ciphertext metadata in the application row. Strip `sensitive_payload_ciphertext` from every tenant/platform detail view.

Use this merge rule:

```typescript
const nextSensitive = {
  ...currentSensitive,
  ...pickDefinedSensitiveFields(input),
};
```

- [x] **Step 5: Verify and commit**

Run the focused tests and `bun run api:typecheck`; expected PASS.

Commit:

```bash
git add apps/api/src/schema/wechat-pay-applyments.ts \
  apps/api/src/schema/wechat-pay-applyments.test.ts \
  apps/api/src/services/wechat-pay-applyment-sensitive-payload.ts \
  apps/api/src/services/wechat-pay-applyment-sensitive-payload.test.ts \
  apps/api/src/services/wechat-pay-applyments.ts \
  apps/api/src/services/wechat-pay-applyments.test.ts
git commit -m "feat(finance): encrypt applyment sensitive data"
```

### Task 3: Build the official APIv3 applyment gateway

**Files:**

- Create: `apps/api/src/services/wechat-pay-applyment-crypto.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-crypto.test.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-request-builder.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-request-builder.test.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-gateway.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-gateway.test.ts`
- Modify: `apps/api/src/services/wechat-pay-api-response.ts`

- [x] **Step 1: Write failing RSA, multipart, submit, and query tests**

Generate RSA keys in tests and prove OAEP-SHA1 compatibility by decrypting the result:

```typescript
const encrypted = encryptWechatPaySensitiveField("18800000000", publicKey);
expect(privateDecrypt({
  key: privateKey,
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha1",
}, Buffer.from(encrypted, "base64")).toString("utf8")).toBe("18800000000");
```

Mock `fetch` and assert:

- media authorization signs exactly `JSON.stringify({ filename, sha256 })`;
- multipart includes `meta` and binary `file` parts with CRLF boundaries;
- submit calls `POST /v3/applyment4sub/applyment/` with `Wechatpay-Serial` equal to the public key ID;
- query URL encodes the business code;
- all responses are signature verified;
- timeout and signed WeChat failures expose sanitized request IDs and codes.

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-applyment-crypto.test.ts \
  src/services/wechat-pay-applyment-request-builder.test.ts \
  src/services/wechat-pay-applyment-gateway.test.ts
```

Expected: FAIL because the gateway files do not exist.

- [x] **Step 3: Implement sensitive-field encryption and payload building**

Use only Node APIs verified by the installed Node type definitions:

```typescript
publicEncrypt({
  key: publicKeyPem,
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha1",
}, Buffer.from(value, "utf8")).toString("base64");
```

Build a typed `WechatPayApplymentSubmitRequest` containing `contact_info`, `subject_info`, `business_info`, `settlement_info`, and `bank_account_info`. Fix the business scene to the central profile AppID. Never log or include the request body in AppError details.

- [x] **Step 4: Implement media, submit, and query transport**

Expose:

```typescript
interface WechatPayApplymentGatewayPort {
  uploadMedia(input: UploadApplymentMediaInput): Promise<{ mediaId: string; requestId: string | null }>;
  submit(input: SubmitWechatPayApplymentInput): Promise<{ applymentId: string; requestId: string | null }>;
  queryByBusinessCode(input: QueryWechatPayApplymentInput): Promise<WechatPayApplymentQueryResult>;
}
```

Reuse `buildWechatPayAuthorization()` and `readVerifiedWechatPayJson()`. Use a ten-second abort timeout and `Errors.business` codes prefixed `WECHAT_PAY_APPLYMENT_`.

- [x] **Step 5: Verify and commit**

Run focused tests plus `bun run api:typecheck`; expected PASS.

Commit:

```bash
git add apps/api/src/services/wechat-pay-applyment-crypto.ts \
  apps/api/src/services/wechat-pay-applyment-crypto.test.ts \
  apps/api/src/services/wechat-pay-applyment-request-builder.ts \
  apps/api/src/services/wechat-pay-applyment-request-builder.test.ts \
  apps/api/src/services/wechat-pay-applyment-gateway.ts \
  apps/api/src/services/wechat-pay-applyment-gateway.test.ts \
  apps/api/src/services/wechat-pay-api-response.ts
git commit -m "feat(payments): add official applyment gateway"
```

### Task 4: Upload private COS attachments and reuse MediaIDs

**Files:**

- Create: `apps/api/src/services/wechat-pay-applyment-media.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-media.test.ts`
- Modify: `apps/api/src/repositories/wechat-pay-applyments.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-types.ts`
- Modify: `apps/api/src/services/files/file-url-resolver.ts`

- [x] **Step 1: Write failing media orchestration tests**

Test valid JPG/PNG/BMP magic bytes, rejected WebP/HEIC, size limits, object-key-only access, SHA256 reuse, and replacement uploads:

```typescript
expect(await service.resolveMedia({
  tenantId: "tenant-1",
  applymentId: "applyment-1",
  attachment: { category: "license_copy", object_key: "private/wechat-pay/license.jpg" },
})).toEqual({ mediaId: "media-1" });

expect(gateway.uploadMedia).toHaveBeenCalledTimes(1);
expect(repository.findMediaByDigest).toHaveBeenCalledWith(expect.objectContaining({
  sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
}));
```

- [x] **Step 2: Run the media tests and verify RED**

Run `cd apps/api && bun test src/services/wechat-pay-applyment-media.test.ts`.

Expected: FAIL because the service and repository media methods do not exist.

- [x] **Step 3: Implement bounded download and validation**

Resolve only private COS object keys with `resolveSignedStoredFileUrl()`. Fetch with abort timeout, reject redirects to non-COS hosts, cap image reads at 2MB, compute SHA256, and identify JPG/PNG/BMP from magic bytes. Normalize the filename to the matching extension before upload.

- [x] **Step 4: Persist and reuse MediaIDs**

Add repository methods `findMediaByDigest()` and `upsertMedia()`. Never query all media rows. Use `(applyment_id, object_key, sha256)` and select only the six required columns.

- [x] **Step 5: Verify and commit**

Run focused tests and API typecheck; expected PASS.

Commit:

```bash
git add apps/api/src/services/wechat-pay-applyment-media.ts \
  apps/api/src/services/wechat-pay-applyment-media.test.ts \
  apps/api/src/repositories/wechat-pay-applyments.ts \
  apps/api/src/services/wechat-pay-applyments-types.ts \
  apps/api/src/services/files/file-url-resolver.ts
git commit -m "feat(finance): upload applyment media to wechat"
```

### Task 5: Orchestrate official submission with idempotent recovery

**Files:**

- Create: `apps/api/src/services/wechat-pay-applyment-submission.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-submission.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-platform.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-types.ts`
- Modify: `apps/api/src/repositories/wechat-pay-applyments.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.ts`
- Modify: `apps/api/src/controllers/platform-wechat-pay-applyments/index.ts`
- Modify: `apps/api/src/controllers/platform-wechat-pay-applyments/routes.test.ts`

- [x] **Step 1: Write failing submission service tests**

Cover profile readiness, complete sensitive payload, required attachment categories, claim contention, MediaID reuse, successful submit, timeout recovery through query, explicit not-found retry, and sanitized events:

```typescript
const result = await service.submitToWechat(platformAuth(), applymentId);

expect(result.applyment).toMatchObject({
  status: "reviewing",
  applyment_id: "2000002124775691",
  wechat_applyment_state_raw: "APPLYMENT_STATE_AUDITING",
});
expect(repository.claimSubmission).toHaveBeenCalledTimes(1);
expect(gateway.submit).toHaveBeenCalledTimes(1);
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-applyment-submission.test.ts \
  src/controllers/platform-wechat-pay-applyments/routes.test.ts
```

Expected: FAIL on the missing service and route.

- [x] **Step 3: Implement the submission orchestration**

Sequence:

```text
assert platform permission
-> claim row through RPC
-> load validated tenant_service_provider profile and exact secret revision
-> decrypt application payload
-> upload/reuse all required media
-> build and submit official request
-> immediately query by stable business_code
-> persist official evidence and event
-> release claim without changing an already-confirmed official state
```

The service must not accept merchant ID, AppID, certificate, public key, or secret reference from the request body.

- [x] **Step 4: Add the platform route**

Add strict empty-body schema and controller route:

```text
POST /platform/finance/wechat-pay/applyments/:id/submit-to-wechat
```

Return the safe detail view with `available_actions[]`.

- [x] **Step 5: Verify and commit**

Run focused tests, API typecheck, and API file-size check; expected PASS.

Commit:

```bash
git add apps/api/src/services/wechat-pay-applyment-submission.ts \
  apps/api/src/services/wechat-pay-applyment-submission.test.ts \
  apps/api/src/services/wechat-pay-applyments-platform.ts \
  apps/api/src/services/wechat-pay-applyments.ts \
  apps/api/src/services/wechat-pay-applyments-types.ts \
  apps/api/src/repositories/wechat-pay-applyments.ts \
  apps/api/src/schema/wechat-pay-applyments.ts \
  apps/api/src/controllers/platform-wechat-pay-applyments/index.ts \
  apps/api/src/controllers/platform-wechat-pay-applyments/routes.test.ts
git commit -m "feat(finance): submit official wechat applyments"
```

### Task 6: Synchronize official states and gate activation

**Files:**

- Create: `apps/api/src/services/wechat-pay-applyment-status.ts`
- Create: `apps/api/src/services/wechat-pay-applyment-status.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-platform.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-activation.test.ts`
- Modify: `apps/api/src/controllers/platform-wechat-pay-applyments/index.ts`
- Modify: `apps/api/src/controllers/platform-wechat-pay-applyments/routes.test.ts`

- [x] **Step 1: Write failing state mapping and activation tests**

Assert every official state maps exactly as specified, preserves `sign_url`, `audit_detail`, request ID, and `sub_mchid`, and exposes the correct actions:

```typescript
expect(mapWechatApplymentState({
  applyment_state: "APPLYMENT_STATE_TO_BE_SIGNED",
  sign_url: "https://pay.weixin.qq.com/example",
})).toMatchObject({ status: "signing", actions: ["sync_wechat_status", "open_sign_url"] });
```

Activation must reject anything except official `APPLYMENT_STATE_FINISHED` with `sub_mchid`, central profile readiness, and platform AppID mode.

- [x] **Step 2: Run tests and verify RED**

Run focused status, activation, and route tests. Expected: FAIL.

- [x] **Step 3: Implement status synchronization**

Add:

```text
POST /platform/finance/wechat-pay/applyments/:id/sync-wechat-status
```

Load the exact central profile/secret revision, query by business code, map and persist official evidence, and write a status-change event only when the effective state changed. Never allow the normal endpoint to accept a caller-supplied status.

- [x] **Step 4: Harden activation and clear high-risk payloads**

On successful activation, copy only central profile runtime fields and tenant `sub_mchid`, then set:

```typescript
{
  status: "active",
  sensitive_payload_ciphertext: null,
  sensitive_payload_version: null,
  sensitive_payload_updated_at: null,
  has_sensitive_payload: false,
}
```

Retain masked projections, official evidence, audit detail, and events.

- [x] **Step 5: Move manual repair behind a separate permission**

Rename the normal `wechat-status` operation to `repair-wechat-state`, require `platform.wechat_pay.applyment.repair`, require a non-empty reason, and remove it from `available_actions` unless the authenticated operator has that permission.

- [x] **Step 6: Verify and commit**

Run focused tests and `bun run api:check`; expected PASS.

Commit:

```bash
git add apps/api/src/services/wechat-pay-applyment-status.ts \
  apps/api/src/services/wechat-pay-applyment-status.test.ts \
  apps/api/src/services/wechat-pay-applyments-platform.ts \
  apps/api/src/services/wechat-pay-applyments-activation.test.ts \
  apps/api/src/controllers/platform-wechat-pay-applyments/index.ts \
  apps/api/src/controllers/platform-wechat-pay-applyments/routes.test.ts
git commit -m "feat(finance): synchronize official applyment states"
```

### Task 7: Rebuild the tenant application form with shadcn controls

**Files:**

- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-steps.tsx`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx`
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-schema.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-form-fields.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [x] **Step 1: Read the UI skills and audit the current rendered page**

Read `admin-design`, `impeccable`, `shadcn`, and `design-taste-frontend` skill instructions. Start the worktree Admin only after static imports/types are valid, then capture the existing desktop and mobile page for comparison.

- [x] **Step 2: Write failing form contract tests**

Require four steps, conditional subject/account fields, shadcn controls, masked sensitive state, official image types, and no raw `<select>`/visible secret values:

```typescript
expect(panelSource).toContain("FinanceWechatPayApplymentSteps");
expect(stepsSource).toContain("SUBJECT_TYPE_ENTERPRISE");
expect(stepsSource).toContain("SUBJECT_TYPE_INDIVIDUAL");
expect(attachmentSource).toContain("image/bmp");
expect(attachmentSource).not.toContain("image/webp");
expect(panelSource).not.toMatch(/<select\b/);
```

- [x] **Step 3: Run the UI tests and verify RED**

Run:

```bash
cd apps/admin
bun test components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: FAIL on the new form structure.

- [x] **Step 4: Implement the four-step form**

Use shadcn `Tabs` as the controlled step surface, `Progress` for completion, `Field` for labels/errors, `Select` for enums, `Checkbox` for confirmations, and `AlertDialog` for final submit. Keep fixed step dimensions and responsive one/two-column grids. The steps are:

```text
主体与证照
法人和超级管理员
经营及结算
附件与复核
```

Sensitive fields render only blank replacement inputs plus `已安全保存` badges when masked values exist. Build request payloads from the current form without sending empty replacement fields. Identity document type is fixed to mainland resident ID in the first release. Selecting `contact_type=SUPER` reveals agent identity number/address/validity fields and required front/back attachment slots; selecting `LEGAL` removes those agent-only values from the outgoing payload.

- [x] **Step 5: Make attachment validation match WeChat**

Accept only JPEG, PNG, and BMP with a 2MB per-image limit. Keep private COS direct upload, show per-slot readiness, and support multiple business-scene screenshots up to five entries while preserving one attachment per required identity/license category. Add conditional `contact_id_card_front` and `contact_id_card_back` slots for `contact_type=SUPER`.

- [x] **Step 6: Verify responsive rendering and commit**

Run:

```bash
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Use Playwright at 1440x900 and 390x844 to verify no overlap, horizontal overflow, clipped labels, nested cards, or raw form controls.

Commit:

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-*.tsx \
  apps/admin/components/finance/finance-wechat-pay-applyment-shared.ts \
  apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
git commit -m "feat(admin): complete tenant applyment form"
```

### Task 8: Turn the platform detail into an official applyment control center

**Files:**

- Create: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-progress.tsx`
- Create: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-sync.tsx`
- Create: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-submit-dialog.tsx`
- Modify: `apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-actions.tsx`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-requests.ts`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts`

- [x] **Step 1: Write failing platform UI tests**

Assert the page renders backend actions, official progress, sign URL, audit details, auto sync, and confirmation dialogs, while removing the normal manual status form:

```typescript
expect(pageSource).toContain("PlatformWechatPayApplymentProgress");
expect(actionsSource).toContain("submit_to_wechat");
expect(actionsSource).toContain("sync_wechat_status");
expect(actionsSource).toContain("activate_payment_config");
expect(actionsSource).not.toContain("微信状态回填");
expect(syncSource).toContain("document.visibilityState");
```

- [x] **Step 2: Run the UI test and verify RED**

Run `cd apps/admin && bun test components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts`.

Expected: FAIL.

- [x] **Step 3: Implement backend-action-driven controls**

Render only `available_actions[]`. Put one primary action in the right rail, secondary sync/open/copy actions below it, and hide repair controls unless returned by the API. Confirm official submission and activation with shadcn `AlertDialog`.

- [x] **Step 4: Implement official status evidence**

Show the six-step progress line, last sync time, request ID, WeChat application ID, `sub_mchid`, signing link, and field-level `audit_detail[]`. Use `ExternalLink` and `Copy` Lucide icons with tooltips. Do not create a QR dependency.

- [x] **Step 5: Implement visible-page auto sync**

While status is `applying`, `reviewing`, `account_verifying`, `signing`, or `opening`, call the sync endpoint every 30 seconds only when `document.visibilityState === "visible"`. Stop on unmount or terminal state and surface errors without replacing the current data.

- [x] **Step 6: Verify responsive rendering and commit**

Run Admin tests, check, build, and Playwright desktop/mobile screenshots. Expected: no console errors, failed API requests, overlaps, or inaccessible actions.

Commit:

```bash
git add 'apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx' \
  apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-*.tsx \
  apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-requests.ts \
  apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts
git commit -m "feat(admin): add official applyment control center"
```

### Task 9: Run security, integration, and mock end-to-end verification

**Files:**

- Create: `apps/api/src/scripts/wechat-pay-applyment-preflight.ts`
- Create: `apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts`
- Create: `docs/decoration-finance/2026-07-21-official-applyment-implementation-record.md`
- Modify: `apps/api/package.json`
- Modify: `docs/decoration-finance/README.md`

- [x] **Step 1: Add a read-only preflight script and tests**

The script accepts `--applyment-id`, loads the application and central profile, and reports only blocker codes:

```json
{
  "ready": false,
  "blockers": [
    { "code": "APPLYMENT_SENSITIVE_PAYLOAD_MISSING" },
    { "code": "APPLYMENT_MEDIA_TYPE_UNSUPPORTED", "category": "license_copy" }
  ]
}
```

It must never print names, phone numbers, ID numbers, bank accounts, ciphertext, keys, certificate content, object signed URLs, or raw WeChat request bodies.

- [x] **Step 2: Run focused and full static verification**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-applyment-*.test.ts \
  src/services/wechat-pay-official-applyment-migration-contract.test.ts \
  src/controllers/platform-wechat-pay-applyments/routes.test.ts
cd ../..
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
```

Expected: all commands PASS.

- [x] **Step 3: Run a mock WeChat state-chain smoke**

Start the API with a local mock gateway fixture and exercise:

```text
approved
-> submit-to-wechat
-> APPLYMENT_STATE_AUDITING
-> APPLYMENT_STATE_TO_BE_CONFIRMED
-> APPLYMENT_STATE_TO_BE_SIGNED
-> APPLYMENT_STATE_SIGNING
-> APPLYMENT_STATE_FINISHED
-> activate-config
```

Verify one stable business code, one application ID, reused media IDs, exact status history, safe API projections, cleared sensitive payload after activation, and an active tenant config linked to the central service-provider profile.

- [x] **Step 4: Perform the completion security audit**

Search source and captured logs:

```bash
rg -n "sensitive_payload_ciphertext|identity_number|bank_account_number|private_key_pem|api_v3_key" \
  apps/admin docs/decoration-finance/2026-07-21-official-applyment-implementation-record.md
```

Expected: no Admin response type contains ciphertext or original high-risk fields, and the implementation record contains field names only.

- [x] **Step 5: Document evidence and commit**

Record migration version, test commands, mock IDs, status chain, screenshots, known operational prerequisites, and explicit confirmation that no real WeChat application was created.

Commit:

```bash
git add apps/api/src/scripts/wechat-pay-applyment-preflight.ts \
  apps/api/src/scripts/wechat-pay-applyment-preflight.test.ts \
  apps/api/package.json \
  docs/decoration-finance/2026-07-21-official-applyment-implementation-record.md \
  docs/decoration-finance/README.md
git commit -m "test(finance): verify official applyment workflow"
```

### Task 10: Execute the explicitly approved real applyment and payment smoke

**Files:**

- Modify: `docs/decoration-finance/2026-07-21-official-applyment-implementation-record.md`

- [ ] **Step 1: Run real-application preflight without external writes**

Run:

```bash
cd apps/api
APPLYMENT_ID="$(printf '%s' "$APPROVED_WECHAT_PAY_APPLYMENT_ID")"
bun --env-file=.env --env-file=../../.env.local \
  src/scripts/wechat-pay-applyment-preflight.ts --applyment-id="$APPLYMENT_ID"
```

Expected: `ready=true`, zero blockers, central profile `tenant_service_provider` valid, and no sensitive output.

- [ ] **Step 2: Obtain explicit execution confirmation**

Before the external POST, present the tenant name, masked application number, subject type, platform profile, and that this creates a real WeChat Pay application. Do not display raw identity or bank data. Proceed only after the user confirms this exact application.

- [ ] **Step 3: Submit and track the real application through Admin**

Use the platform Admin `提交微信进件` action once. Record the platform application ID, business code, WeChat applyment ID, sanitized request ID, media categories, and official state. Continue syncing until the page provides the merchant action required by WeChat.

- [ ] **Step 4: Complete merchant verification/signing and activation**

The merchant super administrator opens the returned sign URL and completes any account verification and signing. Sync to `APPLYMENT_STATE_FINISHED`, verify `sub_mchid`, then use the explicit `激活收款` action.

- [ ] **Step 5: Run the real one-fen payment smoke**

Create one project-payment or dedicated approved one-fen order using the activated tenant config. Verify prepay, mini-program payment, callback signature/decryption, paid order, payment record, ledger record, and tenant funds routing. Never expose payment credentials in the record.

- [ ] **Step 6: Final verification and commit**

Update the implementation record with sanitized IDs, timestamps, state evidence, ledger/payment IDs, and screenshot paths. Run `git diff --check` and commit:

```bash
git add docs/decoration-finance/2026-07-21-official-applyment-implementation-record.md
git commit -m "docs(finance): record official applyment acceptance"
```
