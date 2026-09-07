# 仓库采购平台开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在既有平台租户供应商设置中提供可审计、可重试且兼容旧客户端的仓库采购开关。

**Architecture:** 扩展既有 Admin 卡片及 PATCH controller → service → repository → 原子 RPC；通过新增 migration 保留旧签名及历史命令重放。租户端只读取有效设置。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、PostgreSQL/Supabase、Next.js、shadcn/Radix。

**Approved spec:** `docs/superpowers/specs/2026-09-07-warehouse-procurement-rollout-entry-design.md`；用户于 2026-09-08 确认。

**Workspace:** 现有 `feature/warehouse-procurement-inventory-stage-b`，起点 `a7fef0cc`。不改 Orange、根 main 或既有 `.artifacts/`。

## Task 1：确认基线与契约

- [x] 在 `apps/api` 运行现有 settings schema/repository、rollout service 测试（11 项）；在 `apps/admin` 运行 rollout rules 测试（3 项）。另平台 service/旧 migration 回归 20 项、API typecheck 通过。
- [x] 阅读现有 `20260830111000_extend_supplier_workflow_rollout_command.sql` 全部签名与重放规则，确认数据库先兼容、再发布调用方的顺序。
- [x] 验证现有本地隔离数据库 runner 只读取本地 schema、在无网络临时容器中写合成数据；不接远端。

## Task 2：实现完整开关链路（单一纵向实现任务）

**Files:**

- 新增 `supabase/migrations/20260908010000_extend_warehouse_procurement_rollout_command.sql`。
- 修改 `apps/api/src/schema/platform-suppliers.ts`、`repositories/platform-suppliers.ts`、`services/platform-suppliers.ts`、`services/supplier-rollout-settings.ts` 及相邻 settings DTO。
- 同步 `apps/api/src/types/database.ts` 中实际改变的 RPC 契约；不改不相关生成漂移。
- 修改 `apps/admin/components/platform-tenants/tenant-supplier-settings-card.tsx`、`tenant-supplier-settings-rules.ts`。
- 修改 `apps/admin/components/suppliers/supplier-settings-api.ts`、`supplier-types.ts`。
- 在上述相邻测试补覆盖；新增 `scripts/fixtures/warehouse-stage-b/rollout-command.sql`，复用 `scripts/verify-warehouse-stage-b-database.ts`。
- 修改 `apps/admin/e2e/supplier-rollout-workflow.spec.ts`、`supplier-rollout-mock-backend.mjs` 验证新增控制与重试。

### API 测试先行

- [ ] 新增并运行 RED：HTTP 接受显式 true/false，省略保留为 undefined、拒绝 null/字符串。

```ts
const validInput = {
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: true,
  private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: true,
  procurement_snapshot_v1_enabled: true,
  purchase_batch_workflow_enabled: true,
  expected_version: 6,
};
expect(PlatformTenantSupplierSettingsCommandSchema.parse({
  ...validInput, warehouse_procurement_enabled: true,
}).warehouse_procurement_enabled).toBe(true);
expect(PlatformTenantSupplierSettingsCommandSchema.parse(validInput)
  .warehouse_procurement_enabled).toBeUndefined();
```

- [ ] 实现可选输入，不添加 false 默认值；读取 select/DTO 包含真实字段。依赖计算将仓库采购置于 Workflow 之后。

```ts
warehouse_procurement_enabled: z.boolean().optional()
```

- [ ] repository 仅在客户端显式提供时传递新增 RPC 参数；旧请求保持旧载荷指纹。数据库锁内解析省略字段，不以服务层预读替代原子保留。

```ts
...(input.warehouse_procurement_enabled === undefined ? {} : {
  p_warehouse_procurement_enabled: input.warehouse_procurement_enabled,
})
```

- [ ] 新增权限/版本/依赖/重放测试后实现：仅平台 `platform.supplier.manage`，不修改租户权限；旧成功回执在后续状态变化后仍能重放；异载荷同 key 拒绝；每次实际写入仅递增一次版本并记录真实前后值。

### 数据库测试先行

- [ ] 合成 fixture 使用真实新旧签名断言开启/关闭、旧省略保留、历史命令重放、跨签名 key 冲突、依赖拒绝及版本冲突，先记录新增行为 RED。
- [ ] 新 migration 事务内新增仓库参数及旧签名兼容逻辑；固定 `search_path`，所有入口仅 service_role 执行；不修改历史事件，不自动启用租户。保持 actor/key 锁与 tenant 锁的既有顺序。
- [ ] 增加 ACL、默认值、并发与失败回滚断言；在临时数据库运行 fixture，确认 GREEN。

### Admin 测试先行

- [ ] RED：依赖全开时可启用仓库；仓库开启时父级不可关闭；无权限只读；缺失字段视为关闭。
- [ ] 复用 `rolloutFields` 增加字段：

```ts
{
  flag: "warehouse_procurement_enabled",
  label: "仓库采购",
  description: "需先启用采购批次 Workflow；关闭不会删除既有库存和单据。",
  intentKey: "warehouseProcurementEnabled",
}
```

- [ ] RED：超时后刷新不能改变待重试 body/version/key；成功后读取失败只重读；明确版本冲突经重新确认使用新 key。实现不可变命令快照并保留明确失败恢复提示，不新建通用状态框架。
- [ ] GREEN 后先静态检查，再运行既有 rollout Playwright harness，覆盖桌面、375px、权限、依赖和失败恢复。

## Task 3：独立审查与最终验证

- [ ] 独立规格审查，逐项对照已确认设计；修复后复核。
- [ ] 规格通过后独立质量审查，重点检查历史指纹兼容、锁与 ACL、前端未知结果恢复。
- [ ] 主代理重跑必要测试及 API/Admin 静态检查、构建；报告真实通过数量及环境限制。
- [ ] 更新设计状态与实现证据，列出新增 migration 和部署顺序；只报告本开关实现，不将 Stage B 整体验收标为完成。

## 发布与权限边界

本轮只完成本地实现与验证。禁止远端 migration、开发/生产部署、真实租户开关操作、员工授权、采购/收货/财务写入、merge main 或分支清理。

新增 migration 另行确认后才可应用；应用前后需 `supabase migration list` 和 dry-run。关闭通过正式命令，保留业务事实；恢复使用受审前向 migration。

分页越界缺陷、采购员配置读取权限及 Stage B 真实闭环验收是独立待办，不顺手修改。
