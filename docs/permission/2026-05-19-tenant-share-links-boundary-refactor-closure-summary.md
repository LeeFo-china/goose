# Tenant Share Links 权限边界重构闭环摘要

日期：2026-05-19

## 范围

员工侧：

- `POST /tenant-share-links`
- `GET /tenant-share-links`

公开侧：

- `GET /public/tenant-share-links/:token`

## 本次调整

- `tenantShareLinkRepository` 去掉动态 `from(any)` 包装，改为显式 `this.client.from(...)` 调用。
- 公开分享详情查询员工信息时只读取 `id/name`，不再读取员工手机号。
- controller 和 service 原有权限边界保持不变。

## 员工侧权限口径

- 员工创建分享链接和查看自己的分享链接列表，必须通过 `getRequiredTenantContext()` 获取租户上下文。
- service 使用 `accessPolicyService.assertTenantContext()`，平台管理员无租户上下文不能进入租户员工分享链路。
- 创建分享链接时 `tenant_id` 来自当前租户上下文，`share_employee_id` 来自当前员工身份，不接受前端传入。
- 分享链接列表只返回当前租户、当前员工创建的链接。

## 公开侧权限口径

- `GET /public/tenant-share-links/:token` 是 public token 入口，不要求后台登录态。
- public 详情只返回绑定页展示所需字段：
  - token、source、target、status、expires_at、available
  - tenant 的 `id/name/slug`
  - share_employee 的 `id/name`
- 不返回员工手机号等敏感信息。
- 可用状态由分享链接状态、过期时间和租户状态共同计算。

## 微信绑定链路

- 微信绑定客户不直接走 public detail，而是通过 `bind_customer_from_tenant_share` RPC。
- RPC 负责校验分享链接状态、过期时间、租户状态、分享员工状态、租户内手机号去重和客户来源链路写入。
- service 负责把 RPC 错误映射成明确业务错误码，并发送员工分享客户绑定通知。

## 小程序与 Admin 对接

本轮是后端边界收紧，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/tenant-share-links/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/tenant-share-links.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- public 详情员工查询不再读取手机号。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
