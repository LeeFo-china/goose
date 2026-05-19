# Project Acceptances 权限边界重构闭环摘要

日期：2026-05-19

## 范围

员工侧：

- `GET /project-acceptances`
- `GET /project-acceptances/:id`
- `POST /project-acceptances`
- `PATCH /project-acceptances/:id`
- `PUT /project-acceptances/:id`
- `DELETE /project-acceptances/:id`
- `GET /project-acceptance-templates`
- `GET /project-acceptance-templates/:id`
- `POST /project-acceptances/:id/submit`
- `POST /project-acceptances/:id/approve`
- `POST /project-acceptances/:id/notify-customer`
- `POST /project-acceptances/:id/reject`
- `POST /project-acceptances/:id/cancel`

客户侧：

- `POST /project-acceptances/:id/customer-confirm`
- `POST /project-acceptances/:id/customer-dispute`

## 当前边界

- `ProjectAcceptancesController` 继承 `TenantBaseController`，员工侧接口统一通过 `getRequiredTenantContext()` 获取租户上下文。
- 客户确认和客户疑问接口不强制员工租户上下文，继续由客户身份或 open ticket 校验。
- controller 只处理 HTTP 参数校验、上下文读取、调用 service 和响应包装。
- 业务规则集中在 `projectAcceptanceService`。
- Supabase 访问集中在 `projectAcceptanceRepository` 与 `projectAcceptanceOpenTicketRepository`。
- 路由注册已改为 `projectAcceptanceCrudRoutes`，显式声明只挂载 list/get/create/update；删除草稿、提交、复核、客户确认等动作继续由 controller extra routes 暴露。

## 员工侧权限口径

- 列表和详情：要求 `project_acceptance.read`，并通过项目可见范围过滤。
- 创建：要求 `project_acceptance.create`，验收单租户来自项目。
- 更新：草稿或整改状态下，要求 `project_acceptance.update_own` 或 `project_acceptance.manage`。
- 提交：要求 `project_acceptance.submit`，非全量范围时只允许发起人提交。
- 复核：要求 `project_acceptance.review`，非全量范围时只允许指定复核人操作。
- 驳回：要求 `project_acceptance.reject`，非全量范围时只允许指定复核人操作。
- 作废：要求 `project_acceptance.manage`。
- 模板读取：也要求租户员工上下文，避免平台登录态直接进入租户业务入口。

## 客户侧权限口径

- 登录客户链路通过 user identity / membership 解析客户身份。
- 客户只能访问和操作自己项目下、同租户的验收单。
- 短信 open ticket 绑定 `acceptance_id`、`project_id`、`customer_id`、`tenant_id`，并校验状态、有效期和验收单状态。
- 客户确认和客户疑问均会记录 `project_acceptance_actions`。
- 客户疑问引用的验收图片必须来自当前验收单。

## 小程序与 Admin 对接

本轮是权限边界闭环和路由配置显式化，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。
- 后续如拆分 customer-facing controller，需要另补小程序对接文档。

## 验收

- `apps/api/src/controllers/project-acceptances/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
