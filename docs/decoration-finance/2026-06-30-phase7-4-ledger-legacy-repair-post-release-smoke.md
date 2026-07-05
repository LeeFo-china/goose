# Phase 7.4 历史收款台账修正发布后 Smoke

日期：2026-06-30

发布基线：

- main：`8efd3eb2 merge: finance ledger legacy repair`
- 功能提交：`af10d013 feat(finance): 支持历史收款台账修正`

范围：合入 main 后验证 `ledger_without_payment` 历史收款台账修正闭环可读、可追溯、Admin 页面可见。不再执行任何修正写操作。

## Migration

执行：

```bash
PGSSLMODE=disable supabase migration list --db-url "$DB_URL_SIMPLE"
```

结果：Local/Remote 已对齐到：

```text
20260630093000 | 20260630093000 | 2026-06-30 09:30:00
```

## API 只读 Smoke

临时 API：`http://127.0.0.1:3101`

执行账号：

- phone：`18800000001`
- employee ID：`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`

检查结果：

1. `POST /admin/auth/login` 返回 200。
2. `GET /admin/auth/me` 返回员工和租户上下文。
3. `GET /finance/reconciliation/exceptions?page=1&pageSize=100&date_from=2026-06-29&date_to=2026-06-30&exception_code=ledger_without_payment`
   - `ledgerWithoutPaymentTotal=0`
   - 已修正样本不再出现在 `ledger_without_payment`。
4. `GET /finance/ledger?page=1&pageSize=20&ledger_id=a499540a-6960-4a76-90e0-f203aac39ded`
   - `payment_id=46bfa623-8fbe-464e-9ad3-37e7850cf5da`
   - `payment_linked_at=2026-06-29T23:59:49.457+00:00`
   - `payment_link_reason=phase7.4 smoke 关联历史收款流水`
5. `GET /finance/ledger?page=1&pageSize=20&ledger_id=56a3fc52-4e1d-4ce6-928f-531b5d1cbed4`
   - `payment_id=null`
   - `legacy_payment_ledger_marked_at=2026-06-29T23:59:51.568+00:00`
   - `legacy_payment_ledger_reason=phase7.4 smoke 标记历史流水`

API smoke 输出：

```json
{
  "ok": true,
  "apiBase": "http://127.0.0.1:3101",
  "account": "18800000001",
  "employeeId": "d8ecc522-e6a1-49d6-b7b7-aaa0f3084826",
  "tenantId": "3eebca47-961f-4899-b976-a3d3208d326b",
  "ledgerWithoutPaymentTotal": 0,
  "linked": {
    "ledgerId": "a499540a-6960-4a76-90e0-f203aac39ded",
    "paymentId": "46bfa623-8fbe-464e-9ad3-37e7850cf5da",
    "paymentLinkedAt": "2026-06-29T23:59:49.457+00:00",
    "reason": "phase7.4 smoke 关联历史收款流水"
  },
  "legacy": {
    "ledgerId": "56a3fc52-4e1d-4ce6-928f-531b5d1cbed4",
    "markedAt": "2026-06-29T23:59:51.568+00:00",
    "reason": "phase7.4 smoke 标记历史流水"
  }
}
```

## Admin UI 只读 Smoke

临时 Admin：`http://127.0.0.1:3110`

Admin 环境：

```bash
GOOES_API_BASE_URL=http://127.0.0.1:3101
pnpm exec next dev -p 3110 -H 127.0.0.1
```

Playwright 检查：

1. 通过 `POST /api/auth/login` 登录后台。
2. 打开已关联样本：
   - `/finance/ledger?project_id=b95f6b51-6b9c-4970-948e-b369106545d8&direction=in&entry_type=project_payment&ledger_id=a499540a-6960-4a76-90e0-f203aac39ded`
   - 页面标题 `财务台账` 可见。
   - `Phase7.4 smoke 待关联收款流水` 可见。
   - `已关联收款` 可见。
   - 不显示 `关联` 修正按钮。
3. 打开历史标记样本：
   - `/finance/ledger?project_id=b95f6b51-6b9c-4970-948e-b369106545d8&direction=in&entry_type=project_payment&ledger_id=56a3fc52-4e1d-4ce6-928f-531b5d1cbed4`
   - 页面标题 `财务台账` 可见。
   - `Phase7.4 smoke 待标记历史流水` 可见。
   - `已标记历史` 可见。
   - 不显示 `历史` 修正按钮。
4. 未发现前端 console error 或 page error。

截图：

- `/tmp/gooes-phase7-4-linked-ledger-admin-smoke.png`
- `/tmp/gooes-phase7-4-legacy-ledger-admin-smoke.png`

Admin smoke 输出：

```json
{
  "ok": true,
  "adminBase": "http://127.0.0.1:3110",
  "linkedScreenshot": "/tmp/gooes-phase7-4-linked-ledger-admin-smoke.png",
  "legacyScreenshot": "/tmp/gooes-phase7-4-legacy-ledger-admin-smoke.png"
}
```

## 写操作约束

本次发布后 smoke 未调用：

- `POST /finance/ledger/:id/link-payment`
- `POST /finance/ledger/:id/mark-legacy-payment`
- `POST /payments/:id/generate-ledger`
- `POST /workflow-tasks/:taskId/complete`

本次只验证已修正结果和 Admin 只读展示。

## 小程序影响

本任务是 Admin/API 财务人工修正闭环，小程序无必改。

小程序继续保持：

- 不直接调用台账修正接口。
- 不本地推导对账异常修正动作。
- 财务异常处理仍由 Admin 侧完成。

## 结论

Phase 7.4 历史收款台账修正合入 main 后，migration、API 只读核验、Admin 精确跳转和只读展示均通过。已关联和已标记历史的 `ledger_without_payment` 样本不会再次出现在对账异常列表中。
