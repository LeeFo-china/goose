# Project Logs 权限边界核查 Phase 1

日期：2026-05-19

## 本阶段目标

将 `ProjectLogController` 中的项目、日志、日历 RPC 查询下沉到 service / repository，并明确 `project-logs` 的独立 CRUD 路由配置。

覆盖接口：

- `GET /project-logs`
- `GET /project-logs/:id`
- `POST /project-logs`
- `PATCH /project-logs/:id`
- `GET /project-logs/projects`
- `GET /project-logs/projects/calendar`

## 已落地文件

- `apps/api/src/controllers/project-logs/index.ts`
- `apps/api/src/services/project-logs.ts`
- `apps/api/src/repositories/project-logs.ts`
- `apps/api/src/routes/index.ts`

## 当前职责划分

### Controller

保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 `projectLogService`。
- 包装 `ResponseHandler.success()`。
- 保留日志图片 URL、施工阶段标签的展示层序列化。

### Service

`projectLogService` 负责：

- 创建项目日志。
- 项目日志详情。
- 项目日志列表。
- 更新项目日志。
- 按项目查询日志。
- 项目日志日历。
- 统一校验租户上下文。
- 统一校验 `project.read` / `project_log.create`。
- 创建日志时强制使用当前员工 ID。
- 写入日志时根据当前租户项目写入 `tenant_id`，不接受前端传入租户。

### Repository

`projectLogRepository` 负责：

- 查询项目归属。
- 查询项目日志。
- 创建、更新项目日志。
- 列表、按项目分页查询。
- 调用 `get_project_log_calendar` RPC。

所有后台日志查询和写入强制：

- `project_logs.tenant_id = authContext.tenantId`
- 目标项目必须属于当前租户。

## 路由调整

`routes/index.ts` 新增：

- `projectLogCrudRoutes`

`project-logs` 不再复用通用 `fullCrudRoutes`，改为独立声明当前已审计的 CRUD 暴露。

## 验收

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
rg -n "SupabaseDB|getAdminClient|from\\(|rpc\\(|accessPolicyService|getProject\\(|getProjectLogById" apps/api/src/controllers/project-logs/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。
- ProjectLog controller Supabase / RPC / 权限直连扫描无结果。

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只调整后端分层和权限边界。

建议前端回归验证：

- 项目日志列表。
- 项目日志详情。
- 新增项目日志。
- 编辑项目日志。
- 按项目查询日志。
- 项目日志日历。
