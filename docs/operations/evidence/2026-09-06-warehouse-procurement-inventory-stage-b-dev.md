# 仓库采购 Stage B 开发库预检与验收记录

**状态：仅完成只读预检，未升级开发库，未完成真实 API 验收，不是放行单。**

文件名沿用实施计划指定日期；首次检查时间为 2026-09-07 16:19（Asia/Shanghai），后续更新见下文。
工作分支为 `feature/warehouse-procurement-inventory-stage-b`；预检 SQL 内容对应
`c101e6d3`，随后 Admin 库存只读工作台提交为 `aba8a5cf`，未修改 migration。

## 目标与安全边界

- 目标 host：`api-dev.goodcms.cn`；预期 development project ref：`fclnkyatvfvmzgzdqlba`。
- 使用本地已有的开发环境配置，只读加载；未写配置、输出连接串/口令或更改项目链接。
- 使用仓库 `validate-dev-database-target.mjs` 导出的解析和校验函数，核对连接 host、端口、预期 project ref 与禁止目标清单。
- project ref 采用既有阶段 A 记录与 development workflow 的明确配置；不是从凭据推断新环境。池化连接和直连目标校验均为 true。
- 禁止目标仍包括 `api.goodcms.cn`、`1.13.20.39` 及生产 project ref；本次未连接生产。
- 首次仅执行 `supabase migration list --db-url <已校验开发库直连>` 和 `supabase db push --dry-run --db-url <同一直连>`，两项 exit 0；后续只读数据检查另见 19:20 更新。
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

### 2026-09-07 18:58 更新：13 个待执行版本，仍未应用

在功能分支 `d1cc9367` 上再次只读校验上述开发库目标，运行 `supabase migration list`
和 `supabase db push --dry-run`，均 exit 0。结果为 **593 个版本位置、580 个已对齐、
13 个仅 Local、0 个仅 Remote**。前述 10 个文件及 SHA-256 均未变化，另追加以下三个版本：

| 待执行 migration | SHA-256 |
| --- | --- |
| `20260907092110_optimize_inventory_transaction_read_paging.sql` | `57567971e003ab41331c4322d1c001383bf94acc693dc9197b33d1a3c0133eaf` |
| `20260907095435_stabilize_inventory_transaction_query_plans.sql` | `214b76013305f90112d8a9db8b071ba3a7be958d4a77850b2d4365020c154c91` |
| `20260907102914_fix_supplier_sku_exact_catalog_resolution.sql` | `98cdd6774838eb8c1c0218b371a6b621388ad5b7029928376a85d2c0b781d8cb` |

本次还完整阅读了混入清单的 `20260906121818_tenant_h5_customer_leads.sql`，确认它不是空操作：

- 在事务内删除并重建普通线索来源唯一索引，将范围扩到 H5；新增两个线索分页索引与三个 H5 trigram 索引。
- 替换统一线索分配、跟进、转客户、无效及分页查询函数，并保留旧抖音入口的来源限制。
- 新增 H5 写入/版本/归属保护、跟进和预约来源触发器。应用后会影响 H5 采集及原抖音链路，不能仅验收仓库功能。
- 没有 migration 顶层历史业务数据回填；函数体中的业务写入属于以后调用命令时执行。这不等于历史数据兼容已验证：新唯一索引仍需检查实际存量重复，旧采集调用也需与新增保护相容。
- 索引不是 `CONCURRENTLY`，可能阻塞写入；本文件限制锁等待 5 秒、语句 30 秒，超时会失败回滚，不能据此保证开发库升级时长。库存流水分页优化也使用普通索引，需要确认维护窗口。

以上是源码影响核查与真实 migration 清单预检，**未运行 H5 业务 smoke、未查实际数据重复、
未应用 migration、未验证升级后的触发器和函数行为**。既有 H5 本地验收见
[历史记录](./2026-09-06-h5-customer-leads.md)，不将其视作本开发库当前验收。
后续需确认全部 13 个版本（包括 H5）及维护窗口，再执行升级前数据检查、获准升级和升级后完整验证。

### 2026-09-07 19:20 更新：升级前实际数据只读检查

在同一已校验开发库直连上使用本机已有 `psql`，以 `BEGIN TRANSACTION READ ONLY`
执行汇总查询后 `ROLLBACK`，exit 0；服务端返回 `transaction_read_only = on`。
连接超时 10 秒、语句超时 5 秒、锁等待 2 秒。没有 DDL/DML、原始业务行或凭据输出。

| 检查 | 当时结果 | 证据边界 |
| --- | --- | --- |
| H5 扩展普通来源唯一索引的重复组 | 0 | 对 `douyin_measurement_appointment_id IS NULL`、`marketing_lead_id IS NOT NULL`、来源为 `douyin_miniapp/h5`，按 `customer_id, marketing_lead_id` 分组；仅证明此时无重复，应用前仍需复查 |
| 原普通来源索引 / 库存流水表 | 原索引存在 / 库存流水表不存在 | 与尚未应用对应 migration 一致，不是升级后验证 |
| 历史 `supplier_payable_events` | 共 4 行，项目归属异常 0 行 | 项目非空、项目存在且与事实同租户 |
| 历史 `supplier_payment_requests` / `supplier_payments` | 均为 0 行 | 无可供此次升级验证的真实历史申请/付款数据，不能宣称其历史兼容已验收 |
| SKU 两个函数体 MD5 前置条件 | 均与 `20260907102914` 的保护值一致 | 仅核对函数体，不替代权限、所有者及升级后行为验证 |

函数体检查针对 `command_supplier_purchasable_sku_v1` 与六参数
`resolve_supplier_purchase_order_catalog`，MD5 分别为
`59afd4946de800213992c1b83dcb5825` 和 `bbf2a8489d95e75e904f738c869894a8`。
19:30 根代理按上述完整真实列名再次执行相同只读重复组查询，exit 0；服务端时间
`2026-09-07T11:30:38.795776+00:00`，`read_only = on`，重复组仍为 0。
上述查询补上了 18:58 时尚缺的部分数据检查；**仍未应用任何 migration，未运行真实 H5
或仓库业务 smoke，也未完成全部历史兼容验收**。正式升级仍需确认完整清单和维护窗口。

### 2026-09-07 19:48 更新：用户指定联调租户

用户指定手机号 `132****5725` 所属租户。根代理以相同目标校验、只读事务、必要字段和
最多 20 条的查询核对开发库员工/租户关联，exit 0；服务端时间为
`2026-09-07T11:48:51.021515+00:00`，`read_only = on`。

- 精确手机号匹配 1 条员工记录，唯一关联「固始晴天装饰工程有限公司」。
- 员工和租户均 active，有登录用户绑定及 active 的租户 `system_admin` 角色。
- 这只是账号/租户关联事实，不代表已成功登录 API、具备第二个独立审批账号或真实流程验收通过。
- 用户提供租户信息不等于确认全部 13 个 migration、维护窗口或授权改动任意既有单据；仍未执行数据库升级或业务写入。

19:54 在已解析的同一租户/员工 ID 与手机号共同限定下，再次只读查询联调前置条件，exit 0；
服务端时间 `2026-09-07T11:54:31.723872+00:00`。有 1 个仓库且 active，3 个 active
供应商关系、4 条应付；供应商模块、采购快照和批次工作流开关开启，**仓库采购开关关闭**。
另有 10 名 active 且已绑定登录用户的员工，但这不是已获准使用其登录或已验证审批权限。
所有结果均为汇总计数/开关，未输出其他员工或供应商身份，没有改动现有单据或开关。
真实流程需明确独立审批操作人和测试单据，不能将这 4 条既有应付默认视作可付款测试数据。

### 前次本地证据与最终门槛

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
