# 小程序财务收款联调验收记录

日期：2026-06-16

## 1. 验收范围

本记录覆盖装修财务一期小程序收款联调准备状态：

- gooes API 已支持 `project_payment` 收款凭证直传。
- orange 小程序已补齐收款凭证上传 `projectId` 和 workflow task `status` 透传。
- API/Admin 服务已拉起，具备进行真实点击联调的环境。
- 后端侧 contract smoke 已通过。

微信开发者工具/真机中的小程序点击链路需要小程序团队或现场操作继续执行，本记录不把未实际点击的步骤标记为已完成。

## 2. 相关提交

gooes：

```text
61c707e feat(api): 支持项目收款凭证直传
45625fe docs: 更新小程序财务联调计划
```

orange 只读核对：

```text
b611426e209bddad80cb1018bb7a97c3413c2330 fix(finance): 补齐收款联调参数
```

orange 提交涉及文件：

```text
src/packageProjects/pages/detail/hooks/usePaymentCollectionConfirm.ts
src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts
src/services/project_payment.ts
src/services/task_center.ts
src/services/workflow_task.ts
```

本次 gooes 会话未修改 `/Users/leefo/Public/work/orange`。

## 3. 服务状态

API：

```text
http://127.0.0.1:3000
PID: 50939
command: bun --watch src/app.ts
GET / -> 200 OK {"hello":"world"}
```

Admin：

```text
http://localhost:3010
PID: 55876
command: next dev -p 3010
HEAD / -> 307 Temporary Redirect, location: /dashboard
```

Admin dev server 输出：

```text
Next.js 15.5.15
Local: http://localhost:3010
Environments: .env.local
Ready in 2.4s
```

## 4. orange 只读核对结果

### 4.1 收款凭证上传传 projectId

`ProjectPaymentService.uploadCollectionEvidence()` 已从：

```ts
uploadCollectionEvidence(filePaths)
```

变更为：

```ts
uploadCollectionEvidence(filePaths, projectId)
```

并透传：

```ts
uploadImagesToCosDirectWithCompression({
  filePaths,
  scene: 'project_payment',
  projectId,
})
```

`usePaymentCollectionConfirm()` 已接收 `projectId`，上传前会校验项目 ID：

```text
项目 ID 缺失，无法上传收款凭证
```

### 4.2 Workflow task status 透传

`WorkflowTaskService.list()` 已增加：

```ts
status?: string;
```

请求 query 已增加：

```ts
...(params.status ? { status: params.status } : {}),
```

`TaskCenterService.list()` 默认请求：

```text
status=pending
```

`TaskCenterService.summary()` 也已明确请求 `status: 'pending'`。

## 5. 后端侧自动验证

### 5.1 Focused API Tests

命令：

```bash
cd apps/api
bun test src/controllers/uploads/index.test.ts src/services/workflow-task-payment-bridge.test.ts
```

结果：

```text
7 pass
0 fail
17 expect() calls
```

覆盖点：

- `project_payment` direct upload init 接受 `project_id`。
- `project_payment` direct upload complete 接受同一项目对象路径。
- 缺少 `project_id` 时返回 400。
- 无 `finance.payment.confirm` 项目访问权时返回 403。
- 收款 workflow bridge 创建 confirmed payment、写入 ledger、推进 runtime。
- 同一 workflow task 重试不会重复创建 payment。

### 5.2 API Check

命令：

```bash
bun run api:check
```

结果：

```text
tsc -p tsconfig.json --noEmit
bun build src/app.ts --outdir dist --target node
API file size check passed. threshold=500, exemptions=0
```

## 6. 真实小程序点击验收清单

状态：待微信开发者工具/真机执行。

前置：

- 小程序 API 地址指向 `http://127.0.0.1:3000`，或同一可访问 API host。
- 财务账号具备 `finance.payment.confirm`。
- 数据库存在项目 workflow 当前节点为 `payment_collection` 的 pending 待办。

待执行步骤：

1. 财务账号登录小程序。
2. 打开任务中心。
3. 看到 `project_payment` 类型待办。
4. 点击待办进入项目详情。
5. 打开“确认收款”。
6. 不填金额提交，前端提示金额必填或后端返回 400。
7. 填金额但不上传凭证提交，前端提示至少上传 1 张凭证或后端返回 400。
8. 上传凭证，确认 `/uploads/cos/direct-init` 请求包含：

```json
{
  "scene": "project_payment",
  "project_id": "<project-id>"
}
```

9. 提交 `POST /workflow-tasks/:taskId/complete`。
10. 小程序提示“收款已确认”。
11. 项目详情 workflow 推进到下一节点。
12. 任务中心刷新后该待办消失。
13. Admin 财务台账出现 `entry_type=project_payment`、`direction=in` 的入账流水。
14. 重放同一 task complete 请求，后端不重复生成 payment 和 ledger。

## 7. 待补证据

真实小程序点击完成后，需要补充以下证据：

- 小程序任务中心待办截图或录屏。
- `/uploads/cos/direct-init` 请求摘要，至少包含 `scene` 和 `project_id`。
- `/workflow-tasks/:taskId/complete` 请求/响应摘要。
- Admin 财务台账截图或接口响应摘要。
- 重放同一 task 后 payment/ledger 未重复的验证结果。

## 8. 当前结论

截至 2026-06-16 22:26 CST：

- gooes API/Admin 联调环境已拉起。
- gooes 后端 contract smoke 已通过。
- orange 两个必改项已通过只读提交核对。
- 真实小程序点击链路尚未在本会话执行，需要小程序团队或现场设备继续完成。
