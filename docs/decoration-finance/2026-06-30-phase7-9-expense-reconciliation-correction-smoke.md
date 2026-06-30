# Phase 7.9 费用对账异常修正闭环 Smoke 记录

## 范围

本轮补齐费用类对账异常的后台修正闭环：

- `expense_paid_without_ledger`：费用已打款未入账，Admin 可补生成支出台账。
- `expense_ledger_without_category`：支出台账缺成本分类，Admin 可补成本分类。
- `expense_paid_amount_mismatch`：费用打款与支出台账金额不一致，Admin 只记录复核结论，不自动改金额。

## API 契约

新增详情接口：

```http
GET /finance/reconciliation/exceptions/:fingerprint
```

返回：

- `exception`：当前运行时重算出的异常。
- `context`：费用申请、打款记录、相关支出台账上下文。
- `available_actions[]`：当前异常可执行动作。
- `history[]`：最近 10 条处理记录。

处理接口沿用：

```http
POST /finance/reconciliation/exceptions/:fingerprint/actions
```

新增动作：

- `generate_expense_ledger`
  - 仅允许用于 `expense_paid_without_ledger`。
  - 后端按费用打款记录幂等生成 `finance_ledger_entries` 支出流水。
- `update_expense_ledger_category`
  - 仅允许用于 `expense_ledger_without_category`。
  - 请求体必须传 `cost_category_id`。
- `record_expense_amount_mismatch_review`
  - 仅允许用于 `expense_paid_amount_mismatch`。
  - 只写处理记录，不修改费用申请、打款记录或台账金额。

所有动作都会写入 `finance_reconciliation_exception_actions`。

## Admin 行为

Admin `/finance/reconciliation` 列表入口不变。

点击“处理”后：

1. 拉取异常详情。
2. 费用异常显示费用申请、打款金额、打款时间、收款人、台账金额、相关台账数量。
3. 动作下拉优先使用后端 `available_actions[]`。
4. 补成本分类时展示 active 成本分类选择框。
5. 保存后统一调用 `POST /finance/reconciliation/exceptions/:fingerprint/actions`。

Admin `/finance/audits` 已补齐费用修正审计类型：

- 补生成支出台账
- 补支出台账成本分类
- 记录费用金额复核

## 小程序边界

本轮不需要小程序改代码。

小程序侧不执行费用对账修正，不需要调用新增详情接口，也不需要提交新增 action。小程序继续只读现有费用、项目、workflow 和财务状态即可。

费用对账异常修正是 Admin 财务后台能力，由具备 `finance.reconciliation.manage` 及相关财务权限的人员执行。

## 验证命令

已执行：

```bash
bun test src/services/finance-reconciliation.test.ts
bun test src/services/finance-correction-audits.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin check
```

待最终收口前执行：

```bash
bun run check:file-size
git diff --check
```

如本地 Supabase 环境可用，再执行 migration 状态核验：

```bash
supabase migration list
```
