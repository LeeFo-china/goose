# 城市合伙人 MVP 验收与交接记录

日期：2026-07-05
分支：`feature/city-partner-mvp`
worktree：`.worktrees/city-partner-mvp`

## 本次实现范围

- 城市合伙人基础模型：等级、合伙人、邀请码、装企绑定。
- 平台收入和分佣模型：平台收入事件、合伙人分佣台账、月结批次、结算明细。
- 后端接口：
  - `GET/POST /platform/partners`
  - `GET /platform/partners/levels`
  - `GET/PATCH /platform/partners/:id`
  - `PATCH /platform/partners/:id/status`
  - `POST/GET /platform/partners/:id/invite-codes`
  - `GET/POST /platform/partner-bindings`
  - `GET /platform/partner-revenue/events`
  - `POST /platform/partner-revenue/lead-service-fees`
  - `POST /platform/partner-revenue/recharge-events/sync`
  - `GET /platform/partner-commissions`
  - `GET /platform/partner-settlements`
  - `POST /platform/partner-settlements/monthly-batches`
  - `POST /platform/partner-settlements/:id/mark-paid`
- 超管后台页面：`/platform/partners`，包含合伙人、装企绑定、平台收入、分佣台账、月结批次五个 shadcn Tabs。

## 业务边界

平台收益只包含两类：

1. 装修公司在平台内的充值消费。
2. 平台线索成交后，由装修公司向平台支付的线索服务费，默认费率为 `2.5%`。

合伙人只参与平台收益分成。装修公司自己的客户收款、项目成本、内部利润和日常财务不进入平台分成范围。

第一期结算方式：

- 结算周期：自然月月结。
- 结算方式：人工结算。
- 微信支付分账：第一期不接入。

## 已验证

- API 合伙人与收入结算测试通过：
  `bun test src/services/platform-partners.test.ts src/controllers/platform-partners/routes.test.ts src/services/platform-partner-revenue.test.ts src/controllers/platform-partner-revenue/routes.test.ts`
- API 类型检查通过：
  `pnpm --dir apps/api run typecheck`
- Admin 城市合伙人页与平台列表结构测试通过：
  `bun test components/platform-partners/platform-partner-page-layout.test.ts components/platform/platform-list-page-layout.test.ts`
- Admin 类型检查通过：
  `pnpm --dir apps/admin run typecheck`
- API 文件体积检查通过：
  `bun scripts/check-api-file-size.ts`
- Admin 文件体积检查通过：
  `pnpm --dir apps/admin run check:file-size`
- 空白/冲突标记检查通过：
  `git diff --check`
- Admin 路由 smoke 通过：
  - `GET /platform/partners` 未登录 307 到 `/login`
  - `GET /platform/partners?tab=revenue` 未登录 307 到 `/login`
- Supabase 远端 migration 已应用并对齐：
  - `supabase db push --dry-run --db-url <SUPABASE_DB_DIRECT_URL>` 确认仅推送 `20260704193000_create_city_partner_mvp.sql`。
  - `supabase db push --db-url <SUPABASE_DB_DIRECT_URL> --yes` 已应用 `20260704193000_create_city_partner_mvp.sql`。
  - `supabase migration list --db-url <SUPABASE_DB_DIRECT_URL>` 显示 `20260704193000` Local/Remote 均存在。
- 远端数据库只读 smoke 通过：
  - 8 张城市合伙人相关表存在。
  - 5 个关键唯一/查询索引存在。
  - 3 个合伙人等级种子存在。
  - 默认线索服务费率为 `250 bps = 2.5%`。
  - 结算周期为 `monthly`，结算方式为 `manual`。
- 远端数据库写入 smoke 通过：
  - 在单个 `DO` 块中创建合伙人、邀请码、装企绑定、线索服务费收入、分佣台账、月结批次和结算明细。
  - 同一 smoke 中更新台账为结算中、批次为已打款、台账为已结算。
  - smoke 末尾按反向依赖顺序删除测试数据。
  - 后续残留检查确认 `smoke_partners/smoke_invite_codes/smoke_bindings/smoke_revenue_events/smoke_settlement_batches` 均为 `0`。

## 数据库安全提示

Supabase CLI 在查询远端库时报告 `rls_disabled` critical advisory。现有库中大量表未启用 RLS，其中包含本次新增的：

- `platform_partner_levels`
- `platform_partners`
- `platform_partner_invite_codes`
- `tenant_partner_bindings`
- `platform_revenue_events`
- `partner_commission_ledger`
- `partner_settlement_batches`
- `partner_settlement_items`

本次未自动启用 RLS，因为启用 RLS 但未配套 policy 会阻断现有访问路径。后续应单独设计并通过 migration 管理 RLS/policy。

## 官网下一阶段边界

官网第一版只聚焦“招募城市合伙人”：

- 官网表单收集合伙人申请资料。
- 后台需要新增申请列表、审核、转为正式合伙人的能力。
- 官网不直接创建正式合伙人，不直接绑定装企，不触发分佣。

建议后续新增接口：

- `POST /public/partner-applications`
- `GET /platform/partner-applications`
- `PATCH /platform/partner-applications/:id/status`
- `POST /platform/partner-applications/:id/approve`

## 小程序下一阶段边界

小程序侧只负责扫码入驻和携带归因：

- 装修公司通过合伙人专属二维码进入小程序入驻。
- 小程序提交入驻申请时携带 `invite_code` 或二维码场景参数。
- 后端在租户开通成功后自动写入 `tenant_partner_bindings`。
- 小程序不计算分佣，不展示合伙人收益，不处理结算。

建议后续新增或扩展接口：

- 小程序扫码解析：读取合伙人邀请码信息。
- 租户入驻提交：支持传入合伙人邀请码。
- 租户开通成功后：服务端自动创建有效绑定。

## Merge 状态

数据库 migration 对齐和真实写入 smoke 已完成，可 merge 回 `main`。
