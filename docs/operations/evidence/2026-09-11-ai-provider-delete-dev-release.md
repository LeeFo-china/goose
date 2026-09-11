# AI 供应商受限删除 DEV 发布

状态：开发 migration 与固定版本 API/Admin 发布均成功，独立版本、健康及未认证接口检查通过。

## 范围与版本

用户授权“先 migration，在开发发布”。仅操作开发服务器 `VM-0-11-ubuntu`（`43.165.126.30`）及对应开发工作流，不操作生产、Orange、main，不读取/录入真实模型密钥，不调用模型，不删除真实供应商。

- 功能分支 `feature/customer-rendering-library` 保留，发布源码 HEAD：`ffd51452debdc391c9138aa85729f0bb5e8e0485`。
- 新发布分支：`release/ai-provider-delete-dev-20260911`。
- 固定发布 SHA：`372c980b5d44f3d48d53ac1173f2e2213ad832bf`。
- 父提交：此前已发布且实时核对的 `1384562fb465f930f6d00459431ea483aab455de`。
- 发布与功能 HEAD 的 tree 均为 `27a899224948f19a837f4457fdd49a2ec120e95b`，完整树差异为零。
- 延续上轮发布快照方式，保留旧功能历史与上轮发布分支，排除旧祖先中的合成凭据夹具；没有绕过 GitHub 保护、force push 或改写共享历史。

## 发布前验证

- API 聚焦测试：69 pass / 309 assertions；Admin 聚焦测试：102 pass / 580 assertions。
- API typecheck、build（983 modules / 5.14 MB），Admin check（文件大小、Next typegen、TypeScript），`git diff --check` 均通过。
- Chromium mock E2E：11 passed / 31.5s，包含删除确认/取消、并发保存禁用、版本/关联冲突、只读、窄屏、末页回退、删除成功后刷新失败及既有密钥交互回归。不将 mock 验证等同于开发登录态操作。
- 在开发数据库容器内使用独立临时 PostgreSQL cluster 执行 `supabase/tests/ai_provider_restricted_delete.sql`，实际导入本次 migration，全部断言通过。cluster 只监听专用 Unix socket `/tmp/gooes-provider-delete-pg.iHoIeI`、端口 6543，data directory 为其 `data` 子目录，与应用 PostgreSQL 数据目录隔离；测试连接显式指定 socket/port/user/database。
- 两种真实双会话并发验证通过：先插入模型、未提交时删除供应商，最终 DELETE 返回 23503 且双方数据保留；先删除供应商、未提交时插入模型，最终 INSERT 返回 23503，无孤儿模型。临时 cluster 已正常停止，未将 fixture 导入应用数据库。

## 迁移与备份

唯一待执行文件：`20260911140000_restrict_ai_provider_model_delete.sql`，SHA-256：`8d6b3f33a6add9283ab6c8292caa5fc96faa1d3c8dd99ee7369eff67618a6858`。

应用前独立预检：Local 615、Remote 614，remote-only 为零，pending 精确为该 migration；现有供应商/模型/目录批次/目录条目数量为 `5 / 2 / 2 / 948`，无超过 30 秒事务，API/Admin healthy，版本仍为上一轮 SHA。磁盘剩余约 6 GB，使用率 90%。

备份：`/tmp/gooes-provider-delete-preapply.I5SJzT/database.dump`，8,364,111 bytes，SHA-256：`81dfdf1a88b24662ee763399fefad164c8e628e11fa0e191fbb9522eb0bfeaf2`。目录 700、归档 600，保留在开发服务器。使用数据库容器 PG17 的 `pg_dump` 与 `pg_restore` 完成归档目录检查（5991 行）及全归档解码到 `/dev/null`，均退出 0；覆盖 public 与 supabase_migrations，不包含 auth/storage/角色/Vault，不是全实例灾备或恢复演练。

- [DEV plan 34606543396](https://github.com/LeeFo-china/goose/actions/runs/34606543396)：success，614→614，pending 1、applied 0。
- [DEV apply 34606672252](https://github.com/LeeFo-china/goose/actions/runs/34606672252)：success，614→615，applied 精确 `20260911140000`，最新版本为该 migration。
- 两次工作流均绑定本次固定发布 SHA；DDL 与 migration history 在工作流的同一迁移事务中提交，没有手动 DDL/DML 修库或 history repair。
- 应用后独立 READ ONLY 查询确认三种 provider 外键均为 `confdeltype=r`、`convalidated=true`；上述四种记录数量保持 `5 / 2 / 2 / 948`。
- 发布应用前，运行 `pnpm dlx supabase@2.99.0 migration list`，并以仓库 verifier 对全部 615 条 Local/Remote 与目标 `20260911140000` 严格校验，均通过；下载后的证据再次在本地校验通过。输出见 [migration list](2026-09-11-ai-provider-delete-dev-migration-list.txt)，仅规范化 CLI 行尾空白和文件末尾空行，未修改记录内容，规范化后重新校验通过。
- 首次临时文件传输附带 macOS AppleDouble `._*` 元数据，导致 verifier 拒绝文件名；仅移除本次临时验证目录中的 618 个传输元数据副本后重新运行检查通过，没有修改真实 migration 文件、应用数据库或发布快照。

回退策略：回退应用/关闭 DELETE 入口，保留 RESTRICT，不恢复 CASCADE。若需要数据库修正，另建审核后的 migration，不手动修库，不删除数据或修复历史。

## 应用发布

[Release Dev 34606958937](https://github.com/LeeFo-china/goose/actions/runs/34606958937)：2026-09-11T14:01:09Z completed/success。请求服务仅 `api,admin`，`operation=release`；下载的 dev-build-plan 确认 build_services/deploy_services 均仅含这两个服务，其他 matrix 项跳过实际构建，生产校验任务 skipped。

工作流再次执行 `supabase migration list` 与仓库完整集合校验。下载的 `auto-predeploy-migration-372c980b5d44f3d48d53ac1173f2e2213ad832bf` artifact 确认 development、精确发布 SHA、`migration_history_aligned=true`、`target_migration_present=true`，并通过本地 evidence verifier。工作流门禁目标仍为既有 `20260711120000`，本次新增版本由前述独立 615 条完整校验与部署后 READ ONLY 查询确认。

独立 SSH inspect：API/Admin 均 running/healthy，revision 均为 `372c980b5d44f3d48d53ac1173f2e2213ad832bf`，run label 均为 `34606958937`。以下 Config.Image 不可变 digest 与分别下载的 image-manifest artifact 完全一致：

| 服务 | 镜像仓库 | SHA-256 digest |
| --- | --- | --- |
| API | `useccr.ccs.tencentyun.com/america_goose/goose-api` | `af6d5d7c6bdcc1cecada2423ae20508f41f73c8d63b53ebb6987795f179de305` |
| Admin | `useccr.ccs.tencentyun.com/america_goose/goose-admin` | `fe7c663ad1dbea0c77acca9fe9f9ddb76e569af2e5be4354a4f96c3031797e66` |

部署后独立 HTTP：API 根和 Admin 登录页均 200；新 DELETE 接口及 Admin backend proxy 的无登录请求均为 401/TOKEN_MISSING。使用 `not-a-provider` 非 UUID 目标和显式版本，即使鉴权异常也无法匹配实际供应商，不进行真实删除。

工作流内置的服务健康与租户登录态 project-health smoke 均通过；不把它计为超管供应商真实删除验收。删除 UI 的确认、冲突与权限行为由本轮 11 项 mock E2E 覆盖；尚未用开发超管登录态执行真实供应商删除。

最终 READ ONLY 查询：migration 仍 615 条、最新 `20260911140000`，三种 provider FK 均 validated RESTRICT，供应商/模型/目录批次/目录条目数量仍为 `5 / 2 / 2 / 948`。发布后磁盘剩余约 5.7 GB（90%）；没有执行额外磁盘清理。开发备份与停止的临时测试 cluster 保留，原功能分支及两次固定发布分支保留；仅将执行记录回写功能分支，不移动发布分支或合并 main。
