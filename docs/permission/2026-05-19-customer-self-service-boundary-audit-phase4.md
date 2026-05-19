# Customer Self Service 权限边界核查 Phase 4

日期：2026-05-19

## 范围

本阶段处理客户小程序自助入口中的日志评论读取链路：

- `GET /customer/projects/:id/logs/:logId/comments`

## 本次调整

- `customerSelfServiceRepository` 增加 `listProjectLogComments()`。
- `customerSelfServiceRepository` 增加 `listCommentAuthorEmployees()`。
- `customerSelfServiceRepository` 增加 `listCommentAuthorCustomers()`。
- `CustomerSelfServiceController` 不再直接查询 `project_log_comments` 获取评论列表。
- `CustomerSelfServiceController` 不再直接查询 `employees` / `customers` 补全评论作者。
- `CustomerSelfServiceController` 删除 `SupabaseDB` 直接依赖。

## 权限口径

- 必须先解析当前登录客户身份。
- 客户身份必须属于 active 租户。
- 项目必须属于当前客户和当前租户。
- 日志必须属于当前项目和当前租户。
- 评论列表必须属于当前日志和当前租户。
- 评论列表排除已删除记录。

## 租户边界

- 项目查询强制 `projects.customer_id = customer.id`。
- 项目查询在当前客户有租户 ID 时强制 `projects.tenant_id = customer.tenant_id`。
- 日志归属校验强制 `project_logs.id = logId` 和 `project_logs.project_id = projectId`。
- 日志归属校验在项目有租户 ID 时强制 `project_logs.tenant_id = project.tenant_id`。
- 评论列表在项目有租户 ID 时强制 `project_log_comments.tenant_id = project.tenant_id`。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`CustomerSelfServiceController` 当前已无 Supabase 直连。

后续建议：

1. Phase 5：验收单 open ticket 相关链路核查。
2. Phase 6：客户自助 controller 闭环摘要。

## 验收

- `apps/api/src/controllers/customer-self-service/index.ts` 无 `SupabaseDB`、`getAdminClient`、`getClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
