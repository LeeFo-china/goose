# D1 来源与配置 Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent inventory task, with spec then code-quality review. Remaining coupled settings work uses executing-plans and TDD in the existing worktree. 用户已授权任务内确认，不重复询问，不操作 main/Orange/生产。

**Goal:** 完成调拨库存来源追溯和原子开关配置，保持默认关闭。

**Architecture:** 扩展已分页库存 RPC 及现有供应商 rollout core；API 沿现有 controller/service/repository，兼容旧 JSON/typed 请求和历史回执。

**Tech Stack:** Bun、TypeScript、Zod 4、Supabase migration、离线 PostgreSQL 17。

## Task 1：库存来源（独立）

Files: `packages/domain/src/inventory.ts`、邻近 domain test、`apps/api/src/repositories/inventory.ts` 及 test、`apps/api/src/schema/inventory.test.ts`；使用 `supabase migration new warehouse_transfer_inventory_sources` 创建独立 SQL；新 fixture `scripts/fixtures/warehouse-stage-b/transfer-inventory-sources.sql`。

- [ ] 先增加失败测试：两个方向标签/筛选通过、严格来源对象接受、部分/混合字段拒绝、旧采购/领退料仍通过。核心预期：
  ```ts
  expect(result.list[0]?.source_document).toEqual({ transfer_order_id: id, transfer_order_no: 'WT-1', source_warehouse_id: sourceId, destination_warehouse_id: destinationId });
  ```
- [ ] 从 apps/api 跑 `bun test src/repositories/inventory.test.ts src/schema/inventory.test.ts` 记录失败；Domain 对应测试同样先红。
- [ ] Domain 增加 `transfer_out: '调拨出库'`、`transfer_in: '调拨入库'`；repository source union 增加上述四字段 strict object，其他分支保持原样。
- [ ] migration 校验旧函数定义匹配次数再扩展分页后 lateral 来源分支；保留所有既有过滤、tenant/SKU/warehouse 校验和 ACL。调拨新分支只读 completed 的同租户、同 SKU、同方向仓库明细。
- [ ] fixture 使用既有 transfer-contract/workflow 的合成调拨事实，两个方向/仓库/SKU 筛选、分页空页、关闭开关历史读与无关租户不可见；执行 EXPLAIN 确認新增来源查询只落到 page rows。
- [ ] Domain build、API typecheck 通过后跑 SQL fixtures；规范审查通过后质量审查。提交时只包含任务文件。

## Task 2：原子开关（主代理）

Files: `apps/api/src/schema/platform-suppliers.ts`、`services/supplier-rollout-settings.ts`、`services/platform-suppliers.ts`、`repositories/platform-supplier-settings-command.ts`、两个 settings selects，以及邻近 regression tests。新 migration 用 `supabase migration new warehouse_transfer_rollout_command`；新 fixture `scripts/fixtures/warehouse-stage-b/transfer-rollout.sql`。

- [ ] 新增测试验证独立开关依赖、关闭 module 不能留下 transfer=true、有效设置读 false/true、原子命令收到调拨字段。预期 `expect(effectiveSupplierRolloutSettings({ ...enabled, module_enabled: false }).warehouse_transfers_enabled).toBe(false)`。
- [ ] 新开关 schema 为 `warehouse_transfers_enabled: z.boolean().optional()`；服务 input 与 target merge 保留省略字段，repository 分支条件为 `input.warehouse_materials_enabled !== undefined || input.warehouse_transfers_enabled !== undefined`。旧 typed 分支不增加字段，避免改变历史指纹。
- [ ] migration 用带唯一匹配断言的 function definition patch 扩展 whitelist/boolean 校验/行锁内默认/依赖/INSERT/UPDATE；只增加私有 core 字段，不新建 overload，不更新租户业务行。
- [ ] fixture 验证 false→true→省略保留→false、typed 历史请求、新旧 JSON 回执重放、stale version、类型/未知字段、模块依赖失败设置和审计均不变；SQL ACL 与历史回执不可变。
- [ ] 执行 `bun test src/services/warehouse-transfer-settings.test.ts src/services/platform-suppliers.regression.test.ts src/repositories/platform-supplier-settings.regression.test.ts`，再 API check。独立审查前提供实际测试结果。

## Task 3：集成验收与 DEV 发布门禁

- [ ] `bun run check`（apps/api）、`bun run build`（packages/domain），受影响 Admin 类型检查。SQL runner `bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/transfer-contract.sql scripts/fixtures/warehouse-stage-b/transfer-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-inventory-sources.sql scripts/fixtures/warehouse-stage-b/transfer-rollout.sql`。
- [ ] 只读确认 DEV 磁盘/镜像/备份占用，不删除未确认目标。记录容量是否满足发布；不将容量风险当作功能失败。
- [ ] 独立审查、diff check、分批提交推送 feature。记录来源/设置实现与 Admin 仍未完成的界限。
- [ ] 满足容量与兼容门禁才冻结新 release、plan、apply、migration list、API/Admin DEV release；否则明确交付已验证代码与未 apply/未发布状态。不启用租户调拨。
