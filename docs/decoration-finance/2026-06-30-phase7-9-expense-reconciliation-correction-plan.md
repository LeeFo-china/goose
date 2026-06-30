# Phase 7.9 费用对账修正闭环计划

日期：2026-06-30

## 目标

Phase 7.7/7.8 已把费用侧异常纳入财务对账视图。Phase 7.9 建议补齐费用异常的人工修正闭环，让财务人员能从异常列表进入对应单据，完成修正、记录审计，并重新核验异常状态。

本阶段继续坚持：

- 对账负责发现问题。
- 修正动作必须由有权限的财务/管理员人工触发。
- 不自动改账、不自动补金额、不绕过 workflow。
- 所有修正动作必须进入审计记录。

## 异常闭环范围

### 1. 费用已打款但未入账

异常码：

```text
expense_paid_without_ledger
```

建议能力：

- Admin 从异常详情进入费用申请/打款上下文。
- 提供“补生成支出台账”动作。
- 后端按 `expense_request_settlements.id` 幂等生成 `finance_ledger_entries`。
- 若台账已存在，返回现有 ledger，不重复生成。
- 修正动作写入 `finance_reconciliation_exception_actions`。

验收：

- 补生成后 `expense_ledger_consistent=true`。
- 重新扫描后异常可标记 resolved。

### 2. 费用打款金额与台账不一致

异常码：

```text
expense_paid_amount_mismatch
```

建议能力：

- Admin 显示费用打款金额、台账金额、差异金额。
- 第一阶段只提供“定位台账”和“记录处理动作”。
- 不建议直接做自动改金额，因为费用支出可能涉及审批单、打款凭证和台账三方一致性。

后续可选：

- 若确认业务允许，新增受控调整动作。
- 调整必须要求原因、凭证、操作人，并写审计。

验收：

- 异常列表能准确跳转到费用申请和支出台账。
- 处理动作可追溯。
- 不改变原费用申请审批/打款 workflow。

### 3. 支出台账缺成本分类

异常码：

```text
expense_ledger_without_category
```

建议能力：

- Admin 从异常列表定位到对应支出台账。
- 提供“补成本分类”入口。
- 后端更新 `finance_ledger_entries.cost_category_id`，校验分类属于当前租户且可用于费用归集。
- 写入修正审计。

验收：

- 更新后项目经营汇总/成本归集能读到成本分类。
- 重新扫描后异常可关闭。

## API 建议

优先沿用现有财务对账修正接口风格，避免为每个异常散落独立入口。

建议新增或扩展：

- `POST /finance/reconciliation/exceptions/:id/actions`
  - `operation=generate_expense_ledger`
  - `operation=update_expense_ledger_category`
  - `operation=record_expense_amount_mismatch_review`
- `GET /finance/reconciliation/exceptions/:id`
  - 返回费用申请、打款、台账、差异和可执行动作。

写接口必须：

- 校验租户上下文。
- 校验财务修正权限。
- 幂等。
- 返回 action、ledger、exception 最新状态。
- 错误响应经过 `error-factory.ts` 包装。

## Admin 对接

Admin 建议优先补：

- 对账异常详情抽屉。
- 费用异常专属上下文卡片。
- 补生成支出台账动作。
- 补成本分类动作。
- 金额不一致的只读差异说明和处理记录入口。
- 修正后刷新异常列表、项目详情对账摘要和运营统计。

不要在项目详情里直接做隐式修正；项目详情只展示摘要和跳转入口。

## 小程序边界

本阶段小程序无必改。

原因：

- 费用对账异常修正是 Admin 财务后台能力。
- 不新增小程序 workflow action。
- 不改变费用申请、审批、撤回、驳回、打款页面契约。
- 不要求小程序读取对账异常列表或项目财务风险字段做判断。

如果未来员工端需要看到费用异常提醒，应由后端提供员工端只读摘要接口，字段白名单另行确认。

## 验收计划

1. migration：
   - 如新增字段、约束或索引，必须通过 `supabase/migrations/`。
   - 应用后执行 `supabase migration list` 验证 Local/Remote 对齐。
2. API：
   - 费用未入账补生成支出台账幂等 smoke。
   - 缺成本分类更新 smoke。
   - 金额不一致记录处理动作 smoke。
3. Admin：
   - 异常列表跳转和详情抽屉。
   - 修正动作成功/失败状态。
   - 修正后刷新对账摘要。
4. 审计：
   - 修正动作能在 Phase 7.5 审计视图中看到。
5. RAG/文档：
   - 更新本目录 README。
   - 提交后执行 RAG dry-run/同步，若 409 按已修复流程处理。
