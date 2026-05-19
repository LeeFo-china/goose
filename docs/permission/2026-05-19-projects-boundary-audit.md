# Projects 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/projects/index.ts`
- `apps/api/src/services/projects.ts`
- `apps/api/src/services/project-members.ts`
- `apps/api/src/repositories/projects.ts`
- `apps/api/src/repositories/project-members.ts`
- `apps/api/src/schema/projects.ts`

## 接口分类

`projects` controller 同时承载后台租户项目能力和公开项目展示能力，需要分口径处理。

后台租户接口：

- `GET /projects`
- `GET /projects/status`
- `GET /projects/:id`
- `POST /projects`
- `PATCH /projects/:id`
- `DELETE /projects/:id`
- `GET /projects/:id/members`
- `GET /projects/member-roles`
- `POST /projects/:id/members`
- `PATCH /projects/:id/members/:memberId`
- `DELETE /projects/:id/members/:memberId`
- `GET /projects/create/customers`
- `GET /projects/create/employees`
- `GET /projects/:id/member-candidates`

公开展示接口：

- `GET /projects/frontend-visible`
- `GET /front/projects`
- `GET /front/projects/:id`
- `GET /front/projects/:id/logs`

公开展示接口不依赖后台登录上下文，保持按 `visibility_status` 和项目状态控制展示。

## 本次调整

- `projects` controller 迁移到 `TenantBaseController`。
- 后台租户接口统一使用 `getRequiredTenantContext()`。
- 公开展示接口保持公开口径，不新增后台登录要求。
- 项目列表可见性仍由 `project.read` 和 scope 控制。
- 项目创建继续要求 `project.create`。
- 项目更新继续要求 `project.update`。
- 项目删除继续要求 `project.delete`。
- 项目创建和更新继续校验客户、房产、设计师、工程负责人属于当前租户。
- 项目成员新增、修改、删除继续要求项目 `project.update` 权限。
- `projectMemberService` 新增项目和员工同租户校验，防止把其它租户员工绑定到当前租户项目。
- 设计师、工程负责人同步到 `project_members` 时同步带入租户校验。

## 已保留边界

- `accessPolicyService.canAccessProject()` 继续作为项目详情、更新、删除、成员管理的项目可见性判断。
- `customerPhonePrivacyService` 继续控制客户手机号展示。
- 项目成员中的客户跟进人仍来自客户归属关系的虚拟成员，不能直接新增、修改、删除。
- 公开项目接口仍只返回公开展示字段，不返回后台详情字段。

## 后续注意

`projects` 已收紧为租户后台入口，但关联资源还需要继续逐步核查：

- `project-logs`
- `project-log-comments`
- `project-acceptances`
- `project-cameras`
- `tenant-share-links`
- `customer-project-log-shares`

这些资源应以项目归属为核心边界，优先使用 `project.read` / `project.update` 结合目标项目 `tenant_id` 校验。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
