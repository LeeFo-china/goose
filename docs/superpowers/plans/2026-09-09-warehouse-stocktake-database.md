# D2.1 盘点数据库原子命令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在隔离数据库实现和验证盘点六个原子命令，防止过时实盘覆盖真实库存。

**Architecture:** 复用调拨的service-only命令、现有权限helper、不可变事实和短事务仓库锁；新migration内增加独立单据、明细及回执，不复制通用库存引擎。

**Tech Stack:** PostgreSQL17、Supabase migration、现有离线SQL runner/dblink、Bun Domain和API测试。

## Task 1：单个数据库实施单元

文件：新migration `supabase/migrations/20260909064815_warehouse_stocktake_atomic_commands.sql`（CLI已生成空文件）；新 `scripts/fixtures/warehouse-stage-b/stocktake-contract.sql`、`stocktake-workflow.sql`、`stocktake-security.sql`、`stocktake-concurrency.sql`；改 `packages/domain/src/permission.ts`、`permission.test.ts`。不改既有migration、runner、角色默认权限、HTTP或Admin。

- [ ] 先写契约SQL并跑真实RED。最小存在性断言：

```sql
DO $$ BEGIN
  IF to_regclass('public.warehouse_stocktake_orders') IS NULL THEN
    RAISE EXCEPTION 'Stage D2 missing table: warehouse_stocktake_orders';
  END IF;
  IF to_regprocedure('public.command_warehouse_stocktake_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Stage D2 missing stocktake command';
  END IF;
END $$;
```

运行 `bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/stocktake-contract.sql`；期望恢复既有schema成功后明确missing table，非依赖或恢复错误。Domain权限测试先追加stocktake.manage/approve断言再执行 `bun test packages/domain/src/permission.test.ts`，期望缺失定义RED。

- [ ] migration按设计创建三表/序号、复合FK、状态/有限numeric/原因/时间约束、索引、默认关闭开关及权限定义。orders(id,tenant_id,warehouse_id,status,version,reason,审计时间和员工)；items(id,tenant_id,stocktake_order_id,warehouse_id,line_no,sku,snapshot_at,book_balance_id/version/quantity/value/unit_cost,counted_quantity,difference_reason,difference_quantity,unit_cost,amount)；events沿用transfer的actor/key唯一回执。权限仅定义并同步Domain：

```ts
'inventory.stocktake.manage': {
  name: '管理仓库盘点', module: 'inventory', resource: 'stocktake', action: 'manage',
},
'inventory.stocktake.approve': {
  name: '确认仓库盘点', module: 'inventory', resource: 'stocktake', action: 'approve',
},
```

按permission.ts已安装实际定义补充其要求字段，不添加角色授权。

- [ ] 先在workflow/security夹具写命令行为期望，再实现命令。签名和返回见设计，关键分支执行顺序固定：

```sql
-- 幂等：身份/权限、严格payload、UTF8指纹、actor/key事务锁、已有回执匹配/返回。
-- 新命令：settings FOR SHARE -> warehouse FOR UPDATE -> order advisory lock/row FOR UPDATE。
-- save_draft: 新单expected_version=0；旧草稿仓库不可变；批量验证SKU；重建1–100行。
-- start: 按SKU锁现有余额，冻结有/无行快照；不INSERT balance。
-- record_counts: counting限定范围，counted_quantity非空数字字符串，差异需原因。
-- submit: 全部counted_quantity IS NOT NULL，差异原因完备。
-- complete: submitted，所有余额存在性/ID/version/数值与快照一致，然后差额过账。
-- cancel: draft/counting/submitted；终态不能改。
-- 所有成功：version=expected_version+1；状态/审计/成功回执同事务。
```

计价实际SQL规则：

```sql
v_difference := v_item.counted_quantity-v_item.book_quantity;
v_unit_cost := CASE WHEN v_item.book_quantity>0
  THEN round(v_item.book_value/v_item.book_quantity,4) ELSE 0 END;
v_amount := CASE WHEN v_difference=0 THEN 0
  WHEN v_item.counted_quantity=0 THEN v_item.book_value
  ELSE round(abs(v_difference)*v_item.book_value/v_item.book_quantity,2) END;
-- book_quantity=0且difference>0在除法前拒绝COST_BASIS_REQUIRED。
-- 负差额value_delta=-v_amount，正差额value_delta=v_amount；无差额不写事实/不改余额version。
-- 新数量=counted_quantity，新value=oldvalue+value_delta，均价round(value/quantity,4)，清空全0。
```

SQL独立拒绝未知字段/数字JSON/非规范十进制/超100/重复SKU/空白原因，稳定WAREHOUSE_STOCKTAKE错误；禁止先numeric强转让精度静默舍入。新来源FK与触发器验证冻结差额/金额/成本及项目字段为空。RLS和函数ACL覆盖PUBLIC、anon、authenticated、service_role。

- [ ] workflow测试复用material-workflow合成身份，在独立测试仓建立合成账实基线；覆盖盘盈、盘亏、清空尾差、零成本正库存、零库存盘盈拒绝、无差异不造流水/余额、分批未盘、注入第二条流水失败整体回滚、重放不重复、财务全快照隔离。security测试越权/跨租户/版本/开关/不可变/源绑定/payload边界。
- [ ] concurrency复用现有dblink模式。A完成持事务，B异步命令；必须观察B wait_event_type=Lock再提交A。覆盖两单过时、同key重放、调拨和盘点正反竞争、不存在余额创建竞争和数量恢复但版本冲突；异常路径断开连接并无悬挂事务。不把串行负测记为真实竞争。
- [ ] 依次执行SPEC审查、质量审查；修复后重跑，精确提交本单元文件，不混入主线程文档。

## Task 2：主线程独立验证及收尾

- [ ] 读取实际diff核对设计、来源约束、锁序及兼容性，不只信任实施报告。运行：

```sh
bun test packages/domain/src/permission.test.ts packages/domain/src/warehouse-stocktake.test.ts
bun run --cwd packages/domain build
# cwd apps/api
bun test src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts
bun run typecheck
# cwd worktree root
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/material-contract.sql scripts/fixtures/warehouse-stage-b/material-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-contract.sql scripts/fixtures/warehouse-stage-b/transfer-workflow.sql scripts/fixtures/warehouse-stage-b/stocktake-contract.sql scripts/fixtures/warehouse-stage-b/stocktake-workflow.sql scripts/fixtures/warehouse-stage-b/stocktake-security.sql scripts/fixtures/warehouse-stage-b/stocktake-concurrency.sql
git diff --check
```

- [ ] 写 `docs/operations/evidence/2026-09-09-warehouse-stocktake-database.md`，记录真实RED/GREEN、审查、未完成接入/发布及风险。更新本计划进度，提交文档、推送现有feature分支，保留worktree；不合并main、不移动D1固定release分支。
- [ ] 不执行远端apply或开发发布。下一批有界读取/Domain响应/API兼容/开关配置；兼容完成并审查待执行migration后才可开发apply和migration list对齐验收。
