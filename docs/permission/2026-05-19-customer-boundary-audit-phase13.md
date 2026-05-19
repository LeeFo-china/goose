# Customer 权限边界核查 Phase 13

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-core.ts`
- `apps/api/src/repositories/customer-core.ts`

本阶段聚焦客户创建链路中的主表写入。

## 本次调整

- `customerCoreRepository` 增加客户主表创建方法，统一封装 `customers.insert()`。
- `customerCoreService` 增加 `createCustomer()`。
- `CustomerController.create()` 保留原有参数校验、负责人校验、抖音截图校验和响应组装，只把 `customers` 写入下沉到 service/repository。

## 已核查边界

- 创建 payload 的 `tenant_id` 仍固定来自 `authContext.tenantId`。
- 非 `customer.create = all` 范围仍不能把客户分配给其他员工。
- 指定负责人仍通过 `customerOwnerAssignmentService.assertActiveTenantOwner()` 校验当前租户和 active 状态。
- 创建后的主房产 upsert 仍通过 `customerPropertyService` 按租户处理。

## 后续注意

- 客户更新和列表仍在 `CustomerController` 内直接访问 `customers`，后续继续迁移到 `customer-core`。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
