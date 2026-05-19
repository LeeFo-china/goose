# Properties 权限边界重构闭环摘要

日期：2026-05-19

## 范围

- `GET /properties`
- `GET /properties/:id`
- `POST /properties`
- `PATCH /properties/:id`
- `PUT /properties/:id`

## 本次调整

- 新增 `propertyRepository`，集中处理 `properties` 和客户归属校验访问。
- 扩展 `propertySer`，将详情、创建、更新逻辑从 controller 下沉到 service。
- `PropertyController` 移除 Supabase 直连，只保留租户上下文、schema 校验、调用 service 和响应包装。
- `properties` schema 补充 `CreatePropertyInput`、`UpdatePropertyInput` 类型导出，供 service/repository 使用。

## 权限口径

- 房产 CRUD 统一要求租户上下文。
- 平台管理员无租户上下文不能直接进入租户房产 CRUD。
- 列表、详情、更新均按 `tenant_id` 过滤。
- 创建时 `tenant_id` 来自后端租户上下文，不接受前端传入。
- 创建和更新时如果传入 `customer_id`，必须校验客户属于当前租户。

## 小程序与 Admin 对接

本轮是后端边界重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/properties/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/properties.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
