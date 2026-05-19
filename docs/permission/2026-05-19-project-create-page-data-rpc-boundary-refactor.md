# Project Create Page Data RPC 权限边界重构

日期：2026-05-19

## 范围

本阶段处理项目创建页数据 RPC：

- `POST /create_project_page`
- Supabase RPC：`get_project_create_page_data`

## 本次调整

- 新增 `projectCreatePageDataRepository`，集中调用 `get_project_create_page_data` RPC。
- 新增 `projectCreatePageDataService`，封装 `project.create` 权限校验和 repository 调用。
- `GetProjectCreatePageDataController` 不再直接依赖 `SupabaseDB`。
- `GetProjectCreatePageDataController` 不再直接调用 RPC。
- 删除 controller 中无用的 `zod any` import。

## 权限口径

- 必须先解析后台登录态 `AuthContext`。
- 必须具备 `project.create` 权限。
- 经过权限校验后，repository 使用 admin client 调用 RPC。
- RPC 返回内容仍由数据库函数负责聚合，接口响应结构不变。

## 分层边界

- controller：读取 request、解析 auth context、调用 service、包装响应。
- service：校验 `project.create` 权限，编排 RPC 数据读取。
- repository：直接访问 Supabase RPC。

## Admin / 小程序对接

本轮不需要 admin 或微信小程序改代码。

原因：

- 未改变接口路径。
- 未改变请求参数。
- 未改变响应结构。

## 验收

- `apps/api/src/controllers/common/rpc/get_project_create_page_data/index.ts` 无 `SupabaseDB` 直接依赖。
- `apps/api/src/controllers/common/rpc/get_project_create_page_data/index.ts` 无 `rpc()` 直接调用。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
