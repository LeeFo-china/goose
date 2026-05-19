# Project Logs 权限边界重构闭环摘要

日期：2026-05-19

## 背景

Project Logs 是项目进度、客户评论、图片上传和公开案例日志的核心入口。本轮整改目标是把项目日志接口的租户边界、项目访问权和 Supabase 访问路径系统化，避免 controller 继续直接访问数据库和 RPC。

整改前主要问题：

- `ProjectLogController` 直接访问 `projects`、`project_logs`。
- `ProjectLogController` 直接调用 `get_project_log_calendar` RPC。
- 项目归属校验、日志查询、权限判断和响应序列化混在 controller。
- `project-logs` 路由仍复用通用 `fullCrudRoutes`。

## 当前结论

Project Logs 模块第一轮权限边界整改已闭环。

当前 `ProjectLogController` 中已无以下直连访问：

- `SupabaseDB`
- `SupabaseDB.getAdminClient()`
- `from("projects")`
- `from("project_logs")`
- `rpc("get_project_log_calendar")`
- `accessPolicyService`

Controller 当前保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 service。
- 包装 `ResponseHandler.success()`。
- 保留日志图片和阶段标签展示层序列化。

## 已拆分的 Service / Repository

### project-logs

文件：

- `apps/api/src/services/project-logs.ts`
- `apps/api/src/repositories/project-logs.ts`

职责：

- 创建项目日志。
- 查询项目日志详情。
- 查询项目日志列表。
- 更新项目日志。
- 按项目查询日志。
- 查询项目日志日历。
- 校验目标项目属于当前租户。
- 校验 `project.read` / `project_log.create`。

边界：

- 后台日志查询和写入强制 `project_logs.tenant_id = authContext.tenantId`。
- 创建日志时强制使用当前登录员工 `authContext.employeeId`。
- 创建/更新日志时目标项目必须属于当前租户。
- 列表和详情通过 `project.read` 控制可见项目范围。
- 创建和更新通过 `project_log.create` 控制目标项目写入范围。

## 验收命令

本轮闭环验收执行：

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

本轮不需要 admin 或微信小程序改代码。

原因：

- 未改变接口路径。
- 未主动改变请求参数。
- 未主动改变响应结构。
- 改动集中在后端 controller/service/repository 分层和权限边界。

建议前端只做回归验证：

- 项目日志列表。
- 项目日志详情。
- 新增项目日志。
- 编辑项目日志。
- 按项目查询日志。
- 项目日志日历。

## 后续建议

下一组更有价值的整改对象：

1. `project-log-comments`：客户/员工评论入口混合，需要以日志归属项目和日志租户为核心边界。
2. `project-acceptances`：验收流程涉及员工、客户、疑问、整改回复，适合延续项目边界模型。
3. `project-cameras`：摄像头设备绑定和播放参数涉及项目归属及租户设备资产。

推荐下一步先做 `project-log-comments`，因为它直接承接项目日志，并且涉及客户小程序评论和图片上传链路。
