# Phase 7.7/7.8 发布后只读 smoke

日期：2026-06-30

## 范围

本次只读 smoke 验证 Phase 7.7 费用侧对账异常和 Phase 7.8 项目级对账摘要增强发布后的 API/Admin 可见性。

未执行：

- 未调用 `POST /workflow-tasks/:taskId/complete`。
- 未调用对账异常处理写接口。
- 未执行 Admin 修正动作。
- 未修改数据库。
- 未修改 orange 仓库。

## 临时服务

在隔离 worktree `feat/phase7-post-release-rag-fix` 中临时启动：

- API：`http://127.0.0.1:3104`
- Admin：`http://127.0.0.1:3112`

环境：

- `.env.local`：`/Users/leefo/Public/work/gooes/.env.local`
- `NODE_ENV=production`
- `JWT_SECRET=local-smoke-secret`

## 登录

账号：

```text
phone=18800005001
```

结果：

- API `POST /admin/auth/login`：HTTP 200
- Admin `POST /api/auth/login`：HTTP 200
- employee：`小龙女`

## API 验证

### 费用异常列表

请求：

```text
GET /finance/reconciliation/exceptions?page=1&pageSize=5&date_from=2026-06-01&date_to=2026-06-30&direction=expense
```

结果：

- HTTP 200
- `pagination.total = 1`
- 返回异常方向包含 `expense`

### 项目级对账摘要

请求：

```text
GET /finance/reconciliation/project/b95f6b51-6b9c-4970-948e-b369106545d8
```

结果：

- HTTP 200
- `project_id = b95f6b51-6b9c-4970-948e-b369106545d8`
- `income_ledger_consistent = false`
- `payment_allocation_consistent = false`
- `expense_ledger_consistent = true`
- `latest_exception_code = payment_unallocated`
- `latest_exception_title = 收款未完全核销`
- `highest_exception_level = warning`

## Admin 验证

### 财务对账页

请求：

```text
GET /finance/reconciliation?date_from=2026-06-01&date_to=2026-06-30&direction=expense
```

结果：

- HTTP 200
- 页面包含：
  - `对账异常`
  - `费用缺成本分类`
  - `费用入账金额不一致`
  - `费用未入账`

### 财务台账页

请求：

```text
GET /finance/ledger?direction=out&entry_type=expense_settlement&expense_request_id=22222222-2222-4222-8222-222222222222&expense_settlement_id=33333333-3333-4333-8333-333333333333
```

结果：

- HTTP 200
- 页面包含：
  - `财务台账`
  - `费用结算`

### 项目详情总览

请求：

```text
GET /projects/b95f6b51-6b9c-4970-948e-b369106545d8?tab=overview
```

说明：项目详情默认 tab 是 `acceptances`，项目对账摘要在 `overview` tab，因此 smoke 使用 `?tab=overview`。

结果：

- HTTP 200
- 页面包含：
  - `总览`
  - `对账摘要`
  - `查看异常`
  - `b95f6b51-6b9c-4970-948e-b369106545d8`

## 结论

Phase 7.7/7.8 发布后只读 smoke 通过。

费用侧对账异常筛选、费用结算台账跳转参数、项目详情对账摘要均可读可见。当前未发现 403/409/500，未执行任何写操作。
