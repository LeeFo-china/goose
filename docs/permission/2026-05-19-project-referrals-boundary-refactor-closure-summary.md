# Project Referrals 权限边界重构闭环摘要

日期：2026-05-19

## 范围

- `GET /project-referrals`
- `GET /project-referrals/:id`
- `POST /project-referrals`
- `PATCH /project-referrals/:id`
- `PUT /project-referrals/:id`
- `GET /project-referrals/project`
- `POST /project-referrals/:id/pay`
- 项目签约后内部重算介绍费链路

## 本次调整

- 将 `recalculate_project_referral` RPC 调用从 `projectReferralService` 下沉到 `projectReferralRepository.recalculateByProjectId()`。
- `projectReferralService` 不再直接依赖 `SupabaseDB`。
- 补充权限边界闭环摘要，明确 `project_referrals` 无 `tenant_id` 时的租户边界依赖。

## 权限口径

- 项目介绍费后台接口统一要求租户上下文。
- 读取要求 `project_referral.read`。
- 创建、更新、登记支付要求 `project_referral.manage`。
- 平台管理员无租户上下文不能进入租户项目介绍费接口。
- 创建时按当前租户查询项目，防止跨租户项目被创建介绍费。
- 创建和更新时校验外部介绍人属于当前租户。
- 已支付介绍费不允许再修改。
- 登记支付会校验当前员工权限、支付登记员工范围和项目可访问范围。

## 租户边界

- `project_referrals` 当前没有冗余 `tenant_id` 字段。
- 租户边界依赖 `projects.tenant_id`、项目可见范围和权限 scope。
- 列表在 `project_referral.read` scope 为 `all` 时，会先收敛到当前租户项目 ID，再查询介绍费，避免跨租户泄漏。
- 详情、按项目查询、更新、支付均通过项目可见范围校验。

## 小程序与 Admin 对接

本轮是后端边界重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/project-referrals/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/project-referrals.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
