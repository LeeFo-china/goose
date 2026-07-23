# Supplier Foundation Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an independently usable supplier foundation: one platform supplier identity, tenant-specific cooperation relationships, qualification and service-region governance, standard category/brand/unit dictionaries, explicit permissions, audit history, and simple platform/tenant Admin workflows.

**Architecture:** Additive Supabase migrations own the supplier master, tenant relationship, rollout policy, standard catalog, and atomic command contracts. Fastify controllers remain HTTP-only, services own authorization and state rules, repositories own bounded Supabase/RPC access, and `@gooes/domain` owns shared status contracts. Platform Admin manages supplier admission and standards; tenant Admin links approved suppliers and manages its own commercial relationship. Purchase orders, products, prices, inventory, payables, and supplier-portal users remain outside Phase 0.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase PostgreSQL migrations/RPC/RLS, Next.js App Router, React, shadcn/Radix/Tailwind, Bun tests, Playwright.

---

## Source of Truth

- Approved design: `docs/superpowers/specs/2026-07-23-supplier-management-platform-design.md`
- Repository rules: `AGENTS.md`
- Existing platform review pattern:
  - `apps/api/src/controllers/platform-tenant-onboarding/index.ts`
  - `apps/api/src/services/tenant-onboarding-review.ts`
  - `apps/api/src/repositories/tenant-onboarding-review.ts`
- Existing tenant profile pattern:
  - `apps/api/src/controllers/tenant-service-provider/index.ts`
  - `apps/api/src/services/tenant-service-providers.ts`
  - `apps/api/src/repositories/tenant-service-providers.ts`
- Existing Admin list/form patterns:
  - `apps/admin/app/(console)/platform/tenant-onboarding/page.tsx`
  - `apps/admin/app/(console)/settings/service-provider/page.tsx`
  - `apps/admin/components/admin/data-table.tsx`
  - `apps/admin/components/layout/menu-config.ts`

## Phase 0 Scope

Phase 0 includes:

1. Platform supplier master and lifecycle.
2. Qualification types, supplier qualifications, contacts, addresses, and service regions.
3. Tenant supplier module rollout settings.
4. Tenant-specific supplier relationship and contracts.
5. Platform standard categories, brands, and units.
6. Derived qualification health and new-order eligibility.
7. Platform and tenant permissions.
8. Atomic lifecycle history, platform audit projection, pagination, and tenant isolation.
9. Platform Admin and tenant Admin pages.

Phase 0 explicitly excludes:

- Supplier portal users and access grants.
- Supplier SPU/SKU, buyer tiers, supply price books, and owner sales price books.
- BOM, requisitions, purchase orders, shipments, receipts, returns, warehouses, and inventory.
- Payables, statements, payment requests, and payments.
- Orange changes. `/Users/leefo/Public/work/orange` remains read-only.
- Historical `vendor_name` or `payee_name` auto-matching.
- Redis, queues, caches, or new package dependencies.

## Domain Decisions Locked by This Plan

### Status dimensions

Do not create a generic editable `status` field.

| Dimension | Stored values | Changed by |
| --- | --- | --- |
| Supplier onboarding | `draft`, `pending_review`, `approved`, `rejected` | submit/review commands |
| Supplier operation | `active`, `suspended`, `blacklisted` | suspend/resume/blacklist commands |
| Qualification verification | `pending`, `verified`, `rejected` | qualification review command |
| Qualification health | `valid`, `expiring`, `expired`, `missing` | derived from type rules, verification, and dates |
| Tenant relationship | `evaluating`, `active`, `suspended`, `terminated`, `blacklisted` | tenant relationship commands |
| Contract lifecycle | `draft`, `active`, `terminated` | contract activate/terminate commands |
| Contract health | `valid`, `expiring`, `expired`, `missing` | derived from lifecycle and dates |

### New-order eligibility

`GET /suppliers/:id/order-eligibility` returns:

```ts
type SupplierOrderEligibility = {
  eligible: boolean;
  checked_at: string;
  blocking_reasons: Array<
    | "module_disabled"
    | "supplier_not_approved"
    | "supplier_suspended"
    | "supplier_blacklisted"
    | "relationship_not_active"
    | "required_qualification_missing"
    | "required_qualification_expired"
    | "active_contract_required"
  >;
};
```

Phase 1 purchase-order creation must call the same service/RPC. Existing-order closeout is deliberately not gated by this result.

### Tenant rollout

`tenant_supplier_settings` is default-deny. A platform operator enables the module per tenant. Tenant routes return `SUPPLIER_MODULE_DISABLED` while disabled. Tenant Admin can edit only the contract policy; it cannot enable the module itself.

### Concurrency and idempotency

- Every mutable aggregate has `version integer NOT NULL DEFAULT 1`.
- Profile edits and catalog edits require `expected_version`.
- Lifecycle commands require both `expected_version` and `Idempotency-Key`.
- Atomic RPCs lock the aggregate row, check the command ledger, validate the current state, apply the mutation, increment the version, and append a command event in one transaction.
- Reusing the same key for the same command returns the prior result with `idempotent: true`.
- Reusing the same key for a different resource or command returns `SUPPLIER_IDEMPOTENCY_CONFLICT`.

## Migration Group

Use these exact filenames after checking that none already exists:

1. `supabase/migrations/20260723140000_create_supplier_master_data.sql`
2. `supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql`
3. `supabase/migrations/20260723142000_create_supplier_standard_catalog.sql`
4. `supabase/migrations/20260723143000_create_supplier_foundation_commands.sql`
5. `supabase/migrations/20260723144000_seed_supplier_foundation_permissions.sql`

All five migrations are additive. They must:

- Begin with a rollback comment and `BEGIN;`.
- End with `COMMIT;`.
- Enable and force RLS on every new table.
- Expose no direct `anon` or `authenticated` access.
- Revoke every command function from `PUBLIC`, `anon`, and `authenticated`.
- Grant command execution only to `service_role`.
- Use migration-managed constraints, indexes, functions, triggers, permissions, and seed rows.

## File Responsibility Map

### Create

Database and contracts:

- `supabase/migrations/20260723140000_create_supplier_master_data.sql`
- `supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql`
- `supabase/migrations/20260723142000_create_supplier_standard_catalog.sql`
- `supabase/migrations/20260723143000_create_supplier_foundation_commands.sql`
- `supabase/migrations/20260723144000_seed_supplier_foundation_permissions.sql`
- `packages/domain/src/supplier.ts`
- `packages/domain/src/supplier.test.ts`
- `apps/api/src/services/supplier-foundation-migration-contract.test.ts`

API:

- `apps/api/src/schema/platform-suppliers.ts`
- `apps/api/src/schema/tenant-suppliers.ts`
- `apps/api/src/schema/supplier-catalog.ts`
- `apps/api/src/schema/supplier-foundation.test.ts`
- `apps/api/src/repositories/platform-suppliers.ts`
- `apps/api/src/repositories/platform-suppliers.test.ts`
- `apps/api/src/repositories/tenant-suppliers.ts`
- `apps/api/src/repositories/tenant-suppliers.test.ts`
- `apps/api/src/repositories/supplier-catalog.ts`
- `apps/api/src/repositories/supplier-catalog.test.ts`
- `apps/api/src/services/platform-suppliers.ts`
- `apps/api/src/services/platform-suppliers.test.ts`
- `apps/api/src/services/tenant-suppliers.ts`
- `apps/api/src/services/tenant-suppliers.test.ts`
- `apps/api/src/services/supplier-catalog.ts`
- `apps/api/src/services/supplier-catalog.test.ts`
- `apps/api/src/controllers/platform-suppliers/index.ts`
- `apps/api/src/controllers/platform-suppliers/routes.test.ts`
- `apps/api/src/controllers/tenant-suppliers/index.ts`
- `apps/api/src/controllers/tenant-suppliers/routes.test.ts`
- `apps/api/src/controllers/platform-supplier-catalog/index.ts`
- `apps/api/src/controllers/platform-supplier-catalog/routes.test.ts`
- `apps/api/src/controllers/supplier-catalog/index.ts`
- `apps/api/src/controllers/supplier-catalog/routes.test.ts`

Admin:

- `apps/admin/app/(console)/platform/suppliers/page.tsx`
- `apps/admin/app/(console)/platform/suppliers/loading.tsx`
- `apps/admin/app/(console)/platform/catalog/page.tsx`
- `apps/admin/app/(console)/platform/catalog/loading.tsx`
- `apps/admin/app/(console)/suppliers/page.tsx`
- `apps/admin/app/(console)/suppliers/loading.tsx`
- `apps/admin/components/platform-suppliers/platform-supplier-actions.tsx`
- `apps/admin/components/platform-suppliers/platform-supplier-detail.tsx`
- `apps/admin/components/platform-suppliers/platform-supplier-filters.tsx`
- `apps/admin/components/platform-suppliers/platform-supplier-form.tsx`
- `apps/admin/components/platform-suppliers/supplier-qualification-type-table.tsx`
- `apps/admin/components/platform-suppliers/platform-supplier-table.tsx`
- `apps/admin/components/platform-suppliers/platform-supplier-types.ts`
- `apps/admin/components/platform-suppliers/platform-suppliers-page.test.ts`
- `apps/admin/components/suppliers/supplier-actions.tsx`
- `apps/admin/components/suppliers/supplier-contract-dialog.tsx`
- `apps/admin/components/suppliers/supplier-detail.tsx`
- `apps/admin/components/suppliers/supplier-link-dialog.tsx`
- `apps/admin/components/suppliers/supplier-table.tsx`
- `apps/admin/components/suppliers/supplier-types.ts`
- `apps/admin/components/suppliers/suppliers-page.test.ts`
- `apps/admin/components/supplier-catalog/supplier-catalog-actions.tsx`
- `apps/admin/components/supplier-catalog/supplier-catalog-dialogs.tsx`
- `apps/admin/components/supplier-catalog/supplier-catalog-table.tsx`
- `apps/admin/components/supplier-catalog/supplier-catalog-types.ts`
- `apps/admin/components/supplier-catalog/supplier-catalog-page.test.ts`
- `apps/admin/components/platform-tenants/tenant-supplier-settings-card.tsx`
- `apps/admin/e2e/supplier-foundation-smoke.spec.ts`

Documentation:

- `docs/supplier/2026-07-23-supplier-foundation-api.md`

### Modify

- `packages/domain/src/index.ts`
- `packages/domain/src/permission.ts`
- `packages/domain/src/permission.test.ts`
- `apps/api/src/errors/error-codes.ts`
- `apps/api/src/schema/platform-audit-logs.ts`
- `apps/api/src/schema/tenant-onboarding.test.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/types/database.ts` — generated after migrations are applied; do not hand-edit.
- `apps/admin/components/layout/menu-config.ts`
- `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`

---

## Task 0: Start in an Isolated Worktree and Lock the Baseline

**Files:** no business files.

- [ ] Invoke `using-git-worktrees` before implementation.
- [ ] Record the current branch, commit, staged files, and dirty files:

```bash
git branch --show-current
git rev-parse HEAD
git diff --cached --name-only
git status --short
git -C /Users/leefo/Public/work/orange status --porcelain=v1 > /tmp/gooes-supplier-orange-status-before.txt
```

Expected: existing user changes may be present in the current worktree. They must not be staged, reverted, formatted, or copied into the feature branch.

- [ ] Create an isolated branch named `feature/supplier-foundation-phase0` using the worktree location selected by the skill.
- [ ] Confirm the isolated worktree starts from the approved specification commit or a descendant:

```bash
git merge-base --is-ancestor 8debbd809d9f879d7b2ae5082d8c04c9 HEAD
```

Expected: exit code `0`.

- [ ] Run the focused baseline checks:

```bash
bun test packages/domain/src/permission.test.ts
bun test apps/api/src/services/tenant-service-provider-publication-migration.test.ts
bun run api:typecheck
pnpm --dir apps/admin typecheck
```

Expected: PASS before supplier code is added. If a baseline check fails, stop and document the pre-existing failure instead of changing unrelated code.

---

## Task 1: Add Shared Supplier Contracts and Permission Codes

**Files:**

- Create: `packages/domain/src/supplier.ts`
- Create: `packages/domain/src/supplier.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: Write failing shared-domain tests**

Create `packages/domain/src/supplier.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  SUPPLIER_ONBOARDING_STATUS_VALUES,
  SUPPLIER_OPERATIONAL_STATUS_VALUES,
  SUPPLIER_QUALIFICATION_HEALTH_VALUES,
  TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES,
  isSupplierOrderBlockingReason,
} from "./supplier";

describe("supplier domain contracts", () => {
  test("keeps independent supplier status dimensions", () => {
    expect(SUPPLIER_ONBOARDING_STATUS_VALUES).toEqual([
      "draft",
      "pending_review",
      "approved",
      "rejected",
    ]);
    expect(SUPPLIER_OPERATIONAL_STATUS_VALUES).toEqual([
      "active",
      "suspended",
      "blacklisted",
    ]);
    expect(SUPPLIER_QUALIFICATION_HEALTH_VALUES).toEqual([
      "valid",
      "expiring",
      "expired",
      "missing",
    ]);
    expect(TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES).toEqual([
      "evaluating",
      "active",
      "suspended",
      "terminated",
      "blacklisted",
    ]);
  });

  test("recognizes stable order-blocking reason codes", () => {
    expect(isSupplierOrderBlockingReason("supplier_blacklisted")).toBe(true);
    expect(isSupplierOrderBlockingReason("unknown")).toBe(false);
  });
});
```

Add assertions to `packages/domain/src/permission.test.ts` for:

```ts
const expectedSupplierPermissions = {
  "platform.supplier.view": {
    label: "查看平台供应商",
    module: "platform_supplier",
  },
  "platform.supplier.review": {
    label: "审核供应商准入",
    module: "platform_supplier",
  },
  "platform.supplier.manage": {
    label: "管理平台供应商",
    module: "platform_supplier",
  },
  "platform.supplier.blacklist": {
    label: "管理供应商黑名单",
    module: "platform_supplier",
  },
  "platform.catalog.manage": {
    label: "管理供应标准目录",
    module: "platform_supplier_catalog",
  },
  "supplier.view": {
    label: "查看合作供应商",
    module: "supplier",
  },
  "supplier.manage": {
    label: "管理合作供应商",
    module: "supplier",
  },
  "supplier.contract.manage": {
    label: "管理供应商合同",
    module: "supplier",
  },
} as const;

for (const [code, config] of Object.entries(expectedSupplierPermissions)) {
  expect(PermissionCodeConfig[code as PermissionCode]).toEqual(config);
}
```

- [ ] **Step 2: Verify RED**

```bash
bun test packages/domain/src/supplier.test.ts packages/domain/src/permission.test.ts
```

Expected: FAIL because `supplier.ts` and the permission codes do not exist.

- [ ] **Step 3: Add exact shared status values**

Create `packages/domain/src/supplier.ts` with these exported constants and derived types:

```ts
export const SUPPLIER_TYPE_VALUES = [
  "manufacturer",
  "brand_agent",
  "distributor",
  "retailer",
  "other",
] as const;

export const SUPPLIER_ONBOARDING_STATUS_VALUES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
] as const;

export const SUPPLIER_OPERATIONAL_STATUS_VALUES = [
  "active",
  "suspended",
  "blacklisted",
] as const;

export const SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES = [
  "pending",
  "verified",
  "rejected",
] as const;

export const SUPPLIER_QUALIFICATION_HEALTH_VALUES = [
  "valid",
  "expiring",
  "expired",
  "missing",
] as const;

export const TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES = [
  "evaluating",
  "active",
  "suspended",
  "terminated",
  "blacklisted",
] as const;

export const SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES = [
  "draft",
  "active",
  "terminated",
] as const;

export const SUPPLIER_ORDER_BLOCKING_REASON_VALUES = [
  "module_disabled",
  "supplier_not_approved",
  "supplier_suspended",
  "supplier_blacklisted",
  "relationship_not_active",
  "required_qualification_missing",
  "required_qualification_expired",
  "active_contract_required",
] as const;

export type SupplierType = (typeof SUPPLIER_TYPE_VALUES)[number];
export type SupplierOnboardingStatus =
  (typeof SUPPLIER_ONBOARDING_STATUS_VALUES)[number];
export type SupplierOperationalStatus =
  (typeof SUPPLIER_OPERATIONAL_STATUS_VALUES)[number];
export type SupplierQualificationVerificationStatus =
  (typeof SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES)[number];
export type SupplierQualificationHealth =
  (typeof SUPPLIER_QUALIFICATION_HEALTH_VALUES)[number];
export type TenantSupplierRelationshipStatus =
  (typeof TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES)[number];
export type SupplierContractLifecycleStatus =
  (typeof SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES)[number];
export type SupplierOrderBlockingReason =
  (typeof SUPPLIER_ORDER_BLOCKING_REASON_VALUES)[number];

export function isSupplierOrderBlockingReason(
  value: string,
): value is SupplierOrderBlockingReason {
  return (SUPPLIER_ORDER_BLOCKING_REASON_VALUES as readonly string[])
    .includes(value);
}
```

Export `./supplier` from `packages/domain/src/index.ts`.

- [ ] **Step 4: Add the eight permission codes**

Add the exact codes and labels from Step 1 to `PERMISSION_CODE_VALUES` and `PermissionCodeConfig`.

- [ ] **Step 5: Verify GREEN and build the package**

```bash
bun test packages/domain/src/supplier.test.ts packages/domain/src/permission.test.ts
bun --cwd packages/domain run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/supplier.ts packages/domain/src/supplier.test.ts packages/domain/src/index.ts packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(supplier): add shared foundation contracts"
```

---

## Task 2: Create Supplier Master Data with a Migration Contract

**Files:**

- Create: `apps/api/src/services/supplier-foundation-migration-contract.test.ts`
- Create: `supabase/migrations/20260723140000_create_supplier_master_data.sql`

- [ ] **Step 1: Write the failing migration contract**

The test must read all five exact migration paths and assert:

```ts
expect(masterSql).toContain("CREATE TABLE public.supplier_qualification_types");
expect(masterSql).toContain("CREATE TABLE public.suppliers");
expect(masterSql).toContain("CREATE TABLE public.supplier_qualifications");
expect(masterSql).toContain("CREATE TABLE public.supplier_service_regions");
expect(masterSql).toContain("CREATE TABLE public.supplier_addresses");
expect(masterSql).toContain("CREATE TABLE public.supplier_contacts");
expect(masterSql).toContain("suppliers_credit_code_unique_idx");
expect(masterSql).toContain("supplier_qualifications_health_lookup_idx");
expect(masterSql).toContain("ENABLE ROW LEVEL SECURITY");
expect(masterSql).toContain("FORCE ROW LEVEL SECURITY");
expect(masterSql).toContain("'business_license'");
```

- [ ] **Step 2: Verify RED**

```bash
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts
```

Expected: FAIL because the migration files do not exist.

- [ ] **Step 3: Create the supplier master tables**

The migration must use these column contracts:

```sql
CREATE TABLE public.supplier_qualification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  applicable_supplier_types text[] NOT NULL DEFAULT '{}'::text[],
  warning_days integer NOT NULL DEFAULT 30 CHECK (warning_days BETWEEN 0 AND 3650),
  is_required boolean NOT NULL DEFAULT false,
  blocks_new_orders boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text NOT NULL,
  unified_social_credit_code text NULL,
  supplier_type text NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'draft',
  operational_status text NOT NULL DEFAULT 'active',
  review_remark text NULL,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  blacklisted_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  blacklisted_at timestamptz NULL,
  blacklist_reason text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX suppliers_credit_code_unique_idx
  ON public.suppliers (upper(btrim(unified_social_credit_code)))
  WHERE unified_social_credit_code IS NOT NULL
    AND btrim(unified_social_credit_code) <> '';
```

Use `CHECK` constraints tied to the shared values for supplier type, onboarding status, and operational status. Add trimmed/nonblank checks for codes and names.

The dependent tables must include:

- `supplier_qualifications`: `supplier_id`, `qualification_type_id`, private `document_file_id`, certificate number, validity dates, verification fields, `version`, unique current document identity.
- `supplier_service_regions`: `supplier_id`, administrative `region_code`, `region_level`, `status`, validity dates, `version`, unique `(supplier_id, region_code)`.
- `supplier_addresses`: typed registered/shipping/return/other addresses, administrative region code, detail, optional coordinates, `is_default`, `version`.
- `supplier_contacts`: typed primary/sales/finance/logistics/after_sales contacts, name, phone, email, `is_public`, `is_primary`, `version`.

The qualification document must reference `platform_file_objects(id)` with `ON DELETE RESTRICT`.

- [ ] **Step 4: Add indexes and RLS**

Create these indexes:

```sql
CREATE INDEX suppliers_platform_queue_idx
  ON public.suppliers(onboarding_status, operational_status, updated_at DESC, id DESC);

CREATE INDEX supplier_qualifications_health_lookup_idx
  ON public.supplier_qualifications(
    supplier_id,
    qualification_type_id,
    verification_status,
    valid_until DESC
  );

CREATE INDEX supplier_service_regions_lookup_idx
  ON public.supplier_service_regions(region_code, status, valid_until DESC, supplier_id);

CREATE INDEX supplier_contacts_supplier_type_idx
  ON public.supplier_contacts(supplier_id, contact_type, is_primary DESC);
```

Enable and force RLS on all six tables. Do not add permissive client policies.

- [ ] **Step 5: Seed only the stable required qualification**

Seed:

```sql
INSERT INTO public.supplier_qualification_types (
  code,
  name,
  applicable_supplier_types,
  warning_days,
  is_required,
  blocks_new_orders,
  sort_order
)
VALUES (
  'business_license',
  '营业执照',
  ARRAY['manufacturer', 'brand_agent', 'distributor', 'retailer', 'other'],
  30,
  true,
  true,
  10
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  applicable_supplier_types = EXCLUDED.applicable_supplier_types,
  warning_days = EXCLUDED.warning_days,
  is_required = EXCLUDED.is_required,
  blocks_new_orders = EXCLUDED.blocks_new_orders,
  sort_order = EXCLUDED.sort_order;
```

Do not seed guessed category or brand data.

- [ ] **Step 6: Verify GREEN**

```bash
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/supplier-foundation-migration-contract.test.ts supabase/migrations/20260723140000_create_supplier_master_data.sql
git commit -m "feat(supplier): create platform supplier master data"
```

---

## Task 3: Add Tenant Relationships, Contracts, and Default-Deny Rollout

**Files:**

- Modify: `apps/api/src/services/supplier-foundation-migration-contract.test.ts`
- Create: `supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql`

- [ ] **Step 1: Extend the failing contract**

Assert:

```ts
expect(relationshipSql).toContain("CREATE TABLE public.tenant_supplier_settings");
expect(relationshipSql).toContain("module_enabled boolean NOT NULL DEFAULT false");
expect(relationshipSql).toContain("CREATE TABLE public.tenant_suppliers");
expect(relationshipSql).toContain("CREATE TABLE public.supplier_contracts");
expect(relationshipSql).toContain("UNIQUE (tenant_id, supplier_id)");
expect(relationshipSql).toContain("tenant_suppliers_tenant_status_updated_idx");
expect(relationshipSql).toContain("supplier_contracts_active_lookup_idx");
```

- [ ] **Step 2: Verify RED**

```bash
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts
```

- [ ] **Step 3: Create rollout settings**

```sql
CREATE TABLE public.tenant_supplier_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_enabled boolean NOT NULL DEFAULT false,
  require_active_contract_for_new_order boolean NOT NULL DEFAULT false,
  enabled_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  enabled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_supplier_settings_enabled_metadata_check CHECK (
    (module_enabled = false)
    OR (enabled_by_employee_id IS NOT NULL AND enabled_at IS NOT NULL)
  )
);
```

- [ ] **Step 4: Create tenant relationship and contract tables**

`tenant_suppliers` must include:

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
relationship_status text NOT NULL DEFAULT 'evaluating',
settlement_term_days integer NOT NULL DEFAULT 0 CHECK (settlement_term_days BETWEEN 0 AND 3650),
credit_limit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
invoice_required_before_payment boolean NOT NULL DEFAULT false,
default_currency char(3) NOT NULL DEFAULT 'CNY',
default_tax_inclusive boolean NOT NULL DEFAULT true,
tenant_owner_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
started_at date NULL,
ended_at date NULL,
remark text NULL,
version integer NOT NULL DEFAULT 1 CHECK (version > 0),
created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
UNIQUE (tenant_id, supplier_id)
```

`supplier_contracts` must include:

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
tenant_supplier_id uuid NOT NULL REFERENCES public.tenant_suppliers(id) ON DELETE RESTRICT,
contract_no text NOT NULL,
name text NOT NULL,
lifecycle_status text NOT NULL DEFAULT 'draft',
valid_from date NOT NULL,
valid_until date NOT NULL,
settlement_term_days integer NOT NULL DEFAULT 0,
invoice_required_before_payment boolean NOT NULL DEFAULT false,
document_file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
version integer NOT NULL DEFAULT 1 CHECK (version > 0),
created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
UNIQUE (tenant_id, contract_no),
CHECK (valid_until >= valid_from)
```

Add a trigger that copies and validates `supplier_contracts.tenant_id` from its `tenant_suppliers` parent so callers cannot create a cross-tenant contract.

- [ ] **Step 5: Add indexes and RLS**

```sql
CREATE INDEX tenant_suppliers_tenant_status_updated_idx
  ON public.tenant_suppliers(
    tenant_id,
    relationship_status,
    updated_at DESC,
    id DESC
  );

CREATE INDEX tenant_suppliers_supplier_status_idx
  ON public.tenant_suppliers(supplier_id, relationship_status, tenant_id);

CREATE INDEX supplier_contracts_active_lookup_idx
  ON public.supplier_contracts(
    tenant_id,
    tenant_supplier_id,
    lifecycle_status,
    valid_until DESC
  );
```

Enable and force RLS on all three tables.

- [ ] **Step 6: Verify and commit**

```bash
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts
git diff --check
git add apps/api/src/services/supplier-foundation-migration-contract.test.ts supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql
git commit -m "feat(supplier): add tenant cooperation foundation"
```

---

## Task 4: Add the Platform Standard Catalog

**Files:**

- Modify: `apps/api/src/services/supplier-foundation-migration-contract.test.ts`
- Create: `supabase/migrations/20260723142000_create_supplier_standard_catalog.sql`

- [ ] **Step 1: Extend the failing contract**

Assert category hierarchy, brands, units, unique codes, indexes, RLS, and no guessed seed categories.

- [ ] **Step 2: Create exact tables**

```sql
CREATE TABLE public.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NULL REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text NULL,
  logo_file_id uuid NULL REFERENCES public.platform_file_objects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  symbol text NOT NULL,
  base_unit_id uuid NULL REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  conversion_factor numeric(18, 6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (base_unit_id IS NULL AND conversion_factor = 1)
    OR base_unit_id IS NOT NULL
  )
);
```

Add a trigger that:

- Assigns root categories level `1`.
- Requires a child level to equal parent level plus one.
- Rejects a category as its own parent.
- Rejects category cycles.
- Requires a derived unit’s base unit to be a base unit.

- [ ] **Step 3: Add bounded-list indexes**

```sql
CREATE INDEX catalog_categories_parent_status_sort_idx
  ON public.catalog_categories(parent_id, status, sort_order, id);
CREATE INDEX catalog_brands_status_name_idx
  ON public.catalog_brands(status, name, id);
CREATE INDEX catalog_units_status_sort_idx
  ON public.catalog_units(status, sort_order, id);
```

Enable and force RLS. Do not seed business-specific categories, brands, or package conversions.

- [ ] **Step 4: Verify and commit**

```bash
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts
git diff --check
git add apps/api/src/services/supplier-foundation-migration-contract.test.ts supabase/migrations/20260723142000_create_supplier_standard_catalog.sql
git commit -m "feat(supplier): add standard catalog foundation"
```

---

## Task 5: Add Atomic Commands, Eligibility, and Permission Seeds

**Files:**

- Modify: `apps/api/src/services/supplier-foundation-migration-contract.test.ts`
- Create: `supabase/migrations/20260723143000_create_supplier_foundation_commands.sql`
- Create: `supabase/migrations/20260723144000_seed_supplier_foundation_permissions.sql`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/schema/platform-audit-logs.ts`
- Modify: `apps/api/src/schema/tenant-onboarding.test.ts`

- [ ] **Step 1: Extend the migration contract before SQL**

Assert:

```ts
for (const name of [
  "create_platform_supplier",
  "mutate_platform_supplier",
  "review_supplier_qualification",
  "set_tenant_supplier_module",
  "create_tenant_supplier",
  "mutate_tenant_supplier",
  "mutate_supplier_contract",
  "get_tenant_supplier_order_eligibility",
  "list_available_suppliers_for_tenant",
]) {
  expect(commandSql).toContain(`FUNCTION public.${name}`);
  expect(commandSql).toMatch(
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*?TO service_role`),
  );
}
expect(commandSql).toContain("CREATE TABLE public.supplier_command_events");
expect(commandSql).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
expect(commandSql).toContain("FOR UPDATE");
expect(permissionSql).toContain("'platform.supplier.blacklist'");
expect(permissionSql).toContain("'supplier.contract.manage'");
expect(permissionSql).toContain("roles.code = 'platform_admin'");
expect(permissionSql).toContain("roles.code = 'system_admin'");
```

- [ ] **Step 2: Create the append-only command ledger**

Use:

```sql
CREATE TABLE public.supplier_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (
    resource_type IN ('supplier', 'supplier_qualification', 'tenant_supplier', 'supplier_contract')
  ),
  resource_id uuid NOT NULL,
  command text NOT NULL,
  from_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NULL,
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    btrim(idempotency_key) <> '' AND char_length(idempotency_key) <= 120
  ),
  result_version integer NOT NULL CHECK (result_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);
```

Revoke `UPDATE`, `DELETE`, and `TRUNCATE` from application roles. Enable and force RLS.

- [ ] **Step 3: Implement exact platform supplier transitions**

`mutate_platform_supplier` accepts:

```sql
p_supplier_id uuid,
p_action text,
p_expected_version integer,
p_actor_user_id uuid,
p_actor_employee_id uuid,
p_idempotency_key text,
p_reason text DEFAULT NULL
```

Allowed transitions:

| Action | From | To |
| --- | --- | --- |
| `submit` | onboarding `draft` or `rejected` | `pending_review` |
| `approve` | onboarding `pending_review` | `approved` |
| `reject` | onboarding `pending_review` | `rejected` |
| `suspend` | operational `active` | `suspended` |
| `resume` | operational `suspended` | `active` |
| `blacklist` | operational `active` or `suspended` | `blacklisted` |

Approval must verify all active required qualification types have a verified, non-expired document. Blacklist is irreversible in Phase 0. A future unblacklist process requires a separately approved design.

Return:

```json
{
  "status": "updated",
  "idempotent": false,
  "supplier": {},
  "version": 2
}
```

Conflict statuses are `supplier_not_found`, `state_conflict`, and `version_conflict`.

- [ ] **Step 4: Implement tenant transitions and rollout commands**

`create_tenant_supplier` must:

1. Verify the tenant module is enabled.
2. Verify the supplier onboarding status is `approved`.
3. Reject platform-blacklisted suppliers.
4. Enforce `(tenant_id, supplier_id)` uniqueness.
5. Start at `evaluating`.
6. Append a command event atomically.

Allowed relationship transitions:

| Action | From | To |
| --- | --- | --- |
| `activate` | `evaluating` or `suspended` | `active` |
| `suspend` | `active` | `suspended` |
| `terminate` | `evaluating`, `active`, or `suspended` | `terminated` |
| `blacklist` | `evaluating`, `active`, or `suspended` | `blacklisted` |

Tenant blacklist affects only that tenant. No transition may modify `suppliers.operational_status`.

- [ ] **Step 5: Implement derived eligibility**

`get_tenant_supplier_order_eligibility` accepts tenant ID, tenant-supplier ID, and `p_checked_at`. It must return all blocking reasons, not only the first.

Qualification logic:

- Select active qualification types applicable to the supplier type.
- Ignore types where `blocks_new_orders = false`.
- A type is valid only if at least one qualification is `verified`, `valid_from <= checked date`, and `valid_until IS NULL OR valid_until >= checked date`.
- Return `required_qualification_missing` when no verified document exists.
- Return `required_qualification_expired` when a verified document exists but all are past `valid_until`.

Contract logic:

- Check contracts only when `require_active_contract_for_new_order = true`.
- A contract is valid only when lifecycle is `active` and the checked date lies within its validity range.

- [ ] **Step 6: Seed permissions with least privilege**

Grant all five platform permissions to the global `platform_admin` role where `tenant_id IS NULL`.

Grant only:

- `supplier.view`
- `supplier.manage`
- `supplier.contract.manage`

to tenant `system_admin` roles. Do not grant supplier permissions to every employee or finance role.

- [ ] **Step 7: Add stable error and audit action codes**

Add:

```ts
SUPPLIER_NOT_FOUND
SUPPLIER_STATE_CONFLICT
SUPPLIER_VERSION_CONFLICT
SUPPLIER_IDEMPOTENCY_CONFLICT
SUPPLIER_MODULE_DISABLED
TENANT_SUPPLIER_NOT_FOUND
TENANT_SUPPLIER_STATE_CONFLICT
SUPPLIER_ORDER_NOT_ELIGIBLE
SUPPLIER_CATALOG_CONFLICT
```

Extend `PlatformAuditLogActionSchema` with explicit supplier actions. Update the existing schema test so the list remains locked.

- [ ] **Step 8: Verify and commit**

```bash
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts apps/api/src/schema/tenant-onboarding.test.ts
bun test packages/domain/src/permission.test.ts
git diff --check
git add supabase/migrations/20260723143000_create_supplier_foundation_commands.sql supabase/migrations/20260723144000_seed_supplier_foundation_permissions.sql apps/api/src/services/supplier-foundation-migration-contract.test.ts apps/api/src/errors/error-codes.ts apps/api/src/schema/platform-audit-logs.ts apps/api/src/schema/tenant-onboarding.test.ts
git commit -m "feat(supplier): add atomic foundation commands"
```

---

## Task 6: Lock API Validation Schemas

**Files:**

- Create: `apps/api/src/schema/platform-suppliers.ts`
- Create: `apps/api/src/schema/tenant-suppliers.ts`
- Create: `apps/api/src/schema/supplier-catalog.ts`
- Create: `apps/api/src/schema/supplier-foundation.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover:

- Defaults `page=1`, `pageSize=20`.
- Rejects `pageSize=101`.
- Trims keyword and limits it to 80 characters.
- Rejects invalid UUIDs.
- Rejects state fields in generic PATCH bodies.
- Requires `expected_version` to be a positive integer.
- Requires a nonblank reason for reject, suspend, terminate, and blacklist.
- Validates ISO date order for qualifications and contracts.
- Validates currency as three uppercase letters.
- Validates `credit_limit_minor` as a nonnegative safe integer.
- Validates category depth and unit conversion factors.

- [ ] **Step 2: Verify RED**

```bash
bun test apps/api/src/schema/supplier-foundation.test.ts
```

- [ ] **Step 3: Add shared pagination and command schemas**

Reuse `PaginationQuerySchema` from `apps/api/src/schema/request.ts`.

Every list query extends it. Every command body uses:

```ts
export const SupplierCommandSchema = z.object({
  expected_version: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();
```

Create distinct action schemas where reason is required. Do not accept `onboarding_status`, `operational_status`, `relationship_status`, or `lifecycle_status` in generic patch schemas.

- [ ] **Step 4: Export inferred request types**

Export types used by repositories/services. Keep database record parsing in repositories rather than the controller.

- [ ] **Step 5: Verify and commit**

```bash
bun test apps/api/src/schema/supplier-foundation.test.ts
bun run api:typecheck
git add apps/api/src/schema/platform-suppliers.ts apps/api/src/schema/tenant-suppliers.ts apps/api/src/schema/supplier-catalog.ts apps/api/src/schema/supplier-foundation.test.ts
git commit -m "feat(supplier): validate foundation api contracts"
```

---

## Task 7: Build the Platform Supplier Repository and Service with TDD

**Files:**

- Create: `apps/api/src/repositories/platform-suppliers.ts`
- Create: `apps/api/src/repositories/platform-suppliers.test.ts`
- Create: `apps/api/src/services/platform-suppliers.ts`
- Create: `apps/api/src/services/platform-suppliers.test.ts`

- [ ] **Step 1: Write repository tests**

Use a real Supabase client with a fetch stub, as in `tenant-service-providers.test.ts`. Assert:

- List uses exact count and `.range(start, end)`.
- Page size is never greater than 100.
- Only list columns are selected.
- Keyword is sanitized before an `or` filter.
- Detail collections are individually paginated.
- Qualification-health rows are fetched in one bounded query, not one query per supplier.
- RPC names and request payloads exactly match the migration.

- [ ] **Step 2: Verify RED**

```bash
bun test apps/api/src/repositories/platform-suppliers.test.ts
```

- [ ] **Step 3: Implement the repository port**

Expose only:

```ts
export interface PlatformSuppliersRepositoryPort {
  listSuppliers(query: PlatformSupplierListQuery): Promise<PlatformSupplierPage>;
  findSupplierById(id: string): Promise<PlatformSupplierDetail | null>;
  listQualificationTypes(query: SupplierQualificationTypeListQuery): Promise<SupplierQualificationTypePage>;
  createQualificationType(input: SupplierQualificationTypeCreateRecord): Promise<SupplierQualificationType>;
  updateQualificationType(input: SupplierQualificationTypeUpdateRecord): Promise<SupplierQualificationType>;
  createSupplier(input: PlatformSupplierCreateCommand): Promise<SupplierMutationResult>;
  updateSupplier(input: PlatformSupplierUpdateCommand): Promise<SupplierMutationResult>;
  mutateSupplier(input: PlatformSupplierLifecycleCommand): Promise<SupplierMutationResult>;
  listQualifications(input: SupplierChildPageQuery): Promise<SupplierQualificationPage>;
  createQualification(input: SupplierQualificationCreateRecord): Promise<SupplierQualification>;
  updateQualification(input: SupplierQualificationUpdateRecord): Promise<SupplierQualification>;
  reviewQualification(input: SupplierQualificationReviewCommand): Promise<SupplierMutationResult>;
  listServiceRegions(input: SupplierChildPageQuery): Promise<SupplierServiceRegionPage>;
  upsertServiceRegion(input: SupplierServiceRegionWrite): Promise<SupplierServiceRegion>;
  listAddresses(input: SupplierChildPageQuery): Promise<SupplierAddressPage>;
  upsertAddress(input: SupplierAddressWrite): Promise<SupplierAddress>;
  listContacts(input: SupplierChildPageQuery): Promise<SupplierContactPage>;
  upsertContact(input: SupplierContactWrite): Promise<SupplierContact>;
  listEvents(input: SupplierEventPageQuery): Promise<SupplierEventPage>;
  getTenantSupplierSettings(tenantId: string): Promise<TenantSupplierSettings | null>;
  setTenantSupplierSettings(input: PlatformTenantSupplierSettingsCommand): Promise<TenantSupplierSettings>;
}
```

Parse every row through Zod. Wrap Supabase failures with `Errors.dbError`.

- [ ] **Step 4: Write service tests**

Cover:

- Platform identity is required.
- `view`, `manage`, `review`, and `blacklist` permissions are separate.
- Submit rejects missing required qualification.
- Approval delegates to the atomic RPC.
- A platform blacklist does not mutate tenant relationship rows.
- Qualification review checks supplier ownership.
- Qualification-type writes validate applicable supplier types, warning days, and blocking rules.
- Service-region writes verify that the administrative region exists and that its stored level matches the selected level.
- Module enable is platform-only.
- Best-effort audit uses explicit action, resource type, resource ID, label, and state metadata.

- [ ] **Step 5: Implement the service**

The service constructor must accept repository and audit dependencies for unit tests. It maps RPC statuses to:

- `404 SUPPLIER_NOT_FOUND`
- `409 SUPPLIER_STATE_CONFLICT`
- `409 SUPPLIER_VERSION_CONFLICT`
- `409 SUPPLIER_IDEMPOTENCY_CONFLICT`

Do not catch and hide domain errors.

- [ ] **Step 6: Verify and commit**

```bash
bun test apps/api/src/repositories/platform-suppliers.test.ts apps/api/src/services/platform-suppliers.test.ts
bun run api:typecheck
git add apps/api/src/repositories/platform-suppliers.ts apps/api/src/repositories/platform-suppliers.test.ts apps/api/src/services/platform-suppliers.ts apps/api/src/services/platform-suppliers.test.ts
git commit -m "feat(supplier): add platform supplier service"
```

---

## Task 8: Build Tenant Supplier Relationships and Eligibility with TDD

**Files:**

- Create: `apps/api/src/repositories/tenant-suppliers.ts`
- Create: `apps/api/src/repositories/tenant-suppliers.test.ts`
- Create: `apps/api/src/services/tenant-suppliers.ts`
- Create: `apps/api/src/services/tenant-suppliers.test.ts`

- [ ] **Step 1: Write repository tests**

Assert:

- Every tenant query receives tenant ID from the service input.
- Lists use exact count and range.
- Directory search calls `list_available_suppliers_for_tenant` and does not fetch all linked IDs.
- Detail projection excludes other tenants’ relationship and contract rows.
- Eligibility calls one RPC.
- Contracts and events are paginated.
- No list uses `select("*")`.

- [ ] **Step 2: Write service tests**

Cover:

- `accessPolicy.assertTenantContext` and `assertPermission`.
- Module-disabled reads return `SUPPLIER_MODULE_DISABLED`.
- Tenant ID is always taken from `AuthContext`, never the request body.
- Linking an unapproved, suspended, or blacklisted platform supplier fails.
- Tenant blacklist does not alter the platform supplier.
- Active relationship still becomes ineligible when a required qualification expires.
- Expired qualification does not block contract maintenance or existing-order closeout services.
- Contract writes verify the relationship belongs to the current tenant.
- Contract policy can be updated by `supplier.manage`; `module_enabled` cannot.

- [ ] **Step 3: Implement repository and service**

Expose:

```ts
export interface TenantSuppliersRepositoryPort {
  getSettings(tenantId: string): Promise<TenantSupplierSettings | null>;
  updateContractPolicy(input: TenantSupplierContractPolicyCommand): Promise<TenantSupplierSettings>;
  listRelationships(input: TenantSupplierListInput): Promise<TenantSupplierPage>;
  listDirectory(input: TenantSupplierDirectoryInput): Promise<SupplierDirectoryPage>;
  findRelationship(input: TenantOwnedId): Promise<TenantSupplierDetail | null>;
  createRelationship(input: TenantSupplierCreateCommand): Promise<TenantSupplierMutationResult>;
  updateRelationship(input: TenantSupplierUpdateCommand): Promise<TenantSupplierMutationResult>;
  mutateRelationship(input: TenantSupplierLifecycleCommand): Promise<TenantSupplierMutationResult>;
  getOrderEligibility(input: TenantOwnedId): Promise<SupplierOrderEligibility>;
  listContracts(input: TenantSupplierChildPageInput): Promise<SupplierContractPage>;
  createContract(input: SupplierContractCreateCommand): Promise<SupplierContract>;
  updateContract(input: SupplierContractUpdateCommand): Promise<SupplierContract>;
  mutateContract(input: SupplierContractLifecycleCommand): Promise<SupplierContractMutationResult>;
  listEvents(input: TenantSupplierChildPageInput): Promise<SupplierEventPage>;
}
```

Add a public service method:

```ts
async assertCanCreatePurchaseOrder(
  authContext: AuthContext,
  tenantSupplierId: string,
): Promise<void>
```

It calls the same eligibility query and throws `SUPPLIER_ORDER_NOT_ELIGIBLE` with the full blocking-reasons array. Phase 1 must reuse it.

- [ ] **Step 4: Verify and commit**

```bash
bun test apps/api/src/repositories/tenant-suppliers.test.ts apps/api/src/services/tenant-suppliers.test.ts
bun run api:typecheck
git add apps/api/src/repositories/tenant-suppliers.ts apps/api/src/repositories/tenant-suppliers.test.ts apps/api/src/services/tenant-suppliers.ts apps/api/src/services/tenant-suppliers.test.ts
git commit -m "feat(supplier): add tenant relationship service"
```

---

## Task 9: Build Standard Catalog Services with TDD

**Files:**

- Create: `apps/api/src/repositories/supplier-catalog.ts`
- Create: `apps/api/src/repositories/supplier-catalog.test.ts`
- Create: `apps/api/src/services/supplier-catalog.ts`
- Create: `apps/api/src/services/supplier-catalog.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- Platform lists and tenant read-only lists are paginated.
- Category queries are by `parent_id`; they never return an unbounded full tree.
- Tenant lists include active rows only.
- Platform lists may filter active/inactive.
- Code uniqueness conflicts map to `SUPPLIER_CATALOG_CONFLICT`.
- Category writes prevent cycles through the database constraint.
- Disabling a category with active children fails.
- Derived units must reference an active base unit.
- Only `platform.catalog.manage` can write.

- [ ] **Step 2: Implement exact service boundary**

Use one repository and one service. The service methods receive either platform or tenant auth context and expose separate read/write methods; do not create duplicate catalog logic.

List result:

```ts
type CatalogPage<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
```

- [ ] **Step 3: Verify and commit**

```bash
bun test apps/api/src/repositories/supplier-catalog.test.ts apps/api/src/services/supplier-catalog.test.ts
bun run api:typecheck
git add apps/api/src/repositories/supplier-catalog.ts apps/api/src/repositories/supplier-catalog.test.ts apps/api/src/services/supplier-catalog.ts apps/api/src/services/supplier-catalog.test.ts
git commit -m "feat(supplier): add standard catalog service"
```

---

## Task 10: Expose Explicit Platform and Tenant Routes

**Files:**

- Create all four controller directories and route tests listed in the file map.
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write route-registration tests first**

Platform supplier routes:

```text
GET    /platform/suppliers
POST   /platform/suppliers
GET    /platform/supplier-qualification-types
POST   /platform/supplier-qualification-types
PATCH  /platform/supplier-qualification-types/:id
GET    /platform/suppliers/:id
PATCH  /platform/suppliers/:id
POST   /platform/suppliers/:id/submit
POST   /platform/suppliers/:id/approve
POST   /platform/suppliers/:id/reject
POST   /platform/suppliers/:id/suspend
POST   /platform/suppliers/:id/resume
POST   /platform/suppliers/:id/blacklist
GET    /platform/suppliers/:id/qualifications
POST   /platform/suppliers/:id/qualifications
PATCH  /platform/suppliers/:id/qualifications/:qualificationId
POST   /platform/suppliers/:id/qualifications/:qualificationId/verify
POST   /platform/suppliers/:id/qualifications/:qualificationId/reject
GET    /platform/suppliers/:id/service-regions
POST   /platform/suppliers/:id/service-regions
PATCH  /platform/suppliers/:id/service-regions/:regionId
GET    /platform/suppliers/:id/addresses
POST   /platform/suppliers/:id/addresses
PATCH  /platform/suppliers/:id/addresses/:addressId
GET    /platform/suppliers/:id/contacts
POST   /platform/suppliers/:id/contacts
PATCH  /platform/suppliers/:id/contacts/:contactId
GET    /platform/suppliers/:id/events
GET    /platform/tenant-supplier-settings/:tenantId
PATCH  /platform/tenant-supplier-settings/:tenantId
```

Tenant routes:

```text
GET    /supplier-settings
PATCH  /supplier-settings/contract-policy
GET    /suppliers
GET    /suppliers/directory
POST   /suppliers
GET    /suppliers/:id
PATCH  /suppliers/:id
POST   /suppliers/:id/activate
POST   /suppliers/:id/suspend
POST   /suppliers/:id/terminate
POST   /suppliers/:id/blacklist
GET    /suppliers/:id/order-eligibility
GET    /suppliers/:id/contracts
POST   /suppliers/:id/contracts
PATCH  /suppliers/:id/contracts/:contractId
POST   /suppliers/:id/contracts/:contractId/activate
POST   /suppliers/:id/contracts/:contractId/terminate
GET    /suppliers/:id/events
```

Catalog routes:

```text
GET    /platform/catalog/categories
POST   /platform/catalog/categories
PATCH  /platform/catalog/categories/:id
GET    /platform/catalog/brands
POST   /platform/catalog/brands
PATCH  /platform/catalog/brands/:id
GET    /platform/catalog/units
POST   /platform/catalog/units
PATCH  /platform/catalog/units/:id
GET    /catalog/categories
GET    /catalog/brands
GET    /catalog/units
```

- [ ] **Step 2: Verify RED**

```bash
bun test apps/api/src/controllers/platform-suppliers/routes.test.ts apps/api/src/controllers/tenant-suppliers/routes.test.ts apps/api/src/controllers/platform-supplier-catalog/routes.test.ts apps/api/src/controllers/supplier-catalog/routes.test.ts
```

- [ ] **Step 3: Implement HTTP-only controllers**

Every handler must:

1. Get required platform or tenant auth context.
2. Parse params/query/body with the corresponding Zod schema.
3. Require a valid `Idempotency-Key` only for create and command routes.
4. Call exactly one service method.
5. Return `ResponseHandler.success`.

Do not access Supabase, calculate status, or inspect permission arrays in controllers.

- [ ] **Step 4: Register controllers**

Import the four controller instances in `apps/api/src/routes/index.ts` and call `registerExtraRoutes(app)` for each. Do not use the generic resource factory for lifecycle resources.

- [ ] **Step 5: Verify and commit**

```bash
bun test apps/api/src/controllers/platform-suppliers/routes.test.ts apps/api/src/controllers/tenant-suppliers/routes.test.ts apps/api/src/controllers/platform-supplier-catalog/routes.test.ts apps/api/src/controllers/supplier-catalog/routes.test.ts
bun run api:check
git add apps/api/src/controllers/platform-suppliers apps/api/src/controllers/tenant-suppliers apps/api/src/controllers/platform-supplier-catalog apps/api/src/controllers/supplier-catalog apps/api/src/routes/index.ts
git commit -m "feat(supplier): expose foundation api routes"
```

---

## Task 11: Build the Platform Supplier Admin Workspace

**Files:**

- Create: `apps/admin/app/(console)/platform/suppliers/page.tsx`
- Create: `apps/admin/app/(console)/platform/suppliers/loading.tsx`
- Create: `apps/admin/components/platform-suppliers/*`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Confirm installed shadcn APIs**

```bash
pnpm --dir apps/admin dlx shadcn@latest info --json
pnpm --dir apps/admin dlx shadcn@latest docs dialog field tabs table badge button input select textarea
```

Expected: commands describe already installed components. Do not add a dependency.

- [ ] **Step 2: Write failing source-contract tests**

Assert:

- Menu label is `供应商管理`, route `/platform/suppliers`, permission `platform.supplier.view`.
- Page has peer views `供应商列表` and `资质类型`; the latter requires `platform.supplier.manage`.
- Page uses server pagination normalization.
- Filters include keyword, onboarding, operational, and qualification health.
- Table columns include supplier, type, admission, operation, qualification health, and updated time.
- Detail uses peer tabs: `基本资料`, `资质`, `服务区域`, `联系人与地址`, `操作记录`.
- Lifecycle actions use explicit buttons and `Idempotency-Key`.
- There is no generic status `<select>`.
- Conflict UI offers refresh and retry.
- Qualification-type configuration is reachable from the supplier page and is permission-gated.

- [ ] **Step 3: Build the list page**

Use a quiet operational layout:

- One page title row.
- One compact filter toolbar.
- One bordered table surface.
- One pagination footer.
- No nested decorative cards.
- Status uses existing `Badge` variants and text labels.

Fetch only the current page from `/platform/suppliers?page=...&pageSize=...`.

- [ ] **Step 4: Build qualification-type configuration**

Use a peer page view rather than a nested card. The paginated table columns are code, name, applicable supplier types, warning days, required, blocks new orders, status, and sort. Create/edit dialogs use optimistic version; disabling a required type never deletes historical qualifications.

- [ ] **Step 5: Build the detail workflow**

Load each child tab on demand with `pageSize=10`. Do not preload all qualifications, regions, contacts, addresses, and events for every list row.

Actions:

- Draft/rejected: edit and submit.
- Pending review: approve or reject.
- Active: suspend or blacklist.
- Suspended: resume or blacklist.
- Blacklisted: read-only.

Qualification verify/reject actions show the computed health after refresh.

- [ ] **Step 6: Verify and commit**

```bash
bun test apps/admin/components/platform-suppliers
pnpm --dir apps/admin check
git add 'apps/admin/app/(console)/platform/suppliers' apps/admin/components/platform-suppliers apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): manage platform suppliers"
```

---

## Task 12: Build Tenant Supplier Workspace and Rollout Controls

**Files:**

- Create: `apps/admin/app/(console)/suppliers/page.tsx`
- Create: `apps/admin/app/(console)/suppliers/loading.tsx`
- Create: `apps/admin/components/suppliers/*`
- Create: `apps/admin/components/platform-tenants/tenant-supplier-settings-card.tsx`
- Create: `apps/admin/components/suppliers/suppliers-page.test.ts`
- Modify: `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Write failing source-contract tests**

Assert:

- Tenant menu has a `采购供应` group and `合作供应商` item.
- Menu permission is `supplier.view`.
- Disabled module shows a clear read-only empty state.
- Platform tenant detail has an enable/disable supplier-module control gated by `platform.supplier.manage`.
- Tenant list columns include supplier, relationship, new-order eligibility, settlement terms, contract health, and tenant owner.
- Add dialog searches the paginated directory endpoint.
- Relationship status changes use explicit commands.
- Cost-price fields do not appear in Phase 0.

- [ ] **Step 2: Add platform rollout control**

The platform tenant detail card:

- Fetches `/platform/tenant-supplier-settings/:tenantId`.
- Defaults missing settings to disabled.
- Requires a reason when disabling.
- Sends `expected_version` and an `Idempotency-Key`.
- Shows module enabled time and contract policy.

- [ ] **Step 3: Build tenant supplier page**

When enabled:

- Show a compact paginated relationship table.
- “添加合作供应商” searches `/suppliers/directory`.
- Link creation starts at `evaluating`.
- Detail tabs are `合作设置`, `合同`, `准入与资质`, `服务区域`, `操作记录`.
- The platform supplier fields are read-only.
- Tenant commercial terms and owner are editable with optimistic version.
- Eligibility shows every blocking reason in plain Chinese.

When disabled:

- Do not issue list or directory requests.
- Show “供应商模块尚未启用” and no mutation buttons.

- [ ] **Step 4: Verify and commit**

```bash
bun test apps/admin/components/suppliers
pnpm --dir apps/admin check
git add 'apps/admin/app/(console)/suppliers' apps/admin/components/suppliers apps/admin/components/platform-tenants/tenant-supplier-settings-card.tsx 'apps/admin/app/(console)/platform/tenants/[id]/page.tsx' apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): manage tenant supplier relationships"
```

---

## Task 13: Build the Platform Standard Catalog Admin

**Files:**

- Create: `apps/admin/app/(console)/platform/catalog/page.tsx`
- Create: `apps/admin/app/(console)/platform/catalog/loading.tsx`
- Create: `apps/admin/components/supplier-catalog/*`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Write failing source-contract tests**

Assert:

- Platform configuration menu contains `供应标准目录`.
- Permission is `platform.catalog.manage`.
- Peer tabs are `标准类目`, `品牌`, and `单位`.
- Each tab uses server pagination.
- Category browsing requests one parent’s children at a time.
- Unit dialog distinguishes base and derived units.
- Disable actions use optimistic version and do not delete rows.

- [ ] **Step 2: Implement compact catalog management**

Category columns:

- Code
- Name
- Level
- Parent
- Status
- Sort
- Updated time

Brand columns:

- Code
- Brand
- Legal name
- Status
- Sort
- Updated time

Unit columns:

- Code
- Name/symbol
- Base unit
- Conversion factor
- Status
- Updated time

Use dialogs for create/edit, existing `Field` primitives for forms, and explicit enable/disable actions.

- [ ] **Step 3: Verify and commit**

```bash
bun test apps/admin/components/supplier-catalog
pnpm --dir apps/admin check
git add 'apps/admin/app/(console)/platform/catalog' apps/admin/components/supplier-catalog apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): manage supplier standard catalog"
```

---

## Task 14: Apply Migrations Safely and Generate Database Types

**Files:**

- Modify mechanically: `apps/api/src/types/database.ts`

- [ ] **Step 1: Confirm exact pending migrations**

```bash
supabase migration list
```

Expected: the five supplier migrations appear local-only and all earlier Local/Remote versions align.

- [ ] **Step 2: Run a dry run against the explicitly configured database**

```bash
/bin/zsh -lc 'set -a && source /Users/leefo/Public/work/gooes/.env && set +a && supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"'
```

Expected: only the five supplier migrations are pending. If any unrelated migration is pending, stop and resolve release ordering before applying.

- [ ] **Step 3: Apply the migration group**

```bash
/bin/zsh -lc 'set -a && source /Users/leefo/Public/work/gooes/.env && set +a && supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"'
```

- [ ] **Step 4: Verify Local/Remote alignment**

```bash
supabase migration list
```

Expected: all five versions align.

- [ ] **Step 5: Generate types mechanically**

```bash
/bin/zsh -lc 'supabase gen types typescript --linked > apps/api/src/types/database.ts'
```

Do not manually repair the generated file.

- [ ] **Step 6: Verify generated symbols**

```bash
rg -n "suppliers:|tenant_suppliers:|supplier_qualifications:|catalog_categories:|get_tenant_supplier_order_eligibility" apps/api/src/types/database.ts
bun run api:typecheck
```

Expected: all symbols exist and typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types/database.ts
git commit -m "chore(supplier): generate foundation database types"
```

### Rollback rule

Before business data exists, a reviewed forward rollback migration may revoke functions/permissions and drop Phase 0 objects in reverse dependency order.

After any supplier, relationship, contract, or command event exists:

1. Disable the tenant module through the platform command.
2. Stop new supplier writes.
3. Export the new domain data.
4. Keep tables read-only.
5. Use a forward migration; do not delete business or audit rows.

Never run manual remote DDL/DML to “fix” a failed migration.

---

## Task 15: Add API Documentation and End-to-End Smoke

**Files:**

- Create: `docs/supplier/2026-07-23-supplier-foundation-api.md`
- Create: `apps/admin/e2e/supplier-foundation-smoke.spec.ts`

- [ ] **Step 1: Document exact API contracts**

The document must include:

- Platform, tenant, and catalog route tables.
- Auth identity and permission per route.
- Request/response fields.
- Pagination defaults and maximum.
- All lifecycle actions and allowed states.
- Stable error codes.
- Idempotency and optimistic-version behavior.
- Qualification-health and order-eligibility semantics.
- Tenant isolation rules.
- Phase 0 non-goals.
- Explicit statement that Orange has no Phase 0 code change.

- [ ] **Step 2: Add Playwright smoke**

Use existing login helpers and environment variables. Cover:

Platform Admin:

1. Open supplier list.
2. Open create dialog.
3. Verify status is not directly editable.
4. Open standard catalog and switch across three tabs.
5. Open a tenant detail and locate supplier rollout settings.

Tenant Admin:

1. Open `/suppliers`.
2. Observe either the disabled state or the supplier table.
3. If enabled, open the add-supplier dialog and verify paginated search.
4. Verify cost-price fields are absent.

The smoke must not create or blacklist a real supplier.

- [ ] **Step 3: Run smoke against local services**

Start API and Admin only after static checks pass:

```bash
bun run api:dev
bun run admin:dev
```

Then:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3010 pnpm --dir apps/admin exec playwright test e2e/supplier-foundation-smoke.spec.ts --project=chromium
```

Expected: PASS.

- [ ] **Step 4: Verify RAG document selection**

```bash
bun run sync:rag-docs:dry-run
```

Expected: the supplier API document is selected and no unrelated generated assets are included.

- [ ] **Step 5: Commit**

```bash
git add docs/supplier/2026-07-23-supplier-foundation-api.md apps/admin/e2e/supplier-foundation-smoke.spec.ts
git commit -m "docs(supplier): add foundation api handoff"
```

---

## Task 16: Performance, Security, and Release Verification

**Files:** no new production files unless a verified defect requires a separately scoped fix.

- [ ] **Step 1: Run all focused tests**

```bash
bun test packages/domain/src/supplier.test.ts packages/domain/src/permission.test.ts
bun test apps/api/src/services/supplier-foundation-migration-contract.test.ts apps/api/src/schema/supplier-foundation.test.ts
bun test apps/api/src/repositories/platform-suppliers.test.ts apps/api/src/repositories/tenant-suppliers.test.ts apps/api/src/repositories/supplier-catalog.test.ts
bun test apps/api/src/services/platform-suppliers.test.ts apps/api/src/services/tenant-suppliers.test.ts apps/api/src/services/supplier-catalog.test.ts
bun test apps/api/src/controllers/platform-suppliers/routes.test.ts apps/api/src/controllers/tenant-suppliers/routes.test.ts apps/api/src/controllers/platform-supplier-catalog/routes.test.ts apps/api/src/controllers/supplier-catalog/routes.test.ts
bun test apps/admin/components/platform-suppliers apps/admin/components/suppliers apps/admin/components/supplier-catalog
```

- [ ] **Step 2: Run workspace checks**

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
bun --cwd packages/domain run build
bun run check:file-size
bun run check:permission-boundaries
bun run audit:supabase-writes
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Verify database security**

Using the Supabase database query tool, verify:

```sql
SELECT
  c.relname,
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'suppliers',
    'supplier_qualifications',
    'supplier_service_regions',
    'supplier_addresses',
    'supplier_contacts',
    'tenant_supplier_settings',
    'tenant_suppliers',
    'supplier_contracts',
    'supplier_command_events',
    'catalog_categories',
    'catalog_brands',
    'catalog_units'
  )
ORDER BY c.relname;
```

Expected: both RLS flags are true for every table.

Verify command grants:

```sql
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'create_platform_supplier',
    'mutate_platform_supplier',
    'create_tenant_supplier',
    'mutate_tenant_supplier',
    'get_tenant_supplier_order_eligibility'
  )
ORDER BY routine_name, grantee;
```

Expected: executable application grant is `service_role`; no `PUBLIC`, `anon`, or `authenticated`.

- [ ] **Step 4: Verify tenant isolation**

Use two test tenants and one approved supplier:

1. Enable the module for both tenants.
2. Link the same supplier to both.
3. Give each relationship different terms.
4. Confirm each tenant API sees only its relationship and contracts.
5. Suspend Tenant A’s relationship.
6. Confirm Tenant B remains active.
7. Platform-blacklist the supplier.
8. Confirm both become ineligible for new orders while their relationship records remain unchanged.

Remove only the test fixtures created for this smoke through explicit fixture-cleanup commands. Do not delete non-test rows.

- [ ] **Step 5: Verify pagination and plans**

For platform suppliers, tenant relationships, directory search, contracts, categories, brands, units, and command events:

- Request `page=1&pageSize=20`.
- Request `page=2&pageSize=20`.
- Confirm stable ordering includes `id` as a tie-breaker.
- Confirm `pageSize=101` returns validation error.
- Confirm selected columns are bounded.

Run `EXPLAIN (ANALYZE, BUFFERS)` against staging fixtures for:

1. Platform supplier queue by onboarding and operational status.
2. Tenant relationship list by tenant and status.
3. Available-supplier directory `NOT EXISTS` query.
4. Qualification eligibility lookup.
5. Active-contract lookup.

Expected: the named Phase 0 indexes appear in the plans; no sequential scan is accepted for a populated high-cardinality table without documented evidence.

- [ ] **Step 6: Perform final review**

Confirm:

- No list endpoint is unbounded.
- No repository depends on request-supplied tenant ID.
- No controller accesses Supabase.
- No service returns another tenant’s contract or terms.
- No Admin DTO contains cost-price or owner-price fields.
- No generic PATCH can change a lifecycle state.
- No `throw new Error()` exists in new API production code.
- No new dependency was added.
- No Orange file changed.
- No unrelated user change is staged.

```bash
git status --short
git diff --stat "$(git merge-base main HEAD)"..HEAD
git -C /Users/leefo/Public/work/orange status --porcelain=v1 > /tmp/gooes-supplier-orange-status-after.txt
diff -u /tmp/gooes-supplier-orange-status-before.txt /tmp/gooes-supplier-orange-status-after.txt
if git diff --name-only "$(git merge-base main HEAD)"..HEAD | rg -q '^\\.superpowers/'; then exit 1; fi
```

- [ ] **Step 7: Request code review**

Invoke `requesting-code-review`. Resolve findings with `receiving-code-review`, then rerun the affected focused tests and the full verification set.

- [ ] **Step 8: Finish the branch**

Invoke `verification-before-completion`, then `finishing-a-development-branch`. Do not merge, push, or delete the worktree until the user chooses an integration option.

---

## Phase 0 Acceptance Checklist

- [ ] One supplier can be linked to multiple tenants with different terms and contracts.
- [ ] Platform onboarding, operation, qualification health, and tenant relationship remain independent dimensions.
- [ ] Platform blacklist blocks new-order eligibility for every tenant without rewriting tenant relationships.
- [ ] Tenant suspend/blacklist affects only that tenant.
- [ ] Missing or expired required qualification appears in eligibility and blocks future new-order creation.
- [ ] Existing-order closeout is not blocked by the eligibility service contract.
- [ ] Tenant module rollout is default-deny and platform-managed.
- [ ] All lists paginate with default 20 and maximum 100.
- [ ] All state changes use explicit actions, optimistic version, and idempotency keys.
- [ ] Every new table has indexes, forced RLS, and migration ownership.
- [ ] Platform and tenant Admin workflows are understandable without a generic status editor.
- [ ] Standard categories, brands, and units are independently manageable.
- [ ] Focused tests, API checks, Admin checks/build, database security checks, and smoke tests pass.
- [ ] Orange remains unchanged.

## Follow-on Plan Boundary

Only after Phase 0 is implemented and accepted, create the next plan:

`docs/superpowers/plans/2026-07-23-supplier-procurement-phase-1.md`

Phase 1 starts with SKU, base supply price, urgent requisition, budget precheck, purchase order, single-batch shipment/receipt, payable event, payment request/payment, supplier self-service, and buyer proxy entry. It must reuse:

- `tenant_suppliers`
- `supplier_service_regions`
- `assertCanCreatePurchaseOrder`
- standard category/brand/unit IDs
- explicit lifecycle commands
- idempotency and command-event conventions
