# Phase 7.3 对账异常修正入口发布后 Smoke

日期：2026-06-29

关联提交：

- `f8b7e047 feat(finance): 对账异常跳转到修正入口`

关联文档：

- [2026-06-29-phase7-3-reconciliation-correction-entry-plan.md](./2026-06-29-phase7-3-reconciliation-correction-entry-plan.md)
- [2026-06-29-phase7-3-reconciliation-correction-entry-smoke.md](./2026-06-29-phase7-3-reconciliation-correction-entry-smoke.md)

## 发布状态

- 本地 `main` 已快进合并 Phase 7.3，代码头为 `f8b7e047`。
- API 服务复用本机 `http://127.0.0.1:3000`，监听进程：`bun --watch src/app.ts`。
- Admin 服务复用本机 `http://127.0.0.1:3010`，监听进程：`next-server (v15.5.15)`。
- `GET http://127.0.0.1:3000/` 返回 `200`。
- `HEAD http://127.0.0.1:3010/login` 返回 `200`。

本轮发布后 smoke 只读执行，没有调用对账异常处理写接口、workflow complete、收款、台账、应收或 allocation 写接口。

## 变更范围

Phase 7.3 聚焦对账异常到人工修正入口的收敛：

- 对账异常列表的 action 文案统一为“去处理”。
- 应收类异常跳转到 `/finance/receivables`。
- 逾期应收异常跳转时携带 `status=overdue`。
- `payment_without_ledger` 跳转到 `/finance/ledger`，并携带 `direction=in&entry_type=project_payment`。
- 财务台账页新增“流水类型”筛选，支持 `entry_type=project_payment`。
- Admin 只按后端返回的 `action.target` 导航，不自动修账。

## 静态验证

在合并后的 `main` 上执行：

```bash
git diff --check HEAD~1 HEAD
bun test apps/admin/components/finance/finance-ledger-query-utils.test.ts apps/admin/components/finance/finance-reconciliation-utils.test.ts apps/admin/components/projects/project-finance-reconciliation-summary-utils.test.ts
cd apps/api && bun test src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
pnpm --dir apps/admin run check
cd apps/api && bun run typecheck
cd apps/api && bun run build
cd apps/api && bun run check:file-size
```

结果：

- `git diff --check HEAD~1 HEAD`：通过。
- Admin 单测：`9 pass`，`0 fail`，`14 expect()`。
- API 单测：`12 pass`，`0 fail`，`36 expect()`。
- Admin `pnpm --dir apps/admin run check`：文件体积检查和 `tsc -p tsconfig.json --noEmit` 通过。
- API `bun run typecheck`：通过。
- API `bun run build`：通过，输出 `dist/app.js`。
- API `bun run check:file-size`：通过，生成的数据库类型文件按规则豁免。

## 只读 Smoke

执行账号：

- 手机号：`18800005001`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- 权限：具备 `finance.reconciliation.manage`

执行链路：

1. `POST /api/auth/login` 返回 `200`，Admin cookie 写入成功。
2. `GET /api/backend/admin/auth/me` 返回 `200`，确认员工和权限正常。
3. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=50&status=open` 返回 `200`。
4. `GET /api/backend/finance/ledger?page=1&pageSize=5&direction=in&entry_type=project_payment` 返回 `200`。
5. `GET /api/backend/finance/receivables?page=1&pageSize=5&status=overdue` 返回 `200`。
6. `GET /finance/reconciliation?status=open` 返回 `200`。
7. `GET /finance/ledger?direction=in&entry_type=project_payment` 返回 `200`。
8. `GET /finance/receivables?status=overdue` 返回 `200`。

对账异常结果：

```json
{
  "exceptions_total": 9,
  "exceptions_count": 9,
  "exception_codes": ["payment_unallocated", "receivable_overdue"],
  "action_labels": ["去处理"],
  "action_targets_valid": true
}
```

本轮现场异常样本没有出现 `payment_without_ledger`，该类型由单测覆盖 action target：

- `key=open_project_payment_ledger`
- `label=去处理`
- `target=/finance/ledger?project_id=...&direction=in&entry_type=project_payment`

现场样本：

```json
[
  {
    "code": "payment_unallocated",
    "target": "/finance/receivables?project_id=fa32f6dd-b2d0-4efc-a810-347dfe90ec4c",
    "label": "去处理",
    "key": "open_receivables"
  },
  {
    "code": "payment_unallocated",
    "target": "/finance/receivables?project_id=f42bdb7f-5fb6-4213-af3c-7b8fde22b36b",
    "label": "去处理",
    "key": "open_receivables"
  }
]
```

财务台账筛选：

- `entry_type=project_payment` 返回 `200`。
- `total=11`。
- 当前页 `list_count=5`。
- 当前页返回流水均匹配 `entry_type=project_payment`。

应收计划筛选：

- `status=overdue` 返回 `200`。
- `total=1`。
- 当前页 `list_count=1`。
- 当前页返回应收均匹配 `status=overdue`。

Admin 页面检查：

- `/finance/reconciliation?status=open` 返回 `200`，页面包含“对账异常”和“去处理”。
- `/finance/ledger?direction=in&entry_type=project_payment` 返回 `200`，页面包含“流水类型”。
- `/finance/receivables?status=overdue` 返回 `200`。
- 未发现“后端服务未连接”。
- 未发现 `Application error`。

## 写操作约束

本轮未执行：

- `POST /finance/reconciliation/exceptions/:fingerprint/actions`
- `POST /workflow-tasks/:taskId/complete`
- payment、ledger、receivable、allocation 写接口
- 数据库手工修改

## Admin 对接口径

Admin 侧按以下口径继续：

- 对账异常列表按钮文案显示“去处理”。
- 按 `action.target` 跳转应收计划或财务台账。
- 财务台账页可以用“流水类型=项目收款”定位 `project_payment`。
- 对账异常处理弹窗仍只用于确认、忽略、人工闭环和重新打开，不代表系统自动修复源数据。

## 小程序对接口径

小程序端本阶段无必改：

- 不调用 `/finance/reconciliation/*` 写接口。
- 不本地计算或推导对账异常。
- 不提供应收、收款、核销或台账修账入口。
- 如果后续需要展示项目财务异常，只做只读提示，具体处理回到 Admin。

## 结论

- Phase 7.3 在 main 本机服务上发布后只读 smoke 通过。
- 对账异常“去处理”入口、台账 `entry_type=project_payment` 筛选和应收逾期筛选均可用。
- 小程序端无需配合本次变更。
