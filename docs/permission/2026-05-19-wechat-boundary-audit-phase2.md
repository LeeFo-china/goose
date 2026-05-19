# WeChat 权限边界核查 Phase 2

日期：2026-05-19

## 范围

本阶段处理微信登录入口中的微信身份映射和历史 auth user 兼容链路：

- 微信 `openid` 查找 / 创建 auth user。
- `wechat_identities` 映射查询、创建、更新、清理。
- `find_auth_user_by_openid` 历史用户兼容 RPC。
- 员工 / 客户绑定流程中复用的 openid 查询和映射迁移。

## 本次调整

- 新增 `wechatAuthIdentityRepository`，集中访问 `wechat_identities`、Supabase auth admin 创建用户和 `find_auth_user_by_openid` RPC。
- 新增 `wechatAuthIdentityService`，对 controller 暴露微信身份映射和 auth user 能力。
- `WeChatController` 不再直接访问 `wechat_identities`。
- `WeChatController` 不再直接调用 `find_auth_user_by_openid` RPC。
- `WeChatController` 保留原有登录编排、日志、业务判断和响应结构。

## 权限口径

- 微信登录优先使用 active OAuth identity。
- 旧 `wechat_identities` 映射仅作为兼容路径。
- 如果 OAuth identity 已解绑，必须清理旧 `wechat_identities` 映射，并创建新的访客 auth user。
- 绑定手机号到既有 auth user 时，目标 auth user 若已绑定其他 openid，则返回换绑申请提示。
- 当前 openid 若已绑定其他 auth user，则禁止直接迁移，除非当前映射正是目标 auth user。

## 分层边界

- controller：处理微信登录流程、业务分支、日志、响应包装。
- service：提供微信身份映射、历史用户查询、auth user 创建等能力。
- repository：直接访问 Supabase auth admin、`wechat_identities` 表和历史 RPC。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`WeChatController` 当前剩余直连主要集中在：

1. 客户身份选择与客户租户选项查询链路。
2. 客户绑定、认领、手机号迁移链路。
3. 员工绑定与员工租户上下文链路。
4. 角色解析中的员工 / 客户角色存在性查询。

## 验收

- `apps/api/src/controllers/wechat/index.ts` 无 `wechat_identities` 直接访问。
- `apps/api/src/controllers/wechat/index.ts` 无 `find_auth_user_by_openid` 直接调用。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
