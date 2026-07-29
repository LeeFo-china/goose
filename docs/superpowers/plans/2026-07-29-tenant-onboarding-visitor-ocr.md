# Tenant Onboarding Visitor OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a purpose-limited visitor-session OCR API that recognizes a privately owned tenant-onboarding business license without exposing the employee OCR endpoints.

**Architecture:** Add a dedicated tenant-onboarding OCR controller and service while reusing the existing Tencent gateway, normalizer, crypto, capability catalog, and cleanup job. Extend `ocr_recognitions` with a visitor scope and use a service-role PostgreSQL command function to atomically enforce idempotency, visitor/IP quotas, and active processing limits.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase/PostgreSQL migrations and RPC, Tencent Cloud OCR, Sharp, Bun test.

---

### Task 1: Domain, capability, and visitor encryption context

**Files:**
- Modify: `packages/domain/src/ocr.ts`
- Modify: `packages/domain/package.json`
- Modify: `apps/api/src/services/ocr/capabilities.ts`
- Modify: `apps/api/src/services/ocr/crypto.ts`
- Test: `apps/api/src/services/ocr/capabilities.test.ts`
- Test: `apps/api/src/services/ocr/crypto.test.ts`

- [ ] **Step 1: Write failing domain, capability, and crypto tests**

Add assertions equivalent to:

```ts
expect(OCR_SCENE_VALUES).toContain("tenant_onboarding_license");
expect(listVisitorOcrCapabilities("tenant_onboarding_license")).toEqual([
  expect.objectContaining({
    scene: "tenant_onboarding_license",
    document_type: "business_license",
  }),
]);

const visitorContext = {
  scopeType: "visitor" as const,
  actorVisitorId: "wechat_visitor_123",
  recognitionId: crypto.randomUUID(),
};
expect(decryptOcrResult({
  context: visitorContext,
  ciphertext: encryptOcrResult({
    context: visitorContext,
    result,
    rootSecret,
  }),
  rootSecret,
})).toEqual(result);
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/ocr/capabilities.test.ts src/services/ocr/crypto.test.ts
```

Expected: failures because the scene, visitor audience, visitor list function, and visitor AAD do not exist.

- [ ] **Step 3: Implement the minimal domain and crypto changes**

Add `tenant_onboarding_license` to `OCR_SCENE_VALUES`, bump
`@gooes/domain` to `1.13.0`, extend `OcrCapabilityAudience` with `visitor`,
register the fixed `BizLicenseOCR` capability, and add:

```ts
export function listVisitorOcrCapabilities(scene?: OcrScene): OcrCapability[] {
  return toPublicOcrCapabilities(
    listOcrCapabilityDefinitions(scene, "visitor"),
  );
}
```

Extend `OcrResultCryptoContext` without changing existing tenant/platform AAD:

```ts
{
  scopeType: "visitor";
  actorVisitorId: string;
  recognitionId: string;
}
```

Visitor AAD must be:

```text
ocr:visitor:<actorVisitorId>:<recognitionId>:v1
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run the same test command and expect zero failures.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ocr.ts packages/domain/package.json \
  apps/api/src/services/ocr/capabilities.ts \
  apps/api/src/services/ocr/capabilities.test.ts \
  apps/api/src/services/ocr/crypto.ts \
  apps/api/src/services/ocr/crypto.test.ts
git commit -m "feat(ocr): 增加入驻访客识别能力"
```

### Task 2: Visitor OCR migration and atomic claim command

**Files:**
- Create: `supabase/migrations/20260729120000_add_tenant_onboarding_visitor_ocr.sql`
- Create: `apps/api/src/services/ocr/visitor-migration-contract.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

The test must read the exact migration file and assert:

```ts
expect(sql).toContain("ADD COLUMN actor_visitor_id text");
expect(sql).toContain("ADD COLUMN request_ip_hash text");
expect(sql).toContain("ADD COLUMN provider_started_at timestamptz");
expect(sql).toContain("ADD COLUMN processing_deadline_at timestamptz");
expect(sql).toContain("'visitor'");
expect(sql).toContain("'tenant_onboarding_license'");
expect(sql).toContain("ocr_recognitions_visitor_idempotency_idx");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.ocr_claim_visitor_recognition");
expect(sql).toContain("pg_advisory_xact_lock");
expect(sql).toContain("REVOKE ALL ON FUNCTION");
expect(sql).toContain("GRANT EXECUTE ON FUNCTION");
```

Also assert the function returns stable outcomes for:
`created`, `existing`, `in_progress`, `expired`,
`idempotency_conflict`, `daily_limited`, `rate_limited`.

- [ ] **Step 2: Run the test and verify RED**

```bash
cd apps/api
bun test src/services/ocr/visitor-migration-contract.test.ts
```

Expected: missing migration file.

- [ ] **Step 3: Write the migration**

The migration must:

1. Add the four nullable columns.
2. extend scene and scope CHECK constraints without invalidating old tenant/platform rows;
3. add partial visitor idempotency, visitor daily usage, IP window, active processing, and expiry indexes;
4. seed the seven visitor settings with the defaults from the design;
5. create `ocr_claim_visitor_recognition(...) RETURNS jsonb`;
6. acquire global, IP, then visitor advisory transaction locks in that fixed order;
7. check an existing idempotency key before quota;
8. compare `file_object_id` for idempotency conflict;
9. count only rows whose `provider_started_at` is non-null for daily/IP quota;
10. insert a visitor processing row with `provider_started_at=p_now`;
11. keep the function executable only by `service_role`;
12. include a rollback comment describing function/index/column/constraint removal order.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run the same command and expect zero failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729120000_add_tenant_onboarding_visitor_ocr.sql \
  apps/api/src/services/ocr/visitor-migration-contract.test.ts
git commit -m "feat(ocr): 增加访客识别数据域"
```

### Task 3: Visitor-owned file query and real-image verification

**Files:**
- Modify: `apps/api/src/repositories/platform-file-objects.ts`
- Create: `apps/api/src/services/ocr/visitor-image-verifier.ts`
- Create: `apps/api/src/services/ocr/visitor-image-verifier.test.ts`

- [ ] **Step 1: Write failing verifier tests**

Build real JPEG/PNG buffers with Sharp and test:

```ts
await expect(verifyVisitorOcrImage({
  file,
  signedUrlResolver: async () => "https://signed/license",
  fetcher: async () => response(validPng, "image/png", file.checksum),
})).resolves.toMatchObject({ mimeType: "image/png" });

await expect(verifyVisitorOcrImage({
  file,
  signedUrlResolver,
  fetcher: async () => response(Buffer.from("not-image"), "image/png", file.checksum),
})).rejects.toMatchObject({
  code: ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED,
});
```

Also cover content type mismatch, oversize body, ETag mismatch, and fetch failure.

- [ ] **Step 2: Run tests and verify RED**

```bash
cd apps/api
bun test src/services/ocr/visitor-image-verifier.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement the repository query**

Add a focused projection containing `owner_visitor_id` and `public_url`, and:

```ts
findActiveVisitorOnboardingLicenseById(input: {
  id: string;
  visitorId: string;
})
```

The query must prefilter `tenant_id IS NULL`, `owner_type=visitor`,
`owner_visitor_id`, `scene=tenant_onboarding_license`,
`provider=tencent_cos`, `visibility=private`, `public_url IS NULL`,
`status=active`, and `deleted_at IS NULL`.

- [ ] **Step 4: Implement bounded image verification**

`verifyVisitorOcrImage()` must:

- obtain a 120-second server-side signed URL;
- request at most `maxSizeBytes + 1` bytes with `If-Match` when checksum exists;
- reject non-2xx responses;
- normalize MIME and ETag;
- reject bodies over 5 MiB;
- decode metadata with Sharp;
- accept only decoded JPEG/PNG matching the recorded MIME;
- never include the signed URL in errors.

All failures use `Errors.business()` with existing OCR error codes.

- [ ] **Step 5: Run tests and verify GREEN**

Run the same test and the existing upload tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/platform-file-objects.ts \
  apps/api/src/services/ocr/visitor-image-verifier.ts \
  apps/api/src/services/ocr/visitor-image-verifier.test.ts
git commit -m "feat(ocr): 校验访客营业执照文件"
```

### Task 4: Visitor recognition repository and service

**Files:**
- Create: `apps/api/src/repositories/visitor-ocr-recognitions.ts`
- Create: `apps/api/src/services/ocr/visitor-service.ts`
- Create: `apps/api/src/services/ocr/visitor-service.test.ts`
- Modify: `apps/api/src/services/ocr/index.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions-integrations.ts`

- [ ] **Step 1: Write failing service tests**

Use dependency injection and cover one behavior per test:

- capability returns one business-license entry only when every gate is available;
- disabled/config-missing capability returns `[]`;
- create rejects a missing/cross-visitor file as `OCR_FILE_NOT_FOUND`;
- create rejects WebP/HEIC and oversize before claiming;
- created claim invokes BizLicenseOCR once and stores encrypted success;
- succeeded/failed idempotent replay does not call provider;
- processing replay returns `OCR_RECOGNITION_IN_PROGRESS` with recognition ID;
- same key with another file returns `OCR_IDEMPOTENCY_CONFLICT`;
- claim quota outcomes map to 429 and retry details;
- provider and normalizer failures persist failed before returning a sanitized error;
- GET returns only current visitor records;
- GET maps expired to 410 and cross-visitor to 404;
- visitor AAD decrypts success while failed/processing return empty fields.

- [ ] **Step 2: Run tests and verify RED**

```bash
cd apps/api
bun test src/services/ocr/visitor-service.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement the repository**

Use an untyped service-role Supabase RPC boundary for the new migration until generated
types are refreshed. Expose:

```ts
claim(input): Promise<VisitorOcrClaimResult>
markSucceeded(input)
markFailed(input)
findByIdForVisitor(id, visitorId)
expireProcessingLease(id, visitorId, now)
```

All queries include `scope_type=visitor` and `actor_visitor_id`.

- [ ] **Step 4: Implement the service**

The service sequence must be:

```text
configuration gates
  -> fixed capability
  -> visitor-owned file query
  -> JPEG/PNG recorded policy
  -> real-image verification
  -> HMAC trusted IP
  -> atomic claim
  -> provider
  -> normalizer
  -> visitor-AAD encryption
  -> terminal persistence
```

Create HMAC input:

```ts
createHmac("sha256", resultEncryptionKey)
  .update(`gooes:visitor-ocr-ip:v1:${requestIp}`)
  .digest("hex");
```

When adding `recognition_id` to an error, construct a new safe
`Errors.business(statusCode, safeMessage, code, { recognition_id })`.
Never forward provider details.

- [ ] **Step 5: Run tests and verify GREEN**

Run the visitor service tests plus all existing OCR service tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/visitor-ocr-recognitions.ts \
  apps/api/src/services/ocr/visitor-service.ts \
  apps/api/src/services/ocr/visitor-service.test.ts \
  apps/api/src/services/ocr/index.ts \
  apps/api/src/services/system-settings/legacy/definitions-integrations.ts
git commit -m "feat(ocr): 实现装企入驻访客识别"
```

### Task 5: Visitor OCR HTTP controller

**Files:**
- Create: `apps/api/src/schema/tenant-onboarding-ocr.ts`
- Create: `apps/api/src/controllers/tenant-onboarding-ocr/index.ts`
- Create: `apps/api/src/controllers/tenant-onboarding-ocr/routes.test.ts`

- [ ] **Step 1: Write failing controller tests**

Assert exactly three routes and test:

```ts
GET /tenant-onboarding/ocr/capabilities
POST /tenant-onboarding/ocr/recognitions
GET /tenant-onboarding/ocr/recognitions/:id
```

Cover visitor authentication, strict body validation, visitor ID/IP forwarding,
success response wrapping, 409 details, and `Retry-After` on rate limits.

- [ ] **Step 2: Run tests and verify RED**

```bash
cd apps/api
bun test src/controllers/tenant-onboarding-ocr/routes.test.ts
```

Expected: controller module not found.

- [ ] **Step 3: Implement schema and controller**

The create schema is strict and contains only UUID `file_object_id` and
`idempotency_key`. The controller:

- reads only `visitor_session.visitor_id`;
- resolves IP with `resolveTrustedClientIp`;
- calls the visitor service;
- sets integer `Retry-After` when a rate-limit AppError carries
  `details.retry_after_seconds`;
- wraps success with `ResponseHandler.success`;
- contains no provider, repository, or field-mapping logic.

- [ ] **Step 4: Run tests and verify GREEN**

Run the new controller tests and existing tenant-onboarding route tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/schema/tenant-onboarding-ocr.ts \
  apps/api/src/controllers/tenant-onboarding-ocr/index.ts \
  apps/api/src/controllers/tenant-onboarding-ocr/routes.test.ts
git commit -m "feat(api): 开放入驻访客识别接口"
```

### Task 6: Lifecycle cleanup and generated contracts

**Files:**
- Modify: `apps/api/src/repositories/ocr-recognitions.ts`
- Modify: `apps/api/src/scripts/ocr-result-cleanup.ts`
- Modify: `apps/api/src/scripts/ocr-result-cleanup.test.ts`
- Modify after migration application: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write failing cleanup tests**

Require cleanup to include failed rows and preserve safe audit fields while clearing
ciphertext. Require output rule to mention processing, succeeded, and failed.

- [ ] **Step 2: Run cleanup tests and verify RED**

```bash
cd apps/api
bun test src/scripts/ocr-result-cleanup.test.ts
```

Expected: failure because failed rows are not part of the current rule.

- [ ] **Step 3: Extend cleanup**

Change selection/update status filters to:

```ts
["processing", "succeeded", "failed"]
```

Do not clear summaries, warnings, provider request IDs, timing, or billable audit.

- [ ] **Step 4: Apply migration to dev and regenerate types**

Before applying, run:

```bash
supabase migration list
```

Review that only the new visitor OCR migration is pending. Apply with the repository's
approved Supabase workflow, regenerate:

```bash
supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba \
  > apps/api/src/types/database.ts
```

Then run `supabase migration list` again and require Local/Remote alignment.

- [ ] **Step 5: Run cleanup tests and API typecheck**

```bash
cd apps/api
bun test src/scripts/ocr-result-cleanup.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/ocr-recognitions.ts \
  apps/api/src/scripts/ocr-result-cleanup.ts \
  apps/api/src/scripts/ocr-result-cleanup.test.ts \
  apps/api/src/types/database.ts
git commit -m "feat(ocr): 纳入访客识别生命周期"
```

### Task 7: Full verification, domain package, dev smoke, and handoff

**Files:**
- Create: `docs/miniprogram/2026-07-29-tenant-onboarding-visitor-ocr-handoff.md`
- Create/update generated package: `packages/domain/gooes-domain-1.13.0.tgz`

- [ ] **Step 1: Run static and automated verification**

```bash
git diff --check
cd apps/api
bun test src/services/ocr src/controllers/tenant-onboarding-ocr \
  src/controllers/tenant-onboarding src/controllers/uploads \
  src/scripts/ocr-result-cleanup.test.ts
bun run check
cd ../../packages/domain
bun run build
bun run verify:packed-consumer
```

Require zero failures and no warnings that invalidate the build.

- [ ] **Step 2: Pack the domain package**

Use the existing package script or package manager pack command, verify the tarball
contains the updated OCR declarations, and do not modify Orange.

- [ ] **Step 3: Publish the branch to the dev runtime**

Integrate the verified branch into the dev checkout, restart the API through the existing
`local.gooes.api` launchctl service, and verify port 3000.

- [ ] **Step 4: Run real visitor API smoke**

With a dev visitor session and a脱敏 JPEG/PNG license:

1. direct-init;
2. COS PUT;
3. direct-complete;
4. capabilities;
5. create recognition;
6. same-key replay;
7. GET recognition;
8. cross-visitor file and recognition negative cases;
9. unsupported format and quota negative cases.

Capture sanitized examples without tokens, signed URLs, object keys, or OCR field values.

- [ ] **Step 5: Write the Gooes handoff**

Document final paths, auth, request/response shape, commit/version, dev flag state,
visitor/IP/concurrency limits, TTL, processing lease, stable errors, real sanitized
evidence, Orange files to change, and acceptance checklist. State that Orange remained
untouched.

- [ ] **Step 6: Final completion audit and commit**

Map every checkbox in the approved Orange handoff and Gooes design to code, test,
migration, runtime, or smoke evidence. Resolve every missing item before committing:

```bash
git add docs/miniprogram/2026-07-29-tenant-onboarding-visitor-ocr-handoff.md \
  packages/domain/gooes-domain-1.13.0.tgz
git commit -m "docs(ocr): 交付入驻访客识别联调"
```
