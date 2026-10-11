# 项目日志图文评论 v2 后端准备版

状态：实施及两轮复审通过，正在准备生产候选，尚未生产部署。当前生产 v1 行为与开关未修改。

## 变更范围

- v2 取消项目日志评论的文字/图片内容检测，保存即发布，支持文字、纯图片及图文回复；历史 approved 保持可见、pending 保持隐藏，新记录真实记录 unchecked。
- 每日志最近三条预览、同项目最多20日志批量查询、稳定微秒级游标分页，每页默认20、最大100。
- 评论及有序附件原子提交；身份内请求键支持并发幂等，相同键不同内容409。
- 上传申请在数据库事务内限制：当前租户/账号/选中身份每10分钟最多60次，最多90个未提交附件；通过后才创建文件与归属记录并签发凭证，限流返回429。
- 私有 COS 临时上传、服务端验证真实类型/大小并写入内容寻址的成品对象；只对当前仍有项目访问权的身份签发五分钟读取链接。
- 保留实时员工范围、客户归属、当前身份、微信绑定及租户读写校验；旧内部入口和公开交流入口不开放。
- 在施工日志写入及通用图片输出中阻止转发新评论图片的短链接。
- 复用现有 COS reconcile worker 清理超过24小时未引用图片：SQL领取排除关联/完成写入，失败15分钟后重试，每批最多100文件。
- orange 仓库未修改；具体 UI 和真机由小程序团队配套。

## 验证记录

隔离 PostgreSQL 15.8/UTF8 运行实际迁移、fixture 与独立补充检查；权限、旧写入兼容、图片归属和原子性通过。两个真实并发事务提交相同图片请求，只生成一条评论及一个附件。详见 `evidence/2026-10-11-project-log-inline-image-comments/sql/SUMMARY.md`。

5,000 条评论下分页使用 `project_comment_published_page_idx`，微秒时间相同的游标无重复/遗漏。最近三条查询有 LIMIT 3；精确总数仍需扫描相应历史，不能把 LIMIT 的输出边界解释成总计数查询恒定开销。未引入缓存/计数表/队列。

生产 COS 只读配置查询：bucket ACL=private，bucket policy 查询404。不是实际图片上传、CDN行为或手机证据。

单元、服务与 HTTP 检查使用受控存储/鉴权依赖；不向微信发送测试检测请求。20个相关测试文件共118项通过、658次断言；API typecheck、build、文件大小检查通过。测试及检查输出保存在同目录 local/。最终规格与独立质量复审均通过，无剩余确认的P1/P2。上传名额真实并发验证通过：已有59次申请时，不同日志的两个同身份请求仅一个成功，另一个PT429；最终60个上传/文件一一配对，无孤立记录。

## 准备版发布顺序

1. 对审阅通过的提交创建不可变候选，服务选择 `api,cos-reconcile-worker`；后台及其他 worker 不变。
2. migration plan 确认仅新增 `20261011100853_project_log_inline_image_comments.sql`，由现有生产 workflow 备份并应用；验证 `supabase migration list` Local/Remote 对齐。
3. 部署同候选 API 与现有 COS worker；worker 新的 `PROJECT_LOG_COMMENT_ATTACHMENT_CLEANUP_ENABLED` 由 compose 默认 true，仅作用于本轮新增的私有上传表。
4. 保持 `PROJECT_LOG_COMMENT_V2_ENABLED=false`；保留 `PROJECT_LOG_COMMUNICATION_ENABLED=true` 与 `PROJECT_LOG_INTERNAL_COMMENTS_RETIRED=true`。
5. 运行 preparation-smoke：v1仍能读、v2各入口受控403、旧内部410、匿名拒绝、未产生评论或上传。运行旧公开图片保护回归。
6. 客户端新版就绪后在约定环境联合验证，再协调正式切换；准备版发布本身不等于 v2 已启用或小程序已更新。

## 回滚与剩余验收

迁移保留旧列和真实数据，不做反向删除。v2尚未启用时可撤回准备版 API，但需确认 worker 与 schema 兼容；启用后优先关闭评论能力，用兼容v2数据的修复版本恢复。不得把 unchecked 重写成 approved 或用旧镜像假装支持新附件。

两种身份的真实手机发布、纯图片/图文回复、上传网络重试、图片预览刷新、三条直显、展开收起、撤权/身份切换及截图待客户端联验。仓库内 mocked HTTP 和 SQL 并发结果不能替代这些证据。

交接：`docs/miniprogram/2026-10-11-project-log-inline-image-comments-handoff.md`。
