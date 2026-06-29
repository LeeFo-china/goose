# Phase 7.1 对账异常闭环发布后 Smoke

日期：2026-06-29

## 范围

本记录覆盖 Phase 7.1 对账异常闭环合入 `main` 后的发布后核验。

已推送远端：

- branch：`main`
- pushed head：`b30d38a2 refactor(admin): 简化计费账户页布局`
- Phase 7.1 merge：`40306355 merge: finance reconciliation closure`
- Phase 7.1 smoke：`cc57b63c docs(finance): 记录phase7.1对账闭环smoke`

GitHub Actions：

- run：`28357400875`
- URL：`https://github.com/LeeFo-china/goose/actions/runs/28357400875`
- head SHA：`b30d38a2ca5976dcc17ef27a91333a436822f154`
- 状态：`completed`
- conclusion：`success`
- 说明：本地 main 服务 smoke 已执行；远端 Actions 最终通过。

## 服务

本轮使用本机 main 工作区已运行服务做发布后 smoke：

- API：`http://127.0.0.1:3000`
- Admin：`http://127.0.0.1:3010`
- API 进程 cwd：`/Users/leefo/Public/work/gooes/apps/api`
- Admin 进程 cwd：`/Users/leefo/Public/work/gooes/apps/admin`

健康检查：

- `GET /` on API：`200`，返回 `{"hello":"world"}`
- `HEAD /login` on Admin：`200`，页面 CSS preload 正常

## 只读 Smoke

执行账号：

- 手机号：`18800005001`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- 租户：固始晴天装饰工程有限公司
- 权限：具备 `finance.reconciliation.manage`

执行链路：

1. `POST /api/auth/login` 返回 `200`。
2. `GET /api/backend/admin/auth/me` 返回员工、租户和权限。
3. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=open` 返回 `200`。
4. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=acknowledged` 返回 `200`。
5. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=ignored` 返回 `200`。
6. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=5&status=resolved` 返回 `200`。
7. `GET /api/backend/finance/reconciliation/project/fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回 `200`。
8. `GET /finance/reconciliation?status=acknowledged` 返回 `200`。
9. `GET /projects/fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回 `200`。

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

项目对账摘要样本：

```json
{
  "project_id": "fa32f6dd-b2d0-4efc-a810-347dfe90ec4c",
  "receivable_amount": 0,
  "ledger_income_amount": 190000,
  "open_exception_count": 1,
  "acknowledged_exception_count": 1,
  "ignored_exception_count": 0,
  "resolved_exception_count": 0,
  "latest_action_remark": "Phase 7.1 smoke acknowledge 2026-06-29T07:18:23.980Z",
  "latest_actor_employee_name": "小龙女"
}
```

Admin 页面检查：

- `/finance/reconciliation?status=acknowledged` 返回 `200`
- 页面包含“对账异常”和“已确认”
- 未发现“后端服务未连接”
- 未发现 `Application error`
- `/projects/fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 返回 `200`
- 项目详情对账摘要为客户端组件，本轮以摘要 API `200` 作为数据可用证据

## 写操作约束

本轮只读 smoke 未执行：

- `POST /finance/reconciliation/exceptions/:fingerprint/actions`
- `POST /workflow-tasks/:taskId/complete`
- 任何 payment、ledger、receivable、allocation 写操作

## 结论

- Phase 7.1 代码已推送到 `origin/main`。
- 本机 main 服务对账异常页、四类状态筛选、项目对账摘要 API 和 Admin 页面渲染通过。
- 小程序无必改，继续不参与对账异常处理。
- Admin 后续观察重点：对账异常页筛选、处理弹窗、项目详情对账摘要和 `resolved` 文案理解。
