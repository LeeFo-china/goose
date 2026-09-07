# Stage B 库存流水真实 RPC 计划稳定性

状态：已复现默认 auto 的选择性扫描退化，最小修复、独立规格/质量审查及本单元隔离回归已通过。**未应用已有数据库，不是整体性能或部署放行单。**

接续[函数外准备语句诊断](./2026-09-07-warehouse-stage-b-inventory-plan-modes.md)。代码基线 `364dea57`，修复 migration 为 `20260907095435_stabilize_inventory_transaction_query_plans.sql`。

## 根因与修复

- 同一 PL/pgSQL 内部语句的可选仓库、SKU、类型条件使用 `参数 IS NULL OR 列=参数`。通用计划无法利用本次参数的选择性；前五次宽查询的估算成本较高时，默认 auto 可以选择该通用计划，之后按 SKU 读取会扫描整个租户。
- 在新连接、合成 100,003 条流水下，依次真实调用：租户首页、第 400 页、第 10000 页、采购入库首页、采购入库第 10000 页，然后 SKU、仓库＋SKU。第 6/7 次的内部计划出现 `$1..$4` 谓词，计数和分页各检查 100,003 条。此为明确的高成本预热序列，不代表生产流量分布；先前将第 5 次设为第 400 页的试验仍选择 custom，因此并非所有 auto 请求都会退化。
- 新 migration 仅为 `list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)` 设置函数级 `plan_cache_mode=force_custom_plan`。不改 SQL body、签名、授权、search_path、库存/应付写入、API 或全局配置。精确校验原函数 MD5 和配置，遇到漂移即拒绝应用。
- 代价是每次调用重新规划的 CPU；相比动态 SQL 或复制多组筛选分支，改动面最小。后续仍需真实并发负载评估，不能用下表执行耗时替代完整 RPC 延迟或规划开销测量。

## 真实函数证据

使用 PostgreSQL 17 `auto_explain` 的单会话 LOAD、nested statements、JSON、analyze/buffers，逐节点计时关闭；开始/结束 NOTICE 将每次真实调用与其唯一内部计划关联。设置只存在于随机离线容器内的本测试事务，不在已有数据库启用。解析器拒绝缺失、重复、截断、区间外计划和临时写块。

采集放在 seed/ANALYZE 后、其他 RPC 调用之前，避免污染前五次的计划历史；没有用 `DISCARD PLANS` 假定重置次数。每次实际响应与旧函数完整 JSON 一致，数量/分页也单独断言；记录函数 MD5、proconfig、调用次序和参数。

| 真实内部语句 | 修复前执行耗时 | 修复后执行耗时 | 修复后计数/分页扫描 |
| --- | ---: | ---: | --- |
| auto 预热后 SKU（100 条） | 36.793 ms | 1.898 ms | 各 100 条，SKU 索引 |
| auto 预热后仓库＋SKU（10 条） | 34.829 ms | 0.329 ms | 各 100 条，其中过滤 90 条 |
| 调用者强制 generic，SKU | 37.080 ms | 1.884 ms | 各 100 条，函数内部仍为 custom |
| 调用者强制 generic，仓库＋SKU | 33.464 ms | 0.290 ms | 各 100 条，其中过滤 90 条 |

11 次真实内部计划全部零临时写块；函数退出后恢复调用者 mode（auto/custom/generic 均验证）。函数 body MD5 仍为 `413a01db2e001a7696c9d0c947b45ebd`；唯一新增配置为 `plan_cache_mode=force_custom_plan`。

回归断言对六个选择性场景逐节点计入返回行、过滤行、索引重检和 loops，要求扫描不超过本合成 SKU 的 100 条事实。修复前实际失败 `auto-6 (100003 > 100)`；应用 migration 后相同夹具通过。此边界只适用于该合成数据分布，不是 API 的返回数量上限。

原 30 组函数外计划/一致性断言保留。函数外强制 generic 的准备语句仍可能全租户扫描：函数级配置不影响任意独立 SQL，不能将它们误标为已优化。

## 复跑、产物与门禁

```bash
bun test scripts/warehouse-inventory-plan-notices.test.ts
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/inventory-transactions-legacy-reference.sql \
  scripts/fixtures/warehouse-stage-b/inventory-read-performance.sql
```

runner 输出原 30 条 `EVIDENCE`，另输出 11 条 `RPC_PLAN` 和 11 条 `RPC_META`；只有精确白名单性能夹具捕获 stderr，数据库进程失败不解析成成功。保留离线网络、超时、缓冲限制和 finally 清理。

本地 `.artifacts/warehouse-stage-b/` 的 `inventory-rpc-auto-before.json` / `inventory-rpc-auto-after.json` 各保留 11 份完整内部计划、摘要、参数及函数配置，未纳入 Git。SHA-256 分别为 `bf2ac8cd973f3af24994bfc708b0b56276d14424d94c64e37d9aabecb5538fc5` / `c33b3bb2add64388117e8f8867c0bd6ed969495b7795446cb011fe3775491d97`。

- [x] 解析器/扫描界限测试 RED→GREEN（9 项、18 断言）；针对性 TypeScript 检查。规格审查补充发现重复空 CASE/END 可被接受，新增回归先失败，再增加标记唯一性和区间内计划存在检查后通过。
- [x] 真实 RPC 扫描边界 RED→GREEN；三份隔离 fixture，原 30 组和新增 11 组内部计划。
- [x] 根代理全 15 份采购领域隔离 fixture 通过：30 条原证据、11 条真实内部计划和 11 条元数据；一份 fixture 仅安装旧函数 oracle，不计为独立业务场景。
- [x] 独立规格、质量审查均通过：分别独立重跑三份 fixture，得到 30 条原证据、11 份内部计划和 11 条元数据；规格发现的标记漏检已修复并复审。根代理随后重跑全 15 份 fixture，exit 0，另确认 11 份内部配置均为 force_custom、body MD5 不变、proconfig 仅新增函数级设置。
- [ ] 外租户干扰、大来源表、规划 CPU/并发负载、开发库真实 API、完整历史升级及最终验收。

应用需重新确认开发库全部待执行 migration；本次没有应用。必要时用新 migration 对上述精确函数 `RESET plan_cache_mode` 回滚，不删除事实、不改历史 migration；回滚会恢复已记录的退化风险。

依据：[auto_explain 配置](https://www.postgresql.org/docs/17/auto-explain.html)、[auto 选择规则](https://www.postgresql.org/docs/17/sql-prepare.html)、[函数级配置及退出恢复](https://www.postgresql.org/docs/17/sql-createfunction.html)。
