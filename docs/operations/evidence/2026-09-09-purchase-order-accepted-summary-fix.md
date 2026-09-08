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

## 交付状态与后续

本记录时修复仅在本地验证，尚未对开发或生产数据库 apply，未发布服务。
开发浏览器中的原摘要仍可能显示 0，不能将本地通过描述为线上修复完成。

下一步确认待执行 migration 仅此一条，通过既有开发 migration 发布流程应用，
再用 `supabase migration list` 核对完整 Local/Remote 历史对齐，并在 Chrome
复核该采购单合格收货 88.00、应付 88.00、付款 0.00。
之后继续项目领料/分次退料及库存、净项目成本对账；阶段 C 业务验收仍未完成，
调拨、盘点、手工调整等阶段 D 工作尚未开始。

如需回退，用新的 forward migration 恢复原函数定义和权限，不删除业务事实。
回退会恢复仓库收货摘要显示错误，不影响库存或付款事实。
