# Phase 8.2 发布后 Smoke 与非空差异来源样本

日期：2026-06-30

## 发布基线

已将本地 `main` 推送到 `origin/main`。

```text
before: origin/main 18731512
after:  origin/main d9cdad74
```

随后补充一次差异来源汇总稳定性加固：

```text
c6ec9e73 fix(api): 稳定差异来源类型汇总
```

## 临时服务

本次使用 main 工作区临时端口，不影响默认 3000/3010 服务。

- API：`http://127.0.0.1:3309`
- Admin：`http://127.0.0.1:3311`

验证完成后临时服务已关闭。

## 账号

```text
18800005001 / 小龙女
tenant: 固始晴天装饰工程有限公司
role: finance_base
```

## 只读 Smoke

### API

```text
GET /admin/auth/me -> 200
employee: 小龙女
tenant: 固始晴天装饰工程有限公司
```

未开始结账月份：

```text
GET /finance/reports/monthly-overview/difference-sources?month=2026-06&page=1&pageSize=5 -> 200
closing_status=not_started
total=0
```

已有结账基线月份：

```text
GET /finance/reports/monthly-overview/difference-sources?month=2099-12&page=1&pageSize=5 -> 200
closing_status=reopened
baseline_at=2026-06-30T09:54:10.754+00:00
total=0
```

### Admin

```text
POST /api/auth/login -> 200
GET /finance/reports?month=2026-06 -> 200
GET /finance/reports/difference-sources?month=2099-12&page=1&pageSize=5 -> 200
```

页面断言：

- 财务报表页包含“查看差异来源”入口。
- 差异来源页渲染“差异来源”标题。
- 差异来源页渲染空态或表格内容，不出现 4xx/5xx。

## 非空差异来源样本

为了验证真实来源链路，本次在未来月 `2099-12` 和已有 Smoke 项目下创建一条人工应收计划。

测试项目：

```text
project_id=b95f6b51-6b9c-4970-948e-b369106545d8
project_name=应收小程序联调 Smoke项目 20260623125051
```

写入：

```text
POST /finance/receivables -> 200
receivable_plan_id=1e4c12f8-47fc-4ce9-877b-2b0325848f66
title=Phase8.2差异来源Smoke-20260630213812
amount=128.82
due_date=2099-12-15
updated_at=2026-06-30T13:38:19.304823+00:00
```

差异来源复核：

```text
GET /finance/reports/monthly-overview/difference-sources?month=2099-12&page=1&pageSize=5&source_type=receivable_plan -> 200
total=1
list_count=1
```

返回记录：

```json
{
  "id": "receivable_plan:1e4c12f8-47fc-4ce9-877b-2b0325848f66",
  "source_type": "receivable_plan",
  "source_id": "1e4c12f8-47fc-4ce9-877b-2b0325848f66",
  "description": "应收计划：Phase8.2差异来源Smoke-20260630213812",
  "amount": 128.82,
  "target": {
    "label": "查看应收计划",
    "href": "/finance/receivables?project_id=b95f6b51-6b9c-4970-948e-b369106545d8&receivable_plan_id=1e4c12f8-47fc-4ce9-877b-2b0325848f66"
  }
}
```

Admin 非空页面复核：

```text
GET /finance/reports/difference-sources?month=2099-12&source_type=receivable_plan&page=1&pageSize=5 -> 200
```

页面断言：

- 包含“差异来源”标题。
- 包含“应收计划”来源标签。
- 包含 `Phase8.2差异来源Smoke` 标题。
- 包含“查看应收计划”操作。

## 加固项

发现并修复一个摘要稳定性问题：

- 旧逻辑：`by_source_type` 依赖每类来源返回列表中的第一条记录读取 `source_type`。
- 风险：当某来源返回 `total > 0` 但当前结果列表为空时，摘要会漏掉该来源计数。
- 新逻辑：service 在调用 repository 时保留请求的 `sourceType`，汇总时使用该 sourceType 记录计数。

验证：

```text
cd apps/api && bun test src/services/finance-monthly-difference-sources.test.ts
5 pass / 0 fail
```

```text
cd apps/api && bun test \
  src/services/finance-monthly-overview.test.ts \
  src/services/finance-closing-periods.test.ts \
  src/services/finance-correction-audits.test.ts \
  src/services/finance-specialized-reports.test.ts \
  src/services/finance-monthly-difference-sources.test.ts \
  src/schema/finance-reports.test.ts

28 pass / 0 fail
```

```text
pnpm --dir apps/api check

typecheck passed
build passed
API file size check passed
```

## 结论

Phase 8.2 发布后 smoke 通过，且已验证真实非空 `receivable_plan` 差异来源链路：

- 后端能返回差异来源记录。
- Admin 能显示非空差异来源页面。
- 应收计划 target href 正确。
- 差异来源摘要按 source type 汇总更稳定。
