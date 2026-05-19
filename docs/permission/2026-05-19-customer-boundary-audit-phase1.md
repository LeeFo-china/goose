# Customer 权限边界核查 Phase 1

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/customer/index.ts`

## 接口口径

`customer` controller 是租户侧客户管理主入口，包含客户列表、详情、创建、更新、作废、批量分配负责人、客户房产、客户来源、客户跟进、手机号隐私动作等能力。

本阶段先做统一入口边界，不改变现有接口路径和业务响应。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 所有客户后台入口统一使用 `getRequiredTenantContext()`。
- `getRequiredCustomerRecord()` 固定按当前租户过滤，不再保留无租户兼容查询。
- 创建客户时写入确定的 `tenant_id`，不再允许空租户客户。
- 新增客户房产时写入确定的 `tenant_id`，不再允许空租户房产。

## 已有边界

- 客户列表通过 `customer.read` 的 scope 计算可见负责人范围。
- 客户创建要求 `customer.create`。
- 客户更新、作废、跟进记录创建等通过 `customer.update` 判断客户可访问范围。
- 批量分配负责人要求 `customer.assign_owner`。
- 客户房产操作先校验客户属于当前租户，再校验客户访问权限。
- 客户手机号 reveal/call/copy 走 `customerPhonePrivacyService`，保留原有隐私审计链路。

## 后续注意

- `customer` controller 仍然过大，后续建议继续拆分：客户列表 / 客户详情 / 客户房产 / 跟进记录 / 手机号隐私动作。
- 本阶段只做入口租户上下文收口，没有重写列表查询和跟进逻辑。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
