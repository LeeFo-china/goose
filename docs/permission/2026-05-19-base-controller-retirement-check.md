# BaseController 退役前检查

日期：2026-05-19

## 目标

确认当前通过 `createResourceRoutes()` 注册的资源都已经显式覆盖 CRUD，并给 `BaseController` 默认 CRUD 加运行时保护，避免未来误配置时继续访问裸 Supabase 查询。

## 检查结果

当前 15 个资源均已覆盖 `list/getById/create/update`。

| 资源 | list | getById | create | update | 状态 |
| --- | --- | --- | --- | --- | --- |
| `customers` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `employees` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `departments` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `payments` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `expense-requests` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `expense-request-categories` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `projects` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `roles` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `permissions` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `external-referrers` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `project-referrals` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `project-logs` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `project-acceptances` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `posts` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |
| `properties` | 已覆盖 | 已覆盖 | 已覆盖 | 已覆盖 | 通过 |

## 已加保护

`BaseController` 的默认 `list/getById/create/update` 已禁用。

如果未来某个资源误把默认方法挂到路由上，请求会返回明确错误：

```ts
BASE_CONTROLLER_CRUD_DISABLED
```

错误含义：

- 该资源没有显式实现对应 CRUD。
- 不能依赖 `BaseController` 默认查询。
- 必须在具体 controller 中显式覆盖，并在 service/repository 层落实权限和租户边界。

## 当前安全状态

- `createResourceRoutes()` 已要求显式声明 CRUD 注册配置。
- 15 个已注册资源均显式覆盖 CRUD。
- `BaseController` 默认 CRUD 已运行时禁用。
- `SupabaseDB.from()` 当前没有业务调用点。

## 后续建议

下一步可以删除 `SupabaseDB.from()` 兼容方法。删除前再次执行检查：

```bash
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
```

如果没有结果，可以删除 `apps/api/src/utils/supabase/index.ts` 中的 deprecated `from(table)` 方法。

再下一步可考虑拆分基类：

- `TenantBaseController`
- `PlatformBaseController`
- `PublicBaseController`

但这属于结构优化，不再是当前权限风险阻断项。
