# 权限线基础整改闭环验收

日期：2026-05-19

## 结论

本轮后端权限线基础整改已闭环。

已完成：

- `SupabaseDB.from()` 兼容方法已删除。
- `BaseController` 默认 CRUD 已禁用。
- `createResourceRoutes()` 已要求显式声明 CRUD 注册配置。
- `permissions` 平台权限字典已限制为平台管理员。
- `payments` 已脱离默认 CRUD，通过项目归属做租户边界。
- `external-referrers` 已脱离默认 CRUD，并改为租户私有模型。
- 当前业务鉴权后的 Supabase 访问已显式使用 `getAdminClient()`。

仍保留：

- `get_project_create_page_data` 旧 public/RLS RPC 仍使用 `SupabaseDB.getClient()`。
- 该路由当前没有 app auth context，不能直接升权到 admin client；后续需要先定义调用边界。

## 验收命令

### 类型检查

```bash
bun run api:typecheck
```

结果：通过。

### Diff 空白检查

```bash
git diff --check
```

结果：通过。

### `SupabaseDB.from()` 扫描

```bash
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
```

结果：无业务调用点。

### `SupabaseDB.getClient()` 扫描

```bash
rg -n "SupabaseDB\\.getClient\\(" apps/api/src -S
```

结果：

```text
apps/api/src/controllers/common/rpc/get_project_create_page_data/index.ts:23
```

说明：该调用是旧 public/RLS RPC，已在代码中标注 legacy public/RLS RPC。

### `createResourceRoutes()` 扫描

```bash
rg -n "createResourceRoutes\\(" apps/api/src/routes/index.ts
```

结果：15 个资源全部显式传入 `fullCrudRoutes`。

资源清单：

- `customers`
- `employees`
- `departments`
- `payments`
- `expense-requests`
- `expense-request-categories`
- `projects`
- `roles`
- `permissions`
- `external-referrers`
- `project-referrals`
- `project-logs`
- `project-acceptances`
- `posts`
- `properties`

## 当前架构口径

### 后端业务接口

后台 API 的主鉴权来源是：

- Fastify auth
- `AuthContext`
- 角色权限
- 租户上下文
- 业务访问策略

经过业务鉴权后的 Supabase 访问，应使用：

```ts
SupabaseDB.getAdminClient()
```

同时必须显式落实租户边界或业务访问边界。

### Public/RLS 场景

只有明确的 public/anon/RLS 场景可以使用：

```ts
SupabaseDB.getClient()
```

使用时必须在代码旁说明原因。

### 默认 CRUD

`BaseController` 默认 CRUD 只保留接口形态，不再执行数据库访问。

如果误调用，会返回：

```text
BASE_CONTROLLER_CRUD_DISABLED
```

## 后续建议

下一阶段不再是堵漏洞，而是结构优化。

建议顺序：

1. 清理或重构 `get_project_create_page_data` 旧 public RPC。
2. 增加 CI 权限扫描脚本，防止再次引入 `SupabaseDB.from()` 或未显式声明的资源路由。
3. 拆分更明确的基类：
   - `TenantBaseController`
   - `PlatformBaseController`
   - `PublicBaseController`
4. 继续把遗留 controller 内直接访问数据库的逻辑迁移到 service/repository。
