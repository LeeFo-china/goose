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

- API focused tests passed: `52 pass`.
- API typecheck passed.
- Admin typecheck passed.
- API/admin file-size checks passed.
- 迁移文件已通过 contract tests。
- `supabase db push --dry-run` 确认待应用 migration 为：
  - `20260705190000_create_platform_partner_members.sql`
  - `20260705191000_create_platform_partner_member_binding_rpc.sql`
  - `20260705192000_create_partner_dashboard_summary_rpc.sql`
  - `20260705203000_add_platform_partner_member_remark.sql`
- 已执行 `supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes` 应用上述 4 个 migration。
- 已执行 `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`，确认 Local/Remote 对齐到 `20260705203000`。
- 已执行安全补丁 migration dry-run 和 apply：
  - `20260705204000_harden_platform_partner_member_binding_rpc.sql`
- 已再次执行 `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`，确认 Local/Remote 对齐到 `20260705204000`。
- 已执行远端只读 schema smoke，确认：
  - `platform_partner_members` 表存在。
  - `platform_partner_members.remark` 列存在。
  - `claim_platform_partner_member_binding` RPC 存在。
  - `claim_platform_partner_member_binding` RPC 已包含 partner 状态检查和 `partner_unavailable` 返回分支。
  - `get_partner_dashboard_monthly_summary` RPC 存在并可返回空数据 0 汇总。
  - 关键索引存在：成员手机号/微信绑定索引、租户绑定列表索引、佣金列表索引、结算批次列表索引。

## 剩余说明

- 未写入业务测试数据；小程序真实登录、短信验证码和页面联调需要小程序团队在 orange 对接后验收。
- Supabase CLI 在远端只读查询时提示现有数据库多张表未启用 RLS，其中包含本次新增的 `platform_partner_members`。本仓库当前后端使用 service role 通过 API 控制权限，未在本任务中直接启用 RLS；RLS/policy 需要单独设计 migration，不能直接一键启用以免阻断现有业务。
