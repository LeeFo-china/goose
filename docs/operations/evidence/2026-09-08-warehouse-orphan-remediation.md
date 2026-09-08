# 孤儿仓库修复实施与 apply 前检查点

2026-09-08 14:41（Asia/Shanghai）。用户确认实施此前方案。本轮完成本地代码、migration、验证和只读清单；按计划在精确文件／hash 的开发库 apply 确认点暂停。**未删除真实数据、未应用任何远端 migration、未部署或启用阶段 C、未修改 Orange。**

## 固定成果

- 修复提交：`80bb606b04d9de9a2f68943a2250e6aaf333adb9`，分支 `feature/warehouse-project-material-stage-c`；未 push／合并。
- 生产代码改动仅 fixture 13 行：恢复 origin 后删除精确的未修改默认仓库，再删除员工／用户／租户；残留计数加入两租户仓库及仓库命令。原有库存／命令事实不删除，外键拒绝时整笔 cleanup 回滚。
- 通过 `supabase migration new repair_reviewed_orphan_warehouses` 生成 `20260908062915_repair_reviewed_orphan_warehouses.sql`。
- migration SHA-256：`8c0eb82591219a06e0d4572af78007b690082412fe274c12b888f22e7d5c666b`。
- 目标仍仅 WH-000004、WH-000024、WH-000026、WH-000032；[精确 ID／原行 hash](2026-09-08-warehouse-orphan-root-cause.json)未变。开发库只读 SELECT 重验完整 4 行、UTC hash 和审计表列／约束可用性；没有查询或复制真实用户／密码数据。

## 新鲜验证

1. 清理源码 TDD：原实现 0 pass／4 fail，加入最小修复后转绿。
2. 根代理重跑 5 个相关文件：69 pass／0 fail、272 assertions；`bun run check` 完整通过（类型、API 构建、文件大小）。
3. `node scripts/verify-reviewed-orphan-repair.mjs`：初始空 migration 按预期失败于 `REPAIR_MUST_DELETE_FOUR_AND_AUDIT_FOUR`；实现后通过。使用仓库真实 warehouses／audit DDL、最小合成父表及九个实际 FK 形状，network=none 临时容器，不挂载源数据库。
4. SQL 拒绝／回滚覆盖：1–3 个目标、目标 hash 改变、租户或任意租户下员工重现、九表分别引用目标、新孤儿、新外键、新无约束列、关闭触发器、未验证 FK、replica 会话、第二条审计故意失败。九表各有一条正常仓库引用，修复后保留；完整 before 快照一致；无目标重放不再写审计。
5. 完整 SQL 文件在 Asia/Shanghai 会话执行通过（文件内固定 UTC）；随后重新建立租户／员工外键通过。合成历史状态在修复前新增员工 FK 按预期失败。
6. 根代理重跑真实 Bun gateway 集成：本机 schema-only 快照 527 个历史版本，补齐 42 条截至 `20260908010000` 的采购领域 migration。真实默认仓库 trigger、正常／重复 cleanup、改名／版本／库存／命令／另一租户拒绝及全事务快照回滚、两种部分 seed 清理、实际 Direct gateway 场景及新连接残留核对全部通过。
7. 同一完整 schema 容器执行实际修复 migration：4 条精确归档删除，所有其他仓库整行快照与九表记录数保持不变；已有库存／命令合成事实非空。审计 before 与四条原始快照一致；新增员工 FK 验证通过。
8. 两个任务分别经过独立规格审查、再独立质量审查，均 PASS；没有遗留 Critical／Important。`git diff --check` 通过，临时验证容器均自动清除。

真实 gateway runner 需要宿主机 Bun 连接，因此使用随机 host-loopback-only TCP 端口、合成 SCRAM 密码及容器自生根密钥；源库只有只读 schema dump，没有业务数据／真实凭据／真实根密钥进入容器。schema-only 使用 no-owner／no-privileges，**此验证不等于真实开发库全 schema 数据、角色、ownership、ACL、Vault 备份恢复通过**。

复跑命令：

```sh
# 仓库根目录，最小真实 DDL SQL 回归
node scripts/verify-reviewed-orphan-repair.mjs
# apps/api 目录，类型通过后运行真实 gateway 和完整 schema 联动
bun run check
bun --env-file=/dev/null ../../scripts/verify-supplier-sku-cleanup-database.ts
```

本地 harness 启动诊断已解决：Bun 必须从 API 目录解析 alias；权限边界动态 import 前设为合成 Supabase 端点；Vault 需要可写的隔离 tmpfs 生成临时根密钥；临时 PG HBA 使用受密码保护的 TCP，宿主只绑定 loopback。这些仅为隔离测试配置，未修改真实 DB／服务配置。

## 独立迁移清单

2026-09-08T06:40:59.799Z，已只读核对远端 `main` 与本地均为 `ad22e9e7f73833e01986654ae73b4a2ea925734a`。以其 594 条 migrations 导出本地暂存目录 `/tmp/gooes-reviewed-orphan-candidate.8C80wL`，加入上述同 hash 修复文件；未创建／切换新 worktree、未改 main。此目录是**migration-only 预检暂存**，不是已合并／部署的完整代码候选。

使用既有开发目标及直连守卫，固定 `api-dev.goodcms.cn:5432/postgres`、配置 ref `fclnkyatvfvmzgzdqlba`，排除生产 host／ref；凭据仅在进程内使用，未写入文件或日志。Supabase CLI 2.99.0 `migration list` exit 0：

- Local 595、Remote 594、Remote-only 0。
- 唯一待执行：`20260908062915`；不含原 4 条阶段 C migrations。
- [完整 595 行 Local／Remote 及脱敏预检元数据](2026-09-08-warehouse-orphan-repair-migration-preflight.json)。

当前 C 开发分支本身含 599 条 migrations，**禁止直接从该分支执行全量 db push 来代替上述修复候选**。接下来仍需从已部署基线准备含修复提交、排除 C 的不可变发布候选，重新确认当前完整清单；仅凭暂存目录不自动部署 API 或覆盖旧 smoke 脚本。

## apply、回退及剩余门禁

最终确认清单：仅开发库、仅上述文件／hash；原子审计归档后删除固定 4 行，保留 WH-000001 及全部事实。执行前再次检查目标 hash、父记录、引用、migration 差集，并生成当时的新备份；旧失败归档 `/var/tmp/gooes-stage-c-dev-backup.0ziWKo5I` 原样保留，不能把它标为恢复成功。

删除前全行将保存在 `platform_audit_logs.metadata.before`；同时保留应用前备份。不能直接逆向插回失效外键记录；需要恢复时必须先评审原父租户／员工恢复，再用独立前向 migration，绝不关闭约束。

获准 apply 后：仅用 migration 工具执行；随后完整 migration list 对齐，孤儿 0／审计新增 4／正常仓库与九表事实不变；生成纠正后全 schema、角色、Vault 根密钥备份，完整 pg_restore 保留 ownership／ACL／post-data，并按新同快照清单逐表对账。此轮没有执行这些远端步骤，备份恢复门禁仍未解除。

修复编号晚于原 C 四条；后续 C 候选必须纳入已应用修复记录，重算完整差集并评审较早未执行版本的处理方式（如 include-all），不能重编号或 repair 历史。本轮不批准 C apply／部署／租户开关／真实领退料。
