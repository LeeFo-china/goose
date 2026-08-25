# 租户老板每日看板小程序对接执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为租户老板在微信小程序端提供一个 1 分钟可读的每日经营看板，并提供基于真实工作流节点的在建项目甘特图视图。

**Architecture:** 后端新增租户员工态只读聚合接口，按租户权限隔离，首屏只返回有边界的摘要、待处理、风险和动态；在建项目甘特图单独分页返回，节点顺序只来源于后端 workflow runtime 的 `workflow_progress.timeline_nodes`。小程序只消费后端契约，不在端上写死施工阶段或推导流程状态。

**Tech Stack:** Bun + TypeScript + Fastify API、Supabase、`@gooes/domain` 权限常量、微信小程序 orange 仓库只读对接。

---

## 背景

老板端需要的是“今天公司有没有异常、哪里需要我处理、钱和项目有没有风险”，不是 admin 后台的完整财务报表或项目管理台。

首屏应尽量少字段、少入口、强优先级：

- 先看需要老板处理的事项。
- 再看资金和项目总体健康。
- 再看风险项目和今天现场动态。
- 在建项目甘特图作为二级视图，用于扫多个项目的施工推进情况。

## 核心原则

1. 小程序端不写死 `拆改、水电、瓦工、木工、油工、安装、竣工`。
2. 横向阶段来自项目真实 workflow runtime 节点，即 `workflow_progress.timeline_nodes`。
3. 不使用 `construction_stages`、`projects.status`、`next_stage` 作为甘特图流程来源。
4. 首屏接口不返回全量项目、全量流水、全量日志。
5. 所有项目列表必须分页，默认 `page=1&pageSize=20`，`pageSize <= 100`。
6. 金额类数据必须保持租户隔离，并用权限控制入口。
7. 缺失数据要可降级，通过 `partial_errors[]` 标明模块，而不是让整个看板不可用。

## 用户与权限

目标用户：

- 租户老板
- 租户管理员
- 被授予经营看板权限的管理岗

推荐权限：

- MVP 复用现有 `dashboard.read`，降低发版复杂度。
- 若后续需要把老板看板和普通工作台拆开，再新增 `tenant_owner_dashboard.read`。

权限策略：

- 后端接口必须读取 auth tenant context，只返回当前租户数据。
- 无 `dashboard.read` 返回 403。
- 小程序首页入口也按 `dashboard.read` 控制展示。

## 首屏信息结构

### 1. 今日待老板处理

目的：进入页面先回答“今天我需要做什么”。

建议字段：

| 字段 | 说明 |
| --- | --- |
| `total` | 待处理总数 |
| `items[].type` | `approval`、`payment`、`acceptance`、`risk`、`customer` |
| `items[].title` | 待处理标题 |
| `items[].project_id` | 关联项目 |
| `items[].project_name` | 项目名称 |
| `items[].priority` | `high`、`medium`、`low` |
| `items[].target` | 小程序跳转目标 |

首屏最多返回 5 条，更多跳转任务中心或对应列表页。

### 2. 资金概览

目的：老板快速判断现金流压力。

建议字段：

| 字段 | 说明 |
| --- | --- |
| `today_income_amount` | 今日已收 |
| `today_expense_amount` | 今日支出 |
| `today_net_cash_amount` | 今日净流入 |
| `receivable_due_today_amount` | 今日应收 |
| `receivable_due_7d_amount` | 未来 7 天应收 |
| `overdue_receivable_amount` | 逾期应收 |
| `pending_supplier_payable_amount` | 待付供应商款 |

注意：

- 这里是经营摘要，不展示完整财务明细。
- 明细仍走 admin 财务模块或后续小程序二级页。

### 3. 项目进度概览

目的：老板知道项目总体推进是否正常。

建议字段：

| 字段 | 说明 |
| --- | --- |
| `active_project_count` | 在建项目数 |
| `advanced_today_count` | 今日推进节点的项目数 |
| `started_today_count` | 今日新开工/新启动节点数 |
| `completed_today_count` | 今日完成节点数 |
| `delayed_project_count` | 延期项目数 |
| `no_log_today_count` | 今日应有日志但未写日志的项目数 |
| `pending_acceptance_count` | 待验收项目数 |

### 4. 风险项目 Top 5

目的：把老板注意力聚焦到少数最重要风险。

建议字段：

| 字段 | 说明 |
| --- | --- |
| `project_id` | 项目 ID |
| `project_name` | 项目名称 |
| `customer_name` | 客户名称 |
| `current_node_title` | 当前流程节点 |
| `risk_level` | `high`、`warning` |
| `risk_types[]` | `overdue_receivable`、`low_margin`、`no_log`、`delayed_workflow` 等 |
| `reason` | 一句话原因 |
| `owner_employee_name` | 责任人 |
| `updated_at` | 风险更新时间 |
| `target` | 小程序跳转目标 |

首屏最多返回 5 条，避免变成项目列表。

### 5. 今日施工动态

目的：老板知道现场今天有没有动。

建议字段：

| 字段 | 说明 |
| --- | --- |
| `log_count` | 今日施工日志数 |
| `project_coverage_count` | 今日有日志的项目数 |
| `photo_count` | 今日施工照片数 |
| `latest_logs[]` | 最近 3-5 条日志摘要 |
| `missing_logs[]` | 今日应写但未写日志的项目，最多 5 条 |

## 在建项目甘特图

### 定位

甘特图适合作为老板看板的二级页或首屏卡片点击后的详情页，不建议直接塞进首屏。原因是手机横向空间有限，首屏需要先展示经营健康，甘特图更适合横向滚动和筛选。

### 数据来源

每个项目的横向节点必须来自：

```text
workflow_progress.timeline_nodes
```

节点顺序只按后端返回数组顺序。

可以展示的典型节点名称包括 `拆改`、`水电`、`瓦工`、`木工`、`油工`、`安装`、`竣工`，但这些只是业务模板上的节点标题，不应成为小程序硬编码列。

### 节点映射

| 后端字段 | 小程序用途 |
| --- | --- |
| `node_key` | 节点唯一 key |
| `node_title` 或 `display.label` | 横向节点标题 |
| `node_type` | 判断是否施工工序、验收、收款等 |
| `business_kind` | 区分 `procedure`、`acceptance`、`payment_collection` |
| `attributes.stage_code` | 施工工序编码 |
| `status` | `done`、`current`、`pending`、`blocked` |
| `actions[]` | 节点可执行动作，仅用于详情页或任务入口 |

### 计划与实际时间

甘特图需要计划/实际时间时，后端应把工序排期合并到节点上，而不是小程序二次查询和拼装：

| 字段 | 说明 |
| --- | --- |
| `planned_start_date` | 计划开始日期 |
| `planned_end_date` | 计划结束日期 |
| `actual_started_at` | 实际开始时间 |
| `actual_completed_at` | 实际完成时间 |
| `assignee_employee_name` | 责任人 |
| `schedule_status` | `unscheduled`、`on_track`、`delayed`、`done` |

未排期节点显示“未排期/待开始”，不要用空白造成误解。

## 后端接口建议

### 首屏聚合

```http
GET /tenant-owner/daily-dashboard?date=2026-08-26&timezone=Asia/Shanghai
```

认证：员工态 token。

权限：`dashboard.read`。

响应：

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
    module: "owner_actions" | "finance" | "projects" | "risk_projects" | "construction_activity";
    code: string;
    message: string;
  }>;
};
```

边界：

- `owner_actions.items` 最多 5 条。
- `risk_projects.items` 最多 5 条。
- `construction_activity.latest_logs` 最多 5 条。
- `construction_activity.missing_logs` 最多 5 条。
- 金额用字符串返回，避免前端浮点精度问题。

### 在建项目甘特图

```http
GET /tenant-owner/daily-dashboard/projects/gantt?page=1&pageSize=20&window_days=30&risk=all
```

认证：员工态 token。

权限：`dashboard.read`。

分页：

- 默认 `page=1&pageSize=20`。
- `pageSize` 最大 100。

响应：

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
        actual_started_at: string | null;
        actual_completed_at: string | null;
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
    module: "workflow_progress" | "schedule" | "risk";
    code: string;
    message: string;
  }>;
};
```

## 后端执行计划

### Task 1: 数据口径核查

**Files:**

- Read: `apps/api/src/controllers/employee-self-service/index.ts`
- Read: `apps/api/src/controllers/employee-self-service/bootstrap-handler.ts`
- Read: `apps/api/src/services/home-dashboard.ts`
- Read: `apps/api/src/repositories/home-dashboard.ts`
- Read: `apps/api/src/services/project-workflow-progress.ts`
- Read: `apps/api/src/services/finance-project-summary.ts`
- Read: `apps/api/src/services/project-operational-risks.ts`

- [ ] 确认员工态 token、tenant context、`dashboard.read` 的现有用法。
- [ ] 确认今日施工日志、项目 workflow、财务应收应付、风险项目的数据来源。
- [ ] 列出首屏每个模块的查询来源和性能边界。
- [ ] 如果需要新增索引、RPC 或字典初始化数据，先写 migration 方案，不直接改远端数据库。

### Task 2: 后端测试先行

**Files:**

- Create: `apps/api/src/services/tenant-owner-daily-dashboard.test.ts`
- Create: `apps/api/src/controllers/tenant-owner-daily-dashboard/routes.test.ts`
- Create: `apps/api/src/repositories/tenant-owner-daily-dashboard.test.ts`

- [ ] 写 service 测试：无权限返回 403、有权限只读取当前租户、首屏列表最多 5 条。
- [ ] 写 gantt 测试：分页参数默认值、`pageSize > 100` 被限制或拒绝、节点顺序来自 `workflow_progress.timeline_nodes`。
- [ ] 写降级测试：财务模块失败时写入 `partial_errors.module = "finance"`，其他模块仍返回。

建议命令：

```bash
bun test apps/api/src/services/tenant-owner-daily-dashboard.test.ts
bun test apps/api/src/controllers/tenant-owner-daily-dashboard/routes.test.ts
```

### Task 3: 实现只读聚合服务

**Files:**

- Create: `apps/api/src/services/tenant-owner-daily-dashboard.ts`
- Create: `apps/api/src/repositories/tenant-owner-daily-dashboard.ts`

- [ ] Repository 只做 Supabase/RPC 查询，必须限定字段。
- [ ] Service 编排 owner actions、finance、projects、risk、construction activity。
- [ ] 首屏每个 top list 都加上限，不返回全量。
- [ ] 所有错误通过模块级 `partial_errors[]` 降级，真正权限和参数错误继续失败。
- [ ] 避免 N+1 查询；需要项目批量数据时一次性按项目 ID 查询。

### Task 4: 实现 API Controller

**Files:**

- Create: `apps/api/src/controllers/tenant-owner-daily-dashboard/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] 新增 `GET /tenant-owner/daily-dashboard`。
- [ ] 新增 `GET /tenant-owner/daily-dashboard/projects/gantt`。
- [ ] Controller 只处理 HTTP、参数校验、调用 service、包装 `ResponseHandler.success`。
- [ ] 错误响应使用 `error-factory.ts`，不直接 `throw new Error()`。

### Task 5: 性能与 migration 检查

**Files:**

- Create only if needed: `supabase/migrations/YYYYMMDDHHMMSS_tenant_owner_dashboard_indexes.sql`

- [ ] 对项目列表、日志、财务流水、风险查询确认已有索引。
- [ ] 若新增索引，用 migration 管理。
- [ ] migration 应用后用 `supabase migration list` 验证 Local/Remote 对齐。
- [ ] 大表查询如涉及新排序或复杂过滤，使用 `EXPLAIN ANALYZE` 验证。

### Task 6: 后端验证

建议命令：

```bash
bun test apps/api/src/services/tenant-owner-daily-dashboard.test.ts
bun test apps/api/src/controllers/tenant-owner-daily-dashboard/routes.test.ts
bun run api:build
```

建议 smoke：

```http
GET /tenant-owner/daily-dashboard?date=2026-08-26&timezone=Asia/Shanghai
GET /tenant-owner/daily-dashboard/projects/gantt?page=1&pageSize=20&window_days=30
```

验收：

- 无权限账号返回 403。
- 老板账号只看到本租户数据。
- 首屏接口不返回全量项目。
- 甘特图接口有分页。
- `timeline_nodes` 顺序和项目详情 workflow 一致。
- 有 workflow runtime 的项目 `workflow_progress.source = "workflow_runtime"`。
- 缺 runtime 的项目显示 `source = "missing_runtime"`，小程序不可自行推导流程。

## 小程序对接计划

> gooes 侧只输出接口契约和 handoff 文档；orange 仓库按当前项目规则只读参考，不在本仓库任务中修改。

### 推荐页面结构

建议小程序新增老板看板页：

```text
src/packageEmployees/pages/ownerDailyDashboard/index
```

建议服务封装：

```text
src/services/ownerDashboard/
```

建议入口：

- 员工首页/工作台看到 `dashboard.read` 时展示“经营看板”入口。
- 如果已经有经营看板入口，则替换或升级为每日看板。

### 首屏组件

| 组件 | 数据 |
| --- | --- |
| 顶部日期与更新时间 | `business_date`、`generated_at` |
| 今日待老板处理 | `owner_actions` |
| 资金概览 | `finance` |
| 项目进度概览 | `projects` |
| 风险项目 Top 5 | `risk_projects.items` |
| 今日施工动态 | `construction_activity` |

交互：

- 卡片点击跳转对应 `target.path`。
- `partial_errors` 对应模块显示轻量提示，如“财务数据暂不可用”。
- 空数据展示“今日暂无待处理/暂无风险项目”，不要显示错误状态。

### 甘特图页面

建议小程序新增二级页：

```text
src/packageEmployees/pages/ownerProjectGantt/index
```

展示规则：

- 左侧固定项目名称。
- 右侧横向滚动节点。
- 节点标题使用 API 返回的 `node_title`。
- 节点状态使用 `status` 和 `schedule_status`。
- 当前节点突出显示。
- 延期节点显示风险色。
- 未排期节点显示“未排期”。
- 点击项目进入项目详情。
- 点击节点进入项目当前流程/施工日志详情，但不在甘特图上直接做流程推进。

禁止：

- 不要在端上写死固定 7 列。
- 不要用 `construction_stages` 补齐节点。
- 不要因为某个模板缺少 `瓦工/木工` 就强行展示空列。

## 字段映射

| 业务信息 | 后端字段 | 小程序展示 |
| --- | --- | --- |
| 今日待处理数量 | `owner_actions.total` | 顶部红点/待办数字 |
| 今日待处理列表 | `owner_actions.items` | 待办卡片 |
| 今日净流入 | `finance.today_net_cash_amount` | 资金概览主数 |
| 逾期应收 | `finance.overdue_receivable_amount` | 风险提示 |
| 在建项目数 | `projects.active_project_count` | 项目概览 |
| 今日推进 | `projects.advanced_today_count` | 项目概览 |
| 未写日志 | `projects.no_log_today_count` | 施工动态风险 |
| 风险项目 | `risk_projects.items` | 风险项目列表 |
| 最新日志 | `construction_activity.latest_logs` | 今日动态 |
| 甘特节点 | `workflow_progress.timeline_nodes` | 横向流程条 |

## 发布顺序

1. 后端先发只读接口，不影响现有小程序。
2. 在 docs 更新小程序 handoff 契约。
3. 小程序团队按契约开发页面，先接 mock 或 dev API。
4. 联调老板账号，校验租户隔离、权限、空数据和异常降级。
5. dev 环境通过后再推进生产发布。

## 风险与取舍

| 风险 | 处理 |
| --- | --- |
| 财务、项目、日志数据分散，聚合查询可能慢 | 首屏限制 top list，必要时新增只读 RPC 和索引 |
| 不同项目模板节点不同 | 甘特图按每个项目真实节点渲染，不强制统一列 |
| 老板手机端横向空间有限 | 甘特图放二级页，首屏只放摘要入口 |
| 缺少工序排期数据 | 节点显示 `unscheduled`，不在端上猜日期 |
| workflow runtime 缺失 | 显示“流程同步中”，不使用 legacy 阶段推导 |
| 金额敏感 | 后端权限控制，前端无权限不展示入口 |

## 验收清单

- [ ] 有 `dashboard.read` 的租户老板能打开小程序每日看板。
- [ ] 无权限员工看不到入口，直接请求接口返回 403。
- [ ] 首屏在 1 屏内能看到待处理、资金、项目、风险和施工动态摘要。
- [ ] 所有列表都有数量上限或分页。
- [ ] 甘特图节点名称来自后端，不在小程序写死固定阶段。
- [ ] 同一项目的甘特图当前节点与项目详情页当前 workflow 节点一致。
- [ ] 缺日志、延期、待验收能进入对应项目详情或任务页。
- [ ] 财务模块异常时，项目和施工动态仍能显示，并展示模块级提示。
- [ ] dev 环境 smoke 通过后再安排小程序发布。

## 后续文档

实现后建议补充：

- `docs/YYYY-MM-DD-tenant-owner-daily-dashboard-api.md`
- `docs/YYYY-MM-DD-tenant-owner-daily-dashboard-miniprogram-handoff.md`
- `docs/YYYY-MM-DD-tenant-owner-daily-dashboard-smoke.md`
