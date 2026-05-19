# Project Logs 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/project-logs/index.ts`
- `apps/api/src/schema/project-logs.ts`
- 关联权限：`project.read`、`project_log.create`

## 接口口径

`project-logs` 属于租户后台项目施工日志能力，应按当前租户和目标项目归属进行强约束。

本次核查的后台接口：

- `GET /project_logs`
- `GET /project_logs/:id`
- `POST /project_logs`
- `PATCH /project_logs/:id`
- `GET /project_logs/projects`
- `GET /project_logs/projects/calendar`

公开项目日志展示不在该 controller 中处理，当前仍由 `projects` 的公开接口按 `visibility_status` 和项目公开状态控制。

## 已有边界

- 创建日志要求当前登录人为员工，并使用 `project_log.create` 校验目标项目可写范围。
- 更新日志要求当前日志所属项目具备 `project_log.create` 权限；如果修改 `project_id`，目标项目也必须具备 `project_log.create` 权限。
- 列表和详情使用 `project.read` 计算项目可见范围。
- 根据目标项目写入日志 `tenant_id`，避免前端传入租户。
- 日志图片返回前统一走存储 URL 解析。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 后台项目日志接口统一使用 `getRequiredTenantContext()`。
- 项目查询和项目日志查询改为必须带当前 `tenantId`。
- 列表和按项目查询直接按当前租户过滤，不再保留平台管理员无租户兼容口径。

## 后续注意

- `project-logs` 当前逻辑仍主要集中在 controller，后续可以拆分 service / repository，但本次先完成权限边界收紧。
- 下一步应连续核查 `project-log-comments`，评论必须以日志归属项目和日志 `tenant_id` 为核心边界。
- `get_project_log_calendar` RPC 当前按 `project_uuid` 查询；调用前已通过 `project.read` 校验项目访问权，后续如改 RPC，建议补 `tenant_uuid` 参数进一步收紧。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
