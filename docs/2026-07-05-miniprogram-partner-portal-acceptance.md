# 小程序城市合伙人登录与看板验收记录

日期：2026-07-05
分支：`feature/partner-miniprogram-portal`

## 已实现

- 合伙人成员模型和手机号首次绑定。
- `POST /partner/auth/login`
- `POST /partner/auth/send-code`
- `POST /partner/auth/bind-phone`
- `GET /partner/auth/me`
- `GET /partner/dashboard/summary`
- `GET /partner/invite-codes`
- `GET /partner/dashboard/tenants`
- `GET /partner/dashboard/revenue-events`
- `GET /partner/dashboard/commission-ledger`
- `GET /partner/dashboard/settlements`
- 超管合伙人成员管理：
  - `GET /platform/partners/:id/members`
  - `POST /platform/partners/:id/members`
  - `PATCH /platform/partner-members/:memberId/status`

## 业务边界

合伙人只查看平台收入分佣，不查看装企自有收支、客户收款、项目回款、项目成本和利润。

gooes 本仓库已完成后端/admin 契约；小程序团队只需修改 `/Users/leefo/Public/work/orange` 完成入口、store、服务封装和页面分包对接。本任务不修改 orange 仓库。

## 已验证

- API service/route tests passed.
- API typecheck passed.
- Admin typecheck passed.
- 迁移文件已通过 contract tests。

## 待 Task 6 验证

- 远端应用 migration 前需执行 `supabase migration list` 确认 Local/Remote 状态。
- 应用 migration 后需再次执行 `supabase migration list` 验证 Local/Remote 对齐。
- 远端 migration 应用和生产数据状态不在 Task 5 docs commit 范围内。
