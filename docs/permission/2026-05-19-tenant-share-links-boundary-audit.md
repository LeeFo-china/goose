# Tenant Share Links 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/tenant-share-links/index.ts`
- `apps/api/src/services/tenant-share-links.ts`
- `apps/api/src/repositories/tenant-share-links.ts`
- `apps/api/src/schema/tenant-share-links.ts`
- `supabase/migrations/20260509220000_create_tenant_share_links.sql`

## 接口口径

`tenant-share-links` 是员工分享和公开访问混合入口：

- 员工后台 / 员工端：创建自己的租户分享链接、查看自己的分享链接列表。
- 公开端 / 小程序绑定：通过 token 读取分享详情，并在微信登录绑定流程里完成客户绑定。

员工接口必须有租户上下文；公开详情不能要求后台登录；微信绑定走 `wechat` controller 和 RPC 的 token 校验。

员工接口：

- `POST /tenant-share-links`
- `GET /tenant-share-links`

公开接口：

- `GET /public/tenant-share-links/:token`

## 已有边界

- 创建分享链接时写入当前 `tenant_id` 和当前 `employee_id`。
- 分享链接列表只查询当前租户、当前分享员工的数据。
- 公开详情按 token 查询，返回租户和分享员工的最小展示信息。
- 客户绑定通过 `bind_customer_from_tenant_share` RPC 校验分享链接状态、过期时间、租户状态和分享员工状态。
- RPC 绑定客户时按租户内手机号去重，并写入客户来源链路。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 创建和列表接口统一使用 `getRequiredTenantContext()`。
- service 从 `assertTenantId()` 改为 `assertTenantContext()`，不再允许平台管理员无租户上下文进入租户分享链接员工接口。
- 公开详情接口保持 public token 口径，不新增登录要求。

## 后续注意

- 分享链接是员工私有列表，不是租户全量分享链接列表；如果后续 admin 需要管理租户全量分享链接，应新增独立权限点和接口。
- public token 详情只应返回展示所需字段，不应返回员工手机号等敏感信息。
- 微信小程序端本次无需改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
