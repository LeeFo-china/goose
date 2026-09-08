# 采购批次分类选项 RPC 本地集成与性能证据

日期：2026-09-08

## 验证边界

本轮只实现并验证用户批准的
`20260908110000_resolve_supplier_purchase_batch_category_options.sql`。它新增一个
`SECURITY INVOKER` 只读函数，不修改表、约束、RLS、初始化数据或既有保存接口。

可重复执行入口：

```bash
./scripts/verify-supplier-purchase-batch-category-options.sh
```

该脚本固定使用本地 `supabase_db_gooes`，拒绝覆盖已存在的同名函数；临时应用目标
migration 后运行 `supabase/tests/supplier_purchase_batch_category_options.sql`，最后按精确签名
删除函数。SQL fixture 自身使用 `BEGIN` / `ROLLBACK`，测试失败时 shell trap 仍会删除临时函数。

精确回滚：

```sql
DROP FUNCTION public.resolve_supplier_purchase_batch_category_options(
  uuid, timestamptz, text, integer, integer
);
```

## 行为覆盖

真实 RPC 集成测试构造三租户、平台与租户 ownership、供应商合作关系、资格规则、合同开关、
分类/品牌/单位、商品/SKU、已发布价格簿和价格明细。测试实际调用 RPC 并断言：

- 当前租户可见的平台与租户 active 叶子分类均可返回，其他租户分类不可见；
- 平台供应商缺少强制资格时不可采购；租户私有供应商按最新规则豁免该资格；
- 开启“新订单要求有效合同”但无有效合同时不可采购；
- inactive 分类、非叶子分类、inactive 品牌和单位均不可返回；
- product/SKU ownership 不一致、SKU/价格单位不一致均不可返回；
- 同一合作关系和 SKU 存在两个当前有效价候选时整项排除；
- `%`、`_`、反斜杠按字面量搜索，不扩大为通配匹配；
- 300 个性能分类各含 10 个 SKU，同一分类多 SKU 只计一次；总数 302，第一页
  `pageSize=100` 返回 100 个唯一分类，第 16 页返回 2 个；
- 每个响应项严格只有 `id/code/name/full_name/status` 五个字段。

执行完成后，本地 `category-option-fixture-%` 租户和 `CATOPT-%` 分类计数均为 0，目标函数为
`ABSENT`，数据库容器为 `healthy`。

## EXPLAIN ANALYZE

规模为租户 A 3,011 条当前价格候选、302 个最终可采购分类。2026-09-08 本地实测：

```text
Plan: Result
Plan Rows: 1
Actual Rows: 1
Execution Time: 23.199 ms
Shared Hit Blocks: 43340
Shared Read Blocks: 0
Temp Read Blocks: 0
Temp Written Blocks: 0
WAL Records: 0
```

PL/pgSQL 标量 JSON RPC 的顶层计划不会展开内部 CTE，因此 SQL 测试同时输出当前事务的
`pg_stat_xact_user_tables`。14 次正反例 RPC 调用累计结果显示：大事实表
`supplier_price_list_items` 和 `supplier_skus` 的 `seq_scan=0`，分别使用 3,116 和 6,443 次
索引扫描；`supplier_price_lists` 仅 6 次顺序扫描、读取 36 行。顺序扫描集中在测试规模仅
2 至数百行的品牌、分类、资格和合同维表。EXPLAIN 的 temp blocks 为 0，没有排序落盘证据。
在该代表性本地规模下没有新增索引依据，因此未增加索引 migration。

## 数据库版本与发布门禁

只读核对结果：

| 环境 | 镜像 | PostgreSQL |
| --- | --- | --- |
| 本地 | `public.ecr.aws/supabase/postgres:17.6.1.106` | 17.6 |
| 开发 | `supabase/postgres:17.6.1.136` | 17.6 |
| 生产 | `supabase/postgres:15.8.1.085` | 15.8 |

本地曾在直接 `SET ROLE anon` 调用已撤销权限的函数时出现 PostgreSQL 进程 signal 11，容器自动
恢复；本轮没有升级镜像。随后改用 `has_function_privilege` 验证 ACL：`service_role=true`、
`anon=false`、`authenticated=false`，并由 service_role 完成真实 RPC 集成测试。

这不能证明 PostgreSQL 15.8 生产镜像安全。发布前必须分别在开发 17.6.1.136 和与生产一致的
15.8.1.085 隔离环境完成 migration create、service_role RPC、ACL 元数据和精确 DROP 验证；
生产迁移仍需走既有审批/备份/迁移工作流。禁止用本地结果直接放行生产，也禁止在生产直接复现
匿名角色调用。
