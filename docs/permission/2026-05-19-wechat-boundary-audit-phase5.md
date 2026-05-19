# WeChat 权限边界核查 Phase 5

日期：2026-05-19

## 范围

本阶段处理微信登录入口中的员工绑定数据访问链路：

- `bindEmployeeRole()` 中按手机号查询员工身份。
- membership 已存在时同步 `employees.user_id`。
- 绑定新员工身份前清理当前 auth user 的其他员工绑定。
- 绑定目标员工身份。

## 本次调整

- 新增 `wechatEmployeeIdentityRepository`，集中访问 `employees` 表。
- 新增 `wechatEmployeeIdentityService`，对 controller 提供员工登录候选查询和绑定写入能力。
- `WeChatController` 的 `bindEmployeeRole()` 不再直接查询或更新 `employees`。
- `WeChatController` 保留员工登录业务分支、微信 openid 迁移、membership 同步和 auth context 失效逻辑。

## 权限口径

- 手机号必须唯一匹配一个员工档案。
- 员工状态必须可登录。
- 员工所属租户必须 active。
- 已有 employee membership 时允许同步 legacy `employees.user_id`。
- 目标员工已绑定其他 auth user 且存在 openid 时，必须走换绑申请校验。
- 新绑定前会清理当前 auth user 旧的其他员工绑定。

## 分层边界

- controller：处理员工登录流程分支、微信身份迁移、membership 同步、响应包装。
- service：提供员工候选查询和绑定写入能力。
- repository：直接访问 `employees` 表。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`WeChatController` 当前剩余直连主要集中在角色解析中的员工 / 客户角色存在性查询。

## 验收

- `bindEmployeeRole()` 不再由 `WeChatController` 直接访问 `employees`。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
