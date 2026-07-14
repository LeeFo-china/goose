# 项目运营风险中心设计

日期：2026-07-14

## 目标

为租户管理员和具备跨项目管理权限的角色提供统一的项目运营风险中心，通过单次数据库聚合 RPC 识别项目交付与客服风险，并在 Admin 中给出可核验事实、责任人和现有业务页面处理入口。

首版解决两个业务问题：

1. 装修公司负责人不再逐个打开项目、验收和工单页面寻找异常。
2. 风险事实可以由 AI 汇总为处理顺序，但 AI 不参与风险判定、状态修改或自动执行。

## 已确认决策

- 未来 90 天优先降低项目交付风险和客服响应成本。
- 首个独立子项目只建设项目健康事实层和 Admin 风险处置中心。
- 首版风险范围为交付与客服，不包含财务风险。
- 风险实时动态计算，用户跳转现有业务页面处理；底层事实恢复后自动关闭。
- 风险聚合采用数据库 RPC，不在 API 内并发拼接多个模块查询。
- 规则引擎判定风险，AI 只生成按需经营摘要。
- 页面仅供租户管理员和具备跨项目管理范围的角色使用。
- UI 实现后使用 `$impeccable audit` 作为发布门禁。

## 非目标

- 不修改 Orange 小程序。
- 不新增风险实例表、人工认领状态机、忽略原因或手工关闭动作。
- 不接入应收、预算、利润等财务风险。
- 不自动发送通知、调整计划、分配员工、推进工作流或关闭工单。
- 不建设延期预测、客诉预测或其他机器学习评分。
- 不引入 Redis、独立向量数据库、队列或 Agent 框架。
- 不重构现有项目、验收、客服和任务中心模块。

## 用户与权限

### 允许访问

租户侧用户必须同时满足：

- 具有 `dashboard.read`；
- 具有 `project.read`；
- `project.read` 的最终权限范围为 `all`。

该规则覆盖系统管理员以及被授予跨项目查看范围的管理角色。普通员工的 `project.read` 为 `self`、`assigned` 或 `department` 时，不显示导航入口，API 也返回 403。

### 权限执行位置

- Admin 导航根据权限 code 和 scope 隐藏“项目风险”入口。
- API Controller 重新校验权限，不信任前端导航状态。
- `tenant_id` 只从后端认证上下文取得，前端请求不允许指定其他租户。
- RPC 只授予 `service_role` 执行权限，不能由浏览器、匿名用户或普通 Supabase authenticated 用户直接调用。

## 总体架构

```text
Admin /project-health
  -> GET /project-health/risks
     -> Controller: tenant context + permission + query validation
     -> Service: call repository + map presentation and action links
     -> Repository: one RPC call
     -> public.get_project_operational_risk_page(...)
        -> normalize input
        -> tenant projects
        -> five risk CTEs
        -> UNION ALL / de-duplicate
        -> filter / summary / order / pagination
        -> one JSON payload

Admin on-demand AI summary
  -> POST /project-health/ai-summary
     -> same permission check
     -> server reloads top 20 high risks
     -> sanitize structured facts
     -> AiGateway scene project_operational_risk_summary
     -> validate structured AI output
     -> return read-only summary
```

风险事实、严重度、来源和关闭条件由 SQL 确定。API Service 只负责：

- 校验 RPC 返回结构；
- 把风险类型映射为中文标题和描述；
- 根据 `source_type` 和 `source_id` 生成现有 Admin 页面地址；
- 为 AI 摘要生成最小化、脱敏的上下文。

## 数据库 RPC

### 函数签名

```sql
public.get_project_operational_risk_page(
  p_tenant_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_risk_type text default null,
  p_severity text default null,
  p_keyword text default null,
  p_timezone_name text default 'Asia/Shanghai'
) returns jsonb
```

函数属性：

- `language sql`
- `stable`
- `security invoker`
- `set search_path = public`
- `p_page` 最小为 1；`p_page_size` 限制为 1–100。
- `p_risk_type` 和 `p_severity` 在 SQL 内再次按允许值归一化，不能绕过 API 传入任意筛选语义。

权限：

```sql
revoke all on function ... from public, anon, authenticated;
grant execute on function ... to service_role;
```

### 返回结构

RPC 始终返回一个 JSON 对象，即使没有风险：

```json
{
  "generated_at": "2026-07-14T10:00:00.000Z",
  "business_date": "2026-07-14",
  "summary": {
    "total": 8,
    "danger": 3,
    "warning": 5,
    "info": 0,
    "affected_projects": 4,
    "by_type": {
      "workflow_task_overdue": 1,
      "procedure_overdue": 2,
      "missing_project_log": 1,
      "acceptance_rework": 2,
      "service_ticket": 2
    }
  },
  "diagnostics": {
    "workflow_tasks_missing_due_at": 6
  },
  "items": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 8,
    "total_pages": 1
  }
}
```

`items` 中每一项包含：

```ts
type ProjectOperationalRiskFact = {
  risk_key: string;
  risk_type:
    | "workflow_task_overdue"
    | "procedure_overdue"
    | "missing_project_log"
    | "acceptance_rework"
    | "service_ticket";
  severity: "warning" | "danger";
  project_id: string;
  project_name: string;
  project_status: string;
  source_type:
    | "workflow_task"
    | "procedure_assignment"
    | "project_log_gap"
    | "project_acceptance"
    | "customer_service_ticket";
  source_id: string;
  assignee_employee_id: string | null;
  assignee_employee_name: string | null;
  occurred_at: string | null;
  due_at: string | null;
  overdue_days: number | null;
  evidence: Record<string, string | number | boolean | null>;
};
```

SQL 不返回客户电话、详细地址、项目图片或工单完整内容。

### 查询结构

RPC 使用下列 CTE 层级：

1. `normalized`：规范分页、筛选和时区。
2. `tenant_projects`：限定当前租户并排除 `invalid` 项目。
3. 五个独立风险 CTE：每个 CTE 返回相同列结构。
4. `risk_facts`：使用 `UNION ALL` 合并。
5. `deduplicated`：按稳定 `risk_key` 去重。
6. `filtered`：应用风险类型、严重度和项目关键词。
7. `summary`：计算总数、严重度、项目数和类型分布。
8. `paged`：先排序再 `offset/limit`。
9. 最终 `jsonb_build_object`：一次返回汇总、诊断、列表和分页。

## 风险规则

### 1. 工作流任务逾期

风险类型：`workflow_task_overdue`

触发条件：

- `workflow_tasks.status = 'pending'`；
- `workflow_tasks.due_at is not null`；
- `workflow_tasks.due_at < now()`；
- 关联 `workflow_instances.subject_type = 'project'`；
- 实例的 `subject_id` 对应当前租户项目。

严重度：

- 逾期不足 3 个自然日：`warning`；
- 逾期达到 3 个自然日：`danger`。

稳定键：`workflow_task_overdue:{task_id}`。

自动关闭：任务完成、取消、调整期限或不再满足条件。

`due_at` 为空的待办不猜测期限，不生成风险；数量写入 `diagnostics.workflow_tasks_missing_due_at`。

### 2. 施工工序延期

风险类型：`procedure_overdue`

触发条件：

- `project_procedure_assignments.status in ('planned', 'in_progress')`；
- `planned_end_date < business_date`。

严重度：

- 延期 1–2 个自然日：`warning`；
- 延期达到 3 个自然日：`danger`。

稳定键：`procedure_overdue:{assignment_id}`。

自动关闭：工序完成、取消、调整计划结束日或不再满足条件。

### 3. 施工日志缺失

风险类型：`missing_project_log`

触发条件：

- 项目状态为 `started` 或 `constructing`；
- 存在 `planned` 或 `in_progress` 工序，且 `planned_start_date <= business_date`；
- 当前业务时间已达到 18:00；
- 当天没有该项目的施工日志。

严重度：

- 当日 18:00 后缺失：`warning`；
- 当前工序已经开始至少 2 天，且最近一条日志为空或距当前超过 48 小时：`danger`。

稳定键：`missing_project_log:{project_id}:{business_date}`。

自动关闭：当天补充日志、项目离开施工状态、相关工序完成/取消或计划尚未开始。

同一项目同一天最多一条日志缺失风险，不因多个活动工序重复。

### 4. 验收整改

风险类型：`acceptance_rework`

触发条件：`project_acceptances.status = 'rejected'`。

严重度：统一为 `danger`。

稳定键：`acceptance_rework:{acceptance_id}`。

证据包含：验收类型、阶段编码、驳回来源、驳回时间和发起人，不返回大段驳回文本。

自动关闭：验收重新提交、确认完成或作废。

### 5. 高优先级客服工单

风险类型：`service_ticket`

触发条件：

- 工单关联项目；
- `status in ('open', 'in_progress')`；
- `priority in ('high', 'urgent')`。

严重度：

- `urgent`：`danger`；
- `high` 且创建时间超过 48 小时：`danger`；
- 其他 `high`：`warning`。

稳定键：`service_ticket:{ticket_id}`。

证据包含：工单编号、类别、优先级、状态和创建时间，不返回完整投诉内容。

自动关闭：工单状态变为 `resolved`、`closed` 或 `cancelled`。

### 统一排序

1. `danger` 在 `warning` 之前；
2. `overdue_days` 更大的优先；
3. `occurred_at` 更新的优先；
4. `risk_key` 作为稳定尾排序，保证分页不抖动。

## API 设计

### 风险列表

```http
GET /project-health/risks?page=1&pageSize=20&severity=danger&risk_type=procedure_overdue&keyword=项目名
```

查询规则：

- `page` 默认 1；
- `pageSize` 默认 20，最大 100；
- `severity` 允许 `warning`、`danger`；
- `risk_type` 允许五种首版类型；
- `keyword` 最大 100 个字符，匹配项目名称或完整项目 UUID。

Controller 只读取请求、校验、调用 Service 并通过 `ResponseHandler.success` 返回。数据库错误通过 `Errors.dbError()` 包装，禁止直接 `throw new Error()`。

Service 返回的列表项在风险事实基础上增加：

```ts
type ProjectOperationalRiskItem = ProjectOperationalRiskFact & {
  title: string;
  description: string;
  action: {
    label: string;
    href: string;
  };
};
```

跳转映射：

- 工作流任务：`/projects/{project_id}?tab=overview`
- 工序延期：`/projects/{project_id}?tab=overview`
- 日志缺失：`/projects/{project_id}?tab=logs`
- 验收整改：`/projects/{project_id}?tab=acceptances&acceptanceId={source_id}`
- 客服工单：`/customer-service?ticketId={source_id}`

跳转目标在 Service 内生成，不写入 SQL。

### AI 经营摘要

```http
POST /project-health/ai-summary
Content-Type: application/json

{
  "severity": null,
  "risk_type": null,
  "keyword": null
}
```

服务端重新读取第一页、每页 20 条的高风险事实，不接受客户端上传风险项。发送给模型的数据只包含：

- `risk_key`、风险类型和严重度；
- 项目名称；
- 逾期天数和结构化时间；
- 负责人姓名；
- 最小化证据字段。

不发送客户电话、详细地址、图片、工单全文或验收驳回全文。

AI 场景键：`project_operational_risk_summary`。

AI 输出契约：

```ts
type ProjectOperationalRiskAiSummary = {
  overview: string;
  priorities: Array<{
    risk_key: string;
    reason: string;
    recommended_action: string;
  }>;
  cautions: string[];
};
```

约束：

- `priorities` 最多 5 条；
- 返回的 `risk_key` 必须存在于本次输入，未知键被拒绝；
- 不得承诺工期、赔付、验收结果或责任归属；
- 只给处理建议，不调用业务 Service；
- 调用通过 `AiGateway` 记录租户、场景、模型、Token、耗时和错误。

AI 失败时只返回摘要模块错误，不改变风险列表响应和页面现有数据。

## Admin 信息架构

### 导航与路由

- 路由：`/project-health`
- 导航名称：`项目风险`
- 位置：租户“业务”导航组中“概览”之后
- 图标：使用 `lucide-react` 的风险/告警语义图标
- 菜单配置增加 scope 要求，只有 `project.read = all` 时展示

### 页面结构

页面使用现有 Next.js、shadcn/ui、Radix、Tailwind 和 lucide-react，不增加 UI 依赖。

```text
紧凑页面头部
  标题 / 生成时间                         刷新 / 生成 AI 经营摘要

四项 KPI
  风险总数 | 严重风险 | 受影响项目 | 高优先级工单

AI 摘要面板（按需出现，独立错误状态）

单一列表工作区 Card
  搜索 / 严重度 / 风险类型 / 重置
  固定表头 + 可滚动列表
  固定分页页脚
```

### 视觉规则

- 页面为工作台而非营销页，标题约 20px，不使用 Hero 排版。
- KPI 使用四个紧凑卡片，但不使用渐变、玻璃效果、巨大数字或装饰性阴影。
- Gooes 黄色只用于焦点、当前选择和主操作，不作为风险严重度通用颜色。
- `warning` 和 `danger` 同时使用语义 Badge、文字和图标，不能只依赖颜色。
- 列表只使用一个顶层 Card，不嵌套卡片。
- 筛选控件保持 36–40px 高度，项目关键词明确标注可搜索内容。
- 表格列：严重度、项目、风险事项、责任人、发生/逾期时间、证据摘要、操作。
- 数字和日期使用 `tabular-nums`；长项目名和证据摘要截断并提供可访问的完整信息。
- 行操作只保留一个“去处理”，使用现有 `Button` 或链接样式。

### 响应式

- 1440/1024：完整表格和四列 KPI。
- 768：KPI 两列，筛选换行，隐藏次要证据列。
- 390：KPI 两列或单列；风险列表允许受控水平滚动，不压缩中文到不可读宽度。
- 触摸目标不小于 44px；键盘焦点清晰可见。
- 页面级不产生普通浏览垂直滚动，列表区域在工作区 Card 内滚动。

### 状态设计

- 首次加载：使用 Skeleton 保留页面结构。
- 列表刷新：保留现有表格并降低透明度，显示局部加载状态。
- 空状态：保留筛选、表头和分页结构，说明当前筛选没有风险并提供重置。
- RPC 错误：使用标准 `StatusAlert`，不得显示为风险数 0。
- AI 加载和错误只影响 AI 面板。
- 快速切换筛选时使用 request ID 或 AbortController 丢弃过期响应。

## 性能与索引

### 性能目标

- Dev 数据库 RPC P95 小于 500ms。
- 完整列表 API P95 小于 1000ms。
- 单次 API 请求只调用一次风险聚合 RPC。
- AI 摘要最多读取并发送 20 条风险事实。

### 查询约束

- 每个风险 CTE 必须先限定 `tenant_id` 和状态。
- 使用 `UNION ALL`，不使用隐式全表去重。
- 列表在数据库内排序、过滤和分页，禁止全量返回后在 API 切片。
- 日志缺失使用现有 `(tenant_id, project_id, created_at desc)` 索引查最近日志。
- 工序使用现有 `(tenant_id, status, planned_end_date)` 索引。
- 验收、工作流任务和客服工单先用现有索引执行计划验证。
- 只有 `EXPLAIN ANALYZE` 显示顺序扫描或排序成为主要瓶颈时才新增复合索引。

可能需要评估但不预先强制新增的索引：

- `workflow_tasks(tenant_id, status, due_at)` where `status = 'pending'`；
- `customer_service_tickets(tenant_id, status, priority, created_at)` where status 为未完成；
- `project_acceptances(tenant_id, status, rejected_at)` where `status = 'rejected'`。

所有新增函数和索引必须在同一个或明确排序的 migration 中管理。

## 迁移与回滚

数据库变更通过 `supabase/migrations/` 完成，禁止手动在远端执行 DDL/DML。

Migration 至少包含：

- `get_project_operational_risk_page` 函数；
- 固定 `search_path`；
- execute 权限收紧；
- 经执行计划证明需要的索引；
- 函数和关键字段注释。

回滚方式：

- 删除 `get_project_operational_risk_page` 的准确签名；
- 删除仅为该 RPC 新增且确认无其他消费者的索引；
- 不删除或回写任何业务数据，因为首版不新增状态表。

应用前确认待执行 migration，应用后使用 `supabase migration list` 验证 Local/Remote 对齐。

## 错误处理与可观测性

Controller 记录：

- `tenant_id`、`employee_id`；
- page/pageSize 和非敏感筛选；
- `rpc_ms`、Service 总耗时和序列化耗时；
- 返回条数和风险总数；
- `requestId`。

当完整风险列表 API 超过 1000ms 时写入慢请求日志。日志不记录客户信息、项目地址或工单内容。

错误行为：

- 查询参数错误：400；
- 权限不足：403；
- RPC 或返回结构错误：由 `Errors.dbError()`/既有错误工厂映射为服务错误；
- AI 场景不可用：风险列表保持可用，AI 面板显示可重试错误；
- 不吞掉异常，不返回伪造的空列表。

## 测试与验收

### 数据库

使用可重复 SQL fixtures 覆盖：

- 五类风险各至少一条；
- 2/3 天严重度边界；
- high/urgent 工单边界；
- 日志 18:00 与 48 小时边界；
- `invalid` 项目排除；
- 两租户隔离；
- 相同来源去重；
- 类型、严重度和关键词筛选；
- page=1/pageSize=20 与最大 100；
- 底层状态更新后的自动关闭；
- 空结果仍返回完整 summary 和 pagination。

使用代表性 dev 数据执行 `EXPLAIN (ANALYZE, BUFFERS)`，记录主要节点、实际耗时和扫描行数。

### API

- Repository 测试 RPC 参数、结果校验和数据库错误包装。
- Service 测试五类中文展示、跳转映射、稳定排序和未知类型拒绝。
- Controller 测试 tenant 注入、`dashboard.read`、`project.read = all`、分页校验和错误响应。
- AI 测试服务端重新取数、最多 20 条、隐私字段不进入 prompt、未知 `risk_key` 被拒绝和独立降级。

### Admin

- 导航测试 `project.read = all` 显示，其他 scope 隐藏。
- 页面测试 URL 筛选、重置、分页、加载、空状态和错误状态。
- 验证 AI 不自动调用、重复点击受控、AI 失败不清空列表。
- 浏览器 smoke 覆盖 1440、1024、768、390 宽度、键盘导航和页面跳转。

### Impeccable UI 审核门禁

页面实现后运行 `$impeccable audit`。当前没有页面代码，因此设计阶段不虚构审核分数。

发布门槛：

- 可访问性、性能、主题一致性、响应式和反模式五项总分不低于 16/20；
- P0、P1 问题为 0；
- WCAG AA 对比度、标签、焦点、键盘操作和非颜色状态表达通过；
- 不出现嵌套卡片、渐变文字、玻璃效果、AI 紫色、营销 Hero 或装饰性动画；
- 修复后重新审核并保存评分与各断点截图。

## 试点与成功指标

发布顺序：

1. 本地 migration、SQL fixtures、API 和 Admin 验证；
2. 部署 dev，执行 migration 对齐与性能复测；
3. 选择 5 家租户、约 20 个活跃项目灰度试用；
4. 先验证风险正确性与使用行为，再决定是否接入财务风险和通知。

首轮试点目标假设：

- 风险事实抽样准确率不低于 95%；
- 页面打开后点击“去处理”或查看关联业务的比例达到 50%；
- 严重风险从首次出现到消失的中位时间可以被完整统计；
- RPC P95 小于 500ms，完整 API P95 小于 1000ms；
- AI 摘要不支持的项目事实回答为 0；
- AI 摘要失败不影响风险中心核心使用。

这些数值是试点假设，不作为客户 SLA。上线前先采集两周基线，再决定正式目标。

## 后续阶段

首版验证后按以下顺序评估：

1. 接入应收逾期、预算和利润等财务风险；
2. 增加风险通知和每日经营摘要，但仍由用户确认发送范围；
3. 建设客户项目问答 2.0；
4. 建设客服工单 AI 分类、证据摘要和回复草稿；
5. 数据量和标签稳定后再评估预测模型。
