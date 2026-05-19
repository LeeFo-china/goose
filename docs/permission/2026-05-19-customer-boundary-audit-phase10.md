# Customer 权限边界核查 Phase 10

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-owner-assignments.ts`
- `apps/api/src/repositories/customer-owner-assignments.ts`

本阶段聚焦客户批量分配负责人链路。

## 本次调整

- 新增 `customerOwnerAssignmentRepository`，集中处理目标负责人查询、客户集合查询和批量负责人更新。
- 新增 `customerOwnerAssignmentService`，集中处理：
  - `customer.assign_owner` 权限点校验。
  - 当前租户上下文校验。
  - 目标负责人归属、状态和可分配范围校验。
  - 每个客户是否存在、是否在当前租户、是否在可分配范围内。
  - `only_unassigned` 和重复负责人分配的失败原因。
- `CustomerController.batchAssignOwner()` 改为只做请求体校验、调用 service、包装响应。

## 已核查边界

- 目标负责人查询强制 `employees.tenant_id = authContext.tenantId`。
- 客户集合查询和更新强制 `customers.tenant_id = authContext.tenantId`。
- 负责人更新前逐条调用 `accessPolicyService.canAssignCustomerOwner()` 判断客户范围。
- 返回结构、失败原因和提示文案保持与原接口一致。

## 后续注意

- 单个客户更新负责人逻辑仍在 `CustomerController.update()` 内，后续可继续并入该 service，避免批量和单个更新的负责人规则分散。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
