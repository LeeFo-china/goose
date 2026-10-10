# 项目沟通：客户与员工文字交流对接

日期：2026-10-10。**本文件描述本轮已实现的代码契约，不代表生产已经部署或开关已开放。** 生产版本、开关状态及实测结果以发布回执为准。

## 已确认范围

项目详情保留施工日志正文、施工照片和进度历史。新增“项目沟通”，只有该项目当前客户和有权限的在职员工可以读取、发布、回复文字。客户不能凭日志 ID 访问其他项目；服务端按当前选中身份校验，不按同手机号回退到员工。

历史内部评论及旧混合评论不迁移、不展示，数据库记录保留。客户端不要合并旧记录、旧计数，不请求旧接口作为失败降级。旧图片评论、图库/跟进评论仍停用。

只支持文字 1–500 字符和回复；无评分、图片上传、编辑或删除入口；不把评论当作验收确认或流程推进。

## 新接口

```text
GET  /project_logs/:logId/project-comments?page=1&pageSize=20
POST /project_logs/:logId/project-comments
Authorization: Bearer <当前选中员工或客户身份的有效会话>
```

员工：同租户、在职、project.read；通过有界实时 RPC 核实项目成员/客户负责人/部门范围，不使用可见项目列表缓存；写入再检查 project_log.create。客户：当前有效客户 membership、同租户、该项目归属本人。两者均受租户服务可读/可写状态限制。审核前后重新检查权限、绑定、项目归属和父记录。

POST 当前要求有效微信会话及仍绑定的 openid（服务端从签名凭证获取）。兼容缺少 login_channel 的已验证微信客户凭证；客户旧凭证可能携带账号全部角色，服务端以 customer_id 且无 employee_id 确定客户身份，绝不回退员工权限。后台会话不绕过检测。禁止 body 提交作者、openid、可见范围、审核状态。

```json
{ "content": "请确认水电施工记录", "parent_id": null }
```

parent_id 可省略或为 null；回复必须指向同日志、同租户、已审核的新项目沟通记录，不接受旧内部或混合评论 ID。images 省略或 []；非空返回 COMMENT_MEDIA_DISABLED。

GET 示例（UUID 用真实返回值）：

```json
{
  "data": {
    "list": [{
      "id": "00000000-0000-4000-8000-000000000001",
      "log_id": "00000000-0000-4000-8000-000000000002",
      "parent_id": null,
      "author_type": "customer",
      "author_id": "00000000-0000-4000-8000-000000000003",
      "author": { "id": "00000000-0000-4000-8000-000000000003", "name": "业主" },
      "content": "请确认水电施工记录",
      "created_at": "2026-10-10T14:00:00.000Z",
      "moderation_status": "approved",
      "images": [],
      "visibility": "project",
      "published": true
    }],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "can_write": true
  },
  "message": "success"
}
```

- page 默认 1，pageSize 默认 20、最大 100。稳定升序 created_at/id；平铺分页，父记录可能位于前页，不因缺少父记录丢弃回复。
- author_type 为 employee/customer；author 可能 null，使用“员工/客户”兜底，不能用项目负责人补作者。
- 新 visibility 为 **project**。原内部组件只接受 internal，不能直接复用其响应判断。
- total 仅计审核通过的新项目沟通。can_write 是当前业务权限结果，POST 仍实时校验；客户端不能沿用“仅员工”或“能创建施工日志”条件挡住有权客户。
- 正常 POST 返回 data 单条记录；员工、客户都显示真实作者类型。没有返回手机号、openid、内部审核 trace。

待审也是 HTTP 200，但不是发布成功：

```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000004",
    "moderation_status": "pending",
    "visibility": "project",
    "published": false,
    "code": "CONTENT_PENDING"
  },
  "message": "success"
}
```

待审不进入列表、计数、公开页或分享摘要；本轮无自动转通过或人工审核后台，不承诺自动放行时间。保留输入供修改，阻止同一内容自动重复发送。

## 失败契约与客户端处理

错误沿用 `{success:false,code,message,requestId}`。

| HTTP / code | 处理 |
| --- | --- |
| 422 CONTENT_REJECTED | 内容不通过，提示修改、保留输入 |
| 503 CONTENT_CHECK_UNAVAILABLE | 暂不可审核，保留输入、不自动重发 |
| 403 FORBIDDEN | 停止请求并清空记录、计数、草稿、回复对象 |
| 403 COMMENT_COMMUNICATION_DISABLED | 新能力尚未开放或已关闭，显示受控提示，不切回旧接口 |
| 403 COMMENT_MEDIA_DISABLED | 评论图片未开放，不借用施工日志上传场景绕传 |
| 410 PROJECT_LOG_INTERNAL_COMMENTS_RETIRED | 旧 internal-comments 已关闭，提示更新小程序，不读取/写入历史 |
| 401 | 沿既有登录恢复，但不自动重发 POST |
| 400 VALIDATION_ERROR | 正文、分页、父评论或多余字段不合法 |
| 402/403 租户服务状态 | 沿用到期/只读提示；只读时允许范围内查看，禁止发送 |
| 404 / 网络结果不确定 | 无旧接口降级；核对列表后由用户决定，不自动重发 |

接口尚未提供幂等键。提交同步锁、防双击、HTTP 200 后判断 published、网络不确定时先 GET 核对。列表升序，记录超过一页时新消息可能在后续页；显示“已发布”不应保证第一页包含新消息。

## orange 配套位置（只读定位）

- `src/services/project_log_internal_comments.ts`：新增项目沟通服务/类型，不把 internal 响应强行改成 project；身份判断需同时接受当前有效客户和员工。
- `src/packageProjects/pages/detail/components/EmployeeInternalLogComments.tsx`、`hooks/useInternalLogComments.ts`：现有仅员工挂载逻辑不可直接用于新入口；改为项目沟通组件，兼顾客户详情入口。
- `src/packageProjects/pages/detail/index.tsx`、`sections/ProjectLogTimelineList.tsx`：在当前身份对应的项目日志页挂载，新写入能力以 can_write 为准。
- `src/utils/https.ts`：保持 POST 不自动重发，补齐旧入口 410 处理。
- 旧评论全局停用保护继续保留，新 project-comments 不能被“内部仅员工”判断或旧停用正则误拦截。

界面统一“项目沟通”“本项目客户及有权限的员工可见”。只展示新列表，员工/客户标签清晰；无旧评论历史区。访客和公开分享页不挂载、不请求、不显示新计数。

身份/租户/项目/日志/会话改变、退出登录或页面隐藏时清空内存记录与草稿；缓存键必须含角色类型和角色 ID。同一人从员工切客户也要重建，异步迟到响应不得恢复上一身份内容。撤权通过下一次请求或重新进入生效，不承诺服务端实时推送清屏。

## 部署与切换

数据库 migration：`20261010140944_project_log_project_comments.sql`，新表和两个平台系统设置，默认均 false。

| 配置 | false | true |
| --- | --- | --- |
| PROJECT_LOG_COMMUNICATION_ENABLED | 新项目沟通 GET/POST 返回停用 | 启用新接口，但权限和检测仍生效 |
| PROJECT_LOG_INTERNAL_COMMENTS_RETIRED | 旧内部入口暂时保持已有行为 | 旧内部 GET/POST 返回 410，不再读取或新增历史 |

通过已有平台系统设置管理，不允许租户覆盖。设置服务存在最长约 30 秒进程内缓存，变更后须等待并实测每个 API 实例；不声称无延迟切换。

1. 后端代码和 migration 验证后部署，回传实际版本、迁移对齐和默认开关状态。
2. 小程序完成配套并上传体验包，确认体验版本。新接口在未开放时返回 403 属预期，不是发布/回复验收通过。
3. 审核要求确认且具备开放条件后，先关闭旧内部入口，确认 410 且不再写入，再开启新沟通。短暂停用优于同时写入两套不互通记录。联验使用指定测试项目，不按审核账号或版本隐蔽切换。
4. 完成客户/员工双方发布回复、客户跨项目拒绝、员工撤权、审核期间解绑、待审/拒绝/故障、只读、身份切换、防重发及真机截图。
5. 其他公开内容核查与类目问题未解决，不安排微信提审。内容检测通过不代表类目问题自动解决。

回滚优先关闭新开关，保留历史退休状态，避免继续产生旧评论。必要时回退镜像需注意：更早的 API 不认识退休开关，可能重新启用旧内部写入；此时应采取明确停用措施，不能只依靠数据库设置。新表与审核记录保留，不删库回滚。

## 给小程序团队的回执模板

> 后端本轮已实现“项目沟通”独立 GET/POST 契约，具体生产部署和启用状态请以发布回执为准。请按本文接入本项目客户和有权限员工的文字发布/回复。历史内部和旧混合评论不迁移、不展示，日志正文/施工照片/进度历史保持不变。
>
> 注意新 visibility=project、author_type、can_write、待审 published=false，以及旧入口关闭时的 410。不得降级旧接口，也不自动重发 POST。上传配套体验包后联合验收，并回传版本、测试身份、项目/日志 ID、操作时间、请求错误 requestId 和真实手机截图。
