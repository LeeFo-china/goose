# Project Acceptances 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/project-acceptances/index.ts`
- `apps/api/src/services/project-acceptances.ts`
- `apps/api/src/repositories/project-acceptances.ts`
- `apps/api/src/repositories/project-acceptance-open-tickets.ts`
- `apps/api/src/schema/project-acceptances.ts`

## 接口口径

`project-acceptances` 是混合入口：

- 员工后台 / 员工端：发起、更新、提交、复核、驳回、通知客户、作废、模板读取。
- 客户端 / 短信票据：客户确认、客户疑问。

员工接口必须有租户上下文；客户接口不能强制员工租户上下文，需要继续通过客户身份或 open ticket 校验。

员工接口：

- `GET /project-acceptances`
- `GET /project-acceptances/:id`
- `POST /project-acceptances`
- `PATCH /project-acceptances/:id`
- `DELETE /project-acceptances/:id`
- `GET /project-acceptance-templates`
- `GET /project-acceptance-templates/:id`
- `POST /project-acceptances/:id/submit`
- `POST /project-acceptances/:id/approve`
- `POST /project-acceptances/:id/notify-customer`
- `POST /project-acceptances/:id/reject`
- `POST /project-acceptances/:id/cancel`

客户接口：

- `POST /project-acceptances/:id/customer-confirm`
- `POST /project-acceptances/:id/customer-dispute`

## 已有边界

- 员工列表 / 详情按 `project_acceptance.read` 通过项目可见范围过滤。
- 创建要求 `project_acceptance.create`。
- 更新草稿 / 整改要求 `project_acceptance.update_own` 或 `project_acceptance.manage`。
- 提交要求 `project_acceptance.submit`。
- 复核要求 `project_acceptance.review`。
- 驳回要求 `project_acceptance.reject`。
- 作废要求 `project_acceptance.manage`。
- 客户确认 / 疑问通过客户身份或短信 open ticket 验证。
- open ticket 绑定 `acceptance_id`、`project_id`、`customer_id`、`tenant_id`。
- 引用验收图片必须来自当前验收单。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 员工后台验收接口统一使用 `getRequiredTenantContext()`。
- 模板读取也要求租户上下文，避免平台登录态直接访问租户业务入口。
- service 新增 `requireTenantId()`，员工操作使用 `assertTenantContext()`，不再使用平台管理员无租户兼容口径。
- 客户确认 / 疑问接口保持客户身份和 open ticket 口径。

## 后续注意

- 该模块是混合入口，不能整体套 `getRequiredTenantContext()`。
- open ticket 相关公开 / 客户能力后续如拆 controller，应独立成 customer-facing controller / service。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
