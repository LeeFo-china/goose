# Projects 权限边界核查 Phase 3

日期：2026-05-19

## 本阶段目标

迁移项目成员详情接口中的项目主表读取，避免 controller 为了组装成员列表再次直接查询 `projects`。

覆盖接口：

- `GET /projects/:id/members`

## 调整内容

`GET /projects/:id/members` 当前改为复用：

- `projectSer.getProjectDetail({ authContext, projectId })`

该 service 已在 Phase 2 中统一处理：

- 租户上下文校验。
- `project.read` 权限校验。
- 项目可见性校验。
- `projects.tenant_id = authContext.tenantId`。

Controller 仍保留：

- `getProjectMembersForDetail()` 成员展示组装。
- 客户负责人虚拟成员展示。

原因：

- 这些属于响应 presenter 逻辑。
- 本阶段目标是清理项目主表直连，不改变成员响应结构。

## 当前剩余直连

Projects controller 中剩余直连主要集中在：

- 公开项目展示：
  - `/projects/frontend-visible`
  - `/front/projects`
  - `/front/projects/:id`
  - `/front/projects/:id/logs`
- 创建候选：
  - `/projects/create/customers`
  - `/projects/create/employees`
  - `/projects/:id/member-candidates`

这些下一阶段单独处理。

## 验收

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
