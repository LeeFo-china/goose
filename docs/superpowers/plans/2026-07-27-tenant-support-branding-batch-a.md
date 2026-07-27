# Tenant Support Branding Batch A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete backend Batch A contract for platform/tenant support branding, manually managed tenant entitlements, trusted brand-logo files, and effective-brand fallback resolution.

**Architecture:** Keep draft and published branding snapshots in one scoped `brand_profiles` row, keep current entitlement state and append-only events in separate tables, and execute entitlement actions through service-role-only PostgreSQL RPCs so state, event, and platform audit writes are atomic. Controllers only parse/auth/respond, services enforce permissions and domain rules, repositories own Supabase/RPC access, and the public resolver always computes effective state from the current tenant, entitlement, published profile, and file record.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations and RPCs, `@gooes/domain`, Tencent COS direct upload.

---

## File map

### Create

- `supabase/migrations/20260727120000_create_tenant_support_branding_batch_a.sql`
  - Tables, constraints, indexes, RLS, permissions, role grants, and atomic RPCs.
- `apps/api/src/schema/branding.ts`
  - Strict request/query/params schemas.
- `apps/api/src/schema/branding.test.ts`
  - Schema contract tests.
- `apps/api/src/repositories/branding.ts`
  - Brand profile, tenant, file, draft, publish, and effective-read queries.
- `apps/api/src/repositories/tenant-entitlements.ts`
  - Paginated reads and entitlement action/expiry RPC calls.
- `apps/api/src/services/branding-contracts.ts`
  - Stable types, serialization, name normalization, support-text creation.
- `apps/api/src/services/branding-file-policy.ts`
  - Trusted `brand_logo` record validation.
- `apps/api/src/services/brand-profiles.ts`
  - Platform/tenant draft and publish orchestration.
- `apps/api/src/services/effective-branding.ts`
  - Fallback resolver and request tenant-context resolution.
- `apps/api/src/services/tenant-entitlements.ts`
  - Entitlement validity and action orchestration.
- `apps/api/src/services/branding-image-metadata.ts`
  - Actual JPEG/PNG/WebP magic-byte and dimension parsing.
- `apps/api/src/controllers/branding/index.ts`
  - All Batch A branding and entitlement routes.
- `apps/api/src/controllers/branding/routes.test.ts`
  - Exact route registration contract.
- `apps/api/src/controllers/uploads/brand-logo-upload-access.ts`
  - Platform/tenant upload authorization and actor scope.
- `apps/api/src/services/branding-migration-contract.test.ts`
  - SQL constraints, security, atomicity, and billing-isolation checks.
- `apps/api/src/services/branding-contracts.test.ts`
  - Pure branding and entitlement behavior.
- `apps/api/src/services/branding-file-policy.test.ts`
  - File ownership and integrity behavior.
- `apps/api/src/services/branding-image-metadata.test.ts`
  - Binary format and image-boundary tests.
- `apps/api/src/services/effective-branding.test.ts`
  - Effective-brand fallback matrix.
- `apps/api/src/services/brand-profiles.test.ts`
  - Draft/publish/permission/version tests.
- `apps/api/src/services/tenant-entitlements.test.ts`
  - State-machine, audit command, and natural-year tests.
- `scripts/verify-branding-tenant-isolation.ts`
  - Authenticated dev tenant-isolation smoke.
- `docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md`
  - API schemas, examples, test users, smoke checklist, deployment evidence.

### Modify

- `packages/domain/src/permission.ts`
  - Four Batch A permission constants and labels.
- `packages/domain/src/permission.test.ts`
  - Permission catalog assertions.
- `apps/api/src/errors/error-codes.ts`
  - Stable branding/entitlement errors.
- `apps/api/src/errors/error-codes.test.ts`
  - Error-code assertions.
- `apps/api/src/controllers/uploads/index.ts`
  - Register scene and invoke scoped access.
- `apps/api/src/controllers/uploads/direct-upload-file-policy.ts`
  - Brand-specific declaration policy.
- `apps/api/src/controllers/uploads/index.test.ts`
  - Scene declaration and object-prefix coverage.
- `apps/api/src/services/files/platform-file-storage/legacy/shared.ts`
  - Add `brand_logo` scene and image dimensions to registration input.
- `apps/api/src/services/files/platform-file-storage/legacy/paths.ts`
  - Exact platform/tenant brand-logo paths without `unassigned`.
- `apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts`
  - Fetch and validate the real brand object before file registration.
- `apps/api/src/repositories/platform-file-objects.ts`
  - Scope-safe full branding-file lookup and unreferenced metadata mutation.
- `apps/api/src/plugins/auth/legacy/routes.ts`
  - Mark only effective branding and controlled default-logo asset public.
- `apps/api/src/plugins/auth/legacy/routes.test.ts`
  - Public/protected route matrix.
- `apps/api/src/routes/index.ts`
  - Register `BrandingController`.

## Task 1: Freeze domain permissions and error codes

**Files:**

- Modify: `packages/domain/src/permission.test.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `apps/api/src/errors/error-codes.test.ts`
- Modify: `apps/api/src/errors/error-codes.ts`

- [ ] **Step 1: Write failing permission and error-code tests**

Add a domain test that asserts this exact catalog:

```ts
const expected = {
  'platform.branding.manage': {
    label: '管理平台技术支持品牌',
    module: 'platform_branding',
  },
  'platform.tenant_entitlement.manage': {
    label: '管理租户增值权益',
    module: 'platform_entitlement',
  },
  'brand.settings.read': {
    label: '查看品牌技术支持设置',
    module: 'branding',
  },
  'brand.settings.update': {
    label: '编辑品牌技术支持设置',
    module: 'branding',
  },
} as const;
```

Add API error-code assertions for:

```ts
[
  'BRANDING_ENTITLEMENT_REQUIRED',
  'BRANDING_ENTITLEMENT_SUSPENDED',
  'BRANDING_ENTITLEMENT_EXPIRED',
  'BRANDING_ENTITLEMENT_REVOKED',
  'BRANDING_PROFILE_VERSION_CONFLICT',
  'BRANDING_PROFILE_INCOMPLETE',
  'BRANDING_LOGO_FILE_NOT_FOUND',
  'BRANDING_LOGO_FILE_INVALID',
  'TENANT_ENTITLEMENT_NOT_FOUND',
  'TENANT_ENTITLEMENT_VERSION_CONFLICT',
  'TENANT_ENTITLEMENT_STATE_CONFLICT',
]
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/domain/src/permission.test.ts \
  apps/api/src/errors/error-codes.test.ts
```

Expected: failures because the new permission and error keys do not exist.

- [ ] **Step 3: Implement the constants**

Add only the four Batch A permissions. Do not add addon product, purchase, order,
or refund permissions.

- [ ] **Step 4: Run GREEN**

Run the same command and expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/permission.ts \
  packages/domain/src/permission.test.ts \
  apps/api/src/errors/error-codes.ts \
  apps/api/src/errors/error-codes.test.ts
git commit -m "feat(branding): 增加品牌与权益权限"
```

## Task 2: Define strict API schemas and pure contracts

**Files:**

- Create: `apps/api/src/schema/branding.test.ts`
- Create: `apps/api/src/schema/branding.ts`
- Create: `apps/api/src/services/branding-contracts.test.ts`
- Create: `apps/api/src/services/branding-contracts.ts`

- [ ] **Step 1: Write failing schema tests**

Cover these exact accepted payloads:

```ts
BrandingDraftSchema.parse({
  display_name: '晴天装饰',
  logo_file_id: '00000000-0000-4000-8000-000000000010',
  version: 0,
});
BrandingPublishSchema.parse({ version: 1 });
EntitlementGrantSchema.parse({
  term_years: 1,
  reason: '平台赠送一年品牌权益',
});
EntitlementSuspendSchema.parse({ version: 1, reason: '内容待核验' });
EntitlementResumeSchema.parse({ version: 2, reason: '内容已核验' });
EntitlementRevokeSchema.parse({
  version: 3,
  reason: '租户主动终止服务',
  confirm: true,
});
```

Reject:

- unknown `tenant_id`
- unknown `logo_url`
- empty/control-only/punctuation-only display names
- `term_years <= 0` or `> 10`
- empty/over-500-character reason
- revoke without literal `confirm: true`
- effective-brand query with any key
- page below 1 or pageSize above 100

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/schema/branding.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement strict Zod schemas**

Export:

```ts
export const BrandingEmptyQuerySchema = z.object({}).strict();
export const BrandingDraftSchema = z.object({
  display_name: DisplayNameSchema,
  logo_file_id: z.uuid('无效的 Logo 文件 ID'),
  version: z.number().int().min(0),
}).strict();
export const BrandingPublishSchema = z.object({
  version: z.number().int().positive(),
}).strict();
```

Also export UUID params, pagination, and the four action schemas plus inferred
input types.

- [ ] **Step 4: Write and run RED pure-contract tests**

Test:

- `buildSupportText('晴天装饰') === '晴天装饰提供技术支持'`
- active requires status/time/active tenant
- every suspended/revoked/expired row is ineffective
- `serializeEntitlement` exposes `code`, not internal `entitlement_code`
- profile serialization reports `has_unpublished_changes`

Run:

```bash
bun test apps/api/src/services/branding-contracts.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 5: Implement and run GREEN**

Implement exported constants:

```ts
export const CUSTOM_SUPPORT_BRANDING = 'custom_support_branding' as const;
export const PLATFORM_FALLBACK_DISPLAY_NAME = '字节跳动';
```

Run both Task 2 test files and expect all tests to pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/branding.ts \
  apps/api/src/schema/branding.test.ts \
  apps/api/src/services/branding-contracts.ts \
  apps/api/src/services/branding-contracts.test.ts
git commit -m "feat(branding): 定义品牌与权益接口契约"
```

## Task 3: Create the migration and atomic command contracts

**Files:**

- Create: `apps/api/src/services/branding-migration-contract.test.ts`
- Create: `supabase/migrations/20260727120000_create_tenant_support_branding_batch_a.sql`

- [ ] **Step 1: Write a failing migration contract test**

Read the migration as text and assert:

- all three tables exist
- platform and tenant partial unique indexes exist
- `expires_at > starts_at`
- RLS is enabled
- all four permissions are inserted
- platform permissions go only to tenant-null `platform_admin`
- tenant permissions go only to tenant-bound `system_admin`
- RPCs use `FOR UPDATE`
- entitlement command inserts both `tenant_entitlement_events` and
  `platform_audit_logs`
- resume never updates `expires_at`
- grant uses `make_interval(years => p_term_years)`
- public/anon/authenticated EXECUTE is revoked
- service_role EXECUTE is granted
- SQL does not contain `tenant_credit_orders`, `tenant_credit_accounts`, or
  `tenant_credit_ledger`

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/services/branding-migration-contract.test.ts
```

Expected: ENOENT for the migration.

- [ ] **Step 3: Implement schema and indexes**

The migration must use `BEGIN;`/`COMMIT;`, include a rollback comment, and create:

```sql
public.brand_profiles
public.tenant_entitlements
public.tenant_entitlement_events
```

Add explicit check constraints, foreign keys with safe delete behavior, focused
read indexes, updated-at triggers, RLS, comments, and permission seeding.

- [ ] **Step 4: Implement service-role-only RPCs**

Create:

```sql
public.save_brand_profile_draft(...)
public.publish_brand_profile(...)
public.apply_tenant_entitlement_action(...)
public.expire_tenant_entitlement_if_due(...)
```

Each function must set `search_path = public, pg_temp`, validate every input,
lock rows, return a single row/JSON result, and revoke public execution before
granting service-role execution.

- [ ] **Step 5: Run GREEN and SQL hygiene checks**

```bash
bun test apps/api/src/services/branding-migration-contract.test.ts
git diff --check
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260727120000_create_tenant_support_branding_batch_a.sql \
  apps/api/src/services/branding-migration-contract.test.ts
git commit -m "feat(branding): 建立品牌与租户权益模型"
```

## Task 4: Implement repositories with explicit tenant scopes

**Files:**

- Create: `apps/api/src/repositories/branding.ts`
- Create: `apps/api/src/repositories/tenant-entitlements.ts`
- Create: `apps/api/src/repositories/branding.test.ts`
- Create: `apps/api/src/repositories/tenant-entitlements.test.ts`
- Modify: `apps/api/src/repositories/platform-file-objects.ts`
- Modify: `apps/api/src/repositories/platform-file-objects.test.ts`

- [ ] **Step 1: Write failing repository tests**

Use injected Supabase-like clients and assert:

- tenant brand queries always call `.eq('tenant_id', tenantId)`
- platform brand queries call `.is('tenant_id', null)`
- branding file lookup selects full width/height/visibility/status columns
- platform lookup also requires `.is('tenant_id', null)`
- tenant entitlement list uses `.range(from, to)` and exact count
- action repository calls the exact RPC with actor, reason, expected version,
  and term years
- an RPC error maps through `Errors.dbError`

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/repositories/branding.test.ts \
  apps/api/src/repositories/tenant-entitlements.test.ts \
  apps/api/src/repositories/platform-file-objects.test.ts
```

- [ ] **Step 3: Implement focused repositories**

Expose repository methods only for the service needs:

```ts
findPlatformProfile()
findTenantProfile(tenantId)
findTenant(tenantId)
findBrandingFileForPlatform(fileId)
findBrandingFileForTenant(fileId, tenantId)
saveDraft(input)
publish(input)
listByTenant(input)
findByTenantAndCode(tenantId, entitlementCode)
applyAction(input)
expireIfDue(input)
```

Do not add generic cross-tenant find methods.

- [ ] **Step 4: Run GREEN**

Run the Task 4 tests and expect pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/branding.ts \
  apps/api/src/repositories/branding.test.ts \
  apps/api/src/repositories/tenant-entitlements.ts \
  apps/api/src/repositories/tenant-entitlements.test.ts \
  apps/api/src/repositories/platform-file-objects.ts \
  apps/api/src/repositories/platform-file-objects.test.ts
git commit -m "feat(branding): 增加隔离品牌与权益仓储"
```

## Task 5: Validate real brand-logo image objects

**Files:**

- Create: `apps/api/src/services/branding-image-metadata.test.ts`
- Create: `apps/api/src/services/branding-image-metadata.ts`
- Create: `apps/api/src/services/branding-file-policy.test.ts`
- Create: `apps/api/src/services/branding-file-policy.ts`

- [ ] **Step 1: Write failing binary parser tests**

Use minimal in-memory byte fixtures for:

- PNG IHDR dimensions
- JPEG SOF0/SOF2 dimensions
- WebP VP8, VP8L, and VP8X dimensions
- unsupported magic bytes
- truncated/corrupt images

Assert the parser returns:

```ts
{ mimeType: 'image/png', width: 256, height: 256 }
```

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/services/branding-image-metadata.test.ts
```

- [ ] **Step 3: Implement the bounded parser**

Export:

```ts
export function parseBrandLogoImageMetadata(
  bytes: Uint8Array,
): BrandLogoImageMetadata
```

Do not add a dependency. Parse only the three approved formats and throw
`BRANDING_LOGO_FILE_INVALID` for malformed input.

- [ ] **Step 4: Write failing file-policy tests**

Cover:

- valid platform file
- valid tenant-owned file
- wrong tenant returns `BRANDING_LOGO_FILE_NOT_FOUND`
- wrong scene/status/visibility/MIME/size/dimension/ratio returns
  `BRANDING_LOGO_FILE_INVALID`

- [ ] **Step 5: Implement and run GREEN**

Use one policy:

```ts
export const BRAND_LOGO_POLICY = {
  mimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  maxSizeBytes: 2 * 1024 * 1024,
  minWidth: 128,
  minHeight: 128,
  minAspectRatio: 0.8,
  maxAspectRatio: 1.25,
} as const;
```

Run both test files and expect pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/branding-image-metadata.ts \
  apps/api/src/services/branding-image-metadata.test.ts \
  apps/api/src/services/branding-file-policy.ts \
  apps/api/src/services/branding-file-policy.test.ts
git commit -m "feat(branding): 校验品牌Logo真实文件"
```

## Task 6: Add the scoped `brand_logo` upload scene

**Files:**

- Create: `apps/api/src/controllers/uploads/brand-logo-upload-access.ts`
- Create: `apps/api/src/controllers/uploads/brand-logo-upload-access.test.ts`
- Modify: `apps/api/src/controllers/uploads/index.ts`
- Modify: `apps/api/src/controllers/uploads/direct-upload-file-policy.ts`
- Modify: `apps/api/src/controllers/uploads/index.test.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/shared.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/paths.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts`

- [ ] **Step 1: Write failing scene/access/path tests**

Assert:

- platform admin + permission resolves `{ tenantId: null, employeeId }`
- tenant employee + update permission + active entitlement resolves current tenant
- customer/visitor/no permission/no entitlement is forbidden
- platform key starts `public/brand-logo/`
- tenant key starts `tenants/{tenantId}/brand-logo/`
- no brand key contains `/unassigned/`
- HEIC/HEIF and files over 2MB are rejected

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/controllers/uploads/brand-logo-upload-access.test.ts \
  apps/api/src/controllers/uploads/index.test.ts
```

- [ ] **Step 3: Implement scene declaration and authorization**

Add `brand_logo` to both upload-scene unions. Before the generic actor resolver,
call `assertBrandLogoUploadSceneAccess`. The helper must derive scope from the
verified auth context and never inspect body/query tenant IDs.

- [ ] **Step 4: Implement complete-time object verification**

For `brand_logo`, force COS head verification, download at most `2MB + 1`, parse
actual image metadata, compare actual MIME with declaration, and pass actual
width/height/canonical MIME into file-object creation.

- [ ] **Step 5: Run GREEN and upload regressions**

```bash
bun test apps/api/src/controllers/uploads \
  apps/api/src/services/branding-image-metadata.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/controllers/uploads \
  apps/api/src/services/files/platform-file-storage/legacy/shared.ts \
  apps/api/src/services/files/platform-file-storage/legacy/paths.ts \
  apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts
git commit -m "feat(uploads): 增加品牌Logo上传场景"
```

## Task 7: Implement entitlement services and state transitions

**Files:**

- Create: `apps/api/src/services/tenant-entitlements.test.ts`
- Create: `apps/api/src/services/tenant-entitlements.ts`

- [ ] **Step 1: Write failing service tests**

Inject repository and access-policy ports. Cover:

- platform permission required
- paginated list validates tenant existence
- default grant passes `termYears: 1`
- active grant maps to state conflict
- suspend/resume/revoke pass expected version and actor
- resume result preserves the previous `expires_at`
- expired resume returns `BRANDING_ENTITLEMENT_EXPIRED`
- tenant customization errors distinguish missing/suspended/expired/revoked
- expiry reconciliation failure never makes an expired entitlement effective

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/services/tenant-entitlements.test.ts
```

- [ ] **Step 3: Implement the service**

Expose:

```ts
listPlatform(authContext, tenantId, query)
grant(authContext, tenantId, input)
suspend(authContext, tenantId, input)
resume(authContext, tenantId, input)
revoke(authContext, tenantId, input)
getTenantSummary(tenantId, now)
assertCanCustomize(authContext, now)
```

The service must use `accessPolicyService.assertTenantContext` for tenant
operations and `platform.tenant_entitlement.manage` for platform actions.

- [ ] **Step 4: Run GREEN**

Run the service test and expect pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/tenant-entitlements.ts \
  apps/api/src/services/tenant-entitlements.test.ts
git commit -m "feat(branding): 实现租户品牌权益状态机"
```

## Task 8: Implement draft/publish brand-profile services

**Files:**

- Create: `apps/api/src/services/brand-profiles.test.ts`
- Create: `apps/api/src/services/brand-profiles.ts`

- [ ] **Step 1: Write failing service tests**

Cover:

- platform manage permission
- tenant read/update permission split
- tenant ID only from AuthContext
- tenant update/publish requires active entitlement
- file is re-read and validated before each save/publish
- first save uses version zero
- stale version maps to `BRANDING_PROFILE_VERSION_CONFLICT`
- draft save does not change published snapshot
- publish returns `has_unpublished_changes: false`
- tenant GET without entitlement returns profile plus `can_customize: false`
- null profile and null entitlement stay explicit

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/services/brand-profiles.test.ts
```

- [ ] **Step 3: Implement service orchestration**

Expose:

```ts
getPlatform(authContext)
savePlatformDraft(authContext, input)
publishPlatform(authContext, input)
getTenant(authContext)
saveTenantDraft(authContext, input)
publishTenant(authContext, input)
```

Do not accept tenant ID in tenant methods.

- [ ] **Step 4: Run GREEN**

Run the service test and expect pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/brand-profiles.ts \
  apps/api/src/services/brand-profiles.test.ts
git commit -m "feat(branding): 实现品牌草稿与发布"
```

## Task 9: Implement effective branding resolution

**Files:**

- Create: `apps/api/src/services/effective-branding.test.ts`
- Create: `apps/api/src/services/effective-branding.ts`

- [ ] **Step 1: Write the fallback matrix as failing tests**

Cover:

- no token
- visitor token
- employee/customer token without tenant
- missing tenant
- inactive tenant
- missing/suspended/expired/revoked entitlement
- missing/unpublished/disabled/incomplete tenant profile
- missing/inactive/private/wrong-scene tenant Logo
- valid tenant brand
- invalid platform profile/file falls back to controlled server default

Assert the response never contains internal reason, actor, order, or source ID.

- [ ] **Step 2: Run RED**

```bash
bun test apps/api/src/services/effective-branding.test.ts
```

- [ ] **Step 3: Implement the resolver**

Expose:

```ts
resolveForRequest(user: JwtPayload | undefined, now?: Date)
resolveForTenant(tenantId: string | null, now?: Date)
resolvePlatform()
```

Only trust verified JWT `tenant_id` or server-loaded AuthContext. Always evaluate
time boundaries even if expiry reconciliation fails.

- [ ] **Step 4: Run GREEN**

Run the resolver test and expect pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/effective-branding.ts \
  apps/api/src/services/effective-branding.test.ts
git commit -m "feat(branding): 解析租户有效技术支持品牌"
```

## Task 10: Register all Batch A HTTP routes

**Files:**

- Create: `apps/api/src/controllers/branding/routes.test.ts`
- Create: `apps/api/src/controllers/branding/index.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`

- [ ] **Step 1: Write failing route tests**

Assert the controller registers exactly:

```text
GET   /branding/effective
GET   /platform/branding
PATCH /platform/branding
POST  /platform/branding/publish
GET   /platform/tenants/:id/entitlements
POST  /platform/tenants/:id/entitlements/custom_support_branding/grant
POST  /platform/tenants/:id/entitlements/custom_support_branding/suspend
POST  /platform/tenants/:id/entitlements/custom_support_branding/resume
POST  /platform/tenants/:id/entitlements/custom_support_branding/revoke
GET   /tenant/branding
PATCH /tenant/branding
POST  /tenant/branding/publish
```

Auth tests must assert only GET/HEAD `/branding/effective` is public; all
platform/tenant mutations and reads stay protected.

- [ ] **Step 2: Run RED**

```bash
cd apps/api
bun test src/controllers/branding
bun test src/plugins/auth/legacy/routes.test.ts
```

- [ ] **Step 3: Implement the controller**

Use `TenantBaseController`, strict schemas, `ResponseHandler.success`, and
`Cache-Control: private, no-store` for effective branding. The controller must
not query Supabase.

- [ ] **Step 4: Register and run GREEN**

Import/register `BrandingController` in `apps/api/src/routes/index.ts`. Run the
Task 10 tests and expect pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/controllers/branding \
  apps/api/src/routes/index.ts \
  apps/api/src/plugins/auth/legacy/routes.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts
git commit -m "feat(api): 暴露品牌与权益批次A接口"
```

## Task 11: Add tenant-isolation smoke and handoff documentation

**Files:**

- Create: `scripts/verify-branding-tenant-isolation.ts`
- Create: `scripts/verify-branding-tenant-isolation-support.ts`
- Create: `scripts/verify-branding-tenant-isolation-contracts.ts`
- Create: `scripts/verify-branding-tenant-isolation.test.ts`
- Create: `scripts/verify-branding-tenant-isolation-contracts.test.ts`
- Create: `scripts/verify-branding-tenant-isolation-runner.test.ts`
- Create: `docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md`

- [ ] **Step 1: Write smoke result parser tests**

Create `scripts/verify-branding-tenant-isolation.test.ts` first. Test safe
redaction, expected status/code checks, and failure on a response containing a
foreign tenant ID.

- [ ] **Step 2: Run RED**

```bash
bun test scripts/verify-branding-tenant-isolation.test.ts \
  scripts/verify-branding-tenant-isolation-contracts.test.ts \
  scripts/verify-branding-tenant-isolation-runner.test.ts
```

- [ ] **Step 3: Implement the authenticated smoke**

The script accepts only environment variables:

```text
BRANDING_API_BASE_URL
BRANDING_PLATFORM_TOKEN
BRANDING_TENANT_WITH_ENTITLEMENT_TOKEN
BRANDING_TENANT_WITHOUT_ENTITLEMENT_TOKEN
BRANDING_FOREIGN_FILE_ID
```

It must never print tokens, response bodies, or tenant IDs. Resolve both tenant
fixtures through authenticated `GET /admin/auth/me` responses (not token
claims), require distinct canonical `data.tenant.id` values, then verify
effective brand, tenant read, no-entitlement mutation rejection, foreign-file
rejection, and the platform entitlement list target.

- [ ] **Step 4: Write the handoff**

Document every method/path/auth/body/data/error shape, upload sequence, action
state machine, compatibility boundary, and Orange smoke checklist. Explicitly
state:

```text
Batch A has no addon product/order/payment/refund endpoint.
```

- [ ] **Step 5: Run GREEN and commit**

```bash
bun test scripts/verify-branding-tenant-isolation.test.ts \
  scripts/verify-branding-tenant-isolation-contracts.test.ts \
  scripts/verify-branding-tenant-isolation-runner.test.ts
git add scripts/verify-branding-tenant-isolation.ts \
  scripts/verify-branding-tenant-isolation-support.ts \
  scripts/verify-branding-tenant-isolation-contracts.ts \
  scripts/verify-branding-tenant-isolation.test.ts \
  scripts/verify-branding-tenant-isolation-contracts.test.ts \
  scripts/verify-branding-tenant-isolation-runner.test.ts \
  docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md
git commit -m "docs(branding): 增加批次A联调契约"
```

## Task 12: Verify locally, apply dev migration, create fixtures, deploy, and smoke

**Files:**

- Modify only if verification exposes a tested defect in Batch A files.
- Update deployment evidence in:
  `docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md`

- [ ] **Step 1: Run focused tests**

```bash
cd apps/api
bun test src/controllers/branding
bun test ../../packages/domain/src/permission.test.ts \
  src/schema/branding.test.ts \
  src/repositories/branding.test.ts \
  src/repositories/tenant-entitlements.test.ts \
  src/services/branding-migration-contract.test.ts \
  src/services/branding-contracts.test.ts \
  src/services/branding-image-metadata.test.ts \
  src/services/branding-file-policy.test.ts \
  src/services/tenant-entitlements.test.ts \
  src/services/brand-profiles.test.ts \
  src/services/effective-branding.test.ts \
  src/controllers/uploads \
  src/plugins/auth/legacy/routes.test.ts \
  ../../scripts/verify-branding-tenant-isolation*.test.ts
```

Expected: all pass with no warnings.

- [ ] **Step 2: Run static verification**

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
bun run check:permission-boundaries
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Run repository tests**

```bash
bun run test
```

Record the two known baseline failures separately. No new Batch A test may fail.

- [ ] **Step 4: Review migration and apply only to dev**

Use the repository-approved Supabase workflow with the dev credentials from
`/Users/leefo/Public/work/gooes/.env`. Before apply, list pending migrations and
confirm only the Batch A migration is newly introduced by this branch. After
apply, verify local/remote migration alignment.

- [ ] **Step 5: Create dev fixtures**

Create or select:

- one active tenant system_admin with active branding entitlement
- one active tenant system_admin without branding entitlement
- one platform admin with both platform permissions

Upload/publish a real platform brand logo and one tenant brand logo through the
new upload/API flow. Keep credentials out of Git.

- [ ] **Step 6: Run live tenant-isolation smoke**

```bash
bun --env-file=.env scripts/verify-branding-tenant-isolation.ts
```

Expected: all checks pass and output contains only tenant labels, status codes,
stable error codes, request IDs, and redacted token markers.

- [ ] **Step 7: Commit final evidence**

```bash
git add docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md
git commit -m "docs(branding): 记录批次A联调结果"
```

- [ ] **Step 8: Request code review**

Run the requesting-code-review workflow against the complete branch. Resolve
every Critical/Important finding with a failing regression test first.

- [ ] **Step 9: Deploy API dev and verify**

Use the existing dev release workflow for API only. Verify deployment health,
commit SHA, migration status, and every Batch A endpoint at the deployed base
URL.

- [ ] **Step 10: Final handoff**

Report:

- migration file
- API schema and response examples
- permission initialization
- focused tests, static checks, and tenant-isolation results
- dev integration account identifiers or short-lived tokens
- deployed API base URL
- final commit SHA
- exact message for the Orange mini-program team

Do not push/merge beyond the dev deployment workflow unless separately requested.
