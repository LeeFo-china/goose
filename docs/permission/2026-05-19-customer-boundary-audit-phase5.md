# Customer 权限边界核查 Phase 5

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`

本阶段聚焦客户主 CRUD：详情、创建、更新。

## 本次调整

- `getById` 查询客户详情时直接补 `tenant_id = authContext.tenantId`，不再先查出客户后只依赖访问策略兜底。
- 创建客户时，如果请求指定 `owner_id`，必须确认目标负责人属于当前租户且状态为 active。
- 更新客户写入时补 `tenant_id = authContext.tenantId` 条件。
- 更新客户但没有字段变化、只读取当前客户详情时，也补 `tenant_id = authContext.tenantId` 条件。

## 已核查边界

- 创建客户写入 `tenant_id` 固定来自当前租户上下文。
- 非 `customer.create = all` 范围不能把新客户分配给其他员工。
- 指定负责人时不会把客户创建到跨租户员工名下。
- 更新客户先按当前租户查询已有客户，再按权限范围判断是否可更新。
- 更新负责人时已校验目标员工属于当前租户、状态可用，并符合 `customer.assign_owner` 范围。

## 后续注意

- `customerSelect` 当前仍由 controller 内字符串维护，后续如果抽 repository，可将客户详情查询、客户更新查询统一沉到 repository，减少重复租户条件。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
