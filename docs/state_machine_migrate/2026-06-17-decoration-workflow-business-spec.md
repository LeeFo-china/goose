# 装修业务 workflow 规范

日期：2026-06-17

## 结论

装修业务 workflow 应拆成三条标准业务轨道：

1. 客户设计 workflow
2. 项目签约 workflow
3. 施工 workflow

租户公司可以基于模板自由配置节点名称、负责人、权限、财务门槛、日志要求、
验收要求和通知规则，但不能破坏标准业务轨道的主顺序和节点语义。

`项目暂停`、`作废` 是异常状态动作，不应作为标准主链路节点放在模板中。
它们应由项目状态动作或异常处理入口触发，记录原因、操作者和恢复来源，不应
改变模板定义里的主线顺序。

财务收款节点可以插入主线之间，但它是流程门禁节点，不是项目主状态节点。
例如项目签约 workflow 可配置为：

```text
开始 -> 设计中 -> 方案确认 -> 收定金 -> 项目签约 -> 设计定稿 -> 排期开工 -> 结束
```

其中 `收定金` 的语义是 `payment_collection`，确认收款后才放行到下一主状态。

## 立项时实现差异

本节记录 PRD 落地前识别出的代码差异，用于解释后续改造来源。当前实现状态以
“2026-06-17 对接实现记录”和“当前验收矩阵”为准。

PRD 落地前，代码与目标规范存在这些差异：

- `customer_main` 当前仍包含 `signed` 节点，应调整为到 `designing` 后结束。
- `construction_main` 当前混合了承接设计、签约、开工、施工、验收全流程。
- `construction_main` 当前把 `on_hold`、`invalid` 作为图节点和异常分支。
- 后端发布校验主要校验图结构，不校验某类 workflow 的业务主顺序。
- Admin 节点库是通用节点能力，缺少按 workflow 类型过滤可选节点和业务类型。

相关代码位置：

- `apps/api/src/services/workflow-templates.ts`
- `apps/api/src/services/workflow-publish-graph.ts`
- `apps/api/src/services/workflow-task-action-metadata.ts`
- `apps/admin/components/workflows/workflow-node-capabilities.ts`
- `apps/admin/components/workflows/workflow-business-flow-options.ts`
- `apps/admin/components/workflows/workflow-finance-node-options.ts`

## 基本概念

### 主状态节点

主状态节点决定业务对象的核心状态推进。主状态节点必须按模板顺序推进，不能
跳跃、反向推进或被其他节点替代。

主状态节点示例：

- 客户设计：客户线索、跟进、到店、设计。
- 项目签约：设计中、方案确认、项目签约、设计定稿、排期开工。
- 施工：确认开工、拆改、水电、瓦工、木工、油工、安装、竣工验收、交房。

### 门禁节点

门禁节点插在两个主状态节点之间，用来完成放行条件。门禁节点可以由租户按
业务需要配置，但只能位于允许插入的位置。

门禁节点示例：

- 财务收款：收定金、中期款、尾款。
- 审批确认：方案审批、合同审批、材料审批。
- 通知：客户通知、内部待办通知。
- 施工资料要求：施工日志、图片数量、验收资料。

门禁节点完成后推进到下一个主状态节点，不应把业务对象改成新的主状态。

### 异常动作

异常动作不属于模板主顺序。它可以暂停或终止当前业务对象，但不能变成主链路
节点。

异常动作示例：

- `pause_project`：暂停项目。
- `resume_project`：恢复项目。
- `mark_invalid`：作废客户或作废项目。
- `mark_dormant`：客户沉睡。
- `reactivate`：客户重新激活。

异常动作需要记录：

- 原状态。
- 目标状态。
- 原 workflow 实例和当前节点。
- 操作人。
- 原因。
- 是否允许恢复。
- 恢复后回到哪个节点或是否需要重建 workflow 实例。

## 三条标准流程

### 1. 客户设计 workflow

目标：管理客户从线索到设计的前置转化，不承担项目签约。

标准主线：

```text
开始 -> 客户线索 -> 跟进 -> 到店 -> 设计 -> 结束
```

建议定义：

| 节点 | node_key | node_type | business_kind | subject_type | 状态副作用 |
| --- | --- | --- | --- | --- | --- |
| 开始 | `start` | `start` | null | `customer` | 无 |
| 客户线索 | `potential` | `business` | `customer_lead` | `customer` | `potential` |
| 跟进 | `following` | `business` | `phone_follow_up` | `customer` | `following` |
| 到店 | `arrived` | `business` | `store_visit` | `customer` | `arrived` |
| 设计 | `designing` | `business` | `design` | `customer` | `designing`，可创建项目 |
| 结束 | `end` | `end` | null | `customer` | 客户设计 workflow 完成 |

允许插入：

- 通知节点。
- 客户资料补齐节点。
- 设计前审批节点。

禁止插入：

- 项目签约节点。
- 项目施工节点。
- 项目暂停节点。
- 项目作废节点。
- 财务收款节点，除非后续产品明确支持客户阶段收预约金。

### 2. 项目签约 workflow

目标：管理由设计项目进入合同签约和开工准备的流程。

标准主线：

```text
开始 -> 设计中 -> 方案确认 -> 项目签约 -> 设计定稿 -> 排期开工 -> 结束
```

建议定义：

| 节点 | node_key | node_type | business_kind | subject_type | 状态副作用 |
| --- | --- | --- | --- | --- | --- |
| 开始 | `start` | `start` | null | `project` | 无 |
| 设计中 | `designing` | `business` | `design` | `project` | `designing` |
| 方案确认 | `proposal_confirmed` | `business` | `design` | `project` | `proposal_confirmed` |
| 项目签约 | `signed` | `business` | `contract` | `project` | `signed`，要求签约金额 |
| 设计定稿 | `design_finalized` | `business` | `design` | `project` | `design_finalized` |
| 排期开工 | `pending_start` | `business` | `construction_start` | `project` | `pending_start` |
| 结束 | `end` | `end` | null | `project` | 项目签约 workflow 完成 |

允许插入：

- `payment_collection` 财务收款节点，例如收定金。
- 合同审批节点。
- 图纸审批节点。
- 客户确认通知节点。

财务节点插入规则：

| 场景 | 推荐位置 | payment_type | 说明 |
| --- | --- | --- | --- |
| 收定金 | 方案确认之后，项目签约之前 | `deposit` | 未确认收款不得进入项目签约 |
| 签约款比例门槛 | 项目签约之后，设计定稿之前 | `stage_1` | 适合按签约金额比例放行 |
| 开工前款项 | 设计定稿之后，排期开工之前 | `stage_1` | 未确认不得排期开工 |

财务节点建议字段：

- `node_type = confirmation`
- `business_kind = payment_collection`
- `config.finance_type = payment_collection`
- `config.payment_type = deposit | stage_1 | stage_2 | stage_3 | add_on`
- `config.requirement_mode = any_confirmed | signed_amount_percentage`
- `config.required_percentage`
- `config.min_amount`
- `config.finance_reviewer_employee_id`
- `config.required_permissions = ["finance.payment.confirm"]`

禁止插入：

- 施工工序节点。
- 竣工验收节点。
- 交房节点。
- 项目暂停/作废作为主链路节点。

### 3. 施工 workflow

目标：管理项目从确认开工到交房的施工履约流程。

标准主线：

```text
开始 -> 确认开工 -> 拆改 -> 水电 -> 中期收款 -> 瓦工 -> 木工 -> 中期收款 -> 油工 -> 安装 -> 竣工验收 -> 交房 -> 结束
```

其中 `中期收款` 是模板推荐的财务门禁节点，不是施工主状态节点。租户可以保留、
删除或改名这些收款节点，也可以用自己的 node_key 插入同类 `payment_collection`
门禁；发布校验必须保证施工工序和验收/交房主顺序不被破坏。

建议定义：

| 节点 | node_key | node_type | business_kind | subject_type | 状态副作用 |
| --- | --- | --- | --- | --- | --- |
| 开始 | `start` | `start` | null | `project` | 无 |
| 确认开工 | `started` | `business` 或 `construction_stage` | `construction_start` | `project` | `started` |
| 拆改 | `procedure_demolition` | `procedure` | `procedure_template` | `project` | 工序推进 |
| 水电 | `procedure_plumbing_electrical` | `procedure` | `procedure_template` | `project` | 工序推进 |
| 中期收款 | `payment_stage_2` | `confirmation` | `payment_collection` | `project` | 财务入账后放行 |
| 瓦工 | `procedure_tiling` | `procedure` | `procedure_template` | `project` | 工序推进 |
| 木工 | `procedure_woodwork` | `procedure` | `procedure_template` | `project` | 工序推进 |
| 中期收款 | `payment_stage_3` | `confirmation` | `payment_collection` | `project` | 财务入账后放行 |
| 油工 | `procedure_painting` | `procedure` | `procedure_template` | `project` | 工序推进 |
| 安装 | `procedure_installation` | `procedure` | `procedure_template` | `project` | 工序推进 |
| 竣工验收 | `final_acceptance` | `construction_stage` 或 `business` | `final_acceptance` | `project` | `acceptance` |
| 交房 | `handover` | `confirmation` 或 `business` | `final_acceptance` | `project` | 交付完成 |
| 结束 | `end` | `end` | null | `project` | 施工 workflow 完成 |

允许插入：

- 财务收款节点。
- 施工日志要求。
- 图片数量要求。
- 阶段验收节点。
- 客户确认节点。
- 内部审批节点。
- 通知节点。

禁止插入：

- 客户线索、跟进、到店节点。
- 项目签约前置节点。
- 项目暂停/作废作为主链路节点。

## 执行顺序约束

运行时必须遵守以下规则：

1. 只能完成当前 pending task 对应的当前节点。
2. 不能由前端直接指定下一个节点。
3. 下一个节点只能由已发布 workflow 版本的边和条件决定。
4. 主状态节点不能被跳过。
5. 门禁节点只能在完成自身业务要求后放行。
6. 异常动作不能改写模板主线。
7. `workflow_state.actions` 是前端展示按钮和提交动作的唯一来源。
8. 前端提交 `POST /workflow-tasks/:taskId/complete` 时，body 的
   `action` 必须使用后端返回的 `actions[].key`。

后端 `complete_workflow_instance_node` 已有当前节点校验，后续代码改造应继续复用
该运行时模型，不应新增绕过 runtime 的状态推进入口。

施工工序节点还必须遵守节点配置里的运行时门禁：

- 当 `config.require_log = true` 时，complete output 必须包含 `project_log_id`
  或 `log_id`，也可以由后端业务桥接确认后传 `require_log_verified = true`。
- 当 `config.min_image_count > 0` 时，complete output 必须通过 `image_count`、
  `images` 或 `image_urls` 证明图片数量满足节点要求。
- 校验失败时后端返回 `WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED`，前端应保留已填内容，
  刷新任务和 workflow state 后让施工人员补齐资料再提交。

## Admin 校验规范

Admin 侧需要做两层限制。

### 节点库过滤

Admin 节点库应按 workflow 类型展示可选节点能力：

| workflow | 允许能力 |
| --- | --- |
| 客户设计 | 开始、结束、业务流转、通知、审批 |
| 项目签约 | 开始、结束、业务流转、财务、通知、审批 |
| 施工 | 开始、结束、施工阶段、工序、财务、通知、审批 |

客户设计 workflow 不应展示施工工序、财务收款、项目暂停、项目作废。

项目签约 workflow 不应展示施工工序和竣工交付节点。

施工 workflow 不应展示客户线索、跟进、到店等客户节点。

### 发布校验

后端发布前必须校验：

1. workflow key 或 category 能识别业务轨道。
2. 主状态节点集合合法。
3. 主状态节点拓扑顺序合法。
4. 每个主状态节点最多在合法位置出现一次。
5. 门禁节点只插在允许区间。
6. 财务收款节点必须有合法 `payment_type`、收款确认人或确认权限。
7. 工序节点必须有合法 `stage_key`。
8. `pause_project`、`mark_invalid` 不允许作为标准模板节点。
9. 对不符合业务轨道的草稿，禁止发布，不影响保存草稿。

建议错误提示：

- `客户设计流程不能包含项目签约节点`
- `项目签约流程不能包含施工工序节点`
- `施工流程不能包含客户跟进节点`
- `项目暂停/作废是异常动作，不能作为主流程节点发布`
- `收款节点必须配置收款类型和财务确认人`

## 小程序 actions 对接

小程序端应继续以 `workflow_state.actions` 和 `/workflow-tasks` 为准。

### 读取当前动作

优先入口：

```http
GET /customers/:id
GET /customers/:id/detail
GET /projects/:projectId/employee-detail-bootstrap
GET /workflow-subjects/:subjectType/:subjectId/state
```

兜底任务入口：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project&subject_id=:projectId
```

### 完成任务

```http
POST /workflow-tasks/:taskId/complete
Content-Type: application/json

{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

`action` 必须取 `workflow_state.actions[].key`，不能使用本地硬编码的业务动作替代。

### 项目签约动作

项目签约 workflow 主状态节点 actions：

| 当前节点 | business_domain | business_action | output |
| --- | --- | --- | --- |
| `designing` | `workflow_project` | `designing` | `{}` |
| `proposal_confirmed` | `workflow_project` | `proposal_confirmed` | `{ "signed_amount": number }` |
| `signed` | `workflow_project` | `signed` | `{}` |
| `design_finalized` | `workflow_project` | `design_finalized` | `{ "start_date": "YYYY-MM-DD", "construction_manager_employee_id": uuid }` |
| `pending_start` | `workflow_project` | `pending_start` | `{}` |

### 财务收款动作

当 action 满足以下任一条件时，小程序应展示收款确认：

- `business_domain = payment_collection`
- `business_action = confirm_payment`
- `output_fields` 中存在 `type = payment_collection`

提交示例：

```http
POST /workflow-tasks/:taskId/complete
Content-Type: application/json

{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 5000,
    "paid_at": "2026-06-17T10:00:00.000Z",
    "evidence_images": ["https://..."],
    "remark": "定金收款"
  }
}
```

当前 orange 侧相关模块：

- `src/services/workflow_task.ts`
- `src/services/task_center.ts`
- `src/types/api/workflow_task.d.ts`
- `src/services/project_payment.ts`
- `src/utils/workflow_payment_collection.ts`
- `src/packageTasks/pages/index/index.tsx`
- `src/packageProjects/pages/detail/sections/WorkflowNodeCardsPanel.tsx`

### 施工工序动作

当 action 满足以下任一条件时，小程序应按施工工序处理：

- 当前节点 `node_type = procedure`
- 当前节点 `business_kind = procedure_template`
- `output_fields` 或节点配置中存在施工日志、施工图片要求

提交 `POST /workflow-tasks/:taskId/complete` 前，小程序需要先完成施工日志和图片上传，
再把已保存的日志 ID 和图片数量放入 `output`：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "project_log_id": "log-uuid",
    "image_count": 3
  }
}
```

如果节点要求图片明细，也可以传：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "log_id": "log-uuid",
    "image_urls": ["https://..."]
  }
}
```

小程序不应本地判断“可以跳过资料要求”。最终是否放行以 complete 接口返回为准。

### 小程序行为约束

1. 不用本地状态推导可执行按钮。
2. 不再从旧 `status_actions` 生成 workflow 按钮。
3. 不跳过 `payment_collection` 节点。
4. 不在 complete 成功前本地强改客户或项目状态。
5. complete 成功后刷新详情、任务中心和 workflow state。
6. complete 失败时保留已上传凭证或已填写内容，提示用户刷新或重试。
7. 遇到 409 表示任务已处理或当前节点变化，应刷新状态，不重复提交。

## 微信支付兼容策略

后续接入微信支付时，不需要改变 workflow 图语义。

人工收款模式：

```text
payment_collection task -> 财务输入金额和凭证 -> complete task -> 创建 payment 和 ledger -> workflow 放行
```

微信支付模式：

```text
payment_collection task -> 创建微信支付订单 -> 支付回调确认 -> 创建 payment 和 ledger -> 自动或半自动 complete task -> workflow 放行
```

payment 与 ledger 的幂等来源规则：

- 人工确认收款由 workflow task 创建 payment 时，payment 和 ledger 使用
  `source_type = workflow_task`、`source_id = taskId`。
- 如果 workflow task 已有关联的 confirmed payment，后端复用这条 payment，不再要求
  手工金额和凭证 output；ledger 优先沿用 payment 自己的
  `source_type/source_id`。
- 如果历史 confirmed payment 没有 `source_type/source_id`，ledger 使用
  `source_type = payment`、`source_id = payment.id`，保持和 finance phase1
  migration 的历史回填规则一致，避免同一笔 payment 形成第二条台账。
- 后续微信支付回调应先写入带 provider/source 信息的 confirmed payment；workflow
  bridge 只判断该 payment 已 confirmed，再按 payment 来源幂等写 ledger 并推进流程。

微信支付配置需要另行确定：

- 平台统一商户号。
- 租户独立商户号。
- 平台服务商 + 租户子商户。

workflow 层只关心 `payment_collection` 是否已确认，不应直接绑定具体支付渠道。

## 已有实例迁移策略

不能直接删除或改写线上已有运行实例。建议分阶段迁移。

### 阶段 1：规范和只读审计

1. 固化本规范。
2. 查询当前 active workflow definitions。
3. 统计仍使用旧 `customer_main` 和 `construction_main` 的实例。
4. 标记包含 `on_hold`、`invalid` 图节点的模板和实例。
5. 输出受影响实例清单。

### 阶段 2：新增模板，不破坏旧实例

1. 新增客户设计 workflow 模板。
2. 新增项目签约 workflow 模板。
3. 新增施工 workflow 模板。
4. 新增发布校验，但先对旧模板走兼容提示或灰度校验。
5. 新建业务对象只使用新模板。

### 阶段 3：运行中实例兼容

1. 运行中的旧实例继续按其发布版本执行，避免中途断链。
2. 对未开始或刚开始的实例，允许通过受控重建迁移到新模板。
3. 对已进入施工中的项目，不强制拆分历史流程。
4. 迁移必须通过 migration 或受控 service 脚本，不手工改远端数据。

### 阶段 4：异常动作收敛

1. 从模板主线移除 `on_hold`、`invalid`。
2. 项目详情提供暂停、恢复、作废异常动作入口。
3. 异常动作写项目状态日志和 workflow 事件。
4. 恢复时回到暂停前节点或按规则重建实例。

### 阶段 5：小程序和 Admin 验收

1. Admin 创建三个模板并发布。
2. 小程序任务中心可按 `workflow_state.actions` 展示客户、项目、财务、施工动作。
3. 财务人员能处理收定金、阶段款、尾款。
4. 施工人员只能处理当前工序节点。
5. 暂停/作废不出现在标准节点库主线中。
6. 已有旧实例不被误删，不丢任务，不丢流水。

## 原始实施顺序

以下为 PRD 评审时建议的实施顺序，用于追溯任务拆分。当前状态见后文实现记录。

1. 增加 workflow 业务轨道定义和校验工具。
2. 先改 API 模板单测，明确三条标准模板。
3. 修改 `workflow-templates.ts`，新增或拆分模板。
4. 修改发布校验，禁止违反业务轨道的图发布。
5. 修改 Admin 节点库和属性面板，按 workflow 类型过滤能力。
6. 修改项目 workflow runtime 选择逻辑，区分项目签约和施工 workflow。
7. 补充迁移审计脚本和迁移记录。
8. 与 orange 按本规范做一次真实联调验收。

截至 2026-06-17，主要代码改造、模板 migration、只读审计和旧实例处置工具已经
落地；仍需按 Runbook 处理剩余旧运行实例，且 orange 真实联调验收不在本仓库内执行。

## 2026-06-17 对接实现记录

已完成：

- API 模板拆分：`customer_main`、`project_signing`、`construction_main`。
- API 发布校验：按业务轨道校验主线顺序和主状态语义唯一性，禁止
  `on_hold`、`invalid`、`pause_project`、`mark_invalid`、`mark_dormant`
  等异常动作成为主线节点，并禁止项目签约、施工轨道混入客户阶段节点。
- API 财务门禁校验：收款节点必须配置合法 `payment_type`，且必须有财务审核人
  或 `finance.*` 确认权限；项目签约流程中，
  `deposit` 必须位于方案确认之后、项目签约之前，`stage_1` 必须位于项目签约之后、
  排期开工之前。
- API 施工发布校验：施工流程只把开工、工序、竣工验收、交房作为固定主顺序；
  中期收款是可插入门禁，不再要求固定 `payment_stage_2` / `payment_stage_3` node_key；
  拆改、水电、瓦工、木工、油工、安装等工序主状态按 `stage_key` 归一后也必须唯一。
- API 工序运行时门禁：施工 `procedure` 节点按 `require_log` 和 `min_image_count`
  校验 complete output，缺施工日志或图片数量不足时返回
  `WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED`。
- API 运行时：新设计项目优先进入 `project_signing`，确认开工后启动 `construction_main`。
- API actions：`final_acceptance`、`payment_collection`、客户 `designing -> end` 均通过 workflow task 推进。
- API task bridge：项目签约节点强制校验 `signed_amount`，排期开工节点强制校验
  `start_date` 和 `construction_manager_employee_id`，避免前端漏传必填 output 时继续推进。
- API task service：`POST /workflow-tasks/:taskId/complete` 会在进入客户、项目、
  财务等业务 bridge 前先校验 `task.node_key` 是否仍等于实例当前节点，避免 stale
  pending task 在 runtime 拒绝前先写入收款、ledger 或项目副作用。
- 旧快照兼容：旧 `customer_main` 中残留的客户 `signed` 节点会返回 generic
  `complete` action，避免从 `designing` 推进到旧签约节点后无 actions。
- 旧项目保护：旧 `construction_main` / `project_main` 中残留的项目签约类节点
  不再直接走 project bridge；完成时返回 `WORKFLOW_INSTANCE_REBUILD_REQUIRED`，
  要求先受控重建到 `project_signing`，避免新旧实例并行推进。
- Admin：模板入口、节点库、节点能力、业务类型和财务类型按 workflow 轨道过滤；
  本地校验补齐客户设计、项目签约、施工三条业务轨道顺序、主状态语义唯一性和
  异常动作主线拦截、财务门禁位置检查。
- Admin 项目详情：`payment_collection` 动作只校验是否已有 `confirmed` 入账记录，
  不在项目状态弹窗录入金额或凭证；金额、凭证和入账仍由待办中心/财务收款路径完成。
- Admin/API 施工阶段对接：Admin 新增确认开工节点默认使用模板标准
  `node_key = started`；后端保存 schema 接受 `config.stage_type`；发布校验和
  Admin 本地校验会把 `construction_start` 语义节点归一为标准 `started` 校验，
  兼容已保存草稿但不放松主线顺序。
- 审计脚本：`bun run workflow:decoration-business-audit -- --sample-limit 100`。
- 旧实例复核脚本：`bun run workflow:decoration-legacy-review -- --sample-limit 100`。
  复核报告会按实例输出 `action_commands`，可直接复制对应 dry-run / apply 命令。
- 旧实例受控重建脚本：
  `bun run workflow:decoration-legacy-rebuild -- --tenant-id <tenant-id> --subject-type project --subject-id <project-id> --workflow-key project_signing`。
- 旧实例受控取消脚本：
  `bun run workflow:decoration-legacy-cancel -- --tenant-id <tenant-id> --instance-id <instance-id>`。
- 模板 migration：`supabase/migrations/20260617190000_decoration_workflow_business_templates.sql`。
  - 新增或激活缺失的 `project_signing`。
  - 仅在 `customer_main` / `construction_main` 活跃版本仍包含旧签约、异常节点时重发标准模板。
  - 不删除、不改写 `workflow_instances` 和 `workflow_tasks`，运行中旧实例保留原发布快照。
  - 发布调用使用当前 7 参数 `publish_workflow_definition`，带 `p_expected_updated_at`。

环境执行结果：

- 已执行 `supabase db push --db-url ...` 应用
  `20260617190000_decoration_workflow_business_templates.sql`。
- 已执行 `supabase migration list --db-url ...`，`20260617190000` Local / Remote
  均已存在。
- 已复跑只读审计，active definitions 层面的旧模板问题已清零。
- 审计脚本已区分 `needs_migration` 和 `needs_instance_review`，避免把运行中旧快照误判为还需模板 migration。
- 已运行中的旧实例不在本次代码改造中直接删除或改写。
- 对审计出的 running legacy instances 走受控重建或兼容执行策略，不手工改远端数据。

2026-06-17 只读审计记录：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 20
```

应用 migration 前结果：

- `needs_migration = true`
- `total_issues = 14`
- `active_customer_main_contains_signed_node = 1`
- `active_construction_main_contains_project_signing_nodes = 1`
- `active_project_workflow_contains_exception_nodes = 1`
- `tenants_missing_project_signing_definition = 1`
- `running_instances_on_legacy_snapshots = 10`

其中客户 `2327ae27-658a-4db3-aef5-9d69e0eab37c` 仍在旧
`customer_main` 快照的 `designing` 节点；它应通过运行时兼容或受控重建处理，
不能直接在 migration 中改写运行实例。

应用 migration 后复跑结果：

- `needs_migration = false`
- `needs_instance_review = true`
- `total_issues = 10`
- `active_customer_main_contains_signed_node = 0`
- `active_construction_main_contains_project_signing_nodes = 0`
- `active_project_workflow_contains_exception_nodes = 0`
- `tenants_missing_project_signing_definition = 0`
- `running_instances_on_legacy_snapshots = 10`

剩余 10 条均为运行中旧快照，需要按运行时兼容或受控重建处理。

旧实例只读复核记录：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 20
```

复核结果：

- `sample_size = 10`
- `compatible_runtime = 6`
- `rebuild_candidate = 1`
- `manual_restore_required = 3`
- `unknown_review_required = 0`
- `needs_rebuild = true`
- `needs_manual_restore = true`

分类含义：

- `compatible_runtime`：旧实例保留原快照，但当前节点已有兼容 action，可继续完成当前待办。
- `rebuild_candidate`：旧项目实例处于签约阶段节点，需先 dry-run，再受控重建到 `project_signing`。
- `manual_restore_required`：实例已经进入施工后段，或业务对象已关闭但 workflow 仍运行；不能直接自动重建。
- `unknown_review_required`：脚本无法归类，必须人工核对后再处理。

复核报告中的 `items[].action_commands` 是后续处置的命令来源：

- `dry_run`：可直接复制执行，不写远端数据。
- `apply`：正式写入命令，必须包含 `--apply` 和对应确认参数。
- `note`：说明为什么能自动处置，或为什么必须人工处理。
- `compatible_runtime` 和需要人工恢复点的实例不会生成写入命令。

本次复核中的关键对象：

- 客户 `2327ae27-658a-4db3-aef5-9d69e0eab37c` 当前旧 `customer_main`
  节点为 `designing`，客户状态为 `designing`，归类为 `compatible_runtime`，
  可继续通过当前 workflow task 推进。
- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 当前旧
  `construction_main` 节点为 `designing`，项目状态为 `designing`，
  归类为 `rebuild_candidate`，正式处理前必须先执行 dry-run。
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 当前旧
  `construction_main` 节点为 `acceptance`，项目状态为 `acceptance`，
  归类为 `manual_restore_required`，不能重建到新施工流程起点。
- 另有 2 条旧客户实例当前节点仍在 `potential`，但客户状态已为
  `invalid`，归类为 `manual_restore_required`；应人工确认取消实例或恢复客户状态。

受控重建 dry-run 记录：

- 客户 `2327ae27-658a-4db3-aef5-9d69e0eab37c` 对新 `customer_main`
  dry-run 返回 `ok = true`，会取消 1 个旧 running 实例，并从新模板
  `potential` 节点开始；因会重置当前进度，正式执行前需要业务确认。
- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 当前项目状态为
  `designing`，对新 `project_signing` dry-run 返回 `ok = true`，会取消
  1 个旧 running 实例，并从新模板 `designing` 节点开始。
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 当前项目状态为
  `acceptance`，不建议直接重建到新施工流程起点；应继续兼容执行或另行
  制定恢复点策略。

受控重建 CLI 保护规则：

- 默认模式是 `dry-run`，不传 `--apply` 不会写数据。
- `--apply` 必须同时传 `--confirm-rebuild <subject-id>`，且确认值必须等于
  `--subject-id`。
- 脚本会先读取当前旧实例，再调用旧实例复核分类；只有
  `classification = rebuild_candidate` 且推荐目标 workflow 与命令中的
  `--workflow-key` 一致时才会调用 rebuild RPC。
- 非 `rebuild_candidate`，例如 `compatible_runtime` 或
  `manual_restore_required`，脚本会拒绝执行，避免把可兼容推进或需要人工恢复点的
  实例误重建。

受控取消 CLI 保护规则：

- 默认模式是 `dry-run`，不传 `--apply` 不会写数据。
- `--apply` 必须同时传 `--confirm-cancel <instance-id>`，且确认值必须等于
  `--instance-id`。
- 脚本会先读取当前旧实例，再调用旧实例复核分类；只有客户实例且
  `recommended_action = confirm_customer_status_before_continue` 时才允许取消。
- 施工后段项目实例即使是 `manual_restore_required`，也不能通过该脚本取消；
  必须先定义人工恢复点或专门处置方案。

2026-06-17 受控重建 CLI dry-run 记录：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --subject-type project \
  --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 \
  --workflow-key project_signing
```

结果摘要：

- `ok = true`
- `mode = dry-run`
- 旧实例：`construction_main / b58acf8e-4f18-4b40-b5c7-919600e5e636`
- 目标定义：`project_signing / dd559d20-58b2-4d38-996e-34d82cbe68ea`
- 目标当前节点：`designing`
- `existing_instance_count = 1`
- `canceled_instance_count = 1`
- `deleted_instance_count = 0`
- 未执行 `--apply`，因此未写入远端数据。

### 旧实例处置 Runbook

目标：把 `running_instances_on_legacy_snapshots` 从“只读发现”推进到“可控处置”，
同时保证不误删历史任务、付款流水和 workflow 事件。

#### 1. 复跑只读复核

每次正式处置前必须先复跑：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

远端处置脚本应串行执行。不要并发运行多个需要连接远端数据库的审计、dry-run
或 apply 命令，避免 Supabase session pool 短时间达到连接上限。

验收点：

- `unknown_review_required = 0`。
- `rebuild_candidate` 只能包含确认仍处于签约阶段的项目。
- `manual_restore_required` 不能进入自动重建。
- 后续 dry-run 和 apply 优先复制复核报告里对应实例的 `action_commands`，
  不手工拼接 tenant、subject 或 instance ID。

#### 2. 处理 `compatible_runtime`

适用对象：旧客户 workflow 实例当前节点仍有兼容 action，例如 `potential`、
`following`、`designing`、`signed`。

处理方式：

1. 小程序或 Admin 读取业务对象详情，确认 `workflow_state.actions` 存在。
2. 操作人只提交后端返回的 `actions[].key`。
3. 通过 `POST /workflow-tasks/:taskId/complete` 完成当前 pending task。
4. 完成后刷新业务对象详情、任务中心和 workflow state。

验收点：

- 前端不本地推导下一节点。
- `complete` 成功后旧实例按旧发布快照继续推进或结束。
- 不调用 `decoration-workflow-legacy-rebuild.ts`。

#### 3. 处理 `rebuild_candidate`

适用对象：旧项目实例处于项目签约阶段节点，且业务状态仍是签约阶段。

当前唯一候选：

- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- 旧实例 `b58acf8e-4f18-4b40-b5c7-919600e5e636`
- 当前节点 `designing`
- 目标 workflow `project_signing`

正式执行前必须满足：

1. dry-run 输出 `ok = true`。
2. dry-run 的 `current_node.node_key` 符合预期，例如 `designing`。
3. dry-run 的 `canceled_instance_count` 与预期一致。
4. 业务确认允许取消旧 running 实例并创建新 `project_signing` running 实例。

命令来源：复核报告中该项目的 `action_commands.dry_run` 和
`action_commands.apply`。下方命令仅保留为本次审计样例。

正式执行命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts \
  --apply \
  --confirm-rebuild 1a8589fb-8f3f-4900-a759-6d15438ffcc2 \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --subject-type project \
  --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 \
  --workflow-key project_signing
```

执行后验收：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

预期变化：

- `running_instances_on_legacy_snapshots` 从 `10` 降到 `9`。
- `rebuild_candidate` 从 `1` 降到 `0`。
- 该项目的新 running 实例属于 `project_signing`。
- 旧 `construction_main` 实例状态变为 `canceled`。

#### 4. 处理 `manual_restore_required`

适用对象：

- 项目已经进入施工后段，例如 `acceptance`。
- 客户状态已关闭，例如 `invalid`，但旧 workflow 实例仍 running。

处理规则：

1. 不自动重建。
2. 先确认业务对象真实状态。
3. 如果业务对象应关闭，走取消实例或异常动作，而不是推进当前任务。
4. 如果业务对象应恢复，先明确恢复到哪个节点，再设计专门恢复脚本或人工操作方案。
5. 所有恢复或取消动作都必须记录原因、操作者和原实例信息。

当前需人工确认对象：

- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460`：旧施工实例在
  `acceptance`，项目状态也是 `acceptance`，不能重建到施工起点。
- 客户 `aa55b76c-a6a1-498a-9e36-fde8b974a248`：旧客户实例在
  `potential`，客户状态为 `invalid`。
- 客户 `2cc20642-03d9-4bc6-a68a-f7236ab8e3ea`：旧客户实例在
  `potential`，客户状态为 `invalid`。

验收点：

- 不执行 `--apply` 重建。
- 不直接修改数据库状态。
- 形成明确人工决策后，再补 migration 或受控 service 脚本。

关闭态客户旧实例受控取消 dry-run：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --instance-id 41f7772d-c472-41e6-a913-c6e641be3dd2

bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --instance-id 1a6dc44b-19b9-4516-8d3f-9e2f4125b842
```

dry-run 结果均为：

- `ok = true`
- `mode = dry-run`
- `dry_run = true`
- 目标实例当前 `workflow_key = customer_main`
- 目标实例当前 `current_node_key = potential`
- 目标客户当前 `subject_status = invalid`
- 未执行 `--apply`，因此未写入远端数据。

正式取消命令格式：

命令来源：复核报告中对应客户旧实例的 `action_commands.dry_run` 和
`action_commands.apply`。正式取消前仍需业务确认客户确实应保持关闭状态。

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --apply \
  --confirm-cancel <instance-id> \
  --tenant-id <tenant-id> \
  --instance-id <instance-id>
```

正式取消后验收：

- 对应旧 `workflow_instances.status` 变为 `canceled`。
- 对应 running node 和 pending task 变为 `canceled`。
- 写入 `workflow_transition_logs.action = cancel`。
- 复跑旧实例复核后，`manual_restore_required` 应减少对应数量。

### 2026-06-17 22:24 复核记录

本轮只执行只读审计和 dry-run，未执行任何 `--apply` 写入命令。

本轮只读复核证据：

- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-readonly-review-2224.md`

只读审计：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

结果摘要：

- `needs_migration = false`
- `needs_instance_review = true`
- `running_instances_on_legacy_snapshots = 10`
- `compatible_runtime = 6`
- `rebuild_candidate = 1`
- `manual_restore_required = 3`
- `unknown_review_required = 0`

最新 dry-run 结果：

- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 重建到
  `project_signing` dry-run 为 `ok = true`，目标当前节点仍是 `designing`，
  `existing_instance_count = 1`、`canceled_instance_count = 1`、
  `deleted_instance_count = 0`。
- 客户旧实例 `41f7772d-c472-41e6-a913-c6e641be3dd2` 取消 dry-run 为
  `ok = true`，目标客户状态为 `invalid`。
- 客户旧实例 `1a6dc44b-19b9-4516-8d3f-9e2f4125b842` 取消 dry-run 为
  `ok = true`，目标客户状态为 `invalid`。

结论：

- 模板 migration 已闭环，剩余问题全部是运行中旧实例处置。
- 可写入的 3 个处置命令仍需业务确认后才能执行 `--apply`。
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 仍需要人工定义施工后段恢复点，
  不能通过现有重建或取消脚本自动处理。
- 旧实例写入处置的业务确认清单见
  `docs/state_machine_migrate/2026-06-17-decoration-workflow-legacy-apply-checklist.md`。
- 真实联调验收记录模板见
  `docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md`。
- 给业务负责人和小程序团队的确认请求见
  `docs/state_machine_migrate/2026-06-17-decoration-workflow-confirmation-request.md`。
- 装修 workflow 专用门禁状态见
  `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`。
- 人工恢复决策必须显式回填 `followup_required`；选择继续旧验收自然结束时，
  执行前该值应为 `true`，完成并只读核验旧实例已到 `end/completed` 后才可改为
  `false`，作为“无后续动作关闭 PRD”的证据。

### 当前验收矩阵

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| 三条标准模板拆分 | `workflow-templates.ts` 与 `workflow-templates.test.ts` 覆盖 `customer_main`、`project_signing`、`construction_main` | 已完成 |
| 项目签约可插入财务门禁 | `workflow-publish-graph.test.ts` 覆盖 `project_signing` 中插入 `payment_collection` | 已完成 |
| 项目签约财务门禁位置受控 | `workflow-publish-graph.test.ts` 覆盖收定金、开工前款允许区间和非法 payment_type | 已完成 |
| 收款节点必须有合法类型和确认人/权限 | `workflow-payment-collection-node-validation.test.ts` 覆盖缺失/非法 `payment_type`、缺少财务审核人和 `finance.*` 权限 | 已完成 |
| 施工财务门禁可按租户自定义插入 | `workflow-publish-graph.test.ts` 覆盖无固定收款节点、使用自定义收款 node_key；API/Admin `workflow-business-track-validation.test.ts` 覆盖插入门禁不放松工序主状态唯一性 | 已完成 |
| 工序日志/图片门禁后端兜底 | `workflow-runtime-guards.test.ts` 覆盖缺日志、缺图片拦截和满足要求放行 | 已完成 |
| 发布时禁止破坏主顺序 | `workflow-publish-graph.ts` 按业务轨道校验主线顺序，`workflow-business-track-validation.test.ts` 覆盖模板派生自定义 key 和施工工序重复拦截 | 已完成 |
| 发布时禁止重复主状态语义 | `workflow-publish-graph.test.ts` 覆盖不同 `node_key` 但同一签约/开工主状态语义重复；API/Admin 轨道校验覆盖相同 `stage_key` 工序重复 | 已完成 |
| 发布时禁止跨轨道节点混入 | `workflow-publish-graph.test.ts` 覆盖项目签约/施工混入客户节点、客户流程插财务节点 | 已完成 |
| 异常动作不作为主线节点 | `workflow-business-track-validation.test.ts` 覆盖 `mark_dormant`、`pause_project` 等异常动作节点名 | 已完成 |
| Admin 发布前本地校验业务轨道 | `workflow-designer-graph-utils.test.ts` 覆盖项目签约财务门禁位置、主状态语义重复、施工自定义收款 node_key；`workflow-business-track.test.ts` 覆盖模板派生自定义 key 识别；Admin `workflow-business-track-validation.test.ts` 覆盖施工工序主状态重复 | 已完成 |
| Admin 施工节点与 API 保存/发布校验一致 | `workflow-node-capabilities.test.ts`、`WorkflowGraphSaveSchema` 和 API/Admin 轨道校验测试覆盖 `stage_type` 与 `construction_start -> started` 归一 | 已完成 |
| 暂停/作废不作为标准主线节点 | 发布校验和 Admin 轨道过滤隐藏异常节点 | 已完成 |
| 新设计项目进入项目签约 workflow | `project-workflow-runtime.ts` 与测试覆盖 `project_signing` 启动 | 已完成 |
| 确认开工后启动施工 workflow | `project-workflow-runtime.test.ts` 覆盖签约完成后启动 `construction_main` | 已完成 |
| 客户设计 workflow 不再承担签约 | 模板和发布校验禁止客户轨道包含项目签约节点 | 已完成 |
| 小程序按 actions 完成任务 | 文档明确 `/workflow-tasks/:taskId/complete` 和 `workflow_state.actions` 约束，API actions 测试覆盖；`task-center/legacy/actions.test.ts` 覆盖旧 `/task-center/todos` 兼容 `customer_followup`、`project_payment`、`project_workflow` 并保留 action 文案；`phase5-workflow-smoke.test.ts` 覆盖客户 `/workflow-tasks?subject_type=customer`、客户 `/task-center/todos?type=customer_followup` 和项目 `/task-center/todos?type=project_payment/project_workflow` smoke 检查，并要求 `workflow_task:*` 待办带 `action_label`、`workflow_actions` 和 workflow task 元数据；2026-06-18 orange 已按 `/workflow-tasks?status=pending`、`actions[].key` 和项目详情 `workflow_state` 完成发布前/发布后只读 smoke | 已完成 |
| 只能完成当前 pending task | `workflow-tasks.test.ts` 覆盖 stale pending task 在进入业务 bridge 前返回 `WORKFLOW_NODE_NOT_CURRENT`，避免非当前节点产生业务副作用 | 已完成 |
| 项目动作必填 output 后端兜底 | `workflow-task-project-bridge.test.ts` 覆盖签约金额、开工日期、工程负责人缺失时报错 | 已完成 |
| 财务节点确认金额和凭证 | `workflow-task-action-metadata.ts` 输出 `payment_collection` 字段，payment bridge 创建确认流水 | 已完成 |
| Admin 项目详情不形成第二条收款入口 | `project-status-action-dialog.test.ts` 和 `project-workflow-payment-gate.test.ts` 覆盖项目状态弹窗只校验已确认入账，不录入金额或凭证，未入账时提示去待办中心确认收款 | 已完成 |
| 微信支付后续兼容 | workflow 只绑定 `payment_collection` 语义，不绑定支付渠道；`workflow-task-payment-bridge.test.ts` 覆盖已有 `workflow_task_id` 且 `confirmed` 的入账记录无需人工金额/凭证 output 即可推进、历史 payment 缺 source 字段时按 `payment/payment.id` 幂等写 ledger，未确认入账不能放行 | 设计已完成 |
| 旧实例不被 migration 改写 | migration 内容测试确认不 `delete/update workflow_instances/tasks` | 已完成 |
| 旧实例识别与分类 | `decoration-workflow-business-audit.ts` 和 `decoration-workflow-legacy-instance-review.ts` | 已完成 |
| 旧实例处置命令生成 | `decoration-workflow-legacy-instance-review.ts` 输出 `action_commands`，Runbook 直接复用 | 已完成 |
| 旧项目签约实例受控重建 | `decoration-workflow-legacy-rebuild.ts` 默认 dry-run，`--apply` 要确认；执行记录见 `docs/state_machine_migrate/2026-06-18-project-signing-rebuild-execution.md` | 已完成 |
| 关闭客户旧实例受控取消 | `decoration-workflow-legacy-cancel.ts` 默认 dry-run，`--apply` 要确认；执行记录见 `docs/state_machine_migrate/2026-06-18-invalid-customer-cancellations-execution.md` | 已完成 |
| 施工后段旧项目实例 | Runbook 标记 `manual_restore_required`，不自动重建；人工确认后选择 `continue_legacy_acceptance_until_completed`，执行记录见 `docs/state_machine_migrate/2026-06-18-manual-restore-project-decision-request.md` | 已完成 |

### 2026-06-18 发布闭环记录

当前可以标记为“无需后续动作关闭本轮 PRD”的证据：

- 截至 2026-06-18 发布前只读审查，`needs_migration = false`，
  `unknown_review_required = 0`，`manual_restore_required = 0`，
  `rebuild_candidate = 0`。
- `running_instances_on_legacy_snapshots = 5`，但旧实例复核全部为
  `compatible_runtime`，后续通过当前 workflow task 和后端返回 actions 自然推进，
  不需要脚本写入、rebuild、cancel 或 manual restore。
- orange 真实联调和发布后只读 smoke 已完成：
  - customer_design_workflow
  - project_signing_workflow
  - payment_collection / payment_stage_2
  - construction_procedure_log
  - stage_acceptance_transition
  - 发布后员工登录、`/workflow-tasks?status=pending`、`actions[].key`、
    项目详情 `workflow_state`
- Admin 可见性和发布后只读 smoke 已完成：项目详情、财务台账和 workflow 模板页
  均只读核验通过，未执行 workflow 推进、模板发布、节点调整、手工补状态或数据库修改。
- 旧实例写入、施工后段项目恢复策略和 orange 端到端验收的机读门禁状态已同步回填到
  `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`。
  同步后用以下命令校验：

```bash
cd apps/api && bun run workflow:decoration-manual-gates-check -- \
  --evidence-file docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

  当前该命令返回 `ok = true`，其中 `manual_restore_decision`、
  `orange_e2e_acceptance` 和 `closeout_rules_consistent` 均已通过。

发布闭环文档：

- `docs/state_machine_migrate/2026-06-18-decoration-workflow-release-readiness.md`
- `docs/state_machine_migrate/2026-06-18-decoration-workflow-release-communication-and-post-smoke.md`
