# Customer 权限边界核查 Phase 11

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-owner-assignments.ts`
- `apps/api/src/repositories/customer-owner-assignments.ts`

本阶段聚焦客户创建和单个客户更新中的负责人校验。

## 本次调整

- `customerOwnerAssignmentService` 增加 `assertActiveTenantOwner()`，统一校验负责人属于当前租户且状态 active。
- `customerOwnerAssignmentService` 增加 `assertCanAssignSingleOwner()`，统一校验单个客户负责人切换的权限范围。
- 创建客户时指定 `owner_id` 不再由 controller 直接查 `employees`，改为调用 service。
- 更新客户时切换 `owner_id` 不再由 controller 直接查 `employees`，改为调用 service。
- `CustomerController` 不再直接查询 `employees` 表。

## 已核查边界

- 创建客户指定负责人时强制 `employees.tenant_id = authContext.tenantId`。
- 更新客户负责人时强制 `employees.tenant_id = authContext.tenantId`，并继续按 `customer.assign_owner` 判断客户和目标负责人是否在可分配范围内。
- 批量分配负责人和单个负责人切换复用同一 repository 查询口径。

## 后续注意

- 客户主表 create/update/delete/get/list 仍在 `CustomerController` 内直接访问 `customers`，后续可继续拆 `customer-core` service/repository。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
