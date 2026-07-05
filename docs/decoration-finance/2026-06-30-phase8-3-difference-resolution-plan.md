# Phase 8.3 月结差异处理闭环 PRD 与实施计划

日期：2026-06-30

## 背景

Phase 8.2 已完成月结差异来源追溯：

- 后端能返回结账基线之后的差异来源。
- Admin 能从财务报表进入差异来源页。
- 已通过真实非空样本验证 `receivable_plan` 来源和跳转。

当前缺口是：财务能看到差异来源，但不能在系统内记录“这条差异已经确认、忽略或修正完成”。这会导致月结复核仍然停留在线下沟通，无法形成可追溯闭环。

## 目标

Phase 8.3 目标是补齐“月结差异处理闭环”：

1. 新增独立差异处理记录表，不修改原始台账、应收、费用、修正审计事实。
2. 差异来源接口返回每条来源的处理状态。
3. Admin 差异来源页支持按处理状态筛选，并能单条标记处理状态和备注。
4. 月结摘要显示待处理 / 已处理数量，帮助财务判断月结差异是否已复核完。
5. 保持小程序端无必改。

## 非目标

- 不自动修账。
- 不自动重算或覆盖月结快照。
- 不锁定已结账月份的业务写入。
- 不新增批量处理。
- 不把处理状态写回原始来源单据。
- 不在小程序展示差异处理状态。

## 领域模型

新增表：`finance_monthly_difference_resolutions`

### 唯一身份

每条处理记录对应一个月度差异来源：

```text
tenant_id + month + source_type + source_id
```

这组字段必须唯一。

### 状态

| status | 含义 | 使用场景 |
| --- | --- | --- |
| `pending` | 待处理 | 来源存在但没有处理记录时默认展示 |
| `confirmed` | 已确认 | 财务确认该差异合理，无需修正 |
| `ignored` | 已忽略 | 测试数据、历史噪音或无需纳入本次复核 |
| `resolved` | 已处理 | 已通过应收/台账/费用/修正入口完成处理 |

### 字段

| 字段 | 说明 |
| --- | --- |
| `id` | UUID |
| `tenant_id` | 租户 |
| `month` | 月份，`YYYY-MM` |
| `source_type` | 差异来源类型 |
| `source_id` | 原始来源 ID |
| `project_id` | 冗余项目 ID，用于筛选和审计 |
| `status` | 处理状态 |
| `note` | 处理备注 |
| `handled_by` | 最后处理员工 |
| `handled_at` | 最后处理时间 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

## API 契约

### 差异来源列表增强

现有接口：

```http
GET /finance/reports/monthly-overview/difference-sources?month=2026-06&page=1&pageSize=20
```

新增可选筛选：

| 参数 | 说明 |
| --- | --- |
| `resolution_status` | `pending` / `confirmed` / `ignored` / `resolved` |

每条来源新增：

```json
{
  "resolution": {
    "status": "pending",
    "note": null,
    "handled_by": null,
    "handled_by_name": null,
    "handled_at": null
  }
}
```

summary 新增：

```json
{
  "resolution": {
    "pending": 3,
    "confirmed": 1,
    "ignored": 0,
    "resolved": 2
  }
}
```

口径：

- 没有处理记录的来源视为 `pending`。
- `resolution_status=pending` 必须包含“没有处理记录”的来源。
- `resolution_status` 筛选必须由后端执行后再返回分页和 `pagination.total`。

### 新增/更新处理记录

新增接口：

```http
PUT /finance/reports/monthly-overview/difference-resolutions
```

请求：

```json
{
  "month": "2026-06",
  "source_type": "receivable_plan",
  "source_id": "plan-id",
  "project_id": "project-id",
  "status": "confirmed",
  "note": "已复核，应收计划合理"
}
```

响应：

```json
{
  "id": "resolution-id",
  "month": "2026-06",
  "source_type": "receivable_plan",
  "source_id": "plan-id",
  "project_id": "project-id",
  "status": "confirmed",
  "note": "已复核，应收计划合理",
  "handled_by": "employee-id",
  "handled_by_name": "小龙女",
  "handled_at": "2026-06-30T14:00:00.000Z",
  "created_at": "2026-06-30T14:00:00.000Z",
  "updated_at": "2026-06-30T14:00:00.000Z"
}
```

权限：

- 读：沿用 `finance.reports.read` / `finance.view` / `finance.ledger.view` / `finance.dashboard.view`。
- 写：使用 `finance.closing.manage` 或 `finance.reports.resolve`。
- 当前阶段如果权限字典未有 `finance.reports.resolve`，先复用 `finance.closing.manage`，避免新增角色体系扩散。

## Admin 对接

页面：

```text
/finance/reports/difference-sources?month=2026-06
```

调整：

1. 筛选区新增“处理状态”。
2. 顶部指标新增“待处理 / 已处理”。
3. 表格新增处理状态列。
4. 每行新增处理操作：
   - 标记已确认
   - 标记已忽略
   - 标记已处理
   - 填写备注
5. 操作成功后回到当前筛选页，重新读取后端数据。

交互约束：

- 不做批量操作。
- 不做本地乐观状态。
- 不根据来源类型本地推导处理状态。
- 只展示后端返回的 `resolution`。

## 小程序边界

本阶段小程序端无必改。

原因：

- 月结差异处理是 Admin 财务复核闭环。
- 小程序不展示月结快照、差异来源和修正审计。
- 已有 workflow v2、收款、费用、施工日志接口不变。

## 实施任务

### Task 1：PRD 与计划

- 创建本文档。
- 更新 `docs/decoration-finance/README.md`。
- 单独提交。

### Task 2：Migration 与后端模型

- 新增 migration 创建 `finance_monthly_difference_resolutions`。
- 新增 schema：
  - `FinanceMonthlyDifferenceResolutionStatusSchema`
  - `UpdateFinanceMonthlyDifferenceResolutionSchema`
  - 差异来源 query 新增 `resolution_status`
- 新增 repository：
  - `listBySources`
  - `upsertResolution`
- 新增 service：
  - 将 resolution 合并到 difference source list。
  - 按 `resolution_status` 过滤后分页。
  - 统计 summary resolution counts。
  - 写入处理记录时检查写权限。

### Task 3：后端 API

- 差异来源列表返回 `resolution`。
- 新增 `PUT /finance/reports/monthly-overview/difference-resolutions`。
- TDD 覆盖：
  - 没有处理记录时默认为 `pending`。
  - `resolution_status=pending` 包含无记录来源。
  - `resolution_status=confirmed` 只返回对应来源。
  - 写接口 upsert 并返回处理人信息。
  - 无写权限返回 403。

### Task 4：Admin 页面

- 新增请求类型和 mutation。
- 差异来源工具函数新增处理状态 meta 和 query 参数。
- 差异来源页新增处理状态筛选和指标。
- 表格新增处理状态列和单条处理表单。
- TDD 覆盖 query 构造、状态展示 meta、安全 href 不回归。

### Task 5：Smoke、提交、合并和 RAG

- worktree 内运行 API/Admin 测试和 check。
- 使用临时 API/Admin 端口验证：
  - 非空差异来源样本初始为 `pending`。
  - 标记 `confirmed` 后列表返回处理记录。
  - `resolution_status=confirmed` 能筛到该记录。
  - Admin 页面显示处理状态。
- 记录 smoke 文档。
- 合并回 main，push，RAG 同步。

## 验收标准

- migration 通过并可验证 Local/Remote 对齐。
- 差异来源列表每条返回 `resolution`。
- 未处理来源默认显示 `pending`。
- Admin 能筛选处理状态。
- Admin 能单条标记 confirmed / ignored / resolved，并填写备注。
- 写接口权限正确，普通只读财务账号不能写。
- API/Admin check 通过。
- smoke 文档、README 和 RAG 同步完成。
