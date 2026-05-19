# Customer 权限边界核查 Phase 12

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-core.ts`
- `apps/api/src/repositories/customer-core.ts`

本阶段聚焦客户主表详情和作废链路。

## 本次调整

- 新增 `customerCoreRepository`，集中处理客户主表详情查询、访问行查询和作废更新。
- 新增 `customerCoreService`，集中处理：
  - 当前租户上下文校验。
  - `customers.id + tenant_id` 查询。
  - `customer.read` / `customer.update` 访问范围判断。
  - 详情不存在时按接口历史语义返回 `bad_request` 或 `not_found`。
- `CustomerController.getById()` 改为通过 service 读取客户详情。
- `/customers/:id/detail` 改为通过 service 读取客户详情。
- `deleteCustomer()` 改为通过 service 完成客户作废。
- 删除 controller 内已无调用的 `getRequiredCustomerRecord()`。

## 已核查边界

- 客户详情查询强制 `customers.tenant_id = authContext.tenantId`。
- 客户作废前先按当前租户查询客户，再按 `customer.update` 判断访问范围。
- 作废更新强制 `customers.tenant_id = authContext.tenantId`。
- 响应组装仍由原 controller 方法处理，避免本阶段改变返回字段结构。

## 后续注意

- 客户列表、创建、更新仍在 `CustomerController` 内直接访问 `customers`，后续继续迁移到 `customer-core`。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
