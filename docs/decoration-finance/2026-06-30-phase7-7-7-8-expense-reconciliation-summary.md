# Phase 7.7/7.8 费用对账异常与项目摘要增强

日期：2026-06-30

## 背景

Phase 7.6 已补齐对账异常运营统计，但异常来源仍主要集中在应收、收款和项目收款台账。费用审批与支出付款进入稳定使用后，需要把费用打款、支出台账和成本归集纳入同一套对账异常闭环。

本阶段继续坚持“对账只发现问题，人工处理动作只做状态记录，不自动修账”的原则。

## 本阶段范围

### Phase 7.7 费用侧对账异常

新增三类异常：

- `expense_paid_without_ledger`：费用已打款，但未找到对应 `expense_settlement` 支出台账。
- `expense_paid_amount_mismatch`：费用打款金额与对应支出台账合计不一致。
- `expense_ledger_without_category`：支出台账缺少 `cost_category_id`，无法归集到成本分类。

异常方向统一返回：

- `direction=expense`

异常主体：

- 费用打款未入账、金额不一致：`subject_type=expense_settlement`，`subject_id=expense_request_settlements.id`
- 支出台账缺少成本分类：`subject_type=ledger`，`subject_id=finance_ledger_entries.id`

动作入口：

- 费用打款相关异常跳转 `/finance/ledger`，携带 `direction=out`、`entry_type=expense_settlement`、`expense_request_id`、`expense_settlement_id`。
- 支出台账缺成本分类跳转 `/finance/ledger`，携带 `direction=out`、`entry_type=expense_settlement`、`ledger_id`、`unallocated_only=true`。

数据库约束：

- migration `20260630113000_finance_reconciliation_expense_exceptions.sql` 扩展 `finance_reconciliation_exception_actions` 的 `exception_code` 和 `subject_type` check constraint。

### Phase 7.8 项目级对账摘要增强

`GET /finance/reconciliation/project/:projectId` 在原金额和异常数量基础上新增：

- `income_ledger_consistent`
- `payment_allocation_consistent`
- `expense_ledger_consistent`
- `latest_exception_code`
- `latest_exception_title`
- `highest_exception_level`

Admin 项目详情“对账摘要”继续使用原卡片结构，新增展示：

- 最高等级
- 最新异常类型

## Admin 对接

Admin 已同步：

- 对账异常筛选新增费用异常类型。
- 对账异常标签新增费用侧文案。
- 财务台账列表查询支持 `expense_request_id`、`expense_settlement_id`。
- 项目详情对账摘要展示最高等级和最新异常类型。

## 小程序边界

本阶段小程序无必改。

原因：

- 新增异常均属于 Admin 财务对账后台能力。
- 不改变费用申请、费用审批、打款、施工 workflow 和收款 workflow 的小程序契约。
- 不新增小程序需要消费的 workflow action。
- 不要求小程序读取风险或对账异常字段做业务判断。

如未来小程序需要展示项目财务健康摘要，应由后端单独提供面向员工端的只读摘要接口，并明确字段白名单；不要直接让小程序消费 Admin 对账异常列表。

## 验证记录

已通过：

- `apps/api`：
  - `bun test src/services/finance-reconciliation-expense.test.ts src/services/finance-ledger.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-operating-stats.test.ts src/services/finance-reconciliation-action-targets.test.ts`
  - `bun test src/services/finance-reconciliation-project-summary.test.ts src/services/finance-reconciliation.test.ts`
  - `bun run check`
- `apps/admin`：
  - `bun test components/finance/finance-ledger-query-utils.test.ts components/finance/finance-reconciliation-utils.test.ts`
  - `bun test components/projects/project-finance-reconciliation-summary-utils.test.ts`
  - `pnpm run check`
- migration：
  - 应用前 `supabase migration list` 确认 `20260630113000` 仅 Local 存在。
  - `PGSSLMODE=disable supabase db push --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"` 应用成功。
  - 应用后 `supabase migration list` 确认 `20260630113000` Local/Remote 对齐。

说明：pooler URL 执行 `supabase db push` 时出现 prepared statement 冲突，已改用 direct URL 完成 migration；未手工执行 DDL。

后续发布后只读 smoke 建议覆盖：

- Admin `/finance/reconciliation` 费用异常筛选。
- Admin `/finance/ledger` 费用申请/打款参数跳转。
- Admin 项目详情对账摘要最高等级和最新异常展示。
