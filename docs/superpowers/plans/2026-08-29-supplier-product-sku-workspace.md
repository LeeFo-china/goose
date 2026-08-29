# Supplier Product SKU Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐生产租户供应商 rollout，并在商品列表展示 SKU 计数和提供同区域 SKU 下钻工作区。

**Architecture:** 保留现有商品分页查询，增加一个接收当前页商品 ID 的批量聚合 RPC，在固定两次查询内返回 SKU 总数和启用数。前端以 `productId` 查询参数为单一导航状态，在商品表和 SKU 工作区之间切换。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL、Next.js、React、TanStack Table、shadcn/ui。

---

### Task 1: 对齐生产 rollout

**Files:**
- Verify: `apps/api/src/services/platform-suppliers.ts`

- [ ] 读取开发和生产租户 rollout 配置，确认差异仅为三个私有能力开关。
- [ ] 通过既有平台超管命令依次启用所有权读取、私有供应商写入、私有目录写入。
- [ ] 重新读取生产配置，确认三个开关为 true 且采购快照保持 false。

### Task 2: 增加批量 SKU 计数

**Files:**
- Create: `supabase/migrations/20260829150000_add_supplier_product_sku_counts.sql`
- Modify: `apps/api/src/repositories/supplier-products-model.ts`
- Modify: `apps/api/src/repositories/supplier-products.ts`
- Test: `apps/api/src/repositories/supplier-products.test.ts`
- Test: `apps/api/src/services/supplier-product-sku-count-migration-contract.test.ts`

- [ ] 先写 repository 和 migration contract 失败测试，要求返回 `sku_count`、`active_sku_count`，并限制最多 100 个商品 ID。
- [ ] 运行测试，确认因计数能力不存在而失败。
- [ ] 添加批量聚合 migration、结果 schema 和 repository 合并逻辑。
- [ ] 运行针对性测试，确认平台与租户范围、零计数和单次批量查询通过。

### Task 3: 实现同区域 SKU 下钻

**Files:**
- Modify: `apps/admin/components/supplier-products/supplier-product-list.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-product-types.ts`
- Test: `apps/admin/e2e/supplier-product-pricing-workflow.spec.ts`
- Test: `apps/admin/components/supplier-products/supplier-product-list.test.tsx`

- [ ] 先写失败测试，覆盖计数文案、进入后隐藏商品表、返回后恢复商品表。
- [ ] 运行测试，确认当前底部追加交互不满足断言。
- [ ] 增加 SKU 列和 `productId` 查询参数导航，二选一渲染商品表与 SKU 工作区。
- [ ] 运行组件和 E2E 相关测试，确认交互、空状态和浏览器返回行为。

### Task 4: 全量验证

**Files:**
- Verify: `apps/api/package.json`
- Verify: `apps/admin/package.json`

- [ ] 运行 API 针对性测试和 `bun run api:check`。
- [ ] 运行 Admin 针对性测试、类型检查和构建。
- [ ] 运行 `git diff --check` 并检查变更范围。
- [ ] 验证生产 rollout 配置和两个辅助接口不再被 `SUPPLIER_OWNERSHIP_READS_DISABLED` 拦截。
