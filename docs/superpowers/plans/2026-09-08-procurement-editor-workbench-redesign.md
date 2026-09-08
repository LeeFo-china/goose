# 采购创建弹层工作台重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Admin 的“新建采购批次”和“发起采购申请”重构为商品优先的双栏采购工作台，并通过 `@gooes/domain` 向小程序提供一致的采购用途建议。

**Architecture:** 保留两个采购入口各自的 API、命令恢复和审批边界，只共享采购用途、补充信息、工作台布局、确认弹层及汇总规则等表现层能力。批次目录在现有分页查询上接入分类和供应商筛选；分类筛选通过采购批次权限域内新增的只读叶子分类选项接口，供应商筛选复用现有分页选项；采购申请保持单供应商关键词分页。数据库字段和命令契约不变，页面仍将“采购用途”发送为 `reason`。

**Tech Stack:** TypeScript、React 19、Next.js 15、Tailwind CSS、shadcn/Radix、Bun test、Playwright、`@gooes/domain`

---

## 文件结构

新增文件：

- `apps/admin/components/supplier-procurement-editor/procurement-editor-rules.ts`：跨入口的参考金额、供应商数、待补分类数和上下文切换判断。
- `apps/admin/components/supplier-procurement-editor/procurement-editor-rules.test.ts`：纯规则单元测试。
- `apps/admin/components/supplier-procurement-editor/procurement-purpose-field.tsx`：共享采购用途快捷项和自定义单行输入。
- `apps/admin/components/supplier-procurement-editor/procurement-remark-field.tsx`：默认折叠的备注输入。
- `apps/admin/components/supplier-procurement-editor/procurement-workbench-layout.tsx`：标题、上下文、双栏和固定页脚布局。
- `apps/admin/components/supplier-procurement-editor/procurement-confirm-dialog.tsx`：切换上下文和放弃未保存内容的确认弹层。
- `apps/admin/components/supplier-purchase-batches/batch-catalog-filters.tsx`：批次分类与供应商分页筛选。
- `apps/admin/components/supplier-purchase-batches/batch-cost-category-picker.tsx`：右栏内联成本类目选择。
- `docs/2026-09-08-procurement-purpose-miniprogram-handoff.md`：小程序共享包升级和 UI 对接说明。

修改文件：

- `apps/api/src/controllers/supplier-purchase-batches/index.ts`、`routes.test.ts`、`services/supplier-purchase-batches.ts`、`services/supplier-purchase-batches.test.ts`、`repositories/supplier-purchase-batch-catalog.ts`、`schema/supplier-purchase-batches.ts`：批次叶子分类选项只读接口及契约测试。
- `apps/api/src/repositories/supplier-purchase-batch-catalog.test.ts`：批次分类选项 repository 测试。
- `packages/domain/src/supplier-purchase-batch.ts`、`supplier-purchase-batch.test.ts`：共享用途建议。
- `packages/domain/package.json`、`bun.lock`：补丁版本升级到 `1.21.1` 并同步锁文件。
- `packages/domain/scripts/verify-packed-consumer.mjs`：指定制品消费验证和采购用途断言。
- `apps/admin/components/supplier-purchase-batches/batch-api.ts`、`batch-api.test.ts`：目录筛选和筛选选项请求。
- `apps/admin/components/supplier-purchase-batches/batch-types.ts`、`batch-rules.ts`、`batch-rules.test.ts`：目录参考价事实和结构化校验。
- `apps/admin/components/supplier-purchase-batches/batch-catalog.tsx`、`batch-lines.tsx`、`batch-editor.tsx`：批次工作台。
- `apps/admin/components/supplier-purchase-requisitions/requisition-page-utils.ts`、`requisition-page.test.ts`：采购用途文案和工作台汇总输入。
- `apps/admin/components/supplier-purchase-requisitions/requisition-editor-fields.tsx`、`requisition-editor-lines.tsx`、`requisition-editor.tsx`：采购申请工作台。
- `apps/admin/e2e/supplier-purchase-batch-mock-backend.mjs`、`supplier-purchase-batch-workflow.spec.ts`：批次筛选、确认和双栏验收。
- `apps/admin/e2e/supplier-purchase-requisition-workflow.spec.ts`：申请工作台验收。

不修改：

- 不修改既有保存 API、Supabase migration 和数据库结构。
- `/Users/leefo/Public/work/orange` 中任何文件。
- 现有 `reason` 请求字段、幂等键、版本号和服务端计价规则。

允许的后端例外：仅新增批次权限域内的只读分类选项接口及其 controller/service/repository/schema、路由和契约测试；不新增数据库表、字段、RPC 或 migration。

### Task 1: 提交已确认的设计与实施基线

**Files:**

- Add: `docs/superpowers/specs/2026-09-08-procurement-editor-workbench-redesign.md`
- Add: `docs/superpowers/plans/2026-09-08-procurement-editor-workbench-redesign.md`

- [ ] **Step 1: 检查设计文档与计划没有空白占位**

Run:

```bash
rg -n "TB[D]|TO[D]O|implement[ ]later|稍后[ ]补充" \
  docs/superpowers/specs/2026-09-08-procurement-editor-workbench-redesign.md \
  docs/superpowers/plans/2026-09-08-procurement-editor-workbench-redesign.md
```

Expected: 无输出，退出码为 1。

- [ ] **Step 2: 检查文档差异格式**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；状态只包含两份新文档和执行前已存在的 `.artifacts/`。

- [ ] **Step 3: 提交设计与计划**

```bash
git add \
  docs/superpowers/specs/2026-09-08-procurement-editor-workbench-redesign.md \
  docs/superpowers/plans/2026-09-08-procurement-editor-workbench-redesign.md
git commit -m "docs(procurement): 确认采购工作台重构设计"
```

Expected: 只提交两份 Markdown 文档，不提交 `.artifacts/`。

### Task 2: 在共享包定义采购用途建议

**Files:**

- Modify: `packages/domain/src/supplier-purchase-batch.test.ts`
- Modify: `packages/domain/src/supplier-purchase-batch.ts`
- Modify: `packages/domain/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: 先写共享用途建议失败测试**

在 `supplier-purchase-batch.test.ts` 的 import 中加入
`SUPPLIER_PURCHASE_PURPOSE_PRESETS`，并增加：

```ts
test("exports destination-aware purchase purpose suggestions", () => {
  expect(SUPPLIER_PURCHASE_PURPOSE_PRESETS).toEqual({
    project: ["项目备料", "现场补料"],
    warehouse: ["仓库补货"],
  });
  expect(
    Object.values(SUPPLIER_PURCHASE_PURPOSE_PRESETS).flat(),
  ).not.toContain("其他");
});
```

- [ ] **Step 2: 运行测试并确认因导出缺失而失败**

Run:

```bash
bun test packages/domain/src/supplier-purchase-batch.test.ts
```

Expected: FAIL，错误指向 `SUPPLIER_PURCHASE_PURPOSE_PRESETS` 未导出。

- [ ] **Step 3: 增加稳定建议配置而不收紧 reason 类型**

在 `packages/domain/src/supplier-purchase-batch.ts` 状态值之前加入：

```ts
export const SUPPLIER_PURCHASE_PURPOSE_PRESETS = {
  project: ["项目备料", "现场补料"],
  warehouse: ["仓库补货"],
} as const satisfies Record<"project" | "warehouse", readonly string[]>;

export type SupplierPurchasePurposePreset =
  (typeof SUPPLIER_PURCHASE_PURPOSE_PRESETS)[keyof typeof SUPPLIER_PURCHASE_PURPOSE_PRESETS][number];
```

不要新增 `reason` 枚举或 Zod 限制；历史自由文本必须继续有效。

- [ ] **Step 4: 升级共享包补丁版本并同步 Bun 锁文件**

使用补丁将 `packages/domain/package.json` 修改为：

```json
"version": "1.21.1"
```

运行 `bun install --lockfile-only` 同步根目录 `bun.lock` 中 `packages/domain` 的 workspace 版本，
并断言 lockfile 与 `packages/domain/package.json` 保持一致。

- [ ] **Step 5: 运行共享包测试与构建**

Run:

```bash
bun test packages/domain/src/supplier-purchase-batch.test.ts
bun run --cwd packages/domain build
bun run --cwd packages/domain verify:packed-consumer
```

Expected: 三条命令全部退出 0；`dist/supplier-purchase-batch.d.ts` 可以检索到新常量。

- [ ] **Step 6: 提交共享契约**

```bash
git add \
  bun.lock \
  packages/domain/package.json \
  packages/domain/src/supplier-purchase-batch.ts \
  packages/domain/src/supplier-purchase-batch.test.ts
git commit -m "feat(domain): 统一采购用途建议"
```

### Task 3: 建立共享工作台规则和 UI 原语

**Files:**

- Create: `apps/admin/components/supplier-procurement-editor/procurement-editor-rules.test.ts`
- Create: `apps/admin/components/supplier-procurement-editor/procurement-editor-rules.ts`
- Create: `apps/admin/components/supplier-procurement-editor/procurement-purpose-field.tsx`
- Create: `apps/admin/components/supplier-procurement-editor/procurement-remark-field.tsx`
- Create: `apps/admin/components/supplier-procurement-editor/procurement-workbench-layout.tsx`
- Create: `apps/admin/components/supplier-procurement-editor/procurement-confirm-dialog.tsx`

- [ ] **Step 1: 先写参考货值和确认规则测试**

创建测试文件：

```ts
import { describe, expect, test } from "bun:test";

import {
  procurementSummary,
  shouldConfirmContextChange,
} from "./procurement-editor-rules";

describe("procurement editor rules", () => {
  test("summarizes decimal quantities without Number precision loss", () => {
    expect(procurementSummary([
      {
        supplierId: "supplier-a",
        quantity: "2.5",
        unitPrice: "88.00",
        costCategoryId: "category-a",
      },
      {
        supplierId: "supplier-b",
        quantity: "1",
        unitPrice: "139.00",
        costCategoryId: "",
      },
    ])).toEqual({
      itemCount: 2,
      supplierCount: 2,
      missingCategoryCount: 1,
      referenceAmount: "359.00",
    });
  });

  test("rounds reference line value to cents and tolerates missing catalog facts", () => {
    expect(procurementSummary([
      {
        supplierId: "supplier-a",
        quantity: "0.3333",
        unitPrice: "10.00",
        costCategoryId: "category-a",
      },
      {
        quantity: "1",
        unitPrice: null,
        costCategoryId: "category-b",
      },
    ]).referenceAmount).toBe("3.33");
  });

  test("only asks before changing context when products are selected", () => {
    expect(shouldConfirmContextChange(0)).toBe(false);
    expect(shouldConfirmContextChange(1)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run:

```bash
(cd apps/admin && bun test components/supplier-procurement-editor/procurement-editor-rules.test.ts)
```

Expected: FAIL，提示找不到 `procurement-editor-rules`。

- [ ] **Step 3: 实现不经过浮点数的参考货值规则**

创建 `procurement-editor-rules.ts`：

```ts
const QUANTITY_SCALE = BigInt(10_000);
const CENTS_SCALE = BigInt(100);

export type ProcurementSummaryLine = {
  supplierId?: string | null;
  quantity: string;
  unitPrice?: string | null;
  costCategoryId: string;
};

export type ProcurementSummary = {
  itemCount: number;
  supplierCount: number;
  missingCategoryCount: number;
  referenceAmount: string;
};

export function procurementSummary(
  lines: readonly ProcurementSummaryLine[],
): ProcurementSummary {
  const supplierIds = new Set(
    lines.map(({ supplierId }) => supplierId).filter(
      (value): value is string => Boolean(value),
    ),
  );
  const cents = lines.reduce((total, line) => {
    const quantity = scaledDecimal(line.quantity, 4);
    const unitPrice = scaledDecimal(line.unitPrice ?? "", 2);
    if (quantity === null || unitPrice === null) return total;
    return total + roundDivide(quantity * unitPrice, QUANTITY_SCALE);
  }, BigInt(0));
  return {
    itemCount: lines.length,
    supplierCount: supplierIds.size,
    missingCategoryCount: lines.filter(({ costCategoryId }) =>
      !costCategoryId
    ).length,
    referenceAmount: `${cents / CENTS_SCALE}.${
      (cents % CENTS_SCALE).toString().padStart(2, "0")
    }`,
  };
}

export function shouldConfirmContextChange(selectedItemCount: number) {
  return selectedItemCount > 0;
}

function scaledDecimal(value: string, scale: number): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[2]?.length ?? 0) > scale) return null;
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(scale, "0");
  return BigInt(`${whole}${fraction}`);
}

function roundDivide(value: bigint, divisor: bigint) {
  return (value + divisor / BigInt(2)) / divisor;
}
```

- [ ] **Step 4: 运行规则测试**

Run:

```bash
(cd apps/admin && bun test components/supplier-procurement-editor/procurement-editor-rules.test.ts)
```

Expected: 3 tests PASS。

- [ ] **Step 5: 实现共享采购用途字段**

创建 `procurement-purpose-field.tsx`，核心公开接口和状态规则为：

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { SUPPLIER_PURCHASE_PURPOSE_PRESETS } from "@gooes/domain";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ProcurementPurposeField({
  destinationType,
  value,
  disabled,
  error,
  onChange,
}: {
  destinationType: "project" | "warehouse";
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const presets = SUPPLIER_PURCHASE_PURPOSE_PRESETS[destinationType];
  const isPreset = useMemo(
    () => presets.some((preset) => preset === value),
    [presets, value],
  );
  const [custom, setCustom] = useState(Boolean(value) && !isPreset);

  useEffect(() => {
    if (value && !isPreset) setCustom(true);
  }, [isPreset, value]);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id="procurement-purpose-label">采购用途</FieldLabel>
      <div
        role="group"
        aria-labelledby="procurement-purpose-label"
        className="flex min-w-0 flex-wrap gap-2"
      >
        {presets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={value === preset ? "default" : "outline"}
            disabled={disabled}
            aria-pressed={value === preset}
            onClick={() => {
              setCustom(false);
              onChange(preset);
            }}
          >
            {preset}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={custom ? "default" : "outline"}
          disabled={disabled}
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            if (isPreset) onChange("");
          }}
        >
          其他
        </Button>
      </div>
      {custom ? (
        <Input
          id="procurement-purpose-custom"
          aria-label="自定义采购用途"
          value={isPreset ? "" : value}
          maxLength={500}
          disabled={disabled}
          placeholder="一句话说明采购用途"
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
```

- [ ] **Step 6: 实现备注折叠、工作台布局和确认弹层**

`procurement-remark-field.tsx` 使用现有 `Collapsible`，按钮文案必须随状态变化：

```tsx
<Collapsible open={open} onOpenChange={setOpen}>
  <CollapsibleTrigger asChild>
    <Button type="button" variant="ghost" size="sm" disabled={disabled}>
      补充信息
      <span className="text-muted-foreground">
        {value.trim() ? "已填写备注" : "选填"}
      </span>
      <ChevronDown className={cn("size-4", open && "rotate-180")} />
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent className="pt-2">
    <Field>
      <FieldLabel htmlFor="procurement-remark">备注</FieldLabel>
      <Textarea
        id="procurement-remark"
        value={value}
        maxLength={500}
        disabled={disabled}
        placeholder="补充到货、搬运或现场要求"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  </CollapsibleContent>
</Collapsible>
```

`procurement-workbench-layout.tsx` 只接受 slot，不持有业务状态：

```tsx
export function ProcurementWorkbenchLayout({
  title,
  context,
  alerts,
  catalog,
  selection,
  footer,
}: {
  title: string;
  context: React.ReactNode;
  alerts?: React.ReactNode;
  catalog: React.ReactNode;
  selection: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {alerts}
      <div className="shrink-0 border-b bg-muted/20 px-5 py-3">
        {context}
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)]">
        <section aria-label="可采购商品" className="min-h-0 overflow-y-auto border-r">
          {catalog}
        </section>
        <section aria-label="已选商品" className="min-h-0 overflow-y-auto">
          {selection}
        </section>
      </div>
      <div className="shrink-0 border-t bg-background px-5 py-3">
        {footer}
      </div>
    </div>
  );
}
```

`procurement-confirm-dialog.tsx` 接受 `open/title/description/confirmLabel` 和
`onCancel/onConfirm`，使用现有 `AlertDialog`，不在共享组件中保存采购业务状态。

- [ ] **Step 7: 静态检查共享组件并提交**

Run:

```bash
pnpm --dir apps/admin exec eslint \
  components/supplier-procurement-editor
pnpm --dir apps/admin run typecheck
```

Expected: ESLint 和 TypeScript 均退出 0。

```bash
git add apps/admin/components/supplier-procurement-editor
git commit -m "feat(admin): 建立采购工作台共享组件"
```

### Task 4: 接入批次目录分类与供应商分页筛选

**Files:**

- Modify: `apps/api/src/controllers/supplier-purchase-batches/index.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts`
- Create: `apps/api/src/repositories/supplier-purchase-batch-catalog.ts`
- Create: `apps/api/src/repositories/supplier-purchase-batch-catalog.test.ts`
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-api.test.ts`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-api.ts`
- Create: `apps/admin/components/supplier-purchase-batches/batch-catalog-filters.tsx`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-catalog.tsx`
- Modify: `apps/admin/e2e/supplier-purchase-batch-mock-backend.mjs`

- [ ] **Step 1: 先写目录筛选 API 失败测试**

扩展 `batch-api.test.ts`，导入新 loader，并验证查询保持分页：

```ts
await loadBatchCatalog(
  { destination_type: "project", project_id: PROJECT_ID, warehouse_id: null },
  2,
  {
    keyword: "瓷砖",
    categoryId: CATEGORY_ID,
    tenantSupplierId: TENANT_SUPPLIER_ID,
  },
);
expect(requests.at(-1)).toContain("page=2&pageSize=20");
expect(requests.at(-1)).toContain(`categoryId=${CATEGORY_ID}`);
expect(requests.at(-1)).toContain(`tenantSupplierId=${TENANT_SUPPLIER_ID}`);

await loadBatchCatalogCategories(3, "主材");
expect(requests.at(-1)).toContain(
  "/supplier-purchase-batch-category-options?page=3&pageSize=20&keyword=%E4%B8%BB%E6%9D%90",
);

await loadBatchCatalogSuppliers(2, "建材");
expect(requests.at(-1)).toContain(
  "/supplier-purchase-requisition-supplier-options?page=2&pageSize=100&keyword=%E5%BB%BA%E6%9D%90",
);
```

- [ ] **Step 2: 运行测试并确认新签名与 loader 缺失**

Run:

```bash
(cd apps/admin && bun test components/supplier-purchase-batches/batch-api.test.ts)
```

Expected: FAIL，指向 `loadBatchCatalogCategories` / `loadBatchCatalogSuppliers`
未导出或 `loadBatchCatalog` 参数类型不匹配。

- [ ] **Step 3: 新增批次权限域内的叶子分类选项接口**

沿用批次 controller/service/repository 分层，新增
`GET /supplier-purchase-batch-category-options`。接口要求调用
`supplier.purchase-requisition.manage` 权限检查，仅查询当前租户可实际采购的租户与平台分类，
过滤 active 的叶子分类，支持 `page`、`pageSize`（服务端最大 100）和 `keyword`，只返回
`id`、`code`、`name`、`full_name`、`status` 与标准分页元数据；不新增表、字段、RPC 或 migration。
为 controller、service 和 repository 增加权限隔离、租户/平台可采购范围、分页上限、关键词和字段
白名单测试。

更新 `apps/api` 能力映射及路由注册，并在 Admin mock 中使用该端点；不得再调用通用
`/catalog/categories`。

在 `batch-api.ts` 增加：

```ts
export type BatchCatalogFilters = {
  keyword: string;
  categoryId?: string;
  tenantSupplierId?: string;
};

export function loadBatchCatalog(
  destination: BatchDestination,
  page: number,
  filters: BatchCatalogFilters,
  signal?: AbortSignal,
) {
  const query = pageQuery(page, filters.keyword);
  query.set("destinationType", destination.destination_type);
  if (
    destination.destination_type === "warehouse" && destination.warehouse_id
  ) {
    query.set("warehouseId", destination.warehouse_id);
  }
  if (
    destination.destination_type === "project" && destination.project_id
  ) {
    query.set("projectId", destination.project_id);
  }
  if (filters.categoryId) query.set("categoryId", filters.categoryId);
  if (filters.tenantSupplierId) {
    query.set("tenantSupplierId", filters.tenantSupplierId);
  }
  return requestBackendJson<PageData<BatchCatalogItem>>(
    `/supplier-purchase-batch-catalog?${query}`,
    { signal, fallbackMessage: "采购目录加载失败" },
  );
}
```

分类 loader 调用 `/supplier-purchase-batch-category-options`，显式传 `page/pageSize=20` 并把
响应映射成 `PageData<NamedOption>`；供应商 loader 复用采购申请供应商选项端点，显式
保留 `pageSize=100` 上限并映射 `tenant_supplier_id`、`supplier.name`。

目录关键词只依赖现有 RPC 支持的 `product_code`、`product_name`、`sku_code`、`sku_name` 字段；
搜索仅限上述四个字段，不新增搜索维度，也不引入 migration。

- [ ] **Step 4: 运行 API 测试确认通过**

Run:

```bash
(cd apps/api && bun test \
  src/controllers/supplier-purchase-batches/routes.test.ts \
  src/services/supplier-purchase-batches.test.ts)
(cd apps/admin && bun test components/supplier-purchase-batches/batch-api.test.ts)
```

Expected: API 权限、分页、字段白名单与 Admin loader 测试均 PASS，且原来的采购去向互斥查询断言继续通过。

- [ ] **Step 5: 实现批次目录筛选工具栏**

`batch-catalog-filters.tsx` 使用两个受限分页 picker：

```tsx
export type BatchCatalogFilterState = {
  category: NamedOption | null;
  supplier: NamedOption | null;
};

export function BatchCatalogFilters({
  value,
  disabled,
  onChange,
}: {
  value: BatchCatalogFilterState;
  disabled: boolean;
  onChange: (value: BatchCatalogFilterState) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <BatchOptionPicker
        id="batch-catalog-category"
        label="商品分类"
        value={value.category}
        load={loadBatchCatalogCategories}
        disabled={disabled}
        onChange={(category) => onChange({ ...value, category })}
      />
      <BatchOptionPicker
        id="batch-catalog-supplier"
        label="供应商"
        value={value.supplier}
        load={loadBatchCatalogSuppliers}
        disabled={disabled}
        onChange={(supplier) => onChange({ ...value, supplier })}
      />
    </div>
  );
}
```

同时提供“全部分类”“全部供应商”清除动作；筛选改变时把目录页码重置到 1。

- [ ] **Step 6: 将目录 Card 改为工作台目录面板**

修改 `batch-catalog.tsx`：

- 移除外层 `Card`。
- 搜索输入、筛选和刷新放在 sticky 工具栏。
- 调用新 `loadBatchCatalog(destination, page, filters, signal)`。
- 商品表格继续显示商品/SKU、供应商、单位和参考价。
- `selected` 时显示“已选”；超过 SKU/供应商上限时在按钮的可访问说明中给出原因。
- 分页保留在目录底部，不改为全量加载。

商品操作的核心分支固定为：

```tsx
const disabledReason = selected
  ? "该商品已加入"
  : lines.length >= 100
  ? "每个批次最多选择 100 个 SKU"
  : tooManySuppliers
  ? "每个批次最多选择 20 家供应商"
  : null;

<Button
  type="button"
  size="sm"
  variant={selected ? "secondary" : "outline"}
  disabled={disabled || Boolean(disabledReason)}
  title={disabledReason ?? undefined}
  onClick={() => onAdd(item)}
>
  {selected ? "已选" : "加入"}
</Button>
```

- [ ] **Step 7: 扩展批次 E2E mock 的只读筛选端点**

在 mock backend 中增加分页响应：

```js
if (url.pathname === "/supplier-purchase-batch-category-options") {
  return json(pageResult(activeCategories, url));
}
if (url.pathname === "/supplier-purchase-requisition-supplier-options") {
  return json(pageResult(activeSupplierRelationships, url));
}
```

目录响应继续依据 `categoryId` 和 `tenantSupplierId` 过滤 fixture；每次请求记录完整
path，供 E2E 断言分页和筛选参数。

- [ ] **Step 8: 运行批次目录测试并提交**

Run:

```bash
(cd apps/api && bun test \
  src/repositories/supplier-purchase-batch-catalog.test.ts \
  src/controllers/supplier-purchase-batches/routes.test.ts \
  src/services/supplier-purchase-batches.test.ts)
(cd apps/admin && bun test \
  components/supplier-purchase-batches/batch-api.test.ts \
  components/supplier-purchase-batches/batch-ui.test.tsx)
pnpm --dir apps/admin exec eslint \
  components/supplier-purchase-batches/batch-api.ts \
  components/supplier-purchase-batches/batch-catalog.tsx \
  components/supplier-purchase-batches/batch-catalog-filters.tsx
```

Expected: tests 和 ESLint 全部退出 0。

```bash
git add \
  apps/api/src/controllers/supplier-purchase-batches/index.ts \
  apps/api/src/controllers/supplier-purchase-batches/routes.test.ts \
  apps/api/src/services/supplier-purchase-batches.ts \
  apps/api/src/services/supplier-purchase-batches.test.ts \
  apps/api/src/repositories/supplier-purchase-batch-catalog.ts \
  apps/api/src/repositories/supplier-purchase-batch-catalog.test.ts \
  apps/api/src/schema/supplier-purchase-batches.ts \
  apps/admin/components/supplier-purchase-batches/batch-api.ts \
  apps/admin/components/supplier-purchase-batches/batch-api.test.ts \
  apps/admin/components/supplier-purchase-batches/batch-catalog.tsx \
  apps/admin/components/supplier-purchase-batches/batch-catalog-filters.tsx \
  apps/admin/e2e/supplier-purchase-batch-mock-backend.mjs
git commit -m "feat(procurement): 增加批次目录 API 与 Admin 契约"
```

### Task 5: 将新建采购批次重构为双栏工作台

**Files:**

- Modify: `apps/admin/components/supplier-purchase-batches/batch-types.ts`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-rules.test.ts`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-rules.ts`
- Create: `apps/admin/components/supplier-purchase-batches/batch-cost-category-picker.tsx`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-lines.tsx`
- Modify: `apps/admin/components/supplier-purchase-batches/batch-editor.tsx`

- [ ] **Step 1: 先写采购用途校验和上下文变更规则测试**

在 `batch-rules.test.ts` 增加：

```ts
test("labels required reason as purchase purpose without changing payload", () => {
  const draft = { ...newBatchDraft(), project_id: PROJECT_ID };
  expect(validateBatchDraft(draft)).toMatchObject({
    message: "请选择或填写采购用途",
    field: "reason",
  });
  expect(draftPayload({ ...draft, reason: " 项目备料 ", lines }, 0).reason)
    .toBe("项目备料");
});

test("requires confirmation before changing a selected product context", () => {
  expect(batchContextChangeRequiresConfirmation(newBatchDraft())).toBe(false);
  expect(batchContextChangeRequiresConfirmation({
    ...newBatchDraft(),
    lines,
  })).toBe(true);
});
```

- [ ] **Step 2: 运行测试并确认新规则未定义**

Run:

```bash
(cd apps/admin && bun test components/supplier-purchase-batches/batch-rules.test.ts)
```

Expected: FAIL，指向 `validateBatchDraft` 或
`batchContextChangeRequiresConfirmation` 未导出。

- [ ] **Step 3: 增加目录事实并结构化校验**

为 `BatchLine` 增加只用于 UI 参考的字段：

```ts
unit_price?: string;
purchase_unit_name?: string;
```

保存 payload 的 items 仍只包含 SKU、数量和成本类目，绝不发送这两个参考事实。

在 `batch-rules.ts` 增加：

```ts
export type BatchDraftValidation = {
  message: string;
  field: "destination" | "reason" | "remark" | "items";
};

export function validateBatchDraft(
  draft: BatchDraft,
): BatchDraftValidation | null {
  if (!(draft.destination_type === "project" ? draft.project_id : draft.warehouse_id)) {
    return { message: "请先选择采购项目或仓库", field: "destination" };
  }
  if (!draft.reason.trim()) {
    return { message: "请选择或填写采购用途", field: "reason" };
  }
  if (draft.reason.trim().length > 500) {
    return { message: "采购用途不能超过 500 字", field: "reason" };
  }
  if (draft.remark.trim().length > 500) {
    return { message: "备注不能超过 500 字", field: "remark" };
  }
  if (!draft.lines.length || draft.lines.length > 100) {
    return { message: "请选择 1–100 个商品 SKU", field: "items" };
  }
  if (new Set(draft.lines.map(({ supplier_id }) => supplier_id)).size > 20) {
    return { message: "每批最多选择 20 家供应商", field: "items" };
  }
  if (
    new Set(draft.lines.map(({ supplier_sku_id }) =>
      supplier_sku_id.toLowerCase()
    )).size !== draft.lines.length
  ) {
    return { message: "同一 SKU 不能重复添加", field: "items" };
  }
  if (draft.lines.some(({ cost_category_id }) => !cost_category_id)) {
    return { message: "请为每个商品选择成本类目", field: "items" };
  }
  if (draft.lines.some(({ quantity }) =>
    !/^\d{1,14}(?:\.\d{1,4})?$/.test(quantity) || !/[1-9]/.test(quantity)
  )) {
    return {
      message: "采购数量必须大于 0，最多 4 位小数",
      field: "items",
    };
  }
  return null;
}

export function draftError(draft: BatchDraft) {
  return validateBatchDraft(draft)?.message ?? null;
}

export function batchContextChangeRequiresConfirmation(draft: BatchDraft) {
  return draft.lines.length > 0;
}
```

- [ ] **Step 4: 运行批次规则测试**

Run:

```bash
(cd apps/admin && bun test components/supplier-purchase-batches/batch-rules.test.ts)
```

Expected: PASS，现有 payload 不携带价格的测试继续通过。

- [ ] **Step 5: 将成本类目改为右栏 Popover 选择**

创建 `batch-cost-category-picker.tsx`，使用 `Popover` 包住现有分页
`BatchOptionPicker`。公开接口：

```ts
{
  line: BatchLine;
  disabled: boolean;
  onChange: (category: NamedOption) => void;
}
```

触发按钮显示 `line.category_name || "选择成本类目"`，缺少类目时使用警告文字但不使用
整块红色背景；选择后关闭 Popover。不要再打开占据任务上下文的独立 Dialog。

- [ ] **Step 6: 将已选明细改为常驻右栏**

修改 `batch-lines.tsx`：

- 移除 `Card` 和成本类目 `Dialog`。
- 顶部显示“已选商品”和 `n / 100`。
- 空状态显示“从左侧商品目录加入商品”。
- 每行显示商品、供应商、SKU、数量、单位、成本类目和移除操作。
- 使用 `procurementSummary` 显示单项参考货值或把汇总交给 editor footer。
- 表格容器自身横向可滚动，不让 Sheet 或页面产生水平溢出。

- [ ] **Step 7: 重构 BatchEditor 操作顺序和上下文保护**

在 `batch-editor.tsx`：

1. 用 `ProcurementWorkbenchLayout` 替换单一 `overflow-y-auto space-y-5` 容器。
2. 顶部上下文保留去向 tabs、项目/仓库 picker、共享 `ProcurementPurposeField`、日期和
   `ProcurementRemarkField`。
3. 左栏渲染 `BatchCatalog`，右栏渲染 `BatchLines`。
4. 加入商品时复制 `unit_price` 和 `purchase_unit_name` 到 `BatchLine`。
5. 水合历史明细时复制 `unit_price` 和 `purchase_unit_name_snapshot`。
6. 使用显式 `dirty` 状态；只有用户修改字段或商品时设为 `true`，异步水合不设 dirty。
7. 已选商品时切换去向、项目或仓库，先打开 `ProcurementConfirmDialog`；取消不改变任何
   状态，确认后调用 `changeDestination` 或替换目标并清空 lines。
8. dirty 且没有未决命令时关闭 Sheet，先确认放弃；未决命令继续沿用现有“关闭不会清除
   请求”恢复语义。
9. 保存时使用 `validateBatchDraft`，用途错误传给 `ProcurementPurposeField`；总体错误仍
   通过 `StatusAlert` 提供可读摘要。
10. footer 显示 SKU、供应商、参考货值、缺少成本分类数量、关闭和保存/原请求重试。

Sheet 外壳使用：

```tsx
<SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-[76rem]">
  <SheetTitle className="sr-only">
    {record ? "编辑采购批次" : "新建采购批次"}
  </SheetTitle>
  <ProcurementWorkbenchLayout
    title={record ? "编辑采购批次" : "新建采购批次"}
    context={contextFields}
    alerts={alerts}
    catalog={catalogPanel}
    selection={selectedPanel}
    footer={footerActions}
  />
</SheetContent>
```

- [ ] **Step 8: 运行批次静态和单元验证**

Run:

```bash
(cd apps/admin && bun test \
  components/supplier-purchase-batches/batch-rules.test.ts \
  components/supplier-purchase-batches/batch-api.test.ts \
  components/supplier-purchase-batches/batch-ui.test.tsx)
pnpm --dir apps/admin exec eslint components/supplier-purchase-batches
pnpm --dir apps/admin run typecheck
```

Expected: 全部退出 0，TypeScript 不出现第三方组件 API 猜测错误。

- [ ] **Step 9: 提交批次工作台**

```bash
git add apps/admin/components/supplier-purchase-batches
git commit -m "refactor(admin): 重构采购批次选品工作台"
```

### Task 6: 将发起采购申请重构为同一工作台骨架

**Files:**

- Modify: `apps/admin/components/supplier-purchase-requisitions/requisition-page.test.ts`
- Modify: `apps/admin/components/supplier-purchase-requisitions/requisition-page-utils.ts`
- Modify: `apps/admin/components/supplier-purchase-requisitions/requisition-editor-fields.tsx`
- Modify: `apps/admin/components/supplier-purchase-requisitions/requisition-editor-lines.tsx`
- Modify: `apps/admin/components/supplier-purchase-requisitions/requisition-editor.tsx`

- [ ] **Step 1: 先写采购用途文案与自由文本兼容测试**

修改 `requisition-page.test.ts`：

```ts
test("采购用途保持必填自由文本并沿用 reason payload", () => {
  const empty = validateRequisitionDraft({
    projectId: PROJECT_ID,
    tenantSupplierId: SUPPLIER_ID,
    reason: "",
    expectedVersion: 0,
    items: validLines,
  });
  expect(empty.reason).toBe("请选择或填写采购用途");

  const payload = toRequisitionDraftPayload({
    projectId: PROJECT_ID,
    tenantSupplierId: SUPPLIER_ID,
    reason: " 现场临时异形材料 ",
    expectedVersion: 0,
    items: validLines,
  });
  expect(payload.reason).toBe("现场临时异形材料");
  expect(payload).not.toHaveProperty("purpose");
});
```

- [ ] **Step 2: 运行测试并确认旧错误文案导致失败**

Run:

```bash
(cd apps/admin && bun test components/supplier-purchase-requisitions/requisition-page.test.ts)
```

Expected: FAIL，实际错误仍为“请填写临时采购原因”。

- [ ] **Step 3: 更新用途校验文案但保持 payload**

在 `validateRequisitionDraft` 中改为：

```ts
if (!reason) {
  errors.reason = "请选择或填写采购用途";
} else if (reason.length > 500) {
  errors.reason = "采购用途不能超过 500 个字符";
}
```

`toRequisitionDraftPayload` 继续输出 `reason: draft.reason.trim()`。

- [ ] **Step 4: 将申请上下文字段压缩到顶部**

修改 `RequisitionHeaderFields`：

- 保留项目和合作供应商现有分页加载行为。
- 用 `ProcurementPurposeField destinationType="project"` 替换原因 Textarea。
- 日期使用现有 Input。
- 用 `ProcurementRemarkField` 替换备注 Textarea。
- 项目/供应商切换事件不直接清空明细，改由 editor 的确认流程决定。
- 已存在草稿继续锁定项目和供应商，保持服务端资源身份不变。

核心用途绑定：

```tsx
<ProcurementPurposeField
  destinationType="project"
  value={reason}
  disabled={fieldsLocked}
  error={validation.reason}
  onChange={onReasonChange}
/>
```

- [ ] **Step 5: 调整申请目录和已选明细顺序**

`requisition-editor-lines.tsx`：

- `RequisitionCatalogBrowser` 移除 Field 大容器，作为左栏完整面板。
- 搜索栏 sticky；Enter 与按钮都提交关键词并回第一页。
- 保留现有 20 条服务端分页，不新增分类筛选。
- `SelectedRequisitionLines` 作为右栏，空状态不渲染空表。
- 数量、成本分类、删除保持行内操作和现有无障碍错误关联。
- 从 `facts` 读取 `unit_price`，与 lines 合成 `procurementSummary` 的参考货值输入。

- [ ] **Step 6: 重构 RequisitionEditor 布局和上下文确认**

在 `requisition-editor.tsx`：

1. 保留现有 load sequence、AbortController、保存 attempt、刷新恢复和 saved facts。
2. 使用 `ProcurementWorkbenchLayout`：左栏先展示目录，右栏展示已选明细。
3. 项目或供应商改变且已有商品时打开确认弹层；取消保持原值，确认后修改上下文、清空
   lines/facts/catalog 并回到第一页。
4. 用显式 dirty 状态保护关闭；命令保存成功和服务端水合不误标为用户修改。
5. footer 显示 SKU 数、参考货值、待选成本分类数和现有保存/重试状态。
6. `refreshRequired`、加载错误和 command error 保持显式，不把错误吞掉。
7. `RequisitionSavedFacts` 放到紧凑状态区，不再打断目录和已选商品之间的空间关系。

不要把批次的跨供应商状态合并进申请 editor，也不要更改 `useRequisitionDraftSave` 的
幂等身份。

- [ ] **Step 7: 运行申请单元、类型和 ESLint 验证**

Run:

```bash
(cd apps/admin && bun test \
  components/supplier-purchase-requisitions/requisition-page.test.ts \
  components/supplier-purchase-requisitions/requisition-command-refresh.test.ts)
pnpm --dir apps/admin exec eslint \
  components/supplier-purchase-requisitions \
  components/supplier-procurement-editor
pnpm --dir apps/admin run typecheck
```

Expected: 全部退出 0，现有刷新失败不重发 mutation 的断言继续通过。

- [ ] **Step 8: 提交采购申请工作台**

```bash
git add apps/admin/components/supplier-purchase-requisitions
git commit -m "refactor(admin): 重构采购申请选品工作台"
```

### Task 7: 更新端到端交互与响应式验收

**Files:**

- Modify: `apps/admin/e2e/supplier-purchase-batch-workflow.spec.ts`
- Modify: `apps/admin/e2e/supplier-purchase-requisition-workflow.spec.ts`

- [ ] **Step 1: 更新 E2E helper 使用新用途名称**

批次 helper 从：

```ts
await editor.getByLabel("采购原因（必填）").fill("统一采购材料");
```

改为点击共享用途：

```ts
await editor.getByRole("button", { name: "项目备料", exact: true }).click();
```

申请 helper 从原因 Textarea 改为：

```ts
await sheet.getByRole("button", { name: "现场补料", exact: true }).click();
```

需要自由文本的既有用例选择“其他”，再填写 `自定义采购用途`。

- [ ] **Step 2: 增加批次商品优先和筛选用例**

增加用例验证：

```ts
test("批次工作台保持目录与已选商品并排并发送服务端筛选", async ({
  page,
  request,
}) => {
  await open(page, request, "paging");
  await page.setViewportSize({ width: 1440, height: 900 });
  const editor = await newDraft(page);
  await expect(editor.getByRole("region", { name: "可采购商品" }))
    .toBeInViewport();
  await expect(editor.getByRole("region", { name: "已选商品" }))
    .toBeInViewport();
  await editor.getByLabel("商品分类").click();
  await page.getByRole("option", { name: "主材" }).click();
  await editor.getByLabel("供应商").click();
  await page.getByRole("option", { name: "供应商 A" }).click();
  const state = await (await request.get(`${backend}/__test/state`)).json();
  expect(state.requests.some((path: string) =>
    path.includes("categoryId=") && path.includes("tenantSupplierId=")
  )).toBe(true);
});
```

如果实现使用 `section aria-label`，Playwright role 应为 `region`；若浏览器语义结果不同，
为 section 增加可见 heading 并通过 heading 定位，不能改成脆弱 CSS selector。

- [ ] **Step 3: 增加上下文切换和退出保护用例**

覆盖：

- 已选商品后切换项目，出现“切换后将清空已选商品”。
- 取消确认，原商品仍存在且项目未变。
- 确认切换，右栏回到空状态，目录使用新项目重新请求。
- 修改采购用途后关闭，出现“放弃未保存内容”。
- 保存中和未决幂等命令不允许通过重复点击发送第二个请求。

- [ ] **Step 4: 增加采购申请工作台顺序用例**

断言目录区域在 DOM 和视觉上位于左栏、已选商品位于右栏；加入商品后右栏立即出现数量
和成本分类控件。保存 payload 继续只包含 `reason`、SKU、分类和数量，不包含任何价格
字段或 `purpose`。

- [ ] **Step 5: 增加窄屏无横溢用例**

在两个 spec 中各覆盖 375×812：

```ts
await page.setViewportSize({ width: 375, height: 812 });
expect(await editor.evaluate((element) =>
  element.scrollWidth <= element.clientWidth
)).toBe(true);
await expect(editor.getByRole("button", { name: "保存草稿" }))
  .toBeInViewport();
```

目录表和明细表允许自身横向滚动，但页面与 Sheet 不得水平溢出。

- [ ] **Step 6: 运行两套 E2E**

Run:

```bash
pnpm --dir apps/admin exec playwright test \
  --config=playwright.supplier-purchase-batch.config.ts
pnpm --dir apps/admin exec playwright test \
  --config=playwright.supplier-purchase-requisition.config.ts
```

Expected: 两套采购工作流全部 PASS；失败时先保留 trace 和截图定位根因，不降低断言。

- [ ] **Step 7: 提交 E2E 验收**

```bash
git add \
  apps/admin/e2e/supplier-purchase-batch-workflow.spec.ts \
  apps/admin/e2e/supplier-purchase-requisition-workflow.spec.ts
git commit -m "test(admin): 覆盖采购工作台关键交互"
```

### Task 8: 构建共享包并完成小程序交接

**Files:**

- Modify: `packages/domain/scripts/verify-packed-consumer.mjs`
- Create: `docs/2026-09-08-procurement-purpose-miniprogram-handoff.md`
- Generate, do not commit: `.artifacts/domain/gooes-domain-1.21.1.tgz`

- [ ] **Step 1: 编写小程序交接文档**

文档必须明确：

```md
# 采购用途共享配置小程序对接

- 共享包：`@gooes/domain@1.21.1`
- 接口字段：继续使用 `reason`
- UI 名称：统一显示“采购用途”
- 项目建议：`项目备料`、`现场补料`
- 仓库建议：`仓库补货`
- “其他”是 UI 入口，选择后发送用户填写的自由文本
- 不新增业务保存接口；采购批次分类只读选项接口按 Task 4 执行，不修改幂等、版本、权限或保存顺序
- orange 删除 `BatchTextFields.tsx` 中用途值的本地硬编码，改从共享包读取
- Gooes 未修改 orange；安装、真机验证和小程序提交由小程序团队完成
```

同时提供验收清单：项目/仓库建议切换、自定义用途、旧草稿自由文本回显、空用途阻止保存、
保存 payload 仍为 `reason`、重复点击不重复提交。

- [ ] **Step 2: 修改 verifier 支持指定制品并加入采购用途断言**

修改 `packages/domain/scripts/verify-packed-consumer.mjs`：在 TypeScript 和运行时 consumer
代码中导入 `SUPPLIER_PURCHASE_PURPOSE_PRESETS`，断言项目/仓库建议值和不包含“其他”；同时支持
通过 `GOOES_DOMAIN_ARCHIVE` 指定待验证 tarball。verifier 从 `packages/domain/package.json` 读取
version，计算 `gooes-domain-${version}.tgz` 并校验指定路径 basename，不硬编码版本号；随后对该路径执行安装、类型检查和运行时断言。未指定时可保留现有
临时打包兜底，但 Task 8 必须使用指定 `.artifacts` 制品完成验证。
环境变量路径按 verifier 当前工作目录（`packages/domain`）解析，因此调用时使用
`../../.artifacts/domain/...`。

- [ ] **Step 3: 构建并打包共享包**

Run:

```bash
mkdir -p .artifacts/domain
bun run --cwd packages/domain build
(cd packages/domain && npm pack --pack-destination ../../.artifacts/domain)
```

Expected: 生成精确文件 `.artifacts/domain/gooes-domain-1.21.1.tgz`，输出文件列表只包含
`dist`、`README.md` 和 `package.json` 声明允许的内容。

- [ ] **Step 4: 先校验指定 tarball，再计算指纹**

Run:

```bash
GOOES_DOMAIN_ARCHIVE=../../.artifacts/domain/gooes-domain-1.21.1.tgz \
  bun run --cwd packages/domain verify:packed-consumer
shasum -a 256 .artifacts/domain/gooes-domain-1.21.1.tgz
```

Expected: packed consumer 退出 0；记录 SHA-256 到交接文档，不把制品加入 Git。

- [ ] **Step 5: 提交小程序交接文档与 verifier**

```bash
git add \
  packages/domain/scripts/verify-packed-consumer.mjs \
  docs/2026-09-08-procurement-purpose-miniprogram-handoff.md
git commit -m "docs(procurement): 补充小程序采购用途对接"
```

### Task 9: 完整验证与交付检查

**Files:**

- Verify only: all files changed by Tasks 1–8

- [ ] **Step 1: 运行聚焦单元测试**

Run:

```bash
(bun test packages/domain/src/supplier-purchase-batch.test.ts)
(cd apps/admin && bun test \
  components/supplier-procurement-editor/procurement-editor-rules.test.ts \
  components/supplier-purchase-batches/batch-api.test.ts \
  components/supplier-purchase-batches/batch-rules.test.ts \
  components/supplier-purchase-batches/batch-ui.test.tsx \
  components/supplier-purchase-requisitions/requisition-page.test.ts \
  components/supplier-purchase-requisitions/requisition-command-refresh.test.ts)
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行 API 最小完整检查**

先依据 `apps/api/package.json` 使用已存在的 `check` 脚本，覆盖 API typecheck、build 和
file-size 检查；不执行 migration 或保存写逻辑。

Run:

```bash
pnpm --dir apps/api run check
```

Expected: API TypeScript、构建和文件大小检查全部退出 0。

- [ ] **Step 3: 运行 Admin 静态检查、文件大小和构建**

Run:

```bash
pnpm --dir apps/admin run check
pnpm --dir apps/admin exec eslint \
  components/supplier-procurement-editor \
  components/supplier-purchase-batches \
  components/supplier-purchase-requisitions
pnpm --dir apps/admin run build
```

Expected: TypeScript、文件大小、ESLint 和 Next.js production build 全部退出 0。

- [ ] **Step 4: 再次运行两套 E2E**

Run:

```bash
pnpm --dir apps/admin exec playwright test \
  --config=playwright.supplier-purchase-batch.config.ts
pnpm --dir apps/admin exec playwright test \
  --config=playwright.supplier-purchase-requisition.config.ts
```

Expected: 两套全部 PASS。

- [ ] **Step 5: 核对数据库和仓库边界**

Run:

```bash
git diff origin/main...HEAD --name-only
git -C /Users/leefo/Public/work/orange status --short
git status --short
```

Expected:

- Gooes 差异中的 API 仅包含 Task 4 列明的批次只读分类选项接口 controller/service/repository/schema/route 及相关测试；不包含 `supabase/migrations/`，也不包含既有保存 API 或任何保存写逻辑改动。
- orange 状态与执行前完全一致，没有本任务造成的文件变化。
- Gooes 仅保留执行前已有的 `.artifacts/` 未跟踪目录，业务源码和文档均已提交。

- [ ] **Step 6: 检查最终提交历史和格式**

Run:

```bash
git diff --check origin/main...HEAD
git log --oneline --decorate origin/main..HEAD
```

Expected: 无空白错误；提交依次覆盖设计、domain、共享 UI、批次、申请、E2E 和交接文档，
没有 orange 文件或构建产物。

## 自检结果

- 设计覆盖：双栏布局、商品优先、采购用途、折叠备注、批次筛选、常驻明细、切换确认、
  未保存退出保护、幂等恢复、响应式、小程序共享包和交接均有对应任务。
- 类型一致：共享用途按 `project | warehouse` 索引；API 仍使用 `reason`；批次筛选使用现有
  `categoryId` 和 `tenantSupplierId`；采购申请没有虚构分类参数。
- 性能边界：商品、分类、供应商、项目、仓库和成本类目继续分页，单次 `pageSize` 不超过
  100；没有客户端全量加载或 N+1。
- 数据库边界：没有表、约束、RLS、函数或初始化数据变化，因此不需要 migration。
- 仓库边界：orange 只读；需要的小程序改动全部转成交接事项。
