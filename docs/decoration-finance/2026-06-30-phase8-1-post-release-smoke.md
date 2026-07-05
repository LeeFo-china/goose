# Phase 8.1 发布后只读 Smoke

日期：2026-06-30

基线提交：

- `7f635ba0 merge: phase8-1快照差异审计闭环`

## 范围

本轮只验证 Phase 8.1 合入 main 后的线上本地服务表现：

- API：`http://127.0.0.1:3000`
- Admin：`http://127.0.0.1:3010`

只读边界：

- 未执行结账。
- 未执行反结账。
- 未执行修正写操作。
- 未执行 workflow complete。
- 未修改数据库结构或业务数据。

## 服务状态

执行前状态：

- main 工作区 clean。
- `main...origin/main` 对齐。
- API 3000 端口已监听。
- Admin 3010 端口已监听。

基础探测：

- `GET http://127.0.0.1:3000/` 返回 `200`。
- `GET http://127.0.0.1:3010/` 返回 `307`，符合未登录访问后台时的跳转行为。

## Smoke 账号

账号：

- `18800000001 / 风清扬`
- employee ID：`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`
- 租户：固始晴天装饰工程有限公司
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`

## API 验证

### 1. 后台登录

请求：

`POST /admin/auth/login`

结果：

- HTTP `200`
- employee：风清扬
- tenant：固始晴天装饰工程有限公司
- token 获取成功

### 2. 月度经营总览

请求：

`GET /finance/reports/monthly-overview?month=2026-06`

结果：

- HTTP `200`
- `scope.month=2026-06`
- `closing.status=not_started`
- `closing.current_summary` 字段存在
- `closing.difference_summary` 字段存在
- `closing.has_snapshot_difference=false`
- `closing.snapshot_summary=null`

结论：

Phase 8.1 新增的实时摘要、差异摘要和差异标记字段在发布后接口中可读。

### 3. 修正审计月份筛选

请求：

`GET /finance/correction-audits?page=1&pageSize=5&month=2026-06`

结果：

- HTTP `200`
- `pagination.page=1`
- `pagination.pageSize=5`
- `pagination.total=8`
- `summary.total=8`
- `summary.ledger_repair=4`
- `summary.receivable_allocation=4`
- 首条记录 ID：`ledger:56a3fc52-4e1d-4ce6-928f-531b5d1cbed4:mark_legacy_ledger`
- 首条记录时间：`2026-06-29T23:59:51.568+00:00`

结论：

`month=YYYY-MM` 筛选发布后可用，分页和汇总返回正常。

## Admin 验证

### 1. Admin 登录

请求：

`POST /api/auth/login`

结果：

- HTTP `200`
- employee：风清扬
- Admin cookie 设置成功

### 2. 财务报表页

页面：

`GET /finance/reports?month=2026-06`

结果：

- HTTP `200`
- 页面包含“实时毛利”
- 页面包含“快照差异”
- 页面包含跳转链接：

`/finance/audits?page=1&pageSize=20&month=2026-06`

- 页面 HTML 未出现 `__next_error__`

结论：

发布后 Admin 财务报表页能展示 Phase 8.1 快照差异入口。

### 3. 修正审计页

页面：

`GET /finance/audits?month=2026-06`

结果：

- HTTP `200`
- 页面包含“修正审计”
- 页面存在 `month` 筛选字段
- 月份值为 `2026-06`
- 页面 HTML 未出现 `__next_error__`

结论：

发布后 Admin 修正审计页能承接月度报表跳转和月份筛选。

## 结论

Phase 8.1 发布后只读 smoke 通过。

当前状态：

- API 新字段可读。
- 修正审计 `month` 筛选可用。
- Admin 财务报表页可以展示快照差异。
- Admin 可以从月度报表跳转到当月修正审计。
- 本轮未发现接口 4xx/5xx。
- 本轮未发现 Admin 页面 `__next_error__`。

## 后续建议

下一步进入 Phase 8.2：结账差异来源追溯。

目标是从“发现快照差异”推进到“解释差异来源”，让财务能够看到结账后新增或修改的收款、支出、应收、核销、台账修正等来源明细。
