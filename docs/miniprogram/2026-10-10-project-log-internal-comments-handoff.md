# 施工日志员工内部文字评论：后端实现与小程序对接

日期：2026-10-10。范围：只恢复有项目权限的公司员工之间的文字评论和回复。客户交流、访客图库评论、客户跟进评论及评论图片继续停用。不得将“内部评论”理解为已经获得微信类目豁免。

## 实施状态

- 后端已生产部署 **v2026.10.10.2**（2026-10-10 19:47:48），migration 已应用且 660 条 Local/Remote 对齐；33 项生产检查通过。详见[发布与验收记录](./2026-10-10-internal-comments-production-release.md)。
- orange 仓库只读，未改动。当前已上传的停用测试包不会自动出现新的内部评论入口，需要小程序团队配套。
- 生产已新增员工内部文字接口，既有停用接口/上传限制不变。本轮不是公开内容安全核查的全部完成结论，也没有提交微信审核。
- 微信网关普通文本已实测 approved（未写评论）；风险/复核用例、完整提交/读取、体验版员工/客户/访客、角色切换及截图仍需联合验收。本地风险/待审测试使用受控响应，不冒充微信实测。

## 为什么独立隔离

旧 `project_log_comments` 同时保存员工与客户内容，且被客户摘要、评分和项目汇总 RPC 读取，没有内部可见范围。新记录存入 `project_log_internal_comments`，避免旧查询或安全定义者 RPC 误读。旧内容不迁移，不自动认定为审核通过；历史图片不重新签名放行。

表开启 RLS，撤销 anon/authenticated 的直接权限，仅服务器访问。数据库校验租户、日志、在职作者及父评论范围；正文不可改写后沿用原审核结果。无新编辑/删除接口。

## 接口与权限

基于当前 API base URL，路径如下：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/project_logs/:logId/internal-comments?page=1&pageSize=20` | 已审核内部评论分页 |
| POST | `/project_logs/:logId/internal-comments` | 内部文字评论或回复 |

携带当前已验证的 Bearer token。GET/POST 只接受当前选中的员工身份，要求 token 的 `employee_id`、`tenant_id` 与服务端员工一致且仍在职；不从客户/访客身份自动回退到同手机号员工。

- GET：同租户，拥有对应项目 `project.read` 权限，租户服务允许读取。
- POST：再要求对应项目 `project_log.create` 权限、租户服务允许写入。7 天只读宽限期不能发评论。
- 每次读取、提交前及微信审核后均绕过权限缓存，查询最新权限/部门范围；再校验实时员工绑定及项目权限。
- 超管/平台员工身份不能绕过内部项目权限。
- POST 当前仅支持微信员工会话（`login_channel=wechat` 且带服务端签发的 openid）。服务端检查此 openid 仍绑定当前用户，不接受 body 提交的 openid。后台 Web 员工会话可按项目权限读取，但不提供无微信身份的审核绕行。

### GET

`page` 默认 1，范围 1–100000；`pageSize` 默认 20，上限 100。稳定按 `created_at ASC, id ASC` 排序；`total` 只计审核通过的内部评论。

```json
{
  "data": {
    "list": [
      {
        "id": "comment-uuid",
        "log_id": "log-uuid",
        "parent_id": null,
        "author_id": "employee-uuid",
        "content": "请复核施工记录",
        "moderation_status": "approved",
        "created_at": "2026-10-10T11:00:00.000Z",
        "author": { "id": "employee-uuid", "name": "员工姓名" },
        "images": [],
        "visibility": "internal",
        "published": true
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  },
  "message": "success"
}
```

示例中的 `*-uuid` 为说明占位，真实请求必须合法 UUID。列表没有客户评分，也不使用旧评论摘要计数。作者信息缺失时 `author=null`，不要用项目负责人补齐作者。

分页是平铺记录，父评论可能在前页；小程序不能仅按当前页是否有根评论过滤回复，否则后续页的回复会丢失。建议平铺时间线显示“回复评论”，或合并已加载页后分组并保留尚未加载父节点的回复。

### POST

```json
{ "content": "请复核施工记录", "parent_id": null }
```

- `content` 去首尾空白，1–500 字符。
- `parent_id` 可省略/null；回复时必须属于同公司、同日志的新内部评论，且已通过审核。不能回复旧混合评论、其他日志或待审评论。
- `images` 省略或 `[]`；非空明确拒绝。前端不展示图片上传按钮，不使用 `project_log` 场景给评论绕传图片。
- 不接受 `rating`、`author_id`、`openid`、审核状态等其他字段。
- 正常文字/回复经过微信 v2 `msgSecCheck`，只在明确 `pass` 后发布；`risky` 拒绝，`review` 隔离待审，超时/配额/身份过期/无效结果均不发布。
- 审核通过返回 HTTP 200，`data` 为上面的单条记录，`published=true`。

待审返回 HTTP 200，但**不是发布成功**：

```json
{
  "data": {
    "id": "comment-uuid",
    "moderation_status": "pending",
    "visibility": "internal",
    "published": false,
    "code": "CONTENT_PENDING"
  },
  "message": "success"
}
```

待审正文不会出现在列表、客户摘要或公开入口。保留审核 trace、时间及正文 SHA-256 供核查；不返回这些内部审计字段。**本轮没有人工审核后台/自动转 approved 流程**，不能承诺自动放行时间，也不要循环重试相同内容。可保留用户输入供修改后重新提交。

### 统一失败契约

沿用现有错误结构 `{success:false, code, message, requestId}`，业务失败不是登录过期，不应触发退出登录。

| HTTP | code / 状态 | 小程序处理 |
| --- | --- | --- |
| 422 | `CONTENT_REJECTED` | “发布内容包含违规信息，请修改后重试”，保留输入 |
| 200 | `data.code=CONTENT_PENDING` 且 `published=false` | 显示“内容待审核，暂未发布”，不得插入可见列表 |
| 503 | `CONTENT_CHECK_UNAVAILABLE` | “暂时无法审核，请稍后重试”，保留输入，不自动重试 |
| 403 | `COMMENT_MEDIA_DISABLED` | 内部评论暂不支持图片 |
| 403 | `FORBIDDEN` | 当前员工/项目权限不足，停止加载内部内容 |
| 401 | 现有未授权 code | 走现有登录恢复 |
| 400 | `VALIDATION_ERROR` | 参数错误、父评论不可用或伪造字段 |
| 402/403 | 现有租户服务状态 code | 沿用现有只读/到期提示 |

旧 `/project_log_comments`、客户独立评论接口、图库及跟进评论仍返回 `COMMENT_COMMUNICATION_DISABLED`。不要将新入口请求失败后降级到旧接口。

## orange 配套位置与操作顺序

已只读核对：

- `src/services/project_log.ts`：现有旧员工/客户评论与图片上传封装。新增独立内部接口封装和类型，不能直接换掉客户评论请求。
- `src/services/project_log_types.ts`、`src/types/tables/project_log_comment.ts`：新内部响应没有 rating/客户作者等旧字段，使用独立类型。
- `src/packageProjects/pages/detail/utils/comments.ts`：现有分组依赖根评论和评分，注意新平铺分页的回复展示。
- `src/utils/comment_communication.ts`：保留对旧接口及三个评论上传场景的拦截；当前正则不会误拦截新 internal-comments 路径，不要整体删除停用逻辑。

小程序团队实施：

1. 仅在员工项目详情显示“内部沟通 · 仅公司有项目权限的员工可见”；客户、访客、分享页不请求、不显示新入口。
2. 读取权限通过后分页加载；内部计数使用该接口 `total`，不要恢复旧评论摘要/评分。
3. 输入仅文字及回复；隐藏图片、评分、编辑功能。禁止把任何待审内容乐观插入可见列表。
4. 提交期间禁用重复点击；HTTP 200 后先判断 `published`，不是仅看状态码。网络结果不确定时先刷新列表，**接口本轮未增加幂等键，不要自动重试 POST**。
5. 当前身份/租户切换、退出登录后清空内部列表和输入缓存；缓存键至少包含身份、租户、项目日志，禁止客户身份复用员工缓存。
6. “暂不可审核”若由访问时间过期引起，应由用户重新进入微信小程序建立有效会话后重试；接口不会返回敏感命中词、标签、openid 或 token。

## 验证记录

- `bun test` 相关 6 个文件：42 pass / 0 fail（179 assertions），包含原停用行为回归、真实 controller+service 的 HTTP 契约、缺少凭证的真实鉴权拦截，以及真实权限缓存预热后撤权/调部门的回归。
- 最终 API typecheck、API build、文件大小检查和 git diff --check 均已通过。
- 独立无网络 Docker PostgreSQL 17，本地最小 schema + **真实 migration**：合法评论/回复可保存，跨租户、跨日志父评论、待审父评论、离职员工、沿用审核编辑均拒绝；匿名/认证客户端无表权限，RLS 开启。
- 5000 条额外记录 `EXPLAIN ANALYZE`：分页命中 `project_log_internal_comments_approved_page_idx`，测试运行执行约 0.109 ms，仅作为本地查询计划证据，不代表生产性能。
- SQL 回归：`supabase/tests/project_log_internal_comments.sql`，仅允许在隔离数据库 `gooes_internal_comments_test` 运行；未重放全仓历史 migrations。

## 发布顺序与联合验收

1. 核对唯一新增 migration `20261010111529_project_log_internal_comments.sql`，按仓库发布流程应用，随后 `supabase migration list` 确认 Local/Remote；本次已完成并确认 660 条全量对齐。
2. 后端已部署，由 orange 团队上传配套体验包。在实际微信会话检查正常文字与回复、官方风险用例及审核故障；采集脱敏响应和截图。
3. 员工本人/同项目其他员工/无权员工/离职员工/客户/访客/跨租户/双身份切换/旧入口分别验证；客户和分享内容中不得出现内部评论或计数。
4. 验证待审记录不可见、旧评论图片上传仍拒绝、旧图片 URL 转换仍拒绝。历史已签名直链仍按原签名到期策略处理，本轮不声称撤销了所有历史链接。
5. 运营向微信如实提供内部项目管理边界和权限证据，等待对实际服务的审核结论；公开内容其余审核整改另行完成后再安排提审。

回滚：回退 API 后新路由消失，旧评论停用状态保留；保留新表和审计记录，不删数据。没有涉及橙子仓库的代码、Git 或服务操作。

## 已核对的官方接口

[微信文本内容安全识别 msgSecCheck](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html)：v2、scene=2；openid 须近两小时访问过小程序，只有 `pass` 放行。

[微信媒体内容安全识别 mediaCheckAsync](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync.html)：异步结果需要可信回调。此链路及私有媒体访问尚未实施，因此此次不恢复评论图片。
