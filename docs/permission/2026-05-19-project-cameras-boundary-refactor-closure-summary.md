# Project Cameras 权限边界重构闭环摘要

日期：2026-05-19

## 范围

客户侧：

- `GET /projects/:project_id/cameras`
- `POST /projects/:project_id/cameras/:camera_id/play-params`

员工侧：

- `GET /projects/camera-bind-options`
- `GET /project-cameras/projects`
- `GET /projects/:project_id/cameras/ezviz-devices`
- `GET /projects/:project_id/cameras/tencent-devices`
- `POST /projects/:project_id/cameras/tencent-devices`
- `GET /projects/:project_id/cameras/tencent-devices/:device_id/password`
- `POST /projects/:project_id/cameras/tencent-devices/:device_id/password`
- `POST /projects/:project_id/cameras`
- `PATCH /projects/:project_id/cameras/:camera_id`
- `DELETE /projects/:project_id/cameras/:camera_id`

## 本次调整

- 将客户项目归属查询从 `projectCameraService` 下沉到 `projectCameraRepository.getCustomerOwnedProjectTenant()`。
- `projectCameraService` 不再直接依赖 `SupabaseDB` 或 admin client。
- controller 继续只负责 HTTP 参数校验、请求元信息读取、调用 service 和响应包装。
- 保持接口路径、请求字段和返回结构不变。

## 员工侧权限口径

- 员工侧操作必须先解析后台 `AuthContext`。
- 员工必须存在 `employeeId`，且必须具备目标操作对应权限点：
  - 查看、播放、项目摄像头分组：`project.read`
  - 绑定项目选项、设备通道、创建设备、绑定、修改、删除：`project.update`
- 员工侧必须具备租户上下文，平台管理员无租户上下文不能直接进入租户项目摄像头链路。
- 项目访问继续通过 `accessPolicyService.canAccessProject()` 校验项目可见范围。
- 摄像头查询、修改、删除均带 `project_id` 与 `tenant_id` 条件。

## 客户侧权限口径

- 客户侧只允许在 `allowCustomer = true` 的查看和播放链路进入。
- 客户通过 `customers.user_id` 反查客户身份，并校验目标项目归属当前客户。
- 已完工或无效项目不允许客户进入摄像头链路。
- 客户只返回 `can_view = true` 的摄像头。
- 播放参数请求会写入 `camera_access_logs`。

## 设备资产边界

- 设备资产绑定校验 `tenant_devices.tenant_id`，不允许绑定其他租户设备。
- 腾讯云 / 萤石设备列表可以读取厂商侧全量设备，但租户侧返回时只暴露当前租户归属资产状态和是否可导入，不暴露其他租户绑定详情。
- 项目摄像头接口只处理租户项目维度；平台侧设备资产运维仍应走平台设备 controller。

## 小程序与 Admin 对接

本轮是后端边界重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/project-cameras/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/project-cameras.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
