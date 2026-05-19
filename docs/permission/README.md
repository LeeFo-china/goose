# Permission 文档索引

## 当前规范

- [API Supabase Client 权限边界规范](./2026-05-19-api-supabase-client-permission-boundary.md)

## 核心结论

后端 API 的主鉴权来源是后台登录 JWT、`AuthContext`、角色权限和租户上下文，不是 Supabase RLS。

业务接口在完成 Fastify auth、权限点和租户边界校验后，访问 Supabase 应优先使用：

```ts
SupabaseDB.getAdminClient()
```

普通 publish-key client 只允许用于明确的 public/anon/RLS 场景，并且代码旁必须说明原因。

## 当前遗留风险

- `BaseController` 默认 CRUD 仍使用 `SupabaseDB.from()`，因为它缺少统一租户过滤，不能直接切成 admin client。
- `get_project_create_page_data` 是旧 public/RLS RPC，当前没有 app auth context，后续需要先定义调用边界再决定是否升权。

## 快速排查命令

```bash
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
rg -n "SupabaseDB\\.getClient\\(" apps/api/src -S
```
