# 开发库孤儿仓库修复应用与完整恢复验收

2026-09-08，约 14:49–15:02（Asia/Shanghai）。用户确认对精确清单执行开发 apply、4 行审计归档删除和备份恢复。本轮已完成这些动作，**没有应用阶段 C、修改生产／Orange、推送代码、部署或启用租户开关**。

## 结果

- 唯一执行 migration：`20260908062915_repair_reviewed_orphan_warehouses.sql`。
- SHA-256：`8c0eb82591219a06e0d4572af78007b690082412fe274c12b888f22e7d5c666b`。
- 专用修复分支 `fix/warehouse-orphan-remediation`，不可变应用候选 `af3c37f30a9dbee97fa4def70c5ad270d0ebaed8`：从已核对 main `ad22e9e7f73833e01986654ae73b4a2ea925734a` 仅 cherry-pick 修复提交。使用原隔离 worktree，没有修改 main；阶段 C 原分支完整保留。
- Supabase CLI 2.99.0 dry-run 只列此文件，随后 db push exit 0；应用后 `migration list` Local 595／Remote 595 全量一致。
- 仅删除 WH-000004、WH-000024、WH-000026、WH-000032，原行完整快照已原子写入 4 条 `platform_audit_logs`；快照 hash 与事前白名单一致，审计没有引用已不存在的租户／员工。
- 孤儿数 4 → 0；保留 WH-000001，整行 MD5 仍为 `e4d4603c47cdd509b4ee01a4e9916588`；9 张业务关联表的记录数及有序全行摘要全部不变，目标引用均为 0。
- 修复后真实开发库备份完整恢复成功，325 张表与同快照清单逐表数量一致，保留 ownership／ACL／post-data／外键，不曾跳过失败对象。
- 临时恢复／探针容器全部移除，真实 supabase-db、API、Admin 均 healthy。

[完整脱敏元数据、两份 595 行迁移历史、前后状态及备份 hash](2026-09-08-warehouse-orphan-dev-apply.json)。

## 应用前证据与执行边界

开发目标固定 `gooes-dev` → `VM-0-11-ubuntu`；直连 `api-dev.goodcms.cn:5432/postgres`，配置 ref `fclnkyatvfvmzgzdqlba`。使用仓库既有开发及直连目标守卫，拒绝生产 host／ref；凭据只在进程内使用，未写入日志或本地文件。原 4 行 hash、父租户／员工缺失、外键验证／启用、九表无目标引用均重新核对。采样时无长事务或锁等待。

修复分支重新通过 69 项测试、API check、最小 SQL 回归以及完整 schema 的真实 Bun seed／cleanup／gateway 回归。文件与已审查提交内容一致，没有为应用修改 migration。

14:55:19 CLI 应用完成；14:55:22 migration list 全量对齐；14:55:56 只读数据核对通过。未在远端手工执行 DDL／DML 修库，真实变更只来自版本化 migration。

## 应用前后备份

两份备份均仅保留在开发机；目录 0700，归档／角色／清单／日志 0600，Vault 根密钥 0600、uid/gid 100:101。没有传出开发机或放入 Git；旧失败归档 `/var/tmp/gooes-stage-c-dev-backup.0ziWKo5I` 原样保留。

| 项目 | 应用前 | 应用后 |
| --- | --- | --- |
| 目录 | `/var/tmp/gooes-orphan-preapply-backup.GtsjTFgk` | `/var/tmp/gooes-orphan-postapply-backup.f8aNydta` |
| 完成 UTC | 06:52:13 | 06:55:58 |
| 同快照 migration／仓库数 | 594／5 | 595／1 |
| 数据库归档 bytes | 8,444,822 | 8,447,768 |
| 清单表数 | 325 | 325 |

每份 `database.dump` 与 `source-counts.jsonl` 来自同一导出的 REPEATABLE READ、READ ONLY 快照；pg_dump 全 schema custom format，另行 pg_dumpall --roles-only，并备份源 Vault 根密钥、核对一致性。角色和外部密钥不是数据库快照的原子组成部分，本轮没有修改它们。

应用后归档 SHA-256：`d797c256f15096411260afcfde5700af81b73ebb7236f10c14fe9d696e0b9c45`。恢复后再次核验归档、角色、两份计数清单 hash 均一致。磁盘剩余 4,123,738,112 bytes（94% 已用），没有擅自删除其他镜像、日志或备份。

## 完整恢复与修正的环境问题

复用源数据库已安装镜像 `supabase/postgres:17.6.1.136`／image ID `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`。独立容器 network=none、无端口、根文件系统只读、PGDATA 512 MiB tmpfs、1 CPU、1 GiB 内存且无额外 swap、128 PID 上限；不挂载源 PGDATA，仅将备份根密钥只读挂载。pg_net worker 指向未恢复的 template1，不处理恢复库 HTTP 队列。

首次恢复：角色成功，数据库失败于 customers.name 的 varchar(50)。根因不是客户数据超长，而是临时 `initdb --no-locale` 未指定编码，默认 SQL_ASCII，中文按字节计数。只读核对源库 UTF8、最长姓名 49 字符／63 字节、超过 50 字符为 0；合成 20 个中文字符在同配置探针中被计为 60，varchar(50) 失败已复现。未打印客户姓名，也未修改客户记录或字段。

重建临时实例时匹配源配置：`--encoding=UTF8 --locale=en_US.UTF-8 --locale-provider=icu --icu-locale=en-US`，运行前断言编码、provider、LC_COLLATE、LC_CTYPE、ICU locale 和 collation version `153.121` 全部一致。bootstrap 用户保持 `supabase_admin`／OID 10。恢复角色只过滤恰好一条已由 initdb 执行的 `CREATE ROLE supabase_admin;`，其他 ALTER／GRANT／grantor 不改，原 roles.sql 不改。

最终执行 `psql --single-transaction --set ON_ERROR_STOP=1` 恢复角色 exit 0；`pg_restore --exit-on-error --single-transaction` 恢复数据库 exit 0，没有 no-owner、no-privileges、禁用 trigger 或省略 post-data。15:01:14 完成 325 张表计数对账（差异 0），恢复库 migration 595、warehouse 1、修复审计 4。Vault 表为 0 行，根密钥已包含且匹配，但没有非空密文可证明实际解密场景。

第一次失败日志和最终成功日志均保留在应用后备份目录（restore-database.log／restore-database-v2.log 等）。最终包装脚本在恢复和对账成功后，即刻检查 Docker --rm 容器时遇到异步移除窗口，整体 exit 1；随后独立只读检查 exit 0，确认两个恢复实例及编码探针均不存在。这个包装退出码没有被冒充为全流程 exit 0；成功依据是独立角色／数据库恢复退出码、325 表对账和后续清理核验。

## 回退和剩余事项

删除的 4 条可从应用前归档或审计 `metadata.before` 找回原始内容，但不能直接逆向插回缺失父实体的孤儿。若需恢复，必须先评审原租户／员工恢复方案，再用独立前向 migration；禁止关闭外键。应用前／后与旧失败归档均保留。

本次通过的是此开发 PostgreSQL 数据库及角色／根密钥的备份恢复验证，不是 COS／Storage 对象、服务环境配置、WAL／PITR 或全实例灾备验收。

清理代码已在修复候选中，**尚未 push／合并到 main 或部署；继续执行旧分支的有缺陷 smoke 仍可能再次产生孤儿**。后续应发布单独清理修复，不能顺带发布 C。阶段 C 的 4 条原 migration 仍未应用；修复新编号已在远端，后续需按完整差集评审较早 C 编号的 include-all 执行方式，不重编号、不 repair 历史。
