# Tenant Devices 权限边界重构闭环摘要

日期：2026-05-19

## 范围

租户侧：

- `GET /tenant-devices`
- `GET /tenant-devices/:id`
- `POST /tenant-devices`
- `PATCH /tenant-devices/:id`
- `DELETE /tenant-devices/:id`
- `POST /tenant-devices/sync`

平台侧：

- `GET /platform/tenant-devices`
- `GET /platform/tencent-devices`
- `DELETE /platform/tencent-devices/:device_id`
- `GET /platform/tenant-devices/:id/tencent-access`
- `GET /platform/tenant-devices/:id/tencent-password`
- `POST /platform/tenant-devices/:id/tencent-password`
- `POST /platform/tenant-devices/:id/sync`

## 本次调整

- `tenantDeviceRepository.applyListFilters()` 去掉 `any`，改为结构化的 Supabase 查询过滤接口。
- 租户列表与平台列表复用同一套设备过滤逻辑，减少后续筛选条件漂移。
- 补充权限边界闭环摘要，明确租户侧和平台侧接口口径。

## 租户侧权限口径

- 租户侧接口统一由 controller 调用 `getRequiredTenantContext()`。
- service 通过 `assertTenantDeviceAccess()` 统一校验：
  - 必须有员工身份。
  - 读取类操作要求 `project.read`。
  - 创建、修改、删除、同步要求 `project.update`。
  - 必须有租户上下文，平台管理员无租户上下文不能进入租户设备资产链路。
- 租户侧查询、详情、修改、删除都带 `tenant_id` 条件。
- 创建设备资产时：
  - 来源项目必须属于当前租户。
  - 同一厂商设备 / 通道不能已归属其他租户。
  - `tenant_id` 与 `created_by` 来自后端上下文，不接受前端传入。
- 删除设备资产前要求未绑定项目和摄像头。

## 平台侧权限口径

- 平台侧接口由 controller 获取 `AuthContext`，service 内部统一校验 `authContext.isPlatformAdmin`。
- 平台侧可查看全平台租户设备资产与腾讯云厂商设备。
- 删除腾讯云云端设备前会校验：
  - 腾讯云设备存在。
  - 未纳入 `tenant_devices`。
  - 未绑定 `project_cameras`。
- 查看腾讯云接入信息、查询密码、重置密码、同步平台设备都会写入平台审计日志。

## 设备归属边界

- `tenant_devices` 是租户资产归属表。
- `project_cameras` 是项目摄像头绑定表。
- 腾讯云 / 萤石厂商设备可以被平台读取，但租户侧只能操作当前租户资产池内设备。
- 项目摄像头绑定和解绑会同步更新 `tenant_devices.bound_project_id` 与 `tenant_devices.bound_camera_id`。

## 小程序与 Admin 对接

本轮是后端边界收紧与文档闭环，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/tenant-devices/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/tenant-devices.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `tenantDeviceRepository` 无 `any` 型查询 helper。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
