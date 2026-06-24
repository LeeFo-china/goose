# Decoration Finance Phase 2 Receivables Miniprogram Handoff

日期：2026-06-23

## 结论

本次二阶段应收计划对小程序是 workflow v2 的增量字段，不改变收款推进入口。

小程序继续只消费后端返回的 `timeline_nodes`、`node.attributes`、`node.actions`、`workflow_state.actions` 和 `/workflow-tasks.actions`。财务确认收款仍统一调用 `POST /workflow-tasks/:taskId/complete`，小程序不直接创建 `payments`，不直接核销 `project_receivable_plans`，不本地计算逾期和欠款。

## 当前 gooes 变更

- 新增应收计划表和核销表：
  - `project_receivable_plans`
  - `project_receivable_allocations`
- 新增权限：
  - `finance.receivable.view`
  - `finance.receivable.manage`
- 新增 Admin/API 查询：
  - `GET /finance/receivables`
  - `GET /projects/:projectId/receivables`
- 扩展 `payment_collection` 节点配置：
  - `receivable_plan_enabled`
  - `receivable_amount_mode`
  - `receivable_fixed_amount`
  - `receivable_percentage`
  - `receivable_due_offset_days`
  - `receivable_due_date_rule`
  - `receivable_title`
- workflow runtime 读取 pending 收款 task 时，会按当前运行节点幂等创建或读取应收计划。
- 财务 complete 收款 task 时，后端创建 confirmed payment、核销 receivable plan、写 finance ledger、推进 workflow。

## 小程序需要消费的字段

### timeline node attributes

当当前节点是开启应收计划的 `payment_collection` 节点时，`workflow_state.timeline_nodes[]` / `workflow_progress.timeline_nodes[]` 的当前节点会包含：

```json
{
  "attributes": {
    "payment_type": "stage_2",
    "receivable_plan_id": "plan-id",
    "receivable_title": "中期进度款",
    "receivable_amount": 10000,
    "receivable_paid_amount": 3000,
    "receivable_remaining_amount": 7000,
    "receivable_due_date": "2026-06-30",
    "receivable_status": "partially_paid",
    "receivable_overdue_days": 0
  }
}
```

小程序展示建议：

- 节点标题仍读 `node.display.label` 或 `node.node_title`。
- 节点状态仍读 `node.display.status_label`。
- 收款说明可显示：
  - `应收：receivable_amount`
  - `已收：receivable_paid_amount`
  - `未收：receivable_remaining_amount`
  - `应收日期：receivable_due_date`
  - `逾期：receivable_overdue_days > 0` 时展示。

### task action output_fields

`/workflow-tasks?status=pending` 或 `workflow_state.actions` 中的收款 action 会在 `output_fields` 前面带只读上下文：

```json
{
  "key": "complete",
  "business_domain": "payment_collection",
  "business_action": "confirm_payment",
  "output_fields": [
    {
      "name": "receivable_context",
      "label": "应收信息",
      "type": "receivable_summary",
      "required": false,
      "readonly": true,
      "receivable_plan_id": "plan-id",
      "receivable_title": "中期进度款",
      "receivable_amount": 10000,
      "receivable_paid_amount": 3000,
      "receivable_remaining_amount": 7000,
      "receivable_due_date": "2026-06-30",
      "receivable_status": "partially_paid",
      "receivable_overdue_days": 0
    }
  ]
}
```

小程序处理规则：

- `receivable_context` 是只读展示字段，不需要提交回后端。
- 收款弹窗可以把它展示在金额输入和凭证上传之前。
- 不要用它本地判断能否推进 workflow，是否可执行仍以后端 action 是否返回为准。

## complete payload 不变

财务确认收款继续走：

```http
POST /workflow-tasks/:taskId/complete
```

请求体仍是：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "amount": 10000,
    "paid_at": "2026-06-23T10:00:00.000Z",
    "evidence_images": ["<project_payment object key>"],
    "remark": "收款已确认"
  }
}
```

凭证上传仍使用当前口径：

- `scene = project_payment`
- `project_id = <projectId>`

## 项目应收摘要接口

如果小程序项目详情需要展示项目维度回款摘要，可以调用：

```http
GET /projects/:projectId/receivables?page=1&pageSize=20
```

返回包含分页列表和 summary：

```json
{
  "list": [
    {
      "id": "plan-id",
      "project_id": "project-id",
      "payment_type": "stage_2",
      "title": "中期进度款",
      "amount": 10000,
      "paid_amount": 3000,
      "remaining_amount": 7000,
      "due_date": "2026-06-30",
      "status": "partially_paid",
      "overdue_days": 0,
      "workflow_instance_id": "instance-id",
      "workflow_node_key": "payment_stage_2"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "summary": {
    "contract_amount": 100000,
    "receivable_amount": 30000,
    "paid_amount": 10000,
    "remaining_amount": 20000,
    "overdue_amount": 0,
    "overdue_count": 0
  }
}
```

列表筛选可选：

- `status=pending|partially_paid|paid|overdue|canceled`
- `payment_type=deposit|stage_1|stage_2|stage_3|add_on`
- `overdue_only=true`
- `due_date_from=YYYY-MM-DD`
- `due_date_to=YYYY-MM-DD`

## 错误和重试

小程序需要按后端错误提示展示，不要本地绕过：

- `PROJECT_SIGNED_AMOUNT_REQUIRED`：项目缺少签约金额，不能生成按比例应收计划。
- `RECEIVABLE_PLAN_SOURCE_MISSING`：当前运行节点缺少运行节点记录。
- `RECEIVABLE_PAYMENT_INSUFFICIENT`：本次收款金额未达到当前应收计划剩余金额，workflow 不推进。

幂等规则：

- 重复 complete 同一个收款 task，不应重复创建 payment、ledger、allocation。
- 如果 payment 已创建但 workflow 推进失败，重试仍复用已有 payment 并继续核销/推进。
- 小程序可以保持现有防重复提交按钮状态；最终幂等由后端保证。

## orange 侧可能需要关注的文件

以下是只读检查到的现有入口，orange 团队自行修改：

- `src/services/workflow_task.ts`：确认 `WorkflowTask.actions[].output_fields` 类型允许 `receivable_summary` 和只读扩展字段。
- `src/services/projects/types/status.ts`：补充 `timeline_nodes[].attributes.receivable_*` 类型。
- `src/pages/projects/workflow.ts`：当前项目 workflow 抽屉/节点展示可读取 `node.attributes.receivable_*`。
- `src/utils/workflow_payment_collection.ts`：收款 action 识别仍以 `business_domain=payment_collection` / `business_action=confirm_payment` 为准，不要因为 `receivable_context` 改 action key。
- `src/packageTasks/pages/index/index.tsx`：任务中心卡片如展示收款摘要，可读取 action output_fields 中的 `receivable_context`。
- `src/services/project_payment.ts`：凭证上传口径不变，继续带 `scene=project_payment` 和 `project_id`。

## 不需要做的事

- 不调用 `/finance/receivables` 做核销。
- 不调用 `/payments` 创建项目收款。
- 不根据节点名称、`payment_type` 或本地枚举推导欠款、逾期、是否能推进。
- 不把 `receivable_context` 回传到 complete output。
- 不兼容旧 construction stage/current stage 字段作为收款节点来源。

## smoke 清单

后端准备一个已进入开启应收计划的 `payment_collection` 节点项目后，小程序按以下顺序验收：

1. 员工登录，确认租户上下文正常。
2. `GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project&subject_id=:projectId`
   - 返回 pending task。
   - `actions[].key = complete`。
   - `actions[].output_fields` 包含 `receivable_context`。
3. 项目详情读取 `workflow_state.timeline_nodes` 或 `workflow_progress.timeline_nodes`
   - 当前收款节点 `attributes.receivable_plan_id` 存在。
   - 应收、已收、未收、应收日期、逾期字段展示正确。
4. direct upload 收款凭证
   - `scene=project_payment`
   - `project_id=:projectId`
5. `POST /workflow-tasks/:taskId/complete`
   - body 只提交 `amount`、`paid_at`、`evidence_images`、`remark`。
   - 返回 200 success。
6. complete 后刷新项目详情
   - 当前收款节点变为 `done`。
   - 下一个 workflow 节点变为 `current`。
7. 可选调用 `GET /projects/:projectId/receivables?page=1&pageSize=20`
   - 对应 plan `paid_amount` 增加。
   - `remaining_amount` 变为 0 时 `status=paid`。

回填证据：

- project ID
- workflow instance ID
- task ID
- receivable plan ID
- payment ID
- allocation ID，从后端 complete 响应的 `receivable_allocation.id` 回填
- ledger ID
- complete 请求/响应
- complete 后 workflow current node
- `receivable_context` 截图或请求日志

说明：Phase 2.1 已在 `POST /workflow-tasks/:taskId/complete` 响应中返回
`receivable_allocation` 只读摘要。小程序不需要提交 allocation ID，也不需要调用核销接口；
只在 smoke 记录中回填 `receivable_allocation.id`。

## 后端 smoke 辅助脚本

gooes 已提供只读/写入双模式脚本，供后端准备样本后复核契约：

```bash
pnpm --dir apps/api run finance:receivables-phase2-smoke
```

只读模式只检查接口和 pending task 是否包含 `receivable_context`，不会推进 workflow。

写入模式必须显式传：

- `FINANCE_RECEIVABLES_SMOKE_TASK_ID`
- `FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE=true`
- `FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON`

小程序团队仍按上面的 smoke 清单执行真实端到端验证；后端脚本只用于后端侧确认样本和契约，不替代小程序联调。

## 后端/小程序边界

gooes 负责：

- 生成和查询 receivable plan。
- 核销 confirmed payment。
- 写 finance ledger。
- 返回 workflow v2 `attributes/actions/output_fields`。
- 保证 complete 幂等。

orange 负责：

- 展示后端返回的应收摘要。
- 继续按 workflow v2 actions 发起收款确认。
- 不本地推导 workflow 和财务规则。
- 按上面的 smoke 清单回填证据。

## 本次只读参考

本仓库未修改 orange。只读参考了：

- `/Users/leefo/Public/work/orange/docs/2026-06-18-decoration-finance-payment-workflow-smoke-handoff.md`
- `/Users/leefo/Public/work/orange/docs/2026-06-20-payment-timeline-action-permission-handoff.md`
- `/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-miniprogram-e2e-execution.md`
- `/Users/leefo/Public/work/orange/src/services/workflow_task.ts`
- `/Users/leefo/Public/work/orange/src/pages/projects/workflow.ts`
- `/Users/leefo/Public/work/orange/src/packageTasks/pages/index/index.tsx`
