# Warehouse Stocktake Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接通盘点有界读取、六命令 API、流水来源和平台开关配置，不开启真实租户。

**Architecture:** 复用调拨 controller/service/repository 和 owner-only SQL helper；各变更独立 migration，不改已提交命令 migration。金额在 SQL numeric 计算、HTTP text 传输。历史读和回执不受关闭开关影响。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod 4.4.2、Supabase PostgreSQL17。

规格：`../specs/2026-09-09-warehouse-stocktake-integration-design.md`。已有隔离工作树 `warehouse-project-material-stage-c`，基线 620f53a8；所有步骤仅在此工作树。RAG502，依据已验收 D1 实现。每项提交后独立 SPEC → quality 审查；先静态再耗时验证。用户已统一授权常规确认，按推荐子代理执行，无须再询问流程选择。

## Task 1: SQL 有界读取

文件：新 CLI migration `warehouse_stocktake_read_models`；新增 `scripts/fixtures/warehouse-stage-b/stocktake-reads.sql`、`stocktake-read-performance.sql`。参考 `20260908185501_warehouse_transfer_atomic_commands.sql` 中4个读取函数及 transfer-read-performance.sql。不编辑其他生产文件。

- [ ] 写 stocktake-reads fixture，先检测缺失 RPC：

```sql
DO $$ BEGIN
 IF to_regprocedure('public.get_warehouse_stocktake_settings(uuid,uuid,uuid)') IS NULL THEN
   RAISE EXCEPTION 'Stocktake settings RPC is required';
 END IF;
END $$;
```

- [ ] API `bun run typecheck` 后，运行 runner（material-workflow.sql、transfer-workflow.sql、stocktake-workflow.sql、stocktake-reads.sql）；确认预期缺失函数失败。
- [ ] `supabase migration new warehouse_stocktake_read_models`，用 apply_patch 实现4读取函数。签名统一 actor 参数：get settings(tenant,user,employee)，get order(tenant,order,user,employee)，list orders(tenant,user,employee,warehouse default null,status text default null,keyword text default null,page int default1,page_size int default20)，items(tenant,order,user,employee,page default1,page_size default20)。权限调用 `__gooes_stocktake_assert_actor`，settings先选实际有权项。RPC revoke PUBLIC/anon/authenticated/service_role 后只 grant service_role。不得放宽 helper ACL。
- [ ] 列表页查询核心契约：

```sql
WITH page AS MATERIALIZED (
 SELECT o.* FROM public.warehouse_stocktake_orders o
 WHERE o.tenant_id=p_tenant_id
   AND (p_warehouse_id IS NULL OR o.warehouse_id=p_warehouse_id)
   AND (p_status IS NULL OR o.status=p_status)
   AND (p_keyword IS NULL OR strpos(lower(o.order_no),lower(p_keyword))>0 OR strpos(lower(o.reason),lower(p_keyword))>0)
 ORDER BY o.created_at DESC,o.id DESC LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
), totals AS (
 SELECT i.stocktake_order_id,count(*) item_count,count(i.counted_quantity) counted_count,
   count(*) FILTER (WHERE i.difference_quantity<>0) difference_count,
   coalesce(sum(i.amount) FILTER (WHERE i.difference_quantity>0),0)::numeric(20,2)::text gain_amount,
   coalesce(sum(i.amount) FILTER (WHERE i.difference_quantity<0),0)::numeric(20,2)::text loss_amount
 FROM page p JOIN public.warehouse_stocktake_order_items i ON i.stocktake_order_id=p.id
 GROUP BY i.stocktake_order_id
)
SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
 'warehouse_name',w.name,'item_count',coalesce(t.item_count,0),'counted_count',coalesce(t.counted_count,0),
 'difference_count',coalesce(t.difference_count,0),
 'gain_amount',CASE WHEN p.status='completed' THEN coalesce(t.gain_amount,'0.00') END,
 'loss_amount',CASE WHEN p.status='completed' THEN coalesce(t.loss_amount,'0.00') END)
 ORDER BY p.created_at DESC,p.id DESC),'[]'::jsonb) INTO v_items
FROM page p JOIN public.warehouses w ON w.id=p.warehouse_id AND w.tenant_id=p.tenant_id
LEFT JOIN totals t ON t.stocktake_order_id=p.id;
```

- [ ] 详情同 Summary；items 所有7个 numeric 字段（book_quantity/book_value/book_unit_cost/counted_quantity/difference_quantity/unit_cost/amount）显式 `::text`，其余 to_jsonb 行和 sku_name/sku_code，NULL 不转零。
- [ ] 扩展 fixture：ACL、假身份、deny、跨租户 notfound、关闭后历史、页边界、筛选/总数/空页、NULL和正负小数、完成gain/loss0与非零。performance插入回滚10,000单据/20,000明细，提取实际 RPC SQL EXPLAIN，20单页<=40明细行访问，测试无筛选/warehouse/warehouse+status及缓存计划；必要时函数force_custom_plan或索引新 migration。
- [ ] 同命令重新运行绿灯，记录 RED/GREEN 和 EXPLAIN；自检提交 `feat: add bounded warehouse stocktake read models`。

## Task 2: Domain 与 HTTP 接入

文件：修改 `packages/domain/src/warehouse-stocktake.ts` 及测试；新增 `apps/api/src/repositories/warehouse-stocktake-records.ts`、`warehouse-stocktakes.ts` 和测试，`services/warehouse-stocktake-errors.ts`、`warehouse-stocktakes.ts` 和测试，`controllers/warehouse-stocktakes/index.ts`、`controllers/warehouse-stocktake-routes.test.ts`；修改 `routes/index.ts`、`services/tenant-service-capability-map.ts` 及相应断言；fixture DTO 可集中 `apps/api/src/test-fixtures/warehouse-stocktakes.ts`（参照真实 transfer fixture 位置再落位，不新增测试框架）。不修改已有请求契约。

- [ ] 先写实际 Domain/strict parser/route registry 断言，动态import能判断缺失导出而不是编译错误：

```ts
test('registers all stocktake endpoints', async () => {
  const exists = await Bun.file('src/controllers/warehouse-stocktakes/index.ts').exists();
  expect(exists).toBe(true);
});
```

- [ ] `bun test src/controllers/warehouse-stocktake-routes.test.ts` 在 apps/api 运行确认RED，然后实现真实 Fastify inject 功能测试替换存在性断言。
- [ ] Domain增加 WarehouseStocktakeOrder（表字段）、WarehouseStocktakeOrderSummary（上述count与gain/loss）、WarehouseStocktakeItem（表字段含 nullable string decimals、SKU名称代码）、WarehouseStocktakeSettings、WarehouseStocktakeCommandResult；命令result仅status和原始Order，不错要求Summary字段。
- [ ] records严格 schema，非负 decimal `/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/`；signed差异加可选负号；金额16整2小数，汇总18整2小数；所有字段严格 nullable 符合真实SQL。parseRPC errors包装 Errors.dbError；repository每方法一次RPC，默认分页及最大100由 PaginationQuerySchema 验证。
- [ ] service注入 Pick 仓储5方法；requireScope要求tenant/employee/user及权限；settings任一三权限；6命令按command选已有 Draft/Counts/Command schema，提取expected_version，不预读。错误表覆盖 SQL现有全部 WAREHOUSE_STOCKTAKE_* 错误（rg实际文本），未知保持原始包装。
- [ ] controller4GET6POST；路径 record-counts映射record_counts；getRequiredTenantContext、requireSupplierIdempotencyKey、Errors.fromZod、ResponseHandler.success；总路由与 capability registry 注册 singleton，不暴露 PATCH/DELETE。
- [ ] 测试 strict response数字/精度/null、分页映射、每方法1RPC、所有命令payload/actor/key、无项目权限依赖、SQLdeny即使system_admin派生权限、稳定错误；Fastify inject验证真实controllers六POST四GET、未知字段/页界/头校验、命令回执重放路径无mutable preread。
- [ ] root `bun test packages/domain/src/warehouse-stocktake.test.ts`、`bun run --cwd packages/domain build`；apps/api `bun test src/schema/warehouse-stocktakes.test.ts src/repositories/warehouse-stocktakes.test.ts src/services/warehouse-stocktakes.test.ts src/controllers/warehouse-stocktake-routes.test.ts`、`bun run typecheck`。修复后提交 `feat: expose warehouse stocktake APIs`。

## Task 3: 库存来源与平台开关

文件：`apps/api/src/repositories/inventory.ts`及test；新 CLI migration `warehouse_stocktake_inventory_sources`、`warehouse_stocktake_rollout_command`；fixtures `stocktake-inventory-sources.sql`、`stocktake-rollout-before.sql`、`stocktake-rollout.sql`；runner添加精确 prefixture hook。修改API `schema/platform-suppliers.ts`、`services/supplier-rollout-settings.ts`、`services/platform-suppliers.ts`、`repositories/platform-supplier-settings-command.ts`、`platform-supplier-records.ts`、`platform-suppliers.ts`及第二处真实settingsselect；对应regression tests。无Admin改动。

- [ ] 测试先行加入盘点来源两方向、畸形/混合/错误类型及老receipt/issue/return/transfer/adjustment兼容；显式开关走JSON、缺省走原typed、历史回执缺字段保持不变、module-only依赖、字段省略保留。运行目标Bun测试确认预期RED。
- [ ] source_document增加strict `{stocktake_order_id:uuid,stocktake_order_no:string}`；stocktake source只允许adjustment_in/out，非stocktake source不接受stocktake document，null只允许匹配类型。SQL参考D1唯一anchor替换，页后JOIN完成order+item+同tenant/warehouse/SKU+正确difference方向，保留ACL/config。
- [ ] rollout测试先用历史typed/JSON命令产生真实receipt并存payload/receipt；runner在新rollout migration前执行before fixture，只在参数包含post fixture时触发。新SQL patch已有私有core的7个唯一片段：变量、白名单、boolean flags、行锁后省略值/依赖、insert列、insert值、update。不可改变旧fingerprint或wrapper签名。
- [ ] TS新字段可选boolean；effective=module_enabled && field===true；current merge保留省略；command JSON分支条件加 `input.warehouse_stocktakes_enabled !== undefined`；旧typedbranch不动，旧response parser用 optional不default以保持receipt。
- [ ] SQL验证版本/冲突/开关/依赖/错误类型/字段省略/真实旧回放及来源跨租户/关闭历史/页后有界；静态绿灯后运行 runner包括新fixtures与C/D1回归。
- [ ] API typecheck、Domain build；自检并提交 `feat: integrate stocktake sources and rollout settings`。

## Final verification and handoff

- [ ] 父代理刷新 Domain build/API typecheck/本批所有 Bun tests、SQL fixtures；结果记录到 `docs/operations/evidence/2026-09-09-warehouse-stocktake-integration.md`，说明SQLASCII/schema-only边界及没有DEV/UI验收。
- [ ] 独立最终质量审查，核对安全/精度/历史读/幂等/性能和所有规格项；修复后复审。
- [ ] 更新总体D2设计进度，git diff --check，提交证据，push当前开发分支。验证 clean HEAD=origin，固定release仍710b332282b2f10b2f561b20db197e5f39a8a6eb；不创建PR/merge/apply/真实授权。
