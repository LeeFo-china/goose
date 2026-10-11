# 项目日志评论 v2：日志内直显、图片回复与即时发布

状态：后端兼容准备版 `v2026.10.11.1` 已于 2026-10-11 18:40（北京时间）部署生产，源码 `f415c5cb83c840203d878cca37858c504b069e05`。当前对外仍使用 v1，`PROJECT_LOG_COMMENT_V2_ENABLED=false`；新版接口暂返回403，并未启用即时发布。orange 仓库未修改，客户端修改、打包和上传由小程序团队完成。

生产验证：准备版接口12项、旧入口/历史图片保护11项、真实私有COS上传与读取5项均通过；测试图片已清理，没有创建测试业务评论。118项本地回归通过。以上不是手机验收；发布实录见 [后端准备版回执](../operations/2026-10-11-project-log-inline-image-comments-release.md)。

## 已确认的业务规则

本项目客户和当前有权限员工可在日志下评论、回复；文字、纯图片、图文均可。v2 不调用文字或图片内容检测，不走人工审核或待审队列，保存成功即发布。项目归属、当前选中身份、有效登录绑定、员工权限及租户读写状态继续校验。图库、跟进评论、旧 internal-comments 和旧混合评论保持现有停用状态。

历史 project-comments 的 approved 记录保留可见，pending 保持隐藏。新记录真实存为 unchecked，不能视为历史检测通过，也不向客户端返回伪造审核字段。

## 客户端应改的位置

已只读核对以下实现：

- `src/services/project_log_project_comments.ts`：现有判定要求 `moderation_status === 'approved'`，页码分页；必须配套升级。
- `src/components/ProjectLogCommunication/index.tsx`：移除先点“项目沟通”的开关与“审核通过后可见”文案。
- `src/components/ProjectLogCommunication/useProjectLogCommunication.ts`：改为预览、游标分页、图片上传与发送响应原地更新，取消成功后重读第一页的做法。
- 员工及客户项目日志列表：由列表层合并当前页/可视日志的预览请求，不能每条日志分别查询。

## 展示与交互

1. 每条日志正文及图片下直接显示最近 3 条消息，取最新三条后按时间升序呈现。评论与回复都各计一条，图片数量不计入评论总数。
2. 无评论时仅显示“写评论…”。超过三条显示“查看全部 N 条”；展开在原日志内加载更早记录，默认每批 20 条，prepend 并按 ID 去重；收起恢复最新三条。
3. 评论显示作者、时间、正文与图片；回复显示“回复 姓名”，不要无限多级缩进；回复对象正文为空时显示“[图片]”摘要。作者名字为空时按员工/客户显示兜底称呼。
4. 图片预览最多一行 3 张，更多图片显示数量；点击预览本条全部图片。使用服务端返回的短链接，过期按专用接口刷新。
5. 评论与回复共用输入器，最多 500 字、9 张图片，允许纯图片。每张不超过 10 MiB，客户端压缩/转换成 JPEG、PNG 或 WebP 后，以最终字节数申请上传。
6. 上传中和发送中是发送者的本地状态。全部图片完成后才能提交；失败保留当前身份草稿与重试入口，不显示为成功。
7. POST 成功直接用真实响应替换本地发送中消息，更新总数与最新三条。展开状态保留已加载历史，不能用第一页覆盖当前列表。
8. 页面进入、回前台更新预览；停留页面最多每 15 秒一次合并可视日志请求，后台/离开即停，失败退避。没有 WebSocket 实时推送承诺。
9. `can_write=false` 仍可读评论与图片，隐藏发送、回复提交及上传入口。

## 接口契约

沿用现有 `ResponseHandler.success` 外层，以下均描述 `data`。请求使用当前选中身份的有效凭证，不接受客户端指定作者、租户、openid 或发布状态。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/project_logs/:logId/project-comments?contract_version=2&pageSize=20&before=...` | 更早评论分页；首次可不传 before |
| POST | `/project_logs/:logId/project-comments` | 顶层评论、回复、纯图片或图文发布 |
| POST | `/projects/:projectId/project-comment-previews` | 只读批量预览，最多 20 个同项目日志 |
| POST | `/project_logs/:logId/project-comment-uploads/init` | 当前身份申请私有上传 |
| POST | `/project_logs/:logId/project-comment-uploads/complete` | 服务端校验真实图片并完成上传 |
| GET | `/project_logs/:logId/project-comments/:commentId/attachments/:fileId/url` | 当前仍有权身份刷新图片链接 |

发布请求：

```json
{
  "contract_version": 2,
  "client_request_id": "00000000-0000-4000-8000-000000000001",
  "content": "插座位置请按图调整",
  "parent_id": null,
  "attachment_ids": ["00000000-0000-4000-8000-000000000002"]
}
```

`content` 可为空，不能与附件同时为空。附件 ID 必须唯一，最多 9 个；任意远程 URL、其他日志/身份的文件、未完成文件均不可引用。`parent_id` 只能指向同日志当前可见评论。

同一次发送及网络结果不确定后的重试复用 `client_request_id`，服务端仅保存一条并返回同一记录。修改正文、父评论、附件或顺序后使用新的请求 ID。同键不同载荷返回 409 `COMMENT_REQUEST_CONFLICT`。重新登录/切换身份后不能自动重发旧请求。

批量预览请求：

```json
{"contract_version":2,"log_ids":["00000000-0000-4000-8000-000000000003"]}
```

任一日志不属于该项目时整体失败，不返回部分计数。服务端不复用客户日志页面的十秒数据缓存。

批量预览返回 `{list:[{log_id,total,recent_comments,has_more,older_cursor,can_write}]}`，`recent_comments` 已按时间升序排列。展开时将 `older_cursor` 作为分页的 `before`。

分页返回 `list/total/pageSize/has_more/next_cursor/can_write`，列表按时间升序。游标是不透明字符串，必须原样传回，不能自行解析、重建或挪到另一条日志。

发布记录包含 `id/log_id/parent_id/author_type/author_id/author/content/created_at/visibility/published/attachments/reply_to`。新版按 `visibility=project`、`published=true` 和记录字段校验成功，不再要求 `moderation_status=approved`。

附件包含 `file_id/url/expires_at/width/height/mime_type`。链接有效期为 5 分钟；撤权后无法新签名，但已签发链接在过期前可能仍有效。

上传 init 请求 `{contract_version:2, filename?:string, mime_type:string, size_bytes:number}`；complete 请求 `{contract_version:2,file_id:string}`。上传凭证只适用于服务端分配的私有临时对象，客户端不得改 key、替换公共地址或绕到通用上传接口。init 返回 `{file_id,upload_url,method:"PUT",headers,expires_at}`，客户端使用最终图片的二进制内容直接 PUT，并按返回 headers 设置请求；不要使用 multipart 表单上传，上传体大小必须与申请时一致。真机确认返回的 COS 域名已列入小程序合法请求/图片下载域名，并验证二进制 PUT 和返回 headers；后端本地 SDK 传输测试不能替代这一点。图片选择后可用本地临时路径预览，不能把临时上传地址当图片访问地址。

complete 返回 `{file_id,status:"complete",mime_type,width,height}`；所有附件 complete 成功才允许提交评论。只有已发布评论的附件会返回或刷新可读短链接。完成上传超时可用同一 file_id 重试；409 `COMMENT_ATTACHMENT_UPLOAD_EXPIRED` 则重新 init 并上传。

## 失败和身份切换

- 400：输入、父评论、分页/游标或附件格式不符合要求。
- 401：会话或微信绑定已变化，清除当前展示/输入状态后走既有登录流程。
- 403：当前身份无权，或新版尚未开放。不得回退其他身份获取内容。
- 409 `COMMENT_REQUEST_CONFLICT`：该请求 ID 已提交不同内容，不能静默覆盖。
- 429 `COMMENT_ATTACHMENT_RATE_LIMITED`：当前租户和选中身份的上传申请过多。每10分钟最多60次，最多保留90个未提交附件；稍后重试，禁止自动循环申请。限制在数据库内原子执行，被拒绝不会生成新文件记录或上传凭证。
- 410 `PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED`：新版切换后旧契约已退出，提示更新小程序。
- 422 `COMMENT_ATTACHMENT_INVALID`：真实图片类型、尺寸/大小或内容结构校验失败；这是文件格式校验，不是文字/图片内容检测。
- 502 `COMMENT_ATTACHMENT_STORAGE_FAILED`：图片存储暂不可用。
- 图片存储不可用、超时：展示失败并允许手动重试，不当作已发布，不自动重发 POST。

身份切换、项目切换、退出登录后立即清除草稿、上传状态、评论和图片链接，忽略旧请求的迟到响应。前台刷新应去重和退避，不并发堆积请求。

## 联合验收与切换顺序

后端先应用增量迁移并部署兼容准备版 API 与现有 COS 清理 worker，保持 v2=false；新增附件清理仅处理超过24小时未引用文件，失败可重试。客户端提供新版体验包及绑定确认，再在约定验收环境联调 v2。当前 2026.10.10.5 的字段判定不能承接 v2，不能仅切后端开关。

双方确认后协调正式发布及开关切换，验证旧请求 410、新请求成功、internal-comments 仍 410。记录后端版本、迁移、开关、客户端版本及绑定状态；不能将后端构建通过等同客户端已发布。

真机验收需覆盖客户和员工各自发送文字/纯图/图文、互相回复、0/1/3/4/超过20条、展开收起、返回页面、重复发送/网络超时重试、图片类型/大小失败、撤权、跨项目/跨身份、只读宽限期和访客。请回传 commentId/fileId/client_request_id、时间、设备与截图；模拟服务端凭证不替代手机验收。

回滚优先关闭评论能力，保留数据与旧入口退休状态；不得把 unchecked 改写成 approved，也不得用旧镜像假装能完整展示图片评论。
