# Customer 权限边界重构闭环摘要

日期：2026-05-19

## 背景

本轮 Customer 模块整改的目标不是改变业务功能，而是把租户边界、权限判断和 Supabase 访问路径系统化，避免 `CustomerController` 继续承担 HTTP、权限、查询、领域编排和响应组装全部职责。

整改前的主要问题：

- `CustomerController` 直接访问 `customers`、`properties`、`employees`、`customer_follow_ups` 等核心表。
- 多个 helper 允许 `tenantId` 为空，依赖调用方“记得传租户”。
- 客户主表、房产、跟进、来源、手机号、负责人分配逻辑混在一个 controller 内。
- 后续新增接口时容易绕过统一租户边界和权限口径。

## 当前结论

Customer 模块核心权限整改已闭环。

当前 `CustomerController` 中已无以下直连访问：

- `SupabaseDB.getAdminClient()`
- `customers`
- `properties`
- `employees`
- `customer_follow_ups`

Controller 当前保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 service。
- 做响应组装和 `ResponseHandler.success()` 包装。
- 保留手机号脱敏、来源摘要合并、房产摘要合并、跟进摘要合并等 presenter 类逻辑。

## 已拆分的 Service / Repository

### customer-core

文件：

- `apps/api/src/services/customer-core.ts`
- `apps/api/src/repositories/customer-core.ts`

职责：

- 客户列表查询。
- 客户详情查询。
- 客户创建主表写入。
- 客户更新主表写入。
- 客户作废。
- 客户主表访问行查询。
- 列表筛选、计数、分页、按 ID 回读。

边界：

- 所有主表查询和写入强制 `customers.tenant_id = authContext.tenantId`。
- 列表可见范围统一使用 `customer.read`。
- 详情使用 `customer.read`。
- 作废使用 `customer.update`。

### customer-properties

文件：

- `apps/api/src/services/customer-properties.ts`
- `apps/api/src/repositories/customer-properties.ts`

职责：

- 客户房产列表。
- 新增房产。
- 设置主房产。
- 更新房产。
- 客户详情/列表房产摘要。
- 创建/更新客户时主房产 upsert。

边界：

- 所有 `properties` 查询和写入强制当前租户 ID。
- 房产操作先校验客户属于当前租户，再校验 `customer.read` 或 `customer.update`。
- 房产存在但不属于当前客户时仍返回 `PROPERTY_NOT_BELONG_TO_CUSTOMER`。

### customer-follow-ups

文件：

- `apps/api/src/services/customer-follow-ups.ts`
- `apps/api/src/repositories/customer-follow-ups.ts`

职责：

- 客户跟进列表。
- 创建客户跟进。
- 最新跟进摘要。
- 今日工作客户范围。
- 跟进评论摘要补充。

边界：

- 跟进列表和创建先按 `customers.id + tenant_id` 校验客户归属。
- 跟进列表使用 `customer.read`。
- 创建跟进使用 `customer.update`。
- 指定其他跟进员工时要求 `customer.update = all`，并校验员工属于当前租户且 active。

### customer-owner-assignments

文件：

- `apps/api/src/services/customer-owner-assignments.ts`
- `apps/api/src/repositories/customer-owner-assignments.ts`

职责：

- 批量分配负责人。
- 创建客户时负责人可用性校验。
- 更新客户时负责人切换权限校验。

边界：

- 目标负责人查询强制 `employees.tenant_id = authContext.tenantId`。
- 批量客户查询和更新强制 `customers.tenant_id = authContext.tenantId`。
- 单个/批量负责人切换统一使用 `customer.assign_owner` 范围判断。

### customer-sources

文件：

- `apps/api/src/services/customer-sources.ts`
- `apps/api/src/repositories/customer-sources.ts`

职责：

- 客户来源时间线。
- 客户来源摘要。

边界：

- 查询来源前先校验客户属于当前租户。
- `customer_sources` 查询强制当前租户 ID。
- 来源关联员工和分享链接按当前租户过滤。

### customer-phone-privacy

文件：

- `apps/api/src/services/customer-phone-privacy.ts`

职责：

- 手机号脱敏。
- 查看/拨打/复制手机号权限判断。
- 手机号访问审计日志。

边界：

- 手机号动作读取客户时按 `id + tenant_id` 查询。
- 先校验 `customer.read`，再校验 `customer.phone.view/call/copy`。

## Phase 汇总

| Phase | 主要内容 |
| --- | --- |
| Phase 1 | Customer controller 迁到 `TenantBaseController`，统一租户上下文。 |
| Phase 2 | 客户房产和客户跟进创建的租户/员工边界收紧。 |
| Phase 3 | 客户来源和手机号动作边界核查，来源关联按租户过滤。 |
| Phase 4 | 最新跟进摘要、今日工作客户增加租户二次校验。 |
| Phase 5 | 客户主 CRUD 详情/创建/更新边界收紧。 |
| Phase 6 | 房产 helper 全部改为必传 `tenantId`。 |
| Phase 7 | 客户跟进列表/创建迁到 service/repository。 |
| Phase 8 | 跟进摘要和今日工作客户迁到 service/repository。 |
| Phase 9 | 客户房产链路迁到 service/repository。 |
| Phase 10 | 批量分配负责人迁到 service/repository。 |
| Phase 11 | 创建/更新客户负责人校验复用同一 service。 |
| Phase 12 | 客户详情和作废迁到 `customer-core`。 |
| Phase 13 | 客户创建主表写入迁到 `customer-core`。 |
| Phase 14 | 客户更新主表查询/写入/回读迁到 `customer-core`。 |
| Phase 15 | 客户列表查询迁到 `customer-core`。 |

## 验收命令

本轮闭环验收执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
rg -n "SupabaseDB\\.getAdminClient\\(\\)|from\\(\"customers\"\\)|from\\(\"properties\"\\)|from\\(\"employees\"\\)|customerSelect|applyCustomerListFilters" apps/api/src/controllers/customer/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。
- Customer controller 核心表直连扫描无结果。

## Admin / 小程序对接

本轮不需要 admin 或微信小程序改代码。

原因：

- 未改变接口路径。
- 未主动改变请求参数。
- 未主动改变响应结构。
- 改动集中在后端 controller/service/repository 分层和权限边界。

建议前端只做回归验证：

- 客户列表。
- 客户详情。
- 创建客户。
- 编辑客户。
- 作废客户。
- 批量分配负责人。
- 房产列表/新增/设主/编辑。
- 跟进列表/新增。
- 手机号查看/拨打/复制。
- 来源时间线。

## 后续建议

短期不建议继续拆 `CustomerController` 的响应组装。当前收益已经明显下降，继续拆 presenter 层容易引入响应结构细微变化。

下一组更有价值的整改对象：

1. `employee`：员工身份、组织架构、微信绑定相关链路多，权限边界价值高。
2. `projects`：项目成员、客户、工地、验收等多模型聚合，租户边界风险高。
3. `customer-project-log-shares`：公开/客户/员工混合入口较多，适合拆 public/customer/employee 边界。

推荐下一步先做 `employee` 模块，因为它和当前 Customer 权限上下文、负责人、组织架构关系最紧密。
