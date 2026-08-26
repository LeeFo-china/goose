# Supplier Procurement Miniprogram Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the orange WeChat mini-program with the backend purchase-ready product and supplier purchase-batch APIs without moving pricing, supplier grouping, authorization, or order creation into the client.

**Architecture:** Add an isolated Taro subpackage and one typed service module. Pages keep local cart state, but every persisted amount, action, split preview, and final order comes from the backend; mutation retries retain the original idempotency key.

**Tech Stack:** Taro 4.1.11, React 18, TypeScript, Taroify 0.9.2, Zod 4, Zustand 5, existing orange `request()` wrapper.

---

## Ownership Boundary

This is a handoff plan for the orange team. Do not execute it from the gooes repository and do not modify `/Users/leefo/Public/work/orange` during gooes work.

Execute in this order:

1. `docs/superpowers/plans/2026-08-26-supplier-purchasable-product-command.md`
2. `docs/superpowers/plans/2026-08-26-supplier-purchase-batch-backend.md`
3. Publish a development API contract and smoke evidence.
4. The orange team executes this plan in `/Users/leefo/Public/work/orange`.

## Expected Backend Contract

- Auth: existing employee bearer token injected by `src/utils/https.ts`.
- Envelope: `{ data, message?, code?, requestId? }` with existing global error handling.
- Pagination: `{ list, pagination: { page, pageSize, total, totalPages } }`.
- Mutations: `Idempotency-Key` header, maximum 120 characters.
- Quantity and money: decimal strings; never convert persisted money to floating-point facts.
- Action visibility: use backend `actions`; client visibility is not authorization.

## File Structure In orange

- Create `src/services/supplier_procurement.ts`: API types, endpoint wrappers, and idempotency-key header helper.
- Create `src/packageProcurement/model.ts`: pure cart, pagination, action, amount-display, and error-detail transforms.
- Test `src/packageProcurement/model.test.ts` and `src/services/supplier_procurement.test.ts`.
- Create pages under `src/packageProcurement/pages/`: `batches`, `batch-edit`, `catalog`, `batch-detail`, `batch-review`, `supplier-create`, `brand-create`, `product-create`.
- Modify `src/app.config.ts`: register `packageProcurement` only after backend integration is available.
- Modify `src/pages/index/homeModel.tsx` and its tests: permission-gated procurement entries.
- Add `scripts/supplier-procurement-contract-smoke.mjs`: non-mutating schema/route contract smoke against a configured API, plus explicit opt-in mutation scenarios for development fixtures.
- Modify orange `package.json`: add `smoke:supplier-procurement:miniprogram`.

### Task 1: Typed Service Contract

**Files:**
- Create: `src/services/supplier_procurement.ts`
- Create: `src/services/supplier_procurement.test.ts`
- Modify: `src/services/index.ts`

- [ ] **Step 1: Write failing service tests**

```ts
expect(buildPurchaseBatchSaveRequest(BATCH_ID, payload, "command-key")).toEqual({
  url: `/supplier-purchase-batches/${BATCH_ID}/save-draft`,
  method: "POST",
  data: payload,
  options: { header: { "Idempotency-Key": "command-key" } },
});
```

Add URL tests for catalog pagination, items, requisitions, orders, submit, review, cancel, private supplier, brand, and purchasable product creation.

- [ ] **Step 2: Run and verify failure**

```bash
bun test src/services/supplier_procurement.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement exact DTOs and service methods**

```ts
export type PurchaseBatchDraftPayload = {
  project_id: string;
  expected_version: number;
  reason: string;
  expected_delivery_date?: string | null;
  remark?: string | null;
  items: Array<{
    supplier_sku_id: string;
    cost_category_id: string;
    quantity: string;
  }>;
};

export const SupplierProcurementService = {
  listBatches,
  getBatch,
  listItems,
  listRequisitions,
  listOrders,
  listCatalog,
  listProjectOptions,
  listCostCategories,
  saveDraft,
  submit,
  review,
  cancel,
  createPrivateSupplier,
  createBrand,
  createPurchasableProduct,
};
```

Each method calls the existing `request()` helper. Mutation wrappers accept an explicit key from the page; they never generate a new key inside a retry.

- [ ] **Step 4: Run service tests and typecheck**

```bash
bun test src/services/supplier_procurement.test.ts
pnpm run typecheck
```

Expected: service tests and typecheck pass.

- [ ] **Step 5: Commit in orange**

```bash
git add src/services/supplier_procurement.ts src/services/supplier_procurement.test.ts src/services/index.ts
git commit -m "feat(procurement): add supplier purchase batch api"
```

### Task 2: Cart And Pagination Model

**Files:**
- Create: `src/packageProcurement/model.ts`
- Create: `src/packageProcurement/model.test.ts`

- [ ] **Step 1: Write failing pure-model tests**

Test add/update/remove by `supplier_sku_id`, one-SKU uniqueness, decimal quantity validation, page merging without duplicates, split-preview replacement from the server, and permission action mapping.

```ts
expect(upsertCartItem([], item, "2.5000")).toEqual([
  { ...item, quantity: "2.5000" },
]);
expect(upsertCartItem([{ ...item, quantity: "1" }], item, "3")).toHaveLength(1);
```

- [ ] **Step 2: Run and verify failure**

```bash
bun test src/packageProcurement/model.test.ts
```

Expected: FAIL because the model is absent.

- [ ] **Step 3: Implement pure helpers**

Export `upsertCartItem`, `removeCartItem`, `mergeCatalogPage`, `validateQuantity`, `formatMoneyString`, `deriveBatchPageMode`, and `describeRevisionBlocker`. Do not calculate authoritative totals; display only server totals and supplier subtotals.

- [ ] **Step 4: Run model tests**

Expected: PASS.

- [ ] **Step 5: Commit in orange**

```bash
git add src/packageProcurement/model.ts src/packageProcurement/model.test.ts
git commit -m "feat(procurement): add purchase cart model"
```

### Task 3: Subpackage, Batch List, And Home Entry

**Files:**
- Modify: `src/app.config.ts`
- Modify: `src/pages/index/homeModel.tsx`
- Create: `src/pages/index/homeModel.test.tsx`
- Create: `src/packageProcurement/pages/batches/index.tsx`
- Create: `src/packageProcurement/pages/batches/index.scss`
- Create: `src/packageProcurement/pages/batches/index.config.ts`

- [ ] **Step 1: Write failing permission-entry tests**

Require a “采购申请” entry for `supplier.purchase-requisition.view` or `.manage`, and hide “新建采购” without `.manage`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test src/pages/index/homeModel.test.tsx
```

Expected: FAIL because procurement actions do not exist.

- [ ] **Step 3: Register the subpackage and list page**

Add:

```ts
{
  root: "packageProcurement",
  pages: [
    "pages/batches/index",
    "pages/batch-edit/index",
    "pages/catalog/index",
    "pages/batch-detail/index",
    "pages/batch-review/index",
    "pages/supplier-create/index",
    "pages/brand-create/index",
    "pages/product-create/index",
  ],
}
```

The list page loads `page=1&pageSize=20`, replaces data on pull-to-refresh, appends on `useReachBottom`, and renders status from backend values. Use server `actions.can_edit` and `actions.can_review` for row actions.

- [ ] **Step 4: Run tests, typecheck, and main-package-size check**

```bash
pnpm run typecheck
pnpm run check:weapp-main-size
```

Expected: PASS; procurement code remains in the subpackage.

- [ ] **Step 5: Commit in orange**

```bash
git add src/app.config.ts src/pages/index/homeModel.tsx src/pages/index/homeModel.test.tsx src/packageProcurement/pages/batches
git commit -m "feat(procurement): add purchase batch workspace"
```

### Task 4: Cross-Supplier Catalog And Draft Editor

**Files:**
- Create: `src/packageProcurement/pages/catalog/index.tsx`
- Create: `src/packageProcurement/pages/catalog/index.scss`
- Create: `src/packageProcurement/pages/catalog/index.config.ts`
- Create: `src/packageProcurement/pages/batch-edit/index.tsx`
- Create: `src/packageProcurement/pages/batch-edit/index.scss`
- Create: `src/packageProcurement/pages/batch-edit/index.config.ts`

- [ ] **Step 1: Add page-model tests for request sequencing**

Prove project selection precedes catalog requests, keyword/filter changes reset to page 1, save uses only SKU/category/quantity facts, and the displayed split preview is replaced by the save response.

- [ ] **Step 2: Run and verify failure**

Expected: FAIL because page orchestration is absent.

- [ ] **Step 3: Implement catalog and editor pages**

Catalog query sends `projectId`, keyword, category, brand, supplier, page, and pageSize. Cards show product/SKU, supplier, brand, unit, and server unit price. The editor collects project, reason, delivery date, remark, cost category, and quantities.

Generate one stable batch UUID when entering a new draft. Generate one save key per logical save and retain it until the request resolves or the user changes the payload.

- [ ] **Step 4: Verify**

Run:

```bash
bun test src/packageProcurement/model.test.ts
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit in orange**

```bash
git add src/packageProcurement/pages/catalog src/packageProcurement/pages/batch-edit src/packageProcurement/model.ts src/packageProcurement/model.test.ts
git commit -m "feat(procurement): add cross supplier purchase cart"
```

### Task 5: Permission-Gated Master Data Creation

**Files:**
- Create: `src/packageProcurement/pages/supplier-create/index.tsx`
- Create: `src/packageProcurement/pages/supplier-create/index.scss`
- Create: `src/packageProcurement/pages/supplier-create/index.config.ts`
- Create: `src/packageProcurement/pages/brand-create/index.tsx`
- Create: `src/packageProcurement/pages/brand-create/index.scss`
- Create: `src/packageProcurement/pages/brand-create/index.config.ts`
- Create: `src/packageProcurement/pages/product-create/index.tsx`
- Create: `src/packageProcurement/pages/product-create/index.scss`
- Create: `src/packageProcurement/pages/product-create/index.config.ts`

- [ ] **Step 1: Write failing visibility and payload tests**

Require:

- supplier page only for `actions.can_create_supplier`;
- brand page only for `actions.can_create_catalog`;
- product page only for `actions.can_create_purchasable_product`;
- product payload always contains product, SKU, and price in one request.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
bun test src/services/supplier_procurement.test.ts src/packageProcurement/model.test.ts
```

Expected: FAIL because the permission-gated create flows are absent.

- [ ] **Step 3: Implement creation flows**

Supplier creation posts `{ name, primary_contact?, remark? }`. Brand creation posts `{ name }`. Product creation requires supplier, category, brand, unit, SKU name/specification, unit price, tax rate, and tax-inclusive flag; it calls only `POST /supplier-purchasable-products/:id` for product/SKU/price creation.

On success, return the backend `catalog_item` through navigation event state, merge it into the catalog, and select it. Never perform three separate product/SKU/price requests.

- [ ] **Step 4: Run tests and typecheck**

Run the command from Step 2 and `pnpm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit in orange**

```bash
git add src/packageProcurement/pages/supplier-create src/packageProcurement/pages/brand-create src/packageProcurement/pages/product-create
git commit -m "feat(procurement): add purchase master data creation"
```

### Task 6: Detail, Submit, Review, And Revision Handling

**Files:**
- Create: `src/packageProcurement/pages/batch-detail/index.tsx`
- Create: `src/packageProcurement/pages/batch-detail/index.scss`
- Create: `src/packageProcurement/pages/batch-detail/index.config.ts`
- Create: `src/packageProcurement/pages/batch-review/index.tsx`
- Create: `src/packageProcurement/pages/batch-review/index.scss`
- Create: `src/packageProcurement/pages/batch-review/index.config.ts`
- Modify: `src/packageProcurement/model.ts`
- Modify: `src/packageProcurement/model.test.ts`

- [ ] **Step 1: Write failing state/action tests**

Cover draft edit/submit, pending approval, self-review absent from actions, reject reason required, ordered child-order list, and `409` revision details that refresh into a draft.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
bun test src/packageProcurement/model.test.ts
```

Expected: FAIL because detail/review states are absent.

- [ ] **Step 3: Implement detail and review**

Detail loads batch plus paginated items, requisitions, or orders only when their section is opened. Submit and review buttons disable immediately. An uncertain network result triggers `getBatch()` before any retry. Approval success renders every returned order number; rejection sends a 1–500 character remark.

For `SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED`, `BUDGET_CHANGED`, `ITEM_UNAVAILABLE`, or `SUPPLIER_INELIGIBLE`, show structured blockers, reload the new version, and navigate the creator to editable draft state.

- [ ] **Step 4: Run tests and typecheck**

Run the command from Step 2 and `pnpm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit in orange**

```bash
git add src/packageProcurement/pages/batch-detail src/packageProcurement/pages/batch-review src/packageProcurement/model.ts src/packageProcurement/model.test.ts
git commit -m "feat(procurement): add batch review and order results"
```

### Task 7: Contract Smoke And WeChat Build

**Files:**
- Create: `scripts/supplier-procurement-contract-smoke.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the smoke manifest**

The script must verify route responses, pagination, decimal strings, backend actions, two-supplier split preview, duplicate-submit replay, revision blockers, and exact order count. Mutation scenarios require an explicit environment flag and fixture IDs so production is never mutated accidentally.

- [ ] **Step 2: Run static/type checks first**

```bash
pnpm run typecheck
pnpm run check:file-size
```

Expected: PASS before starting a long build.

- [ ] **Step 3: Run development contract smoke**

```bash
SUPPLIER_PROCUREMENT_SMOKE_MUTATIONS=1 pnpm run smoke:supplier-procurement:miniprogram
```

Expected: `catalog_paginated=true`, `split_supplier_count=2`, `duplicate_safe=true`, `revision_safe=true`, and `submitted_order_count=2`.

- [ ] **Step 4: Build the WeChat mini-program**

```bash
pnpm run build:weapp
```

Expected: build and main-package-size check exit `0`.

- [ ] **Step 5: Commit in orange**

```bash
git add scripts/supplier-procurement-contract-smoke.mjs package.json
git commit -m "test(procurement): verify miniprogram purchase flow"
```

## Acceptance And Compatibility Notes

- Existing Admin requisition/order endpoints remain valid for records with `purchase_batch_id = null`.
- orange must not call legacy requisition/order mutations for batch-controlled children.
- A batch with two suppliers must produce exactly two submitted orders or zero orders.
- The mini-program repository owner runs all orange tests, builds, staging, commits, and pushes.
- The gooes team supplies the final endpoint examples, error matrix, migration status, smoke fixture instructions, and deployed development API version.
