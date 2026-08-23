# Simplify Tenant Private Supplier Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant private supplier management understandable and low-effort: tenants create a private supplier by name, add products by category and brand, and do not handle platform onboarding, qualification, mapping, or manual codes.

**Architecture:** Keep the current supplier master, tenant relationship, catalog, product, SKU, and price tables. Simplify the tenant-facing API/service/UI contract so private suppliers use system-managed defaults while platform shared suppliers keep stricter platform semantics.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase RPC/migrations, Next.js admin, shadcn/Radix, Tailwind.

---

## File Structure

- Modify `apps/api/src/schema/tenant-suppliers.ts`: make tenant private supplier create input name-first and backwards-compatible while hiding system-managed fields from the normal client path.
- Modify `apps/api/src/services/tenant-suppliers.ts`: generate private supplier code internally when omitted, default legal name and supplier type, and keep command idempotency separated from code allocation.
- Modify `apps/api/src/services/tenant-supplier-private-commands.ts`: add a helper for constructing private supplier create commands from simplified input.
- Modify `apps/api/src/services/supplier-product-access.ts`: private tenant-owned suppliers should not depend on platform onboarding semantics when writing products/prices.
- Modify `apps/admin/components/suppliers/add-supplier-dialog.tsx`: make private supplier creation a minimal form.
- Modify `apps/admin/components/suppliers/supplier-create-api.ts`: expose simplified private supplier payload to UI.
- Modify `apps/admin/components/suppliers/tenant-supplier-detail.tsx`: make private supplier detail tabs avoid platform-only concepts.
- Modify `apps/admin/components/suppliers/tenant-supplier-detail-panels.tsx`: split private supplier eligibility copy from platform supplier qualification copy.
- Modify `apps/admin/components/supplier-products/supplier-product-rules.ts`: align frontend write state with private supplier rules.
- Modify `apps/admin/components/supplier-products/catalog-search-select.tsx`: follow-up enhancement only if current select cannot create missing category/brand inline.
- Test `apps/api/src/schema/tenant-suppliers.test.ts`
- Test `apps/api/src/services/tenant-suppliers.test.ts`
- Test `apps/api/src/services/supplier-product-access.test.ts`
- Test `apps/admin/components/suppliers/supplier-interactions.test.ts`
- Test `apps/admin/components/supplier-products/supplier-product-page.test.tsx`

## Task 1: Confirm Contract And Scope

- [ ] **Step 1: Record the simplified rules before code changes**

Add this acceptance note to the PR description or task record:

```text
Tenant private supplier rules:
1. A tenant private supplier can provide many products.
2. A product chooses one tenant-visible category and one tenant-visible brand.
3. A category or brand can be used by many suppliers.
4. Private suppliers do not require platform qualification, platform brand mapping, platform category mapping, or business license approval for tenant-side product maintenance.
5. User-facing private supplier creation requires only supplier name; contact and remark are optional.
```

- [ ] **Step 2: Verify the current working tree**

Run:

```bash
git status --short --branch
```

Expected: existing unrelated dirty files may remain, but do not stage them:

```text
 M docs/superpowers/plans/2026-08-18-revert-pr71-pr72-and-reimplement-supplier-catalog.md
 M packages/domain/package.json
```

## Task 2: Simplify Private Supplier Create API

- [ ] **Step 1: Write schema tests**

Add tests in `apps/api/src/schema/tenant-suppliers.test.ts`:

```ts
test("租户私有供应商创建支持只提交供应商名称", () => {
  expect(TenantSupplierPrivateCreateSchema.parse({
    name: "固始晴天装饰工程有限公司",
  })).toEqual({
    name: "固始晴天装饰工程有限公司",
  });
});

test("租户私有供应商创建仍兼容旧的显式编码提交", () => {
  expect(TenantSupplierPrivateCreateSchema.parse({
    name: "晴天建材",
    legal_name: "晴天建材有限公司",
    supplier_type: "manufacturer",
    code_source: "manual",
    internal_supplier_code: "SUNNY-01",
  })).toMatchObject({
    name: "晴天建材",
    legal_name: "晴天建材有限公司",
    supplier_type: "manufacturer",
    code_source: "manual",
    internal_supplier_code: "SUNNY-01",
  });
});
```

- [ ] **Step 2: Run failing schema test**

Run:

```bash
cd apps/api && bun test src/schema/tenant-suppliers.test.ts
```

Expected: the new name-only private supplier create test fails before implementation.

- [ ] **Step 3: Implement schema compatibility**

In `apps/api/src/schema/tenant-suppliers.ts`, replace the private create schema with a union that accepts the simplified form and the legacy explicit-code forms:

```ts
const simplifiedPrivateSupplierCreateFields = z.object({
  name: privateSupplierMasterFields.name,
  primary_contact: primaryContact.optional(),
  remark: optionalText(500, "备注不能超过 500 个字符"),
}).strict();

export const TenantSupplierPrivateCreateSchema = z.union([
  simplifiedPrivateSupplierCreateFields,
  z.object({
    ...privateSupplierCreateFields,
    ...generatedInternalSupplierCodeFields,
  }).strict(),
  z.object({
    ...privateSupplierCreateFields,
    ...manualInternalSupplierCodeFields,
  }).strict(),
]);
```

- [ ] **Step 4: Run schema test again**

Run:

```bash
cd apps/api && bun test src/schema/tenant-suppliers.test.ts
```

Expected: all tests pass.

## Task 3: Move Private Supplier Defaults Into Service

- [ ] **Step 1: Write service tests**

Add tests in `apps/api/src/services/tenant-suppliers.test.ts` that verify simplified input:

```ts
test("createPrivateSupplier defaults system-managed fields for name-only tenant input", async () => {
  const repository = {
    getSettings: mock(async () => ({
      tenant_id: TENANT_ID,
      module_enabled: true,
      private_supplier_writes_enabled: true,
    })),
    allocateInternalCode: mock(async () => ({
      allocation_id: "30000000-0000-4000-8000-000000000099",
      code: "SUP-000001",
      idempotent: false,
    })),
    createPrivateSupplier: mock(async () => ({
      status: "created",
      version: 1,
      tenant_supplier: { id: TENANT_SUPPLIER_ID },
    })),
  };
  const service = new TenantSuppliersService({
    repository: repository as never,
    accessPolicy: accessPolicyWith("supplier.master.manage"),
  });

  await service.createPrivateSupplier(
    authContext,
    { name: "固始晴天装饰工程有限公司" },
    "private-create-key",
  );

  expect(repository.allocateInternalCode).toHaveBeenCalledWith(expect.objectContaining({
    tenant_id: TENANT_ID,
    idempotency_key: expect.stringContaining("private-create-key"),
  }));
  expect(repository.createPrivateSupplier).toHaveBeenCalledWith(expect.objectContaining({
    name: "固始晴天装饰工程有限公司",
    legal_name: "固始晴天装饰工程有限公司",
    supplier_type: "other",
    code_source: "generated",
    internal_supplier_code: "SUP-000001",
    allocation_id: "30000000-0000-4000-8000-000000000099",
    idempotency_key: "private-create-key",
  }));
});
```

- [ ] **Step 2: Run failing service test**

Run:

```bash
cd apps/api && bun test src/services/tenant-suppliers.test.ts
```

Expected: the new defaulting test fails before implementation.

- [ ] **Step 3: Implement internal defaulting**

In `apps/api/src/services/tenant-suppliers.ts`, route simplified input through internal allocation:

```ts
const privateSupplierDefaults = {
  supplier_type: "other" as const,
};

function isSimplifiedPrivateSupplierInput(
  input: TenantSupplierPrivateCreateInput,
) {
  return !("code_source" in input);
}
```

Then in `createPrivateSupplier`, before calling `createTenantPrivateSupplier`:

```ts
if (isSimplifiedPrivateSupplierInput(input)) {
  const allocation = await allocateTenantSupplierCode(
    this.repository,
    actor,
    `${idempotencyKey}:supplier-code`,
  );
  return createTenantPrivateSupplier(
    this.repository,
    actor,
    {
      name: input.name,
      legal_name: input.name,
      supplier_type: privateSupplierDefaults.supplier_type,
      primary_contact: input.primary_contact,
      code_source: "generated",
      internal_supplier_code: allocation.code,
      allocation_id: allocation.allocation_id,
    },
    idempotencyKey,
  );
}
```

- [ ] **Step 4: Handle idempotency key length**

If the current idempotency key plus suffix can exceed 120 characters, add:

```ts
function supplierCodeAllocationKey(idempotencyKey: string) {
  return `private-code:${idempotencyKey}`.slice(0, 120);
}
```

Use this helper instead of raw string concatenation.

- [ ] **Step 5: Run service tests**

Run:

```bash
cd apps/api && bun test src/services/tenant-suppliers.test.ts src/services/tenant-supplier-private-commands.test.ts
```

Expected: all tests pass.

## Task 4: Relax Product Write Rules For Tenant-Owned Private Suppliers

- [ ] **Step 1: Add API access test**

In `apps/api/src/services/supplier-product-access.test.ts`, add:

```ts
test("allows tenant-owned private suppliers to write products without platform onboarding semantics", async () => {
  const deps = dependencies({
    repository: {
      getSettings: mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: true,
      })),
      findRelationship: mock(async () => ({
        ...relationship,
        relationship_status: "active",
        supplier: {
          ...relationship.supplier,
          ownership_scope: "tenant",
          owner_tenant_id: TENANT_ID,
          onboarding_status: "draft",
          operational_status: "active",
        },
      })),
    },
  });
  const { SupplierProductAccessService } = await import("./supplier-product-access");
  await expect(new SupplierProductAccessService(deps as never).requireProductWrite(
    auth("supplier.product.manage"),
    TENANT_SUPPLIER_ID,
  )).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
});
```

- [ ] **Step 2: Run failing access test**

Run:

```bash
cd apps/api && bun test src/services/supplier-product-access.test.ts
```

Expected: the new private supplier test fails before implementation.

- [ ] **Step 3: Implement private supplier write decision**

In `apps/api/src/services/supplier-product-access.ts`, replace the write blocker with:

```ts
const tenantOwnedPrivateSupplier =
  relationship.supplier.ownership_scope === "tenant" &&
  relationship.supplier.owner_tenant_id === tenantId;
const platformReady =
  relationship.supplier.onboarding_status === "approved" &&
  relationship.supplier.operational_status === "active";
const privateReady =
  tenantOwnedPrivateSupplier &&
  relationship.supplier.operational_status === "active";

if (write && !platformReady && !privateReady) {
  throw Errors.business(
    409,
    "供应商当前不满足代录条件",
    "SUPPLIER_ORDER_NOT_ELIGIBLE",
    {
      relationship_status: relationship.relationship_status,
      supplier_onboarding_status: relationship.supplier.onboarding_status,
      supplier_operational_status: relationship.supplier.operational_status,
    },
  );
}
```

- [ ] **Step 4: Update frontend rule**

In `apps/admin/components/supplier-products/supplier-product-rules.ts`, change `relationshipIsWritable` to:

```ts
export function relationshipIsWritable(
  relationship: TenantSupplierRelationship,
) {
  const tenantOwnedPrivateSupplier =
    relationship.supplier.ownership_scope === "tenant" &&
    relationship.supplier.owner_tenant_id === relationship.tenant_id;
  const platformReady =
    relationship.supplier.onboarding_status === "approved" &&
    relationship.supplier.operational_status === "active";
  const privateReady =
    tenantOwnedPrivateSupplier &&
    relationship.supplier.operational_status === "active";
  return relationship.relationship_status === "active" &&
    (platformReady || privateReady);
}
```

- [ ] **Step 5: Run product access tests**

Run:

```bash
cd apps/api && bun test src/services/supplier-product-access.test.ts
cd apps/admin && bun test components/supplier-products/supplier-product-page.test.tsx
```

Expected: all tests pass.

## Task 5: Simplify Private Supplier UI

- [ ] **Step 1: Update API helper test**

In `apps/admin/components/suppliers/supplier-interactions.test.ts`, replace the old private create payload expectation with:

```ts
test("私有供应商创建只提交用户填写字段", async () => {
  let body: unknown;
  globalThis.fetch = (async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return jsonResponse({ success: true, data: { id: "private-1" } });
  }) as typeof fetch;

  await createTenantPrivateSupplier({
    name: "固始晴天装饰工程有限公司",
  }, "private-create-key");

  expect(body).toEqual({
    name: "固始晴天装饰工程有限公司",
  });
});
```

- [ ] **Step 2: Implement simplified helper type**

In `apps/admin/components/suppliers/supplier-create-api.ts`, change `createTenantPrivateSupplier` input:

```ts
export function createTenantPrivateSupplier(
  input: {
    name: string;
    primary_contact?: {
      name: string;
      phone?: string | null;
      email?: string | null;
    };
  },
  idempotencyKey: string,
) {
  return requestBackendJson("/suppliers/private", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
    fallbackMessage: "新建租户私有供应商失败",
  });
}
```

- [ ] **Step 3: Simplify dialog state and fields**

In `apps/admin/components/suppliers/add-supplier-dialog.tsx`, reduce private form:

```ts
type PrivateForm = {
  name: string;
  contactName: string;
  contactPhone: string;
};

const emptyPrivateForm: PrivateForm = {
  name: "",
  contactName: "",
  contactPhone: "",
};
```

Update `createPrivate` to submit only user-facing fields:

```ts
await createTenantPrivateSupplier({
  name: privateForm.name.trim(),
  ...(privateForm.contactName.trim()
    ? {
      primary_contact: {
        name: privateForm.contactName.trim(),
        phone: privateForm.contactPhone.trim() || null,
      },
    }
    : {}),
}, newIdempotencyKey("tenant-private-supplier-create"));
```

Remove `SupplierCodeField` from private mode; keep it for shared suppliers only.

- [ ] **Step 4: Run admin tests**

Run:

```bash
cd apps/admin && bun test components/suppliers/supplier-interactions.test.ts
cd apps/admin && pnpm run typecheck
```

Expected: all tests and typecheck pass.

## Task 6: Make Private Supplier Detail Page Match User Mental Model

- [ ] **Step 1: Add a private supplier detail condition**

In `apps/admin/components/suppliers/tenant-supplier-detail.tsx`, define:

```ts
const isPrivateSupplier =
  detail.supplier.ownership_scope === "tenant" &&
  detail.supplier.owner_tenant_id === detail.tenant_id;
```

- [ ] **Step 2: Rename/hide platform-only tabs for private suppliers**

Use these tab labels:

```tsx
<TabsTrigger value="settings" className={platformTabsTriggerClassName}>
  基本信息
</TabsTrigger>
<TabsTrigger value="contracts" className={platformTabsTriggerClassName}>
  合同
</TabsTrigger>
{isPrivateSupplier ? null : (
  <TabsTrigger value="eligibility" className={platformTabsTriggerClassName}>
    准入与资质
  </TabsTrigger>
)}
{isPrivateSupplier ? null : (
  <TabsTrigger value="regions" className={platformTabsTriggerClassName}>
    服务区域
  </TabsTrigger>
)}
<TabsTrigger value="events" className={platformTabsTriggerClassName}>
  操作记录
</TabsTrigger>
```

- [ ] **Step 3: Keep eligibility copy platform-specific**

In `apps/admin/components/suppliers/tenant-supplier-detail-panels.tsx`, change the eligibility description:

```tsx
系统会综合平台准入、运营状态、租户合作状态、必填资质和合同策略实时判断。
```

to:

```tsx
平台共享供应商会综合平台准入、运营状态、租户合作状态、必填资质和合同策略实时判断。
```

- [ ] **Step 4: Run supplier UI checks**

Run:

```bash
cd apps/admin && bun test components/suppliers/supplier-interactions.test.ts
cd apps/admin && pnpm run typecheck
```

Expected: all tests and typecheck pass.

## Task 7: Optional Follow-Up For Inline Category/Brand Creation

- [ ] **Step 1: Defer unless user confirms**

This is useful but should be a second PR if the first PR is already large. Scope:

```text
When adding a supplier product, if category or brand is not found, show "新建分类" or "新建品牌" inside the select popover, call the existing tenant catalog create APIs, then select the created option automatically.
```

- [ ] **Step 2: If approved, add tests before implementation**

Target files:

```text
apps/admin/components/supplier-products/catalog-search-select.tsx
apps/admin/components/tenant-supplier-catalog/tenant-supplier-catalog.test.tsx
apps/api/src/services/supplier-catalog-tenant.test.ts
```

## Final Verification

- [ ] **Run targeted API tests**

```bash
cd apps/api && bun test \
  src/schema/tenant-suppliers.test.ts \
  src/services/tenant-suppliers.test.ts \
  src/services/supplier-product-access.test.ts \
  src/schema/supplier-products.test.ts \
  src/services/supplier-products.test.ts
```

- [ ] **Run API build**

```bash
cd apps/api && bun run build
```

- [ ] **Run targeted admin tests**

```bash
cd apps/admin && bun test \
  components/suppliers/supplier-interactions.test.ts \
  components/supplier-products/supplier-product-page.test.tsx
```

- [ ] **Run admin typecheck**

```bash
cd apps/admin && pnpm run typecheck
```

- [ ] **Manual smoke**

```text
1. Admin tenant side opens supplier module.
2. Create private supplier with only supplier name.
3. Confirm supplier appears as tenant private and no code/legal/platform mapping fields were required.
4. Open product workspace for that supplier.
5. Create product using existing tenant category and brand.
6. Confirm product save succeeds and product code is generated by system.
7. Confirm private supplier detail does not show platform service area or platform qualification tabs.
```

## Commit Plan

- [ ] Commit Task 2-3 backend create simplification:

```bash
git add apps/api/src/schema/tenant-suppliers.ts apps/api/src/schema/tenant-suppliers.test.ts apps/api/src/services/tenant-suppliers.ts apps/api/src/services/tenant-suppliers.test.ts
git commit -m "feat: simplify tenant private supplier creation"
```

- [ ] Commit Task 4 product write rule:

```bash
git add apps/api/src/services/supplier-product-access.ts apps/api/src/services/supplier-product-access.test.ts apps/admin/components/supplier-products/supplier-product-rules.ts apps/admin/components/supplier-products/supplier-product-page.test.tsx
git commit -m "fix: allow tenant private supplier product maintenance"
```

- [ ] Commit Task 5-6 admin simplification:

```bash
git add apps/admin/components/suppliers/add-supplier-dialog.tsx apps/admin/components/suppliers/supplier-create-api.ts apps/admin/components/suppliers/tenant-supplier-detail.tsx apps/admin/components/suppliers/tenant-supplier-detail-panels.tsx apps/admin/components/suppliers/supplier-interactions.test.ts
git commit -m "feat: simplify tenant private supplier UI"
```
