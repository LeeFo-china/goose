# Phase 7.9 费用对账修正闭环发布后 Smoke

日期：2026-06-30

## 发布基线

- main 已推送到远端：
  - `c96b1c50 docs(finance): 记录phase7-9收口验证`
  - `0bef2fbd merge: phase7-9费用对账修正闭环`
  - `3c919a7b feat(finance): 补齐费用对账修正闭环`
- 本轮只读 smoke 使用本机 launchctl 服务：
  - API：`local.gooes.api`，监听 `http://127.0.0.1:3000`
  - Admin：`local.gooes.admin`，监听 `http://127.0.0.1:3010`
- 执行账号：`18800005001 / 小龙女`
- 租户：`固始晴天装饰工程有限公司`

## Migration 核验

已提交 migration：

```text
supabase/migrations/20260630190000_finance_reconciliation_expense_correction_actions.sql
```

已尝试以下核验方式：

```bash
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
supabase migration list
supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"
```

结果：未通过。

- 默认 linked/pooler 连接失败：`password authentication failed for user "postgres"`。
- 显式 `SUPABASE_DB_URL` / `SUPABASE_DB_DIRECT_URL` 连接失败：`tls error (server refused TLS connection)`，且 URL 中仍显示 `postgres.your-tenant-id`。

结论：本轮只能确认 migration 文件已纳入版本控制，远端 Local/Remote migration 对齐状态仍需在数据库凭据和连接配置修复后复核。该项是发布收口的外部配置阻塞，不应在业务代码中绕过。

## API 只读 Smoke

### 登录

```text
POST /admin/auth/login
phone=18800005001
```

结果：

- HTTP 200
- employee：`小龙女`

### 租户上下文

```text
GET /admin/auth/me
```

结果：

- HTTP 200
- employee：`小龙女`
- tenant：`固始晴天装饰工程有限公司`

### 费用异常列表

```text
GET /finance/reconciliation/exceptions?page=1&pageSize=10&date_from=2026-06-01&date_to=2026-06-30&direction=expense
```

结果：

- HTTP 200
- `pagination.total = 1`
- `list.length = 1`
- `exception_code = expense_ledger_without_category`
- `status = open`
- `exception_fingerprint = expense_ledger_without_category:d5b60241-ad52-4890-8f03-28a5bee1bbbd`
- `title = 支出台账缺少成本分类`
- `description = 支出台账 ¥1,000.00 未归集到成本分类。`

### 异常详情

```text
GET /finance/reconciliation/exceptions/expense_ledger_without_category%3Ad5b60241-ad52-4890-8f03-28a5bee1bbbd
```

结果：

- HTTP 200
- `exception.exception_code = expense_ledger_without_category`
- `context` 包含：
  - `ledger`
  - `expense_request`
  - `settlement`
- `available_actions` 包含：
  - `update_expense_ledger_category`
  - `acknowledge`
  - `resolve`
  - `ignore`
- `history.length = 0`

### 处理历史

```text
GET /finance/reconciliation/exceptions/expense_ledger_without_category%3Ad5b60241-ad52-4890-8f03-28a5bee1bbbd/actions?page=1&pageSize=10
```

结果：

- HTTP 200
- `list.length = 0`

### 修正审计

```text
GET /finance/correction-audits?page=1&pageSize=20&operation=update_expense_ledger_category
```

结果：

- HTTP 200
- `pagination.total = 1`
- `list.length = 1`

### 对账运营统计

```text
GET /finance/reconciliation/operating-stats?date_from=2026-06-01&date_to=2026-06-30&direction=expense
```

结果：

- HTTP 200
- `summary.total = 1`
- `by_exception_code.length = 1`

## Admin 只读 Smoke

### 财务对账页

```text
GET /finance/reconciliation?direction=expense&date_from=2026-06-01&date_to=2026-06-30
```

结果：

- Admin 登录 `/api/auth/login` 返回 HTTP 200。
- 页面标题可见。
- 异常 `支出台账缺少成本分类` 可见。
- “处理”按钮可见。
- 在 `1440x1200` 视口下点击“处理”可打开对账异常处理抽屉。
- 抽屉中的费用上下文可见：
  - 费用申请：`费用审批支出 smoke 20260623142129`
  - 打款金额：`¥1,000.00`
  - 台账金额：`¥1,000.00`
  - 相关台账：`1`
- 抽屉处理动作可见：
  - 标记已确认
  - 标记人工闭环
  - 标记忽略
  - 补成本分类

说明：默认 Playwright 小视口下直接点击“处理”时，自动滚动会让固定筛选/分页区域拦截指针事件；扩大视口后可正常点击。本轮未修改 UI，仅记录为后续 Admin 体验可优化项。

### 修正审计页

```text
GET /finance/audits?operation=update_expense_ledger_category
```

结果：

- 页面标题可见。
- `补支出台账成本分类` 审计类型可见。
- 未发现前端 console error。

## 小程序边界

本轮小程序无必改。

- 小程序不调用 `GET /finance/reconciliation/exceptions/:fingerprint`。
- 小程序不提交 `generate_expense_ledger`、`update_expense_ledger_category`、`record_expense_amount_mismatch_review`。
- 小程序继续只读现有费用、项目、workflow 和财务状态。
- 费用对账异常修正仅由 Admin 财务后台有权限人员处理。

## 结论

Phase 7.9 发布后 API/Admin 只读 smoke 通过，费用异常详情、可用动作、处理历史、修正审计和 Admin 处理抽屉均可读可见。

唯一未关闭项是 Supabase migration 远端对齐核验，原因是当前 `.env.local` 的数据库连接凭据/URL 配置无法通过 Supabase CLI 认证或 TLS 连接。该问题需要先修复外部数据库连接配置，再执行 `supabase migration list` 复核。
