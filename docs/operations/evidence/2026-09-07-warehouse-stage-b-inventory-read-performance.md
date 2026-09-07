# Stage B 库存读取性能诊断基线

状态：已取得隔离数据库查询计划，存在待优化项；**不是性能验收通过或发布放行单**。
生产 SQL 基线为 `cf14ead1`。未修改已有数据库、生产配置或生产查询。

## 数据与方法

- 先运行 `receipt-weighted-cost.sql`，通过当前商品创建 v2、真实改价/拆单核算/收货产生 1 条余额、3 条流水和 3 条真实收货来源。
- `inventory-read-performance.sql` 在同一随机离线容器中补 1,000 个同租户 SKU、10 个仓库、10,000 条余额和 100,000 条流水，作为**合成读负载**。所有约束和触发器保持启用，不用此直接生成的数据证明收货命令正确。
- 插入后 ANALYZE；按精确函数签名获取有效 `pg_proc.prosrc`，唯一锚点提取内部 SELECT，只移除 PL/pgSQL INTO 并将完整参数标识符转为绑定参数，保留原始 CTE、JOIN、来源解析及排序。
- 每例先比较真实 RPC 与提取查询的 items、预期 total 和分页条数，再取得 `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)`；记录函数 MD5、参数类别、RPC 耗时和完整计划。
- 11 例覆盖租户级余额/流水、仓库、SKU、仓库＋SKU、余额关键词命中/空结果、深页/越界页。当前查询提取使用动态 EXECUTE；不声称已覆盖 generic prepared plan。
- CLI 原先丢弃 fixture SQL 输出。输出断言先复现 `0 !== 11`，随后仅增加 `EVIDENCE ` 前缀行转发；同一断言重跑取得 11 条完整记录，runner 独立 TypeScript 检查通过。
- 根代理另将已有 13 组采购领域夹具与性能夹具一并重跑：14 组通过，并成功解析 11 条 EXPLAIN 证据；该通过结果不表示下面的性能问题已修复。

## 观察结果

根代理一次实测；毫秒不是性能承诺。独立规格复核另跑两份 fixture，取得同样 11 条记录并复现流水物化和深页外部排序。

| 查询 | 匹配行 | 内部 EXPLAIN 执行耗时 | 根计划临时写块 | 关键行为 |
| --- | ---: | ---: | ---: | --- |
| 余额租户首页 20 条 | 10,001 | 10.919 ms | 0 | 全匹配物化，再 top-N 排序 |
| 余额按仓库 100 条 | 1,000 | 2.342 ms | 0 | 仓库索引筛选后物化 |
| 余额稀有关键词 | 10 | 4.608 ms | 0 | SKU/仓库组合过滤，余额唯一键查找 |
| 余额深页 400 | 10,001 | 13.651 ms | 0 | 物化后排序并跳过前 7,980 条 |
| 流水租户首页 20 条 | 100,003 | 165.895 ms | 3,541 | 全匹配宽行物化落临时数据，再 top-N |
| 流水按仓库 100 条 | 10,000 | 16.893 ms | 355 | 命中仓库索引，但物化仍产生临时数据 |
| 流水按 SKU 100 条 | 100 | 1.459 ms | 0 | 命中租户/SKU索引 |
| 流水仓库＋SKU | 10 | 0.261 ms | 0 | SKU索引后仓库过滤 |
| 流水越界页 10,000 | 100,003 | 215.990 ms | 7,113 | 空结果仍全物化，排序为 external merge |

精确总数需要处理全部匹配行，不能要求所有计划节点都不超过 100 行。当前主要可改善点是：计数与分页前携带了商品、员工等宽字段，物化和深页排序成本随匹配数据量增长。

来源表在本次仅 3 条，计划选择 Hash/Seq Scan，说明不能凭 LATERAL 写在分页后就断言一定逐行主键查找；**本结果既不能证明，也不能否定大来源表的性能上界**。

## 复跑与原始证据

在 Stage B worktree 根目录运行：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/inventory-read-performance.sql
```

该性能夹具明确依赖前一夹具，最后 ROLLBACK 其合成读负载。runner 最终销毁自己创建的随机容器；原有本地库只被读取 schema/角色/函数授权和迁移版本。

根代理完整 11 条 FORMAT JSON 计划保存在 worktree 的 `.artifacts/warehouse-stage-b/inventory-read-performance-before.json`，为可复跑的本地诊断产物，未纳入 Git。文件 SHA-256：`3afbf3dbec7d4ccd2d8a95caa56febbea2e18f1581f2c3f32eaf9aea49b78acf`。函数定义 MD5：余额 `94bac4f47326fbc1a880d4dce0dab5b9`；流水 `ac6d0860c67b7dff665f027dcf3c304c`。SQL 变化后须重新取证。

## 下一步门禁

- [ ] 优先将流水精确计数/分页候选与宽字段展示关联分开；不通过提高 work_mem、强制索引或减少验收数据量掩盖问题。
- [ ] 用同一真实查询提取和 RPC 比对检查优化前后结果、总数、排序、来源与分页语义一致；保留前后计划。
- [ ] 补外租户干扰规模、transaction_type、generic/custom 差异及足够规模的真实来源样本。
- [ ] 结合开发库真实数据分布和最终 API 联调验收。当前禁网络、无卷、关闭 fsync 的一次性容器测试不代表冷盘或生产 SLA。
