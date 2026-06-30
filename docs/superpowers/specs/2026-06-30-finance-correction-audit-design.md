# Finance Correction Audit View Design

日期：2026-06-30

## 背景

Phase 7.4 已上线多类财务人工修正能力：

- 人工核销收款。
- 调整人工核销。
- 撤销人工核销。
- 补生成缺失项目收款台账。
- 历史收款台账关联 confirmed payment。
- 历史收款台账标记为历史流水。

这些能力已经能关闭对应对账异常，但当前 Admin 只能在业务页面看到局部状态。财务主管缺少一个统一视图，用来追溯“谁在什么时候因为什么修正了什么”。

## 目标

新增 Admin 财务“修正审计”只读视图，并提供后端分页接口。

该视图用于：

- 集中查看财务人工修正记录。
- 按修正类型、项目、操作人、时间范围筛选。
- 从审计记录跳转回相关业务对象。
- 为后续对账异常运营统计提供稳定数据口径。

## 非目标

本阶段不做：

- 新增修正写操作。
- 新增复核审批流。
- 导出功能。
- 小程序入口。
- 自动修账。
- 新的财务修正日志表。

## 推荐方案

采用只读聚合方案，不新增业务写表。

后端从现有表读取审计事实，并归一化为统一 DTO：

1. `project_receivable_events`
   - `allocate_payment`
   - `adjust_allocation`
   - `reverse_allocation`
2. `finance_ledger_entries`
   - `payment_linked_at IS NOT NULL`
   - `legacy_payment_ledger_marked_at IS NOT NULL`
   - `metadata.operation = generate_project_payment_ledger` 或 source 信息能识别补生成台账时纳入

如果某类历史补生成台账缺少稳定审计字段，则第一版只展示可确定的记录，并在文档中说明补生成台账审计完整性需要下一次数据结构补丁补齐。

## 权限

接口读取权限：

- `finance.reconciliation.manage`

原因：

- 该视图包含修账原因、操作人和业务对象 ID。
- 当前这些写操作也由 `finance.reconciliation.manage` 或财务管理权限保护。
- 先对财务主管和系统管理员开放，不作为普通财务台账只读能力。

## API 设计

新增接口：

```text
GET /finance/correction-audits
```

查询参数：

```ts
{
  page?: number;          // 默认 1
  pageSize?: number;      // 默认 20，最大 100
  operation?: string;     // 修正类型
  project_id?: string;    // 项目 ID
  actor_employee_id?: string;
  date_from?: string;     // YYYY-MM-DD
  date_to?: string;       // YYYY-MM-DD
}
```

响应：

```ts
{
  list: FinanceCorrectionAuditRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    ledger_repair: number;
    receivable_allocation: number;
  };
}
```

记录 DTO：

```ts
type FinanceCorrectionAuditRecord = {
  id: string;
  operation:
    | "manual_allocation"
    | "adjust_allocation"
    | "reverse_allocation"
    | "generate_payment_ledger"
    | "link_ledger_payment"
    | "mark_legacy_ledger";
  operation_label: string;
  domain: "receivable" | "ledger";
  project_id: string | null;
  project_name: string | null;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  occurred_at: string;
  reason: string | null;
  amount: number | null;
  receivable_plan_id: string | null;
  allocation_id: string | null;
  payment_id: string | null;
  ledger_id: string | null;
  target: {
    label: string;
    href: string;
  };
};
```

## 数据来源映射

### 人工核销

来源：`project_receivable_events`

映射：

- `event_type=allocate_payment` -> `manual_allocation`
- `event_type=adjust_allocation` -> `adjust_allocation`
- `event_type=reverse_allocation` -> `reverse_allocation`
- `created_by` -> `actor_employee_id`
- `created_at` -> `occurred_at`
- `note` -> `reason`
- `receivable_plan_id` -> `receivable_plan_id`
- `project_id` -> `project_id`
- `after_snapshot.id` 或 snapshot 中 allocation ID -> `allocation_id`

如果 snapshot 不包含 allocation ID，第一版允许为空，但 target 仍指向应收计划。

### 历史台账关联收款

来源：`finance_ledger_entries`

筛选：

```text
payment_linked_at IS NOT NULL
```

映射：

- `operation=link_ledger_payment`
- `id` -> `ledger_id`
- `payment_id` -> `payment_id`
- `payment_linked_by` -> `actor_employee_id`
- `payment_linked_at` -> `occurred_at`
- `payment_link_reason` -> `reason`
- `amount` -> `amount`
- target -> `/finance/ledger?ledger_id=<ledger_id>`

### 历史台账标记

来源：`finance_ledger_entries`

筛选：

```text
legacy_payment_ledger_marked_at IS NOT NULL
```

映射：

- `operation=mark_legacy_ledger`
- `id` -> `ledger_id`
- `legacy_payment_ledger_marked_by` -> `actor_employee_id`
- `legacy_payment_ledger_marked_at` -> `occurred_at`
- `legacy_payment_ledger_reason` -> `reason`
- `amount` -> `amount`
- target -> `/finance/ledger?ledger_id=<ledger_id>`

### 补生成台账

来源：`finance_ledger_entries`

第一版纳入条件：

- metadata 或 source 信息中能稳定识别为补生成台账。

如果当前实现无法稳定识别补生成来源，则第一版不纳入列表，避免误报。后续补充显式字段或 metadata 规范后再接入。

## 后端实现结构

新增：

- `apps/api/src/schema/finance-correction-audits.ts`
- `apps/api/src/repositories/finance-correction-audits.ts`
- `apps/api/src/services/finance-correction-audits.ts`
- `apps/api/src/services/finance-correction-audits.test.ts`

修改：

- `apps/api/src/controllers/finance/index.ts`

实现原则：

- 必须分页，默认 `page=1&pageSize=20`，最大 `100`。
- 查询字段必须明确 select，不使用无界全表读取。
- 两类来源分别分页候选，再在 service 层归一化、合并排序、分页。
- 如果合并分页无法准确 total，第一版可在仓库层分别 count 后合计，列表拉取当前页需要的上限并按 `occurred_at` 排序截取。
- 不新增 migration，除非实施时发现必要索引缺失。

## Admin 实现结构

新增：

- `apps/admin/app/(console)/finance/audits/page.tsx`
- `apps/admin/components/finance/finance-correction-audit-requests.ts`
- `apps/admin/components/finance/finance-correction-audit-table.tsx`
- `apps/admin/components/finance/finance-correction-audit-utils.ts`
- `apps/admin/components/finance/finance-correction-audit-utils.test.ts`

修改：

- `apps/admin/components/finance/finance-module-tabs.tsx`

页面设计：

- 新增 tab：`修正审计`。
- 页面顶部保留 compact heading 和总数说明。
- 第一行 KPI：
  - 修正总数。
  - 台账修正。
  - 应收核销修正。
- 筛选区：
  - 日期范围。
  - 修正类型。
  - 项目 ID。
  - 操作人。
- 表格列：
  - 时间。
  - 类型。
  - 项目。
  - 金额。
  - 操作人。
  - 原因。
  - 关联对象。
  - 操作。
- 操作只提供跳转，不提供写操作。

## 小程序影响

小程序无必改。

该视图属于 Admin 财务主管审计工具，不向小程序暴露修正入口。

## 验证计划

API：

- 单测验证权限。
- 单测验证 ledger link / legacy mark 映射。
- 单测验证 receivable event 映射。
- 单测验证 operation、project、actor、date 过滤。
- 单测验证分页上限。

Admin：

- util test 验证 label、href、query params。
- `pnpm --dir apps/admin check`。
- 浏览器 smoke：
  - 登录 Admin。
  - 打开 `/finance/audits`。
  - 验证列表可见。
  - 验证筛选不报错。
  - 验证跳转 href 指向 ledger 或 receivable 页面。

## 风险

- `project_receivable_events` snapshot 里未必稳定包含 allocation ID，需要实现时确认。
- 补生成台账当前可能没有足够明确的审计字段，第一版不应为了凑齐而误判普通台账。
- 多来源聚合分页需要谨慎处理 total 和排序，不能无界读取。

## 决策

第一版只做只读审计视图，不做新写操作、不做复核流、不做导出。先把修正可追溯性补齐，再进入 Phase 7.6 运营统计。
