# Projects 权限边界核查 Phase 4

日期：2026-05-19

## 本阶段目标

将公开项目展示接口的 Supabase 查询从 `ProjectController` 下沉到 `projectSer` / `projectRepository`，把公开访问口径和后台租户项目 CRUD 分离。

覆盖接口：

- `GET /projects/frontend-visible`
- `GET /front/projects`
- `GET /front/projects/:id`
- `GET /front/projects/:id/logs`

## 已落地文件

- `apps/api/src/controllers/projects/index.ts`
- `apps/api/src/services/projects.ts`
- `apps/api/src/repositories/projects.ts`
- `docs/permission/2026-05-19-projects-boundary-audit-phase4.md`

## 当前职责划分

### Controller

保留职责：

- 参数校验。
- 调用公开项目 service。
- 公开项目列表、详情、日志的展示层序列化。

### Service

`projectSer` 新增公开项目口径：

- `listPublicProjects()`
- `getRequiredPublicProjectVisibility()`
- `getPublicProjectDetail()`
- `listPublicProjectLogs()`

职责：

- 统一判断公开项目可见性：
  - `visibility_status = hidden` 不可见。
  - `visibility_status = public` 可见。
  - 其它情况按项目状态 `signed / constructing / completed` 可见。
- 不要求后台登录态。
- 不暴露后台项目详情字段。

### Repository

`projectRepository` 新增：

- `listPublicProjects()`
- `findPublicVisibilityById()`
- `findPublicDetailById()`
- `listPublicProjectLogs()`

并将公开项目 list/detail select 下沉到 repository 常量。

## 当前剩余直连

Projects controller 中剩余直连主要集中在项目候选查询：

- `GET /projects/create/customers`
- `GET /projects/create/employees`
- `GET /projects/:id/member-candidates`

下一阶段建议迁移这组“项目创建/成员候选”查询。

## 验收

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
```

待最终提交前执行：

```bash
git diff --check
```

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 公开项目可见性规则保持不变，只是下沉到 service。
