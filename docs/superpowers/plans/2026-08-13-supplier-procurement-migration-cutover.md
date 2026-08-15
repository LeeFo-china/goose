# 采购快照、存量迁移与切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 确定性迁移存量商品归属与跨租户副本，扩展采购申请/采购单完整快照，并在异常归零后安全切换到新的租户隔离模型。

**Architecture:** 先用只读 preflight 汇总创建和使用证据，再由 migration 建立永久 mapping/issue 审计表并克隆商品。采购命令从服务端锁定的主档、合作关系、价格和合同生成 versioned snapshot；历史记录只使用同时期不可变证据补齐，无法证明的字段明确标为历史未记录。最终 migration 在 open issue 为零时才启用 NOT NULL、复合 FK 和新写门禁。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration、Next.js、React、Playwright。

**Prerequisite:** `docs/superpowers/plans/2026-08-13-tenant-private-supplier-catalog-products.md` 已合并，新增商品和价格已按所有权写入。

---

## File Map

- `scripts/supplier-product-ownership-preflight.ts`：只读证据和异常统计。
- `supabase/migrations/20260813190000_create_supplier_product_migration_audit.sql`：永久 mapping/issue 表。
- `supabase/migrations/20260813191000_backfill_supplier_product_ownership.sql`：确定性归属、克隆和引用重写。
- `supabase/migrations/20260813192000_add_supplier_procurement_snapshots.sql`：采购完整快照和不可变守卫。
- `supabase/migrations/20260813193000_enforce_supplier_ownership_cutover.sql`：异常归零检查、最终约束和开关。
- `apps/api/src/services/supplier-purchase-requisitions.ts`：申请提交快照编排。
- `apps/api/src/services/supplier-purchase-orders.ts`：订单保存/提交快照编排。
- `apps/admin/e2e/supplier-private-procurement-isolation.spec.ts`：两租户端到端隔离。

### Task 1: 建立只读迁移 preflight

**Files:**
- Create: `scripts/supplier-product-ownership-preflight.ts`
- Create: `scripts/supplier-product-ownership-preflight.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写 RED 测试**

用 fixture 覆盖六类证据：唯一创建租户；无创建但唯一使用租户；创建 A 使用 B；无创建多租户使用；多租户创建事件；父子/价格引用不一致。断言员工租户只能佐证，`acting_tenant_id` 不能决定归属。

- [ ] **Step 2: 运行 RED**

```bash
bun test scripts/supplier-product-ownership-preflight.test.ts
```

- [ ] **Step 3: 实现只读分析器**

脚本只执行 SELECT/RPC read，不写数据库。按 product 一次聚合：最早 `create_supplier_product` 事件 tenant、价格簿 tenant、采购申请父 tenant、采购单父 tenant、SKU 和引用计数；输出 JSON 到 stdout，包含 `assignments`、`clones`、`issues` 和 totals。所有查询分页，每页最多 100，事件和引用按集合查询避免 N+1。根 `package.json` 增加 `"supplier:ownership-preflight": "bun scripts/supplier-product-ownership-preflight.ts"`。

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
bun test scripts/supplier-product-ownership-preflight.test.ts
bun run supplier:ownership-preflight -- --help
git add scripts/supplier-product-ownership-preflight.ts scripts/supplier-product-ownership-preflight.test.ts package.json
git commit -m "feat(tooling): 增加商品归属迁移预检"
```

### Task 2: 建立永久迁移审计和确定性回填

**Files:**
- Create: `apps/api/src/services/supplier-product-backfill-migration-contract.test.ts`
- Create: `supabase/migrations/20260813190000_create_supplier_product_migration_audit.sql`
- Create: `supabase/migrations/20260813191000_backfill_supplier_product_ownership.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言 `supplier_product_ownership_migration_map` 和 `supplier_ownership_migration_issues` 的唯一约束、evidence JSON、状态/解决审计、RLS/FORCE RLS；断言 backfill 使用创建事件和父记录 tenant，克隆 product/SKU，重写 price/requisition/order 外键但不修改快照值，并在不唯一时写 issue。

- [ ] **Step 2: 运行 RED 并创建 migrations**

```bash
cd apps/api && bun test src/services/supplier-product-backfill-migration-contract.test.ts
cd ../.. && supabase migration new create_supplier_product_migration_audit
supabase migration new backfill_supplier_product_ownership
```

- [ ] **Step 3: 实现审计表**

mapping 唯一键为 `(old_product_id,old_sku_id,tenant_id)`，保存 new IDs、evidence 和时间；issue 唯一键为 `(resource_type,resource_id,issue_type)`，状态只允许 `open/resolved`，解决时强制 resolution、resolver 和 resolved_at 同时存在。表对业务角色只读，写入只允许 migration/service_role 受控函数。

- [ ] **Step 4: 实现归属与克隆**

规则严格按设计 10.2：唯一创建 tenant 拥有原件并为其他使用 tenant 克隆；无创建且唯一使用归该 tenant；其余写 open issue。每个克隆生成新 UUID，复制业务字段但设置 tenant ownership、创建来源 `migration_clone`，并复制 SKU/结构化规格。历史 command event 保持 append-only。

- [ ] **Step 5: 重写租户引用并校验**

按价格簿、采购申请和采购单父 `tenant_id` 将商品/SKU FK 指向 mapping 对应副本；商品快照、金额和税值不变。发现没有唯一 mapping、SKU 不属于映射商品、价格 tenant 链不一致或草稿已不满足 active 关系时写 issue。已提交记录允许继续履约，草稿 issue 阻止提交。

- [ ] **Step 6: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/supplier-product-backfill-migration-contract.test.ts
cd ../.. && git add apps/api/src/services/supplier-product-backfill-migration-contract.test.ts supabase/migrations/20260813190000_create_supplier_product_migration_audit.sql supabase/migrations/20260813191000_backfill_supplier_product_ownership.sql
git commit -m "feat(db): 迁移存量供应商商品归属"
```

### Task 3: 执行异常归零门禁

**Files:**
- Create only when preflight reports open issues: `supabase/migrations/20260813191500_resolve_supplier_product_ownership_issues.sql`
- Create: `apps/api/src/services/supplier-product-migration-gate.test.ts`

- [ ] **Step 1: 在目标环境运行 preflight**

加载仓库 `.env` 后运行 `bun run supplier:ownership-preflight`，保存输出到发布工单或安全审计附件，不把生产数据提交仓库。核对 assignments/clones/issues totals 与数据库计数一致。

- [ ] **Step 2: 处理条件分支**

若 open issue 为 0，不创建 `20260813191500...`。若大于 0，逐项用原始单据和事件确定原始 tenant 与 clone tenant；创建该 migration，以明确的 resource UUID、evidence 摘要和 resolver employee UUID 更新 mapping/引用并将 issue 标记 resolved。禁止用当前 `acting_tenant_id`、员工现属 tenant 或当前主档值猜测。

- [ ] **Step 3: 写并运行门禁测试**

测试断言每个被价格、申请或订单引用的 product/SKU 都能按父 tenant 唯一映射，且 `SELECT count(*) FROM supplier_ownership_migration_issues WHERE status='open'` 为 0。若不是 0，任务停止，不执行最终约束 migration。

- [ ] **Step 4: 提交可审计解决 migration**

仅在确有异常时提交：

```bash
git add supabase/migrations/20260813191500_resolve_supplier_product_ownership_issues.sql apps/api/src/services/supplier-product-migration-gate.test.ts
git commit -m "fix(db): 解决商品归属迁移异常"
```

无异常时只提交 gate test，提交信息为 `test(db): 增加商品迁移切换门禁`。

### Task 4: 扩展采购申请与采购单快照

**Files:**
- Create: `apps/api/src/services/supplier-procurement-snapshot-migration-contract.test.ts`
- Create: `supabase/migrations/20260813192000_add_supplier_procurement_snapshots.sql`

- [ ] **Step 1: 写 migration RED 测试**

申请和订单 parent 新增：`snapshot_schema_version`、`supplier_ownership_scope_snapshot`、`supplier_master_code_snapshot`、`tenant_internal_supplier_code_snapshot`、`supplier_name_snapshot`、`supplier_legal_name_snapshot`、`supplier_identity_snapshot`、`contract_snapshot`、`supplier_contact_snapshot`、`delivery_address_snapshot`。items 新增：`category_full_name_snapshot`、`brand_name_snapshot`、`spec_values_snapshot`、`unit_conversion_snapshot`、`currency_snapshot`；保留现有商品/SKU/单位/价格/税快照。

- [ ] **Step 2: 创建 migration 并实现 version 规则**

```bash
cd apps/api && bun test src/services/supplier-procurement-snapshot-migration-contract.test.ts
cd ../.. && supabase migration new add_supplier_procurement_snapshots
```

既有记录设 `snapshot_schema_version=0`，新提交设 1。version 1 的上述关键字段必须非空；version 0 只从同时期不可变单据/事件补齐可证明值，无法证明保持 null，Admin 显示“历史数据未记录”。禁止从当前 supplier、联系人、地址、分类或品牌回填并冒充历史事实。

- [ ] **Step 3: 重写保存/提交/转换 RPC**

扩展 `save_supplier_purchase_requisition_draft`、`submit_supplier_purchase_requisition`、`save_supplier_purchase_order_draft`、订单 submit 命令和 `convert_supplier_purchase_requisition`。在数据库锁内校验：当前 tenant project、active relationship、可见 product/SKU、当前 tenant 有效价格、合同/地址/联系人；由服务端读取并冻结 snapshot，客户端只提交 IDs 和数量。

转换申请到订单复制已冻结的申请快照，不重新读取当前主档；订单提交可对草稿显式刷新后产生 version 1。提交后 snapshot guard 禁止原地修改，现有履约、应付和付款继续读取订单快照。

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/supplier-procurement-snapshot-migration-contract.test.ts src/services/supplier-purchase-requisition-command-migration-contract.test.ts src/services/supplier-purchase-order-migration-contract.test.ts src/services/supplier-purchase-order-hardening-migration-contract.test.ts
cd ../.. && git add apps/api/src/services/supplier-procurement-snapshot-migration-contract.test.ts supabase/migrations/20260813192000_add_supplier_procurement_snapshots.sql
git commit -m "feat(db): 冻结采购供应商完整快照"
```

### Task 5: 更新采购 API 的资格校验与响应

**Files:**
- Modify: `apps/api/src/repositories/supplier-purchase-requisitions.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-orders.ts`
- Modify: `apps/api/src/services/supplier-purchase-requisitions.ts`
- Modify: `apps/api/src/services/supplier-purchase-orders.ts`
- Modify: `apps/api/src/schema/supplier-purchase-requisitions.ts`
- Modify: `apps/api/src/schema/supplier-purchase-orders.ts`
- Modify: corresponding `*.test.ts` files
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 写 RED 测试**

采购目录合并 platform 与本 tenant 商品，只返回 active relationship 和当前 tenant 有效价格；暂停/终止关系拒绝新申请/订单；历史详情仍可读；列表分页保持最大 100，采购目录最大 20；响应含完整 snapshot 和 schema version。

- [ ] **Step 2: 实现 repository/service**

repository 用集合查询/现有 RPC，不按行加载分类、品牌或价格。service 仅校验权限 `supplier.purchase-requisition.*` / `supplier.purchase-order.*`、模块和响应；数据库 RPC 是最终资格与快照边界。新增 `SUPPLIER_ORDER_NOT_ELIGIBLE` 的中文映射。

- [ ] **Step 3: 生成类型并运行 GREEN**

```bash
cd apps/api && bun test src/services/supplier-purchase-requisitions.test.ts src/services/supplier-purchase-orders.test.ts src/types/database-supplier-purchase-requisition-contract.test.ts
git add src/repositories/supplier-purchase-requisitions* src/repositories/supplier-purchase-orders* src/services/supplier-purchase-requisitions* src/services/supplier-purchase-orders* src/schema/supplier-purchase-requisitions.ts src/schema/supplier-purchase-orders.ts src/types/database.ts
git commit -m "feat(api): 接入采购所有权与快照契约"
```

### Task 6: 启用最终数据库约束和切换开关

**Files:**
- Create: `apps/api/src/services/supplier-ownership-cutover-migration-contract.test.ts`
- Create: `supabase/migrations/20260813193000_enforce_supplier_ownership_cutover.sql`

- [ ] **Step 1: 写 RED 测试**

断言 migration 开头检查 open issue=0、所有引用有唯一 mapping、product/SKU ownership 无空值；之后才设 NOT NULL、复合 FK、局部唯一索引和不可变 trigger。切换复用 `tenant_supplier_settings.procurement_snapshot_v1_enabled`，且依赖前三个灰度开关已开启。

- [ ] **Step 2: 实现 final gate**

任何检查失败用稳定异常终止整个 migration，不留下部分约束。通过后删除旧的非 scoped 唯一约束，启用新索引；保留兼容读取开关一个发布周期。回滚只允许关闭新写和切回兼容读，不删除所有权、mapping 或 snapshot 数据。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/supplier-ownership-cutover-migration-contract.test.ts
cd ../.. && git add apps/api/src/services/supplier-ownership-cutover-migration-contract.test.ts supabase/migrations/20260813193000_enforce_supplier_ownership_cutover.sql
git commit -m "feat(db): 启用供应商所有权切换门禁"
```

### Task 7: 更新 Admin 采购展示和两租户 E2E

**Files:**
- Modify: `apps/admin/components/supplier-purchase-requisitions/*`
- Modify: `apps/admin/components/supplier-purchase-orders/*`
- Create: `apps/admin/e2e/supplier-private-procurement-isolation.spec.ts`
- Create: `apps/admin/playwright.supplier-private-procurement.config.ts`

- [ ] **Step 1: 写 UI/E2E RED 测试**

两个 tenant fixture：都能看到平台 supplier/product；A 可见自己的私有 supplier/product，B 不可见；两者平台 supplier 内部编码不同；A 创建私有商品并完成申请→审批→转订单；暂停 relationship 后不能新建，但既有订单可查看和收尾。

- [ ] **Step 2: 更新界面**

选品表显示“平台共享/租户私有”、内部编码、分类完整名、品牌和规格。申请/订单详情优先渲染 snapshot，schema v0 缺失字段显示“历史数据未记录”，绝不回退当前主档。错误态明确区分关系停用、价格失效和商品不可见。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/admin && bun test components/supplier-purchase-requisitions components/supplier-purchase-orders
pnpm exec playwright test --config=playwright.supplier-private-procurement.config.ts
git add components/supplier-purchase-requisitions components/supplier-purchase-orders e2e/supplier-private-procurement-isolation.spec.ts playwright.supplier-private-procurement.config.ts
git commit -m "feat(admin): 接入私有供应商采购闭环"
```

### Task 8: 最终验证、灰度和发布门禁

- [ ] **Step 1: 运行完整静态和目标回归**

```bash
bun run api:typecheck
bun run admin:check
bun run test:all
bun run api:build
bun run admin:build
```

- [ ] **Step 2: 验证数据库**

按顺序运行 `supabase db push --local --dry-run`、在隔离空库完整应用所有 migration、经明确批准后在开发库应用、`supabase migration list --local`。核对 mapping 数、clone 数、issue open=0、所有 product/SKU ownership 非空、所有租户关系内部编码非空；远端状态另行只读核对，不使用含糊的默认目标命令。

- [ ] **Step 3: 性能验证**

对合作供应商分页、目录合并、商品/SKU 搜索、采购目录、申请/订单列表运行 `EXPLAIN ANALYZE`；确认走 tenant/ownership/supplier/status 复合索引，无 Seq Scan 大表、无 N+1，pageSize 上限生效。

- [ ] **Step 4: 灰度与回滚演练**

依次启用数据库兼容读、后端 scoped 读、Admin 私有写、采购 snapshot 四个开关；每步对两个测试租户执行隔离 smoke。演练关闭新写并切回兼容读，确认新产生记录仍可读且没有删除/逆迁移。

- [ ] **Step 5: 最终审查**

使用 `requesting-code-review` 检查设计 1～15 节覆盖、数据库原子性、权限和历史事实；再用 `verification-before-completion` 核对当次命令输出。运行 `git diff --check` 和 `git status --short`，排除 tgz 删除和 Orange 变更后再提交 PR。
