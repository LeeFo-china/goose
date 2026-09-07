# Stage B：双租户库存主列表隔离

新增 `scripts/fixtures/warehouse-stage-b/tenant-inventory-read-isolation.sql`，验证双方均有真实
收货生成的库存余额/流水时，主列表的 `items` 与 `total` 都不混入对方数据。
本单元仅增加测试，不改生产函数、权限或 migration。

## 本地执行

根代理执行下面 3 个夹具，全部通过、exit 0。仍使用既有 runner 的 schema-only 基线、
合成数据和一次性无网络隔离容器；已有本地库仅提供结构/授权元数据，不读取业务行，不写远端。

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-cross-order-concurrency.sql \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/tenant-inventory-read-isolation.sql
```

## 验证断言

- 从双方各自的原始库存事实中取得预期 ID、排序及总数，要求两个租户均非空且合成种子数量有界。
- 两个方向分别验证不传仓库的余额/流水列表，及传本租户仓库/SKU 的正向查询，结果必须与预期 ID 和 `total` 完全一致。
- 余额查询外租户仓库、外租户 SKU 编码关键词、本仓混外编码；流水查询外仓、外 SKU、本仓混外 SKU、外仓混本 SKU，均要求 `items = []` 且 `total = 0`。
- 将每页大小设为 1，遍历双方余额和流水至最后一个空页；每页 ID、租户、排序、总数和分页元数据均明确断言，不能只过滤当前页而泄露另一租户总数。
- 实际数据库 `has_function_privilege` 检查余额 RPC：anon/authenticated 不可执行，service_role 可执行；不重复把先前已覆盖的流水权限算作新证据。
- 临时表/测试辅助函数均在事务末尾回滚；不增加库存事实，不改变后续性能种子基数。
- 组合顺序：本夹具必须在 `receipt-weighted-race.sql` 之前。正向控制使用两个前置夹具的单仓/SKU 种子；不同价并发夹具会为其中一个租户新增第二仓，不能在该扩展后继续使用这里的原种子前置条件。

## 验收边界

这是实际 PostgreSQL 函数与 ACL 元数据验证，不是以 service_role 登录的 HTTP 测试，
也不证明应用层的租户选择、员工角色或全部授权路径。分页使用少量合成数据；大数据量性能
另有专门夹具，不能从本测试推断。金融写入混用、完整跨租户 HTTP 矩阵、开发库历史升级及
最终合并门槛仍未完成。

独立规格与质量审查均通过，各自独立运行上述 3 个夹具、exit 0。根代理另运行当时已完成的
20 个夹具（不包含仍在开发的金融跨租户写入夹具），全部通过；30 个外层计划、11 个真实
RPC 计划及 11 个 RPC 元数据记录数量和 JSON 解析检查通过。本记录不是 Stage B 放行单。
