# Supplier Purchasable Product Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one tenant API command that atomically creates and activates a supplier product and SKU, publishes its default CNY supply price, and returns an item that can immediately be added to a procurement batch.

**Architecture:** Keep the existing supplier master, catalog, product, SKU, price-list, and command-event models. Add a narrow composite RPC and controller/service/repository path; the RPC invokes the existing v2 product/SKU/price commands inside one PostgreSQL transaction and uses a parent idempotency fingerprint to make the whole operation replay-safe.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations and RPC, `@gooes/domain`.

---

## File Structure

- Create `packages/domain/src/supplier-procurement.ts`: shared purchasable-product result types and status constants.
- Modify `packages/domain/src/index.ts`: export the new contract.
- Test `packages/domain/src/supplier-procurement.test.ts`.
- Create `apps/api/src/schema/supplier-purchasable-products.ts`: strict HTTP input schema.
- Test `apps/api/src/schema/supplier-purchasable-products.test.ts`.
- Create `supabase/migrations/20260826140000_create_supplier_purchasable_product_command.sql`: atomic composite command, grants, and supporting index/constraints if required.
- Create `apps/api/src/services/supplier-purchasable-product-migration-contract.test.ts`: static migration contract.
- Modify `apps/api/src/services/supplier-product-access.ts`: one access decision that requires both product and price write permissions.
- Test `apps/api/src/services/supplier-product-access.test.ts`.
- Create `apps/api/src/repositories/supplier-purchasable-products.ts`: RPC adapter.
- Create `apps/api/src/repositories/supplier-purchasable-product-records.ts`: Zod result parser.
- Test `apps/api/src/repositories/supplier-purchasable-products.test.ts`.
- Create `apps/api/src/services/supplier-purchasable-products.ts`: authorization and command orchestration.
- Test `apps/api/src/services/supplier-purchasable-products.test.ts`.
- Create `apps/api/src/controllers/supplier-purchasable-products/index.ts`: HTTP boundary.
- Create `apps/api/src/controllers/supplier-purchasable-products/routes.test.ts`: route contract.
- Modify `apps/api/src/routes/index.ts`: register the controller.
- Modify `apps/api/src/repositories/supplier-command-errors.ts`: map the new composite-command errors.
- Modify `apps/api/src/types/database.ts`: regenerate after the migration is applied to the linked development database.
- Create `apps/api/src/scripts/supplier-purchasable-product-smoke.ts`: real-database atomicity and replay smoke.
- Test `apps/api/src/scripts/supplier-purchasable-product-smoke.test.ts`.

### Task 1: Shared Contract And HTTP Schema

**Files:**
- Create: `packages/domain/src/supplier-procurement.ts`
- Create: `packages/domain/src/supplier-procurement.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/api/src/schema/supplier-purchasable-products.ts`
- Create: `apps/api/src/schema/supplier-purchasable-products.test.ts`

- [ ] **Step 1: Write failing domain and schema tests**

```ts
test("keeps purchasable product command statuses stable", () => {
  expect(SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES).toEqual([
    "created",
    "validation_error",
    "state_conflict",
  ]);
});

test("accepts one complete product, sku, and price payload", () => {
  expect(SupplierPurchasableProductCreateSchema.parse({
    sku_id: "20000000-0000-4000-8000-000000000002",
    product: {
      name: "耐水腻子粉",
      category_id: "30000000-0000-4000-8000-000000000003",
      brand_id: "40000000-0000-4000-8000-000000000004",
    },
    sku: {
      name: "20kg/袋",
      purchase_unit_id: "50000000-0000-4000-8000-000000000005",
      spec_values: {},
    },
    price: { unit_price: "48.00", tax_rate: "0.130000", tax_inclusive: true },
  })).toMatchObject({ product: { name: "耐水腻子粉" } });
});
```

- [ ] **Step 2: Run tests and verify the missing exports fail**

Run:

```bash
bun test packages/domain/src/supplier-procurement.test.ts apps/api/src/schema/supplier-purchasable-products.test.ts
```

Expected: FAIL because the new module and schema do not exist.

- [ ] **Step 3: Add the shared status and strict schema**

```ts
export const SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES = [
  "created",
  "validation_error",
  "state_conflict",
] as const;

export type SupplierPurchasableProductStatus =
  (typeof SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES)[number];
```

Use decimal strings at the HTTP boundary. Define `product`, `sku`, and `price` as strict nested Zod objects. Generate `product_code` and `sku_code` on the server; reject unknown fields, zero/negative price, tax outside `0..1`, and missing category, brand, unit, or SKU ID.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/supplier-procurement.ts packages/domain/src/supplier-procurement.test.ts packages/domain/src/index.ts apps/api/src/schema/supplier-purchasable-products.ts apps/api/src/schema/supplier-purchasable-products.test.ts
git commit -m "feat(supplier): define purchasable product command contract"
```

### Task 2: Composite Migration Contract

**Files:**
- Create: `apps/api/src/services/supplier-purchasable-product-migration-contract.test.ts`
- Create: `supabase/migrations/20260826140000_create_supplier_purchasable_product_command.sql`

- [ ] **Step 1: Write the failing migration contract**

The test must extract `command_supplier_purchasable_product_v1` and assert this ordered contract:

```ts
expectOrdered(command, [
  /jsonb_typeof\(p_product\) <> 'object'/,
  /jsonb_typeof\(p_sku\) <> 'object'/,
  /jsonb_typeof\(p_price\) <> 'object'/,
  /supplier-purchasable-product:/,
  /FROM public\.tenant_suppliers[\s\S]*FOR UPDATE/,
  /command_supplier_product_v2/,
  /command_supplier_sku_v2/,
  /command_supplier_price_list_v2/,
  /command_supplier_price_item_v2/,
  /resolve_supplier_purchase_order_catalog/,
  /INSERT INTO public\.supplier_command_events/,
]);
expect(command).toMatch(/SECURITY DEFINER/);
expect(command).toMatch(/SET search_path = pg_catalog, public/);
expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.command_supplier_purchasable_product_v1/);
expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
```

- [ ] **Step 2: Run the contract and verify it fails**

```bash
cd apps/api && bun test src/services/supplier-purchasable-product-migration-contract.test.ts
```

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement the migration command**

Use this exact signature and result envelope:

```sql
CREATE FUNCTION public.command_supplier_purchasable_product_v1(
  p_product_id uuid,
  p_sku_id uuid,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_product jsonb,
  p_sku jsonb,
  p_price jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;
```

The body must validate all JSON before locks, fingerprint the full request, replay a matching parent event, reject a mismatched replay with `SUPPLIER_IDEMPOTENCY_CONFLICT`, lock the relationship and supplier price series in stable order, and invoke existing v2 commands with child keys derived from the parent key. For an existing published default CNY price list, create a new version, add the SKU price, and publish it; when none exists, create and publish the first default list. Resolve the created SKU through the existing purchase catalog resolver before returning:

```json
{
  "status": "created",
  "idempotent": false,
  "product": {},
  "sku": {},
  "price": {},
  "catalog_item": {}
}
```

Catch only known validation/state conditions into the envelope. Unexpected SQL errors must propagate so the entire transaction rolls back.

- [ ] **Step 4: Run the migration contract**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260826140000_create_supplier_purchasable_product_command.sql apps/api/src/services/supplier-purchasable-product-migration-contract.test.ts
git commit -m "feat(supplier): add atomic purchasable product command"
```

### Task 3: One-Pass Access Decision

**Files:**
- Modify: `apps/api/src/services/supplier-product-access.ts`
- Modify: `apps/api/src/services/supplier-product-access.test.ts`

- [ ] **Step 1: Add failing permission tests**

Add cases proving that `requirePurchasableProductWrite()` requires both permissions, reads settings and relationship once, accepts an active tenant-owned private supplier, and rejects a platform supplier that is not approved.

```ts
await expect(service.requirePurchasableProductWrite(
  auth(["supplier.product.manage"]),
  TENANT_SUPPLIER_ID,
)).rejects.toMatchObject({ statusCode: 403 });
```

- [ ] **Step 2: Run the focused test and verify failure**

```bash
cd apps/api && bun test src/services/supplier-product-access.test.ts
```

Expected: FAIL because the method does not exist.

- [ ] **Step 3: Add the combined method**

```ts
requirePurchasableProductWrite(auth: AuthContext, tenantSupplierId: string) {
  this.accessPolicy.assertPermission(auth, "supplier.product.manage");
  this.accessPolicy.assertPermission(auth, "supplier.cost-price.manage");
  return this.requireScope(
    auth,
    tenantSupplierId,
    "supplier.product.manage",
    true,
    { permissionAlreadyChecked: true },
  );
}
```

Refactor `requireScope` only enough to avoid checking the product permission twice. Do not duplicate the relationship-read or eligibility logic.

- [ ] **Step 4: Run the focused test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/supplier-product-access.ts apps/api/src/services/supplier-product-access.test.ts
git commit -m "feat(supplier): authorize atomic product pricing"
```

### Task 4: Repository And Service

**Files:**
- Create: `apps/api/src/repositories/supplier-purchasable-product-records.ts`
- Create: `apps/api/src/repositories/supplier-purchasable-products.ts`
- Create: `apps/api/src/repositories/supplier-purchasable-products.test.ts`
- Create: `apps/api/src/services/supplier-purchasable-products.ts`
- Create: `apps/api/src/services/supplier-purchasable-products.test.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`

- [ ] **Step 1: Write failing repository and service tests**

Assert exact RPC parameters and server-generated codes:

```ts
expect(client.rpc).toHaveBeenCalledWith(
  "command_supplier_purchasable_product_v1",
  expect.objectContaining({
    p_product_id: PRODUCT_ID,
    p_sku_id: SKU_ID,
    p_tenant_supplier_id: TENANT_SUPPLIER_ID,
    p_product: expect.objectContaining({ product_code: `TP-${PRODUCT_ID.replaceAll("-", "").slice(0, 16)}` }),
    p_sku: expect.objectContaining({ sku_code: `TS-${SKU_ID.replaceAll("-", "").slice(0, 16)}` }),
  }),
);
```

Also test replay parsing, malformed RPC output, permission denial, and error mapping.

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd apps/api && bun test src/repositories/supplier-purchasable-products.test.ts src/services/supplier-purchasable-products.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement records, repository, and service**

The repository exposes one method:

```ts
create(input: SupplierPurchasableProductCommandInput) {
  return this.client.rpc("command_supplier_purchasable_product_v1", {
    p_product_id: input.product_id,
    p_sku_id: input.sku_id,
    p_tenant_id: input.tenant_id,
    p_tenant_supplier_id: input.tenant_supplier_id,
    p_supplier_id: input.supplier_id,
    p_product: input.product,
    p_sku: input.sku,
    p_price: input.price,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  });
}
```

The service calls `requirePurchasableProductWrite`, derives codes from stable UUIDs, passes decimal strings unchanged, and converts known command errors with `Errors.business`. Register `SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED` and any reused supplier price errors in `supplier-command-errors.ts`; never throw a raw `Error`.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/supplier-purchasable-product-records.ts apps/api/src/repositories/supplier-purchasable-products.ts apps/api/src/repositories/supplier-purchasable-products.test.ts apps/api/src/services/supplier-purchasable-products.ts apps/api/src/services/supplier-purchasable-products.test.ts apps/api/src/repositories/supplier-command-errors.ts
git commit -m "feat(supplier): expose purchasable product service"
```

### Task 5: HTTP Route Registration

**Files:**
- Create: `apps/api/src/controllers/supplier-purchasable-products/index.ts`
- Create: `apps/api/src/controllers/supplier-purchasable-products/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write the failing route test**

```ts
expect(routes).toEqual([
  "POST /supplier-purchasable-products/:id",
]);
```

Add a controller test that requires `tenantSupplierId`, a valid UUID path ID, a valid body, and `Idempotency-Key`.

- [ ] **Step 2: Run and verify failure**

```bash
cd apps/api && bun test src/controllers/supplier-purchasable-products/routes.test.ts
```

Expected: FAIL because the controller is absent.

- [ ] **Step 3: Implement and register the controller**

```ts
@Post("/supplier-purchasable-products/:id")
async create(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const key = requireSupplierIdempotencyKey(request);
  const { id } = this.parse(SupplierPurchasableProductParamSchema, request.params);
  const { tenantSupplierId } = this.parse(SupplierScopeQuerySchema, request.query);
  const input = this.parse(SupplierPurchasableProductCreateSchema, request.body);
  return ResponseHandler.success(
    await supplierPurchasableProductsService.create(auth, tenantSupplierId, id, input, key),
  );
}
```

Import the controller in `apps/api/src/routes/index.ts` and call `registerExtraRoutes(app)` beside the other supplier controllers.

- [ ] **Step 4: Run route and service tests**

```bash
cd apps/api && bun test src/controllers/supplier-purchasable-products/routes.test.ts src/services/supplier-purchasable-products.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/controllers/supplier-purchasable-products apps/api/src/routes/index.ts
git commit -m "feat(api): add purchasable product endpoint"
```

### Task 6: Database Smoke And Verification

**Files:**
- Create: `apps/api/src/scripts/supplier-purchasable-product-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-product-smoke.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write smoke-plan tests**

Test that the smoke script covers success, same-key replay, same-key/different-payload conflict, and a deliberately invalid price proving no product/SKU/price rows remain.

- [ ] **Step 2: Run static tests**

```bash
cd apps/api && bun test src/scripts/supplier-purchasable-product-smoke.test.ts src/services/supplier-purchasable-product-migration-contract.test.ts
```

Expected: PASS after the smoke plan exists.

- [ ] **Step 3: Apply and verify the migration in the approved development environment**

```bash
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
```

Expected: `20260826140000` is pending before push and Local/Remote aligned after push. If another migration has claimed this timestamp, rename the migration and its contract-test URL together before applying anything.

- [ ] **Step 4: Regenerate types and run verification**

```bash
supabase gen types typescript --linked > apps/api/src/types/database.ts
cd apps/api && bun test src/schema/supplier-purchasable-products.test.ts src/services/supplier-purchasable-product-migration-contract.test.ts src/repositories/supplier-purchasable-products.test.ts src/services/supplier-purchasable-products.test.ts src/controllers/supplier-purchasable-products/routes.test.ts src/scripts/supplier-purchasable-product-smoke.test.ts
cd ../.. && bun run api:typecheck && bun run api:build && bun run api:check-file-size
```

Expected: all tests pass; typecheck, build, and file-size check exit `0`.

- [ ] **Step 5: Run real smoke and commit generated evidence code**

```bash
cd apps/api && bun --env-file=../../.env src/scripts/supplier-purchasable-product-smoke.ts
git add src/types/database.ts src/scripts/supplier-purchasable-product-smoke.ts src/scripts/supplier-purchasable-product-smoke.test.ts
git commit -m "test(supplier): verify purchasable product atomicity"
```

Expected smoke output: `created=true`, `replay_idempotent=true`, `conflict_rejected=true`, and `rollback_clean=true`.
