# Tenant Devices 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/tenant-devices/index.ts`
- `apps/api/src/services/tenant-devices.ts`
- `apps/api/src/repositories/tenant-devices.ts`
- `apps/api/src/schema/tenant-devices.ts`
- `apps/api/src/repositories/project-cameras.ts`

## 接口口径

`tenant-devices` 是混合入口，同时包含租户设备资产管理和平台设备运维：

- 租户侧：查看、创建、修改、删除、同步当前租户设备资产。
- 平台侧：查看全平台租户设备资产、查看腾讯云云端设备、删除未纳入资产的腾讯云设备、查看 / 重置腾讯云接入信息。

租户接口必须有租户上下文；平台接口必须是平台管理员。

租户接口：

- `GET /tenant-devices`
- `GET /tenant-devices/:id`
- `POST /tenant-devices`
- `PATCH /tenant-devices/:id`
- `DELETE /tenant-devices/:id`
- `POST /tenant-devices/sync`

平台接口：

- `GET /platform/tenant-devices`
- `GET /platform/tencent-devices`
- `DELETE /platform/tencent-devices/:device_id`
- `GET /platform/tenant-devices/:id/tencent-access`
- `GET /platform/tenant-devices/:id/tencent-password`
- `POST /platform/tenant-devices/:id/tencent-password`
- `POST /platform/tenant-devices/:id/sync`

## 已有边界

- 租户侧读取要求 `project.read`。
- 租户侧创建、修改、删除、同步要求 `project.update`。
- 租户侧所有设备资产查询都带 `tenant_id`。
- 创建设备资产时会校验来源项目属于当前租户。
- 创建设备资产时会校验同一设备 / 通道是否已归属其他租户。
- 删除租户设备资产前会校验设备未绑定项目和摄像头。
- 平台侧接口通过 `assertPlatformAdmin()` 校验平台管理员身份。
- 平台侧删除腾讯云云端设备前会校验未纳入 `tenant_devices` 且未绑定 `project_cameras`。
- 平台侧敏感操作写入平台审计日志。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 租户侧接口统一使用 `getRequiredTenantContext()`。
- 租户侧 service 不再接收 `authUserId` 后重复读取登录上下文，改为接收 controller 已校验的 `AuthContext`。
- service 增加 `assertTenantDeviceAccess()`，统一完成员工身份、权限点和租户上下文校验。
- 平台侧接口保留 `getRequiredAuthContext()` 后由 service 校验 `isPlatformAdmin`。

## 后续注意

- 当前 controller 同时包含平台侧和租户侧接口，后续可以进一步拆成 `tenant-devices` 和 `platform-devices` 两个 controller，分别继承 `TenantBaseController` 和 `PlatformBaseController`。
- 租户侧设备权限目前复用 `project.read` / `project.update`，后续如设备资产成为独立模块，建议新增 `tenant_device.read`、`tenant_device.manage` 权限点。
- 平台侧腾讯云密码和接入信息属于敏感能力，必须持续保留平台审计日志。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
