# D2.2 手工调整数据库命令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在隔离PostgreSQL中实现并验证手工调整四个原子命令，不以旧审批快照覆盖库存。

**Architecture:** 复用现有权限检查、不可变事实、短事务仓库锁和UTF16/trim/UUID纯helper。独立调整单/明细/回执由一个新migration交付；不改通用库存引擎或历史migration。

**Tech Stack:** PostgreSQL17、Supabase CLI migration、现有Docker SQL runner/dblink、Bun/TypeScript Domain。

---

## Task 1：紧耦合数据库实施单元

文件边界：

- 新migration `supabase/migrations/20260909134749_warehouse_adjustment_atomic_commands.sql`（CLI已生成空文件）。
- 新 `scripts/fixtures/warehouse-stage-b/adjustment-contract.sql`：schema、ACL、默认关闭、无默认授权。
- 新 `scripts/fixtures/warehouse-stage-b/adjustment-workflow.sql`：合成身份/独立仓库、命令helper、业务/计价/原子回滚/财务快照。
- 新 `scripts/fixtures/warehouse-stage-b/adjustment-security.sql`：严格输入/权限/幂等/不可变/来源/版本边界。
- 新 `scripts/fixtures/warehouse-stage-b/adjustment-concurrency.sql`：独立连接实际锁竞争。
- 修改 `packages/domain/src/permission.ts`、`permission.test.ts`：只加两个权限定义及测试。
- 不改runner、已发布SQL、HTTP/Admin、generated database types、角色默认授权或其它文件。

依据[数据库设计](../specs/2026-09-09-warehouse-adjustment-database-design.md)全部章节。既有参照：stocktake atomic migration、stocktake四类夹具、transfer-workflow/concurrency及material-workflow；只读研究模式，不机械复制旧业务。根AGENTS与supabase/AGENTS均适用。

- [ ] 先在contract写真实存在性/ACL断言，执行RED，必须成功恢复原schema后因缺调整表断言失败，不得把恢复或依赖错误当RED：

```sql
DO $$ BEGIN
  IF to_regclass('public.warehouse_adjustment_orders') IS NULL THEN
    RAISE EXCEPTION 'Stage D2.2 missing table: warehouse_adjustment_orders';
  END IF;
  IF to_regprocedure('public.command_warehouse_adjustment_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Stage D2.2 missing adjustment command';
  END IF;
END $$;
```

Run: `bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/adjustment-contract.sql`。
将断言扩展到三表forced RLS、直接表/序列/helper ACL拒绝、唯一service_role命令、权限仅定义、开关默认false，不使用mock。

- [ ] Domain先追加真实定义断言并运行 `bun test packages/domain/src/permission.test.ts` 观察缺失RED，然后在code tuple及metadata中补两个定义：

```ts
test.each([
  ['inventory.adjustment.manage', '管理仓库手工调整', 'manage'],
  ['inventory.adjustment.approve', '确认仓库手工调整', 'approve'],
] as const)('registers warehouse adjustment permission %s', (code, label, action) => {
  expect(PERMISSION_CODE_VALUES as readonly string[]).toContain(code);
  expect(Reflect.get(PermissionCodeConfig, code)).toEqual({
    label, module: 'inventory', resource: 'adjustment', action,
  });
});
```

测试复用文件既有导入 `PermissionCodeConfig` 与 `PERMISSION_CODE_VALUES`；实现metadata：

```ts
'inventory.adjustment.manage': {
  label: '管理仓库手工调整', module: 'inventory', resource: 'adjustment', action: 'manage',
},
'inventory.adjustment.approve': {
  label: '确认仓库手工调整', module: 'inventory', resource: 'adjustment', action: 'approve',
},
```

- [ ] 在workflow/security先写命令行为断言，再实现新migration。表字段/约束/索引/源绑定/ACL逐项按照设计。定义order/item/event三个单一职责表，序号WA、四状态与版本，源列warehouse_adjustment_item_id复合FK。原material_source_check表达式原封包装：新列NULL且原表达式，或严格调整分支；旧五来源列必须空，project/cost_category空。触发器验证冻结来源的数量、成本、signed amount、状态；保留原来源触发器。

命令固定签名及执行顺序：

```sql
-- command_warehouse_adjustment_order(
--   p_order_id uuid,p_tenant_id uuid,p_command text,p_expected_version integer,p_payload jsonb,
--   p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text) RETURNS jsonb
-- 1. service role/active tenant/employee-user binding/current actual permission including deny.
-- 2. strict typed payload: save only warehouse_id/reason/items; other commands {}.
-- 3. fingerprint tenant/order/command/version/payload/employee; actor/key xact lock; exact frozen replay.
-- 4. settings FOR SHARE -> active same-tenant warehouse FOR UPDATE -> order xact/row lock.
-- 5. expected version/state/immutable warehouse; save new0, existing positive, exhausted reject.
-- 6. save_draft validates batch SKU access then replaces draft lines, no snapshot/stock.
-- 7. submit locks balances ordered by SKU; validates all lines and arithmetic before freezing.
-- 8. complete locks/checks frozen identity/version/values and arithmetic then posts all lines.
-- 9. cancel draft/submitted only; no stock.
-- 10. order status/version+1/audit timestamps and immutable receipt saved atomically.
```

SQL数量先验证JSON字符串与正则再转numeric，不允许强转静默舍入：

```sql
-- input text must match \A-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?\Z
-- and numeric value <> 0; row reason required using existing trim/UTF16 helpers.
v_quantity := v_book_quantity + v_delta;
-- Reject negative new quantity before pricing; no/zero stock positive delta => COST_BASIS_REQUIRED.
v_unit_cost := round(v_book_value / v_book_quantity, 4);
v_amount := CASE WHEN v_quantity=0 THEN v_book_value
  ELSE round(abs(v_delta)*v_book_value/v_book_quantity,2) END;
v_value := v_book_value + sign(v_delta)*v_amount;
v_average := CASE WHEN v_quantity=0 THEN 0 ELSE round(v_value/v_quantity,4) END;
-- Before any frozen/posting writes reject nonfinite/negative/out-of-range quantity/value/cost and MAX version.
-- submit stores book_* / snapshot_at only, complete stores final unit_cost / amount and posts signed values.
```

新settings列defaultfalse、module_enabled前置；只insert权限metadata，不插role_permissions或employee overrides。新命令错误稳定使用WAREHOUSE_ADJUSTMENT_前缀；helper owner-only，命令service-only。纯trim/UTF16/UUID复用既有stocktake helper；实际授权与SKU业务helper可使用本领域名称和稳定错误，不复制通用引擎。所有DDL/初始化数据均在migration事务。

- [ ] workflow在material/transfer夹具的合成身份基础上创建独立仓库/SKU，用实际四命令验证。基线数量0.3价值0.02及数量2价值30；一减0.1、一增1同单，完成金额0.01和15；继续清空减0.2消耗剩余0.01。正库存零成本增/减允许；零/缺失库存正增在submit失败；不足、numeric/版本上限在submit和complete拒绝。submit第二行失败整单不得留下部分snapshot；complete第二条流水与event插入故障分别验证余额/流水/单据/明细/回执全快照回滚。保存/提交/取消前后库存不变，最后ledger量值对账，完整项目成本/应付/付款/现金财务快照不变。

- [ ] security用真实命令而非模拟权限：缺权/显式deny/停用tenant/employee/role/错误user/非service/跨租户/SKU；关闭开关拒绝新业务但原成功receipt可回放，撤权后原key也拒绝；同key异请求、过期及耗尽版本、终态修改/删行/快照或差额变更、错误source数量/金额/仓库/SKU/旧来源列、唯一source；提交后余额删除重建及数值恢复版本变化均拒绝。首批输入边界在SQL独立复验：UUID规则、UTF16 emoji250/251、JS Unicode trim、正负最小最大/零/超精度/数字JSON/换行/100及101/去重/未知字段。需要SQL测试helper时在夹具定义，不在生产增加测试专用函数。

- [ ] concurrency使用既有dblink模式，连接A持事务，B异步提交；必须观察B `wait_event_type='Lock'`，再提交A并检验结果。至少：两调整同一快照只先完成成功、同key只记一次、真实调拨与调整双向冲突、真实盘点与调整冲突、缺失余额创建期间submit等待仓库锁后重新读取。包括串行/超时负控，断开连接和事务清理。独立创建余额竞争仅在一次性测试库中用于模拟真实入库，不写源库。

- [ ] 运行下列Domain/SQL验证并自审；独立SPEC通过后质量审查。按7文件边界提交 `feat: 增加仓库手工调整数据库原子命令`，不提交主代理docs、不push。报告真实RED/GREEN、SHA、测试证据及疑虑。

```sh
bun test packages/domain/src/permission.test.ts packages/domain/src/warehouse-adjustment.test.ts
bun run --cwd packages/domain build
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/material-contract.sql scripts/fixtures/warehouse-stage-b/material-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-contract.sql scripts/fixtures/warehouse-stage-b/transfer-workflow.sql scripts/fixtures/warehouse-stage-b/stocktake-contract.sql scripts/fixtures/warehouse-stage-b/stocktake-workflow.sql scripts/fixtures/warehouse-stage-b/adjustment-contract.sql scripts/fixtures/warehouse-stage-b/adjustment-workflow.sql scripts/fixtures/warehouse-stage-b/adjustment-security.sql scripts/fixtures/warehouse-stage-b/adjustment-concurrency.sql
git diff --check
```

## Task 2：主线程独立验证与收尾

- [ ] 阅读实际7文件diff，核对实现范围、来源触发器、锁序、计价和权限。fresh重跑Task1命令；追加material-security/transfer-security/stocktake-security回归，确认旧业务无回归。
- [ ] 在apps/api运行首批adjustment/stocktake/transfer/material schema测试及 `bunx tsc -p tsconfig.json --noEmit`；根目录 `bun run check:file-size` 和diff检查，Domain构建必须通过。
- [ ] 新建 `docs/operations/evidence/2026-09-09-warehouse-adjustment-database.md`，记录实际结果、真实竞争组数、SQL隔离环境限制、无远端apply/授权/发布；更新数据库设计、D2.2总设计、MVP顶部进度及本计划。
- [ ] 验证文档链接和diff，提交docs并推送既有feature，保留工作树，核对clean及remote SHA。main/D1/D2.1固定release不得移动，不建PR/merge。
- [ ] 下一批交接：有界读取RPC、Domain响应、API命令和新库存来源兼容及开关配置，完成后才能审查待执行migration并走DEV apply/migration list/发布/真实验收。

## 自检

设计所有数据库条款对应Task1，独立证据和后续边界对应Task2。数量输入来自已通过的首批契约，数据库重复校验不可省；非清空金额不使用rounded unit cost。提交必须已有正数量成本依据，故缺失余额冻结是失败路径不是可完成状态。本批不新增列表，不把未做分页EXPLAIN或远端测试记为通过。无新依赖、默认授权、生成类型或旧migration修改。
