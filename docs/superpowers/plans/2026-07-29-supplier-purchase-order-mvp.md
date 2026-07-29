# Supplier Purchase Order MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Keep controller/service/repository boundaries strict and use test-driven-development for every behavior change.

**Goal:** 交付一个项目绑定、服务端统一计价、可保存草稿/提交/取消的供应商采购单 Admin 闭环。

**Architecture:** Supabase migration 提供受限表、集合式有效价格解析和原子命令函数；Fastify controller 仅负责 HTTP，service 组合采购权限、项目范围和供应商准入，repository 是唯一数据库访问层；Next.js Admin 复用现有组件完成分页列表和采购单编辑，并以独立内存 Mock Backend 做确定性 E2E。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/Radix、Playwright

**Approved design:** `docs/superpowers/specs/2026-07-29-supplier-purchase-order-mvp-design.md`

---

### Task 1: 建立权限与请求契约

**Files:**
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`
- Create: `apps/api/src/schema/supplier-purchase-orders.ts`
- Create: `apps/api/src/schema/supplier-purchase-orders.test.ts`

- [ ] **Step 1: 先写权限失败测试**

在 `permission.test.ts` 断言：

```ts
expect(PermissionCodeConfig["supplier.purchase-order.view"]).toEqual({
  label: "查看供应商采购单",
  module: "supplier",
});
expect(PermissionCodeConfig["supplier.purchase-order.manage"]).toEqual({
  label: "管理供应商采购单",
  module: "supplier",
});
```

- [ ] **Step 2: 运行并确认 RED**

Run:

```bash
bun test packages/domain/src/permission.test.ts
```

Expected: 新权限不属于 `PermissionCode` 或不存在于配置。

- [ ] **Step 3: 实现领域权限**

将两个权限加入 `PERMISSION_CODE_VALUES` 和 `PermissionCodeConfig`，不改动其他权限语义。

- [ ] **Step 4: 写采购单 schema 失败测试**

覆盖：

- 分页默认 `1/20`、最大 `100`。
- 订单筛选的 keyword/status/projectId/tenantSupplierId。
- 可采购目录必填 `tenantSupplierId`。
- 草稿为 1 到 100 行，SKU 唯一，数量 `> 0` 且最多 4 位小数。
- 创建 `expected_version = 0`；更新为正整数。
- 提交包含 `expected_version`。
- 取消包含 `expected_version` 和去空格后非空原因。
- UUID、日期、备注长度和未知字段拒绝。

- [ ] **Step 5: 运行并确认 RED**

Run:

```bash
bun test apps/api/src/schema/supplier-purchase-orders.test.ts
```

Expected: schema 模块尚不存在。

- [ ] **Step 6: 实现最小 schema**

导出 HTTP params、列表 query、目录 query、草稿、提交、取消和响应记录的 Zod schema 与推导类型。中文校验文案与邻近 supplier schema 一致。

- [ ] **Step 7: 运行 GREEN 并提交**

Run:

```bash
bun test packages/domain/src/permission.test.ts \
  apps/api/src/schema/supplier-purchase-orders.test.ts
```

Expected: PASS。

Commit:

```bash
git add packages/domain/src/permission.ts \
  packages/domain/src/permission.test.ts \
  apps/api/src/schema/supplier-purchase-orders.ts \
  apps/api/src/schema/supplier-purchase-orders.test.ts
git commit -m "feat(supplier): 定义采购单权限与接口契约"
```

### Task 2: 用 migration 建立采购单事实与原子命令

**Files:**
- Create: `apps/api/src/services/supplier-purchase-order-migration-contract.test.ts`
- Create: `supabase/migrations/20260729180000_create_supplier_purchase_orders.sql`

- [ ] **Step 1: 写 migration 静态契约失败测试**

测试读取固定 migration 并断言：

- 两张表、订单号序列、外键、状态/金额/版本/行数约束。
- 订单、项目、合作关系和明细分页索引。
- RLS 与 `FORCE ROW LEVEL SECURITY`。
- service role 最小授权。
- `supplier_command_events` 允许 `supplier_purchase_order`。
- `resolve_supplier_purchase_order_catalog`。
- `save_supplier_purchase_order_draft`。
- `submit_supplier_purchase_order`。
- `cancel_supplier_purchase_order`。
- actor 租户校验、请求指纹、幂等冲突、乐观锁、价格变化和状态机错误码。
- 两个权限 seed 及租户系统管理员角色授权。
- rollback 注释。

- [ ] **Step 2: 运行并确认 RED**

Run:

```bash
bun test apps/api/src/services/supplier-purchase-order-migration-contract.test.ts
```

Expected: migration 文件不存在。

- [ ] **Step 3: 使用 Supabase CLI 创建 migration**

Run:

```bash
supabase migration new create_supplier_purchase_orders
```

Expected: 生成时间戳为 `20260729180000` 或更晚的 migration；后续测试引用实际文件名。

- [ ] **Step 4: 建立表、约束、索引和安全边界**

实现设计文档第 4 节的数据模型。数据库直接写权限只授予 `service_role`；authenticated/anon 不得直写。

- [ ] **Step 5: 实现集合式有效价格目录函数**

`resolve_supplier_purchase_order_catalog` 必须：

- 校验租户和合作关系。
- 只选 active 商品/SKU 和当前有效 published CNY default 价格。
- 指定必要字段。
- 使用 `LIMIT/OFFSET` 或 `.range()` 等效数据库分页，最大 100。
- 返回总数和稳定排序。
- 不逐行执行查询。

- [ ] **Step 6: 实现草稿保存函数**

实现 actor、项目、合作关系、版本、请求指纹、重复 SKU、行数、统一 `priced_at`、价格解析、快照、金额、整单替换和事件写入。任何一行失败必须回滚整单。

- [ ] **Step 7: 实现提交与取消函数**

提交重新校验项目/供应商和当前价格来源；取消保存原因；三条命令均验证乐观锁和幂等。

- [ ] **Step 8: seed 权限并完成静态 GREEN**

沿用项目现有 permission/role_permissions 的 upsert 风格，只为租户系统管理员默认授权。

Run:

```bash
bun test apps/api/src/services/supplier-purchase-order-migration-contract.test.ts
```

Expected: PASS。

- [ ] **Step 9: SQL 静态检查并提交**

Run:

```bash
supabase db lint --linked --level warning
git diff --check
```

Expected: 本 migration 无 SQL lint 错误；若 linked lint 暴露既有问题，记录并用 migration 范围测试证明新文件无新增问题。

Commit:

```bash
git add apps/api/src/services/supplier-purchase-order-migration-contract.test.ts \
  supabase/migrations/*_create_supplier_purchase_orders.sql
git commit -m "feat(db): 建立供应商采购单原子命令"
```

### Task 3: 实现 repository 与数据库错误映射

**Files:**
- Create: `apps/api/src/repositories/supplier-purchase-orders.ts`
- Create: `apps/api/src/repositories/supplier-purchase-orders.test.ts`
- Modify if reusable extraction is justified: `apps/api/src/repositories/supplier-create-command-rpc.ts`

- [ ] **Step 1: 写 repository 失败测试**

使用注入式 Supabase client 覆盖：

- 订单列表按 tenant、项目范围和过滤条件查询，使用 exact count、必要字段、稳定排序和 `.range()`。
- 详情按 tenant + id 查询。
- 明细按 tenant + order + `.range()` 分页。
- 目录调用 RPC 并传入 page/pageSize/keyword。
- 草稿、提交、取消 RPC 参数统一 `p_` 前缀。
- Zod 校验数据库响应。
- 数据库错误和命令 envelope 业务状态映射到 `Errors.dbError()` / `Errors.business()`。

- [ ] **Step 2: 运行并确认 RED**

Run:

```bash
bun test apps/api/src/repositories/supplier-purchase-orders.test.ts
```

Expected: repository 模块不存在。

- [ ] **Step 3: 实现最小 repository**

复用 supplier price repository 的分页和 RPC 模式，但不要从 repository 调 service。查询必须限定字段且无 N+1。

- [ ] **Step 4: 运行 GREEN 并提交**

Run:

```bash
bun test apps/api/src/repositories/supplier-purchase-orders.test.ts
```

Expected: PASS。

Commit:

```bash
git add apps/api/src/repositories/supplier-purchase-orders.ts \
  apps/api/src/repositories/supplier-purchase-orders.test.ts \
  apps/api/src/repositories/supplier-create-command-rpc.ts
git commit -m "feat(api): 实现采购单数据访问层"
```

### Task 4: 实现 service 权限、项目范围与供应商准入

**Files:**
- Create: `apps/api/src/services/supplier-purchase-order-access.ts`
- Create: `apps/api/src/services/supplier-purchase-order-access.test.ts`
- Create: `apps/api/src/services/supplier-purchase-orders.ts`
- Create: `apps/api/src/services/supplier-purchase-orders.test.ts`

- [ ] **Step 1: 写 access/service 失败测试**

覆盖：

- 无租户、无 employee/user、供应商模块关闭时拒绝。
- view/manage 权限分别控制读取和 mutation。
- 列表使用 `project.read` 可见项目范围；全局项目范围仍强制 tenant。
- 详情需 `project.read`。
- 保存/提交/取消需 `project.update`。
- 保存和提交调用 `assertCanCreatePurchaseOrder`。
- 取消已提交单不因供应商后来暂停而被阻止，但仍需项目更新权限。
- tenantSupplierId 和 order 的关系不一致时拒绝。
- service 只编排，不直接使用 Supabase。

- [ ] **Step 2: 运行并确认 RED**

Run:

```bash
bun test apps/api/src/services/supplier-purchase-order-access.test.ts \
  apps/api/src/services/supplier-purchase-orders.test.ts
```

Expected: service 模块不存在。

- [ ] **Step 3: 实现 access service**

复用 `accessPolicyService`、`tenantSuppliersRepository.getSettings()` 和 `TenantSuppliersService.assertCanCreatePurchaseOrder()`；不复制准入 SQL。

- [ ] **Step 4: 实现 purchase order service**

service 负责：

- 从 auth 构建 tenant/actor command context。
- 合并项目可见范围。
- 读取订单后校验项目权限。
- mutation 前校验目标项目和供应商关系。
- 调 repository 并原样返回已验证的领域结果。

- [ ] **Step 5: 运行 GREEN 并提交**

Run:

```bash
bun test apps/api/src/services/supplier-purchase-order-access.test.ts \
  apps/api/src/services/supplier-purchase-orders.test.ts
```

Expected: PASS。

Commit:

```bash
git add apps/api/src/services/supplier-purchase-order-access.ts \
  apps/api/src/services/supplier-purchase-order-access.test.ts \
  apps/api/src/services/supplier-purchase-orders.ts \
  apps/api/src/services/supplier-purchase-orders.test.ts
git commit -m "feat(api): 编排采购单权限与业务状态"
```

### Task 5: 暴露严格分层的采购单 HTTP API

**Files:**
- Create: `apps/api/src/controllers/supplier-purchase-orders/index.ts`
- Create: `apps/api/src/controllers/supplier-purchase-orders/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写路由失败测试**

覆盖七条设计路由并断言：

- tenant auth context 被解析。
- query/params/body 经过 Zod。
- mutation 缺少 `Idempotency-Key` 返回统一错误。
- controller 调用正确 service 方法。
- 响应经 `ResponseHandler.success`。
- controller 源码不含 `SupabaseDB`、`.from(`、`.rpc(`。

- [ ] **Step 2: 运行并确认 RED**

Run:

```bash
bun test apps/api/src/controllers/supplier-purchase-orders/routes.test.ts
```

Expected: controller 尚不存在或路由未注册。

- [ ] **Step 3: 实现 controller 并注册**

沿用 `TenantBaseController`、`requireSupplierIdempotencyKey` 和 supplier controller 的 `parse()` 模式。

- [ ] **Step 4: 运行 API 范围回归**

Run:

```bash
bun test apps/api/src/schema/supplier-purchase-orders.test.ts \
  apps/api/src/repositories/supplier-purchase-orders.test.ts \
  apps/api/src/services/supplier-purchase-order-access.test.ts \
  apps/api/src/services/supplier-purchase-orders.test.ts \
  apps/api/src/controllers/supplier-purchase-orders/routes.test.ts
bun run api:check
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/controllers/supplier-purchase-orders \
  apps/api/src/routes/index.ts
git commit -m "feat(api): 暴露供应商采购单接口"
```

### Task 6: 实现 Admin 采购单页面

**Required skills:** `admin-design`, `shadcn`

**Files:**
- Create: `apps/admin/app/(console)/supplier-purchase-orders/page.tsx`
- Create: `apps/admin/app/(console)/supplier-purchase-orders/loading.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-types.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-api.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-rules.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-list.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-editor.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-detail.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-workspace.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-workspace.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 写页面和权限失败测试**

断言：

- 菜单路径 `/supplier-purchase-orders` 和 view 权限。
- server page 将 view/manage 权限显式传给 workspace。
- 无 view 权限显示无权状态。
- 无 manage 权限不渲染新建、保存、提交、取消。
- 状态到可用操作映射严格为设计状态机。

- [ ] **Step 2: 写编辑器行为失败测试**

覆盖：

- 必选项目、供应商和至少一行。
- 可采购目录分页搜索。
- 添加 SKU 后客户端只保存 SKU ID 与数量。
- 同 SKU 不重复添加。
- 数量变化、删除行和 100 行上限。
- 保存后以后端金额、`priced_at` 和 version 替换本地事实。
- version conflict 重新加载。
- price changed 提示“重新保存草稿刷新价格”。
- submit/cancel 使用确认弹窗且防重复点击。

- [ ] **Step 3: 运行并确认 RED**

Run:

```bash
bun test apps/admin/components/supplier-purchase-orders
```

Expected: 页面和组件不存在。

- [ ] **Step 4: 实现 API 与纯规则**

复用现有 Admin API fetch 封装和 supplier command attempt；每次 mutation 生成新的幂等键。不要把价格字段放入保存 payload。

- [ ] **Step 5: 实现页面、列表、编辑与详情**

遵守 Admin 设计规范：

- 紧凑页面头和单一主操作。
- 筛选与表格服务端分页。
- 大尺寸 Sheet/Dialog 编辑。
- 金额右对齐并使用等宽数字。
- 状态 badge、空状态、加载骨架和明确错误恢复。
- 只复用现有 shadcn/local components，不新增依赖。

- [ ] **Step 6: 运行 GREEN 和静态检查**

Run:

```bash
bun test apps/admin/components/supplier-purchase-orders
pnpm --dir apps/admin check
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add 'apps/admin/app/(console)/supplier-purchase-orders' \
  apps/admin/components/supplier-purchase-orders \
  apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 实现供应商采购单工作台"
```

### Task 7: 建立确定性采购单 E2E

**Files:**
- Create: `apps/admin/e2e/supplier-purchase-order-mock-fixture.mjs`
- Create: `apps/admin/e2e/supplier-purchase-order-mock-backend.mjs`
- Create: `apps/admin/e2e/supplier-purchase-order-workflow.spec.ts`
- Create: `apps/admin/playwright.supplier-purchase-order.config.ts`
- Modify: `apps/admin/package.json`

- [ ] **Step 1: 建立固定会话和内存状态**

固定会话具备采购单 view/manage、project read/update 权限。Mock 提供项目、供应商、有效价格目录、订单、明细和 mutation journal，并严格分页。

- [ ] **Step 2: 写端到端失败测试**

真实页面操作：

1. 登录并打开采购订单。
2. 新建单，选择项目和供应商。
3. 搜索并添加两个 SKU、修改数量。
4. 保存草稿并验证后端金额。
5. 再次编辑，触发一次 price changed 后重新保存。
6. 提交。
7. 从列表打开详情。
8. 取消并填写原因。
9. 检查 journal，保存 payload 不含单价、税率、金额或价格 ID。

- [ ] **Step 3: 运行并确认 RED**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-purchase-order
```

Expected: Mock 写接口或页面行为未完成时失败。

- [ ] **Step 4: 补齐 Mock 和 UI 行为直到 GREEN**

Mock 应模拟乐观锁、幂等、价格变化和状态机，不连接共享数据库。

- [ ] **Step 5: 提交**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-purchase-order
```

Expected: PASS。

Commit:

```bash
git add apps/admin/e2e/supplier-purchase-order-* \
  apps/admin/playwright.supplier-purchase-order.config.ts \
  apps/admin/package.json
git commit -m "test(admin): 覆盖采购单确定性工作流"
```

### Task 8: 应用 migration、生成类型并做真实数据库 smoke

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/scripts/supplier-purchase-order-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchase-order-smoke.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 先核对 Bun 1.3.2 SQL 客户端并写 smoke helper 单测**

先从当前 Bun 类型定义/运行时确认 `Bun.SQL` 的连接、transaction 和 rollback API，禁止猜测。测试固定数据 ID、命令响应断言和 rollback 保护。Smoke 必须使用 `SUPABASE_DB_DIRECT_URL` 或 `SUPABASE_DB_URL` 开启单个数据库事务，并在成功和失败路径都回滚；不得提交测试 DML，也不得执行事务外清理。

- [ ] **Step 2: 运行 helper GREEN**

Run:

```bash
bun test apps/api/src/scripts/supplier-purchase-order-smoke.test.ts
```

- [ ] **Step 3: 应用 migration**

使用用户提供的 `/Users/leefo/Public/work/gooes/.env` 加载连接配置，先检查：

```bash
supabase migration list
supabase db push --dry-run
```

确认只包含本阶段 migration 后执行：

```bash
supabase db push
supabase migration list
```

Expected: Local/Remote 对齐。禁止手工远端 DDL/DML。

- [ ] **Step 4: 生成类型**

Run:

```bash
bun run gen
```

Expected: `apps/api/src/types/database.ts` 包含两张新表和三个命令 RPC。

- [ ] **Step 5: 实现并运行真实数据库 smoke**

覆盖：

- 创建草稿成功且金额正确。
- 同幂等键同请求返回同结果。
- 同幂等键不同请求冲突。
- 旧 version 冲突。
- 当前价格变化导致提交冲突。
- 重新保存后提交成功。
- 已提交单取消成功。
- 另一租户无法读取或 mutation。
- 最终显式回滚，并在新连接中确认固定测试订单不存在。

Run:

```bash
bun --env-file=/Users/leefo/Public/work/gooes/.env \
  apps/api/src/scripts/supplier-purchase-order-smoke.ts
```

Expected: 所有断言 PASS，退出后无测试订单残留。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/types/database.ts \
  apps/api/src/scripts/supplier-purchase-order-smoke.ts \
  apps/api/src/scripts/supplier-purchase-order-smoke.test.ts \
  apps/api/package.json
git commit -m "test(api): 验证采购单数据库闭环"
```

### Task 9: 完整验证、审查和集成

**Required skills:** `verification-before-completion`, `requesting-code-review`, `finishing-a-development-branch`

- [ ] **Step 1: 运行采购域完整测试**

Run:

```bash
bun test \
  packages/domain/src/permission.test.ts \
  apps/api/src/schema/supplier-purchase-orders.test.ts \
  apps/api/src/repositories/supplier-purchase-orders.test.ts \
  apps/api/src/services/supplier-purchase-order-migration-contract.test.ts \
  apps/api/src/services/supplier-purchase-order-access.test.ts \
  apps/api/src/services/supplier-purchase-orders.test.ts \
  apps/api/src/controllers/supplier-purchase-orders/routes.test.ts \
  apps/api/src/scripts/supplier-purchase-order-smoke.test.ts
bun test apps/admin/components/supplier-purchase-orders
```

Expected: PASS。

- [ ] **Step 2: 运行相邻供应域回归**

Run:

```bash
bun test \
  apps/api/src/schema/supplier-products.test.ts \
  apps/api/src/schema/supplier-price-lists.test.ts \
  apps/api/src/repositories/supplier-products.test.ts \
  apps/api/src/repositories/supplier-price-lists.test.ts \
  apps/api/src/services/supplier-product-access.test.ts \
  apps/api/src/services/supplier-products.test.ts \
  apps/api/src/services/supplier-price-lists.test.ts \
  apps/api/src/services/tenant-suppliers.test.ts
bun test apps/admin/components/supplier-products
```

Expected: PASS。

- [ ] **Step 3: 运行构建和 E2E**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin test:e2e:supplier-purchase-order
pnpm --dir apps/admin test:e2e:supplier-product-pricing
```

Expected: PASS。

- [ ] **Step 4: 安全与 migration 核查**

Run:

```bash
bun run check:permission-boundaries
bun run audit:supabase-writes
supabase migration list
git diff --check
git status --short
```

Expected: 无新增越界写、Local/Remote 对齐、工作树只含预期变更。

- [ ] **Step 5: 代码审查**

审查重点：

- controller/service/repository 分层。
- 无客户端价格信任、无 N+1、所有列表分页。
- tenant/project/relationship 三重边界。
- 幂等请求指纹、乐观锁和状态机。
- 已提交快照不可变。
- Admin 所有按钮都有真实行为和权限保护。
- rollback 与部署顺序。

修复 Critical/Important 问题后重新运行受影响验证。

- [ ] **Step 6: 最终提交与集成**

若审查修复产生变更：

```bash
git add <review-fix-files>
git commit -m "fix(supplier): 完善采购单发布边界"
```

在主工作区确认 main 无未提交冲突后：

```bash
git merge --no-ff feature/supplier-purchase-orders \
  -m "merge: 集成供应商采购单 MVP"
```

在 main 再运行最小 smoke 和 migration list，确认 merge commit 包含全部阶段提交。
