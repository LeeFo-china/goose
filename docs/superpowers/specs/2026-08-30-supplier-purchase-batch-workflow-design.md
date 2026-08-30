# 采购批次通用 Workflow 接入设计

**日期：** 2026-08-30  
**状态：** 已完成业务确认，待书面审阅  
**范围：** Gooes 后端与 Admin 兼容能力、Orange 小程序对接契约  
**审批主体：** `supplier_purchase_batch`

## 1. 背景

当前采购模块已经具备固定审核能力，但尚未接入费用审批使用的通用
workflow runtime。

采购批次当前通过模块私有状态机完成以下流程：

```text
draft -> pending_approval -> ordered | rejected | cancelled
```

`POST /supplier-purchase-batches/:id/review` 直接调用采购审核服务和
`review_supplier_purchase_batch` RPC。审批权限是
`supplier.purchase-requisition.approve`；提交人不能审批自己提交的采购批次；
超预算审批还要求 `finance.budget.manage`。最终审批通过时，现有 RPC 在同一
数据库事务中按供应商生成并提交采购单。

费用审批则使用 `workflow_definitions`、`workflow_instances`、
`workflow_tasks` 和 `workflow_subject_states` 管理可配置节点、审批人、待办、
动作和流转记录，客户端通过 `workflow_state.actions` 与
`POST /workflow-tasks/:taskId/complete` 推进流程。

本设计让采购批次复用通用 workflow，同时保留采购模块已经验证过的预算、
拆单和采购单生成事务，不为单个商品、供应商子申请或采购单分别启动流程。

## 2. 目标与非目标

### 2.1 目标

1. 以一个采购批次为一个审批主体，只发起一个 workflow。
2. 预算内采购经过采购负责人审批；超预算采购额外经过财务审批。
3. 审批人支持权限候选人，并兼容 workflow 已有的指定员工、角色和部门配置。
4. 采购审批进入统一任务中心，Admin 与 Orange 使用同一动作契约。
5. 最终审批通过后，继续按供应商维度原子生成并提交采购单。
6. 驳回后允许修改原批次并重新提交；每次重新提交形成独立审批轮次。
7. 审批中允许受控撤回，取消仍是不可恢复的终止操作。
8. 迁移期保留旧采购审核接口，但禁止其绕过 workflow 权限和当前任务。
9. 对并发、重复请求、旧任务、版本冲突和跨租户访问保持失败关闭。

### 2.2 非目标

1. 本轮不审批供应商、品牌、商品、SKU 或供货价的建档。
2. 商品、SKU 和供货价一次填写成功后仍立即可用于采购。
3. 本轮不为每个供应商子申请或最终采购单创建独立 workflow。
4. 本轮不重做采购目录、价格、预算或供应商拆单算法。
5. 本轮不直接退役 `/supplier-purchase-batches/:id/review`。
6. 本轮不修改 Orange 仓库；小程序变更由 Orange 团队完成。

## 3. 已确认业务规则

### 3.1 审批层级

- 预算内：采购负责人审批一次。
- 超预算：采购负责人审批通过后，进入财务审批。
- 采购审批默认候选权限：`supplier.purchase-requisition.approve`。
- 财务审批默认候选权限：`finance.budget.manage`。
- 租户可以使用 workflow 现有能力将节点配置为指定员工、角色、部门或权限。
- 提交时必须能解析出本轮可能到达的全部审批节点候选人；预算内至少验证采购节点，
  超预算同时验证采购和财务节点。任一必经节点无候选人时禁止提交。

### 3.2 驳回、修改和重新提交

- 任一审批节点驳回后，批次进入 `rejected`，产品界面显示为“待修改”。
- `rejected` 允许申请人修改；首次保存修改时转换为 `draft`。
- 驳回保留原批次、商品明细、供应商拆分历史和 workflow 流转记录。
- 驳回释放本轮预算占用，旧供应商子申请保留为历史事实，不参与新一轮审批。
- 重新提交增加 `approval_round`，使用最新批次版本重新校验预算、价格和供应商，
  并创建新的 workflow 实例。
- 旧轮次任务不得处理新轮次批次。

### 3.3 撤回和取消

- `pending_approval` 允许申请人撤回；进入财务节点后撤回必须填写原因。
- 撤回将批次恢复为 `draft`，取消当前 workflow，释放本轮预算占用。
- `draft` 或 `rejected` 可以取消；取消后为 `cancelled`，不可重新提交。
- `ordered` 不允许撤回，后续只能走采购单取消或履约相关流程。

### 3.4 最终审批

- 最终审批必须使用提交时固化的 `budget_status` 和预算快照决定是否需要财务节点。
- 最终审批前继续执行现有供应商、价格、目录、预算和拆单一致性校验。
- 采购单生成失败时，不得完成 workflow task。
- workflow task 完成失败时，不得提交采购单生成事务。
- 审批成功后批次进入 `ordered`，每个供应商对应一张已提交采购单。
- 如果最终审批前发现供应商、价格、商品或预算事实已经变化，沿用现有
  `revision_required` 语义：释放预算占用、批次恢复为 `draft`、取消当前 workflow，
  返回具体变化明细，申请人修改后重新提交。

## 4. 方案比较与选择

### 4.1 方案 A：通用 workflow + 采购业务桥接（采用）

workflow 管理节点、候选人、待办和流转历史；采购 RPC 管理采购业务事实。
新增采购 workflow bridge 和原子编排 RPC，使 workflow 节点完成与采购状态变更
位于同一数据库事务中。兼容接口也进入同一 bridge。

优点：复用统一任务中心和配置能力，采购业务边界清晰，迁移风险可控。  
代价：需要新增 subject type、模板、bridge、原子编排 RPC 和兼容投影。

### 4.2 方案 B：在采购 RPC 内复制完整 workflow 实现（不采用）

把 workflow 节点、任务和路由逻辑复制到采购 SQL 中。

优点：事务集中。  
缺点：复制通用 runtime，采购与 workflow 基础设施强耦合，后续节点能力容易漂移。

### 4.3 方案 C：保留固定状态机并伪装为任务中心待办（不采用）

只生成采购待办展示数据，不创建真正的 workflow instance。

优点：改动少。  
缺点：不能配置流程，形成双重状态来源，无法可靠复用 task complete 和时间线。

## 5. 总体架构

```text
Orange/Admin
  | submit / withdraw / workflow task complete
  v
HTTP Controller
  v
SupplierPurchaseBatchService / WorkflowTaskService
  v
SupplierPurchaseBatchWorkflowBridge
  v
原子编排 RPC
  |-- 通用 workflow runtime RPC
  |-- 现有采购批次 command RPC
  |-- workflow subject-state 同步
  `-- command/transition audit
```

职责边界：

- `supplier_purchase_batches` 是采购业务状态、金额、预算、拆单代次和最终采购单结果
  的事实来源。
- `workflow_instances`、`workflow_tasks` 是当前审批节点、审批人、任务状态和流程时间线
  的事实来源。
- `workflow_subject_states` 是返回客户端的 workflow 快照，不反向决定采购金额、预算
  或供应商拆单。
- workflow bridge 只将节点动作转换为采购领域命令，不自行写采购单。
- 最终采购单仍由 `review_supplier_purchase_batch` 既有校验和生成逻辑产生。

## 6. 默认 Workflow 模板

新增系统模板 `supplier_purchase_batch_approval`，类别为 `approval`，subject type 为
`supplier_purchase_batch`。

workflow definition 是租户级记录。migration 为已经启用供应商模块的租户幂等创建并
发布版本 1；租户初始化流程也必须为后续新租户创建同一默认模板。若租户已经存在同 key
定义，migration 只在其没有有效 active version 时补齐，不覆盖租户已发布的自定义版本。

```text
start
  -> purchase_review
       | reject -> rejected_end
       | approve + budget_status != over_budget -> approved_end
       ` approve + budget_status == over_budget -> finance_review
                                                    | reject -> rejected_end
                                                    ` approve -> approved_end
```

节点定义：

| 节点 | 类型 | 默认候选权限 | 动作 |
|---|---|---|---|
| `purchase_review` | `approval` | `supplier.purchase-requisition.approve` | `approve`, `reject` |
| `finance_review` | `approval` | `finance.budget.manage` | `approve`, `reject` |
| `approved_end` | `end` | 无 | 无 |
| `rejected_end` | `end` | 无 | 无 |

`reject` 必须包含原因。`approve` 可以包含可选审批意见。

模板条件读取 workflow 启动上下文中固化的：

```json
{
  "batch_id": "uuid",
  "batch_version": 2,
  "approval_round": 1,
  "budget_status": "within_budget | over_budget",
  "project_id": "uuid",
  "submitted_by_employee_id": "uuid"
}
```

运行中的模板使用发布版本快照；租户修改模板只影响后续新实例。

## 7. 数据模型与 Migration

所有数据库变更通过 `supabase/migrations/` 管理。

### 7.1 Workflow 枚举与约束

- Domain `WORKFLOW_SUBJECT_TYPE_VALUES` 增加 `supplier_purchase_batch`。
- 数据库中所有 subject type check constraint 和相关 RPC 校验同步增加该值。
- workflow action metadata 的 `business_domain` 增加
  `supplier_purchase_batch`。
- workflow task 查询、subject state、timeline 和 task-center card context 支持该类型。

### 7.2 采购批次审批轮次

`supplier_purchase_batches` 增加：

- `approval_round integer NOT NULL DEFAULT 0 CHECK (approval_round >= 0)`。

提交成功后在采购 command RPC 内递增轮次。workflow 启动上下文记录提交后的
`version` 与 `approval_round`。节点处理前必须同时匹配两者。

不在采购批次表复制 current node、task id 或 workflow status；当前运行实例通过
`tenant_id + subject_type + subject_id + status` 查询，避免两个 workflow 状态来源。

### 7.3 租户灰度开关

复用 `tenant_supplier_settings` 增加
`purchase_batch_workflow_enabled boolean NOT NULL DEFAULT false`。平台现有供应商
rollout 设置接口负责启停，并继续使用 `expected_version` 和 Idempotency-Key。

- 只有 `module_enabled=true` 且 `procurement_snapshot_v1_enabled=true` 时才能开启。
- 关闭供应商模块或采购快照能力前必须先关闭采购 workflow。
- 开关关闭的租户继续使用现有固定审核路径；开关开启后，submit、review、withdraw
  必须遵守本设计的 workflow 契约，不允许回退。
- dev 内部测试租户在 migration 和 API 发布完成后通过既定平台设置命令开启，
  migration 不替所有业务租户自动开启。

### 7.4 唯一性与索引

- 对 `workflow_instances` 增加采购批次运行实例部分唯一索引，保证同一租户同一批次
  最多一个 `running` 实例。
- 增加采购 subject 的实例查找索引，覆盖
  `(tenant_id, subject_type, subject_id, status, created_at DESC, id DESC)`。
- 保留现有采购批次待审批索引和 command event 幂等唯一约束。
- 新增或修改索引必须由 migration 管理；在 dev 对任务列表和 subject 查询执行
  `EXPLAIN ANALYZE`，列表继续分页且 `pageSize <= 100`。

### 7.5 命令与审计

- `supplier_purchase_batch_command_events.command_type` 增加 `withdraw`。
- workflow transition log 记录每个节点的动作、操作者、意见、审批轮次和批次版本。
- 采购 command event 继续记录影响采购业务状态的 submit、review、withdraw、cancel。
- 不新增重复的采购审批历史表；采购节点历史从 workflow timeline 读取。

## 8. 原子命令与一致性

### 8.1 提交

新增提交编排 RPC，在一个数据库事务内完成：

1. 锁定采购批次并验证 `expected_version`。
2. 验证项目更新范围、商品、SKU、价格、供应商和成本分类。
3. 验证默认 workflow 定义和首节点存在可用候选人。
4. 调用现有采购提交逻辑，生成供应商子申请、预算占用和新拆分代次。
5. 递增 `approval_round`。
6. 创建 `supplier_purchase_batch` workflow instance 和首个待办。
7. 同步 `workflow_subject_states`。
8. 写入采购 command event 与 workflow transition log。

任一步失败都回滚，不允许出现 `pending_approval` 但没有运行实例的批次。

### 8.2 节点审批

新增 workflow task 完成编排 RPC。RPC 使用统一锁顺序：workflow instance、task、
采购批次、预算占用、供应商子申请、采购单，避免与既有采购命令形成死锁。

- 采购审批通过且预算内：调用最终采购审核逻辑生成采购单，然后完成 workflow。
- 采购审批通过且超预算：只完成当前 workflow 节点并创建财务待办，采购批次继续为
  `pending_approval`。
- 财务审批通过：调用最终采购审核逻辑生成采购单，然后完成 workflow。
- 任一节点驳回：调用采购驳回逻辑释放预算，批次进入 `rejected`，然后完成 workflow
  到 `rejected_end`。
- 最终采购审核返回 `revision_required`：保持既有采购回草稿和释放预算结果，取消
  当前 task 与 instance，将 subject state 投影为已取消，并向客户端返回原错误码与
  脱敏变化明细；整个处理仍为单一事务。

业务变更、workflow task 完成和 subject state 同步属于同一事务。

### 8.3 幂等与并发

- 新入口要求 `Idempotency-Key`，最长 120 字符，规则沿用采购 command。
- workflow bridge 使用 `batchId + taskId + action + Idempotency-Key` 形成稳定指纹。
- 数据库先查 command event，再执行状态校验；同键同请求返回首次结果，同键不同请求
  返回幂等冲突。
- task、instance、批次版本或审批轮次不匹配时返回冲突，不自动使用最新版本。
- 双击、超时重试和两个审批人并发处理只允许一个事务生成采购单。

### 8.4 撤回

新增 `withdraw_supplier_purchase_batch` 编排 RPC，在一个事务内：

1. 验证操作者是当前申请人并具有管理与项目更新权限。
2. 验证批次为 `pending_approval` 且尚未生成采购单。
3. 验证批次版本与运行实例审批轮次。
4. 取消运行中的 workflow task 和 instance。
5. 释放本轮预算占用，将本轮供应商子申请转为不可执行的历史状态。
6. 将批次恢复为 `draft`，递增版本并记录撤回原因。
7. 同步 subject state 和审计记录。

## 9. 服务与代码边界

新增或扩展的单元：

- `supplier-purchase-batch-workflow-runtime`：解析模板、启动实例、读取当前运行实例和
  组装采购 workflow 状态。
- `workflow-task-supplier-purchase-batch-bridge`：把 task action 映射到采购原子编排
  RPC。
- `workflow-task-supplier-purchase-batch-action-metadata`：定义 approve/reject 动作、
  原因和审批意见字段。
- `workflow-task-card-context`：为采购待办批量加载批次号、项目、金额、供应商数、
  申请人和预算状态，禁止 N+1。
- `supplier-purchase-batches` service：提交、撤回、兼容 review 和 workflow 状态投影。
- `supplier-purchase-batches` repository：只负责采购与 workflow 编排 RPC、必要的
  分页查询和结果解析。

Controller 只做鉴权上下文、参数校验、幂等键读取、service 调用和响应包装。错误统一
经过 `error-factory.ts`，不直接抛出普通 `Error`。

## 10. API 契约

### 10.1 批次列表与详情

现有列表和详情响应增加可选 `workflow_state`，并保持现有字段兼容：

```json
{
  "workflow_state": {
    "instance_id": "uuid",
    "status": "running",
    "current_node_key": "purchase_review",
    "current_node_name": "采购审批",
    "actions": []
  },
  "actions": {
    "can_edit": false,
    "can_submit": false,
    "can_review": true,
    "can_withdraw": false,
    "can_cancel": false
  }
}
```

列表必须批量加载 workflow state；禁止逐批次查询 workflow。

### 10.2 统一待办与审批

```http
GET /workflow-tasks?subject_type=supplier_purchase_batch&status=pending&page=1&pageSize=20
```

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Idempotency-Key: <stable-key>
Content-Type: application/json

{
  "action": "approve",
  "reason": null,
  "output": {
    "comment": "同意"
  }
}
```

驳回：

```json
{
  "action": "reject",
  "reason": "采购数量需要调整",
  "output": {
    "comment": "修改后重新提交"
  }
}
```

### 10.3 撤回

```http
POST /supplier-purchase-batches/:id/withdraw
Authorization: Bearer <token>
Idempotency-Key: <stable-key>
Content-Type: application/json

{
  "expected_version": 3,
  "reason": "采购内容需要调整"
}
```

### 10.4 兼容 Review

`POST /supplier-purchase-batches/:id/review` 在迁移期保留，但内部必须：

1. 查找该批次唯一运行实例和当前 task。
2. 验证调用人可处理该 task。
3. 把旧请求映射成 workflow task complete。
4. 使用相同原子编排 RPC 和幂等规则。

对于已开启 `purchase_batch_workflow_enabled` 的租户，该接口不得直接调用底层采购
review RPC。没有运行中的 workflow 时返回明确错误，不回退到旧固定审核路径。
开关未启用的租户在观察期继续执行现有固定审核逻辑。

## 11. 权限与数据范围

- 查看批次和采购待办仍要求 `supplier.purchase-requisition.view`。
- 提交、编辑、撤回和取消仍要求 `supplier.purchase-requisition.manage` 与项目更新范围。
- 采购审批节点要求 task 可见性与 `supplier.purchase-requisition.approve`。
- 财务审批节点要求 task 可见性与 `finance.budget.manage`。
- 提交人不能处理自己提交批次的任一审批节点。
- workflow 候选人查询必须受租户边界和员工可操作状态限制。
- 批次项目不在员工项目读取范围时，不返回待办卡片，也不允许完成 task。
- 使用旧 `/review` 不能绕过 task assignee、权限、项目范围或自审限制。

## 12. 错误契约

新增稳定错误码：

| 错误码 | HTTP | 含义 |
|---|---:|---|
| `SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING` | 409 | 待审批批次缺少运行实例 |
| `SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT` | 409 | 存在重复或不匹配的运行实例 |
| `SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE` | 409 | task 属于旧审批轮次 |
| `SUPPLIER_PURCHASE_BATCH_NO_APPROVER` | 409 | 当前节点没有可用审批候选人 |
| `SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED` | 409 | 当前批次不允许撤回 |
| `SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT` | 409 | 批次版本已变化 |
| 既有 `SUPPLIER_PURCHASE_BATCH_*_CHANGED` | 409 | 最终审批发现业务事实变化，已回草稿 |
| `WORKFLOW_TASK_NOT_PENDING` | 409 | workflow task 已处理 |
| `FORBIDDEN` | 403 | 无权限、超出项目范围或不是合法审批人 |

数据库或解析失败继续包装为领域化 `DB_ERROR`，保留 Request-ID，不向客户端暴露 SQL、
凭证或内部堆栈。

## 13. Orange 对接

Orange 团队需要：

1. 将采购待办合并进统一任务中心，查询
   `subject_type=supplier_purchase_batch`。
2. 采购批次详情优先使用 `workflow_state.actions` 渲染审批动作。
3. approve/reject 使用 `/workflow-tasks/:taskId/complete`。
4. 撤回使用批次 `withdraw` 接口。
5. 驳回或撤回后恢复商品明细编辑；重新提交沿用批次 ID 和最新 version。
6. 最终审批成功后刷新批次详情和供应商采购单分页列表。
7. 请求处理中禁用按钮；重试复用原 Idempotency-Key。
8. 迁移期可以保留旧 `actions.can_review` 兼容，但不能从按钮文案推断业务动作。

Gooes 只提交后端、Admin 兼容能力和交接文档；Orange 仓库保持只读，由小程序团队
自行实施和提交。

## 14. 测试与验收

### 14.1 自动化测试

- Domain：subject type、business domain、状态和 action metadata。
- Schema：withdraw、task complete、驳回原因、版本和幂等键边界。
- Service：预算分支、自审、权限、项目范围、兼容 review 和旧轮次拒绝。
- Repository：RPC 参数、严格响应解析和错误映射。
- Migration contract：模板、约束、唯一索引、权限、撤回命令和原子编排顺序。
- Concurrency：同 task 双审批、同幂等键重放、不同幂等键竞争和撤回/审批竞争。
- Workflow：任务可见性、card context 批量加载、subject state 和 timeline。
- Route capability：新增 withdraw 与扩展 workflow route 保持全量分类。

### 14.2 Dev Smoke

1. 预算内采购一次审批后按供应商生成并提交采购单。
2. 超预算采购经过采购和财务两级审批后生成采购单。
3. 两个节点分别验证驳回、原因必填、预算释放和重新提交。
4. 采购审批中、财务审批中分别验证撤回。
5. 提交人自审、无权限、跨项目范围和非 assignee 全部拒绝。
6. 两个请求并发审批只生成一组采购单。
7. 重放首次幂等键返回同一结果。
8. 旧 review 与 workflow task complete 返回一致业务结果。
9. 任务中心、批次详情、workflow timeline 和采购单列表一致。
10. 列表分页无重复，task/subject 查询通过性能门。

### 14.3 Orange 真机验收

- 统一任务中心能进入采购批次详情。
- 采购审批与财务审批只向对应人员展示。
- 驳回、撤回、重新编辑和重新提交流程完整。
- 快速双击不会重复提交。
- 最终审批后按供应商展示多张采购单。
- 错误提示使用后端稳定 code，异常回传 Request-ID。

## 15. 发布、灰度与回滚

发布顺序：

1. 提交 migration、后端 runtime/bridge、兼容接口、测试和交接文档。
2. 先执行 dev migration，核对 Local/Remote 版本与索引。
3. 发布 dev API，完成新旧双入口 smoke。
4. Orange 完成 dev 与真机验收。
5. 通过租户级功能开关启用采购 workflow，先开放内部测试租户。
6. 观察 workflow 缺失、轮次冲突、幂等冲突、任务处理时长和采购单生成失败指标。
7. 扩大租户范围；稳定后另立任务退役旧 review。

回滚策略：

- 应用回滚到兼容版本时关闭采购 workflow 功能开关，停止创建新实例。
- 已运行的实例不删除；回滚前必须完成、撤回或由受控运维命令取消。
- 数据库采用前向修复 migration，不删除 workflow 历史、采购 command event 或已生成
  采购单。
- 新增索引可在单独前向 migration 中并发删除；新增 subject type 和审批轮次保留，
  避免历史实例不可读。

## 16. 完成标准

满足以下全部条件才算完成：

- 一个采购批次最多一个运行实例，审批轮次与版本严格匹配。
- 预算内、超预算、驳回、撤回、重新提交和最终拆单均通过自动化与 dev smoke。
- workflow task 和采购单生成具有同一事务边界，失败不产生半完成状态。
- 对已启用采购 workflow 的租户，旧 review 无法绕过 workflow。
- Admin 与 Orange 可以仅凭 workflow action metadata 完成操作。
- migration Local/Remote 对齐，查询计划和分页符合性能边界。
- Orange 真机验收通过，且 Orange 仓库未由 Gooes Agent 修改。
