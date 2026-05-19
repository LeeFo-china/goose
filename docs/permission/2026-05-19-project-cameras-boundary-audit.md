# Project Cameras 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/project-cameras/index.ts`
- `apps/api/src/services/project-cameras.ts`
- `apps/api/src/repositories/project-cameras.ts`
- `apps/api/src/repositories/tenant-devices.ts`
- `apps/api/src/schema/project-cameras.ts`

## 接口口径

`project-cameras` 是员工和客户混合入口：

- 员工后台 / 员工端：项目摄像头分组、绑定项目选项、设备通道列表、创建腾讯云设备、绑定、修改、删除摄像头。
- 客户端：查看自己项目可见摄像头、获取播放参数。

客户接口不能强制员工租户上下文；员工接口必须要求后台员工身份、项目权限和租户上下文。

客户可用接口：

- `GET /projects/:project_id/cameras`
- `POST /projects/:project_id/cameras/:camera_id/play-params`

员工接口：

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

## 已有边界

- 客户访问通过 `customers.user_id` 反查客户身份，并校验项目归属该客户。
- 客户只能看到 `can_view = true` 的摄像头。
- 员工访问依赖 `project.read` / `project.update` 权限点。
- 员工访问项目时走 `accessPolicyService.canAccessProject()`，支持项目可见范围。
- 摄像头查询、修改、删除均带 `project_id` 和 `tenant_id` 条件。
- 设备资产绑定会校验 `tenant_devices.tenant_id`，不允许绑定其他租户设备。
- 播放参数访问会写入 `camera_access_logs`。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 员工侧 `resolveActor()` 改为 `assertTenantContext()`，平台管理员无租户上下文不能直接进入租户项目摄像头链路。
- 绑定项目选项和项目摄像头分组接口改为先要求租户上下文，再计算可见项目范围。
- 客户查看和客户播放参数链路保持客户身份口径，不要求员工租户上下文。

## 后续注意

- 该模块依赖第三方云设备和租户设备资产池，后续平台侧设备运维能力应继续走平台设备 controller，不应复用租户项目摄像头接口。
- 腾讯云 / 萤石全量设备列表包含跨租户设备，租户侧返回时只能暴露当前租户已归属资产和是否可导入的状态。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
