# Customer 权限边界核查 Phase 4

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`

本阶段聚焦客户列表和客户详情里复用的跟进摘要、今日工作客户辅助查询。

## 本次调整

- `getLatestFollowUpMap()` 增加必传 `tenantId`，不再只依赖调用方传入的客户 ID 已经过租户过滤。
- 新增 `getTenantCustomerIdSet()`，辅助查询前先按 `customers.id + tenant_id` 二次确认客户归属。
- 客户详情、客户列表跟进筛选、普通客户列表的跟进摘要调用均显式传入当前租户。
- `getTodayWorkCustomerIds()` 改为必传租户 ID。
- 今日新增、今日更新客户仍直接按 `customers.tenant_id` 过滤。
- 今日创建跟进、计划跟进由于 `customer_follow_ups` 表没有冗余 `tenant_id`，先取 `customer_id`，再通过 `customers.tenant_id` 过滤后才进入今日工作客户集合。

## 已核查边界

- 客户列表主体查询仍由 `applyCustomerListFilters()` 统一注入租户、负责人范围、状态、来源、关键字和今日工作范围。
- 跟进摘要只会返回当前租户客户的最新跟进。
- 今日工作范围不会把其他租户的跟进客户 ID 混入后续客户列表过滤。

## 后续注意

- `customer_follow_ups` 当前仍未冗余 `tenant_id`，如果后续该表成为高频查询表，可评估增加 `tenant_id` 冗余字段并通过写入侧强制维护。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
