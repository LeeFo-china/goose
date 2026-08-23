# Tenant Private Product Auto Code And Catalog Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenant private supplier product creation no longer asks operators to type a product code, and category/brand fields behave like searchable select controls.

**Architecture:** Keep platform supplier product creation unchanged because platform catalog codes are master-data identifiers. For tenant private products, make `product_code` optional at the HTTP schema boundary and generate a stable code in `SupplierProductsService` from the already allocated product UUID. Replace the current two-row catalog picker UI with a single shadcn/Radix popover command selector that still uses paginated backend search.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase RPC repository, Next.js 15 admin, shadcn/Radix components, Tailwind v3.

---

## File Structure

- Modify `apps/api/src/schema/supplier-products.ts`
  - Tenant create schema accepts missing `product_code`.
  - Platform create schema still requires `product_code`.
- Modify `apps/api/src/schema/supplier-products.test.ts`
  - Red/green tests for tenant auto-code input and platform strictness.
- Modify `apps/api/src/services/supplier-products.ts`
  - Generate product code when tenant create payload omits one.
- Modify `apps/api/src/services/supplier-products.test.ts`
  - Verify generated code is sent to repository and legacy explicit codes still pass through.
- Modify `apps/admin/components/supplier-products/supplier-product-dialog.tsx`
  - Hide editable code field for tenant create.
  - Keep code field for edit and platform create/edit.
  - Omit `product_code` from tenant create payload.
- Add `apps/admin/components/supplier-products/supplier-product-dialog-state.ts`
  - Pure helpers for dialog defaults, validation, and create/update payload shaping.
- Add `apps/admin/components/supplier-products/supplier-product-dialog-state.test.ts`
  - Frontend behavior tests without requiring a DOM test harness.
- Modify `apps/admin/components/supplier-products/catalog-search-select.tsx`
  - Turn current search input + button + select + pagination controls into one searchable popover select.
- Modify `apps/admin/components/supplier-products/supplier-product-page.test.tsx`
  - Keep API path assertions and add lightweight label/option formatting tests if needed.

---

## Task 1: Backend Tenant Product Auto Code Contract

**Files:**
- Modify: `apps/api/src/schema/supplier-products.ts`
- Modify: `apps/api/src/schema/supplier-products.test.ts`
- Modify: `apps/api/src/services/supplier-products.ts`
- Modify: `apps/api/src/services/supplier-products.test.ts`

- [x] **Step 1: Write the failing schema tests**

Add expectations to `apps/api/src/schema/supplier-products.test.ts`:

```ts
test("tenant product creates may omit product code for automatic generation", () => {
  expect(SupplierProductCreateSchema.parse({
    name: "瓷砖",
    category_id: categoryId,
    brand_id: brandId,
  })).toEqual({
    name: "瓷砖",
    category_id: categoryId,
    brand_id: brandId,
  });
});

test("platform product creates still require explicit product code", () => {
  const productSchema = supplierProductSchemas.PlatformSupplierProductCreateSchema;

  expect(productSchema.safeParse({
    name: "平台瓷砖",
    category_id: categoryId,
    brand_id: brandId,
  }).success).toBe(false);
});
```

- [x] **Step 2: Run schema tests and verify RED**

Run:

```bash
bun test src/schema/supplier-products.test.ts
```

Expected: the new tenant omit-code test fails because `product_code` is required.

- [x] **Step 3: Update tenant create schema only**

In `apps/api/src/schema/supplier-products.ts`, split the product fields:

```ts
const productFields = {
  product_code: requiredText(
    80,
    "商品编码不能为空",
    "商品编码不能超过 80 个字符",
  ),
  name: requiredText(160, "商品名称不能为空", "商品名称不能超过 160 个字符"),
  category_id: uuid("无效的目录分类 ID"),
  brand_id: uuid("无效的目录品牌 ID"),
  description: optionalText(1000, "商品说明不能超过 1000 个字符"),
};

export const SupplierProductCreateSchema = z.object({
  ...productFields,
  product_code: productFields.product_code.optional(),
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const PlatformSupplierProductCreateSchema = z.object({
  ...productFields,
}).strict();
```

- [x] **Step 4: Run schema tests and verify GREEN**

Run:

```bash
bun test src/schema/supplier-products.test.ts
```

Expected: all supplier product schema tests pass.

- [x] **Step 5: Write failing service tests**

Add to `apps/api/src/services/supplier-products.test.ts`:

```ts
test("generates a stable tenant product code when omitted", async () => {
  const deps = dependencies();
  const { SupplierProductsService } = await import("./supplier-products");
  const service = new SupplierProductsService(deps as never);

  await service.createProduct(
    {} as never,
    TENANT_SUPPLIER_ID,
    PRODUCT_ID,
    {
      name: "自动编码商品",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      description: null,
    } as never,
    "product:auto-code",
  );

  expect(deps.repository.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({
      product_id: PRODUCT_ID,
      product_code: "TP-60000000000040008000000000000006",
      name: "自动编码商品",
    }),
  );
});

test("keeps explicit tenant product codes for backwards compatibility", async () => {
  const deps = dependencies();
  const { SupplierProductsService } = await import("./supplier-products");
  const service = new SupplierProductsService(deps as never);

  await service.createProduct(
    {} as never,
    TENANT_SUPPLIER_ID,
    PRODUCT_ID,
    {
      product_code: "P-LEGACY",
      name: "旧版商品",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      description: null,
    } as never,
    "product:legacy-code",
  );

  expect(deps.repository.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ product_code: "P-LEGACY" }),
  );
});
```

- [x] **Step 6: Run service tests and verify RED**

Run:

```bash
bun test src/services/supplier-products.test.ts
```

Expected: generated-code test fails because the service currently forwards missing `product_code`.

- [x] **Step 7: Implement stable auto-code generation in service**

In `apps/api/src/services/supplier-products.ts`, add a helper near the bottom:

```ts
function generatedTenantProductCode(productId: string) {
  return `TP-${productId.replaceAll("-", "").toUpperCase()}`;
}
```

Update `createProduct`:

```ts
const productCode = safeInput.product_code?.trim() ||
  generatedTenantProductCode(productId);
return requireCommand(await this.repository.createProduct({
  ...safeInput,
  product_code: productCode,
  product_id: productId,
  ...commandContext(scope, idempotencyKey),
}));
```

- [x] **Step 8: Run backend tests and verify GREEN**

Run:

```bash
bun test src/schema/supplier-products.test.ts src/services/supplier-products.test.ts src/repositories/supplier-products.test.ts
```

Expected: all selected backend tests pass.

---

## Task 2: Frontend Dialog Payload And Code Field UX

**Files:**
- Create: `apps/admin/components/supplier-products/supplier-product-dialog-state.ts`
- Create: `apps/admin/components/supplier-products/supplier-product-dialog-state.test.ts`
- Modify: `apps/admin/components/supplier-products/supplier-product-dialog.tsx`

- [x] **Step 1: Write failing frontend helper tests**

Create `apps/admin/components/supplier-products/supplier-product-dialog-state.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  buildSupplierProductDialogPayload,
  shouldShowProductCodeField,
} from "./supplier-product-dialog-state";

const tenantScope = {
  kind: "tenant" as const,
  tenantSupplierId: "relationship-1",
};
const platformScope = {
  kind: "platform" as const,
  supplierId: "supplier-1",
};

describe("supplier product dialog state", () => {
  test("tenant creates omit product code and rely on backend generation", () => {
    expect(shouldShowProductCodeField(tenantScope, undefined)).toBe(false);
    expect(buildSupplierProductDialogPayload({
      scope: tenantScope,
      product: undefined,
      productCode: "",
      name: "瓷砖",
      categoryId: "category-1",
      brandId: "brand-1",
      description: "",
    })).toEqual({
      name: "瓷砖",
      category_id: "category-1",
      brand_id: "brand-1",
      description: null,
    });
  });

  test("platform creates and edits keep explicit product codes", () => {
    expect(shouldShowProductCodeField(platformScope, undefined)).toBe(true);
    expect(buildSupplierProductDialogPayload({
      scope: platformScope,
      product: undefined,
      productCode: "P-1",
      name: "平台瓷砖",
      categoryId: "category-1",
      brandId: "brand-1",
      description: "说明",
    })).toEqual({
      product_code: "P-1",
      name: "平台瓷砖",
      category_id: "category-1",
      brand_id: "brand-1",
      description: "说明",
    });
  });
});
```

- [x] **Step 2: Run frontend helper tests and verify RED**

Run:

```bash
bun test components/supplier-products/supplier-product-dialog-state.test.ts
```

Expected: fails because helper file does not exist.

- [x] **Step 3: Add pure helper**

Create `apps/admin/components/supplier-products/supplier-product-dialog-state.ts`:

```ts
import type { ProductApiScope, SupplierProduct } from "./supplier-product-types";

export type SupplierProductDialogForm = {
  scope: ProductApiScope;
  product?: SupplierProduct;
  productCode: string;
  name: string;
  categoryId: string;
  brandId: string;
  description: string;
};

export function shouldShowProductCodeField(
  scope: ProductApiScope,
  product?: SupplierProduct,
) {
  return scope.kind === "platform" || Boolean(product);
}

export function isSupplierProductDialogInvalid(input: SupplierProductDialogForm) {
  const requiresCode = shouldShowProductCodeField(input.scope, input.product);
  return (
    (requiresCode && !input.productCode.trim()) ||
    !input.name.trim() ||
    !input.categoryId ||
    !input.brandId
  );
}

export function buildSupplierProductDialogPayload(
  input: SupplierProductDialogForm,
) {
  const fields: Record<string, unknown> = {
    name: input.name.trim(),
    category_id: input.categoryId,
    brand_id: input.brandId,
    description: input.description.trim() || null,
  };
  if (shouldShowProductCodeField(input.scope, input.product)) {
    fields.product_code = input.productCode.trim();
  }
  if (input.product) {
    fields.expected_version = input.product.version;
  }
  return fields;
}
```

- [x] **Step 4: Wire dialog to helper**

In `apps/admin/components/supplier-products/supplier-product-dialog.tsx`:

```ts
import {
  buildSupplierProductDialogPayload,
  isSupplierProductDialogInvalid,
  shouldShowProductCodeField,
} from "./supplier-product-dialog-state";
```

Replace invalid and fields calculation:

```ts
const showProductCodeField = shouldShowProductCodeField(scope, product);
const invalid = isSupplierProductDialogInvalid({
  scope,
  product,
  productCode,
  name,
  categoryId,
  brandId,
  description,
});
```

In `submit()`:

```ts
const payload = buildSupplierProductDialogPayload({
  scope,
  product,
  productCode,
  name,
  categoryId,
  brandId,
  description,
});
```

In JSX, render product code only when needed:

```tsx
{showProductCodeField ? (
  <Field>
    <FieldLabel htmlFor={`supplier-product-code-${product?.id ?? "new"}`}>
      商品编码
    </FieldLabel>
    <Input
      id={`supplier-product-code-${product?.id ?? "new"}`}
      value={productCode}
      maxLength={80}
      onChange={(event) => setProductCode(event.target.value)}
    />
  </Field>
) : (
  <Field data-disabled>
    <FieldLabel>商品编码</FieldLabel>
    <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
      保存后系统自动生成
    </div>
  </Field>
)}
```

- [x] **Step 5: Run frontend helper tests and admin typecheck**

Run:

```bash
bun test components/supplier-products/supplier-product-dialog-state.test.ts
pnpm --dir apps/admin run typecheck
```

Expected: helper tests pass and admin typecheck passes.

---

## Task 3: Searchable Catalog Select

**Files:**
- Modify: `apps/admin/components/supplier-products/catalog-search-select.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-page.test.tsx`

- [x] **Step 1: Add formatting helper tests**

Export `catalogOptionLabel` and add to `apps/admin/components/supplier-products/supplier-product-page.test.tsx`:

```ts
import { catalogOptionLabel } from "./catalog-search-select";

test("目录选择项展示名称、编码和来源", () => {
  expect(catalogOptionLabel({
    id: "category-1",
    code: "CAT-1",
    name: "地砖",
    full_name: "主材 / 瓷砖 / 地砖",
    ownership_scope: "tenant",
    owner_tenant_id: "tenant-1",
  })).toBe("主材 / 瓷砖 / 地砖 · CAT-1 · 租户私有");
});
```

- [x] **Step 2: Run test and verify current behavior**

Run:

```bash
bun test components/supplier-products/supplier-product-page.test.tsx
```

Expected: test fails until `catalogOptionLabel` is exported.

- [x] **Step 3: Replace two-row picker with popover command selector**

In `apps/admin/components/supplier-products/catalog-search-select.tsx`, import shadcn/Radix primitives:

```ts
import { Check, ChevronsUpDown, Search } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
```

Replace the rendered field body with a single trigger:

```tsx
const [open, setOpen] = useState(false);
const selected = options.find((option) => option.value === value);

return (
  <Field data-disabled={loading}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={loading && options.length === 0}
        >
          <span className="truncate">
            {selected?.label ?? (loading ? `${label}加载中` : `请选择${label}`)}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={keyword}
            placeholder={`搜索${label}名称或编码`}
            onValueChange={(next) => {
              setKeyword(next);
              setPage(1);
              setAppliedKeyword(next.trim());
            }}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? `${label}加载中` : `暂无可用${label}`}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "opacity-0",
                      option.value === value && "opacity-100",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {result.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-2 py-2 text-xs text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <span>{page} / {totalPages}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  </Field>
);
```

Keep the existing paginated `loadCatalogOptions()` call. Do not fetch all categories or brands without a page bound.

- [x] **Step 4: Run frontend tests and typecheck**

Run:

```bash
bun test components/supplier-products/supplier-product-page.test.tsx components/supplier-products/supplier-product-dialog-state.test.ts
pnpm --dir apps/admin run typecheck
```

Expected: tests and typecheck pass.

---

## Task 4: Smoke Verification And Commit

**Files:**
- No new code files unless a previous task reveals a compile issue.

- [x] **Step 1: Run backend verification**

Run:

```bash
bun --cwd apps/api test src/schema/supplier-products.test.ts src/services/supplier-products.test.ts src/repositories/supplier-products.test.ts
bun run --cwd apps/api build
```

Expected: tests pass and API build succeeds.

- [x] **Step 2: Run admin verification**

Run:

```bash
bun --cwd apps/admin test components/supplier-products/supplier-product-page.test.tsx components/supplier-products/supplier-product-dialog-state.test.ts
pnpm --dir apps/admin run typecheck
```

Expected: tests pass and admin typecheck succeeds.

- [x] **Step 3: Optional browser smoke**

Start admin dev server only after static checks pass:

```bash
pnpm --dir apps/admin run dev
```

Open the supplier products page for an admin tenant. Verify:

- New tenant private product dialog shows `商品编码` as read-only text `保存后系统自动生成`.
- Category and brand each open one popover selector with search inside the dropdown.
- Saving a tenant product succeeds without `product_code` in the request payload.
- Created row displays a generated code starting with `TP-`.
- Platform product creation still requires manual `商品编码`.

- [x] **Step 4: Final diff and commit**

Run:

```bash
git diff --check
git status --short
```

Stage only files touched by this plan, avoiding unrelated dirty files:

```bash
git add \
  apps/api/src/schema/supplier-products.ts \
  apps/api/src/schema/supplier-products.test.ts \
  apps/api/src/services/supplier-products.ts \
  apps/api/src/services/supplier-products.test.ts \
  apps/admin/components/supplier-products/catalog-search-select.tsx \
  apps/admin/components/supplier-products/supplier-product-dialog.tsx \
  apps/admin/components/supplier-products/supplier-product-dialog-state.ts \
  apps/admin/components/supplier-products/supplier-product-dialog-state.test.ts \
  apps/admin/components/supplier-products/supplier-product-page.test.tsx
git commit -m "feat(suppliers): 自动生成租户私有商品编码"
```

Expected: commit contains only this feature.

---

## Self-Review

- Spec coverage:
  - Tenant private product code auto generation: Task 1 and Task 2.
  - Category and brand select interaction: Task 3.
  - Platform product code remains explicit: Task 1 and Task 2.
  - Pagination/performance boundary preserved: Task 3 keeps server-paged options.
- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified "add tests" steps.
- Type consistency:
  - `ProductApiScope`, `SupplierProduct`, `SupplierProductCreateSchema`, and `SupplierProductsService.createProduct` match existing files.
  - Generated code format `TP-${productId.replaceAll("-", "").toUpperCase()}` fits existing `product_code` max length.
