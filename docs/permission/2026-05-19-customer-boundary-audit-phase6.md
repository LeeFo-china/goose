# Customer 权限边界核查 Phase 6

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`

本阶段聚焦客户房产辅助方法和客户详情响应组装。

## 本次调整

- `getAssignableTargetEmployee()` 的 `tenantId` 改为必传，并在查询中强制 `tenant_id` 过滤。
- `getPrimaryCustomerPropertySummary()` 的 `tenantId` 改为必传，并强制 `tenant_id` 过滤。
- `getCustomerPropertySummaryMap()` 的 `tenantId` 改为必传，并强制 `tenant_id` 过滤。
- `getRequiredCustomerPropertyRecord()` 的 `tenantId` 改为必传，并强制 `tenant_id` 过滤。
- `getCustomerPropertySummaries()` 的 `tenantId` 改为必传，并强制 `tenant_id` 过滤。
- `upsertCustomerPrimaryProperty()` 的 `tenantId` 改为必传。
- `buildCustomerDetailResponse()` 要求调用方显式传入 `tenantId`，避免详情响应组装时遗漏房产和跟进摘要边界。

## 已核查边界

- 客户房产摘要、详情、列表、更新、设主房产、自动创建主房产均必须带当前租户 ID。
- 客户详情响应内的主房产、房产列表、跟进摘要都依赖显式租户 ID。
- 负责人查询不再存在空租户查询分支。

## 后续注意

- 客户 controller 仍较大，后续可以把房产辅助方法抽到 repository/service，进一步减少 controller 内直接查询。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
