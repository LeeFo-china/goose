# 装修素材库与 AI 密钥管理 DEV 发布

状态：开发迁移及 API/Admin 固定版本发布均已成功；真实密钥与模型调用尚未验收。

## 范围与版本

用户确认执行开发发布。仅操作开发环境 `VM-0-11-ubuntu`，不操作生产、Orange、main，不填写真实密钥、不调用收费模型。

- 功能分支保留：`feature/customer-rendering-library`，发布前 HEAD `4d81a6bdcbf72c59d7ed5c68db355a4fd9afb564`。
- 发布分支：`release/customer-rendering-dev-20260911`。
- 固定发布 SHA：`1384562fb465f930f6d00459431ea483aab455de`。
- 发布父提交：远端 main `b1d468a1d5268c968e65a747e90ca0294d1cd1de`，创建前实时核对。
- 发布与功能 HEAD 的 tree 均为 `225b785a6493021f5cce6445c6af15e2503996f4`，完整树差异为零。

旧功能祖先包含被 GitHub 扫描拦截的完整合成凭据夹具。源码已改为片段构造的明确负例，本次保留原历史，创建同树独立发布快照，排除该祖先；未绕过保护、未 force push。新发布分支已成功推送。

本次交付租户私有素材草稿/隐藏管理、私有上传与短时预览、方舟适配基础，以及超管安全密钥录入。不是客户公开效果库或生图任务上线；小程序、额度规则、真实模型联调仍在后续范围。

## 迁移与备份

实时预检：远端 612 条、本地 614 条，remote-only 为零，待执行仅以下两条：

| Migration | SHA-256 |
| --- | --- |
| `20260911053027_add_ark_api_key_setting.sql` | `b3ab1c2f0420086f01cce604acce4b19f8341772b18a69087025980f428b1c86` |
| `20260911054819_create_tenant_rendering_library.sql` | `2d0f0eb047d3772bde2c84f6225339f0d474779d1e7a8ef1783808b8c3c2dd93` |

预检新表和新复合索引均不存在，文件表 1,224 行、1,449,984 bytes；无超过 30 秒事务。开发磁盘剩余 6.1GB，使用率 90%。API/Admin 均 healthy，旧 revision 为上述 main SHA、run label 为 `34560484748`。

备份路径：`/tmp/gooes-rendering-preapply.tpGLpbJj/database.dump`，8,354,099 bytes，SHA-256 `56efa9c6cefa29917e7f15ee842fc647ed0b1bb29d54e2fb1ce9609c08c67c9d`。目录权限 700、归档 600，保留在开发服务器，不进入 Git。使用数据库容器内 PG17 工具完成 pg_dump、5974 行归档目录检查和全归档解码到 `/dev/null`，均退出 0。这不是恢复演练，仅覆盖 public 与 supabase_migrations，不含 auth/storage/角色/Vault，不能作为全实例灾备。

- [DEV plan 34602526113](https://github.com/LeeFo-china/goose/actions/runs/34602526113)：success，612→612，pending 精确两条，applied 0。
- [DEV apply 34602594470](https://github.com/LeeFo-china/goose/actions/runs/34602594470)：success，612→614，applied 精确上述两条，latest `20260911054819`。
- 两次工作流均绑定固定发布 SHA；没有手动 DDL/DML 或 migration history repair。
- 应用后执行 `supabase/tests/tenant_rendering_library.sql`（纯 READ ONLY 断言）成功，验证复合租户外键、RLS、授权边界、五个索引与 updated_at trigger。
- 独立只读查询：素材行数 0、新权限 2、新角色授权 26（13 个现有租户 system_admin × 2）、ARK 平台配置 active/secret 且值为空。

回退策略：回退应用/关闭入口并保留新表、文件事实、密钥配置和审计；需要结构或权限修正时另建审核后的 migration，不删数据、不修历史。两条 migration 各自事务，不能声称跨文件原子提交。

## 本轮发布前验证

- 密钥 API 98 tests / 422 assertions、Admin 97 tests / 559 assertions，均 0 fail。
- 素材/方舟 API 105 tests / 887 assertions、素材 Admin 21 tests / 91 assertions，均 0 fail。
- API typecheck、build（983 modules / 5.14MB）、API 文件大小检查通过。
- Admin check（文件大小、Next typegen、TypeScript）通过。
- Chromium 密钥录入 mock E2E 4 passed / 21.3s，验证空白不写、引用先保存、独立录入、失败不自动重试、权限/只读/窄屏及系统设置兼容。此处不是远端真实密钥或模型联调。
- `git diff --check` 通过，建立发布快照前工作区干净。

## 部署与剩余验收

[Release Dev 34602675150](https://github.com/LeeFo-china/goose/actions/runs/34602675150)：2026-09-11T13:15:48Z completed/success，固定发布 SHA，`service=api,admin`、`operation=release`。既有依赖编排同时构建了其他镜像，但实际部署仅 API/Admin，没有部署其他服务。

工作流实际执行 `pnpm dlx supabase@2.99.0 migration list --db-url "$MIGRATION_HISTORY_DB_URL"`，随后用仓库 `verify-migration-history.mjs` 严格校验所有 614 条 Local/Remote 一致。`auto-predeploy-migration-1384562fb465f930f6d00459431ea483aab455de` artifact 确认 environment=development、固定 SHA、migration_history_aligned=true、target_migration_present=true。工作流门禁目标 `20260711120000` 保持既有值；完整集合校验和独立只读查询共同确认两条新 migration 已存在，最新为 `20260911054819`。

独立 SSH inspect：API/Admin 均 running/healthy，revision 均为固定发布 SHA，run label 均为 `34602675150`，Config.Image 使用以下不可变 digest，并与对应 image-manifest artifact 完全一致：

| 服务 | 镜像仓库 | SHA-256 digest |
| --- | --- | --- |
| API | `useccr.ccs.tencentyun.com/america_goose/goose-api` | `fb9e69e35c96a78097a3ae9f7c69dc253e49a0a26ee228b71e2c22a9526d9d15` |
| Admin | `useccr.ccs.tencentyun.com/america_goose/goose-admin` | `bf0c4c407865e67c8e51dc58146d33274898fa1065c39a257af718f3de82df03` |

部署后 HTTP：API 根及 Admin 登录页均 200；未认证 API 密钥元数据、素材分页列表均 401/TOKEN_MISSING，对应 Admin backend proxy 也均 401/TOKEN_MISSING 且 `Cache-Control: private, no-store`。直连 API 的未认证 401 未携带 Cache-Control，不将其记为已验证响应缓存头。本轮没有远端登录态业务写入验收。

最终独立 READ ONLY 查询：migration 仍 614 条、素材 0 行、角色授权 26、ARK 平台配置仍为空。部署后磁盘剩余 6.0GB（90%）；本轮未做额外磁盘清理。原功能分支和 worktree 保留，仅将本执行记录回写功能分支，不移动固定发布分支、不合并 main。

部署成功后仍需用户通过超管 AI 模型路由选择 `ARK_API_KEY` 并保存供应商，再在独立“配置密钥”弹窗填写真实 Key。若曾把真实 Key 放进供应商引用字段，应先在方舟轮换，再录入新 Key；不要把旧字段内容复制进配置。保存状态仅代表“已配置（未验证）”，不代表模型调用成功。
