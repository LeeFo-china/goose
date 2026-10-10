# 项目沟通后端发布记录

## 范围与版本

- 代码：`18fac771252513ce323a6a3522e2f574e67db929`，tag `v2026.10.10.3`。
- 新增本项目当前客户与有权限员工的文字评论/回复；服务端自动内容检测，待审不进入列表。
- 独立 `project-comments` 表与 GET/POST；不迁移、不展示旧内部和混合评论；施工日志正文、照片及进度历史不变。
- 橙色小程序仓库只读参考，未修改。
- **生产部署完成**：API healthy、restart=0。部署时新能力默认关闭；23:25 用户确认客户端 .5 后已完成顺序切换，新能力开启、旧入口退休。最新状态见 `docs/miniprogram/2026-10-10-project-communication-client-v5-joint-acceptance.md`；下文默认关闭检查保留发布当时事实。

## 本地验证

- 12 个相关测试文件：72 pass、0 fail、321 assertions。
- API typecheck、build、文件大小检查、git diff --check 通过。
- 规格复审、代码质量复审通过，无剩余确认的 P1/P2。
- 隔离 SQL fixture 验证实际 migration、租户/作者/父记录约束、正文不可变、RLS/授权、43 项实时项目范围断言。
- 5,000 条评论分页使用索引；5,000 条项目/成员数据的单项目权限 RPC 有界查询。
- 单元/HTTP fixture 的审核结果为受控替身，不代表微信真实审核或真机验收。

## 数据库环境核查

本地旧测试容器的 PostgreSQL 17 / supautils 权限拒绝路径触发 SIGSEGV；独立最小函数即可复现，关闭本地 hint_roles 后返回正确 42501。未改业务 SQL 权限、未修改生产扩展配置，也未在生产复现崩溃。

生产只读核查：`supabase/postgres:15.8.1.085`，PostgreSQL 15.8 x86_64；shared_preload_libraries 不含 supautils，hint_roles 未配置。证据见 `evidence/2026-10-10-project-communication-release/database-runtime.txt`。本地镜像下载受阻后，使用生产主机已缓存的同一镜像 ID 启动临时容器：network=none、无宿主挂载、256MB 内存、0.5 CPU，仅 Unix socket。测试数据库名强制 `gooes_project_comments_test`，未连接生产库。执行真实 migration + 完整 SQL fixture 通过，结束后容器已删除。证据见 `pg15-isolated-fixture.txt`、`pg15-isolation-and-cleanup.txt`。

隔离容器采用新初始化数据库、未加载生产全部扩展，因此是同二进制/架构的 SQL 与权限兼容验证，不是生产全量数据/扩展配置克隆。首次 initdb 默认 SQL_ASCII 导致 500 个中文字符长度测试失败，确认编码后重建为与生产一致的 UTF8 并通过，无业务 SQL 修改。

## 发布步骤与证据

- 构建：GitHub Actions `38059788659`。
- migration 预检：`38059792523`；应用前必须核实仅一个待执行版本 `20261010140944`。
- migration apply：`38060568294` 成功，660 → 661，仅应用 `20261010140944`；执行 `supabase migration list` 确认 Local/Remote 661 条对齐。
- 数据库只读核查：新表 0 条记录、RLS 开启；service_role 仅 SELECT/INSERT；anon/authenticated 无 RPC 执行权限。两个平台开关均 false。
- API deploy：`38060689644` 成功；API revision `18fac771252513ce323a6a3522e2f574e67db929`、healthy、restart=0。
- API digest：`sha256:c30dfb2f3daa5977d9a9bb5e415dbbf56eb745e6e12168f3bb416872cf345f5a`。后台 revision `8112d16362285c1c36c90f9dd1c6ff1b1e669394`，未变更。
- 生产检查 **43/43 通过**：新接口/真实员工实时范围 12 项，旧内部入口与上传保护 20 项，图库/历史图片保护 11 项。使用服务端生成的短期凭证，不是真机登录证据；无测试评论或历史搬迁记录产生。
- 检查覆盖新 GET/POST 默认停用、未登录/访客拒绝、分页上限、伪造审核状态、无编辑接口、旧内部分页可读；旧混合评论、评论图片上传及历史图片签名继续拒绝。
- 旧回归脚本保留其 `script_original_release=v2026.10.10.2` 元数据，另附实际验证版本 `verified_runtime_release=v2026.10.10.3` 和 revision，避免把脚本来源版本当作当前部署版本。

证据目录：`docs/operations/evidence/2026-10-10-project-communication-release/`，含候选/镜像 manifest、部署回执、迁移 plan/apply/list、SQL fixture、数据库授权和 API 检查结果。

## 切换与验收边界

本次先部署，保持 `PROJECT_LOG_COMMUNICATION_ENABLED=false` 和 `PROJECT_LOG_INTERNAL_COMMENTS_RETIRED=false`。旧内部入口保留现有行为；新能力返回受控 403。新能力开关关闭时的 smoke 不等于客户发布/回复验收通过。

小程序配套完成且满足开放条件后，先退休旧入口（验证 410），再启用新接口，按交接文档联合验收。未完成双方真实微信发布/回复、审核隔离、撤权/身份切换及手机截图；其他公开内容核查和类目问题尚不能据此认定解决，未安排提审。

回滚优先关闭新开关并保留旧入口退休状态，新表/审核记录保留。旧镜像不认识退休开关，直接回退可能重新开放旧内部写入，需单独处理。

契约：`docs/miniprogram/2026-10-10-project-log-project-comments-handoff.md`。


## 原部署阶段回执（后续开关切换见上方链接）

> 后端已部署 v2026.10.10.3，数据库迁移及默认关闭状态检查通过。请按 `docs/miniprogram/2026-10-10-project-log-project-comments-handoff.md` 接入独立 `project-comments`：仅本项目客户与有权限员工的文字发布/回复，历史内部及旧混合评论不迁移、不展示，原日志和施工照片保留。
>
> 当前新接口仍关闭，403 COMMENT_COMMUNICATION_DISABLED 为预期；旧内部入口暂未退休。请上传配套体验包并回传版本，随后协调关闭旧入口、开放新接口，联合验收双方发布回复、审核隔离、撤权及身份切换，补齐真机截图。尚未完成联合验收或微信提审。
