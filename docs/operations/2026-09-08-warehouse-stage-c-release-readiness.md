# 阶段 C 发布准备与目标环境门禁

日期：2026-09-08。分支：`feature/warehouse-project-material-stage-c`。

后续更新（2026-09-08 11:58）：用户已选择开发环境并授权只读预检。目标身份核对通过，开发库 594 条／候选 598 条，差集恰好为下列 4 条 C migration，远端独有版本为 0；详见 [开发环境完整迁移预检](evidence/2026-09-08-warehouse-stage-c-dev-migration-preflight.md)。以下“本轮”保留原发布准备范围；工作流 plan、备份／数据兼容检查、apply 和部署仍未执行或获准。

## 本轮范围与结论

后续更新（2026-09-08 13:45）：[孤儿根因追查](evidence/2026-09-08-warehouse-orphan-root-cause.md)确认四条的父租户也不存在、9 张关联表引用为 0；本机复现 SKU smoke 清理遗漏默认仓库的问题，但未获得四次历史执行的逐笔归因。已形成[带审计和白名单的修复计划](../superpowers/plans/2026-09-08-warehouse-orphan-remediation.md)，未实施或删除真实数据，C 继续暂停。

后续更新（2026-09-08 13:27）：[新备份与隔离恢复演练](evidence/2026-09-08-warehouse-stage-c-dev-backup-restore.md)已执行。新归档包含当前 594 条历史，并补备角色及 Vault 根密钥；完整恢复因 4 个既有仓库的员工引用失效而失败，源库／归档交叉核对一致。备份恢复门禁保持 FAIL；临时容器已清理，未修数据、应用 C migration 或部署。

后续更新（2026-09-08 12:56）：[开发库兼容性与备份检查](evidence/2026-09-08-warehouse-stage-c-dev-compatibility.md)已完成。12 项函数精确匹配、既有来源约束及数据兼容检查通过；现有归档可完整读取，但只有 593 条历史、早于当前 594 条，且未验证实际恢复。开发机磁盘已用 94%。备份恢复门禁仍未通过，未 apply 或部署。

执行用户确认的“第 1 项发布准备”：核查 11 条路由审计缺口、合并前相关回归、核对新增 migration 并整理发布／回退步骤。没有合并、推送、创建发布标签、触发远端工作流、应用远端 migration、开启实际租户或写真实业务单据。Orange 未修改。

阶段 C 功能提交截止 `caa2697e`，原验收文档提交 `78391df4`；本轮审计修复提交 `5a83ed54`。此后若生产代码或 migration 有变化，必须重新核对相关证据。

**本地准备不等于获准发布。** 目标环境、测试租户、最终不可变发布提交和迁移完整差集尚未确认，因此目前不能执行远端 apply。推荐先在开发环境验收，再另行批准生产发布。

## 1. 路由门禁根因与修复

`tenant-service-route-inventory.test.ts` 先真实复现失败：`/douyin-mini/material-notes` 和 `/douyin-mini/my-material-notes` 共 7 个显式素材接口，以及 Fastify 自动注册的 4 个 HEAD 未登记于测试审计清单。

这不是缺少线上鉴权，也不是把接口改成公开访问：

- `plugins/auth/legacy-plugin.ts` 的实际 `onRequest` 验证 JWT 签名、有效期和专用 `douyin_miniapp` token 类型；普通员工 token 不可用于这些接口。
- 7 个 service 方法均调用 `material-note-context.ts`，核对 token subject 绑定、tenant／installation／AppID 一致性及启用状态。
- repository 的已领取查询及命令携带服务端派生的 tenant／installation／subject，不能由客户端 body 指定他人身份。
- 原有审计清单名称中的 `UNGUARDED` 仅表示没有员工租户服务访问元数据，**不表示绕过认证**。本次逐 method/path 精确登记，未扩大前缀匹配，未修改生产代码或生产认证白名单。

新增实际 controller＋实际 auth plugin 回归：11 条路由分别用缺失、普通员工、过期、伪造 token 访问，共 44 次请求均返回 401，且进入 `preHandler` 的次数为 0。原有 7 条合法小程序会话正向测试保留；租户与主体隔离另外由既有 context/service/repository 测试验证，不把认证拒绝测试当作真实数据库隔离验收。

独立规格／代码质量审查通过。原失败的完整路由清单测试已通过（1,646 个断言），这个已知基线门禁现已解除。

## 2. 合并前验证记录

- [x] 本次分支相对 `ad22e9e7` 的 API 测试及相关鉴权／素材回归，去重后 28 个文件，逐文件独立 Bun 进程运行，全部退出 0。
- [x] API `bun run check`：类型检查、构建及文件大小门禁通过。
- [x] Domain `bun run build` 通过。
- [x] Admin `bun run check && bun run build` 通过，97 页静态生成、构建追踪和 standalone 资源同步完成。
- [x] 隔离 PostgreSQL 契约／领退料／设置／开关兼容／安全／净成本夹具，以及 25 次真实 Fastify→PostgREST→SQL 请求通过。SQL 对账数量、价值、净成本恢复；新增恰好 3 条库存事实、3 条成本事实、7 条命令回执，没有新增应付。
- [x] 领退料浏览器完整回归 28/28 通过（桌面与 375px，1.8 分钟）。
- [x] 平台独立开关浏览器完整回归 16/16 通过（桌面与 375px，1.2 分钟）。

上述测试使用合成数据；真实 API 集成仅登录解析使用合成员工上下文，不能替代实际员工登录和线上订阅中间件验收。浏览器测试使用确定性 HTTP 夹具，不证明远端已过账。详细业务验收方法见 [C 本地交付证据](evidence/2026-09-08-warehouse-material-stage-c.md)。本轮不是仓库全部测试的全量运行。

本地 `main` 仍为 `ad22e9e7f73833e01986654ae73b4a2ea925734a`，也是本分支与本地 main 的 merge-base；没有在主工作区执行合并或改动现有 `.artifacts/`。此核对仅针对本地 Git 引用，未刷新远端引用，不能替代实际合并前的远端同步及 CI。

## 3. Migration 清单与来源边界

本分支相对 `ad22e9e7` 只新增以下 4 个文件，无既有 migration 修改：

| 顺序 | 文件（均在 `supabase/migrations/`） | 主要作用 |
| --- | --- | --- |
| 1 | `20260908015230_create_warehouse_project_material_commands.sql` | 领退料单据／明细／回执、独立 C 开关、库存／成本来源约束、原子命令和分页读取 |
| 2 | `20260908015649_warehouse_net_project_costs.sql` | 四个既有预算／风险函数按成本方向计算净额 |
| 3 | `20260908020216_warehouse_material_rollout_command.sql` | 开关 JSON 命令、旧请求省略字段及历史回执兼容 |
| 4 | `20260908023924_read_warehouse_material_settings.sql` | 仓库角色专用 C 开关读取，不要求供应商查看权限 |

SHA-256（按上述顺序）：

```text
819af66da060dd9a950f3c7c00fd7ab880a237b8f1a26d7b9789a912aadd42f0
9ec3083f10eb20c689e8ea03089adc327dbbd3842bd8940d45185e9712e8ec5a
da40dce9ac76456a80bcce35db63f9dce196678fc84a5443ccbc1918e040fa74
5e126226f9d7dd567f9537ee3f75f776b7f5ad44014d0466c4f7c58d4f66ff8b
```

本次只读查询本地 `supabase_db_gooes` 的 migration 历史：527 条，最新 `20260828160000`；仓库共有 598 个 migration，最新 `20260908023924`；相对该本地副本缺少 71 条，源历史没有仓库之外的版本。这 **71 条不是远端待执行清单**。既有隔离验证脚本只选仓储／采购领域 migration，故其通过也不证明完整 71 条历史及真实数据迁移可执行。

实际目标环境可能已应用 A/B 或其他迁移，也可能仍缺较早迁移；必须读取其完整历史，与同一不可变发布提交的全部 `supabase/migrations/` 求差集。禁止直接认定只需执行上述 4 条，禁止套用本地 71 条数量，禁止为通过发布跳过无关但未应用的迁移。

## 4. 获授权后的发布顺序

1. **确认目标及提交。** 开发环境候选为 `api-dev.goodcms.cn`；生产为 `api.goodcms.cn`。二者不同工作流、不同数据库，当前尚未选择。确认测试租户、执行人和不可变提交后再推送／创建候选；本文件不自动授权这些操作。
2. **完整历史与只读迁移 plan。** 先在固定发布提交下，显式指定获准目标执行只读 `supabase migration list` 并保存完整输出，计算仓库缺失／远端缺失的双向差集；有 remote-only 版本、历史缺口或文件身份不符时停止。再使用既有 `.github/workflows/migrate-dev-database.yml` 或 `migrate-production-database.yml` 的 `mode=plan`，交叉核对待执行版本、数量、runner、数据库身份和源提交。工作流虽内部读取历史，但其 `applied_versions` 只记录本次 apply 新执行的版本，plan 时为空，**不能把该字段当完整远端历史**。出现新的未审查版本时重新审查，不直接 apply。
3. **检查真实数据和锁风险。** 第一条 C migration 会修改 `project_cost_events` 和 `inventory_transactions` 的既有约束；确认表规模、源约束兼容、长事务和锁等待，选择窗口。第二、三条依赖现有函数签名及定义中的精确匹配；出现定义漂移须停下定位，不删除防御断言或手工修函数。
4. **备份与 apply 再确认。** 核实目标数据库备份及可恢复性、获准的完整文件清单和 hash，再使用对应工作流 `mode=apply` 及其目标确认参数。生产工作流有独立确认文本和备份步骤；不可拿开发确认替代生产授权。数据库结构、权限、索引及初始化数据仅通过 migration 管理。
5. **应用后核对。** 执行 `supabase migration list`（显式指定获准目标）检查 Local/Remote 全量对齐；用 `scripts/verify-migration-history.mjs` 校验同一提交的迁移集合及目标版本 `20260908023924`。同时核对 RPC 仅 service_role 可执行、私有 helper 权限、C 默认关闭和旧配置兼容。
6. **发布 API，再发布 Admin。** 只发布同一候选提交；新 API 在迁移前不可部署。核对健康、版本和历史读取后，由平台配置命令为已批准测试租户启用 `warehouse_materials_enabled`，保留 expected_version／幂等及审计，不通过 SQL 直接改配置。
7. **真实业务验收。** 实际员工登录→仓库采购审批／收货→领料→分次退料→付款，核对库存、项目净成本、应付及报表；追加越权、并发、关开关后历史读取和重放检查。小程序团队按 [接口契约](../miniprogram/2026-09-08-warehouse-material-stage-c-api-handoff.md) 联调；不由本任务修改 Orange。

本轮没有触发以上任何远端工作流，也未执行远端只读 migration plan；目标环境完整待执行清单仍是明确的发布前门禁。

## 5. 失败处理与回退

- **迁移失败：** 停止后续版本，检查失败事务和迁移历史是否一致，保留日志／备份，重新审查后以前向 migration 修复；不能盲目重跑或直接远端 DDL/DML 修库。
- **启用 C 前应用失败：** 保持 C 关闭，选用已验证与当前 schema 兼容的应用候选。切回旧镜像前仍需验证新增可空来源字段等读取兼容，不能只看“此前能启动”。
- **已产生领退料事实后：** 先用平台配置命令关闭 C 新写入，保留历史读取及已成功命令重放。不得回滚到不识别 `event_direction` 或仓库成本来源的 API，否则报表／预算可能把退料当新增成本。
- **库存／成本异常：** 不删除、覆盖库存或成本事实，不恢复无方向求和；经审查用前向 migration 或已定义的业务纠正流程处理。全库恢复是最后手段，必须另行批准并评估迁移后其他业务写入损失。

## 待确认事项

- [x] 开发环境及目标数据库身份（见上述后续只读预检；不包含生产）。
- [ ] 测试租户和实际验收员工。
- [ ] 合并／推送／最终发布提交授权。
- [ ] 目标环境完整 migration plan、真实数据／锁风险和备份结果。
- [ ] apply、部署及测试租户开关操作授权。

这些事项未确认前，发布保持停止；本地修复和准备可以交付，不以环境未知推断授权。

## 2026-09-08 14:41 孤儿仓库修复实施检查点

[修复实施证据](evidence/2026-09-08-warehouse-orphan-remediation.md)：提交 `80bb606b` 已完成 smoke 清理根因修复、精确审计删除 migration、69 项定向测试、API check、隔离 SQL 与真实 gateway／完整 schema 联动验证及独立两阶段评审。开发库只读复核目标 hash 未变。修复 migration-only 候选 CLI 清单 Local 595／Remote 594，唯一待执行 `20260908062915`，不含 C 四条。

尚未应用任何真实迁移、删除真实数据、部署修复或推送／合并；按计划等待精确清单的开发 apply 最终确认。新备份与完整 ownership／ACL／数据恢复及逐表核对尚未执行，C 发布门禁不因此解除。当前 C 分支 599 条 migration 不可直接作为此次修复 db push 清单。

## 2026-09-08 15:02 后实际修复与恢复检查点

用户确认后，专用候选 `af3c37f3` 的唯一修复 migration 已应用开发库，Local／Remote 595 条对齐；精确 4 条审计归档删除成功，正常仓库和九表事实不变。新备份完整恢复与 325 张表同快照逐表计数对账通过，临时容器已清除，真实服务健康。见 [实际应用与恢复证据](evidence/2026-09-08-warehouse-orphan-dev-apply.md)。这解除的是本次开发数据库备份恢复门禁，不是 C 全部发布门禁。

修复／验收已本地同步至 C 候选；最新 CLI 全量差集仍为 4 条原 C migrations（Local 599／Remote 595），修复版本已对齐。较早 C 编号的 include-all 执行方式须在 C 发布时另行审核。没有应用 C、push、main 合并、部署或启用开关；旧分支 smoke 在清理代码发布前仍可能复发。历史检查点保留，但不再代表当前等待修复 apply。
