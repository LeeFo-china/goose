# Stage B 库存流水分页读取优化

状态：已完成下述隔离数据库复跑及独立规格、质量审查，完整最终验收仍待完成；**未应用开发库或生产，不是放行单。**

本记录接续[优化前诊断基线](./2026-09-07-warehouse-stage-b-inventory-read-performance.md)。仅优化流水读取，不改库存余额读取、收货/财务写入、API 或返回字段。

后续[计划缓存补验](./2026-09-07-warehouse-stage-b-inventory-plan-modes.md)已将复跑扩展到 30 组，发现 generic 下 SKU 筛选扫描退化；下文 14 组为本优化单元提交时的历史证据，不表示该后续问题已解决。

## 根因与变更

- 原查询先关联商品、仓库、员工等展示字段，再物化所有匹配行用于计数和分页。在 100,003 条流水、固定 `work_mem=4MB` 的相同合成负载下，新回归断言实际失败：租户首页产生 3,541 个临时写块。
- 新增 `20260907092110_optimize_inventory_transaction_read_paging.sql`：计数与分页候选只处理流水 ID/时间，选中最多 100 个 ID 后才关联展示字段；同一 SQL 语句保留计数与结果的快照一致性。原展示 INNER JOIN 的非空外键保证引用存在，不因移后而改变匹配集合。
- 新增 `(tenant_id, occurred_at DESC, id DESC)` 索引供租户级有序分页；原仓库/SKU 索引保留。原过滤、排序、金额字符串、来源单据关联、函数签名和 ACL 保留；迁移校验原函数 body 的 MD5，遇到定义漂移整笔失败。
- `NOT MATERIALIZED` 允许分别规划计数和分页；实际是否使用索引仍以执行计划为证据，不强制扫描方式。[PostgreSQL 17 CTE 文档](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION)、[索引与排序](https://www.postgresql.org/docs/17/indexes-ordering.html)。

## 验证与实际结果

- 合成数据规模及业务种子不减：通过真实商品/改价/收货生成 1 条余额、3 条流水，再补 10,000 条余额、100,000 条流水作为读负载；约束、触发器保持启用。4 MB 仅设置于测试事务，不调整生产参数。
- 固化优化前实际流水函数为隔离测试 oracle `inventory-transactions-legacy-reference.sql`，仅更名并改为 SECURITY INVOKER。每个流水场景将优化后真实 RPC 的完整 JSON 与旧 oracle 比较，覆盖字段、十进制字符串、顺序、总数和分页；随后还比较提取查询与实际 RPC。
- 根代理跑三份夹具通过，并取得完整 14 组 EXPLAIN JSON：原 11 场景加流水类型命中/空结果及第 400 页。全部流水场景临时写块为 0。
- 独立规格审查另跑三份夹具通过，确认旧 oracle body MD5 与基线完全一致、余额函数未改、流水完整 JSON 相同和临时写块为 0。根代理随后重跑全部 15 份采购领域夹具（其中一份仅安装旧函数对照），全部通过，并解析 14 条计划。
- 独立质量审查另跑三份夹具并解析 14 条计划，结果相同；逐项核对前后 artifact 指纹、文档耗时及扫描行数，无剩余审查问题。
- 第一次 GREEN 的终端输出被工具截断，后续 JSON 解析失败；不据此宣称取得完整计划。再次运行后成功解析全部 14 条证据，以下数值来自该次完整结果。

| 同规模场景 | 优化前执行耗时 | 优化后执行耗时 | 临时写块：前 → 后 |
| --- | ---: | ---: | ---: |
| 流水租户首页，20 条 | 165.895 ms | 16.328 ms | 3,541 → 0 |
| 流水按仓库，100 条 | 16.893 ms | 3.502 ms | 355 → 0 |
| 流水越界空页 | 215.990 ms | 49.682 ms | 7,113 → 0 |

这是两次隔离容器同规模合成数据的单次观测，不是稳定倍率或生产 SLA。新计划租户首页仅通过索引获取 20 个分页 ID，再对 20 条事实取展示字段；第 400 页需扫描 8,000 个有序 ID，越界页仍需扫描全部候选，但展示关联不执行。精确计数依然处理全部匹配事实，没有改成估算总数。

完整新计划：worktree `.artifacts/warehouse-stage-b/inventory-read-performance-after.json`，SHA-256 `8aa9950c15de70429c372711053f6bc24bba5b65adb70e4c03e2cf2a92e75619`，流水函数 body MD5 `413a01db2e001a7696c9d0c947b45ebd`。这是未纳入 Git 的可再生成诊断产物；旧计划位置及指纹见基线记录。

复跑（仅一次性隔离容器）：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/inventory-transactions-legacy-reference.sql \
  scripts/fixtures/warehouse-stage-b/inventory-read-performance.sql
```

## 剩余门禁与应用风险

- [x] 独立规格审查及全部采购领域夹具回归。
- [x] 独立质量审查。
- [ ] 补 generic/custom 计划差异、外租户大规模干扰、足够规模的真实来源表，以及开发库真实数据分布和接口联调。
- [ ] 核对历史外键与数据完整性、新索引空间/构建耗时，重新确认全部待执行 migration。

普通 `CREATE INDEX` 在构建期间会阻塞写入；迁移使用 5 秒取锁超时和 5 分钟语句超时，仍须在获确认的维护窗口应用，不把本地快速建索引等同于远端无锁。此迁移与索引均为事务内执行，失败整笔回滚；应用后如需撤回优化，通过新的 migration 恢复旧读取函数并评估移除新增索引，不删改账务事实。

本次不补全余额性能或全部查询组合，不开放补货开关，不修改已有数据库、main、orange 或生产配置。
