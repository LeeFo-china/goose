# Customer Self Service 权限边界核查 Phase 1

日期：2026-05-19

## 范围

本阶段只处理客户小程序自助入口中的客户身份和用户资料链路：

- `GET /auth/me/customer-context`
- `GET /auth/me/profile`
- `PATCH /auth/me/profile`
- `GET /customer/profile`

## 本次调整

- 新增 `apps/api/src/repositories/customer-self-service.ts`。
- 新增 `apps/api/src/services/customer-self-service.ts`。
- 将旧 `customers.user_id` 客户身份查询下沉到 repository。
- 将 membership 客户身份对应的客户档案查询下沉到 repository。
- 将 `user_profiles` 读取和 upsert 下沉到 service / repository。
- Controller 保留身份来源策略、租户状态校验和响应组装。

## 权限口径

- 所有接口必须有登录用户。
- 客户身份解析继续支持 `AUTH_IDENTITY_SOURCE=legacy|dual|membership`。
- `membership` 模式只使用 `user_business_memberships` active customer 身份。
- `dual` 模式合并 membership 和旧 `customers.user_id`，并继续阻止多客户档案自动进入。
- 客户租户不存在或租户非 active 时返回 `TENANT_NOT_AVAILABLE`。

## 租户边界

- token 带 `tenant_id/customer_id` 时，查询会按对应租户和客户 ID 过滤。
- membership 身份会校验 `membership.tenant_id = customers.tenant_id`。
- 返回客户上下文前会检查租户状态。
- 用户资料 `user_profiles` 只按当前 auth user ID 读写。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`CustomerSelfServiceController` 仍有项目、项目日志、评论相关 Supabase 直连。

后续建议继续分阶段：

1. Phase 2：客户项目列表和项目详情。
2. Phase 3：客户项目最近日志摘要和日志列表。
3. Phase 4：客户项目日志评论列表。
4. Phase 5：验收单 open ticket 相关链路核查。

## 验收

- 身份和用户资料相关查询不再由 controller 直接访问 Supabase。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
