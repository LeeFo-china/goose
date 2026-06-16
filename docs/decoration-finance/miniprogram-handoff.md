# 装修财务小程序对接说明

日期：2026-06-16

## 1. 范围

本文档用于 Gooes 后端/Admin 仓库向 WeChat 小程序仓库
`/Users/leefo/Public/work/orange` 交接装修财务第一阶段的收款确认对接。

本阶段只覆盖 workflow `payment_collection` 收款节点：

- 小程序通过任务中心或项目详情拿到收款待办。
- 财务人员在小程序输入入账金额、上传至少一张收款凭证、可选填写入账时间和备注。
- 小程序提交 `POST /workflow-tasks/:taskId/complete`。
- 后端创建或复用 `confirmed` payment，写入财务台账，然后完成 workflow task。

本阶段不要求小程序直接调用 `/payments` 创建流程收款，也不接入微信支付下单、支付回调、退款或企业付款。

## 2. 当前 orange 只读检查结果

本次只读检查了 `orange`，未修改其中任何文件。当前小程序不是从零开始，已经具备大部分工作流收款能力。

已匹配：

- `src/services/workflow_task.ts`
  - 已封装 `GET /workflow-tasks`。
  - 已封装 `POST /workflow-tasks/:taskId/complete`。
- `src/types/api/workflow_task.d.ts`
  - `WorkflowOutputField` 已支持 `number`、`datetime`、`image_list`、`payment_collection`。
  - 已定义 `PaymentCollectionCompleteOutput`，包含 `amount`、`paid_at`、`evidence_images`、`remark`。
- `src/services/task_center.ts`
  - 已识别 `finance.payment.confirm`。
  - 已把 `payment_collection` task 映射为 `project_payment`。
  - 财务上下文下会隐藏普通项目流程任务，只保留项目收款等财务相关待办。
- `src/utils/workflow_payment_collection.ts`
  - 已能通过 `business_domain = payment_collection`、`business_action = confirm_payment` 或 `payment_collection` output field 识别收款 action。
- `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts`
  - `confirm_payment` 已走收款确认表单。
  - 提交时会调用 `WorkflowTaskService.complete(taskId, { action, reason, output })`。
  - 400 会保留表单，409/403 会关闭弹窗并刷新项目详情。
- `src/packageProjects/pages/detail/components/PaymentCollectionConfirmPopup.tsx`
  - 已提供金额、入账时间、收款凭证、备注表单。
- `src/packageProjects/pages/detail/hooks/usePaymentCollectionConfirm.ts`
  - 已校验 `amount > 0`。
  - 已校验凭证数量 `>= min_image_count`。
  - 已将上传后的凭证归一为字符串数组提交。
- `src/services/project_payment.ts`
  - 已封装 `uploadCollectionEvidence()`，使用 direct COS 上传。

当前仍存在的对接缺口：

| 缺口 | 影响 | 建议 |
| --- | --- | --- |
| gooes 后端 direct upload 场景未包含 `project_payment` | 小程序上传收款凭证会在 `/uploads/cos/direct-init` 返回“当前场景暂不支持直传” | gooes 先补 `project_payment` 上传场景。 |
| orange 上传收款凭证未传 `projectId` | 凭证对象路径不能直接绑定项目；如果后端要求项目级校验会失败 | orange 将 `uploadCollectionEvidence(filePaths, projectId)` 透传到 direct upload 的 `projectId`。 |
| orange `WorkflowTaskService.list()` 未透传 `status` | 任务中心调用方传 `status` 时会被丢弃 | orange 在 list 参数类型和请求 query 中补 `status`。 |
| 任务中心跳转项目详情只带 `id` | 可以处理，但不能直接打开对应收款动作，财务人员还要在项目详情里找按钮 | 可选增强：target url 带 `workflowTaskId` 和 `action=confirm_payment`，项目详情加载后自动展开对应动作。 |

## 3. 后端契约

### 3.1 获取任务

```http
GET /workflow-tasks?page=1&pageSize=20&subject_type=project&status=pending
Authorization: Bearer <token>
```

响应中的收款任务 action 形态：

```json
{
  "data": {
    "list": [
      {
        "id": "task-id",
        "status": "pending",
        "node_key": "payment_stage_2",
        "node_type": "confirmation",
        "title": "中期进度款",
        "actions": [
          {
            "key": "complete",
            "label": "中期进度款",
            "task_id": "task-id",
            "business_domain": "payment_collection",
            "business_action": "confirm_payment",
            "requires_reason": false,
            "disabled": false,
            "output_fields": [
              {
                "name": "payment_status",
                "label": "中期进度款",
                "type": "payment_collection",
                "required": true,
                "payment_type": "stage_2",
                "payment_label": "中期进度款",
                "requirement_mode": "any_confirmed"
              },
              {
                "name": "amount",
                "label": "入账金额",
                "type": "number",
                "required": true,
                "payment_type": "stage_2",
                "payment_label": "中期进度款",
                "requirement_mode": "any_confirmed"
              },
              {
                "name": "paid_at",
                "label": "入账时间",
                "type": "datetime",
                "required": false
              },
              {
                "name": "evidence_images",
                "label": "收款凭证",
                "type": "image_list",
                "required": true,
                "min_image_count": 1
              },
              {
                "name": "remark",
                "label": "收款备注",
                "type": "string",
                "required": false
              }
            ]
          }
        ]
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

### 3.2 上传收款凭证

小程序使用现有 direct COS 上传链路：

```http
POST /uploads/cos/direct-init
Authorization: Bearer <token>
Content-Type: application/json
```

建议请求体：

```json
{
  "scene": "project_payment",
  "project_id": "project-id",
  "filename": "payment.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 120000
}
```

然后上传到返回的 `upload_url`，最后调用：

```http
POST /uploads/cos/direct-complete
Authorization: Bearer <token>
Content-Type: application/json
```

完成请求也应携带同一个 `scene`、`project_id`、`object_key`、`mimetype`、`size_bytes`。

当前 gooes 需要先补 `project_payment` direct upload scene，否则 orange 已有上传代码会被后端拒绝。

### 3.3 确认收款

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 10000,
    "paid_at": "2026-06-16T10:00:00.000Z",
    "evidence_images": [
      "tenants/<tenant-id>/project-payment/projects/<project-id>/payment.jpg"
    ],
    "remark": "中期款已入账"
  }
}
```

字段要求：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `action` | 是 | 使用 action metadata 返回的 `key`，收款节点当前为 `complete`。 |
| `output.payment_status` | 兼容保留 | 建议继续传 `"success"`，用于兼容旧小程序识别。 |
| `output.amount` | 是 | 入账金额，必须大于 0。 |
| `output.paid_at` | 否 | ISO 时间字符串；不传时后端使用当前时间。 |
| `output.evidence_images` | 是 | 收款凭证，至少 1 张；建议传上传后的对象存储路径或 URL 字符串。 |
| `output.remark` | 否 | 收款备注，最多 500 字。 |

成功响应：

```json
{
  "data": {
    "result": {
      "ok": true,
      "bridged": true,
      "operation": "confirm_payment"
    },
    "payment": {
      "id": "payment-id",
      "project_id": "project-id",
      "amount": 10000,
      "type": "stage_2",
      "status": "confirmed",
      "workflow_task_id": "task-id",
      "payment_channel": "manual",
      "source_type": "workflow_task",
      "source_id": "task-id"
    },
    "workflow_state": {
      "subject_type": "project",
      "subject_id": "project-id"
    }
  },
  "message": "success"
}
```

## 4. 后端行为和幂等规则

后端在 `payment_collection` 任务完成时统一编排：

1. 校验当前用户能处理该 workflow task。
2. 校验 `amount > 0`。
3. 校验 `evidence_images.length >= 1`。
4. 按 `workflow_task_id` 查询是否已有 payment。
5. 如果没有 payment，创建 `payments.status = confirmed`。
6. 写入 `finance_ledger_entries`，来源为 `source_type = workflow_task`、`source_id = taskId`。
7. 调用 workflow runtime complete。
8. 同步项目 workflow state。

幂等规则：

- 同一个 `taskId` 重复提交时，后端复用已有 `payments.workflow_task_id = taskId` 的收款记录。
- 财务台账通过 `(tenant_id, source_type, source_id, entry_type)` 幂等 upsert，重复提交不会重复入账。
- 如果 payment 已创建但 workflow complete 失败，小程序可以重试同一个请求；后端不会重复创建 payment。

失败行为：

| 场景 | HTTP | 小程序处理 |
| --- | --- | --- |
| 缺金额或金额小于等于 0 | 400 | 保持弹窗，提示用户修正金额。 |
| 未上传凭证 | 400 | 保持弹窗，提示至少上传 1 张凭证。 |
| 上传场景不支持 | 400 | 提示凭证上传失败；gooes 需补 `project_payment` 场景。 |
| 当前用户无权处理任务 | 403 | 刷新任务列表，提示无权限。 |
| 任务已被处理 | 409 | 刷新任务列表和项目详情，提示任务状态已变化。 |
| workflow 当前节点已变化 | 409 | 刷新任务列表和项目 workflow state。 |
| 网络失败或超时 | 客户端异常 | 允许用户重试同一任务提交。 |

## 5. orange 对接点

### 5.1 任务列表 status 透传

文件：`src/services/workflow_task.ts`

当前 API 后端支持 `status=pending|completed|canceled`，orange service 类型和请求 query 需要补上 `status`，避免 `TaskCenterService.list({ status })` 被丢弃。

建议：

```ts
list: (
  params: {
    page?: number;
    pageSize?: number;
    subject_type?: WorkflowSubjectType;
    status?: string;
  } = {},
) =>
  api.get<WorkflowTaskListPayload>('/workflow-tasks', {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    ...(params.subject_type ? { subject_type: params.subject_type } : {}),
    ...(params.status ? { status: params.status } : {}),
  }),
```

### 5.2 收款凭证上传 projectId

文件：`src/services/project_payment.ts`

当前 `uploadCollectionEvidence(filePaths)` 使用 `scene: 'project_payment'`，但未透传项目 ID。建议改为：

```ts
uploadCollectionEvidence: async (filePaths: string[], projectId: string) =>
  uploadImagesToCosDirectWithCompression({
    filePaths,
    scene: 'project_payment',
    projectId,
    compressedToastText: '检测到大图，已自动压缩上传',
    responseInvalidMessage: '收款凭证上传返回格式异常',
    oversizeMessage: '单张收款凭证不能超过 2MB，请重新选择',
  }),
```

对应 `usePaymentCollectionConfirm` 需要拿到当前 `projectId`，并传给上传 service。

### 5.3 任务中心深链

当前任务中心 `project_payment` 待办会跳转：

```text
/packageProjects/pages/detail/index?id=<projectId>
```

MVP 可接受。更顺的财务体验建议增强为：

```text
/packageProjects/pages/detail/index?id=<projectId>&workflowTaskId=<taskId>&action=confirm_payment
```

项目详情 `useProjectDetailLifecycle` 当前只读取 `id`。如果要支持深链，需要读取 `workflowTaskId` 和 `action`，在 `workflowActionOptions` 加载后匹配对应 action，并自动展开项目抽屉或直接打开收款弹窗。

## 6. 字段映射

| 后端 action/output 字段 | 小程序来源 | UI 建议 |
| --- | --- | --- |
| `payment_status` | 固定 `"success"` | 不需要展示输入项。 |
| `amount` | 财务输入 | 数字输入框，提交前校验大于 0。 |
| `paid_at` | 当前时间或时间选择器 | 现有弹窗已提供时间选择器。 |
| `evidence_images` | 上传后的图片 URL/路径 | 图片上传组件，至少 1 张。 |
| `remark` | 财务输入 | 多行文本，最多 500 字。 |
| `payment_type` | action output field 元数据 | 展示收款类型，例如定金、中期款、尾款。 |
| `payment_label` | action output field 元数据 | 弹窗标题或说明。 |
| `min_amount` | action output field 元数据 | 若存在，可作为前端校验下限。 |
| `required_percentage` | action output field 元数据 | 若存在，可作为说明文案，不替代后端校验。 |
| `min_image_count` | action output field 元数据 | 现有弹窗已读取，默认至少 1 张。 |

## 7. 兼容说明

- 后端仍返回 `payment_status` 字段，旧识别逻辑不会立刻失效。
- 新后端已经要求 `amount` 和 `evidence_images`；只提交 `{ payment_status: 'success' }` 会返回 400。
- 小程序不需要新增 `/payments` 写接口调用。
- 小程序可以保留 `getWorkflowTaskPaymentCollectionAction()` 的识别方式，但提交前必须读取 `output_fields` 并展示对应表单。
- 财务确认权限统一使用 `finance.payment.confirm`。

## 8. Smoke 验收清单

小程序改动完成后，用具备 `finance.payment.confirm` 的员工账号验证：

1. 打开任务中心，能看到 `project_payment` 类型的收款待办。
2. 点击待办进入项目详情，当前节点显示待确认收款。
3. 点击“确认收款”后出现金额、凭证、入账时间、备注输入。
4. 不填金额提交，前端提示金额必填或后端返回 400。
5. 不上传凭证提交，前端提示至少上传 1 张凭证或后端返回 400。
6. 填写金额并上传凭证，`/uploads/cos/direct-init` 使用 `scene=project_payment` 且成功返回 upload URL。
7. 提交 `POST /workflow-tasks/:taskId/complete` 成功。
8. 成功后项目详情刷新，当前 workflow 节点推进到下一节点。
9. 任务中心刷新后该待办不再出现。
10. 用同一个 taskId 重复提交一次请求，后端不重复生成 payment 和 ledger。
11. Admin 财务台账 `/finance/ledger?page=1&pageSize=20` 能看到一条 `project_payment` 收入流水。

## 9. 仓库边界

本次 gooes 仓库提供后端契约和文档。`orange` 小程序团队需要在自己的仓库完成小程序侧 service、上传参数和深链体验改造。

本次交接未修改 `/Users/leefo/Public/work/orange`。
