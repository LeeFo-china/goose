# Phase 7.9 费用对账异常修正闭环 Implementation Plan

## Scope

在隔离 worktree `feat/phase7-9-expense-reconciliation-correction` 完成费用对账异常修正闭环：

- `expense_paid_without_ledger`：后台一键补生成费用支出台账。
- `expense_ledger_without_category`：后台为支出台账补成本分类。
- `expense_paid_amount_mismatch`：后台记录金额不一致复核结论，不自动改金额。
- `GET /finance/reconciliation/exceptions/:fingerprint`：提供异常详情、费用上下文、可执行动作、处理历史。
- Admin 对账异常处理面板展示费用上下文和专属修正动作。
- 修正动作进入对账处理记录和财务修正审计口径。
- 小程序不参与修正，只读现有财务状态。

## Constraints

- 数据库约束变更必须通过 `supabase/migrations/`。
- 不修改 `/Users/leefo/Public/work/orange`。
- 后端继续使用 controller/service/repository 分层。
- 异常响应通过 `Errors` 包装。
- 列表接口保持分页，详情接口只返回单个异常上下文。
- 修正动作必须基于当前运行时重算出的异常，异常已消失时返回 404。

## Tasks

### Task 1: Backend Red Tests

1. 在 `apps/api/src/services/finance-reconciliation.test-fixtures.ts` 补费用异常候选数据。
2. 在 `apps/api/src/services/finance-reconciliation.test.ts` 增加失败用例：
   - `getExceptionDetail()` 返回费用打款/费用申请/台账上下文和可执行动作。
   - `generate_expense_ledger` 调用费用支出台账幂等写入并写处理记录。
   - `update_expense_ledger_category` 更新台账成本分类并写处理记录。
   - `record_expense_amount_mismatch_review` 只写处理记录，不写台账。
   - 动作和异常类型不匹配时返回 400。
3. 运行目标测试，确认失败原因是方法/动作不存在。

### Task 2: Backend Implementation

1. 扩展 `FinanceReconciliationAction` 枚举和 action schema：
   - `generate_expense_ledger`
   - `update_expense_ledger_category`
   - `record_expense_amount_mismatch_review`
   - `cost_category_id` 仅在 `update_expense_ledger_category` 时必填。
2. 新增费用对账修正 repository：
   - 查询费用打款和费用申请上下文。
   - 查询费用支出台账上下文。
3. 扩展 `FinanceReconciliationService`：
   - `getExceptionDetail()`
   - 专属修正动作分发。
   - 修正后统一写 `finance_reconciliation_exception_actions`。
4. 更新 action 状态映射：
   - 生成台账、补成本分类 => `resolved`
   - 金额不一致复核 => `acknowledged`

### Task 3: Migration

新增 migration 扩展 `finance_reconciliation_exception_actions.action` check constraint，包含三类费用修正动作。

### Task 4: Audit Coverage

扩展财务修正审计：

- operation 增加：
  - `generate_expense_ledger`
  - `update_expense_ledger_category`
  - `record_expense_amount_mismatch_review`
- 费用支出台账补生成通过 ledger metadata 进入审计。
- 成本分类补录通过 `cost_category_updated_at/by` 进入审计。
- 金额不一致复核通过对账 action 进入审计。

### Task 5: Admin UI

1. 扩展 `finance-reconciliation-requests.ts` 类型：
   - action union
   - detail DTO
   - cost category options复用现有请求。
2. 改造 `FinanceReconciliationActionDialog`：
   - 加载详情和历史。
   - 显示费用申请、打款、台账上下文。
   - 根据 `available_actions` 显示专属动作。
   - 成本分类动作展示 active cost category select。
3. 保持现有对账列表入口不变。

### Task 6: Docs

1. 在 `docs/decoration-finance/` 记录 Phase 7.9 smoke 和 Admin 操作说明。
2. 记录小程序边界：本轮 orange 无需改动，只读 finance/workflow 状态。

### Task 7: Verification

运行：

```bash
bun test apps/api/src/services/finance-reconciliation.test.ts
bun test apps/api/src/services/finance-correction-audits.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin check
bun run check:file-size
git diff --check
```

如本地数据库可用，再执行 migration list / targeted smoke；不可用时在文档说明未执行原因。

### Task 8: Git Finish

1. 查看 diff，确认不触碰 orange。
2. 提交 Phase 7.9 worktree 变更。
3. 合并回 main。
4. 清理 `.worktrees/phase7-9-expense-reconciliation-correction`。
