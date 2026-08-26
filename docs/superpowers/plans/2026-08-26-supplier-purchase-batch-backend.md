# Supplier Purchase Batch Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant purchase-batch API that accepts one project's cross-supplier SKU list, materializes supplier-specific requisitions, and atomically approves, creates, and submits one purchase order per supplier.

**Architecture:** `supplier_purchase_batches` is the aggregate root above existing requisitions and orders. Fastify handles HTTP and permission orchestration; repositories perform bounded reads and call versioned PostgreSQL commands; one approval RPC locks and validates the whole batch before invoking the existing requisition/order rules in a single transaction.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations and RPC, `@gooes/domain`.

---

## Dependency

Execute `docs/superpowers/plans/2026-08-26-supplier-purchasable-product-command.md` first. The batch catalog and quick-create response must share one purchase-ready catalog item shape.

## File Structure

- Create `packages/domain/src/supplier-purchase-batch.ts` and test; export from `packages/domain/src/index.ts`.
- Create `apps/api/src/schema/supplier-purchase-batches.ts` and test.
- Create migrations `20260826141000_create_supplier_purchase_batches.sql` and `20260826142000_create_supplier_purchase_batch_commands.sql`.
- Create migration contract tests `supplier-purchase-batch-foundation-migration-contract.test.ts` and `supplier-purchase-batch-command-migration-contract.test.ts`.
- Create `apps/api/src/repositories/supplier-purchase-batch-records.ts`, `supplier-purchase-batches.ts`, and tests.
- Create `apps/api/src/services/supplier-purchase-batch-access.ts`, `supplier-purchase-batches.ts`, and tests.
- Create `apps/api/src/controllers/supplier-purchase-batches/index.ts` and route tests.
- Modify existing requisition/order record selects, repositories, services, command guards, error mapping, route registry, and generated database types.
- Create batch smoke, concurrency smoke, and EXPLAIN scripts plus static tests.

### Task 1: Domain Contract And Strict Schemas

**Files:**
- Create: `packages/domain/src/supplier-purchase-batch.ts`
- Create: `packages/domain/src/supplier-purchase-batch.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/api/src/schema/supplier-purchase-batches.ts`
- Create: `apps/api/src/schema/supplier-purchase-batches.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
expect(SUPPLIER_PURCHASE_BATCH_STATUS_VALUES).toEqual([
  "draft", "pending_approval", "rejected", "cancelled", "ordered",
]);

expect(SupplierPurchaseBatchDraftSchema.parse({
  project_id: PROJECT_ID,
  expected_version: 0,
  reason: "项目主材采购",
  expected_delivery_date: "2026-09-10",
  items: [{
    supplier_sku_id: SKU_ID,
    cost_category_id: CATEGORY_ID,
    quantity: "20.0000",
  }],
}).items[0]?.quantity).toBe("20.0000");
```

Add rejection tests for duplicate SKU, more than 100 lines, quantity scale over four, unknown keys, `pageSize > 100`, and reject review without a 1–500 character remark.

- [ ] **Step 2: Run and verify failure**

```bash
bun test packages/domain/src/supplier-purchase-batch.test.ts apps/api/src/schema/supplier-purchase-batches.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement constants, types, and schemas**

Define:

```ts
export const SUPPLIER_PURCHASE_BATCH_STATUS_VALUES = [
  "draft", "pending_approval", "rejected", "cancelled", "ordered",
] as const;
export const SUPPLIER_PURCHASE_BATCH_COMMAND_STATUS_VALUES = [
  "saved", "submitted", "rejected", "cancelled", "ordered",
  "revision_required",
] as const;
```

Create schemas for list, params, items, catalog, project options, cost categories, draft, submit, review, and cancel. Use decimal strings for quantities and money; require `expected_version > 0` except initial save uses `0`.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/supplier-purchase-batch.ts packages/domain/src/supplier-purchase-batch.test.ts packages/domain/src/index.ts apps/api/src/schema/supplier-purchase-batches.ts apps/api/src/schema/supplier-purchase-batches.test.ts
git commit -m "feat(procurement): define purchase batch contracts"
```

### Task 2: Additive Database Foundation And Batch Ownership Guard

**Files:**
- Create: `supabase/migrations/20260826141000_create_supplier_purchase_batches.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-foundation-migration-contract.test.ts`

- [ ] **Step 1: Write the failing migration contract**

Assert tables, status checks, tenant-safe composite foreign keys, indexes, and nullable compatibility columns:

```ts
for (const contract of [
  /CREATE TABLE public\.supplier_purchase_batches/,
  /status text NOT NULL[\s\S]*draft[\s\S]*pending_approval[\s\S]*ordered/,
  /CREATE TABLE public\.supplier_purchase_batch_items/,
  /UNIQUE \(purchase_batch_id, supplier_sku_id\)/,
  /ALTER TABLE public\.supplier_purchase_requisitions[\s\S]*purchase_batch_id/,
  /ALTER TABLE public\.supplier_purchase_orders[\s\S]*purchase_batch_id/,
  /CREATE TABLE public\.supplier_purchase_batch_command_events/,
]) expect(sql).toMatch(contract);
```

The new foundation contract must extract the redefined requisition functions from
`20260826141000_create_supplier_purchase_batches.sql` and require
`SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION` guards in submit, review,
cancel, and convert. Do not edit the historical
`20260730150000_create_supplier_purchase_requisitions.sql` migration.

- [ ] **Step 2: Run and verify failure**

```bash
cd apps/api && bun test src/services/supplier-purchase-batch-foundation-migration-contract.test.ts
```

Expected: FAIL because the migration and guards are absent.

- [ ] **Step 3: Implement the additive foundation migration**

Create batch and item tables with the fields approved in the design, including `split_generation`, version/audit columns, monetary snapshots, `supplier_count`, and `item_count`. Add partial uniqueness:

```sql
CREATE UNIQUE INDEX supplier_purchase_requisitions_batch_supplier_generation_uidx
ON public.supplier_purchase_requisitions(
  tenant_id, purchase_batch_id, split_generation, tenant_supplier_id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE UNIQUE INDEX supplier_purchase_orders_batch_supplier_uidx
ON public.supplier_purchase_orders(tenant_id, purchase_batch_id, tenant_supplier_id)
WHERE purchase_batch_id IS NOT NULL;
```

Add the batch-command event table keyed by tenant, batch, command type, and idempotency key. Extend existing requisition functions so any record with `purchase_batch_id IS NOT NULL` rejects direct mutation. Keep all existing rows valid with nullable columns and no backfill.

- [ ] **Step 4: Run migration contracts**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260826141000_create_supplier_purchase_batches.sql apps/api/src/services/supplier-purchase-batch-foundation-migration-contract.test.ts
git commit -m "feat(procurement): add purchase batch foundation"
```

### Task 3: Record Parsers And Paginated Read Repository

**Files:**
- Create: `apps/api/src/repositories/supplier-purchase-batch-records.ts`
- Create: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Create: `apps/api/src/repositories/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-requisition-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-order-records.ts`

- [ ] **Step 1: Write failing repository tests**

Test empty visible-project scope, exact selected columns, `.range()`, stable ordering, one catalog RPC, and child filters:

```ts
expect(client.rpc).toHaveBeenCalledWith(
  "resolve_supplier_purchase_batch_catalog",
  {
    p_tenant_id: TENANT_ID,
    p_project_id: PROJECT_ID,
    p_keyword: null,
    p_category_id: null,
    p_brand_id: null,
    p_tenant_supplier_id: null,
    p_priced_at: NOW,
    p_page: 1,
    p_page_size: 20,
  },
);
```

- [ ] **Step 2: Run and verify failure**

```bash
cd apps/api && bun test src/repositories/supplier-purchase-batches.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement parsers and bounded reads**

Expose repository methods:

```ts
listBatches(input: BatchListInput): Promise<Page<SupplierPurchaseBatchDetail>>;
findBatch(tenantId: string, batchId: string): Promise<SupplierPurchaseBatchDetail | null>;
listItems(input: BatchChildPageInput): Promise<Page<SupplierPurchaseBatchItem>>;
listRequisitions(input: BatchChildPageInput): Promise<Page<SupplierPurchaseRequisition>>;
listOrders(input: BatchChildPageInput): Promise<Page<SupplierPurchaseOrder>>;
listCatalog(input: BatchCatalogInput): Promise<Page<SupplierPurchaseBatchCatalogItem>>;
listProjectOptions(input: BatchProjectOptionInput): Promise<Page<ProjectOption>>;
listCostCategories(input: BatchCostCategoryInput): Promise<Page<CostCategory>>;
```

Add `purchase_batch_id` and `split_generation` to requisition records and `purchase_batch_id` to order records. Select only contract fields, apply tenant/project scope before `.range()`, and never read item prices in a loop.

- [ ] **Step 4: Run repository and record tests**

```bash
cd apps/api && bun test src/repositories/supplier-purchase-batches.test.ts src/repositories/supplier-purchase-requisition-records.test.ts src/repositories/supplier-purchase-order-records.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/supplier-purchase-batch-records.ts apps/api/src/repositories/supplier-purchase-batches.ts apps/api/src/repositories/supplier-purchase-batches.test.ts apps/api/src/repositories/supplier-purchase-requisition-records.ts apps/api/src/repositories/supplier-purchase-order-records.ts
git commit -m "feat(procurement): add purchase batch reads"
```

### Task 4: Access Policy And Server-Derived Actions

**Files:**
- Create: `apps/api/src/services/supplier-purchase-batch-access.ts`
- Create: `apps/api/src/services/supplier-purchase-batch-access.test.ts`

- [ ] **Step 1: Write failing access tests**

Cover view/manage/approve permissions, supplier module disabled, missing employee identity, project read/update scopes, self-review, and over-budget finance permission.

- [ ] **Step 2: Run and verify failure**

```bash
cd apps/api && bun test src/services/supplier-purchase-batch-access.test.ts
```

Expected: FAIL because the access service is absent.

- [ ] **Step 3: Implement the access service**

Mirror `SupplierPurchaseRequisitionAccessService`, exposing:

```ts
requireView(auth: AuthContext): Promise<BatchActorScope>;
requireManage(auth: AuthContext): Promise<BatchActorScope>;
requireApprove(auth: AuthContext): Promise<BatchActorScope>;
requireFinanceBudgetManage(auth: AuthContext): void;
getVisibleProjectIds(auth: AuthContext): Promise<string[] | null>;
getVisibleProjectUpdateIds(auth: AuthContext): Promise<string[] | null>;
assertProjectRead(auth: AuthContext, projectId: string): Promise<void>;
assertProjectUpdate(auth: AuthContext, projectId: string): Promise<void>;
```

Add a pure `deriveSupplierPurchaseBatchActions()` helper that derives UI actions from status, creator, permissions, and project scope. The command path must still reauthorize.

- [ ] **Step 4: Run access tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/supplier-purchase-batch-access.ts apps/api/src/services/supplier-purchase-batch-access.test.ts
git commit -m "feat(procurement): authorize purchase batch actions"
```

### Task 5: Catalog, Save, Submit, And Cancel Commands

**Files:**
- Create: `supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql`
- Create: `apps/api/src/services/supplier-purchase-batch-command-migration-contract.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.test.ts`

- [ ] **Step 1: Write failing command contracts**

Extract and assert these functions:

```ts
const commands = [
  "resolve_supplier_purchase_batch_catalog",
  "save_supplier_purchase_batch_draft",
  "submit_supplier_purchase_batch",
  "cancel_supplier_purchase_batch",
] as const;
```

For save, assert validation before locks, one set-based price resolution, supplier count limit `<= 20`, exact snapshot writes, fingerprinted replay, and no client-supplied supplier/price facts. For submit, assert one set-based budget aggregation by cost category and materialization grouped by `tenant_supplier_id`.

- [ ] **Step 2: Run and verify failure**

```bash
cd apps/api && bun test src/services/supplier-purchase-batch-command-migration-contract.test.ts
```

Expected: FAIL because the migration functions are absent.

- [ ] **Step 3: Implement catalog and mutation RPCs**

Use service-role-only, `SECURITY DEFINER`, fixed search path functions. Command signatures must include tenant, batch, expected version, actor IDs, and idempotency key. Save accepts only:

```sql
p_project_id uuid,
p_reason text,
p_expected_delivery_date date,
p_remark text,
p_items jsonb
```

The save CTE resolves all SKUs, relationships, products, units, brands, price lists, price items, and cost categories in one set. Submit locks cost categories in stable order, calculates the whole batch's other commitments excluding its own current generation, reserves each category once, and writes one child requisition per supplier. Cancel releases all active batch commitments and cancels current child requisitions.

- [ ] **Step 4: Add repository command adapters and run tests**

Repository methods must be named `saveDraft`, `submit`, and `cancel`, call the exact RPC names, parse one common command envelope, and use `throwSupplierCommandDatabaseError` for SQL errors.

Run:

```bash
cd apps/api && bun test src/services/supplier-purchase-batch-command-migration-contract.test.ts src/repositories/supplier-purchase-batches.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql apps/api/src/services/supplier-purchase-batch-command-migration-contract.test.ts apps/api/src/repositories/supplier-purchase-batches.ts apps/api/src/repositories/supplier-purchase-batches.test.ts
git commit -m "feat(procurement): save and submit purchase batches"
```

### Task 6: Atomic Review, Revision, And Direct Order Submission

**Files:**
- Modify: `supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql`
- Modify: `apps/api/src/services/supplier-purchase-batch-command-migration-contract.test.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`

- [ ] **Step 1: Add failing approval transaction tests**

Require `review_supplier_purchase_batch` to prove this order:

```ts
expectOrdered(review, [
  /FROM public\.supplier_purchase_batches[\s\S]*FOR UPDATE/,
  /created_by_employee_id = p_actor_employee_id/,
  /ORDER BY tenant_supplier_id[\s\S]*FOR UPDATE/,
  /current_prices AS MATERIALIZED/,
  /current_budget AS MATERIALIZED/,
  /revision_required/,
  /convert_supplier_purchase_requisition_for_batch/,
  /submit_supplier_purchase_order/,
  /status = 'converted'/,
  /status = 'ordered'/,
]);
expect(review).not.toMatch(/RAISE EXCEPTION[\s\S]*revision_required/);
```

Add a contract proving reject requires a nonblank reason and rejects every child in the current generation.

- [ ] **Step 2: Run and verify failure**

Run the migration contract. Expected: FAIL because review is absent.

- [ ] **Step 3: Implement review without partial success**

The RPC accepts `approve | reject`. For approve, lock suppliers by UUID,
re-resolve prices, aggregate budget, check self-review, require the API-provided
`p_can_override_budget` flag only after the service verified
`finance.budget.manage`, then create and submit orders in supplier UUID order.

Add a service-role-only private helper named
`convert_supplier_purchase_requisition_for_batch`. It accepts the locked batch,
child requisition, preallocated order ID, and actor context; copies the child
requisition's frozen item facts into a draft purchase order; marks the child
`converted`; and returns the order version. The public legacy
`convert_supplier_purchase_requisition` remains guarded against batch-owned
children. `review_supplier_purchase_batch` calls the private helper and then
`submit_supplier_purchase_order` for every supplier inside the same transaction.

When price, budget, supplier, product, or SKU facts changed, persist a `revision_required` event, move batch and current child requisitions to `draft`, increment versions, release reservations, and return structured blockers. Do not raise an exception for this expected outcome. Unexpected order-command failure must raise and roll back all order writes.

- [ ] **Step 4: Map errors and run contracts**

Add all `SUPPLIER_PURCHASE_BATCH_*` mappings approved in the design. Run:

```bash
cd apps/api && bun test src/services/supplier-purchase-batch-command-migration-contract.test.ts src/services/supplier-purchase-batch-foundation-migration-contract.test.ts src/services/supplier-purchase-requisition-command-migration-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql apps/api/src/services/supplier-purchase-batch-command-migration-contract.test.ts apps/api/src/repositories/supplier-command-errors.ts
git commit -m "feat(procurement): atomically approve and split purchase batches"
```

### Task 7: Service, Controller, And Route Registration

**Files:**
- Create: `apps/api/src/services/supplier-purchase-batches.ts`
- Create: `apps/api/src/services/supplier-purchase-batches.test.ts`
- Create: `apps/api/src/controllers/supplier-purchase-batches/index.ts`
- Create: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing service and route tests**

Expected routes:

```ts
expect(routes).toEqual([
  "GET /supplier-purchase-batch-project-options",
  "GET /supplier-purchase-batch-cost-categories",
  "GET /supplier-purchase-batch-catalog",
  "GET /supplier-purchase-batches",
  "GET /supplier-purchase-batches/:id",
  "GET /supplier-purchase-batches/:id/items",
  "GET /supplier-purchase-batches/:id/requisitions",
  "GET /supplier-purchase-batches/:id/orders",
  "POST /supplier-purchase-batches/:id/save-draft",
  "POST /supplier-purchase-batches/:id/submit",
  "POST /supplier-purchase-batches/:id/review",
  "POST /supplier-purchase-batches/:id/cancel",
]);
```

Service tests must cover project scopes, action derivation, self-review, over-budget permission, revision-required mapping to `409` with the persisted new version, and no repository call after failed authorization.

- [ ] **Step 2: Run and verify failure**

```bash
cd apps/api && bun test src/services/supplier-purchase-batches.test.ts src/controllers/supplier-purchase-batches/routes.test.ts
```

Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement service and controller boundaries**

The controller only parses request/query/body, requires idempotency keys for mutations, calls the service, and wraps `ResponseHandler.success`. The service owns permissions, project scope, self-review, finance override, action derivation, and command-outcome mapping. The repository remains the only Supabase caller.

Register the controller beside existing supplier controllers in `apps/api/src/routes/index.ts`.

- [ ] **Step 4: Run focused and neighboring tests**

```bash
cd apps/api && bun test src/services/supplier-purchase-batches.test.ts src/controllers/supplier-purchase-batches/routes.test.ts src/controllers/supplier-purchase-requisitions/routes.test.ts src/controllers/supplier-purchase-orders/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/supplier-purchase-batches.ts apps/api/src/services/supplier-purchase-batches.test.ts apps/api/src/controllers/supplier-purchase-batches apps/api/src/routes/index.ts
git commit -m "feat(api): expose supplier purchase batches"
```

### Task 8: Smoke, Concurrency, Performance, And Migration Verification

**Files:**
- Create: `apps/api/src/scripts/supplier-purchase-batch-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-smoke.test.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-concurrency.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-concurrency.test.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-explain.ts`
- Create: `apps/api/src/scripts/supplier-purchase-batch-explain.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write static smoke-plan tests**

Require fixtures for two suppliers, at least three SKUs, two cost categories, exact two-order assertion, replay, concurrent approval, price change, supplier suspension, missing price, injected second-order failure, and whole-batch budget aggregation.

- [ ] **Step 2: Run static verification**

```bash
cd apps/api && bun test src/scripts/supplier-purchase-batch-smoke.test.ts src/scripts/supplier-purchase-batch-concurrency.test.ts src/scripts/supplier-purchase-batch-explain.test.ts
```

Expected: PASS once the scripts expose the required scenario manifests.

- [ ] **Step 3: Review, apply, and verify migrations**

```bash
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
supabase gen types typescript --linked > apps/api/src/types/database.ts
```

Expected: both batch migrations are pending before push and Local/Remote aligned after push. Resolve timestamp collisions by renaming migration files and their contract-test URLs before applying.

- [ ] **Step 4: Run real smoke and EXPLAIN**

```bash
cd apps/api && bun --env-file=../../.env src/scripts/supplier-purchase-batch-smoke.ts
cd apps/api && bun --env-file=../../.env src/scripts/supplier-purchase-batch-concurrency.ts
cd apps/api && bun --env-file=../../.env src/scripts/supplier-purchase-batch-explain.ts
```

Expected: two submitted orders for two suppliers; zero orders in every blocker case; one winner in concurrent approval; catalog and approval query plans use the intended indexes and contain no per-item query loop.

- [ ] **Step 5: Run the full relevant gate and commit**

```bash
bun test packages/domain/src/supplier-purchase-batch.test.ts apps/api/src/schema/supplier-purchase-batches.test.ts apps/api/src/services/supplier-purchase-batch-foundation-migration-contract.test.ts apps/api/src/services/supplier-purchase-batch-command-migration-contract.test.ts apps/api/src/repositories/supplier-purchase-batches.test.ts apps/api/src/services/supplier-purchase-batch-access.test.ts apps/api/src/services/supplier-purchase-batches.test.ts apps/api/src/controllers/supplier-purchase-batches/routes.test.ts apps/api/src/scripts/supplier-purchase-batch-smoke.test.ts apps/api/src/scripts/supplier-purchase-batch-concurrency.test.ts apps/api/src/scripts/supplier-purchase-batch-explain.test.ts
bun run api:typecheck
bun run api:build
bun run api:check-file-size
git add apps/api/src/scripts/supplier-purchase-batch-smoke.ts apps/api/src/scripts/supplier-purchase-batch-smoke.test.ts apps/api/src/scripts/supplier-purchase-batch-concurrency.ts apps/api/src/scripts/supplier-purchase-batch-concurrency.test.ts apps/api/src/scripts/supplier-purchase-batch-explain.ts apps/api/src/scripts/supplier-purchase-batch-explain.test.ts apps/api/src/types/database.ts
git commit -m "test(procurement): verify atomic supplier order splitting"
```

Expected: all tests pass and all three API checks exit `0`.
