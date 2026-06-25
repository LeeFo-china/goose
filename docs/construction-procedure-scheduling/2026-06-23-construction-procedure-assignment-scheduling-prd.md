# 施工工序派工与工期排程 PRD

日期：2026-06-23

## 1. 背景

当前项目施工 workflow 已收敛到 `timeline_nodes/display/attributes/actions`
契约，小程序和 Admin 都应只消费 workflow runtime 返回的节点属性和动作。现在施工
工序推进出现新的业务要求：开始每个工序前，需要明确谁施工、什么时候开工、预计做
几天，并且前端要在施工进度里展示这些运行时信息。

这不是单纯给施工日志补字段。施工日志可以有任意多条，不能承担“开始工序”或“推进
工序”的职责。新的业务边界应是：

```text
施工日志 = 当前工序的过程记录
开始工序 = workflow 当前节点的显式 start_procedure 非推进动作
完成工序 = workflow 当前节点的显式 complete_procedure 推进动作
节点展示 = 后端 timeline_nodes[].attributes/actions 的运行时投影
```

本 PRD 选择把工序派工动作升级为显式业务 action key。也就是说，工序节点新动作的
`action.key` 直接使用 `start_procedure`、`adjust_procedure_schedule`、
`complete_procedure`，端上提交时 `body.action` 也使用这些 key，不再沿用旧的
`key=complete + business_action=complete_procedure` 方式解释工序动作。

## 2. 目标

- 工序开始时必须指定施工人员、开工时间和工期天数。
- 施工人员候选人来自工程部，选择时能看到该员工是否正在其他项目施工。
- 正在其他项目施工的员工不能被选中；列表中可以展示其占用项目和剩余工期，帮助调度判断。
- 工期天数支持在 workflow 工序节点模板上配置默认值，也允许操作人员在开始工序时改写。
- 施工进度 timeline 展示每个工序的施工人员、开工时间、工期、预计结束时间和剩余/超期状态。
- 工序推进继续严格按 workflow 当前节点和当前 action 执行，小程序/Admin 不本地推导。
- 工序派工动作以 `action.key` 为唯一提交动作值，`business_action` 只作为业务归类和埋点辅助。

## 3. 非目标

- 不做自动派工算法。系统只提供候选人、占用状态和校验。
- 不支持一个工序多人并行施工。第一版只支持一个主施工人员，后续如需要可扩展班组。
- 不做复杂产能排班、节假日工期计算或小时级排期。第一版按自然日计算。
- 不允许端上根据旧施工阶段字段、节点名称或本地枚举推进 workflow。
- 不兼容工序节点旧的 `key=complete` 推进口径；后端、Admin、小程序需要同步切到显式 action key。

## 4. 业务评估与遗漏补充

### 4.1 推荐补齐的业务规则

1. 工序必须显式开始。
   - 当前节点如果是工序节点，默认先返回 `start_procedure`。
   - `start_procedure` 只创建/更新工序派工运行记录，不完成当前 workflow 节点，不流转到下一节点。
   - 未开始前不能创建该工序施工日志，或只能创建草稿型备注，不计入工序完成门禁。

2. 工序完成必须显式提交。
   - `complete_procedure` 是工序节点唯一推进动作。
   - `acceptance_enabled=false` 时，点击 `complete_procedure` 后后端校验施工日志和图片门禁，通过后推进到下一节点。
   - `acceptance_enabled=true` 时，点击 `complete_procedure` 后不能调用 runtime complete 直接进入下一工序。后端只创建/刷新验收动作并让当前工序节点保持受阻，验收闭环后再由后端受控推进。

3. 候选施工人员来自工程部。
   - 默认使用租户部门 `code=PROJECT` 的在职员工。
   - 员工还必须通过绑定的 active 角色具备稳定权限
     `project_procedure.assignee`；不要依赖租户自定义角色 code 或角色名称。
   - 后续可在节点属性中配置 `candidate_department_codes`，例如只允许工程部或安装部。

4. 员工占用以工序派工日期区间为准。
   - 员工在另一个项目存在 `planned` 或 `in_progress` 工序派工，且计划日期区间与本次开工日期和工期重叠，则视为占用。
   - 如果计划结束日期早于今天但仍未完成，显示为“已超期 N 天”，仍视为占用；占用有效结束日按未完成持续占用处理，直到该派工 `completed` 或 `canceled`。
   - 第一版不允许主管强制占用冲突员工；后续如需要可增加 `project_procedure.assign_override` 权限。

5. 工期按自然日。
   - `planned_end_date = planned_start_date + duration_days - 1`。
   - 剩余工期按租户时区当天与预计结束日期计算，最小显示 0 天；逾期显示超期天数。

6. 需要支持改派和延期。
   - 未完成工序可能因实际施工变化调整施工人员、开工日期或工期。
   - 第一版建议提供 `adjust_procedure_schedule` 动作，并保留审计记录。

### 4.2 需要产品确认的边界

- 是否允许同一员工在同一天参与多个不同项目的短工序。如果允许，需要从“整段占用”升级为“日期区间冲突”。
- 是否允许选择非工程部但具备特定角色/权限的员工。如果允许，候选来源需要支持角色和职位条件。
- 工序开始日期是否允许早于今天。建议允许补录，但必须记录操作时间和操作人。
- 施工人员离职、停用或被移出工程部后，已开始工序是否允许继续完成。建议允许运行中工序完成，但不能被新派工。
- 已运行 workflow 实例是否需要批量补齐默认工期。模板新配置不会自动改写已有实例，需要受控迁移或运行时兜底。

## 5. 推荐方案

### 5.1 核心模型

新增“工序派工运行记录”，不要只把这些信息塞进施工日志。

建议表：`project_procedure_assignments`

关键字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 派工记录 ID |
| `tenant_id` | 租户 ID |
| `project_id` | 项目 ID |
| `workflow_instance_id` | 当前施工 workflow 实例 |
| `workflow_instance_node_id` | 当前工序运行节点 |
| `node_key` | 工序节点 key |
| `stage_code` | 工序阶段编码 |
| `assignee_employee_id` | 施工人员 |
| `planned_start_date` | 计划开工日期 |
| `planned_duration_days` | 计划工期，自然日 |
| `planned_end_date` | 计划结束日期，可由服务端生成 |
| `status` | `planned`、`in_progress`、`completed`、`canceled` |
| `started_by_employee_id` | 开工操作人 |
| `started_at` | 开工操作时间 |
| `completed_by_employee_id` | 完工操作人 |
| `completed_at` | 完工操作时间 |
| `adjusted_by_employee_id` | 最近调整人 |
| `adjusted_at` | 最近调整时间 |
| `adjust_reason` | 调整原因 |

建议增加审计表：`project_procedure_assignment_logs`

| 字段 | 说明 |
| --- | --- |
| `id` | 日志 ID |
| `tenant_id` | 租户 ID |
| `assignment_id` | 派工记录 ID |
| `project_id` | 项目 ID |
| `workflow_instance_id` | workflow 实例 ID |
| `workflow_instance_node_id` | workflow 节点运行 ID |
| `action` | `start`、`adjust`、`complete`、`cancel` |
| `before_snapshot` | 调整前派工快照 |
| `after_snapshot` | 调整后派工快照 |
| `reason` | 操作原因 |
| `operator_employee_id` | 操作人 |
| `created_at` | 操作时间 |

如果第一版不建日志表，至少必须在每次改派/延期时取消旧派工并创建新派工，保留旧记录，不能只覆盖当前行导致历史丢失。

需要索引：

- `(tenant_id, assignee_employee_id, status, planned_start_date, planned_end_date)`
- `(tenant_id, project_id, workflow_instance_id, node_key)`
- `(tenant_id, status, planned_end_date)`

建议约束：

- 同一个 `workflow_instance_node_id` 同时只能有一条 `planned` 或 `in_progress` 派工。
- 同一员工在 `planned` 或 `in_progress` 派工中不能出现重叠日期区间；如果数据库层无法直接表达区间排他，必须在 service 事务内加锁校验。

状态解释：

- `planned`：计划开工日期晚于租户当天日期，尚未实际开始。
- `in_progress`：计划开工日期小于等于租户当天日期，且工序未完成/取消。
- `completed`：`complete_procedure` 成功后置为完成。
- `canceled`：流程取消、项目作废或受控改派废弃旧记录。

状态计算规则：

- 数据库存储 `status`，runtime 对外返回 `procedure_assignment_status` 时必须按租户时区计算有效状态。
- `status=planned` 且 `planned_start_date <= tenant_today` 时，runtime 对外返回 `in_progress`。
- 后端可以在读取或提交动作时顺手把到期开工记录落库更新为 `in_progress`，但端上不能依赖定时任务。
- 候选占用、施工日志门禁、`timeline_nodes[].actions` 都必须使用同一套有效状态计算，避免列表、详情、任务中心不一致。

施工日志限制：

- `planned` 状态只允许调整派工和排期，不允许创建正式施工日志。
- 只有 `in_progress` 状态允许创建当前工序正式施工日志。
- 如果允许补录历史日志，必须由后端按操作人权限、日志日期和派工日期区间校验，不能由小程序绕过。

数据库变更必须通过 `supabase/migrations/` 完成。

### 5.2 workflow 节点模板属性

工序节点模板新增配置项：

```json
{
  "require_log": true,
  "min_image_count": 3,
  "trigger_acceptance": false,
  "require_procedure_assignment": true,
  "default_duration_days": 3,
  "allow_duration_override": true,
  "candidate_department_codes": ["PROJECT"],
  "conflict_policy": "block_active_assignment"
}
```

说明：

| 字段 | 说明 |
| --- | --- |
| `require_procedure_assignment` | 是否要求开始工序时派工 |
| `default_duration_days` | 默认工期天数，必须为正整数 |
| `allow_duration_override` | 开始工序时是否允许修改工期 |
| `candidate_department_codes` | 候选施工人员部门，默认 `["PROJECT"]` |
| `project_procedure.assignee` | 员工可被派为工序施工人员的稳定权限点，由角色权限配置授予 |
| `conflict_policy` | 第一版固定 `block_active_assignment` |

第一版建议施工 workflow 的 `procedure` 节点默认强制派工，即
`require_procedure_assignment=true`。如果后续允许关闭派工，必须同时定义关闭后的
开始/完成规则，避免 Admin 配置制造新的流程分叉。

### 5.3 workflow 运行时动作

工序节点建议拆成三个显式动作：

| action | 触发条件 | 作用 |
| --- | --- | --- |
| `start_procedure` | 当前工序未开始 | 指定施工人员、开工时间和工期，创建派工记录 |
| `adjust_procedure_schedule` | 当前工序已开始且未完成 | 改派、调整日期或工期 |
| `complete_procedure` | 当前工序已开始 | 校验日志/图片/验收配置，通过后完成工序或进入验收 |

动作字段契约：

| 字段 | 要求 |
| --- | --- |
| `action.key` | 必须是 `start_procedure`、`adjust_procedure_schedule`、`complete_procedure` 等可提交动作 key |
| `business_domain` | 工序派工统一为 `project_procedure` |
| `business_action` | 可以与 `action.key` 相同，用于归类、埋点和兼容展示，不作为端上提交依据 |
| `task_id` | 必须返回当前 workflow task ID，端上提交时只使用该 task |

重要约束：

- `start_procedure` 和 `adjust_procedure_schedule` 可以继续使用端上的统一提交入口
  `POST /workflow-tasks/:taskId/complete`，但后端必须由 project workflow bridge
  截获处理，不能调用 workflow runtime 的 complete RPC。
- `start_procedure` 和 `adjust_procedure_schedule` 处理成功后，原 workflow task
  仍保持 `pending`，当前节点仍保持 `current`，只刷新 `timeline_nodes[].attributes`
  和可见 actions。
- 所有工序动作都必须按 `task_id + action.key + 当前 workflow node + 当前派工状态`
  做服务端校验。端上提交过期 action 时，后端返回 `WORKFLOW_ACTION_STALE`，提示刷新后重试。
- `start_procedure` 幂等规则：同一 task 已存在派工且 payload 完全一致时返回成功和当前 state；已存在派工但 payload 不一致时拒绝，要求使用 `adjust_procedure_schedule`。
- `adjust_procedure_schedule` 幂等规则：同一 task 重复提交相同调整返回成功；不同调整必须写审计记录。
- `complete_procedure` 幂等规则：如果当前节点已完成，重复提交返回当前 workflow state，不得重复推进下一节点或重复创建验收单。
- 只有满足推进条件的 `complete_procedure` 允许进入 runtime complete。
- `acceptance_enabled=true` 的 `complete_procedure` 不是直接推进动作；后端 bridge 需要先创建/刷新验收动作并保持当前节点受阻，验收闭环后再受控调用 runtime complete。
- 客户确认验收成功后由后端受控调用 runtime complete 推进当前工序节点，必须保证幂等，只允许同一验收闭环触发一次 workflow 推进。

运行时 action 派生规则：

| 派工/验收状态 | 返回 action | 说明 |
| --- | --- | --- |
| 没有派工记录 | `start_procedure` | 当前工序只能先派工 |
| `planned` 且计划开工日期晚于今天 | `adjust_procedure_schedule`，`complete_procedure` disabled | 可以调整排期，不能写日志或完成 |
| `in_progress`，未开启验收 | `adjust_procedure_schedule`、`complete_procedure` | 完成时校验日志/图片后推进 |
| `in_progress`，开启验收且未创建验收单 | `adjust_procedure_schedule`、`complete_procedure` | 完成时创建/刷新 `create_acceptance`，不推进下一节点 |
| 已创建验收单且未闭环 | `view_acceptance` 或 `edit_acceptance` | 当前工序保持受阻，等待验收流程 |
| 验收已闭环 | 后端受控推进，或返回可推进 action | 由后端保证只推进一次 |
| `completed` 或 `canceled` | 无工序操作 action | 节点只读展示 |

`start_procedure` 统一提交 payload 示例：

```json
{
  "action": "start_procedure",
  "reason": null,
  "output": {
    "assignee_employee_id": "employee-id",
    "planned_start_date": "2026-06-24",
    "planned_duration_days": 3
  }
}
```

`complete_procedure` 统一提交 payload 示例：

```json
{
  "action": "complete_procedure",
  "reason": null,
  "output": {}
}
```

`complete_procedure` 的日志数量、图片数量、验收状态必须由后端按当前项目、当前
workflow 节点、`stage_code` 和派工记录重新查询计算。端上可以上传
`project_log_ids/image_count` 作为辅助信息，但后端不能信任这些字段作为门禁依据。

## 6. 后端契约

### 6.1 项目 workflow state

继续使用现有入口：

```http
GET /projects/:projectId/employee-detail-bootstrap
GET /workflow-subjects/project/:projectId/state
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project
```

端上仍可以把所有 workflow 操作提交到：

```http
POST /workflow-tasks/:taskId/complete
```

但后端必须区分动作语义：

| action | 后端处理 | 是否推进 workflow |
| --- | --- | --- |
| `start_procedure` | bridge 创建/更新派工记录，刷新 subject state | 否 |
| `adjust_procedure_schedule` | bridge 调整派工记录，刷新 subject state | 否 |
| `complete_procedure`，未开启验收 | bridge 校验日志/图片门禁后调用 runtime complete | 是 |
| `complete_procedure`，开启验收 | bridge 创建/刷新验收动作，让当前节点保持受阻 | 否，验收闭环后再受控推进 |

这条约束必须写入后端实现和测试，避免误用现有 runtime complete RPC 导致“开始工序”
直接完成当前工序。

任务和动作刷新规则：

- `/workflow-tasks?status=pending`、`/workflow-subjects/project/:id/state`、
  `employee-detail-bootstrap` 必须使用同一套 action 派生逻辑。
- `start_procedure` 成功后，原 task 仍 pending，但后续响应不能再返回 `start_procedure`；
  应按派工有效状态返回 `adjust_procedure_schedule` 或 disabled 的 `complete_procedure`。
- 端上拿旧 action 提交时，后端必须返回 `409 WORKFLOW_ACTION_STALE`，不能静默按旧动作处理。
- 所有动作提交成功后都返回或可重新读取最新 `workflow_state.timeline_nodes/actions`，
  端上只刷新，不本地改 timeline。

工序节点 `timeline_nodes[].attributes` 需要新增运行时字段：

```json
{
  "stage_code": "plumbing_electrical",
  "require_log": true,
  "min_image_count": 3,
  "acceptance_enabled": false,
  "require_procedure_assignment": true,
  "default_duration_days": 3,
  "allow_duration_override": true,
  "procedure_assignment_id": "assignment-id",
  "procedure_assignment_status": "in_progress",
  "procedure_assignee_employee_id": "employee-id",
  "procedure_assignee_employee_name": "张三",
  "planned_start_date": "2026-06-24",
  "planned_duration_days": 3,
  "planned_end_date": "2026-06-26",
  "remaining_days": 2,
  "schedule_status": "on_track"
}
```

`schedule_status` 建议枚举：

- `not_started`
- `on_track`
- `due_today`
- `overdue`
- `completed`
- `canceled`

### 6.2 节点 action output_fields

后端返回 action 时，应把表单字段描述清楚，端上只渲染：

```json
{
  "key": "start_procedure",
  "label": "开始水电",
  "business_domain": "project_procedure",
  "business_action": "start_procedure",
  "task_id": "workflow-task-id",
  "node_key": "procedure_plumbing_electrical",
  "stage_code": "plumbing_electrical",
  "disabled": false,
  "output_fields": [
    {
      "name": "assignee_employee_id",
      "label": "施工人员",
      "type": "employee",
      "required": true,
      "source": "procedure_candidate"
    },
    {
      "name": "planned_start_date",
      "label": "开工时间",
      "type": "date",
      "required": true
    },
    {
      "name": "planned_duration_days",
      "label": "工期天数",
      "type": "number",
      "required": true,
      "default_value": 3,
      "min": 1
    }
  ]
}
```

后端需要扩展 workflow action metadata：

- `business_domain` 增加 `project_procedure`。
- 工序派工动作的 `action.key` 必须直接使用业务动作 key；不要返回 `key=complete` 再要求端上读取 `business_action`。
- `business_action` 建议与 `action.key` 保持一致，例如 `start_procedure`、`adjust_procedure_schedule`、`complete_procedure`。
- `output_fields[].source` 支持 `procedure_candidate`，用于提示端上调用工序候选人员接口。
- `output_fields[].default_value/min/max` 作为端上表单默认值和基础输入约束，最终仍由后端校验。

### 6.3 施工人员候选接口

建议新增：

```http
GET /projects/:projectId/procedure-candidates
  ?task_id=workflow-task-id
  &node_key=procedure_plumbing_electrical
  &stage_code=plumbing_electrical
  &planned_start_date=2026-06-24
  &planned_duration_days=3
  &page=1
  &pageSize=20
  &keyword=张
```

响应：

```json
{
  "list": [
    {
      "employee_id": "employee-id",
      "employee_name": "张三",
      "avatar": null,
      "department_name": "工程部",
      "post_name": "水电工",
      "availability": {
        "status": "available",
        "disabled": false,
        "label": "可派工",
        "occupied_project_id": null,
        "occupied_project_name": null,
        "occupied_node_key": null,
        "occupied_node_title": null,
        "planned_end_date": null,
        "remaining_days": null
      }
    },
    {
      "employee_id": "employee-busy-id",
      "employee_name": "李四",
      "avatar": null,
      "department_name": "工程部",
      "post_name": "木工",
      "availability": {
        "status": "busy",
        "disabled": true,
        "label": "正在项目 A 木工，剩余 2 天",
        "occupied_project_id": "project-id",
        "occupied_project_name": "项目 A",
        "occupied_node_key": "procedure_carpentry",
        "occupied_node_title": "木工",
        "planned_end_date": "2026-06-25",
        "remaining_days": 2
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

接口要求：

- 必须分页，`pageSize` 最大 100。
- 后端负责工程部过滤、员工状态过滤、租户隔离和占用计算。
- 后端必须校验当前操作人对当前项目和当前 workflow task 有派工资格，通常需要
  `project_procedure.assign` 或 `project_procedure.adjust`。
- 优先使用 `task_id` 校验当前 workflow 实例和当前节点；`node_key/stage_code` 只作为展示和兼容参数。
- 小程序/Admin 不本地计算占用状态。
- 如果 `planned_start_date` 或 `planned_duration_days` 变化，端上重新请求候选接口。
- 占用计算必须按 `[planned_start_date, planned_end_date]` 日期区间重叠判断，覆盖 `planned` 和 `in_progress` 派工。
- 返回占用项目信息时必须按当前操作人的项目可见范围脱敏。无权查看占用项目时，
  `occupied_project_id/name` 返回 `null`，`label` 只显示“正在其他项目施工，剩余 N 天”，避免泄露其他项目名称。

### 6.4 错误码建议

| code | 场景 | 前端提示 |
| --- | --- | --- |
| `PROCEDURE_ASSIGNMENT_REQUIRED` | 未派工就完成/写日志 | 请先开始当前工序并指定施工人员 |
| `PROCEDURE_ASSIGNEE_BUSY` | 员工被其他项目占用 | 该员工正在其他项目施工，请选择其他施工人员 |
| `PROCEDURE_ASSIGNEE_NOT_ELIGIBLE` | 非工程部/非在职/非当前租户 | 该员工不能被派到当前工序 |
| `PROCEDURE_SCHEDULE_INVALID` | 日期或工期非法 | 请检查开工时间和工期 |
| `PROCEDURE_NOT_IN_PROGRESS` | 工序仍是 `planned`，不能写日志或完成 | 当前工序尚未到开工时间 |
| `PROCEDURE_ACCEPTANCE_PENDING` | 工序验收未闭环，不能进入下一工序 | 请先完成当前工序验收 |
| `WORKFLOW_ACTION_STALE` | 提交的 task/action 已不是当前可执行动作 | 当前流程状态已变化，请刷新后重试 |
| `WORKFLOW_NODE_NOT_CURRENT` | 节点不是当前节点 | 当前流程节点已变化，请刷新后重试 |
| `PROCEDURE_LOG_REQUIRED` | 完成工序缺少日志 | 请先补充施工日志 |

## 6.5 施工日志权限和门禁

施工日志创建仍使用现有接口：

```http
POST /project-logs
```

但后端需要把当前工序派工纳入可写判断：

- 当前工序未 `start_procedure` 成功时，默认不允许创建该工序正式施工日志。
- 写施工日志时，`stage_code/stage_label` 必须来自当前 workflow node 和当前派工记录，
  不能从旧 `construction_stages.current_stage`、第一个可写 stage、项目旧状态或本地枚举回退。
- 工序施工人员本人可以写当前工序日志。
- 工程负责人、监理或具备 `project_log.create` 且对项目有可见范围的员工可以写当前工序日志。
- 非当前工序、非当前项目、非当前租户的日志必须拒绝。
- 施工日志创建成功只落日志，不推进 workflow，不创建验收单。

`complete_procedure` 门禁必须由后端重新查询：

- 当前项目、当前 workflow instance、当前 node_key/stage_code。
- 当前派工记录是否存在且未取消。
- 当前工序是否满足 `require_log/min_image_count`。
- 当前工序如开启验收，验收状态是否满足当前节点推进要求。

端上传的 `project_log_ids`、`image_count` 只能作为日志或诊断信息，不可作为最终校验依据。

## 7. 小程序端对接

小程序继续保持 workflow v2 口径：

- 流程顺序只读 `timeline_nodes[]`。
- 节点展示只读 `node.display`。
- 节点能力只读 `node.attributes`。
- 交互只读 `node.actions[]`、`workflow_state.actions[]` 或 `/workflow-tasks[].actions[]`。

需要改造的位置，按 orange 只读核查结果：

| 模块 | 对接点 |
| --- | --- |
| `src/packageProjects/pages/detail/*` | 施工进度 timeline 展示施工人员、开工时间、工期、剩余/超期状态 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` | 识别 `start_procedure`、`adjust_procedure_schedule`、`complete_procedure` action |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts` | start/adjust/complete 统一走 `POST /workflow-tasks/:taskId/complete` |
| `src/services/workflow_task.ts` | 通用 complete 封装必须提交后端返回的 `action.key`，不能把工序动作改写成 `complete` |
| `src/services/project_log.ts` | 施工日志创建仍只调用 `POST /project-logs`，不推进 workflow |
| 项目日志编辑页 | 只能按后端 `log_entry` 和当前节点属性判断是否可写 |

### 7.1 详情页展示

每个工序节点建议展示：

```text
水电
当前 / 已完成 / 待处理
施工人员：张三
开工：2026-06-24
工期：3 天
预计完工：2026-06-26
剩余：2 天 / 今日到期 / 已超期 1 天
```

如果未开始：

```text
施工人员：未指定
计划：待安排
```

### 7.2 开始工序交互

当节点 action 为 `start_procedure`：

1. 打开“开始工序”弹层或页面。
2. 默认填入后端 `output_fields[].default_value` 中的工期。
3. 选择开工日期和工期后，请求候选施工人员接口。
4. 候选列表展示可派工/占用状态，占用员工置灰不可选。
5. 提交 `POST /workflow-tasks/:taskId/complete`。
   - `body.action` 必须等于后端返回的 `action.key=start_procedure`。
6. 后端 bridge 只创建/更新派工记录，不推进 workflow。
7. 成功后刷新 `employee-detail-bootstrap` 或 subject state，按刷新后的 actions 展示调整或完成工序。

如果刷新后 `procedure_assignment_status=planned`，小程序只展示“待开工”和
`adjust_procedure_schedule`，不展示写施工日志或完成工序入口。到达开工日期后由后端
返回 `in_progress`、日志入口和 `complete_procedure`。

### 7.3 完成工序交互

当节点 action 为 `complete_procedure`：

1. 小程序不自动推进。
2. 用户点击完成工序。
   - `body.action` 必须等于后端返回的 `action.key=complete_procedure`。
3. 后端校验当前工序日志、图片数量、验收配置和流程节点。
4. 成功后刷新详情。
5. 如果后端返回验收 action，小程序展示发起/编辑/查看验收入口。

如果当前节点 `acceptance_enabled=true`，`complete_procedure` 成功不代表已经进入下一
工序。小程序应以刷新后的 `timeline_nodes/actions` 为准：看到验收 action 就展示验收
入口，看到当前节点仍为 current/blocked 就继续停留当前工序。

## 8. Admin 端对接

### 8.1 流程编排页

工序节点属性面板新增：

- 是否要求开始工序派工：`require_procedure_assignment`
- 默认工期天数：`default_duration_days`
- 是否允许开始时修改工期：`allow_duration_override`
- 候选部门：`candidate_department_codes`，默认工程部
- 冲突策略：第一版固定显示“占用中不可选择”
- 完成后触发阶段验收：模板字段保存为 `trigger_acceptance`，runtime 只读投影为
  `attributes.acceptance_enabled`。Admin 不允许同时写两个字段。

提示文案建议：

```text
这些配置只会随发布版本进入新的 workflow 实例。已运行实例不会自动同步，需要受控迁移。
```

### 8.2 项目详情页

项目 workflow 面板需要展示：

- 当前工序施工人员、开工日期、工期、预计完工、剩余/超期。
- 当前节点可执行的 `start_procedure`、`adjust_procedure_schedule`、`complete_procedure`。
- 点击开始/调整时，使用同一候选人员接口。

### 8.3 员工管理/项目人员

员工管理页不需要新增主流程能力，但需要保证工程部、职位、角色信息准确。项目成员仍可保留
工程负责人、监理、设计师等角色；工序施工人员是工序级派工，不等同于项目成员。

## 9. 权限建议

新增或复用权限时建议分清职责：

| 权限 | 用途 |
| --- | --- |
| `project_procedure.read` | 查看工序派工和排期 |
| `project_procedure.assign` | 开始工序、指定施工人员 |
| `project_procedure.adjust` | 改派、延期 |
| `project_procedure.complete` | 完成工序 |
| `project_log.create` | 创建施工日志 |

施工人员本人是否可以完成工序需要业务确认。建议第一版允许工程负责人/监理完成，施工人员只负责写日志和上传图片。

## 10. 运行实例与模板版本

workflow 模板发布后才影响新实例。已运行实例有自己的节点快照：

- 新增 `default_duration_days` 等模板属性，不会静默覆盖已运行实例。
- 如果要让历史运行实例使用新属性，需要受控迁移或运行时兜底。
- PRD 推荐后端对缺失 `default_duration_days` 的历史工序节点返回“未配置默认工期”，由开始工序表单要求操作人输入工期。
- 不建议自动兜底为 1 天，否则历史实例容易被错误标记为超期。

## 11. 验收标准

### 11.1 后端

- 工序节点未开始时，项目详情返回 `start_procedure` action。
- 开始工序后，timeline 当前节点展示施工人员、开工时间、工期、预计结束和剩余天数。
- 忙碌员工在候选接口中置灰，返回占用项目和剩余工期。
- 无权查看占用项目时，候选接口脱敏占用项目名称和 ID，只展示通用占用文案。
- 选择忙碌员工提交 start 时，后端返回 `PROCEDURE_ASSIGNEE_BUSY`。
- 创建施工日志不会推进 workflow。
- 施工日志 stage 只来自当前 workflow node + 当前派工记录，不再从旧 `construction_stages` 回退。
- 工序动作 `action.key` 直接返回 `start_procedure`、`adjust_procedure_schedule`、`complete_procedure`。
- 旧 action 提交返回 `WORKFLOW_ACTION_STALE`，不会静默执行。
- `start_procedure` 成功后当前 workflow 节点不变，`start_procedure` action 消失，按派工状态返回 `adjust_procedure_schedule`/`complete_procedure`。
- `planned` 状态不能创建正式施工日志，也不能完成工序。
- `acceptance_enabled=false` 时，只有点击 `complete_procedure` 才推进下一工序。
- `acceptance_enabled=true` 时，点击 `complete_procedure` 只创建/刷新验收动作，不推进下一节点；验收闭环后再进入下一节点。

### 11.2 小程序

- 不再把施工日志提交成功视为工序完成。
- 提交工序动作时使用后端返回的 `action.key`，不把工序动作重写成 `complete`。
- 开始工序表单从 action/output_fields 和候选接口渲染。
- 工序 timeline 展示施工人员和排期信息。
- 候选员工占用状态展示清晰，占用员工不可选。
- `planned` 状态只展示待开工和调整排期，不展示写施工日志或完成工序。
- `complete_procedure` 后刷新详情，不本地推进 timeline。

### 11.3 Admin

- 流程编排页能配置工序默认工期和派工要求。
- 项目详情能查看和操作当前工序派工。
- 已发布版本和运行实例关系有明确提示，不误导用户认为修改模板会自动影响旧实例。

## 12. 分阶段建议

### Phase 1：后端契约和数据模型

- 新增派工表和索引 migration。
- 新增候选员工接口。
- 扩展 workflow action metadata，`action.key` 返回 `start_procedure`、`adjust_procedure_schedule`、`complete_procedure`。
- timeline attributes 投影派工和工期。

### Phase 2：Admin 配置与项目详情

- 工序节点配置面板新增默认工期和派工配置。
- 项目详情 workflow 面板展示和操作派工。

### Phase 3：小程序对接

- 项目详情 timeline 展示派工/排期信息。
- 开始工序表单和候选员工列表。
- 完成工序按钮只来自后端 action。

### Phase 4：端到端 smoke

- 标准施工流程：确认开工 -> 拆改派工 -> 写日志 -> 完成拆改 -> 水电派工。
- 占用校验：同一员工在未完成工序中不能被另一个项目选中。
- 延期/改派：调整后 timeline 和候选占用状态同步变化。
- 验收分支：`acceptance_enabled=true` 的工序完成后进入验收动作。

## 13. 给小程序团队的对接摘要

可以这样同步给 orange：

```text
后端准备把施工工序改成显式派工和排期模型。小程序仍按 workflow v2 口径消费：

1. 工序开始、调整、完成都只来自 node.actions / workflow_state.actions / workflow-tasks.actions。
2. 工序动作提交时 body.action 直接使用后端返回的 action.key：
   start_procedure / adjust_procedure_schedule / complete_procedure。
3. 不再把工序 action 改写成 complete，也不再从 business_action 反推提交 action。
4. 施工日志只负责记录，不再推进 workflow。
5. 工序节点 attributes 会新增施工人员、开工日期、工期、预计完工、剩余/超期状态。
6. start_procedure 时，小程序按 output_fields 渲染开工表单，并调用后端候选员工接口选择工程部施工人员。
7. 候选员工由后端返回可用/占用状态，占用员工置灰不可选，展示“正在某项目某工序，剩余 N 天”。
8. complete_procedure 成功后必须刷新项目详情或 subject state，不本地推进 timeline。

等后端接口和字段落地后，orange 需要改项目详情 timeline、工序动作提交、开始工序弹层和候选员工选择 UI。
```

## 14. 给 Admin 团队的对接摘要

可以这样同步给 Admin：

```text
Admin 侧需要两块对接：

1. 流程编排页工序节点属性：
   - require_procedure_assignment
   - default_duration_days
   - allow_duration_override
   - candidate_department_codes
   - conflict_policy=block_active_assignment
   - trigger_acceptance，runtime 展示为 acceptance_enabled

2. 项目详情 workflow 面板：
   - 展示 timeline_nodes[].attributes 中的施工人员、开工日期、工期、预计完工、剩余/超期状态。
   - 有 start_procedure / adjust_procedure_schedule / complete_procedure action 时展示按钮。
   - 提交工序动作时 body.action 直接使用 action.key，不改写成 complete。
   - 开始/调整工序时调用候选员工接口，不在前端本地判断员工是否占用。

注意：模板发布后只影响新实例，已运行实例不会自动同步新节点属性。页面需要继续提示版本和运行实例边界。
```
