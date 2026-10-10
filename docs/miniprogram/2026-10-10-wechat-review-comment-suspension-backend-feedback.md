# 微信审核整改：无相关类目资质时停用评论交流

日期：2026-10-10。用户明确“现在不具备相关的类目资质”，本轮执行 orange 交接文档 `docs/miniprogram/2026-10-10-wechat-review-content-safety-handoff.md` 的路径 B。

**当前状态：API/Admin 已部署生产 `v2026.10.10.1`（8112d1636），37项生产接口验收通过；客户端团队已上传2026.10.10.1，联合真机与整体内容安全验收尚未通过，暂不提审。** 详见[生产部署与联合验收回执](./2026-10-10-comment-suspension-production-acceptance.md)。gooes侧未修改orange。没有接入内容安全审核服务，不能将本次结果描述为“内容审核已完成”。

## 根因和停用范围

原项目日志、客户跟进、访客图库评论创建/回复在业务校验后直接写入；服务端未见微信内容安全审核链路。只隐藏输入框不足以阻止旧客户端或直接调用 API。除三类常规接口，还发现客户项目详情独立评论列表、跟进最新预览和专用图片直传入口。

采用与租户、角色、客户端版本、环境无关的产品级停用。保留历史记录，不删除评论、不伪造历史审核状态；有权限的超管仍可查看、隐藏或删除历史图库评论，但不得恢复公开。后台已移除“恢复”按钮，并注明记录状态不代表当前对用户公开。

| 入口 | 本轮行为 |
| --- | --- |
| GET /project_log_comments?log_id=UUID | 停用读取，不返回历史正文或图片 |
| POST /project_log_comments | 停用发布、附图、评分和 parent_id 回复 |
| GET /customer/projects/:id/logs/:logId/comments | 停用客户详情独立评论读取 |
| GET /customer_follow_ups/:followUpId/comments | 停用跟进评论读取 |
| POST /customer_follow_ups/:followUpId/comments | 停用评论、附图和回复 |
| GET /visitor/picture-library/assets/:id/comments | 停用图库公开评论读取 |
| POST /visitor/picture-library/assets/:id/comments | 停用访客评论和 image_file_ids 附图 |
| POST /platform/picture-library/comments/:id/show | 即使有治理权限也不能恢复公开 |
| 平台评论列表、hide、DELETE | 既有权限与治理行为保留 |

上述评论未注册独立编辑接口，不新增编辑能力；PATCH /project_log_comments/:id 的路由验证为404。旧客户端不能通过 create/parent_id 绕过停用。既有认证、参数、对象权限门禁继续存在，未登录、无权限或参数非法可能优先返回401/403/400，不能要求所有非法请求都返回停用码。

嵌入数据同步处理：客户跟进 `comment_count=0`、`latest_comment_preview=null`，`can_comment/can_view_comments/can_moderate_comments=false`；项目日志摘要和客户评论聚合不再读取历史评论；员工快速加载、客户快速加载及近期日志、图库列表/详情的评论/评分摘要屏蔽。这里的0表示当前可展示数量，不是删除了数据库历史记录。

## 当前可依赖的返回契约

通过既有前置校验后，停用入口返回 HTTP **403**：

```json
{
  "success": false,
  "message": "交流功能暂未开放",
  "code": "COMMENT_COMMUNICATION_DISABLED",
  "requestId": "服务端请求标识"
}
```

使用现有 `Errors.business` 和统一错误处理，不返回200、空成功对象或“待审核”伪状态。无需新增接口字段。客户端按 code 区分正常鉴权错误与产品停用：显示中性提示，停止重试，不清登录身份、不跳转登录；已有编辑输入保留为本地草稿但不自动补发，不乐观插入列表。

本轮只有 **停用** 契约已实现。“内容违规 / 待审核 / 暂不可审核”属于重新开放时的审核链路，本轮未实现、不能对接为现有返回值。届时需另行确定稳定状态码与版本绑定的非公开审核模型，覆盖文本、图片、编辑、回复、异步回调验证与幂等；失败不能直接公开。资质不足时即便接入检测也不能直接恢复交流。

## 评论图片与历史数据

以下三个 scene 统一拒绝：`project_log_comment`、`customer_follow_up_comment`、`picture_comment`。

- POST /uploads/cos/direct-init：存储服务签发上传凭证前拦截。
- POST /uploads/cos/direct-complete：完成确认及注册对象前拦截，旧凭证不能经该接口登记为可用评论图片。
- 存储服务的代理上传、COS/Supabase 上传实现和 registerExistingCosObject 同样有场景限制，不能只绕过 controller。
- GET /uploads/public-url：标准场景路径、fileId 转换均拒绝评论图片；平台身份也不能通过该转换入口取公开 URL。历史治理页面不再请求此类图片预览，改为显示附件数量及“图片访问已停用”；文字与记录治理保留。
- 施工日志、验收、收款凭证、进件资料等其他上传场景保持原有权限规则。

**历史公开 URL、客户端缓存和已签发的对象存储上传授权不会因本次 API 代码自动失效。** 上线前需由存储运维针对评论专用路径核实访问控制和 CDN 缓存，必要时按批准方案隔离历史对象、失效缓存及旧授权；不批量删除或影响其他业务文件。数据库元数据/权限如需变更必须使用 migration。未经这一步验证，不能宣称所有历史评论图片已不可访问。

生产只读权限核验：`project_log_comments`、`customer_follow_up_comments`、`picture_asset_comments`、`picture_asset_comment_images` 均启用RLS；anon/authenticated 的 SELECT、INSERT 为 false，authenticated 的 UPDATE 亦为 false。本轮未更改这些权限，未做远端DML或DDL。此证据只覆盖表权限，不等于对象存储直链已封闭。

## orange 团队配套范围

客户端团队已按此范围完成停用并上传测试包；以下保留原对接范围，当前待办是体验版真机与旧入口验收。客户端回执位于orange的 `docs/miniprogram/2026-10-10-comment-suspension-frontend-feedback.md`。

本轮仅只读核对以下模块，未改动 orange：

| 场景 | 已定位文件/模块 | 需要处理 |
| --- | --- | --- |
| 员工项目日志评论 | `src/packageProjects/pages/detail/hooks/useProjectComments.ts`、`sections/ProjectLogTimelineList.tsx`、`sections/ProjectDetailPopups.tsx`、`components/CommentPopup.tsx` | 移除评论数量/按钮、列表、弹层、回复、评分和上传入口，停止自动加载 |
| 客户项目评论 | `src/packageCustomerPortal/pages/customer-project-detail/hooks/useCustomerProjectComments.ts`、`components/CustomerProjectCommentPopup.tsx`、`components/CustomerProjectTimelineSection.tsx` | 同步停用，避免详情加载仍请求评论导致整个业务页报错 |
| 客户跟进评论 | `src/packageCustomers/pages/customerDetail/hooks/useCustomerFollowUpComments.ts`、`components/FollowUpCommentPopup.tsx`、`components/CustomerDetailContent.tsx` | 移除最新预览、评论/回复/图片操作及自动加载 |
| 访客图库评论 | `src/packageVisitor/pages/picture-library-detail/components/PictureCommentSection.tsx` 与 `index.tsx` | 移除整个评论区、发布入口和新增后计数回调 |
| 共享请求与附件 | `src/services/project_log.ts`、跟进/图库对应 service、评论上传调用点 | 清理自动请求与后台补发，统一处理停用码 |

删除客户端本地可见评论缓存和待发送队列中的自动发送行为；收藏/点赞等非评论功能不由本次后端变更主动停用。体验版、提审版与正式版使用同一真实功能范围，不使用审核账号或审核环境特判。

## 其余内容发布仍须核验

停止评论不代表所有用户可编辑内容已审核，也不保证通过微信审核。施工日志及其分享页面、验收/客服文本与附件、昵称/头像、企业和项目公开内容需要继续按实际“谁能写、谁能看、是否公开、是否有审核”梳理。本次不擅自关闭装修交付的核心业务记录。

若剩余某一公开发布入口没有必要的服务端审核，提审前应同步停用该公开发布/展示能力，或完成审核再开放；不能因为删除评论就把它标成安全。微信类目是否满足，以当前主体实际申请页面及审核反馈为准。本轮访问官方内容安全文档未成功，没有据此编造最新参数或资质清单。

## 验证与上线顺序

本地针对真实服务、存储实现和 Fastify 路由验证：

- 新增停用测试10项通过，覆盖各身份的文字/回复/图片、历史读取、预览与能力、旧上传完成、按路径/fileId取图片、超管恢复限制、统一HTTP错误和未登录401；断言拒绝发生于数据库/存储访问之前。
- 相邻施工日志4项、上传服务16项、直传28项、上传controller 23项、员工日志快速加载1项通过；合计 **82项通过**。测试文件按独立进程运行以避免现有模块 mock 串扰；停用与员工日志快速加载也联合通过。
- API 和 Admin 类型检查、API构建、全仓文件行数检查与 diff检查通过。
- 2026-10-10生产API/Admin部署成功，37项接口验证通过；历史有效签名URL部署后仍可读取。已补员工模拟器截图，未完成四类真机验收，也未重新提审；详见生产回执。

后续顺序：完成历史直链/缓存闭环及剩余公开内容整改 → 已上传测试包完成员工/客户/访客真机与旧入口回归 → 如实更新提审说明，再重新提交。当前没有满足最终提审条件。

重新开放时需单独发布变更：资质、服务端内容审核、历史内容可见性、客户端非公开状态展示均通过验收后，再按实际功能重新提审；不能仅将策略常量改成 true。
