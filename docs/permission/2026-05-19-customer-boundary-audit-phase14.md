# Customer 权限边界核查 Phase 14

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-core.ts`
- `apps/api/src/repositories/customer-core.ts`

本阶段聚焦客户更新链路中的主表查询、更新和无字段变化时的详情回读。

## 本次调整

- `customerCoreRepository.findAccessById()` 扩展返回 `source` 和 `douyin_screenshot_images`，供更新前业务校验使用。
- `customerCoreRepository` 新增 `updateById()`，统一封装 `customers.update()`。
- `customerCoreService` 新增 `getRequiredCustomerForUpdate()` 和 `updateCustomer()`。
- `CustomerController.update()` 保留原有请求校验、抖音截图规则、负责人切换规则和响应组装，只把主表 existing 查询、更新写入、无字段变化回读下沉到 service/repository。

## 已核查边界

- 更新前 existing 查询强制 `customers.tenant_id = authContext.tenantId`。
- 更新写入强制 `customers.tenant_id = authContext.tenantId`。
- 无字段变化时的详情回读强制 `customers.tenant_id = authContext.tenantId`。
- `customer.update` 权限判断和 `customer.assign_owner` 负责人切换判断保留原行为。

## 后续注意

- 客户列表仍在 `CustomerController` 内直接访问 `customers`，后续可继续迁移到 `customer-core`。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
