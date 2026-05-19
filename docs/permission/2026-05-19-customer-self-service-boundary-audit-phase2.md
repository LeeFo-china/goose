# Customer Self Service 权限边界核查 Phase 2

日期：2026-05-19

## 范围

本阶段处理客户小程序自助入口中的客户项目列表和项目详情：

- `GET /customer/projects`
- `GET /customer/projects/:id`

## 本次调整

- `customerSelfServiceRepository` 增加 `listOwnedProjects()`。
- `customerSelfServiceRepository` 增加 `findOwnedProject()`。
- `customerSelfServiceService` 透出客户项目列表和详情查询能力。
- `CustomerSelfServiceController` 不再直接查询 `projects` 表获取客户项目列表和详情。
- 项目详情查询从 `customer_id` 单条件收紧为 `customer_id + tenant_id`。

## 权限口径

- 必须先解析当前登录客户身份。
- 客户身份必须属于 active 租户。
- 项目列表只返回当前客户和当前租户下的项目。
- 项目详情只允许读取当前客户和当前租户下的项目。
- 项目成员聚合仍复用 `projectMemberService.listProjectMembers()`。

## 租户边界

- 列表查询强制 `projects.customer_id = customer.id`。
- 列表查询强制 `projects.tenant_id = customer.tenant_id`。
- 详情查询强制 `projects.customer_id = customer.id`。
- 详情查询在当前客户有租户 ID 时强制 `projects.tenant_id = customer.tenant_id`。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`CustomerSelfServiceController` 仍有项目最近日志、项目日志列表、日志评论相关 Supabase 直连。

后续建议：

1. Phase 3：客户项目最近日志摘要 RPC 和项目日志列表。
2. Phase 4：日志评论列表和评论作者补全。
3. Phase 5：验收单 open ticket 相关链路核查。

## 验收

- `apps/api/src/controllers/customer-self-service/index.ts` 不再直接查询 `projects` 表获取客户项目列表和详情。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
