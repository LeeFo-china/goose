# Phase 8.2 月度差异来源追溯 Smoke

日期：2026-06-30

分支：`feat/phase8-difference-sources`

## 范围

- 新增只读接口：`GET /finance/reports/monthly-overview/difference-sources`
- 新增 Admin 页面：`/finance/reports/difference-sources`
- 财务报表月结摘要卡片新增“查看差异来源”入口。
- 修正审计来源跳转到 `/finance/audits?month=...&project_id=...`。

本阶段未新增 migration，未修改小程序仓库，未执行任何写入型业务操作。

## 自动验证

```text
cd apps/api && bun test \
  src/services/finance-monthly-overview.test.ts \
  src/services/finance-closing-periods.test.ts \
  src/services/finance-correction-audits.test.ts \
  src/services/finance-specialized-reports.test.ts \
  src/services/finance-monthly-difference-sources.test.ts \
  src/schema/finance-reports.test.ts

27 pass / 0 fail
```

```text
pnpm --dir apps/api check

typecheck passed
build passed
API file size check passed
```

```text
cd apps/admin && bun test \
  components/finance/finance-difference-sources-utils.test.ts \
  components/finance/finance-operating-report-utils.test.ts \
  components/finance/finance-correction-audit-utils.test.ts

13 pass / 0 fail
```

```text
pnpm --dir apps/admin check

admin file size check passed
typecheck passed
```

## 临时服务 Smoke

临时端口：

- API：`http://127.0.0.1:3309`
- Admin：`http://127.0.0.1:3311`

服务已在 smoke 后关闭，未触碰 main 工作区服务。

账号：

```text
18800005001 / 小龙女
role: finance_base
tenant: 固始晴天装饰工程有限公司
```

### API：未开始结账月份

请求：

```text
GET /finance/reports/monthly-overview/difference-sources?month=2026-06&page=1&pageSize=5
```

结果：

```json
{
  "status": 200,
  "month": "2026-06",
  "closing_status": "not_started",
  "baseline_at": null,
  "has_snapshot_difference": false,
  "total": 0,
  "pageSize": 5,
  "list_count": 0
}
```

### API：已有结账基线月份

样本：

```text
month=2099-12
closing_status=reopened
baseline_at=2026-06-30T09:54:10.754+00:00
```

请求：

```text
GET /finance/reports/monthly-overview/difference-sources?month=2099-12&page=1&pageSize=5
```

结果：

```json
{
  "status": 200,
  "month": "2099-12",
  "closing_status": "reopened",
  "baseline_at": "2026-06-30T09:54:10.754+00:00",
  "has_snapshot_difference": false,
  "total": 0,
  "pageSize": 5,
  "list_count": 0,
  "by_source_type": {}
}
```

### Admin SSR

通过 Admin 登录路由拿 cookie 后验证：

```text
POST /api/auth/login -> 200
GET /finance/reports?month=2026-06 -> 200
GET /finance/reports/difference-sources?month=2099-12&page=1&pageSize=5 -> 200
```

页面检查：

- `/finance/reports?month=2026-06` 包含“查看差异来源”入口。
- `/finance/reports/difference-sources?month=2099-12&page=1&pageSize=5` 渲染“差异来源”标题。
- 差异来源页渲染空态或表格内容，不出现 4xx/5xx。

## 结论

Phase 8.2 后端接口、Admin 入口和差异来源页面 smoke 通过。当前样本没有真实差异来源记录，但已验证：

- 未结账月份返回 `not_started` 空列表。
- 有结账基线月份返回对应 `closing_status` 和 `baseline_at`。
- Admin 主报表页入口可见。
- Admin 差异来源页服务端渲染正常。
