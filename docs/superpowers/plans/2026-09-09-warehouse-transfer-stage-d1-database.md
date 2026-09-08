# 阶段 D1 调拨数据库原子过账 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 实现同租户双仓调拨的数据库原子命令及有界读取，验证成本守恒、回滚、幂等、权限和真实连接并发；不提前发布入口。

**Architecture:** 沿用现有库存不可变流水、余额投影、SECURITY DEFINER 命令和命令回执。复用权限查询函数及现有离线 schema 恢复 runner；数据约束、状态、计价和回执在同一数据库事务完成，不引入新依赖或新的库存引擎。

**Tech Stack:** PostgreSQL 17、Supabase migration、现有 SQL 夹具和 dblink、Bun 定向契约回归。

---

## 已确认设计与细化边界

依据 [D1 设计](../specs/2026-09-09-warehouse-transfer-stage-d1-design.md)，用户要求“进行下一批”，此前已授权本任务内确认。复用当前隔离 worktree；不修改 main 或 Orange。请求契约基线 `6f5e5ef5`，API 契约 5 pass／134 断言，类型检查退出 0。

本次以数据库原子命令作为单个紧耦合实施单元，由主代理逐步实现，完成后独立审查。知识库请求返回 502，实际规则依据上述设计和仓库现有 C migration，不引入未经证实的历史规则。

- 首次保存后，租户、源仓、目标仓及单据 ID 不可改；需要改仓时取消并另建，延续 C 的单据归属冻结模式。这避免并发保存时锁住旧仓而写入新仓。
- 明细使用两组复合外键分别绑定调出／调入仓、租户和 SKU。流水增加 `warehouse_transfer_out_item_id`、`warehouse_transfer_in_item_id`，互斥；既有三种来源必须两列为空。原 `(tenant_id,source_type,source_id)` 唯一键不变。
- 数量 JSON 必须为字符串，不能只使用 `->>` 让数字 JSON 混入。SQL 独立拒绝非法精度、零、重复 SKU、未知成本／身份字段及不合法版本。
- 完成只需 `inventory.transfer.approve`；保存、提交、取消需 `inventory.transfer.manage`；读取成本需 `inventory.stock.view`，不要求项目权限。身份在成功回执重放前仍需重新认证和授权。
- 开关 `warehouse_transfers_enabled` 默认 false，并要求 module_enabled；本批次无远端启用命令和真实员工授权。测试中只修改离线合成租户。
- 本批交付数据库级调拨详情／分页列表／明细／设置读取。现有库存 UI 的新类型和来源展示、API 错误映射、生成类型、开关配置入口归下一 API 批次；兼容入口完成前不向真实环境应用或启用此 migration。

## 文件结构

- 新建：`supabase/migrations/20260908185501_warehouse_transfer_atomic_commands.sql`（已通过 `supabase migration new` 生成空文件）：表、索引、权限定义、原子命令、读取函数及 ACL。
- 新建：`scripts/fixtures/warehouse-stage-b/transfer-contract.sql`：表／RPC／ACL／默认开关契约。
- 新建：`scripts/fixtures/warehouse-stage-b/transfer-workflow.sql`：真实命令、移动均价、成对流水、回滚、分页与财务不变量。
- 新建：`scripts/fixtures/warehouse-stage-b/transfer-security.sql`：权限、租户、输入、不可变与关闭开关后的历史／重放。
- 新建：`scripts/fixtures/warehouse-stage-b/transfer-concurrency.sql`：独立连接竞争、反向调拨和与领料竞争。
- 新建：`docs/operations/evidence/2026-09-09-warehouse-stage-d1-database.md`：实际红绿验证、查询计划和本批未发布范围。

不修改既有 migration；不创建远端测试数据；不执行远端 DDL/DML。

## Task 1：数据库契约红灯

- [x] 在 transfer-contract.sql 中先验证新表及 RPC 存在，再验证强制 RLS、无直接写入、私有 helper 不可执行、公共 RPC 仅 service_role 可执行；例如：

```sql
DO $$ BEGIN
  IF to_regclass('public.warehouse_transfer_orders') IS NULL THEN
    RAISE EXCEPTION 'Stage D1 missing table: warehouse_transfer_orders';
  END IF;
  IF to_regprocedure('public.command_warehouse_transfer_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Stage D1 missing transfer command';
  END IF;
END $$;
```

- [x] 执行 `bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/transfer-contract.sql`，确认明确的 missing table 红灯；其他迁移恢复成功，失败不是依赖或拼写错误。

## Task 2：表、命令与有界读取

- [x] 增加单据（状态、版本、两仓、审计）、明细（1–100 行、同单 SKU 唯一、正数量、冻结成本）和回执表。表启用并强制 RLS，撤销 public／anon／authenticated／service_role 表写权限；只通过受控函数写入。单据及明细有终态不可变触发器，回执复用库存事实不可变触发器。两个新权限只写权限定义，不写 role_permissions 或 employee overrides。
- [x] 命令固定签名如下；`p_payload` 不重复携带 expected_version。先校验身份／权限和严格 payload，再幂等锁与回执；随后执行以下全局锁序，确认两仓均为本租户启用仓库：

```sql
PERFORM 1 FROM public.tenant_supplier_settings
  WHERE tenant_id=p_tenant_id FOR SHARE;
PERFORM id FROM public.warehouses
  WHERE tenant_id=p_tenant_id AND id IN (v_source_id,v_destination_id)
  ORDER BY id FOR UPDATE;
PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-transfer-order:'||p_order_id,0));
SELECT * INTO v_order FROM public.warehouse_transfer_orders
  WHERE id=p_order_id AND tenant_id=p_tenant_id FOR UPDATE;
```

```sql
-- RPC 参数契约
-- command_warehouse_transfer_order(
--   p_order_id uuid,p_tenant_id uuid,p_command text,p_expected_version integer,
--   p_payload jsonb,p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text)
-- RETURNS jsonb: {status: saved|submitted|completed|cancelled, order: 单据快照}
```

- [x] 保存草稿按 1–100 个 SKU 一次性检查归属和启用状态，重建本单草稿明细，不逐行查询商品。提交不扣库存。完成重验 SKU；按仓库／SKU 顺序锁定余额，再按 SKU 顺序过账。新目标余额在已持有仓库锁后建立。核心计价严格在 SQL numeric 内执行：

```sql
v_unit_cost := round(v_source.inventory_value/v_source.quantity_on_hand,4);
v_amount := CASE WHEN v_item.quantity=v_source.quantity_on_hand
  THEN v_source.inventory_value
  ELSE round(v_item.quantity*v_source.inventory_value/v_source.quantity_on_hand,2) END;
-- source: quantity -= q, value -= v_amount；清空时 average=0。
-- destination: quantity += q, value += 同一 v_amount；average=round(new_value/new_quantity,4)。
-- 插入 transfer_out(-q,-v_amount) 和 transfer_in(+q,+v_amount)，source_id 同为明细 ID。
```

- [x] 每个错误在库存、明细、状态或成功回执提交前抛出稳定 WAREHOUSE_TRANSFER 错误码；完整事务回滚。版本达到 integer 上限时拒绝继续推进，但历史回执可重放。命令不写项目成本、供应商应付或现金表。
- [x] 增加 `get_warehouse_transfer_order(uuid,uuid,uuid,uuid)`、`list_warehouse_transfer_orders(uuid,uuid,uuid,uuid,uuid,text,text,integer,integer)`、`list_warehouse_transfer_order_items(uuid,uuid,uuid,uuid,integer,integer)`、`get_warehouse_transfer_settings(uuid,uuid,uuid)`。读函数不检查操作开关，全部先验证身份和读取权限。
- [x] 默认 page=1/pageSize=20，最大 100；列表按 `(created_at DESC,id DESC)`，明细按 `(line_no,id)`。先分页单据 ID，再汇总当前页明细，不对每个单据调用摘要函数；数量、单位成本、金额通过 `::text` 返回。为租户／源仓／目标仓的排序过滤建立索引；测试 `EXPLAIN (ANALYZE,FORMAT JSON)` 的当前页明细访问边界。
- [x] 复跑 transfer-contract，期望通过；SQL 真实行为必须通过下一步夹具，不把静态 SQL 文本匹配当完成证据。

## Task 3：工作流与安全回归

- [x] 先写 transfer-workflow.sql，以已有 material-workflow.sql 的完全合成租户／SKU 为基础：0.3／0.02 库存依次调出 0.1 与 0.2，确认金额 0.01／0.01、源仓清空无尾差；注入第二条入库流水失败后断言第一条出库、余额、状态及回执均未落地。
- [x] 另一个合成 SKU 源仓 2／30、目标仓 3／90，调拨 1／15 后目标均价 26.2500；再执行双 SKU 调拨。对每个仓库／SKU 按流水重算余额，检查每个调拨明细只有两个方向、数量和价值合计均为 0。
- [x] 保存、提交、完成及历史保存命令重放返回冻结结果；同 key 不同参数、版本冲突及越权必须拒绝。合成租户原有项目成本和应付事实完全不变，不只检查金额合计。
- [x] transfer-security.sql 覆盖：无 manage／approve／stock 权限、错用户与员工绑定、停用员工、跨租户仓库／单据／SKU、开关关闭、停用仓库、严格 payload（包括数字 JSON 与额外成本字段）、超量、终态 INSERT／UPDATE／DELETE、复合 FK 绑定、分页 100 上限和空页 total。关闭开关后历史读取及授权重放仍通过。

## Task 4：独立连接并发与验收

- [x] transfer-concurrency.sql 用已有 dblink 模式：A BEGIN 后确认并持锁；B 异步确认；从 pg_stat_activity 观察 B 的 Lock 等待后才提交 A。不使用“跑两次串行命令”代替并发。
- [x] 两张出库合计超库存时恰好一张成功；反向调拨固定锁序后两张均可成功；相同 key 并发重放只过账一次；调拨和项目领料竞争同一余额时失败方没有残留事实。测试结束经正常反向命令恢复 C SKU 基线。
- [x] 完整验证命令：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/material-contract.sql \
  scripts/fixtures/warehouse-stage-b/material-workflow.sql \
  scripts/fixtures/warehouse-stage-b/transfer-contract.sql \
  scripts/fixtures/warehouse-stage-b/transfer-workflow.sql \
  scripts/fixtures/warehouse-stage-b/transfer-security.sql \
  scripts/fixtures/warehouse-stage-b/transfer-concurrency.sql
# API 静态检查与既有契约回归在 apps/api 执行
bun test src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts
bun run typecheck
```

- [x] 独立审查表约束、ACL、锁序、计价与完整回滚证据；修复后重跑关联夹具。精确提交新 migration、夹具和证据，不合并 main，不执行远端 apply。本批不声称开发环境已经调拨成功；远端 migration list 对齐留待获准的兼容发布批次实际执行。

## 回退和发布前置

migration 全部在 BEGIN/COMMIT 内，配置 lock_timeout=5s、statement_timeout=5min。未启用前失败即停止后续发布；未来有已确认事实后，只关闭独立开关并保留历史，纠错走新反向调拨／前向 migration，不能删除或覆盖库存事实。现有 API 尚未识别 transfer_in/out，这一批只能在隔离库验证，不得单独远端启用。

## 完成检查点（2026-09-09）

本批数据库实施、8 个夹具联合验证及采购收货／原领退料并发补充回归均退出 0；API 契约 5 pass／134 断言，类型检查通过。实际运行、独立审查及回退边界见 [D1 数据库证据](../../operations/evidence/2026-09-09-warehouse-stage-d1-database.md)。

另新增 `transfer-read-performance.sql`，从实际 RPC 提取分页聚合 SQL，在 1 万张单据／2 万条明细上验证四种过滤及缓存参数化查询。依据红灯证据增加不带状态前缀的双仓分页索引，并仅对此列表 RPC 启用 `force_custom_plan`，修复 generic plan 扫描全量明细问题。指纹编码改为显式 UTF-8，含引号／换行／反斜杠原因可保存和精确重放。

保留现有 feature 分支及隔离 worktree，不合并 main，不移动 C 冻结发布分支，不远端 apply 或开启真实租户。下一批为 API 接入、库存类型／来源兼容、开关配置命令及对应 smoke。
