# 阶段 C 开发库新备份与隔离恢复演练

日期：2026-09-08；执行区间约 13:14–13:27（Asia/Shanghai）。候选提交仍为 `5585923ee22b25800a5e3808411f3dab44be9fb5`。

## 结论与范围

**当前备份已生成并核对 hash；完整恢复演练失败，备份恢复门禁保持 FAIL，不可据此应用阶段 C。**

本轮按用户授权生成当前开发库备份，并在临时隔离实例尝试恢复。源数据库仅执行备份和只读查询；没有在源库恢复、应用 migration、修复数据、修改约束、启用租户或部署。真实开发库仍为 594 条 migration、最新 `20260908010000`；C 的 4 条没有应用。

恢复失败的直接原因已复现：源库 5 个仓库中，4 个的 created_by_employee_id／updated_by_employee_id 不能匹配同 tenant_id 的 employees；归档内有相同失效引用。源库该外键虽标记 validated，但数据不满足它，历史失效引用如何产生尚未定位。不得推断为本轮删除员工或给记录随意指定替代员工。

[脱敏结果 JSON](2026-09-08-warehouse-stage-c-dev-backup-restore.json)。

## 1. 新备份

保留目录：`/var/tmp/gooes-stage-c-dev-backup.0ziWKo5I`，目录 0700。数据库归档／角色 SQL／清单和日志 0600；密钥 0600、属主 100:101，仅供隔离容器只读挂载。未传出开发机、未纳入 Git；版本库仅保存脱敏检查记录。

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `database.dump` | 8,444,822 bytes | `c6b3945f575d42cfe079c199ceb83ce461f6dce375c3abffeb126e1ed09b591e` |
| `roles.sql` | 6,846 bytes | `6523e90693ff46892c14bc39f03668b3e0fc3444d710f1d9d384b18b55b48b4b` |
| `source-counts.txt` | 325 张表＋2 行检查元数据 | `d68fb442632af002190d064deeeadfcc0dd62e9a461c4a2af87e12882be41030` |
| `pgsodium_root.key` | 64 bytes | 与源容器一致；不在本文公开密钥内容 |

13:16:33 备份导出结束。使用源实例已安装的 PostgreSQL 17.6 工具，通过导出的 REPEATABLE READ、READ ONLY 快照 `0000003D-0000142F-1` 同时生成数据库 custom-format 归档和 325 张表的数量清单；源事务返回 read_only=on。pg_dump 锁等待上限 5 秒、进程上限 90 秒；结束后释放快照事务。

`database.dump` 没有限定 schema，覆盖该数据库的 public、auth、storage、supabase_migrations 等导出对象；角色单独由 pg_dumpall --roles-only 导出。快照清单中 migration=594、最新=20260908010000；employees=39、warehouses=5。角色定义和外部密钥不是数据库快照的原子组成部分，本轮没有变更它们。

这不是包含 COS／Storage 对象文件、服务配置、所有数据库和 WAL 的全实例灾备包；不能因为导出 exit 0 就宣称可恢复。原旧归档未删除。

## 2. 隔离与空间控制

复用源库已安装镜像 `supabase/postgres:17.6.1.136`，固定 image ID：

`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`

- 不拉取镜像；network=none，无 host 端口映射，PostgreSQL listen_addresses 为空。
- 根文件系统只读；1 CPU、1 GiB 内存、禁用额外 swap、128 PID 上限。
- 数据目录使用 512 MiB tmpfs；仅临时 socket、初始化日志可写；不挂载真实数据库数据目录。
- 所需 Vault 密钥从备份只读挂载；pg_net worker 指向未恢复的 template1，不运行恢复库里的 HTTP 队列；网络也被隔离。
- 可用磁盘从 4,168,630,272 bytes 变为 4,157,370,368 bytes；备份目录约 8.8 MiB。文件系统仍已用 94%，未擅自清理已有镜像、日志、备份。

## 3. 恢复尝试与根因记录

1. 首次初始化采用另一个 bootstrap 超级用户名。角色创建后，在 GRANTED BY supabase_admin 报权限错误；改为 supabase_admin 连接也仍失败。目录查询证实源库 OID 10 是 supabase_admin，临时库 OID 10 是另一个账户。这与 PostgreSQL 上游记录的不同 bootstrap 身份恢复问题一致，不能靠普通 SUPERUSER 标志替代。参见 [PostgreSQL 官方邮件讨论](https://www.postgresql.org/message-id/671134.1778008247@sss.pgh.pa.us)。
2. 重建临时实例，初始化用户改为 supabase_admin，保持 OID 10 身份一致。恢复角色时仅将归档里恰好 1 条 `CREATE ROLE supabase_admin;` 视为已由 initdb 完成，保留全部 ALTER ROLE、GRANT 和 grantor，不改原归档。角色恢复使用单事务和 ON_ERROR_STOP，最终 exit 0。
3. 首次数据库恢复报告 pg_net 未预加载；按源库实际安装参数配置加载。之后启动明确报告外部 Vault／pgsodium 密钥缺失，定位安装的 pgsodium_getkey 脚本及源密钥文件，将原密钥补备并只读挂载。没有生成替代密钥或关闭 Vault 校验。
4. 依赖齐备后的最终数据库恢复使用 `pg_restore --exit-on-error --single-transaction`，未禁用触发器、未省略 ownership／ACL／post-data。失败在 `warehouses_created_by_tenant_fkey`。失败后只读检查临时库，warehouse 表和 migration history 表均不存在，确认数据库恢复事务已回滚。不能把角色恢复成功称为数据库恢复成功。

上述临时实例分别命名 `gooes-stage-c-restore-0ziwko5i` 及其 -v2/-v3/-v4。每次重建前核验任务标签和隔离目标，只移除本任务临时实例；失败日志保留在备份目录。

## 4. 源库与备份交叉核对

| 检查 | 当前源库只读查询 | 从归档 COPY 流解析 |
| --- | --- | --- |
| employees | 39 | 39 |
| warehouses | 5 | 5 |
| 创建人找不到同租户员工 | 4 | 4 |
| 更新人找不到同租户员工 | 4 | 4 |
| 管理员找不到同租户员工 | 0 | 0 |

归档仅解析 warehouses／employees 的主键、tenant_id 和员工引用，在进程内计算数量；不输出账号、姓名、电话、UUID 或原始 COPY 内容。该结果确认失效引用已经存在于备份，不是恢复过程遗漏员工造成的。

源约束定义：`FOREIGN KEY (created_by_employee_id, tenant_id) REFERENCES employees(id, tenant_id) ON DELETE RESTRICT`；convalidated=true、非 deferrable。历史数据如何进入这一不一致状态仍需追溯，不能无证据认定某次导入、删除或同步是原因。

## 5. 清理、验证与下一步

13:26:57 已确认 4 个任务临时容器均不存在，tmpfs 中的临时数据库随容器移除；保留备份、密钥、源快照数量清单及全部失败日志，可以据此重建演练。开发 supabase-db、API、Admin 均仍 healthy。归档／角色／数量清单 hash 与导出时一致。

本轮没有进行“跳过外键后的成功恢复”，也没有完成 325 张表的恢复后全量对账；完整恢复已失败，该项不可标记通过。

下一步应追查这 4 个仓库的历史员工引用来源，并确认每条应关联的员工／租户及纠正方式；数据变更必须形成经过审查的 migration，不手工修库、不删除外键、不硬编码替代员工。修复及应用需要新的明确授权。修复后应重新生成备份并完整重跑恢复演练，而不是把本次失败归档改写成成功证据。

阶段 C 的 migration apply、不可变提交推送和部署仍未授权或执行。
