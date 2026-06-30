# Phase 8.2 结账差异来源追溯计划

日期：2026-06-30

## 背景

Phase 8.1 已完成月度结账快照差异展示：

- 月度总览返回实时摘要、快照摘要、差异摘要和 `has_snapshot_difference`。
- Admin 财务报表页能展示“快照毛利 / 实时毛利 / 快照差异”。
- Admin 可以从月度报表跳转到当月修正审计。

当前缺口是：财务只能知道“快照和实时有差异”，但还不能直接看到差异由哪些结账后变化造成。

## 目标

Phase 8.2 目标是补齐“差异来源追溯”：

1. 后端提供只读差异来源列表 API。
2. Admin 从财务报表页的快照差异区域进入差异来源列表。
3. 差异来源条目能跳转到已有业务来源，包括修正审计、财务台账、应收计划和费用单据。
4. 修正审计继续作为人工修正事实记录，不被改造成综合报表。
5. 小程序端本轮无必改。

## 非目标

- 不自动修账。
- 不自动重算结账快照。
- 不阻止已结账月份继续发生业务修正。
- 不新增正式锁账机制。
- 不新增数据库表或 migration。
- 不在小程序端展示差异来源明细。

## 差异来源口径

第一版只追溯“结账快照之后发生的可解释来源”，避免误把所有当月数据都列出来。

### 结账基准时间

优先取：

1. `finance_closing_periods.closed_at`
2. 如果未 closed，但有草稿或反结账记录，取 `finance_closing_periods.updated_at`
3. 如果当前月份没有 closing period，则返回空列表，并在 summary 中说明 `closing_status=not_started`

### 来源类型

| source_type | 来源 | 说明 |
| --- | --- | --- |
| `correction_audit` | `/finance/correction-audits` | 人工核销、台账修正、费用修正等已纳入审计的记录 |
| `ledger_entry` | `finance_ledger_entries` | 结账后新增或更新时间晚于结账基准时间的台账流水 |
| `receivable_plan` | `project_receivable_plans` | 结账后新增或更新的应收计划 |
| `expense_request` | `expense_requests` | 结账后新增或更新的费用申请或打款相关记录 |

第一版可先聚合已有 repository 能取到的数据；如果某类来源缺少稳定 repository，则先不纳入，不允许为了赶进度直接裸写跨层 SQL 到 controller。

## API 契约

新增接口：

```http
GET /finance/reports/monthly-overview/difference-sources?month=2026-06&page=1&pageSize=20
```

筛选参数：

| 参数 | 说明 |
| --- | --- |
| `month` | 必填，格式 `YYYY-MM` |
| `source_type` | 可选，限定来源类型 |
| `project_id` | 可选，按项目过滤 |
| `page` | 默认 1 |
| `pageSize` | 默认 20，最大 100 |

返回示例：

```json
{
  "summary": {
    "month": "2026-06",
    "closing_status": "closed",
    "baseline_at": "2026-06-30T12:00:00.000Z",
    "has_snapshot_difference": true,
    "total": 3,
    "by_source_type": {
      "correction_audit": 2,
      "ledger_entry": 1
    }
  },
  "list": [
    {
      "id": "correction-audit:ledger:xxx",
      "source_type": "correction_audit",
      "source_label": "台账修正",
      "occurred_at": "2026-06-30T13:00:00.000Z",
      "project_id": "project-1",
      "project_name": "张三项目",
      "amount": 1000,
      "direction": "in",
      "description": "标记历史流水",
      "target": {
        "label": "查看修正审计",
        "href": "/finance/audits?month=2026-06&project_id=project-1"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

权限：

- 复用 `finance.reports.read`。
- 如果后续要暴露更细审计数据，再追加 `finance.reconciliation.manage`，本轮不提高门槛。

性能边界：

- 必须分页。
- `pageSize <= 100`。
- repository 查询必须限定字段。
- 候选数据可以按来源分别取 `page * pageSize` 上限后合并排序，避免一次全量加载。

## Admin 对接

### 财务报表页

页面：

`/finance/reports?month=2026-06`

调整：

- 在“快照差异”区域新增“查看差异来源”按钮。
- 跳转到：

`/finance/reports/difference-sources?month=2026-06`

保留已有“查看修正审计”入口。

### 差异来源页

新增页面：

`/finance/reports/difference-sources?month=2026-06`

页面内容：

- 顶部显示月份、结账状态、差异来源总数、结账基准时间。
- 筛选：月份、来源类型、项目 ID。
- 表格列：
  - 来源类型
  - 发生时间
  - 项目
  - 金额
  - 方向
  - 说明
  - 操作入口
- 空状态：
  - 未结账月份：显示“当前月份尚未结账，暂无结账后差异来源”
  - 已结账但无来源：显示“未发现结账后变更来源”

### 修正审计联动

差异来源页中的 `correction_audit` 条目跳转到已有：

`/finance/audits?month=2026-06&project_id=xxx`

修正审计页不新增差异计算逻辑，只承担审计明细查看。

## 小程序边界

本轮小程序端无必改。

原因：

- 差异来源属于 Admin 财务管理和审计追溯。
- 小程序不展示月结快照、反结账、修正审计。
- workflow v2、项目详情、收款、费用和施工接口契约不变。

## 实施任务

1. 计划文档：落本文档并更新 `docs/decoration-finance/README.md`。
2. 后端 API：新增 schema、service、repository 和 controller route，TDD 覆盖 month、分页、未结账空列表、按来源筛选。
3. Admin 页面：新增请求类型、工具函数、差异来源页和报表页入口，TDD 覆盖 query 构造和 display meta。
4. 审计联动：差异来源 `target.href` 对齐现有 `/finance/audits` 查询参数。
5. Smoke：worktree 临时 API/Admin 只读 smoke，记录结果，提交、合回 main、RAG 同步。

## 验收标准

- `GET /finance/reports/monthly-overview/difference-sources?month=2026-06&page=1&pageSize=20` 返回 200。
- 未结账月份返回空列表，不报错。
- 已结账月份只返回结账基准时间之后的来源。
- Admin `/finance/reports?month=YYYY-MM` 能看到“查看差异来源”入口。
- Admin `/finance/reports/difference-sources?month=YYYY-MM` 能展示列表、筛选和空状态。
- 全流程只读 smoke 不产生业务写入。
- API/Admin check 通过。
- 文档更新并完成 RAG 同步。
