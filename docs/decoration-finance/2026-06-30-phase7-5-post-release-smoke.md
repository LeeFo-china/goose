# Phase 7.5 财务修正审计发布后 Smoke

日期：2026-06-30

发布基线：

- main：`b5a1b578 merge: finance correction audit`
- 功能提交：
  - `f1fdd2bc feat(finance): 增加修正审计接口`
  - `5955c671 feat(admin): 增加财务修正审计入口`
  - `f5a1c15c feat(admin): 展示财务修正审计列表`
  - `717b496a docs(finance): 记录phase7-5修正审计`

范围：合入 main 后验证 `GET /finance/correction-audits` 和 Admin `/finance/audits` 只读审计视图可用。本轮不执行任何财务修正写操作。

## 服务状态

launchctl 服务：

- API：`local.gooes.api`
- Admin：`local.gooes.admin`

端口：

- API：`http://127.0.0.1:3000`
- Admin：`http://127.0.0.1:3010`

探测结果：

- `GET http://127.0.0.1:3000/health` 返回 `401 TOKEN_MISSING`，证明 API 可达且需要登录。
- `HEAD http://127.0.0.1:3010/finance/audits` 未登录返回 `307 /login`，证明 Admin 可达且鉴权生效。

## API 只读 Smoke

执行账号：

- phone：`18800000001`
- employee：`风清扬`
- employee ID：`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`
- tenant：`固始晴天装饰工程有限公司`
- 权限：`permissions[].code` 包含 `finance.reconciliation.manage`

接口结果：

1. `POST /admin/auth/login`
   - HTTP `200`
   - 返回员工登录凭据，未记录凭据值。
2. `GET /admin/auth/me`
   - HTTP `200`
   - 返回员工、租户和权限上下文。
3. `GET /finance/correction-audits?page=1&pageSize=20`
   - HTTP `200`
   - `pagination.total=6`
   - `pagination.totalPages=1`
   - `summary.total=6`
   - `summary.ledger_repair=2`
   - `summary.receivable_allocation=4`
   - `data.list.length=6`
   - 首条记录：
     - `operation=mark_legacy_ledger`
     - `domain=ledger`
     - `project_id=b95f6b51-6b9c-4970-948e-b369106545d8`
     - `actor_employee_name=风清扬`
     - `target.href=/finance/ledger?ledger_id=56a3fc52-4e1d-4ce6-928f-531b5d1cbed4`
4. `GET /finance/correction-audits?page=1&pageSize=5&operation=link_ledger_payment`
   - HTTP `200`
   - `pagination.total=1`
   - `summary.ledger_repair=1`
   - `summary.receivable_allocation=0`
   - `data.list.length=1`
   - 返回记录操作类型只包含 `link_ledger_payment`

API smoke 输出摘要：

```json
{
  "account": "18800000001",
  "employeeId": "d8ecc522-e6a1-49d6-b7b7-aaa0f3084826",
  "tenantId": "3eebca47-961f-4899-b976-a3d3208d326b",
  "hasReconciliationManage": true,
  "correctionAudits": {
    "status": 200,
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 6,
      "totalPages": 1
    },
    "summary": {
      "total": 6,
      "ledger_repair": 2,
      "receivable_allocation": 4
    },
    "listLength": 6
  },
  "linkLedgerPaymentFilter": {
    "status": 200,
    "total": 1,
    "listLength": 1,
    "operations": ["link_ledger_payment"]
  }
}
```

## Admin UI 只读 Smoke

浏览器检查：

- URL：`http://127.0.0.1:3010/finance/audits`
- 登录方式：通过员工登录 cookie 打开页面，未记录 cookie 值。

页面核验：

- HTTP `200`
- 当前 URL 保持 `/finance/audits`
- 页面标题 `修正审计` 可见。
- 财务模块 tab `修正审计` 可见。
- 页面包含说明文案 `追溯财务人工核销和台账修正记录`。
- 筛选项 `修正类型` 和 `操作人` 可见。
- 表格列 `发生时间` 和 `关联对象` 可见。
- 前端 console error：`0`
- page error：`0`
- failed request：`0`

Admin smoke 输出摘要：

```json
{
  "status": 200,
  "url": "http://127.0.0.1:3010/finance/audits",
  "titleVisible": true,
  "tabVisible": true,
  "hasAuditCopy": true,
  "hasFilter": true,
  "hasTableHeader": true,
  "consoleErrorCount": 0,
  "pageErrorCount": 0,
  "failedRequestCount": 0
}
```

## 写操作约束

本次发布后 smoke 未调用：

- `POST /finance/ledger/:id/link-payment`
- `POST /finance/ledger/:id/mark-legacy-payment`
- `POST /payments/:id/generate-ledger`
- `POST /finance/receivables/:id/allocations`
- `PATCH /finance/receivables/:id/allocations/:allocationId`
- `POST /finance/receivables/:id/allocations/:allocationId/reverse`
- `POST /workflow-tasks/:taskId/complete`

本次只验证已存在审计记录的 API 聚合和 Admin 只读展示。

## 小程序影响

本任务是 Admin/API 财务主管审计工具，小程序无必改。

小程序继续保持：

- 不调用 `/finance/correction-audits`。
- 不直接调用财务修正写接口。
- 不本地推导对账异常或修正审计规则。

## 结论

Phase 7.5 财务修正审计合入 main 后，API 只读接口和 Admin 修正审计页面 smoke 通过：

- 服务可达，鉴权生效。
- `finance.reconciliation.manage` 账号可读取统一审计列表。
- 修正类型筛选可用。
- Admin 页面看得到、对得上，无前端 console error、page error 或 failed request。
