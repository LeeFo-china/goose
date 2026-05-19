# Customer 权限边界核查 Phase 8

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-follow-ups.ts`
- `apps/api/src/repositories/customer-follow-ups.ts`

本阶段聚焦客户跟进摘要和今日工作客户辅助查询。

## 本次调整

- `CustomerController` 移除 `getLatestFollowUpMap()`，改由 `customerFollowUpService.getLatestFollowUpMap()` 提供。
- `CustomerController` 移除 `getTodayWorkCustomerIds()`，改由 `customerFollowUpService.getTodayWorkCustomerIds()` 提供。
- `customerFollowUpRepository` 增加：
  - 当前租户客户 ID 二次校验。
  - 批量查询最新跟进记录。
  - 按客户时间字段查询今日客户。
  - 按跟进时间字段查询今日跟进关联客户。
- `CustomerController` 不再直接查询 `customer_follow_ups` 表。

## 已核查边界

- 最新跟进摘要会先把客户 ID 按当前租户过滤，再查询跟进记录。
- 今日工作客户中的跟进关联客户会先通过 `customers.tenant_id` 过滤，再进入列表筛选。
- 客户列表仍由 controller 控制查询参数和响应结构，跟进相关数据来源统一走 service。

## 后续注意

- `CustomerController` 仍直接处理客户、房产、批量分配负责人等查询；后续可继续按子域抽 service。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
