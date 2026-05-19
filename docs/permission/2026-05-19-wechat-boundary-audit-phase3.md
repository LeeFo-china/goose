# WeChat 权限边界核查 Phase 3

日期：2026-05-19

## 范围

本阶段处理微信登录入口中的客户租户候选项读取链路：

- 根据手机号查找可绑定客户身份。
- 根据 auth user 查找已绑定客户身份。
- 根据 user identity membership 查找客户身份。
- 为客户租户候选项补充项目数量和最近项目名称。
- 按客户 ID 和租户 ID 读取客户租户候选项。

## 本次调整

- 新增 `wechatCustomerIdentityRepository`，集中访问客户候选项所需的 `customers` 和 `projects` 查询。
- 新增 `wechatCustomerIdentityService`，封装 active 租户过滤、membership 租户匹配和项目概览补充。
- `WeChatController` 不再直接查询客户租户候选项。
- `WeChatController` 不再直接查询候选项项目概览。
- 客户候选项读取保留原有返回结构和选择逻辑。

## 权限口径

- 手机号候选项只返回 active 租户下的客户。
- auth user legacy 绑定候选项只返回 active 租户下的客户。
- membership 候选项必须同时满足：
  - membership 为 active。
  - `identity_type = customer`。
  - `customers.tenant_id = membership.tenant_id`。
  - 客户所属租户为 active。
- 按客户 ID 和租户 ID 读取候选项时强制匹配 `customers.id` 和 `customers.tenant_id`。

## 分层边界

- controller：处理 HTTP 参数、登录流程分支、响应包装。
- service：组合 legacy 绑定和 membership 候选项，过滤 active 租户，补充项目概览。
- repository：直接访问 `customers` 和 `projects`。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`WeChatController` 当前剩余直连主要集中在：

1. 客户绑定、认领、手机号迁移写链路。
2. 员工绑定与员工租户上下文链路。
3. 角色解析中的员工 / 客户角色存在性查询。

## 验收

- 客户租户候选项读取不再由 `WeChatController` 直接访问 `customers`。
- 客户项目概览不再由 `WeChatController` 直接访问 `projects`。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
