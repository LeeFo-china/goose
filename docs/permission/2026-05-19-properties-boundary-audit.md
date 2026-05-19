# Properties 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/properties/index.ts`
- `apps/api/src/services/properties.ts`
- `apps/api/src/schema/properties.ts`

## 接口口径

房产是租户侧客户基础资料，后台 CRUD 必须在租户上下文中执行。

接口：

- `GET /properties`
- `GET /properties/:id`
- `POST /properties`
- `PATCH /properties/:id`

## 已有边界

- 列表接口支持按当前租户过滤。
- 详情接口按 `id + tenant_id` 查询。
- 创建时如传入 `customer_id`，会校验客户属于当前租户。
- 更新时如传入 `customer_id`，会校验客户属于当前租户。
- 更新接口按 `id + tenant_id` 更新。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 列表、详情、创建、更新统一使用 `getRequiredTenantContext()`。
- 创建房产时写入确定的 `tenant_id`，不再允许空租户写入。
- 平台管理员无租户上下文不能直接进入租户房产 CRUD。

## 后续注意

- `properties` 当前仍有部分逻辑在 controller 内直接访问 Supabase，后续可以拆成 repository / service。
- 客户详情下的房产接口在 `customer` controller 中，后续处理 `customer` 时需要一起核查。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
