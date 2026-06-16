# 装修财务小程序对接说明

日期：2026-06-16

## 1. 范围

本文档用于 Gooes 后端/Admin 仓库向 WeChat 小程序仓库
`/Users/leefo/Public/work/orange` 交接装修财务第一阶段的收款确认对接。

本阶段只覆盖 workflow `payment_collection` 收款节点：

- 小程序通过任务中心或项目详情拿到收款待办。
- 财务人员在小程序输入入账金额、上传至少一张收款凭证、可选填写入账时间和备注。
- 小程序提交 `POST /workflow-tasks/:taskId/complete`。
- 后端创建或复用 confirmed payment，写入财务台账，然后完成 workflow task。

本阶段不要求小程序直接调用 `/payments` 创建流程收款，也不接入微信支付下单、支付回调、退款或企业付款。

## 2. 当前 orange 只读检查结果

本次只读检查了 `orange`，未修改其中任何文件。当前实现已有 workflow task 基础能力：

- `src/services/workflow_task.ts`
  - 已封装 `GET /workflow-tasks`。
  - 已封装 `POST /workflow-tasks/:taskId/complete`。
- `src/types/api/workflow_task.d.ts`
  - `WorkflowOutputField` 已支持 `number`、`datetime`、`image_list`、`payment_collection` 等字段类型。
  - `CompleteWorkflowTaskPayload.output` 已是 `Record<string, unknown>`，能承载新增字段。
- `src/services/task_center.ts`
  - 已把 workflow task 映射为任务中心待办。
  - 当前财务过滤仍识别旧项目收款确认权限常量，需要切换到 `finance.payment.confirm`。
- `src/utils/workflow_payment_collection.ts`
  - 已能识别 `payment_collection` action。
- `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts`
  - 当前 `confirm_payment` 只弹确认框。
  - 当前提交 output 只有 `{ payment_status: 'success' }`，不满足后端新校验。
- `src/services/expense_request.ts`、`src/packageEmployees/pages/expenseDetail/hooks/useExpenseDetailImages.ts`
  - 已有费用凭证图片上传链路，可参考其 `uploadImages()` 和 `ensureUploadedImages()` 模式。

## 3. 后端契约

### 3.1 获取任务

```http
GET /workflow-tasks?page=1&pageSize=20&subject_type=project
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

### 3.2 确认收款

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
      "https://example.com/payment.jpg"
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
| `output.evidence_images` | 是 | 收款凭证，至少 1 张；建议传上传后的远程 URL 或对象存储路径字符串。 |
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
| 当前用户无权处理任务 | 403 | 刷新任务列表，提示无权限。 |
| 任务已被处理 | 409 | 刷新任务列表和项目详情，提示任务状态已变化。 |
| workflow 当前节点已变化 | 409 | 刷新任务列表和项目 workflow state。 |
| 网络失败或超时 | 客户端异常 | 允许用户重试同一任务提交。 |

## 5. orange 改动建议

### 5.1 类型

文件：`src/types/api/workflow_task.d.ts`

现有 `WorkflowOutputField` 已能承载新字段。建议增加小程序侧收款表单类型，放在同文件或项目详情局部 model 中：

```ts
export interface PaymentCollectionCompleteOutput {
  payment_status: 'success';
  amount: number;
  paid_at?: string;
  evidence_images: string[];
  remark?: string | null;
}
```

### 5.2 权限识别

文件：`src/services/task_center.ts`

把旧权限常量替换为：

```ts
const FINANCE_PAYMENT_CONFIRM_PERMISSION = 'finance.payment.confirm';
```

`isFinancePaymentContext()` 中的 permission 判断改为读取 `finance.payment.confirm`。财务人员任务可见性仍以后端 `/workflow-tasks` 返回为准，小程序不要在前端硬编码更多业务权限规则。

### 5.3 项目详情确认收款入口

文件：`src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts`

当前逻辑：

```ts
const confirmed = await requestPaymentCollectionConfirm(option);
return confirmed ? { payment_status: 'success' } : null;
```

需要替换为“收款确认表单”：

- 金额输入：必填，取 `amount` 字段。
- 收款凭证：必填，至少 1 张，取 `evidence_images` 字段。
- 入账时间：可选，默认 `new Date().toISOString()` 或不传由后端生成。
- 备注：可选，取 `remark` 字段。

提交 output：

```ts
{
  payment_status: 'success',
  amount: paidAmount,
  paid_at: paidAt || new Date().toISOString(),
  evidence_images: evidenceImages,
  remark: trimText(remark) || null,
}
```

### 5.4 凭证上传

可复用费用申请的图片上传模式：

- `src/services/expense_request.ts`
- `src/packageEmployees/pages/expenseDetail/hooks/useExpenseDetailImages.ts`

建议新增一个项目收款凭证上传 helper，或复用现有通用上传工具：

```ts
uploadImagesToCosDirectWithCompression({
  filePaths,
  scene: 'project_payment',
  compressedToastText: '检测到大图，已自动压缩上传',
  responseInvalidMessage: '收款凭证上传返回格式异常',
  oversizeMessage: '单张收款凭证不能超过 2MB，请重新选择',
})
```

最终提交给后端的 `evidence_images` 建议为上传返回的 URL 或对象存储路径字符串数组。

### 5.5 任务中心跳转

文件：`src/services/task_center.ts`

现有 `project_payment` 待办已经会跳转项目详情。保留该路径即可：

```text
/packageProjects/pages/detail/index?id=<projectId>
```

项目详情页需要在识别 `confirm_payment` action 后打开新的收款确认弹窗，而不是只弹确认框。

## 6. 字段映射

| 后端 action/output 字段 | 小程序来源 | UI 建议 |
| --- | --- | --- |
| `payment_status` | 固定 `"success"` | 不需要展示输入项。 |
| `amount` | 财务输入 | 数字输入框，保留两位金额展示。 |
| `paid_at` | 当前时间或时间选择器 | 可默认当前时间，允许后续补时间选择。 |
| `evidence_images` | 上传后的图片 URL/路径 | 图片上传组件，至少 1 张。 |
| `remark` | 财务输入 | 多行文本，最多 500 字。 |
| `payment_type` | action.output_fields 元数据 | 展示收款类型，例如定金、中期款、尾款。 |
| `payment_label` | action.output_fields 元数据 | 弹窗标题或说明。 |
| `min_amount` | action.output_fields 元数据 | 若存在，可作为前端校验下限。 |
| `required_percentage` | action.output_fields 元数据 | 若存在，可作为说明文案，不替代后端校验。 |

## 7. 兼容说明

- 后端仍返回 `payment_status` 字段，旧识别逻辑不会立刻失效。
- 新后端已经要求 `amount` 和 `evidence_images`；只提交 `{ payment_status: 'success' }` 会返回 400。
- 小程序不需要新增 `/payments` 写接口调用。
- 小程序可以保留 `getWorkflowTaskPaymentCollectionAction()` 的识别方式，但提交前必须读取 `output_fields` 并展示对应表单。
- 小程序需要把旧项目收款确认权限常量替换为 `finance.payment.confirm`。

## 8. Smoke 验收清单

小程序改动完成后，用具备 `finance.payment.confirm` 的员工账号验证：

1. 打开任务中心，能看到 `project_payment` 类型的收款待办。
2. 点击待办进入项目详情，当前节点显示待确认收款。
3. 点击“确认收款”后出现金额、凭证、入账时间、备注输入。
4. 不填金额提交，前端提示金额必填或后端返回 400。
5. 不上传凭证提交，前端提示至少上传 1 张凭证或后端返回 400。
6. 填写金额并上传凭证后提交成功。
7. 成功后项目详情刷新，当前 workflow 节点推进到下一节点。
8. 任务中心刷新后该待办不再出现。
9. 用同一个 taskId 重复提交一次请求，后端不重复生成 payment 和 ledger。
10. 财务台账 `/finance/ledger?page=1&pageSize=20` 能看到一条 `project_payment` 收入流水。

## 9. 仓库边界

本次 gooes 仓库已经提供后端契约和文档。`orange` 小程序团队需要在自己的仓库完成 UI、上传和提交 payload 改造。

本次交接未修改 `/Users/leefo/Public/work/orange`。
