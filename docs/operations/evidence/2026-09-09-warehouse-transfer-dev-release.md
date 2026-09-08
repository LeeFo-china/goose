# D1 数据库开发发布记录

目标仅 DEV：`fclnkyatvfvmzgzdqlba`，`ubuntu@43.165.126.30`，hostname 守卫 `VM-0-11-ubuntu`。没有操作生产、Orange、真实付款或创建调拨测试单据。

## 兼容修复及发布

根因：新增 false 设置列也会由旧 rollout RPC 的 `to_jsonb(v_setting)` 返回，两个 `.strict()` SettingsSchema 不识别该列，导致数据库成功后 API 解析失败。先增加明确的可选布尔字段（不放宽 unknown/type 校验，不提前 select 新列），在 601 migration 的桥接版本发布，再 apply。

- 补丁 `21f48c4f717a9ccc73e0f06dca7460509e33cdda`。回归先 RED（3 pass / 2 fail），后 GREEN（5 pass / 24 assertions）；独立复核通过。
- 桥接冻结分支 `release/warehouse-transfer-bridge-dev-20260909`，revision `9bb24cb99283a34fa1c8069e5b3d0c6a84a0caa8`。
- [桥接 API 发布 34285266848](https://github.com/LeeFo-china/goose/actions/runs/34285266848) 成功。实际 API 容器 healthy，revision 一致；此时 Admin 仍为旧 C 版本。

## Migration

- [Plan 34285363000](https://github.com/LeeFo-china/goose/actions/runs/34285363000)：601 条已存在，唯一 pending `20260908185501`。
- [Apply 34285850596](https://github.com/LeeFo-china/goose/actions/runs/34285850596)：同一冻结 revision `21f48c4f717a9ccc73e0f06dca7460509e33cdda`，applied_count=1，601 → 602。
- 文件 `20260908185501_warehouse_transfer_atomic_commands.sql` SHA-256：`f76535e321eea470aa835a0d7d8551ae678d434696f8ee0f17a3c7a8b73add00`，没有修改已应用 migration。
- 执行 `supabase migration list --db-url <已校验的 DEV URL>`，使用 `verify-migration-history.mjs` 验证完整 602 行：`migration_history_aligned=true`、`target_migration_present=true`。原始版本表见本目录 `2026-09-09-warehouse-transfer-d1-history.txt`；601 桥接历史单独保存。
- apply 前无新对象重名、无锁等待／长事务、旧库存来源无不兼容值。apply 后三表为空、全部开关 false、新增权限定义 2 个但实际员工／角色授权均 0。
- 三表均 ENABLE/FORCE RLS；五个公开 RPC 仅 service_role 可执行，anon/authenticated 不可执行。
- 十张业务表计数与 MD5 摘要前后完全一致，见 `2026-09-09-warehouse-transfer-business-facts.json`。摘要比较剔除本次新增的默认设置／空流水外键列，不包含新定义对象。

## 备份及恢复边界

开发主机保留 `/var/tmp/gooes-transfer-d1-preapply.JOVFWB`（目录私有，文件 600）：

- `database.dump` 8,562,838 bytes，SHA-256 `cbe642e055999e03119adb2971d09444930dfd21fa3d085e1c97a610cd57826c`。
- `roles.sql` 6,846 bytes，SHA-256 `d498f90439269a5e6bc8e5941a9c4d29c4c38018da85558d2ad1d7289058082a`。
- `pgsodium_root.key` 64 bytes，仅保留受限文件，未输出内容。

`pg_restore --list` 与全归档解码到 `/dev/null` 成功；这不是实际恢复演练。备份后根分区剩余约 3.14 GB（使用率 95%），没有自行清理旧镜像／备份。数据库异常采用前向 migration，不手工 DDL/DML 修复；业务纠错采用反向调拨。不能回退到不识别新设置列的旧 API。

## 正式开发发布及验证

- 冻结候选：`release/warehouse-transfer-d1-dev-20260909`，revision `21f48c4f717a9ccc73e0f06dca7460509e33cdda`。
- [API/Admin 发布 34286042954](https://github.com/LeeFo-china/goose/actions/runs/34286042954) completed/success，只选择 `api,admin`，其余服务 build steps 跳过，生产验证跳过。
- 实际 `gooes-api-dev` 与 `gooes-admin-dev` 均 healthy，revision 一致，`com.goodcms.github.run_id=34286042954`。
- API image ID `sha256:5734fb13a3a817177191e9cbf94b26f0b09c9cea580dec215bc96f22623880e4`。
- Admin image ID `sha256:dddc1b93344817162f665e25de61059f2fb87e4a025ea1cec2868ad0ce7c6a0d`。
- HTTP：API `/` 200，Admin `/login` 200，未认证库存列表 401。`/health` 为受保护路径，返回 401，不能称作公开健康检查 200。
- 发布前 API check（正式候选及桥接各一次）、Admin check、Admin 设置回归 6 pass / 31 assertions。
- 发布后再次查询：十张业务表摘要未变、602 条 migration、实际授权 0；根分区剩余 2,557,194,240 bytes（96% 使用率）。下一轮发布前需要独立检查磁盘容量并制定可回滚的清理方案，本次未删除任何备份或镜像。
- 隔离 PostgreSQL 17 的 C material 三组 + D1 transfer 五组 fixtures 全部通过，包含并发锁等待、原子回滚和分页执行计划。仅采购领域 schema/合成数据验证，不是全库数据或真实登录端到端验收。

## 下一批边界

本次发布不包含随后新增的调拨核心 API 实现。核心端点在 feature 单独提交；库存来源投影、开关写入和 Admin 尚需后续批次，因此调拨保持关闭。LightRAG 查询返回 502，本次依据仓库设计、SQL 与实测证据。
