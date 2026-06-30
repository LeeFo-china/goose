# Finance Reconciliation Operating Stats Design

日期：2026-06-30

## 背景

Phase 7 已经完成财务对账异常计算、异常处理动作、人工修正入口和修正审计视图。

当前 Admin 财务对账页能看到异常列表和当前筛选范围 KPI，但财务主管还缺少一组运营视角指标：

- 当前还有多少未处理异常。
- 哪些异常类型最集中。
- 哪些异常已经长时间未处理。
- 最近处理动作由谁执行、处理到什么状态。

这类指标应该服务管理和跟进，不应该改写财务源数据，也不应该制造一个独立的“关闭状态”。

## 目标

新增只读对账运营统计能力：

1. API 提供 `GET /finance/reconciliation/operating-stats`。
2. Admin 财务对账页展示运营统计区。
3. 统计结果复用现有对账异常计算和 action history。
4. 小程序本轮无必改。

## 非目标

本阶段不做：

- 新增数据库表或 migration。
- 自动修账。
- 自动关闭异常。
- 导出报表。
- 小程序新增页面或交互。
- 独立后台任务或缓存。

## 数据原则

运营统计必须从以下事实推导：

1. 现有应收、收款、核销、台账候选数据。
2. `buildFinanceReconciliationExceptions()` 计算出的当前异常。
3. `finance_reconciliation_exception_actions` 中每个异常 fingerprint 的最近处理动作。

不允许新增假状态：

- `resolved` 只代表人工标记闭环。
- 如果源数据仍然不一致，该异常仍然会出现在计算结果里，并带上最近处理状态。
- 如果源数据已修正到不再异常，该异常自然从当前统计中消失。

## API 契约

```text
GET /finance/reconciliation/operating-stats
```

查询参数：

```ts
{
  date_from?: string;          // YYYY-MM-DD，默认最近 30 天
  date_to?: string;            // YYYY-MM-DD，默认今天
  project_id?: string;
  exception_code?: string;
  level?: "info" | "warning" | "danger";
  direction?: "receivable" | "payment" | "expense" | "ledger";
  status?: "open" | "acknowledged" | "ignored" | "resolved";
  actor_employee_id?: string;
}
```

响应：

```ts
{
  scope: {
    date_from: string;
    date_to: string;
    stale_days: [3, 7];
  };
  summary: {
    total: number;
    danger: number;
    warning: number;
    info: number;
    open: number;
    acknowledged: number;
    ignored: number;
    resolved: number;
    total_amount: number;
    stale_open_over_3_days: number;
    stale_open_over_7_days: number;
    latest_exception_at: string | null;
    latest_action_at: string | null;
  };
  by_exception_code: Array<{
    key: string;
    label: string;
    count: number;
    amount: number;
  }>;
  by_status: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  by_level: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  recent_actions: Array<{
    exception_fingerprint: string;
    exception_code: string;
    title: string;
    project_id: string | null;
    project_name: string | null;
    status: string;
    action: string | null;
    actor_employee_id: string | null;
    actor_employee_name: string | null;
    acted_at: string | null;
    remark: string | null;
  }>;
}
```

## 权限

沿用对账异常查看权限：

- `finance.view`
- `finance.ledger.view`
- `finance.receivable.view`
- `finance.receivable.manage`

原因：

- 该接口只读。
- 返回的是当前用户已可查看的对账异常聚合。
- 不暴露新的写入口。

## 性能边界

- 日期范围默认最近 30 天。
- 单次最大范围 366 天，沿用现有对账异常范围限制。
- 候选数据读取继续走现有 repository 的 bounded source limit。
- 统计在当前候选异常集内内存聚合，不新增 N+1 查询。
- 不新增缓存、队列或新依赖。

## Admin 行为

财务对账页新增运营统计区：

- KPI：异常总数、未处理、超 7 天未处理、人工闭环。
- 状态分布：未处理、已确认、已忽略、人工闭环。
- 异常类型分布：按数量降序展示。
- 最近处理动作：显示处理人、动作、状态和时间。

页面仍然只读展示：

- 不自动修正。
- 不自动标记闭环。
- 不修改源单据。

## 小程序边界

本阶段小程序无必改。

小程序继续按现有 workflow v2、费用、收款和项目接口工作。对账运营统计是 Admin 财务管理视图，不作为小程序任务、项目状态或 workflow 推进依据。

如果后续需要在小程序展示财务异常提醒，应单独定义只读提醒契约，不能直接复用 Admin 运营统计接口作为员工任务来源。
