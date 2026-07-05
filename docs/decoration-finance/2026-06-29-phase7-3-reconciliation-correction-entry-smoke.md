# Phase 7.3 对账异常修正入口实施与 Smoke

日期：2026-06-29

分支：`feat/finance-reconciliation-correction-entry`

关联计划：

- [2026-06-29-phase7-3-reconciliation-correction-entry-plan.md](./2026-06-29-phase7-3-reconciliation-correction-entry-plan.md)

## 范围

本阶段只做对账异常到人工修正入口的收敛，不自动修账。

已实现：

- 对账异常 `action.label` 统一为“去处理”。
- `receivable_overdue` 跳转到应收计划，并携带 `project_id` 和 `status=overdue`。
- `payment_without_ledger` 跳转到财务台账，并携带 `project_id`、`direction=in` 和 `entry_type=project_payment`。
- `ledger_without_payment` 继续跳转到财务台账，并携带 `project_id` 和 `direction=in`。
- `payment_unallocated`、`allocation_amount_mismatch`、`receivable_paid_amount_mismatch` 跳转到应收计划，并携带 `project_id`。
- Admin 财务台账支持 `entry_type` 查询和页面筛选，分页链接保留该筛选条件。
- Admin 对账异常列表按钮优先使用后端 `action.label`，空值兜底为“去处理”。

未做：

- 不调用自动生成收款、台账、核销或应收重算逻辑。
- 不新增小程序对账异常处理入口。
- 不修改 workflow、payment、ledger、receivable、allocation 源数据。

## 后端契约

异常动作示例：

```json
{
  "action": {
    "key": "open_receivables",
    "label": "去处理",
    "target": "/finance/receivables?project_id=project-1&status=overdue"
  }
}
```

本阶段的 `action.target` 是 Admin 导航入口，语义是“去对应业务页面人工核对和修正”，不是系统自动处理指令。

## Admin 对接

Admin 只消费后端返回的 `action.target` 做跳转：

- 对账异常列表显示“去处理”。
- 应收类异常进入 `/finance/receivables`。
- 台账类异常进入 `/finance/ledger`。
- 财务台账页新增“流水类型”筛选，支持 `entry_type=project_payment`。
- 处理弹窗里的确认、忽略、人工闭环、重新打开仍只记录人工判断，不代表源数据已经被系统修复。

## 小程序影响

本阶段小程序无必改。

小程序继续保持现有边界：

- 不调用 `/finance/reconciliation/*` 写接口。
- 不本地计算或推导对账异常。
- 不提供应收、收款、核销、台账修账入口。
- 如果未来要展示“项目存在财务对账异常”，也只做只读提示，具体修正仍回到 Admin 财务页面。

## 静态验证

在 worktree `/Users/leefo/Public/work/gooes/.worktrees/finance-reconciliation-correction-entry` 执行：

```bash
bun test apps/admin/components/finance/finance-ledger-query-utils.test.ts apps/admin/components/finance/finance-reconciliation-utils.test.ts apps/admin/components/projects/project-finance-reconciliation-summary-utils.test.ts
cd apps/api && bun test src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
pnpm --dir apps/admin run check
cd apps/api && bun run typecheck
cd apps/api && bun run build
cd apps/api && bun run check:file-size
git diff --check
```

结果：

- Admin 单测：`9 pass`，`0 fail`，`14 expect()`。
- API 单测：`12 pass`，`0 fail`，`36 expect()`。
- Admin `pnpm --dir apps/admin run check`：文件体积检查和 `tsc -p tsconfig.json --noEmit` 通过。
- API `bun run typecheck`：通过。
- API `bun run build`：通过，输出 `dist/app.js`。
- API `bun run check:file-size`：通过，生成的数据库类型文件按规则豁免。
- `git diff --check`：通过。

## 临时服务

本轮只在 worktree 拉起临时服务，没有动 main 工作区服务：

- API：`http://127.0.0.1:3300`
- Admin：`http://127.0.0.1:3310`

说明：

- 首次用仓库根目录 `.env.local` 拉起 API 时，登录失败，根因是该文件缺少 `JWT_SECRET`。
- 随后改用 `apps/api/.env` 启动临时 API，仅用于本轮 smoke。
- smoke 结束后已停止 3300 和 3310 临时服务。

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

对账异常只读结果：

```json
{
  "total": 9,
  "list_count": 9,
  "action_labels": ["去处理"],
  "exception_codes": ["payment_unallocated", "receivable_overdue"],
  "targets_valid": true
}
```

现场样本：

```json
[
  {
    "exception_code": "payment_unallocated",
    "target": "/finance/receivables?project_id=00000000-0000-4000-8000-202606160006"
  },
  {
    "exception_code": "receivable_overdue",
    "target": "/finance/receivables?project_id=407537b4-2adc-4a0f-ac83-bdaecf70e559&status=overdue"
  }
]
```

财务台账只读结果：

- `entry_type=project_payment` 返回 `200`。
- `total=11`。
- 当前页 `list_count=5`。
- 当前页返回流水均匹配 `entry_type=project_payment`。

应收计划只读结果：

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

观察项：

- 打开 `/finance/reconciliation?status=open` 时，页面会请求员工筛选选项，当前执行账号访问 `GET /employees` 返回 `403`，页面仍正常渲染。这是既有权限边界，不影响本阶段修正入口验证。

## 写操作约束

本轮未执行：

- `POST /finance/reconciliation/exceptions/:fingerprint/actions`
- `POST /workflow-tasks/:taskId/complete`
- payment、ledger、receivable、allocation 写接口
- 数据库手工修改

## 结论

- Phase 7.3 的对账异常人工修正入口已按计划落地。
- Admin 可以从对账异常列表跳转到应收计划或财务台账的对应筛选页。
- 财务台账已支持 `entry_type=project_payment` 筛选，便于定位“项目收款入账”流水。
- 小程序端无必改，继续不接入对账异常修账动作。
