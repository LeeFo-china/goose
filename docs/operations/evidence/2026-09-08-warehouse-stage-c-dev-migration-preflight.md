# 阶段 C 开发环境只读迁移预检

检查时间：2026-09-08 11:58（Asia/Shanghai）。用户确认开发环境只读预检，不包含 migration apply、部署、租户启用或真实业务写入。

## 结论

迁移历史预检通过：固定候选 `5585923ee22b25800a5e3808411f3dab44be9fb5` 共 598 条 migration，开发库已应用 594 条，最新 `20260908010000`。远端待应用恰好为阶段 C 的 4 条；远端独有版本为 0。数据库内完整历史与 CLI 的远端列逐条一致。

这不是 apply 许可，也不是完整发布门禁通过。没有运行工作流 plan、apply、部署、合并／推送或修改 Orange；没有执行数据库 DDL/DML。先前本地副本的 71 条差集不适用于本开发库。

## 目标与完整证据

- SSH：仓库既有 `gooes-dev` 配置，远端 `VM-0-11-ubuntu`，账户 `ubuntu`。
- 连接：开发机既有 `/opt/gooes-dev/docker/.env.dev.db`，直连目标 `api-dev.goodcms.cn:5432/postgres`；仅在进程内使用凭据，证据不保存连接口令或密钥。
- 配置项目标识：`fclnkyatvfvmzgzdqlba`；通过仓库 `resolveProjectRef`、`validateDatabaseTarget`、`validateDirectMigrationHistoryTarget` 守卫，排除生产主机与生产项目。这是配置及目标核对，不把自托管 PostgreSQL 的元数据当作云项目 ID 证明。
- 使用本机已安装的 Supabase CLI 2.99.0，对显式开发 DB URL 执行 `supabase migration list`，退出 0。未 link 项目，未修改连接配置。
- [完整 Local / Remote 历史（598 行）](2026-09-08-warehouse-stage-c-dev-migration-history.txt)。
- [脱敏身份、差集及数据库内完整历史](2026-09-08-warehouse-stage-c-dev-migration-metadata.json)。

## 固定待执行文件

| 文件 | SHA-256 |
| --- | --- |
| `20260908015230_create_warehouse_project_material_commands.sql` | `819af66da060dd9a950f3c7c00fd7ab880a237b8f1a26d7b9789a912aadd42f0` |
| `20260908015649_warehouse_net_project_costs.sql` | `9ec3083f10eb20c689e8ea03089adc327dbbd3842bd8940d45185e9712e8ec5a` |
| `20260908020216_warehouse_material_rollout_command.sql` | `da40dce9ac76456a80bcce35db63f9dce196678fc84a5443ccbc1918e040fa74` |
| `20260908023924_read_warehouse_material_settings.sql` | `5e126226f9d7dd567f9537ee3f75f776b7f5ad44014d0466c4f7c58d4f66ff8b` |

全部位于 `supabase/migrations/`；hash 与发布准备记录一致。历史版本集合一致不等于已应用 SQL 内容未漂移，本轮未逐条核对远端历史 SQL 内容或现有函数定义。

## 数据库内只读交叉核对

最终查询使用显式 `BEGIN READ ONLY`，事务内设置 `statement_timeout=15s`、`lock_timeout=3s`，再 SELECT 系统目录／迁移历史并结束事务。返回 `transaction_read_only=on`，数据库 `postgres`，后端地址 `172.20.0.4:5432`。

- `inventory_transactions` 总占用 49,152 字节，目录估计行数 -1（未知）。
- `project_cost_events` 总占用 3,358,720 字节，目录估计行数 0；不能据此断言表无业务数据。
- 当时超过 5 分钟的其他事务：0；锁等待会话：0。仅代表采样时点，不保证未来迁移窗口无锁竞争。

客户端诊断记录：首次仅通过 `PGDATABASE` 传入连接串时，Ubuntu 的 `psql` 入口为 `pg_wrapper`，尝试本地 socket 并在连接阶段失败；核对入口源码和帮助后改为显式 `psql -d`，成功连接批准目标。随后发现此连接路径下 `PGOPTIONS` 并未使返回事务状态变为只读，因此最终改为显式只读事务并验证返回 `on`。此前成功查询也只包含 SELECT，无 DDL/DML；不据此声称启动参数已生效，也未修改服务端或连接配置。

## 下一步门禁

1. 审查这 4 条在真实开发库上的函数定义精确匹配、源约束／数据兼容；核实备份与恢复方法，确定迁移窗口。
2. 确认不可变发布候选及合并／推送授权，再运行既有开发工作流 `mode=plan` 交叉核对；本次没有触发 GitHub 工作流。
3. 用户另行确认清单和 apply 后才应用；应用前重新读取历史，应用后执行完整 `supabase migration list` 并验证 Local / Remote 对齐。
4. API／Admin 发布、测试租户和实际员工、开关启用及真实领退料验收另行确认。生产不在本次范围内。

完整发布及前向回退规则见 [发布准备记录](../2026-09-08-warehouse-stage-c-release-readiness.md)。
