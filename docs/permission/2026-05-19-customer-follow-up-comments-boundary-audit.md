# Customer Follow Up Comments 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer-follow-up-comments/index.ts`
- `apps/api/src/services/customer-follow-up-comments.ts`
- `apps/api/src/repositories/customer-follow-up-comments.ts`
- `apps/api/src/schema/customer-follow-up-comments.ts`

## 接口口径

客户跟进评论是租户侧客户跟进协作数据，后台接口必须在租户上下文中执行。

接口：

- `GET /customer_follow_ups/:followUpId/comments`
- `POST /customer_follow_ups/:followUpId/comments`

## 已有边界

- 查看评论要求能以 `customer.read` 访问跟进记录对应客户。
- 创建评论要求能以 `customer.update` 访问跟进记录对应客户。
- 创建评论要求当前登录态存在员工身份。
- 回复评论时会校验父评论存在、状态 active、属于同一条跟进记录且不是二级回复。
- 评论图片返回前会经过存储 URL 解析。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 评论列表和创建评论统一使用 `getRequiredTenantContext()`。
- service 在跟进记录访问校验前要求租户上下文。
- repository 查询跟进记录访问信息时补充客户 `tenant_id`，确保 `canAccessCustomer()` 能做租户匹配。

## 后续注意

- `customer_follow_up_comments` 表当前没有冗余 `tenant_id`，租户边界依赖 `customer_follow_ups -> customers.tenant_id`。
- 后续如评论列表性能压力增加，可以评估给评论表增加 `tenant_id` 并通过业务写入维护。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
