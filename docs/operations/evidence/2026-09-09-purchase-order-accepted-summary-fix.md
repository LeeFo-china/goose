# 仓库采购合格收货摘要修复

## 复现与根因

开发租户：固始晴天装饰工程有限公司。浏览器验收采购批次
`PB-20260908-00000016`、采购单 `PO-20260908-00000098`
（`c6052bfe-07a1-438e-8b88-82ebc689aedc`）。

此前通过正常开发登录，由风清扬提交、小龙女审批、风清扬记录模拟确认、
发货及收货。测试 SKU 为 `E2E-SKU-0823222632-B`，公司仓库入库 1 箱，
含税 88 元。形成测试应付 88 元，未发起付款。收货编号
`E2E-C-20260908-PO98-R1`。这些是开发验收事实，不是真实采购或物流。

财务摘要 RPC 原值为 `accepted_amount: "0.00"`，但履约详情已合格收货 1 箱。
2026-09-09（北京时间）只读实查确认履约状态 `received`、
`accepted_quantity = 1.0000`、`accepted_total_amount = 88.00`。

根因：`get_supplier_purchase_order_financial_summary` 在
`20260731110000_create_supplier_payment_requests.sql` 中从
`project_cost_events` 汇总合格收货金额。仓库采购收货只形成库存和应付，
不应产生项目成本，因此该口径遗漏仓库采购。

## 修复边界

新增 migration：`20260908161657_fix_purchase_order_accepted_financial_summary.sql`
（版本由 Supabase CLI 按 UTC 生成）。

仅将 accepted CTE 改为读取同租户、同采购单履约累计字段
`supplier_purchase_order_fulfillments.accepted_total_amount`。
这个字段由现有收货命令和 `private.recalculate_supplier_purchase_order_fulfillment`
维护，按累计合格数量和采购价格快照计算，复用现有含税及分批收货舍入规则。
不重新计算逐笔收货金额，不以应付替代收货金额，也不补造项目成本。

应付、付款、申请占用和余额计算、RPC 返回契约、调用权限均保持原状。
无表数据修补、无前端/API 代码变化、无新依赖。按采购单唯一约束限定至多一条
履约记录，不增加索引。开发库只读 EXPLAIN ANALYZE 在现有 12 条履约记录上
选择顺序扫描，返回 1 条、shared hit 1、执行时间 0.074 ms；该结果不是大数据压测。

## 验证

测试位于 `apps/api/src/services/supplier-purchase-order-summary-database.test.ts`。
沿用本地 Supabase 容器识别方式，在随机命名的独立临时数据库创建精简表结构，
先安装原函数和权限，再应用完整修复 migration；结束时只删除该次创建的临时库。
不写本地应用数据库或远端数据库。

- RED：原函数执行 6 项测试，2 通过、4 失败，明确捕获期望 88.00、实际 0.00。
- GREEN：完整 migration 后 7 项通过，覆盖仓库无项目成本、项目部分收货金额、
  全拒收/未确认采购单、租户及采购单隔离、付款和申请占用、函数调用权限。
- 其他 API 摘要 repository/schema/service/route 测试 8 项通过。
- Admin 摘要测试 5 项通过。
- API `bun run typecheck` 通过。
- 独立只读代码审查未发现阻断问题；确认 payables CTE 及之后的返回逻辑与旧版
  逐字相同，权限与订单唯一约束保持不变。审查未重复执行数据库测试。

运行命令（分别在 apps/api 和 apps/admin）：

```sh
bun test src/services/supplier-purchase-order-summary-database.test.ts src/repositories/supplier-purchase-orders-financial-summary.test.ts src/services/supplier-purchase-orders-financial-summary.test.ts src/schema/supplier-purchase-orders-financial-summary.test.ts src/controllers/supplier-purchase-orders/financial-summary-routes.test.ts
bun run typecheck
bun test components/supplier-purchase-orders/purchase-order-financial-summary.test.ts
```

这些测试验证汇总函数，不代替完整收货命令的端到端回归。知识库查询返回 502，
本次结论来自当前 migration、代码、Chrome 验收事实和只读数据库查询。

## 本地修复交付时状态（apply 前）

本记录时修复仅在本地验证，尚未对开发或生产数据库 apply，未发布服务。
开发浏览器中的原摘要仍可能显示 0，不能将本地通过描述为线上修复完成。

下一步确认待执行 migration 仅此一条，通过既有开发 migration 发布流程应用，
再用 `supabase migration list` 核对完整 Local/Remote 历史对齐，并在 Chrome
复核该采购单合格收货 88.00、应付 88.00、付款 0.00。
之后继续项目领料/分次退料及库存、净项目成本对账；阶段 C 业务验收仍未完成，
调拨、盘点、手工调整等阶段 D 工作尚未开始。

如需回退，用新的 forward migration 恢复原函数定义和权限，不删除业务事实。
回退会恢复仓库收货摘要显示错误，不影响库存或付款事实。

## 开发 apply 结果：PASS

用户随后授权“apply 新 migration”。2026-09-09 00:25:45（北京时间）通过
[Migrate Dev Database #34250973598](https://github.com/LeeFo-china/goose/actions/runs/34250973598)
完成应用，状态 completed / success，固定提交
`debed4bb12311777c4340b35f362e224ba2da982`，目标仍为
`api-dev.goodcms.cn` / `fclnkyatvfvmzgzdqlba`，仅开发数据库。

执行前发现开发库另已应用主分支的 `20260908110000` 分类查询 migration。
从原提交 `6e9ff3c22e096c610f743fc2b54c317e9403e1d4` 原样同步该文件，
Git blob 均为 `a106e6c4eb4a7b6a9c60d31f6738c2bc288f74b4`；未重跑该迁移，
未执行 migration repair，也未合并或发布 main。

Supabase CLI dry-run 与
[工作流 plan #34250823481](https://github.com/LeeFo-china/goose/actions/runs/34250823481)
均确认唯一待应用版本为 `20260908161657`。
该修复文件 SHA-256 为
`753f5ce6a64bbbb9a8919e666be3d8a33f4b9bc20bfd6df51d365c897b5cf00d`。
Apply 报告 before_count=600、after_count=601、pending_count=1、applied_count=1。
应用后重新执行 `supabase migration list`，并用
`scripts/verify-migration-history.mjs` 验证 601 条完整历史，输出
`migration_history_aligned=true`、`target_migration_present=true`。

应用后只读检查（SET ROLE service_role）该实际采购单 RPC 返回：

- accepted_amount：88.00（应用前 0.00）。
- payable_amount / open_amount / available_to_request_amount：88.00。
- paid_amount / reserved_request_amount：0.00。
- EXECUTE 权限：service_role=true、anon=false、authenticated=false。

对指定测试租户的五张表按 id 排序计算行 JSON 摘要，前后计数及 MD5 一致：
inventory_balances=1、inventory_transactions=1、project_cost_events=4、
supplier_payable_events=5、supplier_payments=0。
该核对只覆盖这些表和该租户，不代表全库所有数据核对。

本轮重跑 7 项数据库回归全部通过。没有部署或重启 API/Admin，也未访问生产。
浏览器页面本轮尚未重新验收；这里的 88.00 为远端实际 RPC 查询结果。
后续可刷新采购单详情复核页面，再继续阶段 C 领退料验收。
