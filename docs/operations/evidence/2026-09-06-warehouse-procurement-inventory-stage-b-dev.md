# 仓库采购 Stage B 开发库预检与验收记录

**状态：已应用获准的剩余 12 份开发库 migration，593 个版本全量对齐；真实 API 验收未通过，不是放行单。**

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

### 2026-09-07 20:06 更新：用户确认范围与清单复核

用户在指定上述租户后，对“允许开发库应用清单中的全部 13 个 migration（包含 H5），
并在该租户新建专用验收单据，不操作现有应付”的问题明确回复“确认”。此次授权仅限
上述开发库及指定租户的新验收单据，不包含生产、其他员工登录、既有应付付款或任意权限变更。
未另指定维护时间；实际升级仍在财务 Admin 候选完成审查及恢复准备后执行。

20:06 根代理重新校验池化/直连 host、project ref 与禁止目标，随后执行
`supabase migration list` 和 `supabase db push --dry-run`，两项 exit 0：

- 593 个版本位置，580 个已对齐，13 个仅 Local，0 个仅 Remote。
- dry-run 的 13 个文件与上次清单完全相同，包含 H5；逐文件 SHA-256 与本文记录全部一致。
- 本次仍是只读预检，没有应用 migration、新建单据、开启仓库采购或改动现有应付。
- 财务页面浏览器场景的本地结果不替代此开发库的真实 API、独立审批及历史兼容验收。

### 2026-09-07 20:22 更新：备份准备未完成，继续禁止实际升级

20:08 在同一已校验开发库以只读事务查询，exit 0：服务端 PostgreSQL 17.6，
数据库约 126 MB，`public`/`supabase_migrations` 普通表和物化视图关系总大小约 98 MB。
本机现有 PostgreSQL 18.4 的 `pg_dump`/`pg_restore`，可用磁盘空间约 599 GiB。

尝试通过已校验直连生成 `public` 和 `supabase_migrations` 的 custom-format 备份：

- 首次进程在 60 秒执行上限内未完成，被终止；文件 0 bytes，不可用。
- 后续一次连接/执行失败，无有效归档。独立 `psql SELECT 1` 连接诊断随后 exit 0；
  缩小到迁移 schema 的只读诊断已走到依赖元数据读取，但仍达到其 45 秒执行上限。
- 最后一次允许 300 秒并收集进度，走过元数据读取到 `saving database definition`，
  达到执行上限后终止，exit 1；文件仍为 0 bytes，不可用。不能把这些尝试称为备份成功。

临时目录权限 0700，文件 0600，未纳入 Git；没有输出凭据或业务内容，没有恢复数据库。
以上证据只能证明客户端导出未在预算内完成，尚不足以确定网络、代理或具体元数据查询的根因。
后续应采用受控的开发服务器侧备份或进一步有界诊断，取得有效归档和校验后再升级；
不因已获迁移授权而跳过恢复准备，不把空文件用作恢复凭据。

用户另外同意补齐平台侧仓库采购正式开关入口；补充设计见
[平台开关设计](../../superpowers/specs/2026-09-07-warehouse-procurement-rollout-entry-design.md)。
这不等于已经开启指定租户，也不授权员工代登录或自动应用尚未生成的新增 migration。

### 2026-09-07 20:29 更新：服务器备份完成，远端 H5 历史已变化

用户说明开发服务器信息位于本机 SSH 目录。只读核对 `gooes-dev` 别名，目标
`43.165.126.30` 与 `api-dev.goodcms.cn` 的 DNS 一致，用户为 `ubuntu`，严格主机密钥校验开启。
登录主机名 `VM-0-11-ubuntu`、开发部署目录 `/opt/gooes-dev/docker` 与既有开发 workflow 相符；
未连接生产别名、读取私钥内容或修改 SSH 配置。

在该主机的 `supabase-db` 容器使用 PostgreSQL 17 的本地连接生成 custom-format 归档，
UTC `12:25:55–12:25:59`，整个命令 exit 0：

- 范围仅 `public`、`supabase_migrations`；不是包含 auth/storage/全局角色的全实例备份。
- 宿主路径：`/var/tmp/gooes-stage-b-dev-backup.E2FYPm/public-and-migrations.dump`。
- 容器副本：`/tmp/gooes-stage-b-dev-backup.FPNlEn/public-and-migrations.dump`。
- 7,910,347 bytes；宿主目录 0700、文件 0600；归档目录 5,637 项，273 项 TABLE DATA，迁移历史表 1 项。
- 宿主和容器 SHA-256 相同：`d8b8502481b1d8653dd864bf2ee9f2459f0838cde186503cfde45272649d2554`。
- 没有将业务内容输出或提交 Git，未进行恢复演练。此前空文件不作为有效备份。

服务器内只读历史检查发现 581 条记录，最新为 `20260906121818`。根代理再通过原已校验
公网直连独立查询，UTC `12:26:31.630254+00:00`，结果相同；`migration list` exit 0，
593 个版本位置、581 已对齐、12 仅 Local、0 仅 Remote。与 20:06 相比，仅 H5 版本已在
其他执行上下文应用，**不是本轮根代理执行的升级**。该历史记录保存的 32 条 SQL 文本逐条
均包含于本分支 H5 文件，文件 SHA-256 仍为本文原记录值；这不是 H5 业务 smoke 通过的证明。

20:29 使用 `db push --dry-run --include-all`，exit 0，精确列出原获准 13 条中除 H5 外的
12 条。`--include-all` 用于识别早于现有 H5 最新版本、但尚未应用的库存基础 migration，
不代表授权新增迁移或修复/篡改版本历史。实际执行前仍须复核同一剩余清单。

开发 API 容器只读标签显示源码 `d424be4c3c6ede6d71246a68a542b17064519934`，对应 build run
`34118410964`；自动开发发布 run `34118928688` 已完成。该工作流只校验 migration history，
不能据此认定它执行了 H5 migration；本轮尚未确定 H5 的具体执行人。当前 API 不是本 Stage B 候选。
备份准备已有有效归档，但财务审查、后续候选部署和合法独立审批联调仍未完成，仓库开关未开启。

### 2026-09-07 20:40 更新：认证准备及剩余迁移前置检查

只读检查开发 API 容器的三个非密钥配置：`GOOES_DEPLOY_ENV=development`、
`NODE_ENV=production`、`AUTH_PHONE_LOGIN_WITHOUT_CODE=true`。结合已安装源码
`utils/auth/test-login.ts`，满足官方开发免验证码入口条件；没有修改认证配置、签造 token、
发送短信或执行登录。GitHub 开发发布 smoke 账号变量与用户指定的 `132****5725` 一致，
只输出相等判断，没有输出其他账号。另一位同租户独立审批操作人仍待用户指定。

UTC `12:40:15.024126+00:00` 在开发服务器本地数据库以只读事务复核，exit 0：
仍为 4 条应付、项目归属异常 0 条、付款申请/付款均 0 条，库存流水表尚不存在。
`20260907102914` 要求的两个函数体 MD5 均匹配，函数所有者相同，待创建私有 helper 不存在。
这些是剩余迁移的实际前置证据，不是应用完成或业务联调通过的证据。

### 2026-09-07 21:03 更新：剩余 12 份迁移已应用

财务 Admin 单元经规格/质量审查及根代理独立验证后提交 `c4f5ab62`，本地结果为
93 tests / 442 assertions、17 E2E、check/build 通过。随后复查本文原获准清单、逐文件
SHA-256、开发目标和备份；备份仍为 7,910,347 bytes，权限与哈希不变，归档目录可读。

UTC `13:02:52–13:03:11`，通过已校验直连执行 `supabase db push --include-all --yes`，
exit 0，实际应用原获准 13 份中除已应用 H5 外的全部 12 份，没有新增范围。
紧接执行 `supabase migration list`：**593 个位置全对齐，0 仅 Local、0 仅 Remote**；
`db push --dry-run --include-all` exit 0，待执行为空。未修改历史 migration 或手工修库。

UTC `13:04:38` 开发服务器数据库只读事务检查 exit 0：

- 原项目应付仍 4 条，目的地/项目归属异常 0；付款申请、付款、库存余额、流水均为 0。
- 指定租户仓库采购开关仍关闭；未新建单据、付款或改动既有应付。
- 两张库存表 RLS 开启，anon/authenticated 无 SELECT，service_role 有 SELECT、无直接 INSERT。
- 两个库存列表 RPC 为 SECURITY DEFINER、固定 search_path，仅 service_role 可执行；
  流水 RPC 保留 `plan_cache_mode=force_custom_plan`。SKU 私有 helper 对三个应用角色均不可执行。
- 以 `SET LOCAL ROLE service_role` 实际调用指定租户的两个库存分页 RPC，均返回
  `items=[] / total=0 / page=1 / page_size=20`；事务最后回滚，无业务写入。

### 2026-09-07 真实 API 只读 smoke：开发旧版本与权限阻断

通过已确认的开发免验证码正式登录入口验证指定账号，登录及 `/admin/auth/me` 均 HTTP 200，
tenant/employee 与指定身份精确相符。没有打印或保存 token，没有操作其他员工。
登录仅发生正式入口的会员身份同步/最近登录时间更新，不属于采购或财务业务写入。
首个临时 smoke 脚本误要求成功响应含 `success=true`，在登录 HTTP 200 时停止；
按真实 `ResponseHandler.success` 的 `{data,message}` 修正断言后继续，不将脚本错误算作业务失败。

- `GET /warehouses?page=1&pageSize=20` 稳定 HTTP 500，错误码
  `TENANT_SERVICE_ROUTE_CAPABILITY_UNMAPPED`（请求 `req-4h`）。当前部署 `d424be4c` 的
  capability map 缺少 warehouses；本分支已含 `9e7b08ea` 修复，尚未部署该候选。
  因此不是直接将库存 migration 回滚或绕过服务门禁的问题。
- 应付列表和付款申请列表分别 HTTP 403 `FORBIDDEN`（`req-4i`/`req-4j`）。正式登录响应
  中 `system_admin` 角色存在，仓库 view/manage 与 project.read 存在，但
  `supplier.payable.view`、`supplier.payment-request.{view,manage,approve,pay}` 五项均缺失。
  现有逐操作权限校验按该会话拒绝；未自行增权、代登录或跳过权限。
- 根代理在 API 目录使用 loopback 虚拟配置独立运行路由映射/访问测试：54 tests、90 assertions
  通过。此前从仓库根运行的 alias 导入失败已纠正工作目录；不作为业务 RED 或修复证据。

上述检查不代表新 Stage B API 已发布或完整闭环通过。仍需候选开发部署、合法财务权限、
同租户独立审批操作人和正式平台开关入口；禁止使用既有 4 条应付做付款验收。

### 类型生成与定向同步

本机使用已安装官方 `postgres-meta:v0.96.4`、目标 DNS 单容器映射及只读连接参数生成，
未出现 DNS 错误，但查询/连接等待超时，exit 1、stdout 0 bytes；未覆盖源类型文件。
随后只读检查开发服务器现有 `supabase-meta`（`v0.96.6`）真实 constants/server 代码，
在其独立子进程使用正式 typescript generator；连接限定本机开发数据库 `db/supabase-db`、
`postgres`，仅该子进程设定 `default_transaction_read_only=on`、语句 60 秒、锁等待 2 秒。
未修改容器配置或重启服务，未执行数据库写入。

服务器内生成 exit 0：1,031,479 bytes、31,741 行；完整生成输出 SHA-256：
`f74d98d1fc92c47d2ce7ae54c3f00792632334dd5b49a5381f7ef97e8caec5a0`。
相对当前源类型有 54 个表/函数块差异，除本次库存采购外，还包含 AI、材料笔记等历史漂移。
结构差异候选保存在本地未跟踪 `.artifacts/warehouse-stage-b-typegen-20260907-f74d98d1.diff.json`，
不含业务行或凭据，且仅是差异、不是完整生成文件。后续已完成本任务 31 个表/函数生成块
定向同步，其余 23 个历史差异保持原样；API 类型/构建、81 项 repository 测试及独立规格/质量
审查通过，详见[类型同步证据](./2026-09-07-warehouse-stage-b-types.md)。
本局部类型门禁不替代下方最终 API/Domain/Admin、权限与数据库写入审计总门禁。

### 开发候选的上游整合

类型同步提交 `a152cd91` 后，重新 fetch 并核对 `origin/main` 为 `d424be4c`，仅有
`7b658c58`（停用租户隐藏公开项目）和 `d424be4c`（公开项目展示真实施工节点）两个未合入提交。
为避免后续候选部署覆盖当前开发环境已上线的这两项修复，将其合入**功能分支**，不是将
Stage B 合回 main。先 `merge --no-commit --no-ff`，无冲突；15 个上游文件逐字匹配
`origin/main`，不涉及仓库/Admin/migration/源数据库类型。本地 main 仍为 `ce2c67fb`。

合并候选在提交前通过 API typecheck、build（975 模块）和文件大小门禁；逐文件运行
公开项目 controller、workflow 状态读取、公开范围/缓存/节点标签，以及仓库路由分类/访问
7 个文件，**81 tests / 156 assertions，0 fail**。这些是本地整合检查，不代表新 API 已部署。
独立功能分支及 `.artifacts/` 保留，不推送 main、不清理未完成的工作树，不操作生产。

### 2026-09-07 开发候选发布前检查

用户确认继续开发 API/Admin 候选发布；不包含生产、变更员工权限或开放仓库采购。
功能分支已推送固定源码 `b3d25ce3dde5533a256659007697fa6846c6d2ed`，未推送 main。
正式 `Release Dev` 于 UTC `13:34:11` 创建
[run 34128116804](https://github.com/LeeFo-china/goose/actions/runs/34128116804)，
选择 `service=api,admin`、`operation=release`；创建时仍排队，不能据此宣称部署完成。

- Domain build（包含类型输出及 dist 验证）、Admin check（1,449 文件）和 build（95 页）
  均 exit 0；权限边界检查与 `git diff --check` 通过。
- 严格数据库写入审计 `bun scripts/audit-supabase-writes.ts --fail-on-candidates`
  **exit 1，17 个候选**。涉及 10 个文件及审计脚本与 `origin/main=d424be4c` 字节一致，
  本分支没有新增候选；其中 3 个来自测试字符串。未修改或绕过审计器，整体严格审计仍未通过，
  不能把“没有增量候选”当作 SQL RPC、权限或整体财务安全放行。
- 再次 `supabase migration list`：593 个本地文件、593 项全对齐、0 差异。
  首次通过连接池 dry-run 报 `SQLSTATE 42P05 / prepared statement already exists`；
  改用通过目标守卫的既有开发直连，`db push --include-all --dry-run` exit 0，
  `Remote database is up to date`。仅更换这次只读检查的连接，未修改配置或应用任何迁移。
- 发布前 API/Admin 均 healthy。API 源码 `d424be4c`，镜像
  `useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:88e8edeed38f31e59890fd95432505dc0839c13af091153607926748a6d0b4f9`；
  Admin 源码 `176ba328`，镜像
  `useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:e873432503a3eb7115d8e87de6fd1c6c229e567c25baaf49cd89ea9da7d1f4f8`。
  保留旧镜像信息供恢复评估；没有执行回滚，亦未验证回滚。

### 2026-09-07 开发候选发布完成与真实只读验收

上述 run `34128116804` 已 **completed / success**：API/Admin 构建、开发迁移历史校验、
API 部署与就绪屏障、Admin 部署及最终汇总均通过。未选中 Web/H5/worker 的镜像构建步骤
跳过，生产镜像校验跳过。未重复触发或重跑发布。

根代理 SSH 独立读取两个容器的白名单标签，均为源码
`b3d25ce3dde5533a256659007697fa6846c6d2ed`、run `34128116804`、`healthy`：

- API：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:1a8643294d7f5b43c5147d150359e5b15858ace3d0af919d0d1e5bf537a2b18e`。
- Admin：`useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:2a3dae3bdd4678ee9c212eb0e47d4418f45d7930886a93b7c477f609fd81742c`。

通过正式开发登录入口，以用户指定 `132****5725` 核对登录及 `/admin/auth/me` 的
tenant/employee 精确一致，token/cookie 仅留在进程内，没有输出或保存。首次脚本额外要求
登录 `message=success` 而提前停止；按 controller 实际 `message=登录成功` 修正断言，
重新执行完毕 exit 0。该断言错误不是业务故障，未修改任何认证代码。

| 真实 API GET（列表均 page=1&pageSize=20） | HTTP | 结果 |
| --- | --- | --- |
| `/warehouses` | 200 | 1 条，分页正确、租户匹配；此前路由映射 500 已消失 |
| `/inventory/balances`、`/inventory/transactions` | 200 | 各 0 条，分页正确 |
| `/supplier-purchase-batches` | 200 | 16 条，租户匹配 |
| `/supplier-purchase-orders` | 200 | 14 条，租户匹配 |
| `/supplier-payables` | 403 | `FORBIDDEN`，`req-i`，现有会话缺少应付查看权限 |
| `/supplier-payment-requests` | 403 | `FORBIDDEN`，`req-j`，现有会话缺少付款申请查看权限 |
| `/project-health/risks` | 200 | 14 条；仅为原项目读取 smoke，不是财务回归 |

另通过 `admin-dev.goodcms.cn/api/auth/login` 获取真实 Admin 会话，`/api/auth/me`
身份一致；Admin `/api/backend/` 代理的仓库、库存余额、流水均 HTTP 200，分页结果同上。
登录后 GET `/warehouses`、`/inventory`、`/supplier-purchase-batches` 页面均 200。
这是 HTTP/SSR 可达验证，不是浏览器点击、渲染或完整写入流程验收。

UTC `13:53:43.513407+00:00` 开发库只读事务独立复核：指定租户采购开关 false、
原应付 4、付款申请 0、付款 0、库存余额 0、流水 0；事务回滚，无业务写入。
未自行增权、登录其他员工、开放采购或支付既有应付。

**开发候选已发布，但整体 Stage B 未放行。** 独立审批员工手机号、合法财务权限配置、
正式平台开关入口及完整真实采购/收货/付款、隔离与回归验收仍待完成；严格写入审计的
17 个上游候选也仍未关闭。功能分支与工作树保留，不合回 main、不操作生产。

### 2026-09-07 追加真实读取边界验收：50 通过、2 失败

在已发布候选上，以用户指定账号经正式开发登录入口执行一次顺序 HTTP GET 检查。
登录身份精确匹配；凭据仅留进程内。检查器完成 **52 项，50 通过、2 失败，exit 3**，
没有采购/财务写入。不能把此前首页读取成功扩展为完整分页已通过。

五个列表为 `/warehouses`、`/inventory/balances`、`/inventory/transactions`、
`/supplier-purchase-batches`、`/supplier-purchase-orders`：

- 五组默认 page=1/pageSize=20、最大 pageSize=100、分页总数及返回行租户匹配均通过。
- 五组 pageSize=101、page=0、pageSize=1.5、额外 `tenant_id` 查询参数均返回 400
  `VALIDATION_ERROR`；未登录 GET 均返回 401 `TOKEN_MISSING`。
- 两个库存列表及采购单的 page=999/pageSize=1 正常返回空页并保留真实总数。
- 采购批次及采购单 pageSize=2 的前两页无重复 ID、总数相等；只是这两页的检查，
  不代表并发变更下的游标稳定性或完整跨租户矩阵。
- 四个接受仓库筛选的列表均拒绝非法 warehouseId；项目/仓库目的地筛选正常，
  项目结果保持非空 project_id、空 warehouse_id；采购开关关闭时仓库历史读取返回空页。

**两个失败及独立复现：**

| 请求 | 初次请求 ID | 重复请求 ID | 底层错误 |
| --- | --- | --- | --- |
| `/warehouses?page=999&pageSize=1` | `req-28` | `req-4h` | `PGRST103`：偏移 998，但总数为 1 |
| `/supplier-purchase-batches?page=999&pageSize=1` | `req-2w` | `req-4i` | `PGRST103`：偏移 998，但总数为 16 |

两次均为 HTTP 500 / `DB_ERROR`。追加对照：仓库 page=2/pageSize=1、批次
page=17/pageSize=1（偏移恰好等于总数）均 HTTP 200；因此不是所有空页都会失败。

Root Cause：`repositories/warehouses.ts:list` 与
`repositories/supplier-purchase-batches.ts:listBatches` 使用 exact count + `.range()`，
随后将任意数据库 error 包装为 500，未处理超出范围的 `PGRST103`。已安装
`@supabase/postgrest-js@2.101.1` 的 `PostgrestBuilder.ts` 只在 `res.ok` 分支解析
`content-range` 的 count；错误结果 count 保留 null，不能简单忽略错误并伪造 total=0。
邻近 `project-logs.ts:listByProjectViaSupabase` 已有同错误下按原 scope 重查总数的实现。

**待确认修复建议（未实施）：**

1. 推荐在这两个 repository 仅对 `PGRST103` 做精确处理：使用同一租户/授权目的地/
   状态/关键词条件，追加有界总数查询，返回原请求页码、空列表和真实 total。
   可用已安装 SDK 支持的 HEAD exact count + range(0,0)，不返回业务行；正常页仍只查询一次。
   补查失败、count 缺失或非预期数据库错误必须继续由 error-factory 报错，不吞掉异常。
2. 备选是每次先计数再读取：正常请求也增加一次查询，且仍需处理并发数据变化，暂不推荐。
3. 改成统一分页 RPC 能实现单语句读取，但需要新 migration 和更大的 SQL/API 改动，
   不宜仅为这两个已定位的列表边界引入。

修复前须补可失败的 repository 回归，检查补查 scope 一致、正常页不增加查询、错误不被
误吞及真实总数；修复后运行 API 类型/构建、相关测试及上述真实 HTTP 重测。
本轮按 brainstorming 的设计确认门禁暂停实现；仅记录诊断，不改 SDK、SQL、认证或列表代码。

浏览器方面，按 Browser 技能初始化后返回 `No browser is available`，再按其排障文档
只读查询可用浏览器得到空列表。没有用旁路控制浏览器，真实页面点击/视觉验收仍未执行。
独立审批账号、合法财务权限、平台开关入口与完整闭环验收也仍未完成。

### 2026-09-07 独立付款审批员工已选定并经确认授权

用户明确允许从数据库选择员工，随后确认允许通过正式权限管理入口为财务员工“小龙女”
（`188****5001`）补齐必要权限。范围仅为指定开发租户，不涉及生产、其他员工或共享角色。
此前只读筛选该租户另外 10 位在职、已绑定登录身份的员工：付款申请审批与仓库管理的
角色授权、个人 allow 均为 0，不能直接选择一位已有完整权限的审批人。

根代理按实际 controller/service/schema 核对正式接口，使用原指定租户管理员的正式登录
会话，验证 `employee.permission_manage`、目标员工/租户/在职状态及四个有效权限目录条目。
授权前目标员工为 `finance_base`，34 项有效权限、2 条个人覆盖；四个目标权限均未授权，
不存在待覆盖的同名 allow/deny，因此没有移除原有拒绝或替换角色权限。

UTC `14:23:59–14:24:02` 依次通过
`POST /employees/:id/permission-overrides` 新增四条 `effect=allow`：

- `inventory.warehouse.view`
- `supplier.payment-request.view`
- `inventory.warehouse.manage`
- `supplier.payment-request.approve`

四次均 HTTP 200；分别校验回执权限、目标身份、scope 和带唯一操作标记的授权原因。
`access_scope=all` 为该租户内的数据范围，不是平台权限，也不是仅绑定某张测试单据的权限；
现有仓库管理权限同时允许其他仓库管理动作，本次只为后续验收使用，不实际执行这些动作。
没有新增付款执行、申请管理、应付查看或员工授权权限，也没有修改任何共享角色。

正式 GET 员工权限上下文复核：38 项有效权限、6 条个人覆盖，增加项恰好为上述四项；
原角色、原 34 项权限及 scope、原 2 条覆盖完整对象均与授权前一致。开发库只读事务独立核对
四条新覆盖的 code/effect/scope/原因及更新时间一致；没有手工 SQL 写库或新增迁移。

再按选定员工 ID 只读取得其登录手机号，在进程内使用正式开发登录入口：登录及
`/admin/auth/me` 均 HTTP 200、身份匹配，四项权限全部生效；
`supplier.payment-request.pay` 和 `employee.permission_manage` 仍为 false。
该新会话的仓库列表 HTTP 200（1 条）、付款申请列表 HTTP 200（0 条），分页均 1/20。
凭据及完整手机号未输出或保存；没有执行审批、付款或创建测试单据。

复核指定租户采购开关仍为 false、原应付 4、付款申请 0、付款 0。
**独立付款审批员工和必要授权已落实，不再是待提供事项。** 原操作账号缺少的财务权限、
批次工作流候选身份、平台仓库开关入口、分页越界缺陷及完整业务验收仍需分别处理；
不能将本次授权视作整个采购/付款闭环通过。

若后续撤回本次授权，应在核对这四条覆盖仍属于本次操作后，通过正式
`DELETE /employees/:id/permission-overrides/:permission_id` 分别撤销；保留原 2 条覆盖和角色。
本轮没有撤销，未执行共享角色替换、数据库修库、main 合并或生产发布。

### 前次本地证据与最终门槛

本地的采购领域隔离 PostgreSQL 12 组夹具、库存 Admin 18 项单元/组件测试、8 项浏览器测试及
Admin check/build 已通过，详情见[执行记录](./2026-09-07-warehouse-stage-b-execution.md)。
其中浏览器后端为独立 HTTP fixture；隔离数据库使用 schema-only 基线与合成数据，不能替代本开发库验收。

- [ ] 完成 Admin 补货、采购单及财务目的地适配和最终审查。
- [x] 重新核对待执行文件内容/指纹、开发库目标、迁移状态并确认完整应用清单。
- [ ] 验证历史数据与新增约束兼容，完成升级前风险及恢复准备。
- [x] 经确认后通过 migration 升级；应用后重新运行 `supabase migration list` 与 `db push --dry-run`，证明 Local/Remote 全量对齐。
- [ ] 重新生成数据库类型，运行最终 API/Domain/Admin、权限边界及数据库写入审计门禁。
- [ ] 用明确的开发测试租户/账号/单据进行真实接口采购→审批→收货→库存/应付→付款验收及原项目回归。
- [ ] 完成不同价格加权成本、完整租户隔离矩阵和大数据量查询执行计划检查。
- [ ] 汇总验收证据并完成最终审查后，才允许合并 main 和安全清理。

## 恢复与门禁

正式升级前没有可报告的“升级后回滚成功”。后续若需停用，保持补货开关关闭、关闭新增补货入口；
已有库存、应付及付款事实不能删除，既有财务结算不能因补货关闭而中断。
已应用 migration 不原地修改，账务错误使用经审查的前向修正/冲正；任何破坏性方案须另行说明与确认。
生产发布不属于本轮执行范围。
