# 项目日志直接展示与图片评论实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 取消项目日志评论的文字/图片内容检测，允许项目客户与有权限员工发送文字、图片及图文回复；日志下直接展示最近 3 条，更多原地分页展开。

**Architecture:** 保留现有 project-comments 业务和项目鉴权，修改其存储约束及发布契约；复用文件存储基础设施，新增绑定日志与上传身份的私有附件流程。用同项目有界批量预览代替逐日志请求，发送响应直接更新当前列表；评论与附件引用通过事务保存并支持幂等。小程序由 orange 团队实施，本仓库仅只读检查与交接。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、现有 COS 文件存储；小程序 Taro/React 仅作为对接端，无新增依赖计划。

**状态：后端实施、规格/质量复审及最终并发验证已通过，准备发布兼容候选。生产仍为 v1、v2 未启用；orange 未改动。**

## 已确认规则

- 完全取消本功能文字与图片内容检测，无人工审核、待审队列或先展示再检测撤回。
- 登录、当前选中身份、项目归属、员工范围、租户可读/可写状态、文件类型与大小校验继续有效。评论权限不等同施工日志创建任务权限。
- 顶层评论和回复均允许纯文字、纯图片、图文；文字最多 500 字，图片最多 9 张，每张上传文件最多 10 MiB。客户端压缩并标准化为 JPEG/PNG/WebP，服务端验证真实文件类型与大小；SVG、任意远程 URL 不作为图片附件。
- 保存成功后立即可见；上传中/发送中仅为当前发送者本地状态，失败不当成已发布。
- 每条日志默认显示最近 3 条消息（评论和回复统一按条计数），取最新三条后按时间升序展示；总数超过 3 显示“查看全部 N 条”。图片不计入评论条数。
- 展开沿当前日志加载更早消息，每批 20 条，支持收起。回复显示明确对象，避免多级缩进。
- 无评论只显示轻量“写评论…”；有图评论预览最多一行 3 张缩略图，其余显示数量，点击可查看本条全部图片。
- 现有新项目评论已发布记录保留；已有未发布待审记录保持不可见，不自动补发。旧 internal-comments 和混合评论不迁移、不混入。
- 只改项目日志评论；图库、跟进评论及旧图片场景不因此重新开放。

## 当前实现证据与实施边界

- `apps/api/src/services/project-log-project-comments.ts`：现在调用微信检测、拒绝非空 images，创建后返回审核字段。
- `apps/api/src/schema/project-log-project-comments.ts`：直接复用旧内部文字 schema，需要拆成独立 schema 才能支持纯图片。
- `supabase/migrations/20261010140944_project_log_project_comments.sql`：正文要求至少 1 字、审核状态/trace/时间强制存在，父记录和分页索引依赖 approved；不能只删 service 调用。
- `apps/api/src/repositories/project-log-project-comments.ts`：目前时间升序 offset 分页，作者批量读取已有边界。
- `apps/api/src/controllers/uploads/index.ts`：project_log 场景只支持员工，不能让客户借用此场景上传评论图。
- `apps/api/src/services/uploads.ts`：通用 public-url 只处理 public 文件；新附件必须私有且通过评论项目权限获取短期链接。
- orange `src/services/project_log_project_comments.ts`：当前 .5 要求 moderation_status=approved；hook 发送后 load(1)，不能直接拿它承接无检测新记录。
- 客户日志服务存在 10 秒缓存；评论预览与当前权限不放入该日志缓存。

## 拟定新版契约

沿用新项目评论业务路径，显式区分契约版本。下列接口/字段均为实施目标，不代表生产已有。

```text
GET  /project_logs/:logId/project-comments?contract_version=2&pageSize=20&before=<cursor>
POST /project_logs/:logId/project-comments
POST /projects/:projectId/project-comment-previews
POST /project_logs/:logId/project-comment-uploads/init
POST /project_logs/:logId/project-comment-uploads/complete
GET  /project_logs/:logId/project-comments/:commentId/attachments/:fileId/url
```

新 POST 请求：

```json
{
  "contract_version": 2,
  "client_request_id": "00000000-0000-4000-8000-000000000001",
  "content": "插座位置请按图调整",
  "parent_id": null,
  "attachment_ids": ["00000000-0000-4000-8000-000000000002"]
}
```

- content 可为空，但与附件不能同时为空；附件 ID 去重后最多 9 个，重复 ID 直接拒绝，不能用去重掩盖错误输入。
- 服务端确定作者与租户，不接受客户端作者、openid、发布状态或外部链接。
- 返回保留 id/log_id/parent_id/author_type/author_id/author/content/created_at/visibility=project/published=true；新增 attachments 与 reply_to 摘要，不再要求新版客户端判断 moderation_status。
- 新记录真实标识“未检测且已发布”，不得伪造微信 trace、审核时间或把未检测写成已审核通过。历史真实审核元数据只保留在存储/审计，不伪造改写。
- 附件返回 file_id、预览链接、expires_at、width、height、mime_type；回复对象摘要仅来自同日志当前可见父记录，不跨项目解析。
- 游标使用 created_at/id 复合位置并绑定日志；数据库取更早数据，返回按时间升序排列，响应为 list/total/pageSize/has_more/next_cursor/can_write，pageSize 默认 20、最大 100。客户端 prepend 更早记录，按 ID 去重。
- 预览 body 为 `{contract_version:2,log_ids:[...]}`，最多 20 个同项目日志 ID；返回每个日志 total/recent_comments（最多3条）/has_more/older_cursor/can_write。这是明确 <=20 的内部辅助批量接口，代码注明列表分页豁免原因；超限拒绝，禁止无限批量。
- 新接口校验失败沿用 error-factory；文件越权 403，错误父记录/空内容/超限 400；同幂等键不同正文/附件/日志/父记录返回 409 COMMENT_REQUEST_CONFLICT。
- 新模式启用后，缺少 contract_version=2 的旧请求返回 410 PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED，提示更新小程序；不重新开放 internal-comments。需明确告知团队 .5 不能承担新契约，旧版可能只显示通用失败提示，必须随新版发布一起切换。

## Task 1：存储迁移与幂等事务

**Files:**
- 新增 `supabase/migrations/` 下通过 CLI 生成时间戳的 `project_log_inline_image_comments.sql`，不得修改已应用迁移。
- 修改 `apps/api/src/repositories/project-log-project-comments.ts` 及对应 `.test.ts`。
- 新增 `supabase/tests/project_log_inline_image_comments.sql`。

- [x] 补 SQL fixture：空正文+有效图片成功、两者皆空失败、10 张失败、跨租户/跨日志/其他作者附件失败、父记录不可见失败；先观察现有约束无法满足新场景。
- [x] 增量扩展发布状态和“未检测”存储值，允许新记录审核字段为空；旧 approved/pending 的真实信息保留，发布可见性分别映射为已发布/未发布。迁移本身须兼容当前运行 API，不能在 API 切换前破坏旧合法写入。
- [x] 新建评论附件关联与上传归属记录，绑定 tenant/log/上传 user/选中作者类型和 ID；文件元数据继续复用 platform_file_objects，附件按顺序保存。
- [x] 新建事务 RPC：校验父记录、附件归属/完成状态/数量，插入评论及附件关联，同事务提交。SQL 只暴露 service_role 执行权，RLS/约束防止绕过；直接表写入的存量兼容权限在切换阶段明确处理。
- [x] 增加 client_request_id、规范化请求 hash；按租户和作者身份建立幂等唯一约束。同键同请求返回同一条，异载荷返回409；并发重复只落一条。重试前仍实时鉴权，不能借幂等读取已撤权内容。
- [x] 新分页索引基于发布可见性、tenant/log/created_at/id；保留迁移回滚所需旧列，暂不删除数据或旧索引。
- [x] 在独立 UTF8 PostgreSQL 15 环境运行实际 migration + fixture，验证旧已发布记录保留、旧待审不放行、5000条分页/预览 EXPLAIN ANALYZE 有界且使用合适索引。

## Task 2：取消检测与私有图片上传

**Files:**
- 修改 `apps/api/src/schema/project-log-project-comments.ts`。
- 修改 `apps/api/src/services/project-log-project-comments.ts` 及 `.test.ts`、`-http.test.ts`。
- 新增 `apps/api/src/services/project-log-comment-attachments.ts`、`apps/api/src/repositories/project-log-comment-attachments.ts`、`apps/api/src/schema/project-log-comment-attachments.ts` 及对应测试。
- 修改 `apps/api/src/controllers/project-log-comments/index.ts` 注册专用路由。
- 仅按实际复用需要扩展 `apps/api/src/services/files/platform-file-storage/legacy/shared.ts`、`paths.ts` 及文件 URL 策略；通用上传保护保持。

- [x] 添加失败回归：纯图评论、图片回复、正常提交不调用内容检测、无 openid 检测参数依赖；旧待审/跨项目父记录不能被回复。
- [x] 移除本功能检测调用与 pending/rejected 分支；保留真实会话、绑定、项目范围、写权限和租户状态校验。共享 wechat-content-safety-gateway 不删除，避免影响其他功能。
- [x] 增加独立私有存储场景 `project_log_project_comment`。init/complete 都从 logId 确定项目，复用实时评论 write 权限，客户不借用员工 project_log 场景。
- [x] 上传只能写服务端分配的对象 key；complete 由存储端核对真实对象、类型、大小及归属，不能仅相信请求中的 MIME/size。拒绝非 JPEG/PNG/WebP、超过10MiB、跨身份/跨日志文件。
- [x] 所有附件上传成功才提交评论；事务失败不留下半条可见评论。未提交文件保持私有、不进入列表；24小时后作为孤立文件候选，清理前原子确认未被引用且不在有效上传/提交中，复用现有文件清理机制，不新增队列。
- [x] 图片预览/刷新短链接检查当前项目 read 权限和文件确实关联可见评论；链接有效期目标5分钟，不写入公共分享。撤权后禁止新签名；已签发链接在有效期内可能仍可访问，不承诺瞬时撤销。
- [x] 检测无关的文件校验、频率限制、身份隔离继续生效；输出错误统一经 error-factory。

## Task 3：3条预览、分页与发送后可见

**Files:**
- 新增 `apps/api/src/services/project-log-comment-previews.ts` 及 `.test.ts`。
- 修改评论 controller/schema/repository 与对应 HTTP 测试，复用附件 service。
- 修改 `apps/api/src/services/project-log-communication-rollout.ts` 与平台定义，增加明确的新契约切换控制。

- [x] 固定新契约测试：0/1/3/4/超过20条、同时间戳、回复父记录不在预览内、纯图、作者名字为空、游标越界/跨日志、不可见评论不计数。
- [x] 实现最多20日志批量预览：一次校验当前用户对该项目的权限，单次校验全部日志归属，批量聚合数量与每组最新3条；作者与附件批量获取，不能逐日志调用旧 list。
- [x] 预览不放入客户日志10秒缓存；只处理当前日志分页或可视区域请求；若任一日志不属于项目则整体拒绝，不泄露其计数。
- [x] v2 GET 使用稳定游标，更早消息追加到列表顶部；POST 返回完整新评论和附件，不要求回读第一页才能显示。
- [x] 新契约启用前当前 v1 保持现有行为；启用后 v1 明确提示更新，v2 不检测。不得对审核账号/版本暗中采用不同内容政策；版本区分只用于可公开解释的接口迁移。
- [x] 验证公开项目/日志分享、图库摘要、访客接口均不出现这些评论、计数和附件。

## Task 4：小程序交接（orange 团队执行）

**只读参考位置：**
- `orange/src/services/project_log_project_comments.ts`
- `orange/src/components/ProjectLogCommunication/index.tsx`
- `orange/src/components/ProjectLogCommunication/useProjectLogCommunication.ts`
- 员工项目详情日志列表与客户 `CustomerProjectTimelineSection.tsx`。

**本仓库交付：** `docs/miniprogram/2026-10-11-project-log-inline-image-comments-handoff.md`，在契约实现验证后输出最终回执，计划中的字段不得冒充已部署。

- [ ] 客户端移除“项目沟通”开关按钮，直接显示3条/写评论入口；批量取得当前页日志摘要，更多按日志游标加载，收起恢复最新3条。
- [ ] 评论/回复共用文字与选图输入，展示上传进度、预览、删除和失败重试；纯图片可以发送，上传未完成不能提交整条评论。
- [ ] POST成功用返回的真实记录替换本地发送中记录，更新total与最近3条；不能再 load(1) 导致新消息不可见。分页、重试与预览刷新按ID去重。
- [ ] 同一次发送/网络不确定重试复用client_request_id；用户修改内容后使用新ID。只有当前身份内存保存草稿/上传状态，身份切换立即清除并忽略迟到响应。
- [ ] 新客户端判断published与新契约，不要求moderation_status=approved；410明确显示更新提示。只读允许看评论和图，隐藏提交/上传入口。
- [ ] 页面进入/回前台更新；停留页最多每15秒对可视日志发一个批量请求，后台/离开即停，失败退避且不自动重发POST。没有WebSocket实时到达承诺，不引入新推送依赖。
- [ ] 上传新版体验包，回传版本、绑定确认及两种身份的设备信息；禁止本代理修改 orange 文件或执行其构建/上传。

## Task 5：验证、生产发布与回滚

- [x] 最小静态/构建命令（在 apps/api）：

```bash
bun run typecheck
bun run build
bun run check:file-size
```

- [x] 相关服务、repository、HTTP及上传回归使用 Bun 执行；重点验证 Task 1–3 列明的真实边界，不仅测试实现镜像。用受控检测依赖确保新版没有检测调用，不向微信发送测试内容检测请求。
- [ ] 验证纯图/图文/回复、并发幂等、附件原子关联、跨租户/项目/身份、撤权后上传与签名拒绝、图片超限/伪装类型、旧pending不可见、历史已发布可读、公开接口隔离；记录结果及未能执行的项目。
- [ ] 构建不可变生产候选；先跑迁移plan，核对只有本任务migration，再通过现有workflow备份并应用，用 `supabase migration list`确认 Local/Remote 对齐。不手动远端DDL/DML。
- [ ] 部署兼容准备版API，保持当前契约运行、新契约关闭；不要提前移除正在生产使用的v1校验字段。
- [ ] 小程序新版与后端准备版联合验证后协调切换。必要时短暂关闭评论开关，启用v2后验证旧请求410、新请求200，再开放；旧internal始终退休。取消检测是本次真实业务变更，不以之前审核通过证明新变更也已获审核认可。
- [ ] 用指定项目、客户和员工执行真机：文字/纯图/图文/双方回复、直接看到3条、展开收起、上传失败、超时重试无重复、身份切换与越权。取得commentId/fileId/requestId/时间和真实截图，不能用模拟器或短期服务端凭证替代。
- [ ] 生产版本/开关/迁移/API smoke/手机验收分别记录。不能将后端上线等同小程序已提审发布。
- [ ] 回滚优先关闭评论新能力，保持旧入口退休，保留文字、图片及真实状态。不能直接回退旧镜像并把未检测新记录改成approved；需要兼容v2存储的修复版恢复。孤立图片清理不触碰已引用附件。

## 完成标准与边界

1. 日志下无需先点“项目沟通”即可看到最近3条，超过3条原地加载更多。
2. 客户和员工均可提交文字、纯图和图文回复，正常保存没有内容检测依赖或待审流程。
3. 发送成功内容马上在当前日志可见，重试不会重复；图片上传失败不丢文字、不伪装成功。
4. 只有本项目当前有权身份能读写，附件不能通过旧公共链接或其他项目引用越权。
5. 有迁移/权限/性能/发布证据及小程序双方真机回执；未获得的证据如实列出。

实施补充：上传名额由数据库原子限制为每身份60次/10分钟、90个未提交附件，先准入再创建文件和签发凭证；拒绝返回429。公开日志写入及通用输出阻止转发评论私有图片链接。最终结果见 release 与 handoff 文档；手机验收由客户端团队完成。
