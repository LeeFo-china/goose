# Customer 权限边界核查 Phase 7

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-follow-ups.ts`
- `apps/api/src/repositories/customer-follow-ups.ts`

本阶段聚焦客户跟进记录列表和创建链路。

## 本次调整

- 新增 `customerFollowUpRepository`，集中处理客户跟进记录的 Supabase 读写。
- 新增 `customerFollowUpService`，集中处理：
  - 当前租户客户归属校验。
  - `customer.read` / `customer.update` 权限判断。
  - 跟进记录分页查询。
  - 创建跟进记录时默认当前员工。
  - 指定其他跟进员工时要求 `customer.update = all`，并校验员工属于当前租户且状态 active。
  - 跟进评论摘要补充。
- `CustomerController` 的 `/customers/:id/follow_ups` GET / POST 改为只做参数校验、调用 service、包装响应。

## 已核查边界

- 跟进列表先按 `customers.id + tenant_id` 找当前租户客户，再按 `customer.read` 范围判断。
- 创建跟进先按 `customers.id + tenant_id` 找当前租户客户，再按 `customer.update` 范围判断。
- `customer_follow_ups` 表仍未冗余 `tenant_id`，但入口已经通过客户归属校验约束。
- 指定跟进员工不能跨租户。

## 后续注意

- `getLatestFollowUpMap()` 和 `getTodayWorkCustomerIds()` 仍在 Customer controller 内，后续可继续迁到 `customerFollowUpService`，让跟进查询入口完全归一。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
