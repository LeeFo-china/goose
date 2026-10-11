# 项目日志图文评论 v2 后端准备版

**后续切换：2026-10-11 20:50（北京时间）已按用户确认开启生产v2联验窗口；13项切换检查通过，真机结果待回传。下文为准备版发布时记录，最新状态见[联验回执](../miniprogram/2026-10-11-project-log-comment-v2-backend-feedback.md)。**

状态：代码 `f415c5cb83c840203d878cca37858c504b069e05` / `v2026.10.11.1` 的兼容准备版已于 2026-10-11 18:40:26（北京时间）部署成功。迁移已应用，API/COS worker健康，v2保持关闭；当前小程序仍使用原v1行为。

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

生产 COS 配置查询：bucket ACL=private，bucket policy 查询404。随后使用实际新网关与真实COS服务，对临时生成的4×4 PNG完成PUT、服务端格式验证和内容寻址固化、签名GET；匿名读取临时/成品对象均403。5项检查通过，两个测试对象已清理，SQL写入0。这是服务端存储传输证据，不是手机域名/二进制PUT适配或业务评论验收。

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

## 生产迁移实录

- plan：`38132265261` 成功，仅待执行版本 `20261011100853`。
- apply：`38132399007` 成功，661→662，仅应用该版本；由生产 workflow 执行备份与迁移。
- `supabase migration list` 验证 Local/Remote 662条全部对齐；归档输出仅裁剪行尾空白。
- 生产只读验证：分页/预览 RPC、PostgREST 文件与评论关联及平台设置均可读取；新开关 false、原评论开关 true、旧内部退休 true。没有测试业务写入。
- 证据：同目录 migration-plan、migration-apply、migration-list-after.txt、schema-check.json。

## 生产部署及 smoke 实录

- [候选构建38132263787](https://github.com/LeeFo-china/goose/actions/runs/38132263787) 成功，仅构建API镜像。
- [部署38132669163](https://github.com/LeeFo-china/goose/actions/runs/38132669163) 成功，API及COS worker使用同一不可变镜像，revision均为上述源码提交。
- 镜像digest：`sha256:266c34146cbead8b84325769a3530bb345e08f41e161960d04b27951d838815c`。
- 两服务健康、重启次数0；admin仍为原`8112d16362285c1c36c90f9dd1c6ff1b1e669394`，未随本轮发布。
- worker的`PROJECT_LOG_COMMENT_ATTACHMENT_CLEANUP_ENABLED=true`，部署后直接读取该单项环境配置确认；没有执行删除业务文件的额外探针。
- 生产开关：`PROJECT_LOG_COMMUNICATION_ENABLED=true`、`PROJECT_LOG_INTERNAL_COMMENTS_RETIRED=true`、`PROJECT_LOG_COMMENT_V2_ENABLED=false`。
- preparation-smoke 12/12：v1读取与旧契约正常；v2列表/发布/预览/上传/链接均返回403 `PROJECT_COMMENT_V2_DISABLED`；internal入口410；匿名401；前后业务评论/上传数量不变。
- legacy-media-smoke 11/11：旧内部410，图库交流仍403且计数0，图库业务读取200；抽样3个`project_log_comment`历史图片，经fileId和path请求公共URL均403。仅覆盖该抽样场景及签名接口，不宣称遍历所有历史对象或所有CDN缓存。
- storage-probe 5/5：实际上传200、冻结图片字节/尺寸一致、签名读取200、临时/成品匿名读取403；测试对象清理完成，无SQL记录写入。
- 证据目录：`deployment/production-deployment-receipt.json`、`runtime.txt`、`preparation-smoke.json`、`legacy-media-smoke.json`、`storage-probe.json`。

接口 smoke 使用服务器生成的短期凭证，不等同员工/客户实际手机登录。v2发布、两种身份真实图片回复及UI仍待新版小程序联验；不得把准备版发布理解为新模式已向用户开放。
