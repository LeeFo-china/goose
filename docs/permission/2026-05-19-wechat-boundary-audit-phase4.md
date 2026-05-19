# WeChat 权限边界核查 Phase 4

日期：2026-05-19

## 范围

本阶段处理微信登录入口中的客户绑定写链路：

- `bindCustomerToAuthUser()` 中的客户档案绑定写入。
- `bindCustomerRole()` 中的手机号客户查询、当前账号客户绑定查询、自助创建客户和客户绑定写入。

## 本次调整

- `wechatCustomerIdentityRepository` 增加客户身份基础读取、自助创建和绑定写入方法。
- `wechatCustomerIdentityService` 增加 `bindCustomerAuthUser()`。
- `wechatCustomerIdentityService` 增加 `bindCustomerRole()`，封装手机号客户绑定流程。
- `WeChatController` 不再直接执行本阶段客户绑定写入。
- `WeChatController` 保留登录流程分支、微信 openid 迁移、会话签发和响应包装。

## 权限口径

- 绑定客户前必须校验是否已有 active customer membership。
- 目标客户已绑定其他 auth user 且当前账号无 membership 时，必须走换绑申请校验。
- 当前账号已绑定其他客户时，禁止直接绑定新客户。
- 手机号匹配多个客户档案时，要求联系管理员处理。
- 自助创建客户只允许 `visitor_self_registered` 来源。
- 新绑定客户会补 `claimed_at`，并同步 customer business membership。

## 分层边界

- controller：处理登录流程分支、调用微信身份迁移、调用客户绑定 service、签发 token。
- service：编排客户绑定规则、换绑申请校验、membership 同步。
- repository：直接访问 `customers` 表。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`WeChatController` 当前剩余直连主要集中在：

1. 员工绑定与员工租户上下文链路。
2. 角色解析中的员工 / 客户角色存在性查询。

## 验收

- `bindCustomerRole()` 不再由 `WeChatController` 直接访问 `customers`。
- `bindCustomerToAuthUser()` 中的客户绑定写入不再由 `WeChatController` 直接访问 `customers`。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
