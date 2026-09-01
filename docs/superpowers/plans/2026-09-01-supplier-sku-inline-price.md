# Supplier SKU Inline Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tenant admins create or edit a tenant-owned supplier SKU and its current CNY base purchase price in one form, with an untaxed price by default and one atomic save that becomes effective immediately.

**Architecture:** Keep price ownership in versioned supplier price lists. Add a focused `supplier-purchasable-skus` HTTP/service/repository vertical slice and a migration-owned read helper plus `command_supplier_purchasable_sku_v1` transaction. Reuse the existing supplier access service, SKU v3 command, price-list v2 command, price-item v2 command, and purchase catalog resolver. The Admin uses the composite path only when all three product/price permissions are present; existing tenant product-only CRUD, platform shared SKU CRUD, and the advanced price-list tab remain unchanged.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase JS/PostgREST, PostgreSQL PL/pgSQL migrations, Next.js 15, React 19, shadcn/Radix, Tailwind CSS, lucide-react, Bun test, Playwright.

---

## Delivery Rules

- Execute every production-code step test-first: write the test, run it, verify the expected RED, then implement the minimum GREEN change.
- Work only in the isolated worktree for this feature. Do not modify `/Users/leefo/Public/work/orange`.
- Do not add price columns to `supplier_skus`, expose price in the paginated SKU DTO, or remove the advanced price-list workflow.
- Do not extend `apps/api/src/repositories/supplier-products.ts`; it is already 497 lines and the repository gate rejects files at 500 lines.
- All database function, permission, index, and initialization changes must be in the new migration. Never repair a remote database with ad hoc SQL.
- Apply the migration only to the explicitly selected development database after reviewing `db push --dry-run`. Production deployment is a separate authorization step.
- Preserve decimal values as strings from browser to Zod to RPC. Do not convert price or tax rate with `Number()` in Admin code.
- No new runtime dependency is required.

## File Map

### API contract and vertical slice

- Create `apps/api/src/schema/supplier-purchasable-skus.ts`.
- Create `apps/api/src/schema/supplier-purchasable-skus.test.ts`.
- Create `apps/api/src/repositories/supplier-purchasable-sku-records.ts`.
- Create `apps/api/src/repositories/supplier-purchasable-skus.ts`.
- Create `apps/api/src/repositories/supplier-purchasable-skus.test.ts`.
- Create `apps/api/src/services/supplier-purchasable-skus.ts`.
- Create `apps/api/src/services/supplier-purchasable-skus.test.ts`.
- Create `apps/api/src/controllers/supplier-purchasable-skus/index.ts`.
- Create `apps/api/src/controllers/supplier-purchasable-skus/routes.test.ts`.
- Modify `apps/api/src/services/supplier-product-access.ts`.
- Modify `apps/api/src/services/supplier-product-access.test.ts`.
- Modify `apps/api/src/repositories/supplier-command-errors.ts`.
- Modify `apps/api/src/routes/index.ts`.

### Database and operational verification

- Create `supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql`.
- Create `apps/api/src/services/supplier-purchasable-sku-migration-contract.test.ts`.
- Create `apps/api/src/scripts/supplier-purchasable-sku-smoke.ts`.
- Create `apps/api/src/scripts/supplier-purchasable-sku-smoke.test.ts`.
- Create `apps/api/src/scripts/supplier-purchasable-sku-explain.ts`.
- Create `apps/api/src/scripts/supplier-purchasable-sku-explain.test.ts`.
- Modify `apps/api/package.json`.
- Regenerate `apps/api/src/types/database.ts` after the development migration is applied.

### Admin

- Modify `apps/admin/components/supplier-products/supplier-product-types.ts`.
- Modify `apps/admin/components/supplier-products/supplier-product-api.ts`.
- Modify `apps/admin/components/supplier-products/supplier-product-rules.ts`.
- Create `apps/admin/components/supplier-products/supplier-sku-price-form.ts`.
- Create `apps/admin/components/supplier-products/supplier-sku-price-form.test.ts`.
- Create `apps/admin/components/supplier-products/supplier-sku-price-fields.tsx`.
- Modify `apps/admin/components/supplier-products/supplier-sku-dialog.tsx`.
- Modify `apps/admin/components/supplier-products/supplier-sku-table.tsx`.
- Modify `apps/admin/components/supplier-products/supplier-product-list.tsx`.
- Modify `apps/admin/components/supplier-products/supplier-product-workspace.tsx`.
- Modify `apps/admin/components/supplier-products/supplier-product-page.test.tsx`.
- Modify `apps/admin/e2e/supplier-product-pricing-mock-state.mjs`.
- Modify `apps/admin/e2e/supplier-product-pricing-mock-handlers.mjs`.
- Create `apps/admin/e2e/supplier-sku-inline-price-workflow.spec.ts`.
- Modify `apps/admin/playwright.supplier-product-pricing.config.ts`.

## Task 1: Lock the Composite HTTP Schema

**Files:**
- Create: `apps/api/src/schema/supplier-purchasable-skus.test.ts`
- Create: `apps/api/src/schema/supplier-purchasable-skus.ts`

- [ ] **Step 1: Write the failing schema tests**

Cover strict path/query parsing, create defaults, edit concurrency fields, decimal strings, and unknown-field rejection. The core assertions must include:

```ts
import { describe, expect, test } from "bun:test";
import {
  SupplierPurchasableSkuCreateSchema,
  SupplierPurchasableSkuPriceParamSchema,
  SupplierPurchasableSkuScopeQuerySchema,
  SupplierPurchasableSkuUpdateSchema,
} from "./supplier-purchasable-skus";

const UUID = "10000000-0000-4000-8000-000000000001";

test("keeps price decimals as strings and defaults to untaxed", () => {
  const parsed = SupplierPurchasableSkuCreateSchema.parse({
    sku: {
      name: "净味乳胶漆 18L",
      purchase_unit_id: UUID,
      specification: "18L",
      model: null,
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      spec_values: {},
    },
    price: { unit_price: "328.00", tax_rate: "0.13" },
  });

  expect(parsed.price).toEqual({
    unit_price: "328.00",
    tax_rate: "0.13",
    tax_inclusive: false,
  });
});

test("requires one coherent price concurrency snapshot on update", () => {
  expect(SupplierPurchasableSkuUpdateSchema.parse({
    sku: { expected_version: 3, name: "净味乳胶漆 18L 新包装" },
    price: {
      unit_price: "318.00",
      tax_rate: "0.13",
      tax_inclusive: false,
      expected_price_list_id: UUID,
      expected_price_list_version: 5,
    },
  })).toMatchObject({ sku: { expected_version: 3 } });

  for (const price of [
    { unit_price: "1e2", tax_rate: "0.13", tax_inclusive: false },
    { unit_price: "0", tax_rate: "0.13", tax_inclusive: false },
    { unit_price: "10.001", tax_rate: "0.13", tax_inclusive: false },
    { unit_price: "10.00", tax_rate: "1.000001", tax_inclusive: false },
  ]) {
    expect(SupplierPurchasableSkuCreateSchema.safeParse({
      sku: {
        name: "SKU",
        purchase_unit_id: UUID,
        spec_values: {},
      },
      price,
    }).success).toBe(false);
  }
});

test("accepts null expected price identity only when no current price exists", () => {
  const result = SupplierPurchasableSkuUpdateSchema.safeParse({
    sku: { expected_version: 3 },
    price: {
      unit_price: "318.00",
      tax_rate: "0.13",
      tax_inclusive: false,
      expected_price_list_id: null,
      expected_price_list_version: null,
    },
  });
  expect(result.success).toBe(true);
});

test("parses only the documented path and scope names", () => {
  expect(SupplierPurchasableSkuPriceParamSchema.parse({
    productId: UUID,
    skuId: UUID,
  })).toEqual({ productId: UUID, skuId: UUID });
  expect(SupplierPurchasableSkuScopeQuerySchema.parse({
    tenantSupplierId: UUID,
  })).toEqual({ tenantSupplierId: UUID });
  expect(SupplierPurchasableSkuScopeQuerySchema.safeParse({
    tenant_id: UUID,
  }).success).toBe(false);
});
```

Also test optional SKU update fields, `spec_values` value types, paired nullable expected price fields, UUID errors, overlong strings, negative price, tax rate greater than one, and strict rejection of `tenant_id`, `supplier_id`, `sku_code`, `currency`, `effective_from`, and price-list names/codes.

- [ ] **Step 2: Run the schema test and verify RED**

```bash
cd apps/api && bun test src/schema/supplier-purchasable-skus.test.ts
```

Expected: FAIL because `supplier-purchasable-skus.ts` does not exist.

- [ ] **Step 3: Implement the strict schemas**

Use shared local schema fragments, not JavaScript numeric coercion:

```ts
const unitPrice = z.string().trim()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/,
    "单价整数最多 12 位且小数最多 2 位")
  .refine((value) => value !== "0" && !/^0\.0+$/.test(value), {
    message: "单价必须大于 0",
  });

const taxRate = z.string().trim()
  .regex(/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/,
    "税率必须是 0 到 1 且最多 6 位小数的十进制数");

const priceFields = {
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean().default(false),
};

export const SupplierPurchasableSkuCreateSchema = z.object({
  sku: SupplierPurchasableSkuCreateFieldsSchema,
  price: z.object(priceFields).strict(),
}).strict();

export const SupplierPurchasableSkuUpdateSchema = z.object({
  sku: SupplierPurchasableSkuUpdateFieldsSchema,
  price: z.object({
    ...priceFields,
    expected_price_list_id: z.uuid("无效的供应商价格簿 ID").nullable(),
    expected_price_list_version: z.number().int().positive().nullable(),
  }).strict().superRefine(requirePairedExpectedPriceIdentity),
}).strict();
```

Keep `expected_version` required for updates. Allow a complete price snapshot with unchanged values; the database command, not the browser, decides whether a new price version is needed.

- [ ] **Step 4: Run the schema test and verify GREEN**

Expected: all schema cases PASS and parsed money/tax values remain strings.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/schema/supplier-purchasable-skus.ts \
  apps/api/src/schema/supplier-purchasable-skus.test.ts
git commit -m "feat(supplier): 定义 SKU 即时价格契约"
```

## Task 2: Add Price Context Reads and Composite Access

**Files:**
- Modify: `apps/api/src/services/supplier-product-access.test.ts`
- Modify: `apps/api/src/services/supplier-product-access.ts`
- Create: `apps/api/src/repositories/supplier-purchasable-sku-records.ts`
- Create: `apps/api/src/repositories/supplier-purchasable-skus.test.ts`
- Create: `apps/api/src/repositories/supplier-purchasable-skus.ts`
- Create: `apps/api/src/services/supplier-purchasable-skus.test.ts`
- Create: `apps/api/src/services/supplier-purchasable-skus.ts`

- [ ] **Step 1: Write failing access tests**

Add table-driven tests proving:

```ts
await expect(service.requirePurchasableSkuPriceRead(
  auth(["supplier.product.manage", "supplier.cost-price.view"]),
  TENANT_SUPPLIER_ID,
)).resolves.toMatchObject({ tenantSupplierId: TENANT_SUPPLIER_ID });

await expect(service.requirePurchasableSkuWrite(
  auth([
    "supplier.product.manage",
    "supplier.cost-price.manage",
  ]),
  TENANT_SUPPLIER_ID,
)).resolves.toMatchObject({ tenantSupplierId: TENANT_SUPPLIER_ID });
```

For each method, assert one settings read and one relationship read. Assert failure before data reads when any required permission is missing. Both methods must use the write relationship gate, so suspended/terminated relationships cannot open an editable composite context.

- [ ] **Step 2: Run the access tests and verify RED**

```bash
cd apps/api && bun test src/services/supplier-product-access.test.ts
```

Expected: FAIL because the two focused access methods do not exist.

- [ ] **Step 3: Add focused access methods**

```ts
requirePurchasableSkuPriceRead(auth: AuthContext, tenantSupplierId: string) {
  return this.requireScope(
    auth,
    tenantSupplierId,
    ["supplier.product.manage", "supplier.cost-price.view"],
    true,
  );
}

requirePurchasableSkuWrite(auth: AuthContext, tenantSupplierId: string) {
  return this.requireScope(
    auth,
    tenantSupplierId,
    ["supplier.product.manage", "supplier.cost-price.manage"],
    true,
  );
}
```

Do not weaken or replace the existing methods; existing product and price-list callers retain their current contracts.

- [ ] **Step 4: Write failing record/repository tests**

Define and test these public result shapes:

```ts
export type SupplierPurchasableSkuPriceContext = {
  currency: "CNY";
  recommended_tax_rate: string;
  recommended_tax_inclusive: false;
  next_scheduled_effective_from: string | null;
  current_price: null | {
    supplier_price_list_id: string;
    supplier_price_list_version: number;
    supplier_price_list_row_version: number;
    supplier_price_list_item_id: string;
    unit_price: string;
    tax_rate: string;
    tax_inclusive: boolean;
    effective_from: string;
    effective_until: string | null;
  };
};
```

Repository tests must assert exact RPC calls:

```ts
expect(rpc).toHaveBeenCalledWith(
  "get_supplier_purchasable_sku_price_context_v1",
  {
    p_tenant_id: TENANT_ID,
    p_tenant_supplier_id: TENANT_SUPPLIER_ID,
    p_supplier_id: SUPPLIER_ID,
    p_supplier_product_id: PRODUCT_ID,
    p_supplier_sku_id: null,
  },
);
```

For edit, pass the real SKU ID. Reject malformed envelopes, cross-scope identities, non-string decimals, extra keys, and RPC errors. Wrap database failures with `Errors.dbError("查询供应商 SKU 当前价格失败")`.

- [ ] **Step 5: Run repository tests and verify RED**

```bash
cd apps/api && bun test src/repositories/supplier-purchasable-skus.test.ts
```

Expected: FAIL because the record parser and repository do not exist.

- [ ] **Step 6: Implement the read record parser and repository**

Use a strict Zod envelope. The repository exposes only:

```ts
getPriceDefaults(input: SupplierPurchasableSkuScopeInput)
getCurrentPrice(input: SupplierPurchasableSkuScopeInput & { sku_id: string })
save(input: SupplierPurchasableSkuCommandInput)
```

Implement only the two reads in this task; declare `save` in the port later with the command envelope. Both reads call the same database helper with `p_supplier_sku_id` set to `null` or the target ID.

- [ ] **Step 7: Write failing read-service tests**

Test that `getPriceDefaults` and `getCurrentPrice`:

- call `requirePurchasableSkuPriceRead` first;
- canonicalize path/query/scope UUIDs;
- reject a supplier/product/SKU outside the resolved tenant-owned scope;
- pass only server-resolved tenant and supplier IDs to the repository;
- return `current_price: null` as 200 data;
- never fall back to a product-only read permission.

- [ ] **Step 8: Implement the read service methods and verify GREEN**

Use `supplierProductsRepository.findProduct(..., false)` to prove the product is tenant-owned before the price-context repository call. For edit, add a focused `findTenantSkuIdentity` method to the new repository rather than changing the 497-line shared repository; select only `id,supplier_id,supplier_product_id,ownership_scope,owner_tenant_id,status,version` and use `.maybeSingle()`.

Run:

```bash
cd apps/api && bun test \
  src/services/supplier-product-access.test.ts \
  src/repositories/supplier-purchasable-skus.test.ts \
  src/services/supplier-purchasable-skus.test.ts
```

Expected: all focused access and read tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/supplier-product-access.ts \
  apps/api/src/services/supplier-product-access.test.ts \
  apps/api/src/repositories/supplier-purchasable-sku-records.ts \
  apps/api/src/repositories/supplier-purchasable-skus.ts \
  apps/api/src/repositories/supplier-purchasable-skus.test.ts \
  apps/api/src/services/supplier-purchasable-skus.ts \
  apps/api/src/services/supplier-purchasable-skus.test.ts
git commit -m "feat(supplier): 读取 SKU 即时价格上下文"
```

## Task 3: Implement the Atomic Database Command

**Files:**
- Create: `apps/api/src/services/supplier-purchasable-sku-migration-contract.test.ts`
- Create: `supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql`

- [ ] **Step 1: Write the failing migration contract test**

Read the exact new migration file and extract both functions. Assert:

```ts
expect(readContext).toMatch(/SECURITY DEFINER/);
expect(readContext).toMatch(/SET search_path = pg_catalog, public/);
expect(readContext).toMatch(/price_list\.effective_from <= v_priced_at/);
expect(readContext).toMatch(/price_list\.effective_until IS NULL[\s\S]*price_list\.effective_until > v_priced_at/);
expect(readContext).toMatch(/'recommended_tax_rate',[\s\S]*COALESCE\([\s\S]*'0\.13'/);

expect(command).toMatch(/pg_advisory_xact_lock/);
expect(command.indexOf("validation_error")).toBeLessThan(
  command.indexOf("pg_advisory_xact_lock"),
);
expect(command).toMatch(/command_supplier_sku_v3/);
expect(command).toMatch(/command_supplier_price_list_v2/);
expect(command).toMatch(/command_supplier_price_item_v2/);
expect(command).toMatch(/INSERT INTO public\.supplier_price_list_items[\s\S]*SELECT/);
expect(command).toMatch(/v_immediate_effective_until := v_future_price_list\.effective_from/);
expect(command).not.toMatch(/FOREACH[\s\S]*command_supplier_price_item_v2/);
expect(command).toMatch(/supplier_purchasable_sku_v1:(create|update)/);
expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.command_supplier_purchasable_sku_v1/);
expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.command_supplier_purchasable_sku_v1[\s\S]*TO service_role/);
```

Add ordering assertions for validation, parent advisory lock, actor/relationship/product/SKU locks, price-series lock, SKU command, set-based price copy, target item upsert, source retire, new publish, purchase resolver verification, and parent audit event.

Add explicit contract assertions that the command:

- accepts `p_action` only as `create` or `update`;
- ignores/rejects client SKU code, tenant, supplier, currency, price-list code/name, and effective timestamps;
- requires expected SKU version for update;
- checks paired expected price-list ID/row version against the currently effective version;
- does not create a price version when canonical unit price, tax rate, and tax flag are unchanged;
- does not reactivate an inactive SKU;
- activates a created/draft SKU and a draft product, but rejects an inactive product;
- preserves the earliest future published version and ends the immediate version at its start;
- records the exact normalized parent request for replay comparison;
- grants both helper functions only to `service_role`.

- [ ] **Step 2: Run the migration contract and verify RED**

```bash
cd apps/api && bun test src/services/supplier-purchasable-sku-migration-contract.test.ts
```

Expected: FAIL because the migration file and functions do not exist.

- [ ] **Step 3: Create the migration shell and SQL signatures**

Use these exact function interfaces while writing the complete bodies in Steps 4-8:

```text
-- Rollback: keep the migration applied while any API revision calls these v1 functions;
-- a forward rollback first restores the previous Admin route, then revokes and drops both functions.
public.get_supplier_purchasable_sku_price_context_v1(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_supplier_sku_id uuid
): jsonb

public.command_supplier_purchasable_sku_v1(
  p_action text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_supplier_sku_id uuid,
  p_expected_sku_version integer,
  p_sku jsonb,
  p_price jsonb,
  p_expected_price_list_id uuid,
  p_expected_price_list_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
): jsonb
```

The migration itself begins with `BEGIN`, a 5-second local lock timeout, and a
5-minute local statement timeout. Both complete functions use `LANGUAGE plpgsql`,
`SECURITY DEFINER`, and `SET search_path = pg_catalog, public`. Do not execute or
commit the migration until both bodies and the revoke/grant footer are complete.

- [ ] **Step 4: Implement strict read-context resolution**

The read helper must:

1. validate all non-null scope IDs before table reads;
2. verify one active tenant/supplier relationship and a tenant-owned product;
3. if `p_supplier_sku_id` is non-null, verify that exact tenant-owned SKU belongs to the product;
4. use one `v_priced_at := transaction_timestamp()` value;
5. resolve one current published `DEFAULT`/`CNY` version with `effective_from <= v_priced_at < effective_until`;
6. resolve the target SKU item only when a SKU ID is supplied;
7. resolve the earliest future published version separately;
8. recommend the most recent current item tax rate, falling back to string `0.13`;
9. always return `currency='CNY'`, `recommended_tax_inclusive=false`, and either a strict `current_price` object or JSON null.

Do not return a list of price items.

- [ ] **Step 5: Implement pre-lock validation, replay, and lock order**

Normalize SKU code inside SQL as:

```sql
v_effective_sku := (p_sku - 'sku_code') || jsonb_build_object(
  'sku_code', 'TS-' || upper(replace(p_supplier_sku_id::text, '-', ''))
);
```

Validate the exact JSON key sets and decimal regexes before any lock. Create a parent fingerprint from all normalized inputs and use:

```sql
v_parent_key := 'supplier-purchasable-sku:' ||
  pg_catalog.md5(btrim(p_idempotency_key));
PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_parent_key, 20260901130000)
);
```

On an existing parent event, return its `to_state` with `idempotent=true` only when actor, tenant, resource, action, and normalized request match exactly; otherwise raise `SUPPLIER_IDEMPOTENCY_CONFLICT`.

- [ ] **Step 6: Implement SKU state transitions**

Under the resolved tenant scope:

- `create`: product must be `draft` or `active`; call `command_supplier_sku_v3(create)`, then `activate`; if product is draft call `command_supplier_product_v2(activate)` with its locked version.
- `update`: require the exact locked SKU version. For `draft`, call update then activate. For `active`, call update only when fields differ. For `inactive`, return `SUPPLIER_SKU_STATE_CONFLICT`; the Admin uses legacy metadata-only PATCH for this state.
- all actions: product and SKU must both be tenant-owned by `p_tenant_id`; platform rows and other-tenant rows return `SHARED_RESOURCE_READ_ONLY` or not found without leaking foreign IDs.

Use deterministic child idempotency keys derived from the parent key.

- [ ] **Step 7: Implement immediate price versioning without N+1**

Take the existing default price-series advisory lock used by `command_supplier_purchasable_product_v2`. Lock all matching `DEFAULT`/`CNY` rows in deterministic version/id order. Resolve:

- the one version effective at `v_priced_at`;
- the earliest future published version;
- any conflicting draft or overlapping published version.

If the submitted canonical price equals the current target item, set `price_version_created=false` and skip every price write.

Otherwise:

1. create a first default list, or call `command_supplier_price_list_v2(new_version)` from the current source;
2. set `effective_from=v_priced_at` and `effective_until` to the earliest future start or null;
3. verify the existing new-version command copied all source items with one set-based `INSERT ... SELECT`; if implementation requires a repair copy, it must also be one set operation;
4. call `command_supplier_price_item_v2(upsert)` once for the target SKU;
5. retire only the currently effective source version;
6. publish the new immediate version;
7. never retire, update, or supersede the future scheduled version.

If the existing v2 new-version command cannot represent the correct future boundary without mutating the future row, return `SUPPLIER_PRICE_PERIOD_CONFLICT`; do not add a bypass update.

- [ ] **Step 8: Verify the resulting purchasable fact and return a strict envelope**

Call `resolve_supplier_purchase_order_catalog` with the generated exact SKU code and `page=1,pageSize=1`. Require total 1 and exact product, SKU, price-list item, units, decimal values, tax flag, and effective interval. Build:

```json
{
  "status": "saved",
  "idempotent": false,
  "price_version_created": true,
  "product": {},
  "sku": {},
  "current_price": {},
  "catalog_item": {},
  "next_scheduled_effective_from": null,
  "available_actions": ["edit", "deactivate"]
}
```

For unchanged price, return the current immutable price object and `price_version_created=false`. Insert one parent `supplier_command_events` row with resource type `supplier_sku`, resource ID `p_supplier_sku_id`, command `supplier_purchasable_sku_v1:<action>`, normalized request, result envelope, actor IDs, and result SKU version.

- [ ] **Step 9: Add revoke/grant statements and close the migration**

```sql
REVOKE ALL ON FUNCTION public.get_supplier_purchasable_sku_price_context_v1(
  uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_supplier_purchasable_sku_price_context_v1(
  uuid, uuid, uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.command_supplier_purchasable_sku_v1(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, jsonb,
  uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.command_supplier_purchasable_sku_v1(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, jsonb,
  uuid, integer, uuid, uuid, text
) TO service_role;

COMMIT;
```

- [ ] **Step 10: Run the migration contract and existing supplier command contracts**

```bash
cd apps/api && bun test \
  src/services/supplier-purchasable-sku-migration-contract.test.ts \
  src/services/supplier-purchasable-product-migration-contract.test.ts \
  src/services/supplier-sku-system-code-migration-contract.test.ts \
  src/services/supplier-product-pricing-migration-contract.test.ts
```

Expected: all contracts PASS, including existing command compatibility.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql \
  apps/api/src/services/supplier-purchasable-sku-migration-contract.test.ts
git commit -m "feat(supplier): 原子保存 SKU 与即时价格"
```

## Task 4: Complete the Composite API Write Path

**Files:**
- Modify: `apps/api/src/repositories/supplier-purchasable-sku-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchasable-skus.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchasable-skus.ts`
- Modify: `apps/api/src/services/supplier-purchasable-skus.test.ts`
- Modify: `apps/api/src/services/supplier-purchasable-skus.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`
- Create: `apps/api/src/controllers/supplier-purchasable-skus/routes.test.ts`
- Create: `apps/api/src/controllers/supplier-purchasable-skus/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing command-envelope and repository tests**

The strict success parser must cross-check product/SKU/price/catalog identities and canonical decimals. Repository tests must assert the exact RPC payload:

```ts
expect(rpc).toHaveBeenCalledWith("command_supplier_purchasable_sku_v1", {
  p_action: "update",
  p_tenant_id: TENANT_ID,
  p_tenant_supplier_id: TENANT_SUPPLIER_ID,
  p_supplier_id: SUPPLIER_ID,
  p_supplier_product_id: PRODUCT_ID,
  p_supplier_sku_id: SKU_ID,
  p_expected_sku_version: 3,
  p_sku: {
    name: "净味乳胶漆 18L 新包装",
    specification: "18L",
    model: null,
    batch_managed: false,
    color_managed: false,
    serial_managed: false,
    spec_values: {},
  },
  p_price: {
    unit_price: "318.00",
    tax_rate: "0.13",
    tax_inclusive: false,
  },
  p_expected_price_list_id: PRICE_LIST_ID,
  p_expected_price_list_version: 5,
  p_actor_user_id: USER_ID,
  p_actor_employee_id: EMPLOYEE_ID,
  p_idempotency_key: "sku:update:price",
});
```

Assert database errors use `mapSupplierCommandDatabaseError(error) ?? Errors.dbError(...)`, malformed/identity-mismatched success envelopes become stable 500 failures, and business envelopes do not leak SQL details.

- [ ] **Step 2: Run repository tests and verify RED**

Expected: FAIL because `save` and the command result parser are incomplete.

- [ ] **Step 3: Implement repository save and error mapping**

Add this entry to `BUSINESS_ERRORS`:

```ts
SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED: {
  statusCode: 409,
  message: "保存供应商 SKU 与供货价失败",
},
```

Reuse the existing mapped errors for SKU version/state, price-list version/period, eligibility, idempotency, forbidden, and not found. Only map unknown command envelopes to the new composite failure.

- [ ] **Step 4: Write failing service write tests**

Cover create and update with these expectations:

- resolve `requirePurchasableSkuWrite` before resource reads;
- prove tenant-owned product and existing SKU ownership;
- validate specs with `validateSkuSpecsAgainstCurrentTemplate`;
- generate `TS-<32 uppercase hex>` from the path SKU UUID;
- use server scope and actor IDs, never body-supplied identity;
- create passes `expected_sku_version=null` and null expected price identity;
- update passes the exact expected SKU and price-list versions;
- preserve decimal strings and false tax flag;
- map every stable database envelope through `error-factory.ts`;
- never call legacy SKU and price repositories separately.

- [ ] **Step 5: Implement create/update service orchestration and verify GREEN**

Keep the public methods object-based to avoid long positional signatures:

```ts
create(auth: AuthContext, input: {
  tenantSupplierId: string;
  productId: string;
  skuId: string;
  body: SupplierPurchasableSkuCreateInput;
  idempotencyKey: string;
}): Promise<SupplierPurchasableSkuCommandResult>

update(auth: AuthContext, input: {
  tenantSupplierId: string;
  productId: string;
  skuId: string;
  body: SupplierPurchasableSkuUpdateInput;
  idempotencyKey: string;
}): Promise<SupplierPurchasableSkuCommandResult>
```

Do not perform multi-step writes in the service.

- [ ] **Step 6: Write failing controller route tests**

Register exactly:

```ts
[
  "GET /supplier-products/:productId/purchasable-skus/price-defaults",
  "GET /supplier-products/:productId/purchasable-skus/:skuId/price",
  "POST /supplier-products/:productId/purchasable-skus/:skuId",
  "PATCH /supplier-products/:productId/purchasable-skus/:skuId",
]
```

Assert auth is resolved first, reads do not require an idempotency header, writes require one valid non-duplicated `Idempotency-Key`, Zod rejects unknown query/body fields, each request calls the service exactly once, and responses are wrapped by `ResponseHandler.success`.

- [ ] **Step 7: Implement the controller and route registration**

Use `TenantBaseController`, `Get`, `Post`, `Patch`, `requireSupplierIdempotencyKey`, and the existing local `safeParse`/`Errors.fromZod` pattern. Add one import and one `registerExtraRoutes(app)` call in `apps/api/src/routes/index.ts`; do not use resource-factory CRUD.

- [ ] **Step 8: Run the complete focused API suite**

```bash
cd apps/api && bun test \
  src/schema/supplier-purchasable-skus.test.ts \
  src/services/supplier-product-access.test.ts \
  src/repositories/supplier-purchasable-skus.test.ts \
  src/services/supplier-purchasable-skus.test.ts \
  src/controllers/supplier-purchasable-skus/routes.test.ts \
  src/services/supplier-purchasable-sku-migration-contract.test.ts \
  src/schema/supplier-purchasable-products.test.ts \
  src/services/supplier-purchasable-products.test.ts \
  src/services/supplier-product-access.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Run static API gates**

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
```

Expected: typecheck/build PASS and every non-generated API file is below 500 lines.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/repositories/supplier-purchasable-sku-records.ts \
  apps/api/src/repositories/supplier-purchasable-skus.ts \
  apps/api/src/repositories/supplier-purchasable-skus.test.ts \
  apps/api/src/services/supplier-purchasable-skus.ts \
  apps/api/src/services/supplier-purchasable-skus.test.ts \
  apps/api/src/repositories/supplier-command-errors.ts \
  apps/api/src/controllers/supplier-purchasable-skus \
  apps/api/src/routes/index.ts
git commit -m "feat(supplier): 开放 SKU 即时价格接口"
```

## Task 5: Add the Admin Price Model and API Client

**Files:**
- Modify: `apps/admin/components/supplier-products/supplier-product-types.ts`
- Modify: `apps/admin/components/supplier-products/supplier-product-api.ts`
- Create: `apps/admin/components/supplier-products/supplier-sku-price-form.test.ts`
- Create: `apps/admin/components/supplier-products/supplier-sku-price-form.ts`

- [ ] **Step 1: Write failing pure-model tests**

Test exact defaults and payload construction without rendering React:

```ts
expect(createInitialSkuPriceForm({
  recommended_tax_rate: "0.13",
  recommended_tax_inclusive: false,
  current_price: null,
  currency: "CNY",
  next_scheduled_effective_from: null,
})).toEqual({
  unitPrice: "",
  taxRate: "0.13",
  taxInclusive: false,
});

expect(buildPurchasableSkuUpdatePayload({
  sku: { expectedVersion: 3, name: "18L" },
  priceForm: {
    unitPrice: "318.00",
    taxRate: "0.13",
    taxInclusive: false,
  },
  context: {
    current_price: {
      supplier_price_list_id: PRICE_LIST_ID,
      supplier_price_list_row_version: 5,
    },
  },
})).toMatchObject({
  sku: { expected_version: 3, name: "18L" },
  price: {
    unit_price: "318.00",
    tax_rate: "0.13",
    tax_inclusive: false,
    expected_price_list_id: PRICE_LIST_ID,
    expected_price_list_version: 5,
  },
});
```

Also assert:

- no `Number()` conversion appears in the source;
- `0`, exponent notation, too many decimals, and tax over one are invalid;
- historical nonstandard tax rates are retained as a select option;
- `canUseInlineSkuPrice` is true only for tenant scope plus product manage, cost-price view, and cost-price manage;
- inactive SKU resolves to metadata-only save mode;
- platform scope always resolves to legacy SKU mode;
- `next_scheduled_effective_from` produces a concise read-only effective-until notice.

- [ ] **Step 2: Run the model test and verify RED**

```bash
bun test apps/admin/components/supplier-products/supplier-sku-price-form.test.ts
```

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Add typed Admin contracts and API helpers**

Add these types:

```ts
export type SupplierSkuCurrentPrice = {
  supplier_price_list_id: string;
  supplier_price_list_version: number;
  supplier_price_list_row_version: number;
  supplier_price_list_item_id: string;
  unit_price: string;
  tax_rate: string;
  tax_inclusive: boolean;
  effective_from: string;
  effective_until: string | null;
};

export type SupplierSkuPriceContext = {
  currency: "CNY";
  recommended_tax_rate: string;
  recommended_tax_inclusive: false;
  next_scheduled_effective_from: string | null;
  current_price: SupplierSkuCurrentPrice | null;
};
```

Add exact API helpers:

```ts
export function buildPurchasableSkuPath(productId: string, skuId: string) {
  return `/supplier-products/${productId}/purchasable-skus/${skuId}`;
}

export function loadSupplierSkuPriceDefaults(
  scope: Extract<ProductApiScope, { kind: "tenant" }>,
  productId: string,
) {
  return requestBackendJson<SupplierSkuPriceContext>(
    `/supplier-products/${productId}/purchasable-skus/price-defaults?${scopeOnly(scope)}`,
    { fallbackMessage: "基础供货价默认值加载失败" },
  );
}

export function loadSupplierSkuCurrentPrice(
  scope: Extract<ProductApiScope, { kind: "tenant" }>,
  productId: string,
  skuId: string,
) {
  return requestBackendJson<SupplierSkuPriceContext>(
    `${buildPurchasableSkuPath(productId, skuId)}/price?${scopeOnly(scope)}`,
    { fallbackMessage: "SKU 当前供货价加载失败" },
  );
}
```

Writes continue through `createSupplierResource`/`mutateSupplierResource`, so idempotency behavior stays centralized.

- [ ] **Step 4: Implement the pure model and verify GREEN**

Use string regexes equivalent to the API schema. Export only the helpers needed by the dialog and price fields. Keep display formatting separate from submitted values.

Run:

```bash
bun test \
  apps/admin/components/supplier-products/supplier-sku-price-form.test.ts \
  apps/admin/components/supplier-products/supplier-command-attempt.test.ts \
  apps/admin/components/supplier-products/supplier-product-page.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/supplier-products/supplier-product-types.ts \
  apps/admin/components/supplier-products/supplier-product-api.ts \
  apps/admin/components/supplier-products/supplier-sku-price-form.ts \
  apps/admin/components/supplier-products/supplier-sku-price-form.test.ts
git commit -m "feat(admin): 准备 SKU 即时价格模型"
```

## Task 6: Integrate Price Fields into the SKU Dialog

**Files:**
- Create: `apps/admin/components/supplier-products/supplier-sku-price-fields.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-sku-dialog.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-sku-table.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-list.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-workspace.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-rules.ts`
- Modify: `apps/admin/components/supplier-products/supplier-product-page.test.tsx`

- [ ] **Step 1: Write failing permission and source-contract tests**

Extend the Admin source/behavior tests to prove:

- the workspace computes `canUseInlineSkuPrice` from all three permissions;
- `supplier.cost-price.manage` without `supplier.cost-price.view` does not expose the price tab or issue a price-list read;
- the flag reaches both create and edit `SupplierSkuDialog` instances;
- no price loader is called in product-only or platform mode;
- tenant combined mode calls defaults for create and current price for edit;
- inactive edit remains on `buildSkuResourcePath`, not the composite PATCH;
- active/draft combined create/edit uses `buildPurchasableSkuPath`;
- failed 409 saves do not close the dialog or reset form state.

Run and verify RED:

```bash
bun test \
  apps/admin/components/supplier-products/supplier-product-page.test.tsx \
  apps/admin/components/supplier-products/supplier-sku-price-form.test.ts
```

- [ ] **Step 2: Build the unframed price field section**

Use existing shadcn fields and controls. Do not create a nested Card. The section structure is:

```tsx
<FieldSet className="border-t pt-5">
  <FieldLegend>采购价格</FieldLegend>
  <FieldDescription>保存后立即用于新的采购业务。</FieldDescription>
  <FieldGroup className="grid gap-4 md:grid-cols-2">
    <Field>
      <FieldLabel htmlFor={priceId}>基础供货价</FieldLabel>
      <div className="relative">
        <Input id={priceId} inputMode="decimal" value={unitPrice} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          元 / {purchaseUnitSymbol}
        </span>
      </div>
    </Field>
    <Field>
      <FieldLabel htmlFor={taxRateId}>税率</FieldLabel>
      <Select>{/* 0%, 1%, 3%, 6%, 9%, 13%, plus current custom rate */}</Select>
    </Field>
  </FieldGroup>
  <Field orientation="horizontal">
    <Switch id={taxInclusiveId} checked={taxInclusive} />
    <FieldLabel htmlFor={taxInclusiveId}>含税价格</FieldLabel>
  </Field>
</FieldSet>
```

Use the existing local `Select` and `Switch` exports; verify their installed props from `apps/admin/components/ui/select.tsx` and `switch.tsx` before coding. The suffix must have enough right padding and never overlap the amount. For inactive SKUs, disable all price controls and show “启用 SKU 后可调整供货价”. If a future version exists, show “本次价格有效至 {localized time}”.

- [ ] **Step 3: Update dialog loading and save modes**

On open:

- always load spec definitions;
- only when `inlinePriceEnabled && scope.kind === "tenant"`, load defaults/current price in the same `Promise.all`;
- keep one loading state and ignore stale completion after close/unmount;
- initialize create with blank price, recommended tax, and `taxInclusive=false`;
- initialize edit from current price; old SKU without price stays blank and requires entry for save-and-effective mode.

On submit:

- platform or product-only mode: preserve the existing legacy POST/PATCH payload and toast;
- tenant combined create: composite POST, button “保存并生效”, toast “SKU 与供货价已生效”;
- tenant combined active/draft edit: composite PATCH with full normalized price and expected identities;
- inactive tenant edit: legacy metadata PATCH, price controls read-only, button “保存修改”;
- reuse `resolveSupplierCommandAttempt`, preserving one key and path/payload fingerprint across retries;
- keep the dialog open and all user input intact after conflicts.

- [ ] **Step 4: Thread permissions without changing platform behavior**

In `SupplierProductWorkspace` compute:

```ts
const canUseInlineSkuPrice = canManageProducts
  && canViewCostPrice
  && canManageCostPrice;
```

Set `canReadCostPrice` from `canViewCostPrice` only, then pass
`canUseInlineSkuPrice` through `SupplierProductList` and `SupplierSkuTable`.
Update the existing rules test that currently treats manage-only as read access: a
manage-only account may enter the product workspace only when it separately has a
product read/manage permission, and it must not load or display price data. The
platform workspace does not provide the inline flag and defaults to false. Do not
infer price permission from product ownership.

- [ ] **Step 5: Run unit/static tests and verify GREEN**

```bash
bun test \
  apps/admin/components/supplier-products/supplier-product-page.test.tsx \
  apps/admin/components/supplier-products/supplier-sku-price-form.test.ts \
  apps/admin/components/supplier-products/supplier-sku-code-management.test.ts
pnpm --dir apps/admin check
```

Expected: tests PASS, typecheck PASS, and every TS/TSX file remains at or below 500 lines.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/supplier-products/supplier-sku-price-fields.tsx \
  apps/admin/components/supplier-products/supplier-sku-dialog.tsx \
  apps/admin/components/supplier-products/supplier-sku-table.tsx \
  apps/admin/components/supplier-products/supplier-product-list.tsx \
  apps/admin/components/supplier-products/supplier-product-workspace.tsx \
  apps/admin/components/supplier-products/supplier-product-rules.ts \
  apps/admin/components/supplier-products/supplier-product-page.test.tsx
git commit -m "feat(admin): 合并 SKU 与基础供货价表单"
```

## Task 7: Cover the Tenant Workflow with Playwright

**Files:**
- Modify: `apps/admin/e2e/supplier-product-pricing-mock-state.mjs`
- Modify: `apps/admin/e2e/supplier-product-pricing-mock-handlers.mjs`
- Create: `apps/admin/e2e/supplier-sku-inline-price-workflow.spec.ts`
- Modify: `apps/admin/playwright.supplier-product-pricing.config.ts`

- [ ] **Step 1: Add failing end-to-end scenarios**

Change `testMatch` to:

```ts
testMatch: [
  "supplier-product-pricing-workflow.spec.ts",
  "supplier-sku-inline-price-workflow.spec.ts",
],
```

The new spec must cover:

1. Tenant all-permissions create: price starts blank, tax rate 13%, “含税价格” off; save emits one composite POST with decimal strings; SKU/product become active and price is immediately visible to mock purchase resolution.
2. Tenant edit: current price preloads; SKU-only change returns `price_version_created=false`; price change returns true and updates effective version.
3. Future planned version: dialog displays the effective-until notice and immediate edit leaves the future mock row untouched.
4. Inactive SKU: price fields are disabled, metadata save uses legacy PATCH, and no composite write occurs.
5. Product-only session: no price read request is recorded and legacy draft SKU creation remains available.
6. Price conflict: mock returns 409; dialog stays open with typed values and retry uses the same idempotency attempt.
7. Platform session: no inline price fields or tenant price requests appear.

Use request assertions such as:

```ts
expect(mutations).toContainEqual(expect.objectContaining({
  method: "POST",
  path: expect.stringMatching(
    /^\/supplier-products\/[^/]+\/purchasable-skus\/[^/]+$/,
  ),
  payload: expect.objectContaining({
    price: {
      unit_price: "328.00",
      tax_rate: "0.13",
      tax_inclusive: false,
    },
  }),
}));
```

- [ ] **Step 2: Run Playwright and verify RED**

```bash
pnpm --dir apps/admin test:e2e:supplier-product-pricing
```

Expected: the new spec FAILS because mock routes and UI integration are missing.

- [ ] **Step 3: Implement focused mock behavior**

Add exact GET/POST/PATCH composite routes. Store default price versions and items separately from SKU rows. The mock must enforce expected SKU and price-list versions, immediate/future intervals, idempotency replay, and inactive/product-only/platform boundaries. Do not fake success without updating the resolver state used by the test.

If `supplier-product-pricing-mock-handlers.mjs` becomes difficult to navigate, split only the new composite route functions into `supplier-sku-inline-price-mock-handlers.mjs` and import them; do not refactor unrelated mock behavior.

- [ ] **Step 4: Verify desktop and mobile layout**

In the new spec, capture the open create form at 1440x900 and 390x844. Assert:

- dialog content is scrollable and within viewport;
- amount suffix does not overlap the input value;
- tax select, switch, and primary action remain visible/reachable;
- no horizontal document overflow;
- no cards are nested inside the dialog.

Use Playwright screenshots under the normal test output directory; do not commit generated screenshots.

- [ ] **Step 5: Run Playwright and verify GREEN**

```bash
pnpm --dir apps/admin test:e2e:supplier-product-pricing
```

Expected: both existing and new pricing specs PASS on Chromium with no console errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/e2e/supplier-product-pricing-mock-state.mjs \
  apps/admin/e2e/supplier-product-pricing-mock-handlers.mjs \
  apps/admin/e2e/supplier-sku-inline-price-workflow.spec.ts \
  apps/admin/playwright.supplier-product-pricing.config.ts
git commit -m "test(admin): 覆盖 SKU 即时价格流程"
```

## Task 8: Add Development Database Smoke and EXPLAIN Gates

**Files:**
- Create: `apps/api/src/scripts/supplier-purchasable-sku-smoke.test.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-explain.test.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-explain.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-development-database.test.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-dev-direct.test.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-dev-direct.ts`
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify after migration application: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write failing smoke/explain command tests**

Test CLI configuration without connecting to a database. Require explicit URLs:

```ts
expect(() => resolveSmokeConfig({})).toThrowError(
  "缺少 SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL",
);
expect(() => resolveExplainConfig({})).toThrowError(
  "缺少 SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL",
);
```

Assert that smoke output redacts credentials and returns a structured summary containing `created`, `edited`, `replayed`, `concurrent_conflict`, `future_preserved`, `resolver_verified`, and `cleanup_verified` booleans. Assert EXPLAIN rejects plans with sequential scans on `supplier_price_lists` or `supplier_price_list_items` for the scoped test fixture.

- [ ] **Step 2: Run tests and verify RED**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT/apps/api"
  bun test \
    src/scripts/supplier-purchasable-sku-development-database.test.ts \
    src/scripts/supplier-purchasable-sku-dev-direct.test.ts \
    src/scripts/supplier-purchasable-sku-smoke.test.ts \
    src/scripts/supplier-purchasable-sku-explain.test.ts
)
```

Expected: FAIL because both scripts are absent.

- [ ] **Step 3: Implement development-only scripts**

The smoke script must create a unique tenant-private fixture and prove:

- create SKU + untaxed price makes product/SKU active and purchase resolver total exactly one;
- edit price creates a new published version and leaves the prior item immutable;
- metadata-only edit does not create another price version;
- identical idempotency replay does not duplicate rows;
- same key/different payload returns `SUPPLIER_IDEMPOTENCY_CONFLICT`;
- two concurrent writes from the same expected versions produce exactly one success and one stable version conflict;
- earliest future version and its rows remain byte-for-byte unchanged;
- inactive product, inactive SKU, platform SKU, other tenant, missing permissions, and suspended relationship are rejected;
- all created fixtures and command events are removed in cleanup, with a final zero-row verification.

The EXPLAIN script must use parameterized SQL and `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for:

1. current default price-list resolution;
2. earliest future version lookup;
3. target SKU current price-item lookup;
4. set-based source item copy.

Add package commands:

```json
"supplier:purchasable-sku:smoke": "bun src/scripts/supplier-purchasable-sku-smoke.ts",
"supplier:purchasable-sku:explain": "bun src/scripts/supplier-purchasable-sku-explain.ts",
"supplier:purchasable-sku:smoke:dev-direct": "bun src/scripts/supplier-purchasable-sku-dev-direct.ts smoke",
"supplier:purchasable-sku:explain:dev-direct": "bun src/scripts/supplier-purchasable-sku-dev-direct.ts explain"
```

The repository root package also exposes the git-common-dir-aware development
target and migration wrappers:

```json
"supplier:purchasable-sku:target:dev-direct": "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts target",
"supplier:purchasable-sku:migration:list:dev-direct": "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts migration-list",
"supplier:purchasable-sku:migration:dry-run:dev-direct": "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts migration-dry-run",
"supplier:purchasable-sku:migration:apply:dev-direct": "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts migration-apply"
```

- [ ] **Step 4: Verify script tests GREEN**

Expected: both unit tests PASS without accessing a remote database.

- [ ] **Step 5: Review and apply only the new migration to development**

The root package command locates the main checkout `.env` through
`git rev-parse --git-common-dir`, discards any ambient direct URL, normalizes
`sslmode=require` in memory, and prints only host/database/TLS. Guard each migration
sequence immediately before execution:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  bun run supplier:purchasable-sku:target:dev-direct &&
    bun run supplier:purchasable-sku:migration:list:dev-direct
  bun run supplier:purchasable-sku:target:dev-direct &&
    bun run supplier:purchasable-sku:migration:dry-run:dev-direct
)
```

Expected before apply: the only pending migration for this feature is `20260901130000_create_supplier_purchasable_sku_command.sql`. Stop if unrelated pending migrations or a production URL are detected.

After explicit development-database confirmation in the execution session:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  bun run supplier:purchasable-sku:target:dev-direct &&
    bun run supplier:purchasable-sku:migration:apply:dev-direct
  bun run supplier:purchasable-sku:target:dev-direct &&
    bun run supplier:purchasable-sku:migration:list:dev-direct
)
```

Expected: Local/Remote align through `20260901130000`. This is the only supported DDL/DML application path.

- [ ] **Step 6: Regenerate database types from development**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_WORKTREE_ROOT="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  set -a
  source "$MAIN_WORKTREE_ROOT/.env"
  set +a
  bun run supplier:purchasable-sku:target:dev-direct &&
    pnpm dlx supabase@2.99.0 gen types typescript \
      --db-url "$SUPABASE_DB_DIRECT_URL" \
      --schema public,graphql_public \
      > apps/api/src/types/database.ts
  rg -n "get_supplier_purchasable_sku_price_context_v1|command_supplier_purchasable_sku_v1" \
    apps/api/src/types/database.ts
)
```

Expected: both function signatures exist with the exact migration argument names.

- [ ] **Step 7: Run the real development smoke and EXPLAIN**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_WORKTREE_ROOT="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"
(
  set -euo pipefail
  set -a
  source "$MAIN_WORKTREE_ROOT/.env"
  set +a
  cd "$REPO_ROOT/apps/api"
  bun run supplier:purchasable-sku:smoke:dev-direct
  bun run supplier:purchasable-sku:explain:dev-direct
)
```

The dev-direct wrapper requires `SUPABASE_DB_DIRECT_URL`, derives
`sslmode=require` in memory for the exact allowlisted development host, and never
prints the URL. The original explicit-URL commands remain fail closed and require
callers to provide a fully validated URL including `sslmode`.

Expected: all smoke booleans true, cleanup true, no credentials printed, and scoped plans use indexes without N+1 behavior. If a required index is missing, add it through a new reviewed migration; do not edit the already-applied migration or create it manually.

- [ ] **Step 8: Commit**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  git add apps/api/src/scripts/supplier-purchasable-sku-smoke.ts \
    apps/api/src/scripts/supplier-purchasable-sku-smoke.test.ts \
    apps/api/src/scripts/supplier-purchasable-sku-explain.ts \
    apps/api/src/scripts/supplier-purchasable-sku-explain.test.ts \
    apps/api/src/scripts/supplier-purchasable-sku-development-database.ts \
    apps/api/src/scripts/supplier-purchasable-sku-development-database.test.ts \
    apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts \
    apps/api/src/scripts/supplier-purchasable-sku-dev-direct.ts \
    apps/api/src/scripts/supplier-purchasable-sku-dev-direct.test.ts \
    apps/api/src/types/database.ts \
    apps/api/package.json package.json
  git commit -m "test(supplier): 验证 SKU 即时价格事务"
)
```

## Task 9: Final Verification and Release Handoff

**Files:**
- Modify if implementation evidence is needed: `docs/superpowers/specs/2026-09-01-supplier-sku-inline-price-design.md`
- Create if development deployment is authorized: `docs/operations/evidence/2026-09-01-supplier-sku-inline-price.md`

- [ ] **Step 1: Run the focused API regression suite**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT/apps/api"
  bun test \
    src/schema/supplier-purchasable-skus.test.ts \
    src/repositories/supplier-purchasable-skus.test.ts \
    src/repositories/supplier-purchasable-skus-save.test.ts \
    src/services/supplier-purchasable-skus.test.ts \
    src/services/supplier-purchasable-skus-write.test.ts \
    src/controllers/supplier-purchasable-skus/routes.test.ts \
    src/services/supplier-purchasable-sku-migration-contract.test.ts \
    src/services/supplier-product-access.test.ts \
    src/schema/supplier-purchasable-products.test.ts \
    src/services/supplier-purchasable-products.test.ts \
    src/repositories/supplier-price-lists.test.ts \
    src/services/supplier-price-lists.test.ts \
    src/services/supplier-products.test.ts \
    src/scripts/supplier-purchasable-sku-smoke.test.ts \
    src/scripts/supplier-purchasable-sku-explain.test.ts \
    src/scripts/supplier-purchasable-sku-development-database.test.ts \
    src/scripts/supplier-purchasable-sku-dev-direct.test.ts
)
```

Expected: all focused API tests PASS.

- [ ] **Step 2: Run full static/build gates**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  bun run api:check
  pnpm --dir apps/admin check
  pnpm --dir apps/admin build
  pnpm --dir apps/admin test:e2e:supplier-product-pricing
  bun run check:permission-boundaries
  bun run audit:supabase-writes
)
```

Expected: every command exits 0; no file-size, permission-boundary, direct-write, type, build, or browser-console violations.

- [ ] **Step 3: Reconfirm migration alignment and API smoke**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_WORKTREE_ROOT="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  bun run supplier:purchasable-sku:target:dev-direct &&
    bun run supplier:purchasable-sku:migration:list:dev-direct
  bun run supplier:purchasable-sku:target:dev-direct &&
    bun run supplier:purchasable-sku:migration:dry-run:dev-direct
  set -a
  source "$MAIN_WORKTREE_ROOT/.env"
  set +a
  cd "$REPO_ROOT/apps/api"
  bun run supplier:purchasable-sku:smoke:dev-direct
  bun run supplier:purchasable-sku:explain:dev-direct
)
```

Expected: Local/Remote align and dry-run reports the development database is up to date.

- [ ] **Step 4: Review the diff for scope and sensitive data**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  git diff --check origin/main...HEAD
  git diff --stat origin/main...HEAD
  git status --short
  rg -n "SUPABASE_DB_DIRECT_URL=|service_role|postgres(?:ql)?://|api[_-]?key" \
    docs/operations/evidence/2026-09-01-supplier-sku-inline-price.md \
    apps/api/src/scripts/supplier-purchasable-sku-*.ts
)
```

Expected: no whitespace errors, no unrelated Orange/workspace files, no credentials, and only intended files are tracked.

- [ ] **Step 5: Record implementation evidence**

Mark the design status as implemented only after all gates pass. The evidence document records commit SHA, migration ID, development API/Admin revision, Local/Remote alignment, smoke booleans, EXPLAIN summary, Playwright result, and rollback sequence. It must contain no IDs that identify real tenants, employees, users, suppliers, or credentials.

- [ ] **Step 6: Final commit**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
(
  set -euo pipefail
  cd "$REPO_ROOT"
  git add docs/superpowers/specs/2026-09-01-supplier-sku-inline-price-design.md \
    docs/operations/evidence/2026-09-01-supplier-sku-inline-price.md
  git commit -m "docs(supplier): 记录 SKU 即时价格验收"
)
```

- [ ] **Step 7: Integration and deployment order**

1. Push the feature branch and create a PR.
2. Request code review with special attention to transaction intervals, permissions, idempotency replay, inactive state, and future scheduled prices.
3. Squash merge only after CI, development migration, API smoke, EXPLAIN, Admin build, and Playwright pass.
4. Let normal development deployment publish API first and verify its revision contains the squash SHA.
5. Deploy Admin only after the development API composite endpoints are healthy.
6. Run a sanitized development HTTP smoke for all four endpoints.
7. Production migration/API/Admin deployment requires separate explicit confirmation. Apply migration first, then API, then Admin; verify production revision and smoke before enabling the combined UI.
8. No WeChat or Douyin mini-program release is required for this feature.

## Acceptance Checklist

- [ ] Tenant all-permissions users create one private SKU and untaxed base price with one “保存并生效” action.
- [ ] The initial tax-inclusive switch is off and the default tax rate is the latest current supplier rate or 13%.
- [ ] Price values remain decimal strings through Admin, API, RPC, response, and smoke assertions.
- [ ] Editing an active/draft SKU can update price immediately; unchanged price creates no version.
- [ ] Inactive SKU metadata can be edited without hidden reactivation or hidden price writes.
- [ ] Draft product/SKU activation and inactive product rejection match the approved design.
- [ ] Future scheduled prices are neither retired nor modified by an immediate save.
- [ ] Existing purchase snapshots and immutable price history remain unchanged.
- [ ] Product-only users never issue cost-price reads and retain legacy draft SKU CRUD.
- [ ] Platform shared SKU paths and the advanced price-list tab remain compatible.
- [ ] Migration Local/Remote alignment, focused tests, full checks, build, Playwright, smoke, and EXPLAIN all pass before release.
