# Project Log Comments 权限边界重构闭环摘要

日期：2026-05-19

## 范围

- `POST /project_log_comments`
- `GET /project_log_comments`

## 本次调整

- 新增 `projectLogCommentsRepository`，集中处理 `employees`、`customers`、`project_logs`、`projects`、`project_log_comments` 的 Supabase 访问。
- 新增 `projectLogCommentsService`，集中处理作者身份解析、日志可读校验、父评论校验、评分规则、图片 URL 解析和评论返回组装。
- `ProjectLogCommentsController` 改为只处理 HTTP 输入校验、读取 JWT 用户信息、调用 service 和包装响应。
- controller 内已移除 `SupabaseDB`、`accessPolicyService` 和 `authorizationService` 直接依赖。

## 权限口径

`project-log-comments` 仍然是混合入口，不能简单套用“所有请求必须是租户员工上下文”的规则。

员工链路：

- 通过当前登录用户解析员工身份。
- 读取目标施工日志后，要求员工租户上下文与日志 `tenant_id` 一致。
- 通过 `accessPolicyService.canAccessProject(authContext, projectId, "project.read")` 校验项目可读权限。
- 员工评论不允许提交评分。

客户链路：

- 通过当前登录用户解析客户身份。
- 读取目标施工日志和项目后，要求项目 `customer_id` 等于当前客户，且项目/日志租户与客户租户一致。
- 客户只能对自己项目下的施工日志评论。
- 客户评分只允许顶层评论；已存在评分时新评分会被忽略，避免重复评分。

公共规则：

- 评论写入的 `tenant_id` 只来自施工日志，不接受前端传入。
- 父评论必须存在、未删除，并且属于同一个施工日志。
- 回复评论不允许评分。
- 图片字段统一规范为最多 9 个存储引用，返回前统一走存储 URL 解析。

## 小程序与 Admin 对接

本次是后端边界重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。
- 如后续要拆分客户专用评论接口，再另行提供对接文档。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
- `apps/api/src/controllers/project-log-comments/index.ts` 已无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
