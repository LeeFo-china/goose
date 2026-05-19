# Customer 权限边界核查 Phase 9

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-properties.ts`
- `apps/api/src/repositories/customer-properties.ts`

本阶段聚焦客户房产列表、创建、设为主房产、更新，以及客户详情/列表里的房产摘要查询。

## 本次调整

- 新增 `customerPropertyRepository`，集中处理 `properties` 表和客户主房产字段的读写。
- 新增 `customerPropertyService`，集中处理：
  - 当前租户客户归属校验。
  - `customer.read` / `customer.update` 权限判断。
  - 房产列表、创建、设主房产、更新。
  - 客户详情和列表所需的房产摘要、主房产摘要、房产汇总结构。
  - 创建/更新客户时的主房产 upsert。
- `CustomerController` 删除房产 SQL 和房产序列化细节，只保留参数校验、调用 service、包装响应。

## 已核查边界

- 房产列表先按 `customers.id + tenant_id` 校验客户归属，再按 `customer.read` 判断访问范围。
- 房产创建、设主、更新先按 `customers.id + tenant_id` 校验客户归属，再按 `customer.update` 判断访问范围。
- `properties` 查询和写入均强制带当前 `tenant_id`。
- 房产存在但不属于当前客户时保留原错误语义：`PROPERTY_NOT_BELONG_TO_CUSTOMER`。
- 客户详情、客户列表中的房产摘要均通过 service 按租户过滤后返回。

## 后续注意

- `CustomerController` 仍直接处理客户主表 CRUD、批量分配负责人和部分客户列表查询；后续可继续按客户主表和负责人分配两个方向拆 service。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
