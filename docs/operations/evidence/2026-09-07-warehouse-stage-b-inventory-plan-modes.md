# Stage B 库存流水计划缓存补验

状态：测试诊断、独立规格和质量审查已完成；**发现选择性筛选退化，尚未修复，不是性能放行单。**

SQL 基线：`ec48e158`。本单元只增强隔离测试，不修改生产 SQL、数据库配置或任何已有数据库。

## 方法与结果

- 在原 14 组动态查询之外，分别强制 custom / generic 两种计划各跑 8 组：租户首页、仓库、SKU、仓库＋SKU、类型命中/空结果、深页和越界页，共 30 组。
- 不是把动态 EXECUTE 冒充通用计划：将提取的真实内部 SELECT 用 7 个有类型的参数 PREPARE，再执行和 `EXPLAIN EXECUTE`。通过 `pg_prepared_statements` 验证 custom 场景计数为 custom=2/generic=0，generic 场景为 generic=2/custom=0；每例 DEALLOCATE 并恢复原 `plan_cache_mode`。计划设置仅存在于隔离测试事务。
- 同一计划模式下实际调用 RPC，与冻结的旧函数完整 JSON 对比；再与准备语句的 items/total/分页数量对比。每例仍保持 4 MB work_mem，所有流水计划临时写块为 0。
- 根代理加入计数断言后重跑三份 fixture，exit 0；完整解析 30 条结果，保留 30 条摘要和 8 份 generic 原始计划。这里测试通过只证明上述一致性和已观察的计划行为。
- 根代理最终重跑全部 15 份采购领域 fixture，exit 0，解析 30 条证据（14 dynamic、8 custom、8 generic）；其中一份 fixture 仅安装冻结旧函数，不是独立业务场景。独立规格和质量审查各自重跑上面的三份 fixture，均得到 30 条有效证据并通过审查。

| 同一合成负载 | Custom 执行耗时 | Generic 执行耗时 | Generic 的关键扫描 |
| --- | ---: | ---: | --- |
| 租户首页 20 条 | 17.375 ms | 21.669 ms | 计数全匹配，分页取 20 条 |
| 按仓库，100 条 | 3.591 ms | 11.605 ms | 计数扫描全租户，分页索引后再过滤 |
| 按 SKU，100 条 | 1.706 ms | 39.044 ms | 计数和分页各扫描 100,003 条，过滤掉 99,903 条 |
| 仓库＋SKU，10 条 | 0.325 ms | 33.723 ms | 计数和分页各扫描 100,003 条，过滤掉 99,993 条 |
| 越界空页 | 49.561 ms | 66.037 ms | 有序扫描全部候选，展示关联不执行 |

原因：通用计划保留 `($param IS NULL OR column=$param)`，无法按本次已知 SKU 参数选择对应索引；此处分页走租户时间索引再过滤，计数全表扫描。前一单元解决的宽行物化问题没有复发，但选择性查询仍有优化空间。本次没有证明默认 `auto` 会在实际连接中切换到该通用计划，也没有据单次毫秒值定义生产 SLA。

PostgreSQL 17 支持用准备语句计数和 EXPLAIN 区分两种计划；默认 auto 可能在比较估算成本后采用通用计划。[官方 PREPARE 文档](https://www.postgresql.org/docs/17/sql-prepare.html)。

## 复跑与产物

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/inventory-transactions-legacy-reference.sql \
  scripts/fixtures/warehouse-stage-b/inventory-read-performance.sql
```

本地 `.artifacts/warehouse-stage-b/inventory-read-plan-modes.json` 保存 30 条摘要及 8 份 generic 完整计划，SHA-256 `d43cbbdc187f6423c437761ed6ea041fb294f17bd270deec7dd2d49a7d91d713`。未纳入 Git，可复跑；custom 完整计划由 runner 输出，本产物只保留其摘要。

## 未完成门禁

- [x] 本测试诊断单元的独立规格、质量审查及上述隔离回归（不代替全链路验收）。
- [ ] 核对默认 auto 的实际选择行为；比较局部专用规划或按有效筛选构建查询等最小方案，不修改全局数据库计划设置。
- [ ] 补足外租户干扰和来源表规模、开发库真实分布与 API 联调。

后续优化必须保留过滤、精确总数、稳定排序、分页上限、原来源隔离和函数授权；不能通过减少数据、放宽断言或隐藏慢查询解决此问题。
