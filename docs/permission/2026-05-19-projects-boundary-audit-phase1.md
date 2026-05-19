# Projects 权限边界核查 Phase 1

日期：2026-05-19

## 本阶段目标

Projects 模块体量较大，同时包含租户后台项目管理、项目成员、公开项目展示和创建候选数据。本阶段不做大拆分，只先把已确认的租户后台基础边界语义明确化。

## 核查范围

- `apps/api/src/controllers/projects/index.ts`
- `apps/api/src/services/projects.ts`
- `apps/api/src/repositories/projects.ts`
- `apps/api/src/routes/index.ts`

## 当前发现

### 1. Controller 已迁到 TenantBaseController

`ProjectController` 已继承 `TenantBaseController`，后台租户接口大部分已使用 `getRequiredTenantContext()`。

结论：

- 这部分基础方向正确。
- 后续重点不是换基类，而是把 controller 内直接 Supabase 查询逐步下沉到 service / repository。

### 2. 路由仍复用 fullCrudRoutes

`routes/index.ts` 当前对 `projects` 使用通用 `fullCrudRoutes`。

风险：

- 虽然 `ProjectController` 已覆盖 `list/getById/create/update`，但语义上不如独立 `projectCrudRoutes` 清晰。
- 后续维护时不容易看出 projects 的 CRUD 暴露已经被专项审计。

### 3. 租户 ID 仍有可空兼容口径

当前存在：

- `getTodayWorkProjectIds(tenantId: string | null)`
- `assertProjectRelationsInTenant(..., tenantId: string | null)`
- 创建项目写入 `tenant_id: authContext.tenantId ?? null`
- `projectSer.updateProject/deleteProject` 的 `tenantId` 参数可选

风险：

- 租户后台项目写入不应允许空租户。
- 项目更新/删除应明确要求当前租户上下文。

### 4. Controller 仍直接访问 Supabase

当前 controller 仍直接查询：

- `projects`
- `project_logs`
- `project_acceptances`
- `customers`
- `properties`
- `employees`

结论：

- 这是后续阶段的主要整改对象。
- 本阶段先不一次性迁移，避免后台接口和公开接口响应结构同时波动。

## 本阶段已调整

- `routes/index.ts` 增加独立 `projectCrudRoutes`。
- `projects` 资源改用 `projectCrudRoutes` 注册。
- 项目列表过滤固定执行 `tenant_id = authContext.tenantId`。
- 今日项目统计 helper 的 `tenantId` 改为必填 `string`。
- 项目关联资源校验 helper 的 `tenantId` 改为必填 `string`。
- 创建项目写入 `tenant_id` 固定使用 `authContext.tenantId`。
- `projectSer.updateProject/deleteProject` 的 `tenantId` 改为必填 `string`。

## 后续阶段建议

Phase 2：

- 抽 `project-core` service / repository。
- 先迁移租户后台主 CRUD：列表、详情、创建、更新、删除。

Phase 3：

- 迁移项目成员详情补充能力。
- 明确 `project-members` service 是否继续允许可空 `tenantId`，后台入口建议收紧为必填。

Phase 4：

- 抽公开项目展示 service / repository。
- 将 `/front/projects` 与后台租户接口分离，避免公开口径和后台口径混在同一个 controller。

Phase 5：

- 迁移项目创建客户/员工候选和成员候选查询。

## 本阶段验收

应执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
```

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只强化后端租户边界语义和路由注册语义。
