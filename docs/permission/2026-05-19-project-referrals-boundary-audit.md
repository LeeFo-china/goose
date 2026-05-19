# Project Referrals 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/project-referrals/index.ts`
- `apps/api/src/services/project-referrals.ts`
- `apps/api/src/repositories/project-referrals.ts`
- `apps/api/src/schema/project-referrals.ts`

## 接口口径

项目介绍费是租户侧项目财务数据，后台接口必须在租户上下文中执行。

接口：

- `GET /project-referrals`
- `GET /project-referrals/:id`
- `POST /project-referrals`
- `PATCH /project-referrals/:id`
- `GET /project-referrals/project`
- `POST /project-referrals/:id/pay`

## 已有边界

- 读取要求 `project_referral.read`。
- 创建、更新、登记支付要求 `project_referral.manage`。
- 创建时校验项目存在，并校验项目在当前员工 `project_referral.manage` 可访问范围内。
- 创建和更新时校验外部介绍人属于当前租户。
- 详情和按项目查询会通过项目可见范围校验。
- 已支付介绍费不允许再修改。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 列表、详情、创建、更新、按项目查询、登记支付统一使用 `getRequiredTenantContext()`。
- service 新增 `requireTenantId()`，项目介绍费业务不再允许平台管理员无租户上下文进入。
- 创建时按当前租户查询项目，防止跨租户项目被创建介绍费。
- 列表在 `project_referral.read` scope 为 `all` 时，先收敛到当前租户项目 ID，再查询介绍费，避免跨租户列表泄漏。
- 登记支付补充项目可访问范围校验，避免只凭介绍费 ID 跨租户登记打款。

## 后续注意

- `project_referrals` 表当前没有冗余 `tenant_id`，租户边界依赖 `projects.tenant_id` 和项目可见范围。后续如继续优化查询性能，可以评估增加 `tenant_id` 并通过触发器或业务写入维护。
- `paid_by` 当前依赖员工权限和项目可见范围约束。后续如允许管理员代登记其他员工，需要补充支付登记员工同租户校验。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
