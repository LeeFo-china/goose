# Customer 权限边界核查 Phase 2

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`

本阶段聚焦客户房产和客户跟进记录子链路。

## 本次调整

- `upsertCustomerPrimaryProperty()` 自动创建主房产时写入确定的 `tenant_id`，不再允许空租户房产。
- 创建客户跟进记录时，如果请求指定的 `employee_id` 不是当前员工：
  - 非 `customer.update = all` 范围直接拒绝。
  - `customer.update = all` 范围也必须校验目标员工属于当前租户且状态为 active。

## 已核查边界

- 客户房产列表、创建、设为主房产、更新均先通过 `getRequiredCustomerRecord()` 校验客户属于当前租户。
- 客户房产详情和更新查询均按 `tenant_id` 过滤。
- 客户房产写入均带当前租户 `tenant_id`。
- 客户跟进列表先校验客户属于当前租户，再查询该客户的跟进记录。
- 客户跟进创建先校验客户属于当前租户，并通过 `customer.update` 校验客户访问权限。
- 客户列表使用租户过滤后的客户 ID 查询跟进摘要，最终仍由客户租户过滤约束结果。

## 后续注意

- `customer_follow_ups` 表当前没有冗余 `tenant_id`，租户边界依赖所属客户。
- `getLatestFollowUpMap()` 依赖调用方传入已经过租户过滤的客户 ID，后续如抽为公共 service，应显式传入 `tenantId` 或改为 join customers 过滤。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
