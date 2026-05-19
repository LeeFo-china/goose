# Customer Self Service 权限边界核查 Phase 5

日期：2026-05-19

## 范围

本阶段处理客户小程序自助入口中的验收单 open ticket 链路：

- `POST /customer/project-acceptances/open-ticket/verify`
- `GET /customer/project-acceptances/:id?ticket=...&project_id=...`
- 客户通过 ticket 执行验收确认 / 疑问反馈时复用的 actor 解析链路。

## 本次调整

- `verifyOpenTicketRow()` 在 ticket 和验收单 / 项目匹配后，先校验 ticket 所属租户可用，再进行过期状态写入、使用时间写入和验证次数累加。
- `getCustomerAcceptanceByAuthOrTicket()` 登录态分支不再先按验收单 ID 做无租户读取。
- `getCustomerAcceptanceByAuthOrTicket()` 登录态分支改为在解析到客户租户后，按 `customer.tenant_id` 查询验收单。
- `getCustomerAcceptanceByAuthOrTicket()` ticket 分支直接使用 `verifyOpenTicketRow()` 返回的验收单构建详情。
- ticket 入口的租户可用性校验集中到 `verifyOpenTicketRow()`，避免调用方重复校验和遗漏校验。

## 权限口径

- 登录态访问必须先解析当前登录客户身份。
- 登录态读取验收单必须限制在当前客户租户内。
- 登录态客户必须属于 active 租户。
- ticket 访问必须同时匹配 ticket、验收单 ID、项目 ID。
- ticket 所属租户必须为 active，才允许继续读取验收单或更新 ticket 验证状态。
- ticket 对应验收单必须属于 ticket 记录中的客户。
- ticket 对应验收单必须处于 `leader_approved`，才允许客户 review。

## 租户边界

- 登录态分支使用 `project_acceptances.id = id` 和 `project_acceptances.tenant_id = customer.tenant_id`。
- ticket 分支使用 `project_acceptance_open_tickets.ticket = ticket` 找到票据后，强制校验：
  - `ticket.acceptance_id = acceptance_id`
  - `ticket.project_id = project_id`
  - `ticket.tenant_id` 对应租户为 active
- ticket 验证通过后，验收单读取使用 `ticket.acceptance_id` 和 `ticket.tenant_id`。
- ticket 验证通过后，验收单客户归属必须满足 `project_acceptances.customer_id = ticket.customer_id`。

## 小程序与 Admin 对接

本轮是后端权限边界收紧，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`CustomerSelfServiceController` 当前已无 Supabase 直连；客户自助入口中的项目、日志、评论、验收单 open ticket 链路已完成本轮核查。

后续建议：

1. Phase 6：客户自助 controller 闭环摘要。
2. 单独核查验收单客户操作写链路的状态流转和图片引用边界。

## 验收

- `verifyOpenTicketRow()` 在更新 ticket 前校验租户可用。
- `getCustomerAcceptanceByAuthOrTicket()` 不再无租户读取验收单作为入口。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
