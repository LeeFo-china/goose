# Customer 权限边界核查 Phase 15

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/services/customer-core.ts`
- `apps/api/src/repositories/customer-core.ts`

本阶段聚焦客户列表查询链路。

## 本次调整

- `customerCoreRepository` 增加客户列表专用查询能力：
  - 通用列表筛选条件。
  - ID 列表查询。
  - 总数查询。
  - 分页行查询。
  - 按 ID 集合回读并保持原排序。
- `customerCoreService.listCustomers()` 统一处理：
  - 当前租户上下文。
  - `customer.read` 可见负责人范围。
  - 今日工作客户范围。
  - 跟进状态筛选。
  - 列表分页。
  - 最新跟进摘要。
- `CustomerController.list()` 改为只做请求校验、调用 service、补充手机号/房产/来源响应摘要和包装分页响应。
- `CustomerController` 删除列表筛选 SQL 和 `customerSelect` 字符串。

## 已核查边界

- 所有客户列表查询强制 `customers.tenant_id = authContext.tenantId`。
- 负责人范围仍来自 `accessPolicyService.getVisibleCustomerOwnerIds(authContext, "customer.read")`。
- 今日工作客户范围仍由 `customerFollowUpService` 按租户过滤。
- 跟进状态筛选仍先按租户客户 ID 取最新跟进摘要。
- Controller 内不再直接访问 `customers` 表。

## 后续注意

- `CustomerController` 仍保留响应组装方法，如手机号脱敏、房产摘要合并、来源摘要合并；后续如需要继续瘦身，可再抽 `customer-response-presenter`。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
