# 租户预付费积分计费 Phase 1 实施与验收记录

日期：2026-05-12

## 实施范围

Phase 1 已落地计费基础设施：

- 数据库：租户积分账户、账户余额视图、充值订单、积分流水、计费事件、价格规则。
- RPC：账户初始化、人工充值、冻结、解冻、扣费、计费事件结算。
- 后端 API：租户账户查询、租户计费汇总、租户流水、功能价格预估、平台计费汇总、平台租户账户、平台流水、价格规则维护、人工充值。
- Admin：平台计费中心、租户计费账户、侧边栏入口、审计日志中文映射。

## 已执行 Migration

已通过 Supabase CLI 执行：

```bash
supabase db push
```

已应用 migration：

```text
20260512193000_create_tenant_credit_billing.sql
```

## 后端接口

租户侧：

- `GET /billing/account`
- `GET /billing/summary`
- `GET /billing/ledger`
- `GET /billing/feature-estimates`

平台侧：

- `GET /platform/billing/summary`
- `GET /platform/billing/tenants`
- `POST /platform/billing/tenants/:tenantId/manual-recharge`
- `GET /platform/billing/ledger`
- `GET /platform/billing/pricing-rules`
- `POST /platform/billing/pricing-rules`
- `PATCH /platform/billing/pricing-rules/:id`

## Admin 对接

平台超管：

- 新增菜单：`平台运营 / 计费中心`
- 页面路径：`/platform/billing`
- 能力：查看平台积分汇总、租户余额、人工充值、价格规则启停/新增、计费流水。

租户端：

- 新增菜单：`业务 / 计费账户`
- 页面路径：`/billing`
- 能力：查看余额、冻结积分、累计充值/消耗、主要功能计费口径、租户流水。

## 验收结果

已通过：

```bash
bun run api:build
bunx tsc --noEmit -p apps/api/tsconfig.json
bun run build   # apps/admin
supabase db push
supabase db query --linked   # 事务级 RPC 验收，最后 ROLLBACK
```

说明：

- `apps/admin` 的 `bun run lint` 当前会触发 `next lint` 交互式初始化，项目没有可非交互执行的 ESLint 配置，因此本阶段以 `next build` 的类型与构建检查作为 admin 验收。
- Phase 1 仅完成基础账户、规则、人工充值和流水能力；AI、短信、视频链路的真实扣费接入仍按后续阶段推进。

### 事务级 RPC 验收

已在远端库使用事务包裹验收 SQL：

- 创建临时测试租户。
- 初始化积分账户。
- 人工充值 100 元，对应 100000 积分。
- 使用同一 `idempotency_key` 重复充值，确认不重复入账。
- 冻结 60 积分，并重复同一 `source_type/source_id/event_type`，确认不重复冻结。
- 解冻 60 积分。
- 扣费 50 积分，并重复同一来源，确认不重复扣费。
- 超额扣费返回 `TENANT_CREDITS_INSUFFICIENT`，账户余额不变。
- 创建 `tenant_billing_events(status=estimated)` 后调用 `billing_settle_event` 两次，确认只扣一次。
- 检查不存在 `available_credits < 0` 或 `frozen_credits > balance_credits`。
- 最后执行 `ROLLBACK`，不保留测试租户和测试账务数据。

验收过程中发现并修复：

- `billing_manual_recharge` 误混入冻结/扣费来源幂等判断，导致函数引用不存在的 `p_source_type`。
- `billing_freeze_credits` 缺少前置幂等判断，重复请求存在二次冻结风险。
- `tenant_billing_events` 缺少 `scene_code / provider / model` 上下文字段，已补齐，方便 Phase 2 影子计费和后续审计。

## 下一阶段准入

进入 Phase 2 前需要确认：

- 平台超管能在 `/platform/billing` 完成人工充值，并看到订单流水。
- 租户能在 `/billing` 查看可用积分变化。
- 价格规则新增、启停后能在价格规则列表反映。
- 手工充值操作能写入平台审计日志。

以上通过后，再进入短信计费链路接入。
