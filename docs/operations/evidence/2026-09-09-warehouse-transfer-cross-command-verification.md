# 调拨与退料／收货交叉并发验收

实现提交 `4ab5720f`，超时清理补强 `cc1bba23`，仅两份新离线 SQL fixture。主代理对最终提交独立执行以下命令，退出0；完整输出见同目录 `2026-09-09-warehouse-transfer-cross-command-concurrency.txt`。

```sh
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/material-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-contract.sql scripts/fixtures/warehouse-stage-b/transfer-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-concurrency.sql scripts/fixtures/warehouse-stage-b/transfer-cross-command-before.sql scripts/fixtures/warehouse-stage-b/transfer-cross-command-concurrency.sql
```

四组 return-first、transfer-before-return、receipt-first、transfer-before-receipt 均使用两个独立 PostgreSQL 连接，B 必须 active、wait_event_type=Lock，且 pg_blocking_pids 包含 A 后，才提交 A。主代理最终运行 PID 分别为521/522、523/524、525/526、527/528，均等待 transactionid。每组真实两命令均成功，核对版本、唯一回执、新增3条库存事实、调拨成对数量价值净0、所有流水与余额/均价重算及重放不重复。

退料经真实领料完成后建立草稿，采购经真实审批和确认履约后收货。精确剔除合法退料成本冲回或收货应付后，其他成本／应付／付款／现金完整事实快照保持相同。最后通过真实反向调拨恢复仓库分布；总库存0.9/0.06包含两笔新收货，净项目成本0、合法收货应付合计0.04，未声称收货后库存不变。

两个负控制均真实执行：A提前提交须精确拒绝 P9002/CROSS_COMMAND_EXPECTED_LOCK_WAIT，B全部回滚并关闭连接；B实际500ms statement_timeout 须返回原57014，A仍未提交、两单仍submitted/version2、无完成回执／流水／金额且余额财务快照相同，8秒内关闭两连接。实现者分别先观察 missing Lock 与 leaked connections 的RED，再实施GREEN。质量审查指出 OTHERS 不捕获 query_canceled，修订显式捕获后原样重抛，主代理完整复跑通过。

原实现与超时增量均按 SPEC→quality 顺序独立审查，最终无阻断或遗留 Minor。随机无网络临时 PostgreSQL 17 容器已清理；这是采购领域离线行为证据，不代替全历史迁移、真实租户 Chrome 验收。没有修改生产代码、migration、runner、既有 fixture、远端业务数据或 Orange。
