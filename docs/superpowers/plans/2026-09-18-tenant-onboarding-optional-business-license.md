# Tenant Onboarding Optional Business License Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a tenant-onboarding applicant to submit, supplement, and receive platform approval without a business-license upload while preserving all existing checks for supplied private files.

**Architecture:** Normalize missing, `null`, and blank license IDs at the Zod boundary, carry `string | null` through service and repository contracts, and make the database column nullable through one forward migration. The submit and supplement RPCs retain write-boundary file authorization for non-null IDs; platform approval remains unchanged and the Admin renders a deliberate missing-document state.

**Tech Stack:** Bun, TypeScript, Zod 4, Fastify, Supabase/PostgreSQL, Next.js 15, React.

---

### Task 1: Make the applicant request contract and service null-safe

**Files:**
- Modify: `apps/api/src/schema/tenant-onboarding.ts`
- Test: `apps/api/src/schema/tenant-onboarding.test.ts`
- Modify: `apps/api/src/services/tenant-onboarding-applicant-payloads.ts`
- Modify: `apps/api/src/services/tenant-onboarding-applications.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-types.ts`
- Test: `apps/api/src/services/tenant-onboarding-applications.test.ts`

- [ ] **Step 1: Add failing schema tests for all supported input forms**

Add cases that prove submit normalizes absent, `null`, empty, and whitespace-only values to `null`, while preserving UUID validation. Add supplement cases proving omission remains omitted and explicit blank input becomes `null`:

```ts
test.each([
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
  ["whitespace", "   "],
] as const)("accepts a %s business license", (_label, value) => {
  const input = { ...validInput } as Record<string, unknown>;
  if (value === undefined) delete input.business_license_file_id;
  else input.business_license_file_id = value;

  const result = SubmitTenantOnboardingApplicationSchema.safeParse(input);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.business_license_file_id ?? null).toBeNull();
});

test("preserves supplement omission and normalizes an explicit blank license", () => {
  expect(SupplementTenantOnboardingApplicationSchema.parse({
    version: 1,
    company_name: "晴天装饰",
  })).not.toHaveProperty("business_license_file_id");
  expect(SupplementTenantOnboardingApplicationSchema.parse({
    version: 1,
    business_license_file_id: "  ",
  })).toMatchObject({ business_license_file_id: null });
});

test("rejects a non-empty invalid business license ID", () => {
  expect(SubmitTenantOnboardingApplicationSchema.safeParse({
    ...validInput,
    business_license_file_id: "not-a-uuid",
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run the schema test and confirm the new cases fail**

Run:

```bash
bun test apps/api/src/schema/tenant-onboarding.test.ts
```

Expected: the missing/null/blank cases fail because the current field requires a UUID.

- [ ] **Step 3: Implement the nullable license schema without losing PATCH omission semantics**

Add a dedicated schema and use it in `ApplicantEditableFieldsSchema`:

```ts
const OptionalBusinessLicenseFileIdSchema = z.preprocess(
  (value) => {
    if (value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  },
  z.uuid("无效的营业执照文件 ID").nullable().optional(),
);

// ApplicantEditableFieldsSchema
business_license_file_id: OptionalBusinessLicenseFileIdSchema,
```

Do not add a transform that converts `undefined` to `null`; `SupplementTenantOnboardingApplicationSchema` must distinguish omitted from explicit clearing.

- [ ] **Step 4: Add failing service tests for submit, clear, and replace paths**

Extend the application service tests with these assertions:

```ts
test("submits without a license and skips the file lookup", async () => {
  const { business_license_file_id: _license, ...withoutLicense } = submission;
  await (await createService()).submit(withoutLicense, context());
  expect(fileRepository.findById).not.toHaveBeenCalled();
  expect(repository.createApplicationAtomic).toHaveBeenCalledWith(
    expect.objectContaining({
      application: expect.objectContaining({ business_license_file_id: null }),
    }),
  );
});

test("clears a license during supplement without a file lookup", async () => {
  repository.findOwnedById.mockImplementationOnce(async () => ({
    ...application,
    status: "supplement_required",
  }));
  await (await createService()).supplement({
    applicationId: APPLICATION_ID,
    visitorId: VISITOR_ID,
    expectedVersion: 1,
    patch: { business_license_file_id: null },
  });
  expect(fileRepository.findById).not.toHaveBeenCalled();
  expect(repository.supplementAtomic).toHaveBeenCalledWith(
    expect.objectContaining({ patch: { business_license_file_id: null } }),
  );
});
```

Keep the existing invalid/foreign/private-file tests as the regression coverage for supplied UUIDs.

- [ ] **Step 5: Run the service tests and confirm the new cases fail**

Run:

```bash
bun test apps/api/src/services/tenant-onboarding-applications.test.ts
```

Expected: submit fails on the unconditional file assertion or payload type, and the clear test fails until nullable types are implemented.

- [ ] **Step 6: Implement conditional validation and nullable payload construction**

Change submit and payload construction as follows:

```ts
if (input.business_license_file_id) {
  await this.assertPrivateBusinessLicense(
    input.business_license_file_id,
    visitorId,
  );
}
```

```ts
business_license_file_id: input.input.business_license_file_id ?? null,
```

Change `TenantOnboardingApplicationRecord.business_license_file_id` to the persisted shape so create and supplement inputs accept the normalized value:

```ts
business_license_file_id: string | null;
```

The existing supplement guard already validates only truthy IDs. Once the repository record type is nullable, keep the patch builder branch so explicit `null` is written:

```ts
if (patch.business_license_file_id !== undefined) {
  result.business_license_file_id = patch.business_license_file_id;
}
```

- [ ] **Step 7: Run focused tests and commit Task 1**

Run:

```bash
bun test apps/api/src/schema/tenant-onboarding.test.ts \
  apps/api/src/services/tenant-onboarding-applications.test.ts
bun run api:typecheck
```

Expected: all focused tests pass.

Commit:

```bash
git add apps/api/src/schema/tenant-onboarding.ts \
  apps/api/src/schema/tenant-onboarding.test.ts \
  apps/api/src/services/tenant-onboarding-applicant-payloads.ts \
  apps/api/src/services/tenant-onboarding-applications.ts \
  apps/api/src/repositories/tenant-onboarding-types.ts \
  apps/api/src/services/tenant-onboarding-applications.test.ts
git commit -m "feat(onboarding): 允许申请不上传营业执照"
```

### Task 2: Propagate nullable records and distinguish a missing document

**Files:**
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-types.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.ts`
- Test: `apps/api/src/repositories/tenant-onboarding-parsers.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-review-parsers.ts`
- Test: `apps/api/src/repositories/tenant-onboarding-review-parsers.test.ts`
- Modify: `apps/api/src/services/tenant-onboarding-review-support.ts`
- Modify: `apps/api/src/services/tenant-onboarding-review.ts`
- Test: `apps/api/src/services/tenant-onboarding-review.test.ts`
- Test: `apps/api/src/schema/tenant-onboarding.test.ts`

- [ ] **Step 1: Add failing parser and review-service tests**

Add parser cases using the existing fixtures. Both the applicant application parser and platform detail/mutation parsers must accept `null`, and the license-access parser must preserve an existing application whose ID and relation are both null:

```ts
expect(parseTenantOnboardingApplication({
  ...application,
  business_license_file_id: null,
})).toMatchObject({ business_license_file_id: null });

expect(parseNullablePlatformApplication({
  ...detailRecord,
  business_license_file_id: null,
})).toMatchObject({ business_license_file_id: null });

expect(parsePlatformReviewMutation({
  status: "updated",
  application_id: ID,
  application_version: 3,
  application: { ...mutationApplication, business_license_file_id: null },
  idempotent: false,
})).toMatchObject({
  status: "updated",
  application: { business_license_file_id: null },
});

expect(parseNullableLicenseAccess({
  application_id: ID,
  visitor_id: "visitor-1",
  business_license_file_id: null,
  file: null,
})).toMatchObject({ business_license_file_id: null, file: null });
```

Add a review-service test that preserves application existence and returns the new error before URL signing:

```ts
test("reports an uploaded document is absent without signing a URL", async () => {
  repository.findLicenseAccessRecord.mockImplementationOnce(async () => ({
    application_id: APPLICATION_ID,
    visitor_id: "visitor-1",
    business_license_file_id: null,
    file: null,
  }));
  await expect((await createService()).accessLicense(auth(), APPLICATION_ID))
    .rejects.toMatchObject({
      statusCode: 404,
      code: "TENANT_ONBOARDING_DOCUMENT_NOT_UPLOADED",
    });
  expect(resolveSigned).not.toHaveBeenCalled();
});
```

Add `TENANT_ONBOARDING_DOCUMENT_NOT_UPLOADED` to the stable error-code assertion.

- [ ] **Step 2: Run parser and review tests and confirm failure**

Run:

```bash
bun test apps/api/src/repositories/tenant-onboarding-parsers.test.ts \
  apps/api/src/repositories/tenant-onboarding-review-parsers.test.ts \
  apps/api/src/services/tenant-onboarding-review.test.ts \
  apps/api/src/schema/tenant-onboarding.test.ts
```

Expected: nullable fixtures fail parsing or typing and the new error code is absent.

- [ ] **Step 3: Update shared records and parsers**

The application record is already nullable from Task 1. Change the separate license-access record to match:

```ts
business_license_file_id: string | null;
```

Use nullable Zod fields in both application parsers and the license-access parser:

```ts
business_license_file_id: z.uuid().nullable(),
```

The file relation remains nullable. This lets `findLicenseAccessRecord` distinguish an existing application with no document from a missing application.

- [ ] **Step 4: Add the stable missing-document error and service branch**

Add the constant:

```ts
TENANT_ONBOARDING_DOCUMENT_NOT_UPLOADED:
  "TENANT_ONBOARDING_DOCUMENT_NOT_UPLOADED",
```

Add the error factory helper:

```ts
export const documentNotUploadedError = () => Errors.business(
  404,
  "营业执照未上传",
  ErrorCodes.TENANT_ONBOARDING_DOCUMENT_NOT_UPLOADED,
);
```

Use it before evaluating the file relation:

```ts
const record = await this.repository.findLicenseAccessRecord(applicationId);
if (!record) throw applicationNotFoundError();
if (!record.business_license_file_id) throw documentNotUploadedError();
const file = record.file;
```

Keep the existing forbidden-file branch for a non-null ID with a missing or invalid relation.

- [ ] **Step 5: Prove approval does not require a license**

Add a review-service test that calls `approve` with an application fixture containing `business_license_file_id: null`. No production approval code change is expected; this is regression evidence for the agreed business rule:

```ts
test("approves an application without a business license", async () => {
  repository.findApplicationById.mockImplementation(async () => ({
    ...application,
    business_license_file_id: null,
  }));
  const service = await createService();
  const result = await service.approve(auth(), APPLICATION_ID, {
    version: 1,
    attribution_mode: "unassigned",
    review_remark: "人工资料核验通过",
  });
  expect(approvalRepository.approveApplication).toHaveBeenCalledWith(
    expect.objectContaining({ applicationId: APPLICATION_ID }),
  );
  expect(result.approval.status).toBe("approved");
});
```

- [ ] **Step 6: Run focused tests and commit Task 2**

Run the command from Step 2. Expected: all tests pass.

Commit:

```bash
git add apps/api/src/errors/error-codes.ts \
  apps/api/src/repositories/tenant-onboarding-types.ts \
  apps/api/src/repositories/tenant-onboarding-parsers.ts \
  apps/api/src/repositories/tenant-onboarding-parsers.test.ts \
  apps/api/src/repositories/tenant-onboarding-review-parsers.ts \
  apps/api/src/repositories/tenant-onboarding-review-parsers.test.ts \
  apps/api/src/services/tenant-onboarding-review-support.ts \
  apps/api/src/services/tenant-onboarding-review.ts \
  apps/api/src/services/tenant-onboarding-review.test.ts \
  apps/api/src/schema/tenant-onboarding.test.ts
git commit -m "fix(onboarding): 支持无执照审核详情"
```

### Task 3: Add the forward database migration and database contract

**Files:**
- Create: `supabase/migrations/20260918100000_tenant_onboarding_optional_business_license.sql`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/services/tenant-onboarding-migration-contract.test.ts`
- Create: `apps/api/src/services/tenant-onboarding-optional-business-license-sql-contract.test.ts`

- [ ] **Step 1: Add failing migration-contract tests**

Extend the migration contract test to locate exactly one `_tenant_onboarding_optional_business_license.sql` file and assert:

```ts
expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
expect(sql).toContain("SET LOCAL statement_timeout = '1min'");
expect(sql).toMatch(
  /ALTER TABLE public\.tenant_onboarding_applications[\s\S]*?ALTER COLUMN business_license_file_id DROP NOT NULL/,
);
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.submit_tenant_onboarding_application");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.supplement_tenant_onboarding_application");
```

In the new SQL contract test, extract both function bodies and assert the write-boundary behavior:

```ts
expect(submitBody).toContain(
  "IF NULLIF(pg_catalog.btrim(p_application->>'business_license_file_id'), '') IS NOT NULL THEN",
);
expect(submitBody).toContain(
  "NULLIF(pg_catalog.btrim(p_application->>'business_license_file_id'), '')::uuid",
);
expect(supplementBody).toContain("p_patch ? 'business_license_file_id'");
expect(supplementBody).toContain(
  "NULLIF(pg_catalog.btrim(p_patch->>'business_license_file_id'), '') IS NOT NULL",
);
expect(supplementBody).toContain(
  "NULLIF(pg_catalog.btrim(p_patch->>'business_license_file_id'), '')::uuid",
);
for (const body of [submitBody, supplementBody]) {
  expect(body).toContain("TENANT_ONBOARDING_DOCUMENT_FORBIDDEN");
  expect(body).toContain("file.owner_type = 'visitor'");
  expect(body).toContain("file.scene = 'tenant_onboarding_license'");
  expect(body).toContain("file.visibility = 'private'");
}
```

- [ ] **Step 2: Run migration tests and confirm the new migration is absent**

Run:

```bash
bun test apps/api/src/services/tenant-onboarding-migration-contract.test.ts \
  apps/api/src/services/tenant-onboarding-optional-business-license-sql-contract.test.ts
```

Expected: tests fail because the forward migration has not been created.

- [ ] **Step 3: Create the migration with bounded locking and nullable column**

Start the migration with:

```sql
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';

ALTER TABLE public.tenant_onboarding_applications
  ALTER COLUMN business_license_file_id DROP NOT NULL;

COMMENT ON COLUMN public.tenant_onboarding_applications.business_license_file_id IS
  'Optional private business-license file supplied by the tenant onboarding applicant.';
```

Copy the current signatures and full bodies of `submit_tenant_onboarding_application` and `supplement_tenant_onboarding_application` into this migration. In submit, replace the unconditional file lookup with this exact guard and use the same normalized expression in `INSERT`:

```sql
IF NULLIF(
  pg_catalog.btrim(p_application->>'business_license_file_id'),
  ''
) IS NOT NULL THEN
  PERFORM file.id
  FROM public.platform_file_objects AS file
  WHERE file.id = NULLIF(
      pg_catalog.btrim(p_application->>'business_license_file_id'),
      ''
    )::uuid
    AND file.owner_type = 'visitor'
    AND file.owner_visitor_id = p_application->>'visitor_id'
    AND file.scene = 'tenant_onboarding_license'
    AND file.status = 'active'
    AND file.visibility = 'private'
    AND file.deleted_at IS NULL
    AND file.public_url IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_ONBOARDING_DOCUMENT_FORBIDDEN';
  END IF;
END IF;
```

```sql
NULLIF(
  pg_catalog.btrim(p_application->>'business_license_file_id'),
  ''
)::uuid,
```

In supplement, require both key presence and a non-null normalized value before file validation, then preserve PATCH semantics in the update:

```sql
IF p_patch ? 'business_license_file_id'
  AND NULLIF(
    pg_catalog.btrim(p_patch->>'business_license_file_id'),
    ''
  ) IS NOT NULL
THEN
  PERFORM file.id
  FROM public.platform_file_objects AS file
  WHERE file.id = NULLIF(
      pg_catalog.btrim(p_patch->>'business_license_file_id'),
      ''
    )::uuid
    AND file.owner_type = 'visitor'
    AND file.owner_visitor_id = p_visitor_id
    AND file.scene = 'tenant_onboarding_license'
    AND file.status = 'active'
    AND file.visibility = 'private'
    AND file.deleted_at IS NULL
    AND file.public_url IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_ONBOARDING_DOCUMENT_FORBIDDEN';
  END IF;
END IF;
```

```sql
business_license_file_id = CASE
  WHEN p_patch ? 'business_license_file_id' THEN NULLIF(
    pg_catalog.btrim(p_patch->>'business_license_file_id'),
    ''
  )::uuid
  ELSE application.business_license_file_id
END,
```

Finish with explicit service-role-only grants for both unchanged signatures and `COMMIT;`:

```sql
REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_application(
  jsonb, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_onboarding_application(
  jsonb, uuid, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.supplement_tenant_onboarding_application(
  uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text,
  timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplement_tenant_onboarding_application(
  uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text,
  timestamptz, timestamptz, timestamptz
) TO service_role;

COMMIT;
```

- [ ] **Step 4: Update generated database types to match the migration**

Change only the `tenant_onboarding_applications` table contract:

```ts
// Row
business_license_file_id: string | null;
// Insert
business_license_file_id?: string | null;
// Update
business_license_file_id?: string | null;
```

Do not alter the relationship metadata or foreign-key name.

- [ ] **Step 5: Run SQL contracts and API typecheck**

Run:

```bash
bun test apps/api/src/services/tenant-onboarding-migration-contract.test.ts \
  apps/api/src/services/tenant-onboarding-optional-business-license-sql-contract.test.ts
bun run api:typecheck
```

Expected: all SQL contracts pass and TypeScript reports no errors.

- [ ] **Step 6: Commit Task 3**

```bash
git add supabase/migrations/20260918100000_tenant_onboarding_optional_business_license.sql \
  apps/api/src/types/database.ts \
  apps/api/src/services/tenant-onboarding-migration-contract.test.ts \
  apps/api/src/services/tenant-onboarding-optional-business-license-sql-contract.test.ts
git commit -m "feat(db): 支持无营业执照入驻申请"
```

### Task 4: Render the missing-license state in the Admin

**Files:**
- Modify: `apps/admin/components/tenant-onboarding/tenant-onboarding-types.ts`
- Modify: `apps/admin/components/tenant-onboarding/tenant-onboarding-detail-dialog.tsx`
- Test: `apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts`

- [ ] **Step 1: Add a failing Admin source-contract test**

Read the detail-dialog and type sources, then assert the nullable DTO and guarded action:

```ts
expect(typesSource).toContain("business_license_file_id: string | null");
expect(detailSource).toContain('detail.business_license_file_id ? (');
expect(detailSource).toContain('营业执照未上传');
expect(detailSource).toContain('detail.business_license_file_id ? "已上传" : "未上传"');
```

- [ ] **Step 2: Run the Admin test and confirm failure**

Run:

```bash
bun test apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts
```

Expected: the DTO is still non-null and the detail dialog always renders the fetch button.

- [ ] **Step 3: Implement the deliberate missing-document state**

Change the detail type:

```ts
business_license_file_id: string | null;
```

Render the fetch button only when a file exists; otherwise render a muted status message:

```tsx
{detail.business_license_file_id ? (
  <Button
    type="button"
    variant="outline"
    disabled={licensePending}
    onClick={requestLicense}
  >
    {licensePending
      ? <Loader2 className="animate-spin" data-icon="inline-start" />
      : <FileText data-icon="inline-start" />}
    获取营业执照
  </Button>
) : (
  <span className="text-sm text-muted-foreground">营业执照未上传</span>
)}
```

Add a detail row so the stored state is visible alongside other application fields:

```ts
["营业执照", detail.business_license_file_id ? "已上传" : "未上传"],
```

The existing `license` state remains `null` when there is no file, so no signed link is rendered.

- [ ] **Step 4: Run Admin checks and commit Task 4**

Run:

```bash
bun test apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts
bun run admin:check
```

Expected: test and Admin checks pass.

Commit:

```bash
git add apps/admin/components/tenant-onboarding/tenant-onboarding-types.ts \
  apps/admin/components/tenant-onboarding/tenant-onboarding-detail-dialog.tsx \
  apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts
git commit -m "fix(admin): 展示入驻营业执照缺失状态"
```

### Task 5: Verify the complete change and prepare integration

**Files:**
- Review: all files changed by Tasks 1–4

- [ ] **Step 1: Run all focused onboarding tests**

```bash
bun test \
  apps/api/src/schema/tenant-onboarding.test.ts \
  apps/api/src/services/tenant-onboarding-applications.test.ts \
  apps/api/src/repositories/tenant-onboarding-parsers.test.ts \
  apps/api/src/repositories/tenant-onboarding-review-parsers.test.ts \
  apps/api/src/services/tenant-onboarding-review.test.ts \
  apps/api/src/services/tenant-onboarding-migration-contract.test.ts \
  apps/api/src/services/tenant-onboarding-optional-business-license-sql-contract.test.ts \
  apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run package-level static verification and builds**

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
bun run admin:check
bun run admin:build
```

Expected: every command exits with status 0.

- [ ] **Step 3: Audit migration state before applying anything remotely**

```bash
supabase migration list
```

Record whether `20260918100000` is local-only or already remote. Do not run manual DDL/DML. If the migration is applied later through the normal deployment pipeline, run `supabase migration list` again and require Local/Remote alignment.

- [ ] **Step 4: Review scope and repository boundaries**

```bash
git diff --check
git status --short
git diff --stat main...
git diff main... -- apps/api apps/admin supabase/migrations docs/superpowers
```

Expected: no changes under `/Users/leefo/Public/work/orange`, no unrelated refactor, no placeholder UUID, and no secret or signed URL in tests or docs.

- [ ] **Step 5: Perform the final commit if verification produced tracked updates**

```bash
git add apps/api apps/admin supabase/migrations
git commit -m "test(onboarding): 验证营业执照选填流程"
```

Skip this commit when the worktree is already clean. Then use the repository's branch-finishing workflow to review commits and integrate only after all checks pass.
