# Permission 文档索引

## 当前规范

- [API Supabase Client 权限边界规范](./2026-05-19-api-supabase-client-permission-boundary.md)
- [BaseController 默认 CRUD 权限审计](./2026-05-19-base-controller-default-crud-audit.md)
- [BaseController 退役前检查](./2026-05-19-base-controller-retirement-check.md)

## 核心结论

后端 API 的主鉴权来源是后台登录 JWT、`AuthContext`、角色权限和租户上下文，不是 Supabase RLS。

业务接口在完成 Fastify auth、权限点和租户边界校验后，访问 Supabase 应优先使用：

```ts
SupabaseDB.getAdminClient()
```

普通 publish-key client 只允许用于明确的 public/anon/RLS 场景，并且代码旁必须说明原因。

## 当前遗留风险

- `get_project_create_page_data` 是旧 public/RLS RPC，当前没有 app auth context，后续需要先定义调用边界再决定是否升权。
- `payments` 已覆盖默认 CRUD，当前通过项目归属做租户边界。
- `external-referrers` 已覆盖默认 CRUD，当前按租户私有模型隔离。
- `permissions` 已覆盖默认 CRUD，并已补平台管理员校验。
- `createResourceRoutes()` 已要求显式声明 CRUD 注册配置，避免新增资源无意识暴露默认 CRUD。
- `BaseController` 默认 CRUD 已运行时禁用，误调用会返回 `BASE_CONTROLLER_CRUD_DISABLED`。
- `SupabaseDB.from()` 兼容方法已删除。

## 快速排查命令

```bash
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
rg -n "SupabaseDB\\.getClient\\(" apps/api/src -S
rg -n "createResourceRoutes\\(" apps/api/src/routes/index.ts
rg -n "override (list|getById|create|update) =" apps/api/src/controllers -S
```
