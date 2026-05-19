# Customer Follow Up Comments 权限边界重构闭环摘要

日期：2026-05-19

## 范围

- `GET /customer_follow_ups/:followUpId/comments`
- `POST /customer_follow_ups/:followUpId/comments`

## 当前边界

- `CustomerFollowUpCommentsController` 继承 `TenantBaseController`。
- 评论列表和创建评论统一通过 `getRequiredTenantContext()` 获取租户上下文。
- controller 只处理 HTTP 参数、schema 校验、调用 service 和响应包装。
- service 负责客户跟进记录访问校验、评论回复规则、评论能力计算和图片 URL 解析。
- Supabase 访问集中在 `customerFollowUpCommentRepository`。

## 权限口径

- 查看评论要求能以 `customer.read` 访问跟进记录对应客户。
- 创建评论要求能以 `customer.update` 访问跟进记录对应客户。
- 创建评论要求当前登录态存在员工身份。
- 回复评论时校验：
  - 父评论存在。
  - 父评论状态为 `active`。
  - 父评论属于同一条跟进记录。
  - 父评论不是二级回复。
- 评论图片返回前统一走存储 URL 解析。

## 租户边界

- `customer_follow_up_comments` 当前没有冗余 `tenant_id` 字段。
- 租户边界依赖 `customer_follow_ups -> customers.tenant_id`。
- repository 查询跟进记录访问信息时返回客户 `tenant_id`，由 `accessPolicyService.canAccessCustomer()` 完成租户匹配。
- 评论创建时使用后端员工身份，不接受前端传入作者。

## 小程序与 Admin 对接

本轮是后端边界闭环确认，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/customer-follow-up-comments/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/customer-follow-up-comments.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
