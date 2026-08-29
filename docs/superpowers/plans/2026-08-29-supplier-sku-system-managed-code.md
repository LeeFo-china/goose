# 供应商 SKU 系统管理编码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让租户私有和平台共享 SKU 的内部编码均由服务端生成，并从用户可编辑表单中移除。

**Architecture:** 保留现有客户端预分配 SKU UUID 和幂等命令链路，在 Service 层基于可信路径参数生成作用域前缀编码。Schema 兼容接收旧客户端字段，Service 覆盖或剥离编码；数据库 v3 原子命令再次强制系统编码，并兼容 v2 已记录请求的跨版本重放。Admin 复用商品编码的只读交互模式。

**Release boundary:** 新旧 API 不得同时承接 SKU 写请求。发布和应用回滚都需要先短暂停止 SKU 写入及不确定重试，再在同一窗口切换 migration/API；数据库 migration 保持应用。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Next.js、React、shadcn/ui

---

### Task 1: 固化 API 输入和编码规则

**Files:**
- Modify: `apps/api/src/schema/supplier-products.test.ts`
- Modify: `apps/api/src/schema/supplier-products.ts`
- Create: `apps/api/src/services/supplier-sku-codes.ts`
- Create: `apps/api/src/services/supplier-sku-codes.test.ts`

- [x] **Step 1: 写失败测试**

增加断言：租户和平台 schema 兼容旧客户端 `sku_code`；编码工具使用完整 UUID，构造相同前缀的两个 UUID 也不会碰撞。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test src/schema/supplier-products.test.ts src/services/supplier-products.test.ts src/services/platform-supplier-products.test.ts`

Expected: 新断言因 schema 仍保留编码、Service 仍透传手工编码而失败。

- [x] **Step 3: 实现最小 schema 转换和编码工具**

创建 `generateSupplierSkuCode(scope, skuId)`，使用完整 UUID 去连字符后的大写字符；调整 create/update schema 兼容旧 `sku_code`，由 Service 负责可信边界规范化。

- [x] **Step 4: 验证聚焦测试通过**

Run: `bun test src/schema/supplier-products.test.ts src/services/supplier-products.test.ts src/services/platform-supplier-products.test.ts`

Expected: 相关测试全部通过。

### Task 2: 服务端强制使用系统编码

**Files:**
- Modify: `apps/api/src/services/supplier-products.test.ts`
- Modify: `apps/api/src/services/supplier-products.ts`
- Modify: `apps/api/src/services/platform-supplier-products.test.ts`
- Modify: `apps/api/src/services/platform-supplier-products.ts`

- [x] **Step 1: 写失败测试**

租户创建命令断言 `sku_code` 为 `TS-...`，平台创建命令断言为 `PS-...`，且手工输入不能覆盖系统值。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test src/services/supplier-products.test.ts src/services/platform-supplier-products.test.ts`

Expected: repository 当前仍收到手工编码，断言失败。

- [x] **Step 3: 在 Service 层注入系统编码**

在两个 create service 调用 repository 前覆盖 `sku_code`，保持现有权限、模板校验和幂等上下文不变。

- [x] **Step 4: 验证 Service 测试通过**

Run: `bun test src/services/supplier-products.test.ts src/services/platform-supplier-products.test.ts`

Expected: 两组测试全部通过。

### Task 3: 简化 Admin SKU 编码交互

**Files:**
- Create: `apps/admin/components/supplier-products/supplier-sku-code-management.test.ts`
- Modify: `apps/admin/components/supplier-products/supplier-sku-dialog.tsx`
- Modify: `apps/admin/components/supplier-products/supplier-sku-table.tsx`
- Modify: `apps/admin/e2e/supplier-product-pricing-workflow.spec.ts`
- Modify: `apps/admin/e2e/supplier-product-pricing-mock-handlers.mjs`

- [x] **Step 1: 写失败测试**

断言新增和编辑载荷均不包含 `sku_code`，编码不影响表单有效性，租户列表隐藏编码而平台列表保留只读编码。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test components/supplier-products/supplier-product-page.test.tsx`

Expected: 当前表单仍可填写编码，列表也无作用域展示规则。

- [x] **Step 3: 实现只读字段和作用域展示**

表单编码字段改为 disabled/readOnly；租户列表不渲染编码，平台列表保留编码；E2E mock 按服务端规则生成编码。

- [x] **Step 4: 验证 Admin 聚焦测试通过**

Run: `bun test components/supplier-products/*.test.ts components/supplier-products/*.test.tsx && pnpm run test:e2e:supplier-product-pricing`

Expected: 相关测试全部通过。

### Task 4: 数据库强制编码并兼容旧幂等请求

**Files:**
- Modify: `apps/api/src/repositories/supplier-products.ts`
- Modify: `apps/api/src/repositories/supplier-products.test.ts`
- Create: `apps/api/src/services/supplier-sku-system-code-migration-contract.test.ts`
- Modify: `apps/api/src/services/supplier-purchasable-products.ts`
- Modify: `apps/api/src/services/supplier-purchasable-products.test.ts`
- Create: `supabase/migrations/20260829160000_system_manage_supplier_sku_codes.sql`

- [x] **Step 1: 写失败测试**

断言 repository 调用 v3，migration 使用完整 UUID、覆盖创建编码、剥离更新编码，并在滚动发布期间保留 v2 的执行权限。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test src/repositories/supplier-products.test.ts src/services/supplier-sku-system-code-migration-contract.test.ts`

Expected: repository 仍调用 v2 且 migration 不存在，断言失败。

- [x] **Step 3: 新增 v3 原子命令**

v3 规范化载荷后调用现有 v2，并在 v2 返回幂等冲突时规范化历史 `_request` 后重新比较，从而保持跨版本重放兼容。新增可采购商品复合命令 v2，使其规范化完整 SKU 编码、调用 SKU v3，并兼容 v1 历史父请求；原 v1 保持不变供旧 API 启动和受控回退。

- [x] **Step 4: 验证聚焦测试通过**

Run: `bun test src/services/supplier-sku-codes.test.ts src/services/supplier-sku-system-code-migration-contract.test.ts src/repositories/supplier-products.test.ts`

Expected: 相关测试全部通过。

### Task 5: 完整验证

**Files:**
- Verify: `apps/api/src/**`
- Verify: `apps/admin/**`

- [x] **Step 1: 运行 API 相关测试和检查**

Run: `bun test src/schema/supplier-products.test.ts src/services/supplier-products.test.ts src/services/platform-supplier-products.test.ts src/controllers/supplier-products/index.test.ts src/controllers/platform-supplier-products/index.test.ts src/repositories/supplier-products.test.ts && bun run check`

Expected: 测试、类型检查、构建和文件大小检查全部通过。

- [x] **Step 2: 运行 Admin 相关测试和检查**

Run: `bun test components/supplier-products/*.test.ts && pnpm run check && pnpm run build`

Expected: 测试、类型检查、文件大小检查和生产构建全部通过。

- [x] **Step 3: 审查差异和迁移边界**

Run: `git diff --check`、`git status --short`

Expected: 无空白错误；migration 只新增 SKU v3、复合命令 v2 和权限调整，不修改或回填既有数据；差异仅包含 SKU 编码管理相关代码、测试和文档。
