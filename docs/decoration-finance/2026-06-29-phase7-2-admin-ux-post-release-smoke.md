# Phase 7.2 Admin 对账体验发布后 Smoke

日期：2026-06-29

关联提交：

- `65d9e5c6 merge: finance reconciliation admin ux`
- `343b3719 docs(finance): 补充对账异常修正入口计划`
- `4618494e fix(finance): 优化对账异常处理体验`

说明：本次推送 `origin/main` 时，本地 `main` 上已有计费账户页合并提交 `9a8af0a5` 和 `07e553b0`，因此一并进入远端 `main`。

关联文档：

- [2026-06-29-phase7-1-reconciliation-closure-plan.md](./2026-06-29-phase7-1-reconciliation-closure-plan.md)
- [2026-06-29-phase7-1-post-release-smoke.md](./2026-06-29-phase7-1-post-release-smoke.md)
- [2026-06-29-phase7-3-reconciliation-correction-entry-plan.md](./2026-06-29-phase7-3-reconciliation-correction-entry-plan.md)

## 发布状态

- `main` 已推送到 `origin/main`，当前头为 `65d9e5c6`。
- API 服务复用本机 `http://127.0.0.1:3000`，监听进程：`bun` / PID `39592`。
- Admin 服务复用本机 `http://127.0.0.1:3010`，监听进程：`node` / PID `40267`。
- `GET http://127.0.0.1:3000/` 返回 `200`。
- `HEAD http://127.0.0.1:3010/login` 返回 `200`，页面 CSS preload 正常。

本轮发布后 smoke 只读执行，没有调用对账异常处理写接口、workflow complete、收款、台账、应收或 allocation 写接口。

## 变更范围

Phase 7.2 聚焦 Admin 对账异常处理体验和项目详情入口收敛：

- 对账异常处理弹窗增加动作历史读取。
- 新增 `GET /finance/reconciliation/exceptions/:fingerprint/actions`，分页返回处理动作历史。
- 对账状态 `resolved` 的展示文案统一为“人工闭环”。
- 处理人筛选从手填 UUID 收敛为员工选择。
- 项目详情对账摘要的“查看异常”入口默认带 `project_id` 和 `status=open`。

Phase 7.3 仅落计划文档，明确后续修正入口只做人工引导，不自动修账。

## 静态验证

在合并后的 `main` 上执行：

```bash
git diff --check HEAD~1 HEAD
bun test apps/admin/components/finance/finance-reconciliation-utils.test.ts apps/admin/components/projects/project-finance-reconciliation-summary-utils.test.ts
pnpm --dir apps/admin run check
cd apps/api && bun test src/services/finance-reconciliation.test.ts
cd apps/api && bun run typecheck
cd apps/api && bun run check:file-size
cd apps/api && bun run build
```

结果：

- `git diff --check HEAD~1 HEAD`：通过。
- Admin 单测：`6 pass`，`0 fail`，`10 expect()`。
- Admin `pnpm --dir apps/admin run check`：文件体积检查和 `tsc -p tsconfig.json --noEmit` 通过。
- API `finance-reconciliation.test.ts`：`11 pass`，`0 fail`，`35 expect()`。
- API `bun run typecheck`：通过。
- API `bun run check:file-size`：通过，生成的数据库类型文件按规则豁免。
- API `bun run build`：通过，输出 `dist/app.js`。

## 只读 Smoke

执行账号：

- 手机号：`18800005001`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- 租户：固始晴天装饰工程有限公司
- 权限：具备 `finance.reconciliation.manage`

执行链路：

1. `POST /api/auth/login` 返回 `200`，Admin 写入 `gooes_admin_token`。
2. `GET /api/backend/admin/auth/me` 返回员工、租户和权限，确认具备 `finance.reconciliation.manage`。
3. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=open` 返回 `200`。
4. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=acknowledged` 返回 `200`。
5. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=ignored` 返回 `200`。
6. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=resolved` 返回 `200`。
7. `GET /api/backend/finance/reconciliation/exceptions/payment_unallocated%3A2595309b-662a-4a4c-972c-14bc2bc2be8f/actions?page=1&pageSize=10` 返回 `200`。
8. `GET /api/backend/finance/reconciliation/project/fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回 `200`。
9. `GET /finance/reconciliation?status=resolved` 返回 `200`。
10. `GET /finance/reconciliation?project_id=fa32f6dd-b2d0-4efc-a810-347dfe90ec4c&status=open` 返回 `200`。
11. `GET /projects/fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回 `200`。

状态筛选结果：

```json
{
  "open": {
    "total": 9,
    "list_count": 5,
    "first_status": "open",
    "summary": { "total": 9, "danger": 0, "warning": 9, "info": 0 }
  },
  "acknowledged": {
    "total": 1,
    "list_count": 1,
    "first_status": "acknowledged",
    "summary": { "total": 1, "danger": 0, "warning": 1, "info": 0 }
  },
  "ignored": {
    "total": 0,
    "list_count": 0,
    "first_status": null,
    "summary": { "total": 0, "danger": 0, "warning": 0, "info": 0 }
  },
  "resolved": {
    "total": 0,
    "list_count": 0,
    "first_status": null,
    "summary": { "total": 0, "danger": 0, "warning": 0, "info": 0 }
  }
}
```

动作历史样本：

```json
{
  "fingerprint": "payment_unallocated:2595309b-662a-4a4c-972c-14bc2bc2be8f",
  "total": 1,
  "list_count": 1,
  "first_action": "acknowledge",
  "first_actor": "小龙女"
}
```

项目对账摘要样本：

```json
{
  "project_id": "fa32f6dd-b2d0-4efc-a810-347dfe90ec4c",
  "open_exception_count": 1,
  "acknowledged_exception_count": 1,
  "resolved_exception_count": 0,
  "latest_actor_employee_name": "小龙女"
}
```

Admin 页面检查：

- `/finance/reconciliation?status=resolved` 返回 `200`，页面包含“对账异常”和“人工闭环”。
- `/finance/reconciliation?project_id=fa32f6dd-b2d0-4efc-a810-347dfe90ec4c&status=open` 返回 `200`，页面包含“对账异常”和“人工闭环”。
- `/projects/fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回 `200`。
- 未发现“后端服务未连接”。
- 未发现 `Application error`。

## 写操作约束

本轮只读 smoke 未执行：

- `POST /finance/reconciliation/exceptions/:fingerprint/actions`
- `POST /workflow-tasks/:taskId/complete`
- payment、ledger、receivable、allocation 写接口
- 数据库手工修改

## 结论

- Phase 7.2 已合并并推送到 `origin/main`。
- 对账异常列表、状态筛选、动作历史、项目对账摘要和 Admin 页面渲染在本地正式服务上只读 smoke 通过。
- Admin 侧可继续按“人工闭环”文案、员工选择筛选和动作历史入口观察。
- 小程序端无必改，继续不调用 `/finance/reconciliation/*` 写接口，不本地计算或推导对账异常。
