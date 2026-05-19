# API Supabase Client 权限边界规范

日期：2026-05-19

## 背景

当前 API 使用自有后台登录 JWT、`AuthContext`、角色权限和租户上下文做业务鉴权。Supabase RLS 不是后台登录态的主鉴权来源，因为 API 进程调用 Supabase 时没有携带当前后台用户的 Supabase Auth session。

如果后端业务代码使用 publish key 创建的普通 Supabase client，Supabase 会把请求视为 `anon`。在启用 RLS 的表上，这会导致“业务层已确认有权限，但数据库查询返回空”的假阴性问题，例如项目成员添加时项目明明存在，却报“项目不存在”。

## 统一原则

### 1. API 业务查询默认使用 Admin Client

经过 Fastify auth、`authorizationService`、`accessPolicyService` 校验后的服务端业务查询，应使用：

```ts
SupabaseDB.getAdminClient().from("table")
```

同时必须在 controller/service/repository 中显式落实边界：

- 租户数据必须带 `tenant_id` 过滤，或在进入 repository 前通过 `canAccessProject` / `canAccessCustomer` 等业务权限校验。
- 写操作必须在 controller 或 service 层先校验业务权限。
- repository 不能假设 RLS 会替业务层兜底。

### 2. 普通 Client 只用于明确的 Public/RLS 场景

普通 client：

```ts
SupabaseDB.getClient()
```

只允许用于明确需要 Supabase RLS 作为权限来源的 public/anon 场景。使用时必须在代码旁边说明原因。

`SupabaseDB.from()` 兼容方法已删除，后续代码必须显式选择 `getAdminClient()` 或 `getClient()`。

### 3. 不允许依赖 RLS 做后台租户权限判断

后台 API 的租户权限判断应由业务层完成，不允许通过“普通 client 查不到数据”来判断无权限。

正确示例：

```ts
const hasAccess = await accessPolicyService.canAccessProject(
  authContext,
  projectId,
  "project.update",
);
if (!hasAccess) throw Errors.forbidden();

const { data, error } = await SupabaseDB.getAdminClient()
  .from("projects")
  .select("*")
  .eq("id", projectId)
  .eq("tenant_id", authContext.tenantId)
  .maybeSingle();
```

错误示例：

```ts
const { data } = await SupabaseDB.getClient()
  .from("projects")
  .select("*")
  .eq("id", projectId)
  .maybeSingle();

if (!data) throw Errors.badRequest("项目不存在");
```

## 本次执行结果

已统一以下业务链路为 Admin Client：

- 项目公开列表内部查询
- 房产列表服务
- 施工日志评论创建、列表、父评论校验
- 小程序客户自助日志评论聚合
- 项目介绍费 repository
- 项目 repository 的 `findById` / `update`
- 项目日志日历 RPC：调用前已完成项目访问权限校验

保留项：

- `get_project_create_page_data` 仍使用普通 client。该旧 RPC 路由当前没有 app auth context，已在代码中标记为 legacy public/RLS RPC，后续需要先定义调用边界再决定是否升权。

## BaseController 遗留风险

`BaseController` 默认 CRUD 没有统一租户过滤。如果直接改为 Admin Client，可能扩大默认资源接口的数据可见范围。因此它不能机械替换。

后续整改建议：

1. 禁止新 controller 直接依赖 `BaseController` 默认 CRUD。
2. 已注册 `createResourceRoutes` 的资源必须逐个确认是否覆盖 `list/create/update/getById`。
3. 为 BaseController 增加强制租户策略，或拆分为：
   - `TenantBaseController`
   - `PlatformBaseController`
   - `PublicBaseController`
4. 完成逐项确认后，继续拆分更明确的资源基类。

## 后续检查命令

```bash
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
rg -n "SupabaseDB\\.getClient\\(" apps/api/src -S
```

验收口径：

- `SupabaseDB.from()` 兼容方法已删除，业务代码不能再使用。
- 如必须使用 publish-key client，代码附近必须写明原因。
- 租户数据查询必须显式带租户边界或业务权限校验。
