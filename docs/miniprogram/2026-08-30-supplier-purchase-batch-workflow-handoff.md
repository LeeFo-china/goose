# 采购批次 Workflow：Orange 小程序最终对接交接

日期：2026-08-30  
适用范围：Gooes API/Admin 与 Orange 微信小程序采购批次审批对接。

## 1. 结论与仓库边界

采购批次已经接入租户级通用 workflow。员工仍以“商品维度”维护一个跨供应商采购批次；
批次最终审批通过后，后端在同一事务中按供应商拆分、生成并直接提交采购单。额度内只经过
采购审批，超预算还要经过财务审批。

本轮 Gooes 已交付：

- `supplier_purchase_batch` workflow subject；
- `purchase_review`（采购审批）与 `finance_review`（财务审批）节点；
- 批次详情的 `workflow_state` 与服务端 `actions`；
- 统一待办列表和 `POST /workflow-tasks/:taskId/complete`；
- pending 审批的撤回、驳回后编辑、重新提交新审批轮次；
- workflow 开关关闭时的旧固定审批，以及开启后的旧 `/review` 受控兼容桥；
- 同 key 重放、不同 payload 冲突、旧轮次拒绝和并发唯一业务结果。

`/Users/leefo/Public/work/orange` 本轮只做了只读核对，没有修改、格式化、构建、提交或推送。
下文“Orange 待改”均由小程序团队在 Orange 仓库完成。

## 2. 通用 HTTP 约定

- 下文 path 均相对 Orange 当前 API base URL。
- 所有接口要求已登录的租户员工；Bearer token 和租户上下文继续由 Orange HTTP 层注入。
- 成功响应为 `{ data: T, message: "success" }`。
- 错误响应为
  `{ success:false, message, code, details?, requestId }`；客户端按 HTTP status 和稳定 `code`
  分支，不解析中文 message。
- 所有列表返回 `{ list, pagination:{ page, pageSize, total, totalPages } }`。
- 分页默认 `page=1&pageSize=20`，`pageSize` 范围为 1–100；任务中心和明细均增量加载。
- 金额、数量、税率继续按十进制字符串使用，不能用浮点结果回写业务事实。
- 下文 supplier mutation 的 `Idempotency-Key` 是请求头，不是 body 字段，trim 后长度 1–120。

## 3. 最终可复制契约

### 3.1 读取批次详情

```http
GET /supplier-purchase-batches/:id
Authorization: Bearer <token>
```

与 workflow 相关的响应节选：

```json
{
  "data": {
    "id": "<batchId>",
    "project_id": "<projectId>",
    "batch_no": "PB-20260830-000001",
    "status": "pending_approval",
    "budget_status": "over_budget",
    "approval_round": 3,
    "version": 4,
    "actions": {
      "can_edit": false,
      "can_submit": false,
      "can_review": true,
      "can_withdraw": false,
      "can_cancel": false,
      "can_create_supplier": false,
      "can_create_catalog": false,
      "can_create_purchasable_product": false
    },
    "workflow_state": {
      "subject_type": "supplier_purchase_batch",
      "subject_id": "<batchId>",
      "instance_id": "<instanceId>",
      "instance_status": "running",
      "current_node_key": "purchase_review",
      "current_node_title": "采购审批",
      "pending_task_count": 1,
      "actions": [
        {
          "key": "approve",
          "label": "审批通过",
          "task_id": "<taskId>",
          "node_key": "purchase_review",
          "business_domain": "supplier_purchase_batch",
          "business_action": "approve",
          "requires_reason": false,
          "output_fields": [],
          "disabled": false
        },
        {
          "key": "reject",
          "label": "驳回修改",
          "task_id": "<taskId>",
          "node_key": "purchase_review",
          "business_domain": "supplier_purchase_batch",
          "business_action": "reject",
          "requires_reason": true,
          "output_fields": [],
          "disabled": false
        }
      ]
    }
  },
  "message": "success"
}
```

说明：

- 上例是字段节选；真实详情还会返回 `timeline_nodes`。
- `workflow_state` 在旧固定审批或还没有 workflow runtime 时可以为 `null`。
- `workflow_state.actions` 只返回当前登录员工真正可执行的任务动作；不可见时为空。
- 顶层 `actions` 是页面按钮的唯一事实源。小程序不得按 status、权限码或提交人自行推导。
- `approval_round` 每次驳回编辑/撤回后重新提交都会递增；客户端只展示或随详情刷新，
  不把它作为 complete 请求参数。

### 3.2 分页读取采购审批待办

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=supplier_purchase_batch
Authorization: Bearer <token>
```

Query 契约：

| 参数 | 约束 |
| --- | --- |
| `page` | 可选，正整数，默认 1 |
| `pageSize` | 可选，1–100，默认 20 |
| `status` | 可选，`pending | completed | canceled`，默认 `pending` |
| `subject_type` | 本场景固定 `supplier_purchase_batch` |
| `subject_id` | 可选，单批次筛选，trim 后 1–200 字符 |

每条任务除基础 task/instance/assignee/action 字段外，还包含采购卡片上下文。关键节选：

```json
{
  "data": {
    "list": [
      {
        "id": "<taskId>",
        "node_key": "purchase_review",
        "status": "pending",
        "instance": {
          "subject_type": "supplier_purchase_batch",
          "subject_id": "<batchId>",
          "status": "running",
          "current_node_key": "purchase_review"
        },
        "actions": [
          {
            "key": "approve",
            "label": "审批通过",
            "task_id": "<taskId>",
            "business_domain": "supplier_purchase_batch",
            "requires_reason": false,
            "disabled": false
          }
        ],
        "card_context": {
          "todo_type": "supplier_purchase_batch",
          "title": "采购审批",
          "target_url": "/packageProcurement/pages/batch-review/index?id=<batchId>&workflowTaskId=<taskId>",
          "business": {
            "batch_id": "<batchId>",
            "batch_no": "PB-20260830-000001"
          }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

上例 `actions` 只节选一个动作；它与详情 `workflow_state.actions` 使用同一动作契约。
任务中心应优先使用 `card_context.target_url`，不要自行拼接其他业务页。

### 3.3 统一完成采购/财务审批任务

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Idempotency-Key: <uuid>
Content-Type: application/json

{"action":"approve","reason":null,"output":{}}
```

驳回：

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Idempotency-Key: <uuid>
Content-Type: application/json

{"action":"reject","reason":"采购依据不完整","output":{}}
```

约束：

- supplier task 的 action 只能是 `approve | reject`；客户端仍从服务端 action metadata 取值。
- reject 的 `reason` trim 后必须为 1–500 字；approve 的 reason 可为 `null`。
- `output` 当前传 `{}`。不得传 `compat_source` 或 `compat_expected_version`，这两个是后端
  旧路由兼容保留字段，外部伪造会被拒绝。
- supplier task 必须带有效 `Idempotency-Key`；虽然通用 controller 对其他 subject 兼容可选，
  采购桥会对缺失 key 返回 400。

`data.status` 分支：

| 当前节点与动作 | 结果 | 客户端行为 |
| --- | --- | --- |
| 采购审批 approve，额度内 | `ordered` | 刷新详情和采购单列表；订单均已是 `submitted` |
| 采购审批 approve，超预算 | `pending_approval` | 不显示“已下单”；刷新详情/任务中心，等待 `finance_review` |
| 财务审批 approve | `ordered` | 刷新详情和采购单列表 |
| 任一审批节点 reject | `rejected` | 刷新详情；申请人可按新 actions 编辑后重提 |
| 审批时价格/预算/商品/供应商漂移 | HTTP 409 | `details.batch` 已回到 draft；刷新并引导申请人修订 |

成功结果至少包含 `{ status, idempotent, batch, version, workflow_state }`；`ordered` 还包含
`requisition_ids` 和按供应商生成的 `orders` 摘要。超预算采购审批的成功响应明确是
`pending_approval + current_node_key:"finance_review"`，不能伪装成 `ordered`。

### 3.4 撤回当前审批轮次

```http
POST /supplier-purchase-batches/:id/withdraw
Authorization: Bearer <token>
Idempotency-Key: <uuid>
Content-Type: application/json

{"expected_version":3,"reason":"采购计划调整"}
```

真实 schema 约束：

- `expected_version` 是正整数，不接受 0；必须使用最新详情/命令响应的 `version`。
- `reason` 可省略，提供时 trim 后 1–500 字。
- 当前已进入财务审批时，数据库要求 reason 必填；小程序可统一要求用户填写，减少二次失败。
- 只有当前轮次提交人、具备采购管理权限且项目 update scope 可见时可以撤回。

成功 `data`：

```json
{
  "status": "withdrawn",
  "idempotent": false,
  "batch": {
    "id": "<batchId>",
    "status": "draft",
    "version": 4
  },
  "version": 4,
  "workflow_state": {
    "instance_status": "canceled",
    "current_node_key": null,
    "pending_task_count": 0
  }
}
```

撤回保留批次明细、拆分采购申请和审批时间线，释放当前预算占用；不会删除历史。修改后重新
submit 会建立新 `approval_round`，旧 task 不能继续推进。

## 4. 页面状态与 action 映射

| 批次状态 | 服务端 action 驱动的页面行为 |
| --- | --- |
| `draft` | `can_edit` 编辑；`can_submit` 提交；`can_cancel` 取消；按三个 `can_create_*` 展示快速新建 |
| `pending_approval` | 当前审批人按 `workflow_state.actions` 审批；提交人按 `can_withdraw` 撤回；不能用 cancel 代替 withdraw |
| `rejected` | 申请人按 `can_edit` 修改；修改保存后回 draft，再按 `can_submit` 重提；可按 `can_cancel` 取消 |
| `ordered` | 只读，展示每个供应商对应的已提交采购单 |
| `cancelled` | 只读终态 |

节点映射：

| `current_node_key` | 中文 | approve 后续 | reject 后续 |
| --- | --- | --- | --- |
| `purchase_review` | 采购审批 | 额度内 ordered；超预算进入 `finance_review` | rejected |
| `finance_review` | 财务审批 | ordered | rejected |

按钮规则：

1. 页面先读顶层 `actions` 决定编辑、提交、审批、撤回、取消和快速新建入口。
2. 审批按钮再从 `workflow_state.actions` 找到 enabled action 和 `task_id`。
3. `requires_reason=true` 时客户端在提交前要求非空原因；后端仍会最终校验。
4. action 缺失或 disabled 时不展示可提交按钮，不缓存旧详情中的 action。
5. 每次成功 mutation、409 revision/stale、页面重新显示和下拉刷新都重新拉详情。

## 5. Workflow 灰度和旧 `/review` 兼容策略

租户开关为 `purchase_batch_workflow_enabled`：

- `false`：`POST /supplier-purchase-batches/:id/review` 保持原固定审批行为。
- `true`：新接入优先调用统一 workflow task complete；旧 `/review` 只作为灰度期间旧页面兼容入口。
  后端会解析唯一的当前 workflow task，并调用与统一入口相同的原子审批 RPC，不会直调旧审批。
- workflow 开启后，无法唯一解析 instance/task、节点或轮次不匹配时返回稳定 409，绝不降级回
  fixed review。

Orange 推荐切换规则：

```text
有 workflowTaskId（任务中心 URL 或 workflow_state.actions.task_id）
  -> 只调用 POST /workflow-tasks/:taskId/complete

灰度期间旧入口没有 workflowTaskId
  -> 调用旧 POST /supplier-purchase-batches/:id/review
```

禁止在统一 complete 返回 403/409/500 后自动 fallback 到旧 `/review`，否则会形成双写、掩盖
stale task 或改变幂等 fingerprint。旧 `/review` 在 workflow 模式下也要求原 body 的
`expected_version/action/remark` 和同一条用户意图的稳定 key。

旧 `/review` 的兼容响应仍适配旧页面，但有一个必须更新的分支：超预算采购审批通过时返回
`status:"pending_approval"` 和 finance workflow state，而不是伪造 `ordered`。终态
`ordered/rejected` 保持旧响应表达。

## 6. Idempotency-Key 生命周期与并发

客户端为“一次用户确认的一个 task + action + reason + output”生成一个 UUID：

- 请求超时、断网、HTTP 500 后状态不确定：保持 payload 不变并复用原 key。
- 相同 key + 相同 payload：服务端返回同一业务结果，并以 `idempotent:true` 标识重放。
- 相同 key + 不同 action/reason/output/旧 review expected_version：返回 409 conflict。
- 用户修改 action 或 reason 后再次确认：生成新 key。
- 不得把一个 task 的 key 用到另一个 task、withdraw 或下一审批轮次。
- workflow complete 与旧 `/review` 并发时只产生一个业务结果；另一条可能得到 replay 或
  `WORKFLOW_TASK_NOT_PENDING`，不能因此再次换 key 重试写入。

客户端只有在收到确定成功、用户改变 payload 或明确放弃本次意图时清空 key。对超时和 500
立即生成新 key 是错误做法。

## 7. 错误处理矩阵

| HTTP | 典型 code | Orange 行为 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`、`SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR`、`SUPPLIER_PURCHASE_BATCH_WITHDRAW_REASON_REQUIRED` | 保留表单，定位字段；缺 key/reject reason/财务撤回 reason 由用户修正后按 payload 规则处理 key |
| 403 | `FORBIDDEN` | 关闭动作按钮，刷新详情/任务；提示无权限或任务不再属于本人，不 fallback |
| 404 | `SUPPLIER_PURCHASE_BATCH_NOT_FOUND` 或任务不存在 | 返回列表/任务中心并刷新；不要推断范围外资源 |
| 409 | `SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT` | 刷新详情，使用新 version，用户重新确认后用新 key |
| 409 | `WORKFLOW_TASK_NOT_PENDING`、`WORKFLOW_NODE_NOT_CURRENT` | 视为任务已推进/失效，刷新详情和任务中心 |
| 409 | `SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE` | 旧轮次，不重试；刷新后进入新任务 |
| 409 | `SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING`、`SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT` | 提示审批流程异常并记录 requestId，不调用旧审批兜底 |
| 409 | `SUPPLIER_PURCHASE_BATCH_NO_APPROVER` | 提交前失败；提示管理员配置采购/财务审批人 |
| 409 | `SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED` | 刷新详情，按新 actions 重绘 |
| 409 | `SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED`、`SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED`、`SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE`、`SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE` | 读取 `details.batch/version/details`，刷新并引导申请人修订 |
| 500 | `DB_ERROR` | 保留 requestId 和原 key；允许同 payload 重试，不显示成功，不自动换入口 |

审批或撤回成功后至少刷新：

1. `GET /supplier-purchase-batches/:id`；
2. 当前已打开的 `/items`、`/requisitions`、`/orders` 页；
3. `GET /workflow-tasks?...subject_type=supplier_purchase_batch` 或任务中心缓存。

## 8. Orange 只读核对结果与待改清单

2026-08-31 只读检查确认下列路径真实存在。当前 Orange 工作区另有用户自己的
`src/packageProcurement/styles/_batch-pages-theme.scss` 未提交改动，本轮没有触碰。

| Orange 文件 | 当前只读事实 | 小程序团队待改 |
| --- | --- | --- |
| `src/types/api/supplier_procurement.d.ts` | 有批次/旧 review 类型；`PurchaseBatchActions` 尚无 `can_withdraw`，批次尚无 `approval_round/workflow_state`，`ReviewedProcurementCommand` 只允许 ordered/rejected | 增加 workflow state、`can_withdraw`、withdraw input/result；允许兼容 review 的 `pending_approval` finance 分支 |
| `src/types/api/workflow_task.d.ts` | `WorkflowSubjectType` 和 todo/business domain 仍以宽 string 兼容；card context 尚无 `target_url` | 明确加入 `supplier_purchase_batch` subject/todo/business domain，并给 card context 增加 `target_url` |
| `src/services/supplier_procurement.ts` | mutation helper 已带稳定 key；有旧 `review`，没有 `withdraw` | 新增 withdraw wrapper；旧 review 仅保留无 taskId 的灰度入口 |
| `src/services/workflow_task.ts` | `complete(taskId,payload)` 尚未传 `Idempotency-Key` | 改为接收 key，并像 supplier mutation 一样放在 header |
| `src/services/task_center.ts` | 可读取通用 task，但未显式处理采购 subject；target URL 未读取 `card_context.target_url` | 识别采购 todo，优先使用 card target，进入 batch review 并保留 `workflowTaskId` |
| `src/packageProcurement/pages/batch-detail/index.tsx` | 只处理 edit/review/cancel，review URL 没有 taskId | 只读服务端 actions；增加 withdraw、rejected edit；从 workflow action 取 taskId 跳审批页 |
| `src/packageProcurement/pages/batch-review/index.tsx` | 当前总是调用旧 `SupplierProcurementService.review` | 读取 `workflowTaskId`；存在时调用统一 complete；没有时才走受控旧入口；处理 pending finance/ordered/rejected/409 |

建议 Orange 实施顺序：类型 -> service wrapper -> task center -> batch detail -> batch review -> 真机 smoke。
这些改动必须由 Orange 团队提交；Gooes 不会跨仓库代改。

## 9. 与既有采购能力的兼容说明

### 9.1 项目选择时间筛选不变

本轮不改变项目选择接口。继续使用：

```http
GET /supplier-purchase-batch-project-options?page=1&pageSize=20&updatedWindow=last_7_days&timezone=Asia%2FShanghai
```

`updatedWindow` 为 `last_7_days | current_month`；未传时为全部。时间过滤在数据库分页前执行，
可与 keyword 组合；Orange 本机“最近选择”仍是客户端能力。

### 9.2 快速新建商品仍立即可采购

“新建商品”仍一次提交商品、SKU 和供货价：

```http
POST /supplier-purchasable-products/:supplierId?tenantSupplierId=<tenantSupplierId>
Idempotency-Key: <uuid>
```

body 继续包含 `product + sku + price`。成功后刷新采购 catalog，新 SKU 立即可加入采购批次。
商品/SKU/供货价创建不进入采购批次 workflow；只有批次 submit 后进入审批。

## 10. Orange 验收 smoke

### 10.1 API/开发者工具

- [ ] 任务列表用 `subject_type=supplier_purchase_batch`、page/pageSize 增量加载。
- [ ] 卡片显示批次号、项目、金额、商品数、供应商数、申请人和提交时间。
- [ ] 卡片点击进入 batch review，URL 同时带 batch id 与 `workflowTaskId`。
- [ ] 详情只按 `actions` 和 `workflow_state.actions` 展示按钮。
- [ ] complete/withdraw 均在 header 发送稳定 `Idempotency-Key`。
- [ ] reject 无 reason 在客户端阻止；服务端 400 仍可正确展示。
- [ ] 500/超时重试复用原 key；修改 reason 后生成新 key。

### 10.2 真机业务矩阵

- [ ] 额度内：submit -> 采购审批通过 -> 批次 ordered -> 每个供应商一张 submitted 采购单。
- [ ] 超预算：采购审批通过后仍 pending，显示财务审批；此时订单列表为空。
- [ ] 超预算财务审批通过后 ordered，订单数量等于 supplier_count。
- [ ] 采购审批和财务审批 reject 都进入 rejected；申请人可编辑并重提。
- [ ] pending 提交人可撤回，批次回 draft；进入财务审批时必须填写撤回原因。
- [ ] 重提后旧 task 返回 stale/not pending，新任务可正常处理。
- [ ] 提交人、自审、无项目 scope、非 assignee 均不能审批。
- [ ] 同 key 双击只出现一个业务结果；不同 payload 复用 key 返回 conflict。
- [ ] 审批后详情、订单和任务中心同步刷新，不残留旧按钮/旧任务。
- [ ] flag=false 旧 review 正常；flag=true 统一 task 正常；统一入口失败不自动降级旧 review。
- [ ] 近 7 天/本月项目筛选和“最近选择”不受影响。
- [ ] 一次新建商品+SKU+供货价后可立即加入批次，不出现审批入口。

## 11. Gooes 契约证据

- API schema：`apps/api/src/schema/workflow-subjects.ts`、
  `apps/api/src/schema/supplier-purchase-batches.ts`
- HTTP controller：`apps/api/src/controllers/workflow-tasks/index.ts`、
  `apps/api/src/controllers/supplier-purchase-batches/index.ts`
- workflow projection/action：
  `apps/api/src/services/supplier-purchase-batch-workflow-projection.ts`、
  `apps/api/src/services/workflow-task-supplier-purchase-batch-action-metadata.ts`
- task card：`apps/api/src/services/workflow-task-card-context.ts`
- atomic result schema/error mapping：
  `apps/api/src/repositories/supplier-purchase-batch-workflow.ts`、
  `apps/api/src/repositories/supplier-purchase-batch-errors.ts`
