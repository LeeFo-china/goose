# Supplier Automatic Cost Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move procurement cost classification from mini-program purchasers to tenant-managed catalog defaults, with optional product overrides and server-side resolution.

**Architecture:** Store tenant-scoped classification rules separately from shared catalog records. Resolve the effective cost category in one database query with precedence `product override > category default > nearest ancestor default`; expose that result in the purchase catalog and resolve it again when saving drafts so clients cannot forge accounting facts. Existing purchase item snapshots remain unchanged.

**Tech Stack:** Supabase PostgreSQL migrations/RPC, Fastify + TypeScript + Zod, Next.js + shadcn/ui, Bun tests.

---

### Task 1: Cost classification persistence and resolver

**Files:**
- Create: `supabase/migrations/20260902100000_supplier_catalog_cost_category_rules.sql`
- Create: `apps/api/src/services/supplier-cost-category-rules-migration-contract.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Assert that the migration creates `tenant_catalog_cost_category_rules`, enforces exactly one of `catalog_category_id` and `supplier_product_id`, creates tenant-scoped unique indexes, validates tenant-visible catalog ownership, and provides a resolver with product/category/ancestor precedence.

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd apps/api && bun test src/services/supplier-cost-category-rules-migration-contract.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration**

Create the table with tenant, actor, version and timestamp fields; add composite foreign keys to `finance_cost_categories`; add RLS/service-role grants consistent with supplier catalog tables. Add bounded indexes and a stable resolver returning:

```sql
cost_category_id uuid,
cost_category_code text,
cost_category_name text,
source text
```

The resolver must return `product`, `category`, `ancestor`, or no row. It must reject cross-tenant private catalog records and inactive finance categories.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `cd apps/api && bun test src/services/supplier-cost-category-rules-migration-contract.test.ts`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260902100000_supplier_catalog_cost_category_rules.sql apps/api/src/services/supplier-cost-category-rules-migration-contract.test.ts
git commit -m "feat(supplier): 增加商品成本归类规则"
```

### Task 2: Tenant rule management API

**Files:**
- Create: `apps/api/src/schema/supplier-cost-category-rules.ts`
- Create: `apps/api/src/repositories/supplier-cost-category-rules.ts`
- Create: `apps/api/src/services/supplier-cost-category-rules.ts`
- Create: `apps/api/src/controllers/supplier-cost-category-rules/index.ts`
- Modify: `apps/api/src/routes/index.ts`
- Test: colocated `*.test.ts` files for schema, repository, service and routes

- [ ] **Step 1: Write failing schema and service tests**

Define strict category/product rule upsert inputs with UUID validation and `expected_version`. Verify tenant context, `supplier.catalog.manage`, active cost category, visible category/product ownership, optimistic concurrency and error-factory responses.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd apps/api && bun test src/schema/supplier-cost-category-rules.test.ts src/services/supplier-cost-category-rules.test.ts`

- [ ] **Step 3: Implement repository/service/controller**

Expose:

```text
GET /catalog/cost-category-rules?scope=category|product&page=1&pageSize=20
PUT /catalog/categories/:id/cost-category-default
PUT /supplier-products/:id/cost-category-override
DELETE /catalog/categories/:id/cost-category-default
DELETE /supplier-products/:id/cost-category-override
```

All list reads are paginated, select only required columns, and filter by tenant before paging/counting. Commands use optimistic version checks and return the saved rule.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd apps/api && bun test src/schema/supplier-cost-category-rules.test.ts src/repositories/supplier-cost-category-rules.test.ts src/services/supplier-cost-category-rules.test.ts src/controllers/supplier-cost-category-rules/routes.test.ts`

### Task 3: Purchase catalog and draft resolution

**Files:**
- Create: `supabase/migrations/20260902180000_supplier_purchase_auto_cost_category.sql`
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batch-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Modify: relevant purchase batch tests and migration contract tests

- [ ] **Step 1: Write failing purchase contract tests**

Verify catalog rows contain `default_cost_category_id`, `default_cost_category_name`, and `cost_category_source`. Verify draft items accept an omitted cost category for new clients while preserving an explicit valid category for old clients.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd apps/api && bun test src/schema/supplier-purchase-batches.test.ts src/repositories/supplier-purchase-batches.test.ts`

- [ ] **Step 3: Update the catalog and save RPCs**

Extend `resolve_supplier_purchase_batch_catalog` without changing pagination. Replace omitted item categories inside `save_supplier_purchase_batch_draft` by calling the tenant resolver, then validate and persist the resolved category snapshot. Preserve explicit categories for backward compatibility only when they are active and tenant-owned.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd apps/api && bun test src/schema/supplier-purchase-batches.test.ts src/repositories/supplier-purchase-batches.test.ts src/services/supplier-purchase-batches.test.ts`

### Task 4: Tenant admin configuration

**Files:**
- Create: `apps/admin/components/supplier-cost-category/cost-category-select.tsx`
- Create: `apps/admin/components/supplier-cost-category/supplier-cost-category-api.ts`
- Modify: `apps/admin/components/tenant-supplier-catalog/tenant-category-dialog.tsx`
- Modify: `apps/admin/components/tenant-supplier-catalog/tenant-catalog-types.ts`
- Modify: `apps/admin/components/supplier-products/supplier-product-dialog.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-types.ts`
- Test: focused admin component/data tests

- [ ] **Step 1: Write failing request and form-state tests**

Verify category forms save a default cost category and product forms display the inherited category with an optional advanced override. Internal IDs/codes must not appear in labels.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --dir apps/admin test -- supplier-cost-category`

- [ ] **Step 3: Implement compact admin controls**

Reuse existing Select/Dialog/Field components. The common path shows `随分类：主材`; an advanced action enables a product override. Category configuration is optional at category creation but clearly marked as required before the category can be purchased.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the relevant Bun/Vitest command discovered from `apps/admin/package.json`, then run `pnpm --dir apps/admin check`.

### Task 5: Mini-program handoff and verification

**Files:**
- Create: `docs/miniprogram/2026-09-02-supplier-auto-cost-category-handoff.md`

- [ ] **Step 1: Document the compatible client contract**

Tell Orange to remove the normal cost-category Picker, read the catalog default fields, omit `cost_category_id` for automatically classified items, and render a blocking “待后台归类” state only when the API returns no default. Orange remains read-only in this repository task.

- [ ] **Step 2: Run repository verification**

```bash
cd apps/api && bun test <all focused test files>
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin check
bun run api:build
pnpm --dir apps/admin build
bun run check:file-size
git diff --check
```

- [ ] **Step 3: Review migration safety**

Confirm no existing purchase snapshots are updated. Rollback consists of restoring the prior purchase RPC definitions, dropping the resolver/rule endpoints, then dropping the new rule table; no historical financial facts are deleted.
