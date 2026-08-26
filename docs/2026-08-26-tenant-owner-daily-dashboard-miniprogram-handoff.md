# 租户老板每日看板小程序对接说明

日期：2026-08-26

## 背景

gooes 后端新增租户员工态老板每日看板只读接口，用于微信小程序给租户老板展示每天的经营摘要、待处理事项、资金概览、项目风险、施工动态，以及基于真实 workflow runtime 的在建项目甘特图。

orange 仓库对接时只消费后端返回字段，不在端上硬编码施工阶段。

## 接口 1：每日看板首屏

```http
GET /tenant-owner/daily-dashboard?date=2026-08-26&timezone=Asia/Shanghai
```

认证：员工态 token。

权限：`dashboard.read`。

### Query

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `date` | 否 | 业务日期，格式 `YYYY-MM-DD`，不传则按 `timezone` 计算当天 |
| `timezone` | 否 | 默认 `Asia/Shanghai` |

### 响应

后端统一使用 `ResponseHandler.success(data)` 外层：

```ts
type ApiSuccess<T> = {
  data: T;
  message: "success";
};
```

小程序业务字段从 `response.data` 读取。

```ts
type TenantOwnerDailyDashboardResponse = {
  business_date: string;
  timezone: string;
  generated_at: string;
  owner_actions: {
    total: number;
    items: Array<{
      id: string;
      type: "approval" | "payment" | "acceptance" | "risk" | "customer";
      title: string;
      project_id: string | null;
      project_name: string | null;
      priority: "high" | "medium" | "low";
      target: {
        path: string;
        query?: Record<string, string>;
      };
    }>;
  };
  finance: {
    today_income_amount: string;
    today_expense_amount: string;
    today_net_cash_amount: string;
    receivable_due_today_amount: string;
    receivable_due_7d_amount: string;
    overdue_receivable_amount: string;
    pending_supplier_payable_amount: string;
  };
  projects: {
    active_project_count: number;
    advanced_today_count: number;
    started_today_count: number;
    completed_today_count: number;
    delayed_project_count: number;
    no_log_today_count: number;
    pending_acceptance_count: number;
  };
  risk_projects: {
    total: number;
    items: Array<{
      project_id: string;
      project_name: string;
      customer_name: string | null;
      current_node_title: string | null;
      risk_level: "high" | "warning";
      risk_types: string[];
      reason: string;
      owner_employee_name: string | null;
      updated_at: string;
      target: {
        path: string;
        query?: Record<string, string>;
      };
    }>;
  };
  construction_activity: {
    log_count: number;
    project_coverage_count: number;
    photo_count: number;
    latest_logs: Array<{
      log_id: string;
      project_id: string;
      project_name: string;
      stage_label: string | null;
      summary: string;
      image_count: number;
      created_at: string;
      employee_name: string | null;
    }>;
    missing_logs: Array<{
      project_id: string;
      project_name: string;
      current_node_title: string | null;
      assignee_employee_name: string | null;
    }>;
  };
  partial_errors: Array<{
    module:
      | "owner_actions"
      | "finance"
      | "projects"
      | "risk_projects"
      | "construction_activity"
      | "workflow_progress";
    code: string;
    message: string;
  }>;
};
```

### 展示建议

- 首屏顶部显示 `business_date` 和 `generated_at`。
- 第一块展示 `owner_actions.total` 和最多 5 条 `owner_actions.items`。
- 资金概览主数建议用 `finance.today_net_cash_amount`。
- 项目概览展示 `active_project_count`、`advanced_today_count`、`delayed_project_count`、`no_log_today_count`。
- 风险项目只展示 `risk_projects.items`，点击跳转 `target`。
- 施工动态展示 `latest_logs`，缺日志项目展示 `missing_logs`。
- `partial_errors` 中某模块失败时，只在对应模块展示轻提示，不阻塞整个页面；有 `partial_errors` 仍然代表 HTTP 请求成功。

## 接口 2：在建项目甘特图

```http
GET /tenant-owner/daily-dashboard/projects/gantt?page=1&pageSize=20
```

认证：员工态 token。

权限：`dashboard.read`。

### Query

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `page` | 否 | 默认 `1` |
| `pageSize` | 否 | 默认 `20`，最大 `100` |

### 响应

```ts
type TenantOwnerProjectGanttResponse = {
  list: Array<{
    project: {
      id: string;
      name: string;
      customer_name: string | null;
      address_summary: string | null;
      owner_employee_name: string | null;
      status: string;
    };
    workflow_progress: {
      source: "workflow_runtime" | "missing_runtime" | "unavailable";
      instance_id: string | null;
      instance_status: string | null;
      current_node_key: string | null;
      current_node_title: string | null;
      timeline_nodes: Array<{
        node_key: string;
        node_title: string;
        node_type: string | null;
        business_kind: string | null;
        stage_code: string | null;
        status: "done" | "current" | "pending" | "blocked";
        planned_start_date: string | null;
        planned_end_date: string | null;
        schedule_status: "unscheduled" | "on_track" | "delayed" | "done";
        assignee_employee_name: string | null;
        blocked_reason: string | null;
      }>;
    };
    risk_summary: {
      risk_level: "normal" | "warning" | "high";
      risk_types: string[];
      reason: string | null;
    };
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  partial_errors: Array<{
    module: "workflow_progress";
    code: string;
    message: string;
  }>;
};
```

### 错误响应

参数错误、鉴权失败、权限不足仍走 HTTP 失败：

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  message: string;
};
```

小程序处理规则：

- 400：提示参数错误或回退默认查询参数。
- 401/403：隐藏入口或展示无权限状态。
- 5xx：展示整页失败和重试。
- 200 且存在 `partial_errors`：仅降级对应模块。

## 小程序文件建议

建议新增：

```text
src/packageEmployees/pages/ownerDailyDashboard/index
src/packageEmployees/pages/ownerProjectGantt/index
src/services/ownerDashboard/
```

入口建议：

- 员工首页/工作台具备 `dashboard.read` 时展示“经营看板”入口。
- 无权限时不展示入口。

## 甘特图对接规则

必须使用：

```text
list[].workflow_progress.timeline_nodes
```

禁止使用：

- 本地固定数组 `["拆改", "水电", "瓦工", "木工", "油工", "安装", "竣工"]`
- `construction_stages` 作为流程来源
- `projects.status` 或 `next_stage` 推导流程节点

展示规则：

- 节点顺序只按 `timeline_nodes[]` 数组顺序。
- 标题使用 `node_title`。
- 当前节点使用 `status === "current"`。
- 已完成节点使用 `status === "done"`。
- 延期用 `schedule_status === "delayed"`。
- 未排期用 `schedule_status === "unscheduled"`，显示“未排期”。
- `source === "missing_runtime"` 时显示“流程同步中”，不要端上补节点。
- `source === "unavailable"` 时显示“流程暂不可用”，提供刷新。

## Smoke 清单

1. 使用有 `dashboard.read` 的老板账号打开每日看板，接口返回 200。
2. 使用无 `dashboard.read` 的员工账号，入口不展示，直接请求接口返回 403。
3. 首屏接口 `owner_actions.items`、`risk_projects.items`、`latest_logs`、`missing_logs` 均不超过 5 条。
4. 甘特图接口支持分页，`pageSize=101` 返回参数校验错误。
5. 选择一个 running workflow 项目，甘特图当前节点与项目详情页当前节点一致。
6. 不同 workflow 模板项目能展示不同节点数量和名称。
7. 有模块级 `partial_errors` 时，小程序只降级对应模块，不整页报错。

## 兼容说明

- 这是新增接口，不影响现有项目详情、任务中心、施工日志和客户侧页面。
- 小程序可以先只接首屏接口，甘特图二级页后接。
- 金额字段均为字符串，小程序不要用浮点二次计算展示总额。
