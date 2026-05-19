# Customer Self Service 权限边界核查 Phase 3

日期：2026-05-19

## 范围

本阶段处理客户小程序自助入口中的项目日志读取链路：

- `GET /customer/projects`
  - `include=home_summary` 时的最近日志摘要。
- `GET /customer/projects/:id/logs`

## 本次调整

- `customerSelfServiceRepository` 增加 `listRecentLogSummariesForProjects()`。
- `customerSelfServiceRepository` 增加 `listProjectLogs()`。
- `customerSelfServiceRepository` 增加 `findOwnedProjectLog()`。
- `customerSelfServiceRepository` 增加 `listProjectLogCommentAggregates()`。
- `CustomerSelfServiceController` 不再直接调用最近日志摘要 RPC。
- `CustomerSelfServiceController` 不再直接查询 `project_logs` 获取客户项目日志列表。
- `CustomerSelfServiceController` 不再直接查询 `project_log_comments` 获取日志聚合数据。

## 权限口径

- 必须先解析当前登录客户身份。
- 客户身份必须属于 active 租户。
- 项目必须属于当前客户和当前租户。
- 日志列表必须属于当前项目和当前租户。
- 评论聚合必须限制在当前日志集合和当前租户内。

## 租户边界

- 最近日志摘要 RPC 输入客户 ID 和项目 ID 集合，项目 ID 来自当前客户项目列表。
- 项目日志列表强制 `project_logs.project_id = project.id`。
- 项目日志列表在项目有租户 ID 时强制 `project_logs.tenant_id = project.tenant_id`。
- 评论聚合强制 `project_log_comments.log_id in 当前日志集合`。
- 评论聚合在项目有租户 ID 时强制 `project_log_comments.tenant_id = project.tenant_id`。
- 评论聚合排除 `deleted_at is not null` 的评论。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`CustomerSelfServiceController` 仍有日志评论列表和评论作者补全相关 Supabase 直连。

后续建议：

1. Phase 4：日志评论列表和评论作者补全。
2. Phase 5：验收单 open ticket 相关链路核查。
3. Phase 6：客户自助 controller 闭环摘要。

## 验收

- `apps/api/src/controllers/customer-self-service/index.ts` 不再直接调用 `get_customer_project_recent_log_summaries` RPC。
- `apps/api/src/controllers/customer-self-service/index.ts` 不再直接查询 `project_logs` 表。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
