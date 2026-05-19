# WeChat 权限边界核查 Phase 6

日期：2026-05-19

## 范围

本阶段处理微信登录入口中的角色解析链路，并完成 WeChat controller 本轮闭环：

- membership 模式下根据 employee / customer membership 解析角色。
- legacy 模式下根据 `employees.user_id` / `customers.user_id` 解析角色。
- dual 模式下合并 membership 和 legacy 角色。

## 本次调整

- 新增 `wechatAuthRoleRepository`，集中访问角色解析所需的 `employees` 和 `customers`。
- 新增 `wechatAuthRoleService`，封装 membership / legacy / dual 角色解析。
- `WeChatController` 不再直接查询 `employees` 或 `customers` 解析角色。
- `WeChatController` 删除 `getLegacyUserRoles()` 中的直接数据库访问。
- `WeChatController` 当前已无 `SupabaseDB` 直接依赖。

## 权限口径

- membership 员工角色必须满足员工状态 active 且租户 active。
- membership 客户角色必须满足客户所属租户 active。
- legacy 员工角色沿用 `employees.user_id = authUserId` 且 `status = active`。
- legacy 客户角色沿用 `customers.user_id = authUserId` 且租户 active。
- dual 模式合并 membership 和 legacy 角色，并忽略 legacy `visitor`。
- 无员工 / 客户角色时返回 `visitor`。

## 分层边界

- controller：调用角色 service、处理登录流程和响应包装。
- service：编排 membership / legacy / dual 角色解析。
- repository：直接访问 `employees` 和 `customers`。

## 已完成阶段

1. Phase 1：短信验证码链路下沉。
2. Phase 2：微信身份映射和历史 auth user 兼容链路下沉。
3. Phase 3：客户租户候选项读取链路下沉。
4. Phase 4：客户绑定写链路下沉。
5. Phase 5：员工绑定数据访问链路下沉。
6. Phase 6：角色解析链路下沉并完成 WeChat controller 闭环。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/wechat/index.ts` 无 `SupabaseDB` 直接依赖。
- `apps/api/src/controllers/wechat/index.ts` 无 `getAdminClient` / `getClient` / `from(` / `rpc(` 直接调用。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
