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

## 未完成的环境验证

以下验证需要可用 Supabase 环境：

- `supabase migration list` 远端对齐验证。
  - 当前失败原因：缺少正确的 `SUPABASE_DB_PASSWORD`，远端 Postgres 认证失败。
- `supabase migration list --local` 本地对齐验证。
  - 当前失败原因：本地 Supabase/Postgres 未启动，Docker daemon 不可用。
- 真实数据库写入 smoke：
  - 新建合伙人。
  - 启用合伙人。
  - 生成邀请码。
  - 手工绑定装企。
  - 同步充值收入。
  - 录入线索服务费。
  - 生成分佣台账。
  - 创建月结批次。
  - 标记人工打款。

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

## Merge 前置条件

在 merge 回 `main` 前，至少需要满足以下条件之一：

- 提供正确 `SUPABASE_DB_PASSWORD` 后完成 `supabase migration list` 远端对齐检查。
- 或启动本地 Supabase/Docker 后完成本地 migration apply/list 验证。

如果急需先合并代码，必须在合并记录中明确标记：数据库 migration 对齐和真实写入 smoke 尚未在当前环境完成。
