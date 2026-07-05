# Phase 8.3 发布后 Smoke 与真实差异处理闭环

日期：2026-07-01
分支：`main`
提交基线：`58851027 merge: phase8-3 difference resolution`

## 目标

本轮验证 Phase 8.3 合入 `main` 后，在默认 API/Admin 服务上能完成真实非空月结差异处理闭环。

验证范围：

- API `3000` 已加载 Phase 8.3 新接口。
- Admin `3010` 差异来源页能显示真实非空差异来源。
- 差异来源初始状态为 `pending`。
- API 可写入处理状态。
- Admin 行内处理动作可更新处理状态。
- 处理状态筛选和 summary 统计一致。
- migration Local/Remote 对齐。

## 服务与账号

默认服务：

```text
API:   http://127.0.0.1:3000
Admin: http://localhost:3010
```

登录账号：

```text
18800005001 / 小龙女
tenant: 固始晴天装饰工程有限公司
permissions: 30
```

## Migration

复核命令：

```bash
PGSSLMODE=disable supabase migration list --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

结果：

```text
20260630113000 | 20260630113000
20260630190000 | 20260630190000
20260630210000 | 20260630210000
20260630213000 | 20260630213000
```

结论：Phase 8.3 migration 已在远端对齐。

## 发布后 API 只读 Smoke

```http
GET /admin/auth/me
```

返回：

```json
{
  "employee": "小龙女",
  "tenant": "固始晴天装饰工程有限公司",
  "permissions": 30
}
```

真实非空差异来源样本沿用 Phase 8.2 已创建的受控测试数据：

```text
month: 2099-12
project_id: b95f6b51-6b9c-4970-948e-b369106545d8
receivable_plan_id: 1e4c12f8-47fc-4ce9-877b-2b0325848f66
title: Phase8.2差异来源Smoke-20260630213812
```

处理前查询：

```http
GET /finance/reports/monthly-overview/difference-sources?month=2099-12&page=1&pageSize=5&source_type=receivable_plan
```

结果：

```json
{
  "pagination": { "total": 1 },
  "summary": {
    "resolution": {
      "pending": 1,
      "confirmed": 0,
      "ignored": 0,
      "resolved": 0
    }
  },
  "first": {
    "source_type": "receivable_plan",
    "source_id": "1e4c12f8-47fc-4ce9-877b-2b0325848f66",
    "resolution": {
      "status": "pending",
      "note": null,
      "handled_by": null,
      "handled_by_name": null,
      "handled_at": null
    }
  }
}
```

## API 处理状态写入 Smoke

执行：

```http
PUT /finance/reports/monthly-overview/difference-resolutions
```

请求：

```json
{
  "month": "2099-12",
  "source_type": "receivable_plan",
  "source_id": "1e4c12f8-47fc-4ce9-877b-2b0325848f66",
  "project_id": "b95f6b51-6b9c-4970-948e-b369106545d8",
  "status": "confirmed",
  "note": "Phase 8.3 post-release smoke confirmed resolution"
}
```

返回：

```json
{
  "status": "confirmed",
  "source_type": "receivable_plan",
  "source_id": "1e4c12f8-47fc-4ce9-877b-2b0325848f66",
  "handled_by_name": "小龙女",
  "handled_at": "2026-07-01T00:48:39.199+00:00"
}
```

确认筛选：

```http
GET /finance/reports/monthly-overview/difference-sources?month=2099-12&source_type=receivable_plan&resolution_status=confirmed
```

返回：

```json
{
  "pagination": { "total": 1 },
  "summary": {
    "resolution": {
      "pending": 0,
      "confirmed": 1,
      "ignored": 0,
      "resolved": 0
    }
  }
}
```

`resolution_status=pending` 返回 `total=0`，summary 中 `pending=0`、`confirmed=1`。

## Admin 行内处理 Smoke

处理前页面：

```text
GET /finance/reports/difference-sources?month=2099-12&source_type=receivable_plan&page=1&pageSize=5
```

页面断言：

- 包含“差异来源”。
- 包含“应收计划”。
- 包含 `Phase8.2差异来源Smoke`。
- 包含“待处理”。
- 包含行内“确认”动作。
- 未发现 console error / page error。

截图：

```text
/tmp/phase83-post-admin-before.png
```

随后在 Admin 页面执行行内“修复”动作，备注：

```text
Phase 8.3 admin action smoke resolved
```

处理后页面：

```text
GET /finance/reports/difference-sources?month=2099-12&source_type=receivable_plan&page=1&pageSize=5&resolution_status=resolved
```

页面断言：

- 包含 `Phase8.2差异来源Smoke`。
- 包含“已修复”。
- 包含 `Phase 8.3 admin action smoke resolved`。
- 未发现 console error / page error。

截图：

```text
/tmp/phase83-post-admin-resolved.png
```

API 回读：

```json
{
  "pagination": { "total": 1 },
  "summary": {
    "resolution": {
      "pending": 0,
      "confirmed": 0,
      "ignored": 0,
      "resolved": 1
    }
  },
  "first": {
    "source_id": "1e4c12f8-47fc-4ce9-877b-2b0325848f66",
    "resolution": {
      "status": "resolved",
      "note": "Phase 8.3 admin action smoke resolved",
      "handled_by": "bbab0193-43ae-4b7a-a7f3-24314e0f2e0d",
      "handled_by_name": "小龙女",
      "handled_at": "2026-07-01T00:49:18.407+00:00"
    }
  }
}
```

## 小程序边界

本轮仍不需要小程序改动：

- 差异来源和差异处理状态属于 Admin 财务月结复核。
- 小程序不读取 `finance_monthly_difference_resolutions`。
- 小程序不展示月结差异处理状态。
- 后续如果要给员工端展示项目财务复核摘要，需要单独定义员工侧只读接口和权限。

## 结论

Phase 8.3 发布后 smoke 通过，且已补齐真实非空差异处理闭环证据：

- 真实差异来源可查询。
- 初始 `pending` 状态可读。
- API 可写入处理状态。
- Admin 行内动作可更新处理状态。
- `resolution_status` 筛选和 summary 统计一致。
- 不修改原始应收计划、台账或项目事实，只新增/更新差异处理记录。
