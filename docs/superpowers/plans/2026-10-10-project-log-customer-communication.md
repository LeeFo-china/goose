# 项目日志客户参与：实施与发布计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 本项目客户和有项目权限的员工能够围绕施工日志发布、回复文字，内容通过服务端检测后对项目参与人可见。

**Architecture:** 新增明确的项目沟通契约与独立存储，复用既有微信内容检测、员工项目授权和客户项目归属校验。历史评论不迁移、不展示，记录保留；旧内部接口支持协调停用，旧混合评论不恢复；后端按 controller/service/repository 分层。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL；orange/Taro 由小程序团队配套。

状态：2026-10-10，用户已确认不兼容历史展示，代码已实现并进入最终审查；尚未部署。本计划以不迁移、不展示、保留数据及新旧入口协调切换为准。

## 范围与兼容

- 客户必须以当前选中的客户身份登录，服务端核实有效身份绑定、租户以及 projects.customer_id 与客户匹配；知道项目/日志 UUID 不构成授权。
- 员工继续要求在职、同租户、project.read；写入再要求 project_log.create 和租户可写。客户写入也受租户只读/停用状态约束，不授予员工权限。
- 审核前后重新校验身份、项目归属和权限，不能因为同手机号有员工身份而回退授权。
- 仅文字与回复，1–500 字符；不恢复评论图片、评分、编辑、公开评论或访客参与。
- 原 internal-comments 在切换时 GET/POST 均返回 410 PROJECT_LOG_INTERNAL_COMMENTS_RETIRED；数据库记录保留。新记录不进入旧评论摘要、公开分享或图库。
- 不自动迁移内部历史记录，也不重新显示未经新审核链路处理的旧混合评论。
- 新版默认使用“项目沟通”，提示“本项目客户及有权限的员工可见”；历史内部记录不展示，不开放给客户。
- 新能力单独设置部署开关，默认关闭；另有独立旧内部入口停用开关，默认未停用。两者通过现有系统设置管理，不复用全局旧评论停用开关。不按审核账号、审核时间或客户端版本隐蔽切换功能。

## 拟议接口契约

```text
GET  /project_logs/:logId/project-comments?page=1&pageSize=20
POST /project_logs/:logId/project-comments
Authorization: Bearer <当前选中身份会话>
```

```json
{ "content": "请确认水电施工记录", "parent_id": null }
```

列表仍返回 `data.list/total/page/pageSize`，pageSize 默认 20、最大 100，按 created_at/id 稳定升序。新增 `data.can_write` 供输入区使用，最终写权限仍由 POST 实时判断。

记录返回 `id/log_id/parent_id/content/created_at/author_id/author_type/author/images/moderation_status/visibility/published`。`author_type` 为 employee 或 customer，`author` 为 `{id,name}` 或 null；不返回手机号、openid 或内部审核 trace。`visibility` 使用新值 `project`，不能沿用 internal。images 固定空数组。

正常返回 `approved + published=true`；待审返回 `pending + published=false + code=CONTENT_PENDING`，不返回待审正文、不加入列表。拒绝 422 CONTENT_REJECTED；审核异常 503 CONTENT_CHECK_UNAVAILABLE；图片 403 COMMENT_MEDIA_DISABLED；无权 403 FORBIDDEN；开关关闭 403 COMMENT_COMMUNICATION_DISABLED；租户状态沿用既有契约；无新编辑接口。

POST 无自动重试；本期不新增幂等键，网络结果不确定时刷新核对。回复父记录必须属于同租户同日志的已通过项目沟通记录，不能引用 internal-comments 或旧混合评论。

## Task 1：隔离存储与数据库约束

拟新增：`supabase/migrations/20261010140944_project_log_project_comments.sql`，`supabase/tests/project_log_project_comments.sql`。

- [x] 使用新的 project_log_project_comments 表；审计字段沿用现有模式。employee_author_id/customer_author_id 外键二选一，并与 author_type 一致；响应层转换为 author_id。
- [x] 使用 tenant_id/log_id/id 的联合唯一键及父评论外键，触发器校验日志租户、作者归属、已通过父评论；正文和身份范围不可编辑后沿用原审核结果。
- [x] RLS 开启，撤销 anon/authenticated 直接访问，只授予服务器必要权限；approved 分页索引覆盖 tenant_id/log_id/created_at/id。
- [x] 在隔离数据库验证客户/员工正常写入，以及跨租户、跨日志、内部父评论、无效作者和更改正文的拒绝；分页执行计划命中索引。禁止生产手工造审核数据。

## Task 2：身份、审核及分页服务

拟新增：`apps/api/src/schema/project-log-project-comments.ts`、`apps/api/src/repositories/project-log-project-comments.ts`、`apps/api/src/services/project-log-project-comments.ts`、`apps/api/src/services/project-log-project-comments.test.ts`。

复用：`apps/api/src/services/wechat-content-safety-gateway.ts`、员工 authorization/access-policy 与现有 customer-self-service 身份解析和 owned-project 校验。实现前沿真实调用链定位可复用入口，不复制整套身份解析。

- [x] 先编写失败用例：客户只能读写自己项目；员工按现有读写权限；客户不能借同手机号员工权限读其他项目；访客、跨租户、解绑/离职均拒绝。
- [x] 校验请求白名单，客户端不可提交身份、审核状态或可见范围。数据访问只在 repository，作者按类型批量查询，每类最多一个分页范围内的查询。
- [x] 复用微信文字检测，只有 pass 发布；review 隔离、risky 拒绝、超时或配置缺失不落可见数据；有效微信绑定不能由 body 提供。
- [x] 实现审核前后授权重查，并测客户项目归属变更、员工撤权、父评论失效、租户进入只读期。
- [x] 新开关关闭时 GET/POST 返回统一停用契约；不得修改旧 COMMENT_COMMUNICATION_ENABLED。

## Task 3：路由及完整 HTTP 契约

修改：`apps/api/src/controllers/project-log-comments/index.ts`。拟新增：`apps/api/src/services/project-log-project-comments-http.test.ts`。

- [x] 沿现有 registerExtraRoutes 注册新 GET/POST；controller 只负责请求、校验、service 调用和 ResponseHandler 包装。
- [x] HTTP 回归覆盖正常文字、回复、pending、422、503、权限拒绝、分页边界、伪造字段及图片拒绝。
- [x] 验证新表记录不进入 customer 旧摘要、图库、访客或分享输出；internal-comments 对客户仍拒绝。
- [x] 执行新增测试、原内部评论/内容安全/权限及旧评论停用回归；API typecheck、build 和 diff 检查通过后进入发布准备。

## Task 4：对接与生产发布

- [x] 在 gooes `docs/miniprogram/` 输出最终接口契约及请求/响应实例，逐项标记拟议字段是否已经实现。orange 只读，禁止代改客户端。
- [ ] 小程序先按最终契约接入体验包；保留未上线/关闭时的受控提示，不降级请求旧评论接口。
- [ ] 按 `.github/workflows/migrate-production-database.yml` 检查待执行 migration、备份及应用；用 supabase migration list 验证 Local/Remote 对齐。
- [ ] 按 `.github/workflows/release-production.yml` 部署 API，核验 revision/health，先验证默认关闭及旧版本兼容。
- [ ] 客户参与正式开放前，核实微信对当前项目沟通实际形态的审核要求。部署成功不等于类目问题解决，不承诺可通过审核。
- [ ] 使用明确指定的测试项目及体验成员联验，通过正常业务接口发布/回复；其他分支在隔离环境受控复现并标明证据来源，不冒充微信或生产实测。
- [ ] 回传部署版本、migration 状态、API 结果、requestId/记录 ID、真机版本及截图；全部门槛通过后再安排小程序提审与正式发布。

回滚：优先关闭新能力并保持旧入口停用；保留新表和审计记录，不删除数据。回退到不支持停用开关的旧 API 可能重新开启内部写入，必须单独处理，不能仅依靠数据库配置。小程序遇到关闭响应停止发送并清空项目沟通内容；原施工日志展示保持独立。

## 联合验收门槛

| 场景 | 通过标准 |
| --- | --- |
| 客户 A 项目 A | 正常发布、回复；有权限员工读取并回复，双方刷新可见 |
| 客户 A 项目 B | GET/POST 均拒绝；不能仅替换 logId/parent_id 越权 |
| 员工只读/撤权 | 输入按服务端 can_write 控制；下一次请求及时拒绝；审核期间撤权不落库 |
| 双身份 | 同一账号员工/客户/访客切换不复用列表、草稿、计数，不接受迟到响应 |
| 审核 | 待审/拒绝/异常正文不出现在其他参与人的列表或摘要 |
| 旧版本 | 切换前旧版本行为不变；切换后 internal-comments 读写返回明确更新提示，历史记录不返回 |
| 分享/图库/上传 | 不带项目沟通内容和计数，旧评论与评论图片仍停用 |
| 手机证据 | 版本、双方发布回复、越权/撤权、身份切换、异常提示的真实截图及时间 |

## 可直接发给小程序团队的预告

> 下一轮计划增加“项目沟通”：仅本项目客户与有项目权限的员工可查看、发布和回复文字。保留服务端自动内容检测，首期不开放评论图片、评分、编辑或访客参与。
>
> 后端将新增独立的 project-comments 接口，不直接放宽现有 internal-comments。已有内部记录和旧混合评论均不迁移、不展示，记录保留；旧内部入口在切换时关闭。本文路由和字段目前是拟议契约，请等待最终接口回执后接入，不将生产现有版本视为已支持客户。
>
> 客户端入口提示“本项目客户及有权限的员工可见”；区分 employee/customer 作者，按服务端 can_write 控制输入；待审不可插入列表，失败不自动重发、不降级到旧接口。身份/租户/项目切换及退出时清空记录、计数和草稿，忽略迟到响应。
>
> 后端部署后会回传版本、正式契约与 smoke 结果；请上传配套体验包，联合验收双方发布回复、跨项目拒绝、撤权、审核隔离和身份切换，补齐手机截图。体验包上传、后端部署与微信提审分别确认；类目问题及其他公开内容核查未解决前不安排提审。


## 实施补充

已实现额外的 `project-log-communication-access.ts` service/repository、独立 rollout service、平台配置定义。员工读取范围通过 `can_access_project_communication_scope` 单项目实时 RPC，避免旧可见项目 ID 列表的缓存及全量查询；客户读取复用 owned-project repository，直接检查当前 membership。

兼容当前客户签发链路缺少 login_channel、roles 可能包含账号多身份的有效凭证；以 customer_id 且无 employee_id 选中客户范围，无员工授权回退。GET 再检查实时 OAuth，POST 检测前后检查。只读员工不调用会抛无权限的写方法，返回 can_write=false。

正式接口交接：`docs/miniprogram/2026-10-10-project-log-project-comments-handoff.md`。未来客户端工作、生产 migration/发布及手机联验状态独立记录，不以本地测试代替上线验收。
