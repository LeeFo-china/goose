# Supplier Product Inline Catalog Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增租户私有商品时，分类和品牌搜索不到即可在下拉框内快速新建，并自动选中新建项。

**Architecture:** 后端租户目录创建接口已经支持编码、排序和平台映射字段由系统维护，本次优先做前端最小闭环。商品表单继续复用 `CatalogSearchSelect`，只在租户作用域、分类/品牌两类目录中开放 inline create，单位和平台目录保持只选不建。

**Tech Stack:** Next.js admin、React、shadcn/ui Command/Popover、sonner toast、Bun test、TypeScript typecheck。

---

### Task 1: Add API and Rule Tests

**Files:**
- Modify: `apps/admin/components/supplier-products/supplier-product-page.test.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-api.ts`

- [x] **Step 1: Write failing tests**

Add imports:

```ts
import {
  buildCatalogOptionCreateCommand,
  buildCatalogOptionListPath,
  buildRelationshipListPath,
  buildSpecDefinitionListPath,
  canCreateCatalogOptionInline,
} from "./supplier-product-api";
```

Add tests inside `describe("供应商品与供货价行为", () => { ... })`:

```ts
  test("租户分类和品牌支持快速新建命令并只提交名称", () => {
    expect(buildCatalogOptionCreateCommand(
      "categories",
      " 防水辅料 ",
      "catalog-key-1",
    )).toEqual({
      path: "/catalog/categories",
      init: {
        method: "POST",
        headers: { "Idempotency-Key": "catalog-key-1" },
        body: JSON.stringify({ name: "防水辅料" }),
      },
    });

    expect(buildCatalogOptionCreateCommand(
      "brands",
      "立邦油漆",
      "catalog-key-2",
    ).path).toBe("/catalog/brands");
  });

  test("目录快速新建只开放给租户侧分类和品牌的空结果搜索", () => {
    const tenantScope = { kind: "tenant", tenantSupplierId: "relationship-1" } as const;
    const platformScope = { kind: "platform", supplierId: "supplier-1" } as const;

    expect(canCreateCatalogOptionInline({
      kind: "categories",
      scope: tenantScope,
      keyword: "辅料",
      loading: false,
      resultCount: 0,
    })).toBe(true);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: "立邦",
      loading: false,
      resultCount: 0,
    })).toBe(true);
    expect(canCreateCatalogOptionInline({
      kind: "units",
      scope: tenantScope,
      keyword: "箱",
      loading: false,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: platformScope,
      keyword: "立邦",
      loading: false,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: " ",
      loading: false,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: "立邦",
      loading: true,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: "立邦",
      loading: false,
      resultCount: 1,
    })).toBe(false);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/admin && bun test components/supplier-products/supplier-product-page.test.tsx
```

Expected: fail because `buildCatalogOptionCreateCommand` and `canCreateCatalogOptionInline` are not exported.

### Task 2: Add Minimal API Helpers

**Files:**
- Modify: `apps/admin/components/supplier-products/supplier-product-api.ts`

- [x] **Step 1: Add helper types and functions**

Add near catalog helpers:

```ts
type CatalogKind = "categories" | "brands" | "units";
type WritableCatalogKind = "categories" | "brands";

export function canCreateCatalogOptionInline({
  kind,
  scope,
  keyword,
  loading,
  resultCount,
}: {
  kind: CatalogKind;
  scope: ProductApiScope;
  keyword: string;
  loading: boolean;
  resultCount: number;
}) {
  return (
    scope.kind === "tenant"
    && (kind === "categories" || kind === "brands")
    && keyword.trim().length > 0
    && !loading
    && resultCount === 0
  );
}

export function buildCatalogOptionCreateCommand(
  kind: WritableCatalogKind,
  name: string,
  idempotencyKey: string,
) {
  return {
    path: `/catalog/${kind}`,
    init: {
      method: "POST" as const,
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ name: name.trim() }),
    },
  };
}

export function createCatalogOption(
  kind: WritableCatalogKind,
  name: string,
  idempotencyKey: string,
) {
  const { path, init } = buildCatalogOptionCreateCommand(kind, name, idempotencyKey);
  return requestBackendJson<CatalogOption>(path, {
    ...init,
    fallbackMessage: `新建${kind === "categories" ? "分类" : "品牌"}失败`,
  });
}
```

- [x] **Step 2: Run focused test**

Run:

```bash
cd apps/admin && bun test components/supplier-products/supplier-product-page.test.tsx
```

Expected: pass.

### Task 3: Wire Inline Create Into Catalog Select

**Files:**
- Modify: `apps/admin/components/supplier-products/catalog-search-select.tsx`

- [x] **Step 1: Import icon and API helpers**

Update imports:

```ts
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import {
  canCreateCatalogOptionInline,
  createCatalogOption,
  loadCatalogOptions,
} from "./supplier-product-api";
```

- [x] **Step 2: Add creating state and derived quick-create state**

Add inside `CatalogSearchSelect`:

```ts
  const [creating, setCreating] = useState(false);
  const createKeyword = appliedKeyword.trim();
  const canQuickCreate = canCreateCatalogOptionInline({
    kind,
    scope,
    keyword: createKeyword,
    loading,
    resultCount: result.list.length,
  });
```

- [x] **Step 3: Add create handler**

Add inside `CatalogSearchSelect`:

```ts
  async function handleCreateOption() {
    if (!canQuickCreate || creating || (kind !== "categories" && kind !== "brands")) return;
    const idempotencyKey = `catalog-${kind}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    setCreating(true);
    try {
      const created = await createCatalogOption(kind, createKeyword, idempotencyKey);
      setResult((current) => ({
        ...current,
        list: [created, ...current.list.filter(({ id }) => id !== created.id)],
        pagination: {
          ...current.pagination,
          total: Math.max(current.pagination.total, current.list.length) + 1,
        },
      }));
      onChange(created.id);
      setOpen(false);
      toast.success(`已新建${label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `新建${label}失败`);
    } finally {
      setCreating(false);
    }
  }
```

- [x] **Step 4: Render quick-create command item**

Inside `CommandList`, after the normal `CommandGroup`, add:

```tsx
              {canQuickCreate ? (
                <CommandGroup>
                  <CommandItem
                    disabled={creating}
                    value={`create-${createKeyword}`}
                    onSelect={() => void handleCreateOption()}
                  >
                    {creating ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <Plus data-icon="inline-start" />
                    )}
                    <span className="truncate">新建{label}“{createKeyword}”</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
```

- [x] **Step 5: Run checks**

Run:

```bash
cd apps/admin && bun test components/supplier-products/supplier-product-page.test.tsx
cd apps/admin && pnpm run typecheck
```

Expected: both pass.

### Task 4: Commit and Push

**Files:**
- Stage only:
  - `apps/admin/components/supplier-products/supplier-product-api.ts`
  - `apps/admin/components/supplier-products/catalog-search-select.tsx`
  - `apps/admin/components/supplier-products/supplier-product-page.test.tsx`
  - `docs/superpowers/plans/2026-08-23-supplier-product-inline-catalog-create.md`

- [ ] **Step 1: Confirm status**

Run:

```bash
git status --short
```

Expected: the two pre-existing dirty files remain visible; do not stage unrelated changes unless explicitly requested.

- [ ] **Step 2: Commit**

Run:

```bash
git add apps/admin/components/supplier-products/supplier-product-api.ts \
  apps/admin/components/supplier-products/catalog-search-select.tsx \
  apps/admin/components/supplier-products/supplier-product-page.test.tsx \
  docs/superpowers/plans/2026-08-23-supplier-product-inline-catalog-create.md
git commit -m "feat: support inline tenant catalog creation"
```

- [ ] **Step 3: Push branch**

Run:

```bash
git push -u origin feature/supplier-product-inline-catalog-create
```

### Self-Review

- Spec coverage: 分类和品牌可选、找不到可新建、编码由系统生成、创建后自动选中、单位和平台目录不开放新建。
- Placeholder scan: no TBD/TODO/fill-in steps.
- Type consistency: helper kinds use `categories | brands | units` for read, `categories | brands` for write.
