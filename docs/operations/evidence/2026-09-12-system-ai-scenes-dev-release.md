# 系统 AI 场景与模型选择 DEV 发布

状态：开发 migration 与 API/Admin 发布成功，独立部署核验通过；真实超管登录态页面验收尚未完成。

## 授权范围与固定版本

用户确认执行下一步 1–2：先开发库 migration，再发布开发 API/Admin 并验收。不操作生产、Orange、main，不修改或读取真实模型密钥，不调用收费模型，不删除真实供应商。

- 功能源码：`3983afdf5a08515f82654c760d7d4b1ed28062bf`，工作树发布前干净。
- 固定发布分支：`release/system-ai-scenes-dev-20260912`。
- 固定发布 SHA：`7ec16c8d92ef3612f5019ecda5f0454828e92b4b`。
- 父提交：实际部署中且与远端发布分支一致的 `372c980b5d44f3d48d53ac1173f2e2213ad832bf`。
- 发布与源码 tree 均为 `684d586aac9a0b61770f8313f3cc3d9c03e4e8aa`，完整差异为零。
- 保留功能分支历史和此前发布快照；新快照不包含旧受阻功能祖先，没有绕过扫描保护、force push 或改写共享历史。

## 迁移预检与备份

开发主机显式校验 `VM-0-11-ubuntu`（`43.165.126.30`）。API/Admin 当时均 healthy，revision 为旧发布 `372c980b…`。磁盘可用 5.7 GB、使用率 90%，没有超过 30 秒的活动事务。

独立对比全部版本：Local 616、Remote 615、remote-only 0；唯一 pending 为 `20260911151225_create_ai_system_scene_registry.sql`。SHA-256 为 `424b997d7b38a0178552c72043562e204753547c33c4849cf328472709004bed`，与此前隔离 PostgreSQL fixture 验证版本一致。

现有 10 个 route code/modality 与固定系统定义全部匹配；迁移前全行 JSON 聚合 MD5 为 `fbab9c3950d0d352ad05d67917b1affe`，供应商/模型数量为 `4 / 3`。

备份在开发服务器：`/tmp/gooes-system-scenes-preapply.vYodc4/database.dump`，8,364,410 bytes，SHA-256 `606027d8008f6e740b791b8205fc812ad36fd919b1decb412225c9e28fe84db5`，目录 700、文件 600。使用数据库容器 PG17 的 `pg_dump` 与 `pg_restore` 完成归档目录检查及全归档解码到 `/dev/null`，退出码均为 0。仅覆盖 public 与 supabase_migrations，不包括 auth/storage/角色/Vault，不是全实例灾备或恢复演练。

## 迁移执行与独立验证

- [DEV plan 34656120310](https://github.com/LeeFo-china/goose/actions/runs/34656120310)：success，615→615，pending 精确 `20260911151225`，applied 0。
- [DEV apply 34656274339](https://github.com/LeeFo-china/goose/actions/runs/34656274339)：success，615→616，applied 精确 `20260911151225`，latest 为该版本。
- 两次工作流均绑定固定发布 SHA。DDL 与 migration history 通过既有工作流原子提交，没有手动 DDL/DML 或 history repair。
- 应用后通过 `supabase@2.99.0 migration list` 和仓库 verifier 检查全部 616 条 Local/Remote 对齐，显式 target 为 `20260911151225`。证据下载到本地后再次验证通过，见 [migration list](2026-09-12-system-ai-scenes-dev-migration-list.txt)。仅规范化行尾空白与末尾空行，没有更改版本记录。
- 独立 CLI 首次在无 package.json 的临时目录选用了 Corepack 默认 pnpm 12，因忽略构建脚本策略退出；固定为 CI 使用的 pnpm 10.33.0 后验证通过，没有批准额外构建脚本或调整数据库。
- 验证源码使用 `git archive` 传输到 `/tmp/gooes-system-scenes-migration-check.uo3IsP`，没有 macOS AppleDouble 元数据副本。

应用后的 READ ONLY 检查通过：

- 注册表恰为 10 条 system，没有 legacy；原有路由仍 10 条且全行 digest 不变；供应商/模型仍 `4 / 3`。
- 复合外键 validated，UPDATE/DELETE 均 RESTRICT；两个 guard trigger 启用。
- RLS enabled + forced，除表 owner 外只有 service_role SELECT；anon/authenticated 无表授权，anon/authenticated/service_role 无 guard function EXECUTE。
- 无路由缺失注册身份或模态不一致；raw drawing 为 `not_connected`、输入 `{text,image}`、最少 2 张参考图。
- 旧 API/Admin 仍 healthy。

切换窗口不是完全零中断写兼容：迁移立即拒绝旧页面创建任意新场景或修改身份。已在操作前提示用户暂不编辑场景路由；未关闭整站或额外改动网关/权限。回退时回退应用、保留注册表与历史身份约束；数据库修正需另建审核 migration，不删数据或手工修库。

## 发布前新鲜验证

- API 扩展回归：85 pass / 419 assertions；API typecheck 通过。
- Admin 组件回归：30 pass / 171 assertions；Admin check（文件大小、Next typegen、TypeScript）通过。
- Chromium 本地 mock E2E：26 passed（1.0m），覆盖 15 项路由及 11 项既有密钥/删除交互，不等同于开发超管登录态验收。
- 独立审查确认 migration、固定快照与工作流边界可继续执行；迁移合同与发布编排测试通过。

## 应用发布与剩余验收

[Release Dev 34656502048](https://github.com/LeeFo-china/goose/actions/runs/34656502048) 请求 `service=api,admin`、`operation=release`，固定为本次发布 SHA，最终 completed / success。构建、迁移历史门禁、API 发布及 readiness、Admin 发布与最终 readiness 均成功。

下载的 dev-build-plan artifact 已确认 classifications、build_services、deploy_services 均精确为 `api,admin`；其他 matrix 名称不代表本次构建或部署了对应服务。

独立读取两个 image-manifest artifact，并与开发服务器容器 inspect 的受限元数据交叉核对：

- API 镜像 digest：`sha256:24d7dc818cb3e6f47911a4250c4b9a43dda482757549fb484f33b644dcc50753`。
- Admin 镜像 digest：`sha256:74a5cf8a725faafce9ef4d7975f05ae1b376240cd7a0690aad7856fb16b0f122`。
- 两个容器均为 running / healthy，revision 均为 `7ec16c8d92ef3612f5019ecda5f0454828e92b4b`，`com.goodcms.github.run_id` 均为 `34656502048`，Config.Image 为各自 manifest 对应的 repository@digest；未输出容器环境变量。
- 自动门禁 artifact 绑定本次 SHA、development，完整 migration history aligned 为 true。该工作流显式 target 仍为旧版本 `20260711120000`，本次新版本由上文独立 CLI 全量对齐证据和发布后数据库查询另行确认。
- 发布后 HTTP：API `/` 与 Admin `/login` 均为 200；API `/platform/ai-config/system-scenes?page=1&pageSize=20` 和 Admin `/api/backend/platform/ai-config/system-scenes?page=1&pageSize=20` 未认证请求均为 401 / `TOKEN_MISSING`。
- 发布后 READ ONLY 数据核验：616 条 migration、latest `20260911151225`；10 条路由且全行 MD5 仍为 `fbab9c3950d0d352ad05d67917b1affe`；`ai_system_scenes` 恰为 10 条 system；供应商/模型仍为 `4 / 3`；`decoration_raw_drawing` 仍为 `not_connected`。首次独立查询误用了 migration 文件名称推导的表名，查询报错退出；核对 migration 中实际表名后完整事务重跑通过，没有写入数据。
- 发布后磁盘可用 4.8 GB、使用率 92%；未擅自清理镜像、备份或其他服务文件，后续需单独安排容量维护。

浏览器连接两次初始化超时，未取得可用开发超管会话；不读取浏览器凭据、伪造登录身份或绕过鉴权。以下真实登录态检查尚未执行：

- 开发超管可进入 AI 模型页，鉴权后的系统场景 GET 成功。
- 十个中文系统场景正常显示，编码和模态只读。
- 生图场景显示未接通警告，不能新增或替换绑定。
- 既有路由、绑定和供应商正常显示，候选自动加载、搜索、分页正常。
- 有适用账号时验证只读权限行为。

未进行登录态路由写入、真实密钥录入、目录同步、供应商删除或模型调用。本地 26 项 mock E2E 与未认证接口 smoke 不能替代上述真实超管联调。
