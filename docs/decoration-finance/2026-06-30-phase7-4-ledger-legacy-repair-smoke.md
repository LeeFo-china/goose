# Phase 7.4 历史收款台账修正 Smoke

日期：2026-06-30

范围：`ledger_without_payment` 异常的人工闭环。覆盖历史项目收款流水关联 confirmed payment，以及确认无法追溯原始 payment 的历史流水标记。

## 实施内容

- API 新增：
  - `POST /finance/ledger/:id/link-payment`
  - `POST /finance/ledger/:id/mark-legacy-payment`
  - `GET /finance/ledger` 支持 `ledger_id` 精确筛选
- `ledger_without_payment` 对账异常跳转目标增加 `ledger_id`：
  - `/finance/ledger?project_id=...&direction=in&entry_type=project_payment&ledger_id=...`
- `finance_ledger_entries` 增加人工修正审计字段：
  - `payment_linked_at`
  - `payment_linked_by`
  - `payment_link_reason`
  - `payment_link_previous_payment_id`
  - `legacy_payment_ledger_marked_at`
  - `legacy_payment_ledger_marked_by`
  - `legacy_payment_ledger_reason`
- Admin 台账页新增受控入口：
  - 未关联 payment 的 `project_payment` 收入流水可关联当前项目 confirmed 收款。
  - 无法追溯 payment 的历史流水可标记历史。

## Migration 验证

已执行：

```bash
PGSSLMODE=disable supabase db push --db-url "$DB_URL_SIMPLE" --yes
PGSSLMODE=disable supabase migration list --db-url "$DB_URL_SIMPLE"
```

结果：`20260630093000_finance_ledger_legacy_repair` Local/Remote 已对齐。

## API Smoke

临时 API：`http://127.0.0.1:3101`

执行账号：`18800000001`

样本：

- project ID：`b95f6b51-6b9c-4970-948e-b369106545d8`
- payment ID：`46bfa623-8fbe-464e-9ad3-37e7850cf5da`
- 关联修正 ledger ID：`a499540a-6960-4a76-90e0-f203aac39ded`
- 标记历史 ledger ID：`56a3fc52-4e1d-4ce6-928f-531b5d1cbed4`

执行链路：

1. 插入两条 smoke 用历史项目收款流水，均为 `direction=in`、`entry_type=project_payment`、`payment_id=null`。
2. 查询：
   - `GET /finance/reconciliation/exceptions?...&exception_code=ledger_without_payment`
   - 修正前 `beforeTotal=2`
   - action target 已包含 `ledger_id`
3. 调用：
   - `POST /finance/ledger/a499540a-6960-4a76-90e0-f203aac39ded/link-payment`
   - body：`payment_id + reason`
   - 返回 ledger `payment_id=46bfa623-8fbe-464e-9ad3-37e7850cf5da`
4. 调用：
   - `POST /finance/ledger/56a3fc52-4e1d-4ce6-928f-531b5d1cbed4/mark-legacy-payment`
   - body：`reason`
   - 返回 ledger `legacy_payment_ledger_marked_at` 非空
5. 再次查询同一对账异常：
   - 修正后 `afterTotal=0`
6. 分别通过 `ledger_id` 查询台账：
   - 关联样本可读到 `payment_id`
   - 历史样本可读到 `legacy_payment_ledger_marked_at`

Smoke 输出：

```json
{
  "ok": true,
  "paymentId": "46bfa623-8fbe-464e-9ad3-37e7850cf5da",
  "linkLedgerId": "a499540a-6960-4a76-90e0-f203aac39ded",
  "legacyLedgerId": "56a3fc52-4e1d-4ce6-928f-531b5d1cbed4",
  "beforeTotal": 2,
  "afterTotal": 0,
  "linkAction": "/finance/ledger?project_id=b95f6b51-6b9c-4970-948e-b369106545d8&direction=in&entry_type=project_payment&ledger_id=a499540a-6960-4a76-90e0-f203aac39ded"
}
```

备注：首次 smoke 脚本断言使用了错误字段 `source_id`。接口事实是 `ledger_without_payment` 异常对象使用 `id` 和 `exception_fingerprint` 标识业务对象。修正脚本后 smoke 通过。

## 静态验证

已通过：

```bash
cd apps/api
bun test src/services/finance-ledger.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts

cd /Users/leefo/Public/work/gooes/.worktrees/finance-ledger-legacy-repair
bun run api:typecheck
bun run api:check-file-size
bun test apps/admin/components/finance/finance-ledger-query-utils.test.ts
pnpm --dir apps/admin check
```

## 小程序影响

本任务只新增 Admin/API 人工修正能力，小程序无必改。

小程序继续保持：

- 不写财务修正逻辑。
- 不直接操作财务台账修正接口。
- 财务异常处理由 Admin 端完成。

## 后续观察

- Admin 台账页是否能从对账异常精确跳到目标 ledger。
- 关联收款后是否不再出现 `ledger_without_payment`。
- 标记历史后是否不再出现 `ledger_without_payment`。
- 修正记录的操作人、时间、原因是否满足审计追溯。
