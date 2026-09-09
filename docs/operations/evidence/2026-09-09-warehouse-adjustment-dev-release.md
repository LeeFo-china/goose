# D2.2 手工调整数据库 DEV 发布

状态：远端 apply、611/611 完整迁移对齐及 API/Admin 开发发布均已成功。手工调整仍默认关闭，未授予权限；业务 API/Admin 接入和真实验收尚未完成。

## 范围与固定版本

用户本轮明确要求“远端 apply，开发部署”，因此优先发布既有数据库核心，暂缓原计划的 D2.2 HTTP/读取/来源/设置接入。固定发布分支 `release/warehouse-adjustment-database-dev-20260909` → `b6d8e06696df4cdfc71ec162ac230913662683e3`，功能分支和 linked worktree 保留。未改 Orange、main 或既有 D1/D2.1 release 分支。

这是默认关闭的数据库基础交付，不是手工调整业务上线：HTTP、分页 RPC、来源文档、平台开关及 Admin 尚未接入。本轮不启用任何租户、不授予员工权限、不调用手工调整业务写命令，不操作生产。

## 迁移与备份

唯一待执行文件：`20260909134749_warehouse_adjustment_atomic_commands.sql`，SHA-256 `d4c4c6e227a44e1369ebb7b4b319e36e689285c72bb4e06c6501b59b0cff0ac0`。原库存来源约束表达式完整保留在旧分支；新增列默认为 NULL，调整开关默认 false。migration 自带单事务、5s lock_timeout 和 5min statement_timeout。回退策略为保持新功能关闭、保留单据/回执/库存事实；若后续业务已开放，使用审核后的新 migration/业务冲正修复，不删事实或手工 DML 修库。

使用仓库已有 DEV URL 守卫核对 `api-dev.goodcms.cn/postgres`、TLS require。SSH 主机确认为 `VM-0-11-ubuntu`，发布前 API/Admin healthy，revision 均为 `daee511b`。剩余磁盘 9.2GB。所有直接证据查询显式 READ ONLY、15s statement_timeout、3s lock_timeout；无长事务/锁等待。

服务器备份：`/tmp/gooes-adjustment-preapply-P65lW8ZW/database.dump`，8,296,629 bytes，SHA-256 `1f90ec297edc1d08b169e8f48d6b9f092013d30beb10c0c8566bb196ce140c02`。受限权限目录保留，不进入 Git。只覆盖 public 与 supabase_migrations，不含 auth/storage/角色/Vault；不能当作全实例灾备。

初次宿主机 pg_restore 16.13 读取 PG17.6 归档报 `unsupported version (1.16)`。核对真实版本后，用原数据库容器内 pg_restore 17.6 读取同一文件成功：目录 5925 行，全归档解码到 /dev/null 成功。没有安装工具、改服务器配置或修改归档；这不是数据库恢复演练。

## 已完成的远端证据

- [DEV plan 34364981507](https://github.com/LeeFo-china/goose/actions/runs/34364981507)：成功，610→610，pending 仅 20260909134749，applied 0。
- CLI dry-run：仅列该文件。
- [DEV apply 34365337459](https://github.com/LeeFo-china/goose/actions/runs/34365337459)：成功，2026-09-09T14:42:12Z 应用且仅应用该文件，610→611。
- fresh Supabase CLI migration list 退出 0；既有 `verify-migration-history.mjs` 校验 611/611 完整对齐及目标版本存在，两个字段均 true。
- 14:42:43Z postapply：新权限定义 2、角色授权 0、启用租户 0，晴天 settings version24 和旧字段不变，新 flag=false。
- 晴天库存、财务、领退料、调拨、盘点与审计 14 类业务表及 3 类全局授权表的 count/md5 与 preapply 全部一致。流水 hash 仅排除本次新增 NULL 列，未忽略旧字段；全租户旧设置 hash 也相同。
- 将既有 adjustment-contract.sql 中纯只读 DO 断言放入 READ ONLY 事务，在 DEV 成功核对三表 forced RLS、表/序列/辅助函数权限、命令仅 service_role 执行、默认关闭、权限仅定义且无员工覆盖授权。未执行夹具业务数据写入。

原始记录：[预检](2026-09-09-warehouse-adjustment-dev-preapply.json)、[应用后](2026-09-09-warehouse-adjustment-dev-postapply.json)、[检查 SQL](2026-09-09-warehouse-adjustment-dev-checks.sql)、[完整 CLI 表](2026-09-09-warehouse-adjustment-dev-migration-list.txt)。

## 本轮 fresh 验证

- 发布编排事务/开发门禁测试：17 pass，265 assertions；另直接提取实际 DEV workflow 的 scanner/renderer，对本条 migration 离线渲染，history sentinel 恰在最终 COMMIT 前，退出0。
- runner TypeScript 最小静态检查退出0后，material-workflow、transfer-workflow、stocktake-workflow、adjustment-contract/workflow/security/concurrency 共7组 SQL 夹具通过，含7组真实并发及串行/超时负控。仅在本地 schema-only、network none 的隔离PG17容器执行，不写源库；不能替代全量历史/真实业务验收。
- Domain build 和25 tests/284 assertions通过；API 类型检查、构建（979 modules/5.12MB）、52 tests/555 assertions通过。
- Admin 类型检查、52 tests/321 assertions通过；API/Admin 文件大小检查通过。
- 未做本轮 Chrome 业务验收，也未把单元测试当成 E2E。

## 开发发布跟踪

[Release Dev 34365480455](https://github.com/LeeFo-china/goose/actions/runs/34365480455) 于 2026-09-09T14:50:20Z completed/success，同一固定 SHA，service=api,admin，operation=release。沿用现有编排构建所需镜像，实际仅部署 API/Admin；构建、迁移、API先行、Admin及最终摘要门禁全部通过。

独立 SSH inspect：两容器均 running/healthy，revision 均 b6d8e06696df4cdfc71ec162ac230913662683e3，run_id 均34365480455。API镜像digest为78765381e18c4b78a42adaee200bf50efd443779b447a211452c642829991438，Admin为9198d913e7dc7c70b5f94648e88da42098ff544bfdb4e091c069042d1f53a847。

发布后 HTTP：Admin登录200、API根200；未认证盘点列表和库存流水列表均401/TOKEN_MISSING。14:51:01Z 再次READ ONLY对账，17类业务/授权摘要及全租户旧设置hash与preapply一致，晴天version24、新flag=false，启用租户和调整角色授权均0。结构化证据见[发布与最终对账](2026-09-09-warehouse-adjustment-dev-release.json)。没有触发真实业务写入。

收尾仅把本次SQL/JSON/CLI表和状态记录提交至原feature，不移动上述发布分支、不合并main、不建PR、不清理worktree。下一批仍为分页读取、HTTP命令、库存来源及开关配置接入，然后才安排Admin与真实验收。

知识库查询返回502，本轮以仓库和实时证据为准，未同步 RAG 或上传备份/凭据。
