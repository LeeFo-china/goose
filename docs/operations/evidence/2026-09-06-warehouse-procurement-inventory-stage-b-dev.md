# 仓库采购 Stage B 开发库预检与验收记录

**状态：仅完成只读预检，未升级开发库，未完成真实 API 验收，不是放行单。**

文件名沿用实施计划指定日期；本次检查时间为 2026-09-07 16:19（Asia/Shanghai）。
工作分支为 `feature/warehouse-procurement-inventory-stage-b`；预检 SQL 内容对应
`c101e6d3`，随后 Admin 库存只读工作台提交为 `aba8a5cf`，未修改 migration。

## 目标与安全边界

- 目标 host：`api-dev.goodcms.cn`；预期 development project ref：`fclnkyatvfvmzgzdqlba`。
- 使用本地已有的开发环境配置，只读加载；未写配置、输出连接串/口令或更改项目链接。
- 使用仓库 `validate-dev-database-target.mjs` 导出的解析和校验函数，核对连接 host、端口、预期 project ref 与禁止目标清单。
- project ref 采用既有阶段 A 记录与 development workflow 的明确配置；不是从凭据推断新环境。池化连接和直连目标校验均为 true。
- 禁止目标仍包括 `api.goodcms.cn`、`1.13.20.39` 及生产 project ref；本次未连接生产。
- 仅执行 `supabase migration list --db-url <已校验开发库直连>` 和 `supabase db push --dry-run --db-url <同一直连>`，两项 exit 0。
- 输出只保留版本/文件名、目标和退出码；连接超时受限，不打印原始错误中的潜在凭据。

## Local / Remote 检查快照

`migration list` 返回 590 个版本位置，其中 580 个 Local/Remote 相同，10 个仅 Local 有记录。
无仅 Remote 有记录的版本；已对齐部分最新为 `20260906101000`。
`db push --dry-run` 的待执行清单与下表相同，**没有实际应用**。

| 顺序 | 待执行 migration | 范围 |
| --- | --- | --- |
| 1 | `20260906110000_create_inventory_ledger_stage_b.sql` | 库存基础与收货过账 |
| 2 | `20260906121818_tenant_h5_customer_leads.sql` | H5 客户线索，非仓库单元 |
| 3 | `20260907052559_enable_warehouse_purchase_batch_drafts.sql` | 仓库目录及采购草稿 |
| 4 | `20260907053628_list_warehouse_purchase_orders.sql` | 仓库订单读取与归属 |
| 5 | `20260907055503_enable_warehouse_purchase_batch_accounting_commands.sql` | 拆单核算 |
| 6 | `20260907062812_enable_warehouse_purchase_workflow.sql` | 仓库审批工作流 |
| 7 | `20260907065551_harden_warehouse_receipt_posting.sql` | 收货门禁及锁序 |
| 8 | `20260907070346_enable_warehouse_supplier_payment_reads.sql` | 仓库应付与付款查询 |
| 9 | `20260907071752_enable_warehouse_supplier_payment_commands.sql` | 仓库付款命令 |
| 10 | `20260907073222_add_inventory_source_document_reads.sql` | 库存来源单据 |

H5 migration 已存在于当前 Git 历史，但在本开发库尚未应用。不能把本次升级描述成
“只应用仓库迁移”，也不能擅自跳过、改写版本历史或直接执行远端 SQL 修库。
正式应用前需确认确切目标及完整清单，特别是其中的 H5 范围；本记录没有授予应用权限。

检查时内容指纹（SHA-256）：

```text
20260906110000 0d052e6b6bf14bd38a9450a9f6399060139217a5da19c0636b1190e4fdbbf4d8
20260906121818 842e4ca2cd7af977ef962f94c5d4ba87ba562fa652d0c62d7ece18c3132274f7
20260907052559 eb5a82c82e68a8464b11720c107b504a65cc11b37943bbf722e0dd329ac6f59c
20260907053628 1c2e3d38565e0784c466d398a94c222a0f267224518c379da49ed7cf91ea3bd3
20260907055503 24e73b733245c3c5922b1a3710ad14171870e09f617873657f534913e72ec5e0
20260907062812 5adb2c7e7e85593e9291ecfcb44753fc7df27f6a04df4d0d91e6eea733d0b8c1
20260907065551 0d9ca8416703967b24a28bdcdda1a24ce78a07d0caa9a97e8aeda5c6721ef2d8
20260907070346 7484fdc1235771905630ec09cde1ff336909ee4fdc640df345e48bb84cbfe8e4
20260907071752 6ff992232046e1eb3c54904f94d71803daa2dc8a7c1df8ee92a06dc596837743
20260907073222 3efc57cf587e2b839ba12b5a4669261bcd2820fc447ef188fcf25a2ba1ade020
```

## 已有验证与尚缺证据

本地的采购领域隔离 PostgreSQL 12 组夹具、库存 Admin 18 项单元/组件测试、8 项浏览器测试及
Admin check/build 已通过，详情见[执行记录](./2026-09-07-warehouse-stage-b-execution.md)。
其中浏览器后端为独立 HTTP fixture；隔离数据库使用 schema-only 基线与合成数据，不能替代本开发库验收。

- [ ] 完成 Admin 补货、采购单及财务目的地适配和最终审查。
- [ ] 重新核对待执行文件内容/指纹、开发库目标、迁移状态并确认完整应用清单。
- [ ] 验证历史数据与新增约束兼容，完成升级前风险及恢复准备。
- [ ] 经确认后通过 migration 升级；应用后重新运行 `supabase migration list` 与 `db push --dry-run`，证明 Local/Remote 全量对齐。
- [ ] 重新生成数据库类型，运行最终 API/Domain/Admin、权限边界及数据库写入审计门禁。
- [ ] 用明确的开发测试租户/账号/单据进行真实接口采购→审批→收货→库存/应付→付款验收及原项目回归。
- [ ] 完成不同价格加权成本、完整租户隔离矩阵和大数据量查询执行计划检查。
- [ ] 汇总验收证据并完成最终审查后，才允许合并 main 和安全清理。

## 恢复与门禁

正式升级前没有可报告的“升级后回滚成功”。后续若需停用，保持补货开关关闭、关闭新增补货入口；
已有库存、应付及付款事实不能删除，既有财务结算不能因补货关闭而中断。
已应用 migration 不原地修改，账务错误使用经审查的前向修正/冲正；任何破坏性方案须另行说明与确认。
生产发布不属于本轮执行范围。
