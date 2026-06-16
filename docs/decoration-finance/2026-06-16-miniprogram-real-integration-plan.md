# 小程序真实联调执行计划

日期：2026-06-16

## 1. 目标

把装修财务一期的 `payment_collection` 收款节点从“API/Admin 已可验收”推进到“小程序财务人员可真实操作”。

验收标准：

- 财务人员能在小程序任务中心看到项目收款待办。
- 能从待办进入项目详情并完成金额、凭证、入账时间、备注录入。
- 凭证能通过 gooes direct COS 上传成功。
- `POST /workflow-tasks/:taskId/complete` 成功后，后端创建 `confirmed` payment、写入 `finance_ledger_entries`，并推进 workflow。
- Admin 财务台账能看到对应 `project_payment` 收入流水。

## 2. 当前状态

gooes 已完成：

- workflow `payment_collection` bridge。
- confirmed payment 创建。
- finance ledger 写入。
- `finance.payment.confirm` 权限和角色授权。
- Admin 财务台账入口。
- Task 6 端到端验收记录。

orange 只读检查结果：

- 已有任务中心、项目详情、收款确认弹窗、金额校验、凭证上传、complete 提交逻辑。
- 已使用 `finance.payment.confirm`。
- 已使用 `scene: 'project_payment'` 上传收款凭证。

阻塞真实联调的缺口：

1. gooes direct upload 场景未包含 `project_payment`。
2. orange 上传凭证未传 `projectId`。
3. orange `WorkflowTaskService.list()` 未透传 `status`。
4. 任务中心跳转项目详情暂未深链到具体收款动作。

## 3. 执行任务

### Task A：gooes 支持 `project_payment` 上传场景

Owner：gooes

目标：

- `/uploads/cos/direct-init` 接受 `scene: 'project_payment'`。
- `/uploads/cos/direct-complete` 接受同一场景。
- 建议要求 `project_id`，对象路径绑定到项目，避免财务凭证变成只有租户维度的散落图片。

涉及文件：

- `apps/api/src/controllers/uploads/index.ts`

建议实现：

- 将 `project_payment` 加入 `DIRECT_UPLOAD_SCENES`。
- 将 `project_payment` 加入 `PROJECT_REQUIRED_UPLOAD_SCENES`。
- 在 `assertDirectUploadProjectAccess()` 中为 `project_payment` 允许具备 `finance.payment.confirm` 的员工上传。
- 对 `assertDirectObjectKeyBelongsToActor()` 保持项目段校验。

验证：

```bash
bun run api:check
bun test apps/api/src/services/workflow-task-payment-bridge.test.ts
```

接口 smoke：

```http
POST /uploads/cos/direct-init
{
  "scene": "project_payment",
  "project_id": "<project-id>",
  "filename": "payment.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 120000
}
```

预期：返回 `upload_url` 和 `object_key`，且 object key 包含 `project-payment/projects/<project-id>/`。

### Task B：orange 上传凭证传 `projectId`

Owner：orange 小程序团队

目标：

- `ProjectPaymentService.uploadCollectionEvidence()` 接收 `projectId`。
- `usePaymentCollectionConfirm` 或调用方把当前项目 ID 传入上传 service。

涉及文件：

- `src/services/project_payment.ts`
- `src/packageProjects/pages/detail/hooks/usePaymentCollectionConfirm.ts`
- `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts`

建议接口：

```ts
uploadCollectionEvidence(filePaths: string[], projectId: string)
```

上传调用继续使用：

```ts
uploadImagesToCosDirectWithCompression({
  filePaths,
  scene: 'project_payment',
  projectId,
  compressedToastText: '检测到大图，已自动压缩上传',
  responseInvalidMessage: '收款凭证上传返回格式异常',
  oversizeMessage: '单张收款凭证不能超过 2MB，请重新选择',
})
```

### Task C：orange 透传 workflow task status

Owner：orange 小程序团队

目标：

- `TaskCenterService.list({ status })` 传给 `WorkflowTaskService.list()` 后不会丢失。
- `GET /workflow-tasks` 请求带上 `status=pending`。

涉及文件：

- `src/services/workflow_task.ts`

建议补充：

```ts
status?: string;
```

并在 query 中加入：

```ts
...(params.status ? { status: params.status } : {}),
```

### Task D：任务中心深链收款动作

Owner：orange 小程序团队，可作为体验增强排在 Task B/C 后。

目标：

- 财务人员从任务中心点“确认收款”后，不需要在项目详情里二次寻找动作。

建议：

- 任务中心 `target_url` 增加 `workflowTaskId=<taskId>&action=confirm_payment`。
- 项目详情 `useProjectDetailLifecycle` 读取这两个参数。
- `workflowActionOptions` 加载后，按 `workflowTaskId` 匹配 action。
- 自动打开项目抽屉或直接打开 `PaymentCollectionConfirmPopup`。

MVP 可以先不做此项，但验收时要确认项目详情里有清晰可见的“确认收款”入口。

### Task E：真实联调验收

Owner：gooes + orange

前置：

- API 服务运行在 `http://127.0.0.1:3000` 或小程序配置的 `TARO_APP_BASEURL`。
- 使用具备 `finance.payment.confirm` 的员工账号。
- 库中存在项目 workflow 当前节点为 `payment_collection` 的待办。

验收步骤：

1. 小程序登录财务员工。
2. 打开任务中心。
3. 看到 `project_payment` 待办。
4. 点击进入项目详情。
5. 打开“确认收款”。
6. 不填金额提交，前端提示或后端 400。
7. 填金额但不上传凭证提交，前端提示或后端 400。
8. 上传凭证，确认 `direct-init` 的 `scene=project_payment` 成功。
9. 提交收款。
10. 小程序提示收款已确认。
11. 项目详情 workflow 推进到下一节点。
12. 任务中心刷新后该任务不再出现。
13. Admin 财务台账出现一条 `entry_type=project_payment`、`direction=in` 的流水。
14. 重放同一 task complete 请求，后端不重复生成 payment 和 ledger。

验收记录落到：

```text
docs/decoration-finance/2026-06-16-miniprogram-integration-acceptance.md
```

## 4. 风险和处理

| 风险 | 处理 |
| --- | --- |
| 上传场景补成租户级但不要求项目 ID | 短期可用，但凭证难以按项目追踪；建议第一版就要求 `project_id`。 |
| 小程序仍不传 `status` | 默认后端是 `pending`，当前影响有限；但会让任务中心状态筛选不可靠，需要补。 |
| 财务账号缺 `finance.payment.confirm` | 后端不会返回或不允许完成 task；先在权限配置里确认角色授权。 |
| task 已被他人处理 | 小程序按 409 刷新并提示任务状态已变化。 |
| 微信支付后续接入 | 当前 output 和 payment/ledger 都保留 `payment_channel`、source 字段，可平滑从 manual 切到 wechat callback 驱动。 |

## 5. 仓库边界

- gooes 可修改后端、Admin、docs。
- `/Users/leefo/Public/work/orange` 本轮只读，不在 gooes 会话中修改。
- orange 侧改动由小程序团队在 orange 仓库完成。
