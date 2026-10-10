# 员工内部施工日志文字评论：生产发布记录

## 发布对象

- 版本：`v2026.10.10.2`。
- 源码：`abc16bd5018bfd3693cd7a49b19cd5612c3bbc39`。
- 范围：仅 API；Admin、Web 和 worker 不在本次部署范围。
- API 镜像：`sha256:c3843d33b86ac6fe39c60caad0ec12db6bfa2bc780205d2f99484d2255dd58e6`。
- [API 候选构建 38049150266](https://github.com/LeeFo-china/goose/actions/runs/38049150266) 成功，候选元数据/源码/服务范围/digest 已核验。
- [生产部署 38049507346](https://github.com/LeeFo-china/goose/actions/runs/38049507346)：成功，完成时间北京时间 **2026-10-10 19:47:48**；运行容器 revision/digest 与候选一致，healthy、重启次数 0。Admin 保持上一版本且 healthy。

## 数据库

- [迁移计划 38049152354](https://github.com/LeeFo-china/goose/actions/runs/38049152354) 与完整 `supabase migration list` 均确认只有 `20261010111529_project_log_internal_comments.sql` 待执行。
- [正式迁移 38049269746](https://github.com/LeeFo-china/goose/actions/runs/38049269746) 成功，远端历史由 659 条增至 660 条，仅应用上述一条。
- 备份：`prod-migrate-38049269746-20261010194156.sql`，18,648,226 bytes；通过既有生产 migration 工作流产生。
- 应用后再次执行 `supabase migration list`，并用 `scripts/verify-migration-history.mjs` 验证，660 条 Local/Remote 全量对齐，无 remote-only 版本。
- 新表 RLS 已开启；anon/authenticated 不能直接读写；服务端具有 SELECT/INSERT；父评论范围 FK、校验触发器和 approved 分页索引均已生效。迁移后新表 0 条，不迁移旧混合评论、不生成测试业务记录。

证据：[迁移计划](../operations/evidence/2026-10-10-internal-comments-release/migration-plan.json)、[迁移结果](../operations/evidence/2026-10-10-internal-comments-release/migration-apply.json)、[迁移对齐](../operations/evidence/2026-10-10-internal-comments-release/migration-list-after.txt)、[生产表检查](../operations/evidence/2026-10-10-internal-comments-release/schema-check.json)、[镜像清单](../operations/evidence/2026-10-10-internal-comments-release/image-manifest-api.json)。

## 线上验收结果

**生产发布完成，33 项检查全部通过；微信文本审核网关普通文本实测 approved。** 发布前复验 42 项本地测试、API typecheck 通过，构建及独立审查证据见对接文档。

使用现有真实身份绑定生成进程内短期凭证，经生产 HTTPS 接口验收，不输出凭证、不写入测试评论。拒绝类 POST 均针对已确认的拒绝条件；验收前后日志内部评论数量一致。这是服务端身份与接口验收，不冒充小程序真机验收。

| 范围 | 生产结果 |
| --- | --- |
| 员工内部列表 | 后台员工会话、微信员工会话均 200；分页契约正常 |
| 非员工与范围隔离 | 匿名 401；客户读写 403；访客凭证用于受保护路径 401；跨租户员工 403 |
| 参数与审核入口 | pageSize=101、伪造审核状态均 400；无微信审核身份的文字 POST 返回 503 `CONTENT_CHECK_UNAVAILABLE`；编辑路由 404 |
| 评论图片 | 新内部入口拒绝非空图片，403 `COMMENT_MEDIA_DISABLED` |
| 旧混合评论 | 旧列表、创建仍 403 `COMMENT_COMMUNICATION_DISABLED` |
| 三个旧图片 scene | project_log_comment / customer_follow_up_comment / picture_comment 的 direct-init 和 direct-complete 均 403，共 6 项 |
| 公开图库 | 评论读取/创建仍 403；图库业务列表 200，评论计数为 0 |
| 历史评论图 URL 转换 | 抽样 3 个 project_log_comment 文件，平台身份调用 fileId/path 转换共 6 项均 403；未签发新 URL |
| 微信实际审核 | 使用现有员工绑定的 openid，在生产网关对中性验收文本调用 msgSecCheck v2/scene=2，真实返回 approved；未创建评论 |

历史图片验证只覆盖这些样本的 API 转换，不声称既有已签名直链被即时撤销；其他图片 scene 的历史对象未取得本轮样本。审核风险/复核状态由本地受控响应测试覆盖，尚不能称为微信实测通过。已审核文字真正提交入库、其他员工读取、界面提示及身份切换，留待小程序体验版联验。

证据：[核心接口 22 项](../operations/evidence/2026-10-10-internal-comments-release/api-smoke.json)、[微信员工/旧入口 11 项](../operations/evidence/2026-10-10-internal-comments-release/legacy-smoke.json)、[微信审核调用](../operations/evidence/2026-10-10-internal-comments-release/wechat-check.json)、[运行状态](../operations/evidence/2026-10-10-internal-comments-release/runtime.txt)、[发布回执](../operations/evidence/2026-10-10-internal-comments-release/deployment-receipt.json)。核心检查中的 `wechat_live_content_check=not_executed` 只描述首个脚本范围，随后独立网关检查结果见 wechat-check.json。

## 功能边界与客户端配套

新 GET/POST `/project_logs/:logId/internal-comments` 仅面向当前员工身份，受同公司、项目权限、租户服务读写状态及实时权限检查约束；文字评论和回复仅在审核通过后对其他员工可见。待审内容隔离，审核异常不发布。

旧员工/客户混合评论、客户独立评论、图库评论、跟进评论及三个评论图片上传场景继续停用。评论图片、评分、编辑、历史内容自动恢复不在本次开放范围；无人工审核后台/自动转 approved 流程。

orange 仓库未改动；当前停用包不会自动显示内部沟通入口。小程序按[接口对接文档](./2026-10-10-project-log-internal-comments-handoff.md)仅恢复员工文字入口，客户/访客不可见，并正确区分 published/待审结果。正式真机联验、风险用例、角色切换截图及其余公开内容安全整改仍待完成；本次不安排微信重新提审。

## 回滚边界

上一生产 API 源码为 `8112d16362285c1c36c90f9dd1c6ff1b1e669394`，镜像 digest `sha256:ca8f4360e1083b1e11fe6170ec5f37cf6f59a07584a1e3d77d422feab4a47a3c`。如需回退，按既有不可变镜像发布/回滚流程切回该版本，内部新路由不可用，旧评论继续停用；保留新表与审核记录，不执行删表回滚。
