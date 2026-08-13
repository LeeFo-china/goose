# 租户私有供应商目录实施索引

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有平台供应商和采购链路的前提下，交付“平台单向共享、租户永久私有”的供应商、目录、商品、价格与采购快照体系。

**Architecture:** 统一表通过不可变的 `ownership_scope` 与 `owner_tenant_id` 表达所有权，租户合作关系保存买方内部编码；所有创建和状态变更经数据库原子命令完成。先建立所有权基础，再交付私有供应商与编码，随后交付目录和商品，最后迁移存量并切换采购快照。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration、Next.js 15、React 19、shadcn/Radix、Tailwind、Playwright。

**Approved design:** `docs/superpowers/specs/2026-08-13-tenant-private-supplier-catalog-design.md`

---

## 执行顺序

1. [所有权与权限基础](./2026-08-13-supplier-ownership-foundation.md)
2. [租户私有供应商与内部编码](./2026-08-13-tenant-private-suppliers.md)
3. [租户私有目录、商品与价格](./2026-08-13-tenant-private-supplier-catalog-products.md)
4. [采购快照、存量迁移与切换](./2026-08-13-supplier-procurement-migration-cutover.md)

四份计划必须顺序执行。计划 2 依赖所有权字段与权限；计划 3 依赖私有供应商创建命令；计划 4 会重写采购 RPC、执行存量归属迁移并启用最终约束，不能与前三份并行。

## 规格覆盖

| 规格范围 | 实施计划 |
| --- | --- |
| 永久所有权、单向共享、权限、可见范围、分阶段灰度 | 计划 1 Tasks 1～6 |
| 私有供应商、合作关系、手动/自动内部编码、幂等和审计 | 计划 2 Tasks 1～7 |
| 分类、品牌、规格模板、平台单位、商品/SKU、租户价格 | 计划 3 Tasks 1～9 |
| 项目采购资格、完整快照、存量归属、克隆映射、灰度与回滚 | 计划 4 Tasks 1～8 |

## 跨阶段不变量

- `ownership_scope` 创建后不可修改；`platform` 必须对应 `owner_tenant_id IS NULL`，`tenant` 必须对应非空租户。
- 租户私有记录永远不能升级、合并或发布为平台记录；映射只表达语义关联，不转移所有权。
- `suppliers.code` 是所有者侧主档编码；`tenant_suppliers.internal_supplier_code` 是采购租户侧内部编码。租户私有供应商创建时二者相同，后续分别按各自语义冻结。
- 编码分配和供应商创建使用不同幂等键；创建必须消费有效的 `allocation_id`，保留和已用编码均不可复用。
- 平台商品只读；租户只能维护本租户商品和价格。非 active 合作关系只保留历史读取，不允许新增目录、价格或采购。
- 列表默认 `page=1&pageSize=20`、最大 100，查询限定字段并有稳定排序；采购选品最多 20 条/页。
- 所有结构、索引、函数、RLS、权限和初始化数据只通过 migration 变更。

## 每阶段合并门禁

- 目标测试先 RED 后 GREEN，`bun run api:typecheck`、`bun run admin:check`、目标 package 测试和 `git diff --check` 通过。
- migration contract 覆盖约束、索引、原子性、RLS/FORCE RLS、REVOKE/GRANT 和稳定错误码。
- Admin 列表有分页、加载态、空态、错误态和权限拒绝态；写操作带幂等键。
- 阶段 PR 只包含该阶段文件，不包含 `packages/domain/gooes-domain-1.13.0.tgz` 或其他用户改动。
- 进入下一阶段前，当前阶段已完成审查并合并；数据库变更应用后使用 `supabase migration list` 核对 Local/Remote。

## 最终生产放行门禁

- 两个租户和一个平台账号完成隔离 smoke：平台记录共享、租户记录互不可见、所有权不可变。
- 自动编码并发、手工编码冲突、幂等重放、预留过期和跳号行为通过数据库 smoke。
- 平台/租户分类与品牌映射不改变所有权，规格值校验和单位换算链通过。
- 平台共享供应商与租户私有供应商都能创建采购申请并转采购单；停用关系不能新增采购。
- 新采购记录完整冻结供应商、双编码、所有权、商品、SKU、分类路径、品牌、规格、单位、价格、税、合同、地址和联系人。
- `supplier_catalog_migration_issues` 未解决数量为 0，克隆映射可追溯，历史快照不使用当前主档伪造。
- 关键列表执行计划使用索引且无 N+1；目标 E2E、API、domain、migration contract 和完整构建通过。

## Git 策略

每份计划从最新主分支建立独立 worktree/feature branch，每个 Task 一个聚焦的 Conventional Commit。阶段完成后审查并合并，再同步主分支开始下一阶段；禁止修改 `/Users/leefo/Public/work/orange`。
