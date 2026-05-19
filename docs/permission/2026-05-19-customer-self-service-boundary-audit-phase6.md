# Customer Self Service 权限边界核查 Phase 6

日期：2026-05-19

## 范围

本阶段对客户小程序自助入口做闭环摘要，覆盖：

- `GET /auth/me/customer-context`
- `GET /auth/me/profile`
- `PATCH /auth/me/profile`
- `GET /customer/profile`
- `GET /customer/projects`
- `GET /customer/projects/:id`
- `GET /customer/project-acceptances`
- `POST /customer/project-acceptances/open-ticket/verify`
- `GET /customer/project-acceptances/:id`
- `GET /customer/projects/:id/logs`
- `GET /customer/projects/:id/logs/:logId/comments`

## 分层状态

- `CustomerSelfServiceController` 只负责 HTTP 参数读取、Zod 校验、调用 service、包装响应。
- 客户身份、用户资料、项目、日志、评论相关数据访问已下沉到 `customerSelfServiceService` / `customerSelfServiceRepository`。
- 验收单 open ticket 链路由 `projectAcceptanceService` 编排，并通过 `projectAcceptanceRepository` / `projectAcceptanceOpenTicketRepository` 访问数据。
- 文件 URL 解析仍通过 `resolveStoredFileUrl()` 做纯领域数据转换，不触达数据库。

## 权限口径闭环

- 登录态客户入口必须先解析 `request.user.sub`。
- 客户档案必须匹配当前租户上下文和可选 customer scope。
- 客户所属租户必须为 active。
- 项目列表和详情必须限制在当前客户和当前租户内。
- 项目日志和评论必须先校验项目归属，再按项目 / 日志 / 租户读取。
- 验收单登录态访问必须限制在当前客户租户内。
- 验收单 ticket 访问必须同时匹配 ticket、验收单 ID、项目 ID，并确认 ticket 所属租户 active。

## 租户边界闭环

- `customers.tenant_id` 是登录态客户入口的租户来源。
- 项目读取强制 `projects.customer_id = customer.id`。
- 项目读取在客户有租户 ID 时强制 `projects.tenant_id = customer.tenant_id`。
- 日志读取在项目有租户 ID 时强制 `project_logs.tenant_id = project.tenant_id`。
- 评论读取在项目有租户 ID 时强制 `project_log_comments.tenant_id = project.tenant_id`。
- 验收单登录态读取强制 `project_acceptances.tenant_id = customer.tenant_id`。
- 验收单 ticket 读取强制 `project_acceptances.tenant_id = ticket.tenant_id`。

## 已完成阶段

1. Phase 1：客户身份、用户资料链路下沉。
2. Phase 2：客户项目列表和详情读取链路下沉。
3. Phase 3：客户项目日志列表、最近日志摘要、评论聚合链路下沉。
4. Phase 4：日志评论列表和评论作者补全链路下沉。
5. Phase 5：验收单 open ticket 链路权限边界收紧。

## 验收

- `apps/api/src/controllers/customer-self-service/index.ts` 无 `SupabaseDB` 直接依赖。
- `apps/api/src/controllers/customer-self-service/index.ts` 无 `getAdminClient` / `getClient` / `rpc` 直接调用。
- `apps/api/src/controllers/customer-self-service/index.ts` 当前 `.from(` 命中均为 `Array.from()`，不是 Supabase query builder。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
