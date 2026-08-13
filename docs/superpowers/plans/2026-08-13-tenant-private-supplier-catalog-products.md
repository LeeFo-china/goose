# 租户私有目录、商品与价格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付平台标准目录与租户私有目录并存、结构化规格和单位换算，以及平台共享商品/租户私有商品和租户专属采购价。

**Architecture:** 分类和品牌继续使用统一表，以所有权和可选平台映射隔离；规格定义属于分类，SKU 保存结构化规格值和可解释换算链。平台商品使用独立 controller，租户商品只能写入本租户 scope；价格 aggregate 明确 tenant 归属并校验合作关系。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/Radix、Tailwind、Playwright。

**Prerequisite:** `docs/superpowers/plans/2026-08-13-tenant-private-suppliers.md` 已合并并通过编码/私有供应商 smoke。

---

## File Map

- `packages/domain/src/supplier-catalog.ts`：目录、规格、单位换算契约。
- `packages/domain/src/supplier-product.ts`：商品所有权和结构化规格。
- `supabase/migrations/20260813120000_create_tenant_private_catalog.sql`：私有分类、品牌、映射和规格定义。
- `supabase/migrations/20260813130000_scope_supplier_products_and_prices.sql`：商品/SKU 所有权、换算和价格 tenant 约束。
- `apps/api/src/controllers/supplier-catalog/index.ts`：租户目录读写。
- `apps/api/src/controllers/platform-supplier-products/index.ts`：平台商品维护。
- `apps/api/src/services/supplier-products.ts`：租户私有商品编排。
- `apps/admin/app/(console)/supplier-catalog/page.tsx`：租户目录管理页。
- `apps/admin/app/(console)/platform/supplier-products/page.tsx`：平台共享商品管理页。
- `apps/admin/components/supplier-products/*`：来源、规格、换算和价格交互。

### Task 1: 定义目录、规格、商品和错误契约

**Files:**
- Create: `packages/domain/src/supplier-catalog.ts`
- Create: `packages/domain/src/supplier-catalog.test.ts`
- Modify: `packages/domain/src/supplier-product.ts`
- Modify: `packages/domain/src/supplier-product.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/api/src/errors/error-codes.ts`

- [ ] **Step 1: 写 RED 测试**

断言规格类型 `text/number/boolean/single_enum/multi_enum/date`、所有权联合、单位换算边、商品来源和结构化 spec value 类型。新增错误码：`SHARED_RESOURCE_READ_ONLY`、`PRODUCT_OWNERSHIP_CONFLICT`、`CATEGORY_OWNERSHIP_CONFLICT`、`BRAND_OWNERSHIP_CONFLICT`、`SPEC_TEMPLATE_VALIDATION_ERROR`、`UNIT_CONVERSION_INVALID`。

- [ ] **Step 2: 运行 RED**

```bash
bun test packages/domain/src/supplier-catalog.test.ts packages/domain/src/supplier-product.test.ts
```

- [ ] **Step 3: 实现并运行 GREEN**

```ts
export type CatalogSpecValue = string | number | boolean | string[];
export type SupplierProductSource = "platform_shared" | "tenant_private";
export type UnitConversionEdge = {
  fromUnitId: string;
  toUnitId: string;
  factor: string;
};
```

金额和换算 factor 在 API/Domain 使用十进制字符串，禁止用 JS 浮点做持久化计算。

```bash
bun test packages/domain/src/supplier-catalog.test.ts packages/domain/src/supplier-product.test.ts
git add packages/domain/src/supplier-catalog.ts packages/domain/src/supplier-catalog.test.ts packages/domain/src/supplier-product.ts packages/domain/src/supplier-product.test.ts packages/domain/src/index.ts apps/api/src/errors/error-codes.ts
git commit -m "feat(domain): 定义私有目录与商品契约"
```

### Task 2: 建立私有分类、品牌和规格模板

**Files:**
- Create: `apps/api/src/services/tenant-supplier-catalog-migration-contract.test.ts`
- Create: `supabase/migrations/20260813120000_create_tenant_private_catalog.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言分类增加 `full_name,is_leaf,mapped_platform_category_id`，品牌增加 `mapped_platform_brand_id`，新增 `catalog_spec_definitions` 和 `catalog_unit_suggestions`；断言父子同 scope/tenant、映射方向、末级挂商品、平台“无品牌”、版本、索引、RLS/FORCE RLS、审计和命令函数。单位建议只允许租户提交、平台处理，不能直接生成单位。

- [ ] **Step 2: 运行 RED 并创建 migration**

```bash
cd apps/api && bun test src/services/tenant-supplier-catalog-migration-contract.test.ts
cd ../.. && supabase migration new create_tenant_private_catalog
```

- [ ] **Step 3: 实现树和映射不变量**

数据库命令 `create/update_tenant_catalog_category`、`create/update_tenant_catalog_brand`、`copy_platform_category_specs` 必须验证当前租户。租户分类只能挂在同租户父节点；平台和租户树互不混挂；映射目标只能是 active platform 记录；映射更新使用 expected_version，但不改变 ownership。

`full_name` 在命令内由祖先路径生成；禁止循环和超过 8 层；只有 `is_leaf=true` 的 active 分类可挂商品。迁移回填现有平台分类完整路径，并插入/规范化平台“无品牌”。

- [ ] **Step 4: 实现规格定义**

规格 code 在分类内唯一；enum 类型必须有非空去重 options，其他类型 options 必须为空；number 可带 unit_dimension；租户复制平台模板产生新的 tenant-owned 记录，保存 `source_platform_spec_id` 仅作追溯。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/tenant-supplier-catalog-migration-contract.test.ts
cd ../.. && git add apps/api/src/services/tenant-supplier-catalog-migration-contract.test.ts supabase/migrations/20260813120000_create_tenant_private_catalog.sql
git commit -m "feat(db): 建立租户私有目录与规格"
```

### Task 3: 实现平台与租户目录 API

**Files:**
- Modify: `apps/api/src/schema/supplier-catalog.ts`
- Create: `apps/api/src/schema/supplier-catalog.test.ts`
- Modify: `apps/api/src/repositories/supplier-catalog.ts`
- Modify: `apps/api/src/repositories/supplier-catalog.test.ts`
- Modify: `apps/api/src/services/supplier-catalog.ts`
- Modify: `apps/api/src/services/supplier-catalog.test.ts`
- Modify: `apps/api/src/controllers/supplier-catalog/index.ts`
- Modify: `apps/api/src/controllers/platform-supplier-catalog/index.ts`

- [ ] **Step 1: 写 RED 测试**

查询合并 platform 与当前 tenant，排除其他 tenant；分页默认 1/20 最大 100；租户写操作要求 `supplier.catalog.manage` 和 `private_catalog_writes_enabled`；更新 platform 返回 `SHARED_RESOURCE_READ_ONLY`；规格复制/维护校验 expected_version 和 Idempotency-Key；单位接口保持只读但允许提交分页可查的单位建议。平台 catalog controller 增加规格模板和单位建议处理接口，继续要求 `platform.catalog.manage`。

- [ ] **Step 2: 实现分层 API**

固定租户路由：现有 `GET /catalog/categories|brands|units`；新增 `POST/PATCH /catalog/categories`、`POST/PATCH /catalog/brands`、`GET/POST/PATCH /catalog/categories/:id/spec-definitions`、`POST /catalog/categories/:id/spec-definitions:copy-platform`、`POST /catalog/unit-suggestions`。平台路由在现有 `/platform/catalog` 下增加 spec definitions 和 `GET/PATCH /platform/catalog/unit-suggestions`。controller 只做 HTTP；service 编排；repository 唯一访问 Supabase。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/schema/supplier-catalog.test.ts src/repositories/supplier-catalog.test.ts src/services/supplier-catalog.test.ts
git add src/schema/supplier-catalog.ts src/schema/supplier-catalog.test.ts src/repositories/supplier-catalog.ts src/repositories/supplier-catalog.test.ts src/services/supplier-catalog.ts src/services/supplier-catalog.test.ts src/controllers/supplier-catalog/index.ts
git commit -m "feat(api): 开放租户私有目录接口"
```

### Task 4: 实现平台与租户目录 Admin 页面

**Files:**
- Create: `apps/admin/app/(console)/supplier-catalog/page.tsx`
- Create: `apps/admin/app/(console)/supplier-catalog/loading.tsx`
- Create: `apps/admin/components/tenant-supplier-catalog/*`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Create: `apps/admin/components/tenant-supplier-catalog/tenant-supplier-catalog.test.ts`
- Modify: `apps/admin/app/(console)/platform/catalog/page.tsx`
- Modify: `apps/admin/components/supplier-catalog/*`

- [ ] **Step 1: 写 UI RED 测试**

租户页面包含分类/品牌 Tab、来源徽标、完整路径、平台映射、规格模板；平台行只读；租户行可编辑；单位仅查看并可提交建议。平台目录页增加分类规格模板、计量维度和单位建议处理；两端分页、加载、空、错误和权限拒绝态完整。

- [ ] **Step 2: 实现 UI**

菜单在“采购供应”下增加“供应商目录”，权限 `supplier.catalog.manage`。复用 `components/supplier-catalog` 的表格、对话框和请求模式，但租户组件不允许调用 `/platform/catalog` 写接口；平台页面继续由 `platform.catalog.manage` 控制。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/admin && bun test components/tenant-supplier-catalog/tenant-supplier-catalog.test.ts
git add app/'(console)'/supplier-catalog app/'(console)'/platform/catalog components/tenant-supplier-catalog components/supplier-catalog components/layout/menu-config.ts
git commit -m "feat(admin): 增加租户供应商目录管理"
```

### Task 5: 建立商品、SKU、换算和价格所有权约束

**Files:**
- Create: `apps/api/src/services/supplier-product-ownership-migration-contract.test.ts`
- Create: `supabase/migrations/20260813130000_scope_supplier_products_and_prices.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言 product/SKU 所有权组合、`spec_values jsonb`、`supplier_sku_unit_conversions`、价格表显式 `tenant_id`、平台/租户唯一索引、跨表复合 FK、发布版本不可变、RLS 和错误码。此阶段不回填无法证明归属的存量商品，不启用 product/SKU NOT NULL。

- [ ] **Step 2: 实现新增写约束**

新平台商品必须挂平台供应商、平台分类和平台品牌；新租户商品可挂平台 supplier 或同租户 supplier，可引用平台或同租户分类/品牌。SKU 所有权必须等于 product。唯一索引分别为平台 `(supplier_id,product_code)` / `(supplier_id,sku_code)` 和租户 `(supplier_id,owner_tenant_id,product_code)` / `(supplier_id,owner_tenant_id,sku_code)`。

- [ ] **Step 3: 实现规格与换算校验函数**

受控函数加载当前分类有效模板，验证必填、类型、枚举和维度；换算边 factor > 0，不允许自环、重复边或跨无关维度；提交时验证从采购单位到库存基础单位的路径唯一且可解释。

- [ ] **Step 4: 约束价格 tenant 归属**

为 `supplier_price_lists` 及条目增加/验证 tenant_id，通过复合 FK 绑定 tenant supplier、supplier、product 和 SKU。平台商品只共享资料，不共享价格；所有价格写入和读取必须限定 tenant_id。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/supplier-product-ownership-migration-contract.test.ts
cd ../.. && git add apps/api/src/services/supplier-product-ownership-migration-contract.test.ts supabase/migrations/20260813130000_scope_supplier_products_and_prices.sql
git commit -m "feat(db): 隔离供应商商品与采购价"
```

### Task 6: 重构租户商品 API 并增加平台商品入口

**Files:**
- Modify: `apps/api/src/schema/supplier-products.ts`
- Modify: `apps/api/src/repositories/supplier-products.ts`
- Modify: `apps/api/src/services/supplier-products.ts`
- Modify: `apps/api/src/controllers/supplier-products/index.ts`
- Create: `apps/api/src/controllers/platform-supplier-products/index.ts`
- Create: `apps/api/src/services/platform-supplier-products.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: corresponding `*.test.ts` files

- [ ] **Step 1: 写 RED 测试**

租户列表合并平台商品与本租户商品且要求 supplier relationship；租户创建始终写 tenant ownership，不再要求 `proxy_reason`；平台商品写要求 `platform.supplier-product.manage`；其他租户商品按不存在处理；非 active 关系拒绝写。

- [ ] **Step 2: 实现接口**

保留现有 `/supplier-products` 租户路径以减少前端破坏；增加 `/platform/supplier-products` controller。schema 用独立平台/租户 create 类型，禁止客户端提交 ownership。service 依据认证上下文构建 ownership，repository 查询始终带 scope 和 tenant 条件。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/schema/supplier-products.test.ts src/repositories/supplier-products.test.ts src/services/supplier-products.test.ts src/services/platform-supplier-products.test.ts
git add src/schema/supplier-products* src/repositories/supplier-products* src/services/supplier-products* src/services/platform-supplier-products* src/controllers/supplier-products/index.ts src/controllers/platform-supplier-products src/routes/index.ts
git commit -m "feat(api): 区分平台与租户商品写入"
```

### Task 7: 收紧租户价格访问和发布

**Files:**
- Modify: `apps/api/src/repositories/supplier-price-lists.ts`
- Modify: `apps/api/src/repositories/supplier-price-lists.test.ts`
- Modify: `apps/api/src/services/supplier-price-lists.ts`
- Modify: `apps/api/src/services/supplier-price-lists.test.ts`
- Modify: `apps/api/src/schema/supplier-price-lists.ts`

- [ ] **Step 1: 写 RED 测试**

覆盖 platform/tenant 商品都可在 active relationship 下定租户价；他租户价不可见；价格写入交叉校验 tenant/relationship/supplier/product/SKU；发布后不可改，更新必须新版本；列表均分页。

- [ ] **Step 2: 实现并验证**

移除租户私有价格维护的强制 `proxy_reason`，保留操作人和审计。所有 repository filter 首先限定 `tenant_id`，再限定 relation 和 supplier。

```bash
cd apps/api && bun test src/repositories/supplier-price-lists.test.ts src/services/supplier-price-lists.test.ts
git add src/repositories/supplier-price-lists* src/services/supplier-price-lists* src/schema/supplier-price-lists.ts
git commit -m "fix(api): 收紧供应商采购价租户边界"
```

### Task 8: 更新平台与租户商品价格 Admin

**Files:**
- Modify: `apps/admin/components/supplier-products/*`
- Modify: `apps/admin/app/(console)/supplier-products/page.tsx`
- Modify: `apps/admin/e2e/supplier-product-pricing-workflow.spec.ts`
- Modify: `apps/admin/e2e/supplier-product-pricing-mock-backend.mjs`
- Create: `apps/admin/app/(console)/platform/supplier-products/page.tsx`
- Create: `apps/admin/components/platform-supplier-products/*`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 写 RED 测试**

断言租户页商品来源徽标、平台商品只读、租户商品可写、分类/品牌只展示平台+当前租户、结构化规格控件、建议 SKU 名称、单位换算链和 tenant 价格。平台页可在平台 supplier 下维护共享 product/SKU，但不能维护租户价格。非 active relation 显示历史只读说明。

- [ ] **Step 2: 实现 UI**

复用现有 dialogs 和 table；平台与租户页面使用不同写入 endpoint 和权限。规格控件按模板动态渲染，不从 SKU 名称解析；换算用可增删的有向边编辑器并在提交前展示“1 箱 = 8 片 = 1.44 平方米”等可解释摘要。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/admin && bun test components/supplier-products
pnpm exec playwright test --config=playwright.supplier-product-pricing.config.ts
git add app/'(console)'/supplier-products app/'(console)'/platform/supplier-products components/supplier-products components/platform-supplier-products components/layout/menu-config.ts e2e/supplier-product-pricing-workflow.spec.ts e2e/supplier-product-pricing-mock-backend.mjs
git commit -m "feat(admin): 完善私有商品与规格价格"
```

### Task 9: 阶段验证与性能检查

- [ ] **Step 1: 运行静态、API、Domain 和 Admin 测试**

```bash
bun run api:typecheck
bun run admin:check
bun test packages/domain/src/supplier-catalog.test.ts packages/domain/src/supplier-product.test.ts
cd apps/api && bun test src/services/tenant-supplier-catalog-migration-contract.test.ts src/services/supplier-product-ownership-migration-contract.test.ts src/services/supplier-catalog.test.ts src/services/supplier-products.test.ts src/services/supplier-price-lists.test.ts
cd ../admin && bun test components/tenant-supplier-catalog components/supplier-products
```

- [ ] **Step 2: 验证数据库和查询计划**

运行 `supabase db push --dry-run`、应用 migrations、重新生成类型、`supabase migration list`。对目录合并查询、supplier 商品分页、SKU 搜索和当前价格查询执行 `EXPLAIN ANALYZE`，确认使用 ownership/tenant/supplier 复合索引且无 N+1。

- [ ] **Step 3: 检查工作树**

运行 `git diff --check` 与 `git status --short`，确认未包含 tgz 删除或 Orange 变更；将测试和执行计划证据附到 PR。
