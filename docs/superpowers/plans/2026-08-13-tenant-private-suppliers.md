# 租户私有供应商与内部编码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许租户创建永久私有供应商、添加平台共享供应商，并通过手工输入或显式点击生成不可复用的租户内部供应商编码。

**Architecture:** 继续使用现有 `suppliers` 与 `tenant_suppliers`，私有供应商和合作关系由同一数据库命令原子创建。租户级 counter 与 registry 负责编码预占/消费/审计；API 延续 tenant supplier controller/service/repository 分层，Admin 在现有新增供应商对话框中提供“平台共享”和“私有供应商”双入口。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/Radix、Tailwind、Playwright。

**Prerequisite:** `docs/superpowers/plans/2026-08-13-supplier-ownership-foundation.md` 已合并且 migration 已对齐。

---

## File Map

- `supabase/migrations/20260813160000_create_tenant_private_suppliers.sql`：内部编码登记、原子创建、历史关系补码和审计。
- `supabase/migrations/20260813160100_harden_tenant_private_supplier_codes.sql`：已应用环境的租户级分配幂等与私有供应商编码不可变收口。
- `supabase/migrations/20260813160400_harden_tenant_supplier_read_visibility.sql`：关系列表仅暴露当前租户可见主档，共享目录仅返回平台供应商。
- `supabase/migrations/20260813160200_close_tenant_supplier_code_invariants.sql`：阻断创建键后置分配，并在不可变保护前安全规范化旧私有编码。
- `supabase/migrations/20260813160300_index_supplier_allocation_conflict_events.sql`：为创建键反向冲突查询增加最小部分索引。
- `supabase/migrations/20260813160700_isolate_private_suppliers_from_platform.sql`：平台目录和平台写命令只接受平台归属供应商，并撤销旧无保护 RPC 权限。
- `supabase/migrations/20260813160800_classify_private_supplier_identity_conflicts.sql` 至 `20260813161000_authorize_private_supplier_identity_check.sql`：并发串行化租户主体判重，保持原校验语义，并在授权及 rollout 校验后返回主体冲突。
- `supabase/migrations/20260813161100_close_supplier_platform_boundaries.sql`：收紧平台准入主体查询、平台命令锁和目录 ACL，并统一私有供应商主体创建/更新锁。
- `apps/api/src/schema/tenant-suppliers.ts`：分配、共享关系、私有创建和主档更新 schema。
- `apps/api/src/repositories/tenant-suppliers.ts`：分页查询和 RPC gateway。
- `apps/api/src/services/tenant-suppliers.ts`：权限、所有权和命令编排。
- `apps/api/src/controllers/tenant-suppliers/index.ts`：新增三个 HTTP 命令。
- `apps/admin/components/suppliers/add-supplier-dialog.tsx`：双模式表单和显式生成按钮。
- `apps/admin/components/suppliers/supplier-types.ts`：来源、所有权和编码响应类型。

### Task 1: 定义 schema、错误码和响应契约

**Files:**
- Modify: `apps/api/src/schema/tenant-suppliers.ts`
- Create: `apps/api/src/schema/tenant-suppliers.test.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/errors/error-codes.test.ts`

- [ ] **Step 1: 写 RED 测试**

覆盖编码 `trim + upper`、`^[A-Z0-9_-]{2,64}$`、自动创建必须提交 `allocation_id`、手工创建禁止提交 allocation、共享关系也必须有内部编码、分页默认 1/20 最大 100、私有供应商联系人和地址字段长度。

```ts
expect(TenantSupplierCodeAllocationSchema.parse({})).toEqual({});
expect(TenantSupplierPrivateCreateSchema.parse({
  name: "甲方材料",
  internal_supplier_code: " sup-000001 ",
  allocation_id: allocationId,
  primary_contact: { name: "张三", phone: "13800000000" },
}).internal_supplier_code).toBe("SUP-000001");
```

新增稳定错误码：`SUPPLIER_OWNERSHIP_CONFLICT`、`SUPPLIER_CODE_CONFLICT`、`SUPPLIER_CODE_ALLOCATION_CONFLICT`、`TENANT_SUPPLIER_NOT_FOUND`、`TENANT_SUPPLIER_STATE_CONFLICT`、`PRIVATE_RESOURCE_FORBIDDEN`。

- [ ] **Step 2: 运行 RED**

```bash
cd apps/api && bun test src/schema/tenant-suppliers.test.ts src/errors/error-codes.test.ts
```

- [ ] **Step 3: 实现并运行 GREEN**

导出 `TenantSupplierCodeAllocationSchema`、`TenantSupplierSharedCreateSchema`、`TenantSupplierPrivateCreateSchema`、`TenantPrivateSupplierUpdateSchema`。使用 Zod discriminated union 区分 `code_source: generated | manual`，避免 service 猜测。

```bash
cd apps/api && bun test src/schema/tenant-suppliers.test.ts src/errors/error-codes.test.ts
git add src/schema/tenant-suppliers.ts src/schema/tenant-suppliers.test.ts src/errors/error-codes.ts src/errors/error-codes.test.ts
git commit -m "feat(api): 定义私有供应商接口契约"
```

### Task 2: 建立编码 registry 和原子供应商命令

**Files:**
- Create: `apps/api/src/services/tenant-private-supplier-migration-contract.test.ts`
- Create: `supabase/migrations/20260813160000_create_tenant_private_suppliers.sql`
- Create: `supabase/migrations/20260813160100_harden_tenant_private_supplier_codes.sql`
- Create: `supabase/migrations/20260813160200_close_tenant_supplier_code_invariants.sql`
- Create: `supabase/migrations/20260813160300_index_supplier_allocation_conflict_events.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言 `tenant_supplier_code_counters`、`tenant_supplier_code_registry`、`allocate_tenant_supplier_code`、`create_tenant_private_supplier`、扩展后的共享关系命令、唯一索引、advisory/row lock、请求摘要幂等、所有权校验、RLS/FORCE RLS、审计事件、REVOKE/GRANT 和回滚说明。

- [ ] **Step 2: 运行 RED 并创建 migration**

```bash
cd apps/api && bun test src/services/tenant-private-supplier-migration-contract.test.ts
cd ../.. && supabase migration new create_tenant_private_suppliers
```

- [ ] **Step 3: 实现编码分配**

`allocate_tenant_supplier_code(p_tenant_id,p_actor_user_id,p_actor_employee_id,p_idempotency_key)` 必须：验证 actor；按 `(tenant_id,idempotency_key)` 返回同一 allocation；锁 counter；首次从已登记 `SUP-[0-9]{6}` 最大后缀 + 1 初始化；跳过 registry 中所有状态；插入 `reserved`；返回 `{allocation_id,code,idempotent}`。范围固定 `000001..999999`，耗尽返回 `SUPPLIER_CODE_ALLOCATION_CONFLICT`。

同租户同幂等键若已被任一供应商创建命令使用，后续分配必须在写 registry 前稳定返回 `SUPPLIER_CODE_ALLOCATION_CONFLICT`；创建与分配共用租户键锁。分配本身仍允许不同员工重放并返回同一 allocation。

反向冲突查询使用 `(tenant_id,idempotency_key)` 部分索引，只纳入 `create_tenant_private_supplier`、`create_tenant_shared_supplier_relationship` 和兼容命令 `create_tenant_supplier`；`command` 仅作为部分谓词，不重复进入索引键。

- [ ] **Step 4: 实现私有创建与共享关系创建**

`create_tenant_private_supplier` 在一个事务中验证 code registry、插入 `suppliers(ownership_scope='tenant',owner_tenant_id=tenant_id,code=normalized_code)`、联系人/地址、`tenant_suppliers(status='evaluating',internal_supplier_code=normalized_code)`、消费 allocation 或登记 manual code、写审计事件。共享关系命令只接受 platform supplier，拒绝其他租户私有 supplier。数据库 trigger 禁止修改已保存的 `internal_supplier_code`。

创建命令使用独立 command 表或现有 event 幂等模式，分配键与创建键相同必须返回 `SUPPLIER_CODE_ALLOCATION_CONFLICT`。停用或删除不释放编码。超过 24 小时的 reserved 可由 migration 中受控维护函数标记 `abandoned`，但所有状态仍参与唯一判重。

租户私有 `suppliers.code` 与 `tenant_suppliers.internal_supplier_code` 必须精确保存同一规范化大写值。升级 migration 先拒绝规范化后仍不一致、缺失关系或租户错配的数据，再修复仅大小写/首尾空白差异，最后安装不可变触发器；平台供应商编码不受此门禁影响。

- [ ] **Step 5: 补齐既有合作关系编码**

在同一 migration 中为 `tenant_suppliers.internal_supplier_code` 先加 nullable 列；按租户、稳定 `created_at,id` 顺序分配 migration code 并登记 `source='migration',status='used'`；验证无空值和重复后设 NOT NULL、加 `(tenant_id,internal_supplier_code)` 唯一约束。平台 `suppliers.code` 不改写；租户私有编码仅允许在不可变门禁前安全规范化为与关系编码精确一致的值。

- [ ] **Step 6: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/tenant-private-supplier-migration-contract.test.ts
cd ../.. && git diff --check
git add apps/api/src/services/tenant-private-supplier-migration-contract.test.ts supabase/migrations/20260813160000_create_tenant_private_suppliers.sql supabase/migrations/20260813160100_harden_tenant_private_supplier_codes.sql supabase/migrations/20260813160200_close_tenant_supplier_code_invariants.sql supabase/migrations/20260813160300_index_supplier_allocation_conflict_events.sql
git commit -m "feat(db): 建立租户私有供应商命令"
```

### Task 3: 扩展 repository gateway

**Files:**
- Modify: `apps/api/src/repositories/tenant-suppliers.ts`
- Modify: `apps/api/src/repositories/tenant-suppliers.test.ts`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/repositories/tenant-suppliers-mappers.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`
- Create: `supabase/migrations/20260813160400_harden_tenant_supplier_read_visibility.sql`

- [ ] **Step 1: 写 RED 测试**

覆盖三个 RPC；列表只返回平台共享或当前租户私有供应商；directory 排除其他租户私有记录；`.range()`、exact count、必要字段和稳定排序；RPC envelope 用 Zod 校验。

- [ ] **Step 2: 运行 RED**

```bash
cd apps/api && bun test src/repositories/tenant-suppliers.test.ts
```

- [ ] **Step 3: 生成类型并实现 gateway**

应用本地 migration 后重新生成 `database.ts`。新增：

```ts
allocateInternalCode(input: AllocateCodeCommand): Promise<CodeAllocation>;
createPrivateSupplier(input: CreatePrivateSupplierCommand): Promise<TenantSupplierDetail>;
createSharedRelationship(input: CreateSharedRelationshipCommand): Promise<TenantSupplierDetail>;
```

数据库业务错误映射稳定错误码，其余使用 `Errors.dbError()`。

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/repositories/tenant-suppliers.test.ts
git add src/repositories/tenant-suppliers.ts src/repositories/tenant-suppliers.test.ts src/types/database.ts
git commit -m "feat(api): 接入私有供应商数据库命令"
```

### Task 4: 实现 service 权限和业务边界

**Files:**
- Modify: `apps/api/src/services/tenant-suppliers.ts`
- Modify: `apps/api/src/services/tenant-suppliers.test.ts`
- Create: `apps/api/src/services/tenant-supplier-private-commands.ts`
- Create: `apps/api/src/services/tenant-supplier-private-commands.test.ts`
- Create: `apps/api/src/services/tenant-private-supplier-master-update-migration-contract.test.ts`
- Modify: `apps/api/src/repositories/tenant-supplier-private-commands.ts`
- Modify: `apps/api/src/repositories/tenant-supplier-private-commands.test.ts`
- Modify: `apps/api/src/repositories/tenant-suppliers-mappers.ts`
- Modify: `apps/api/src/repositories/tenant-suppliers.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/types/database.ts`
- Create: `supabase/migrations/20260813160500_create_tenant_private_supplier_master_update.sql`
- Create: `supabase/migrations/20260813160600_audit_tenant_private_supplier_master_updates.sql`

- [ ] **Step 1: 写 RED 测试**

覆盖：分配与私有创建要求 `supplier.master.manage` 和 `private_supplier_writes_enabled`；共享关系要求 `supplier.manage`；他租户 supplier 返回不可见；平台 supplier 可建立关系；私有 supplier 创建后归属与关系租户一致；主档更新只允许当前租户私有 supplier；所有写命令检查模块开启。

- [ ] **Step 2: 实现 service**

service 只生成 command DTO、调用 ownership access 与 repository；不直接 `.from()`。分配接口不因表单字段为空自动调用；私有创建必须由 schema 明确给出 `generated/manual`。私有主档更新通过单个 RPC 在同一事务中锁定租户关系和 supplier、复核归属与版本后更新，避免 service 预读与写入之间的竞态窗口。
该 RPC 同事务写入 `supplier_command_events`，保留操作者、更新前后主档快照与结果版本；PATCH 不新增客户端幂等要求，数据库为审计事件生成独立关联键。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/tenant-suppliers.test.ts
git add src/services/tenant-suppliers.ts src/services/tenant-suppliers.test.ts
git commit -m "feat(api): 编排私有供应商业务"
```

### Task 5: 暴露 HTTP 路由

**Files:**
- Modify: `apps/api/src/controllers/tenant-suppliers/index.ts`
- Create: `apps/api/src/controllers/tenant-suppliers/index.test.ts`

- [ ] **Step 1: 写 controller RED 测试**

固定路由：`POST /suppliers/code-allocations`、`POST /suppliers/private`、现有 `POST /suppliers` 作为添加平台共享供应商、`PATCH /suppliers/:id/master` 更新私有主档。前三个写命令要求 `Idempotency-Key`，响应统一 `ResponseHandler.success`。

- [ ] **Step 2: 实现并验证**

controller 只解析 request、调用 service 和包装响应，不自行查询或决定所有权。

```bash
cd apps/api && bun test src/controllers/tenant-suppliers/index.test.ts
git add src/controllers/tenant-suppliers/index.ts src/controllers/tenant-suppliers/index.test.ts
git commit -m "feat(api): 开放租户私有供应商路由"
```

### Task 6: 实现 Admin 双入口和一键生成交互

**Files:**
- Modify: `apps/admin/components/suppliers/add-supplier-dialog.tsx`
- Create: `apps/admin/components/suppliers/supplier-create-api.ts`
- Modify: `apps/admin/components/suppliers/supplier-types.ts`
- Modify: `apps/admin/components/suppliers/tenant-supplier-table.tsx`
- Modify: `apps/admin/components/suppliers/supplier-interactions.test.ts`
- Modify: `apps/admin/components/suppliers/suppliers-page.test.ts`

- [ ] **Step 1: 写 UI RED 测试**

断言新增对话框先选“添加平台共享供应商/新建私有供应商”；两种模式都有内部编码；“自动生成”按钮仅在用户点击后请求 `/suppliers/code-allocations`；回填后可编辑；切换/取消不会静默保存；提交使用新的创建幂等键；冲突错误落在编码字段。

- [ ] **Step 2: 实现交互**

按钮 pending 时禁用重复点击并保留表单；生成成功保存 `allocation_id`。用户编辑生成值后立即清空 `allocation_id` 并切换 `code_source='manual'`，服务端原预留不会被误消费。列表增加“平台共享/租户私有”徽标和内部编码列。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/admin && bun test components/suppliers/supplier-interactions.test.ts components/suppliers/suppliers-page.test.ts
git add components/suppliers/add-supplier-dialog.tsx components/suppliers/supplier-types.ts components/suppliers/tenant-supplier-table.tsx components/suppliers/supplier-interactions.test.ts components/suppliers/suppliers-page.test.ts
git commit -m "feat(admin): 支持新建租户私有供应商"
```

### Task 7: 阶段 smoke 与 migration 验证

**Files:**
- Modify: `apps/admin/e2e/supplier-foundation-smoke.spec.ts`
- Create: `apps/admin/playwright.supplier-foundation.config.ts`
- Create: `apps/admin/e2e/supplier-foundation-mock-backend.mjs`

- [ ] **Step 1: 增加 E2E 场景**

覆盖手工编码、点击生成、生成后改手工值、重复编码提示、添加平台供应商、私有供应商来源徽标。mock 必须断言分配和创建使用不同幂等键。

- [ ] **Step 2: 运行最小验证**

```bash
bun run api:typecheck
bun run admin:check
cd apps/api && bun test src/schema/tenant-suppliers.test.ts src/repositories/tenant-suppliers.test.ts src/services/tenant-suppliers.test.ts src/services/tenant-private-supplier-migration-contract.test.ts
cd ../admin && bun test components/suppliers/supplier-interactions.test.ts components/suppliers/suppliers-page.test.ts
pnpm exec playwright test --config=playwright.supplier-foundation.config.ts
```

- [ ] **Step 3: 数据库并发 smoke**

对同一租户并发分配 20 次，断言 code/allocation 全部唯一；重放同一幂等键返回同一结果；手工占用 `SUP-000021` 后生成器跳过；两个租户可分别使用同一内部编码；其他租户无法关联私有 supplier。

- [ ] **Step 4: 核对迁移与工作树**

运行 `supabase migration list --local`、`git diff --check`、`git status --short`，确保本地 migration 对齐且不包含用户删除的 tgz 文件；远端状态另行只读核对。
