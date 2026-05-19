# Projects 权限边界核查 Phase 2

日期：2026-05-19

## 本阶段目标

将租户后台项目主 CRUD 从 `ProjectController` 下沉到 `projectSer` / `projectRepository`，先处理后台项目主链路，不同时改动公开项目展示和候选查询。

本阶段覆盖接口：

- `GET /projects`
- `GET /projects/status`
- `GET /projects/:id`
- `POST /projects`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

## 已落地文件

- `apps/api/src/controllers/projects/index.ts`
- `apps/api/src/services/projects.ts`
- `apps/api/src/repositories/projects.ts`
- `docs/permission/2026-05-19-projects-boundary-audit-phase2.md`

## 当前职责划分

### Controller

保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 `projectSer`。
- 包装 `ResponseHandler.success()`。
- 保留项目列表和详情的展示层序列化。

### Service

`projectSer` 新增/强化职责：

- 项目列表 `listProjects()`。
- 项目详情 `getProjectDetail()`。
- 创建项目 `createProject()`。
- 更新项目 `updateProjectForTenant()`。
- 删除项目 `deleteProjectForTenant()`。
- 统一检查 `project.read / project.create / project.update / project.delete`。
- 统一检查客户、房产、设计师、工程负责人属于当前租户。
- 统一同步旧字段设计师/工程负责人到 `project_members`。

### Repository

`projectRepository` 新增/强化职责：

- 项目列表计数和分页查询。
- 今日项目范围查询。
- 项目详情查询。
- 项目创建。
- 客户、房产、员工的租户归属校验查询。

所有后台主查询继续强制：

- `projects.tenant_id = authContext.tenantId`

## 保留的 controller 直连

本阶段未处理以下直连：

- `GET /projects/:id/members`
- `GET /projects/frontend-visible`
- `GET /front/projects`
- `GET /front/projects/:id`
- `GET /front/projects/:id/logs`
- `GET /projects/create/customers`
- `GET /projects/create/employees`
- `GET /projects/:id/member-candidates`

原因：

- 公开项目接口和后台租户接口口径不同，应单独抽 public service。
- 创建候选查询和项目成员查询属于下一阶段的聚合能力，单独迁移更稳。

## 本阶段验收

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只调整后端 controller/service/repository 分层和租户边界实现。

建议前端回归验证：

- 项目列表。
- 项目状态列表。
- 项目详情。
- 新建项目。
- 编辑项目。
- 删除项目。

## 下一阶段建议

Phase 3：

- 迁移项目成员详情补充能力：
  - `GET /projects/:id/members`
  - `getProjectMembersForDetail()`

Phase 4：

- 抽公开项目展示 service / repository：
  - `/projects/frontend-visible`
  - `/front/projects`
  - `/front/projects/:id`
  - `/front/projects/:id/logs`

Phase 5：

- 迁移项目创建客户/员工候选和成员候选查询。
