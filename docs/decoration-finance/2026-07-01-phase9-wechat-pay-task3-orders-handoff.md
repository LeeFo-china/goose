# Phase 9 微信支付 Task 3 订单 API、Admin 只读页与小程序 Handoff

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮完成微信支付订单基线，不接真实微信支付下单。

已完成：

1. 后端订单创建 API：
   - `POST /finance/wechat-pay/orders`
   - 写入 `wechat_payment_orders`
   - 生成唯一 `out_trade_no`
   - 绑定 `project_id`、`receivable_plan_id`、`workflow_task_id`、`workflow_instance_id`
   - 返回 `pending` 订单和 `payment_request: null`

2. 后端订单列表 API：
   - `GET /finance/wechat-pay/orders`
   - 支持分页。
   - 支持 `status`、`project_id`、`receivable_plan_id`、`workflow_task_id` 筛选。

3. Admin 只读页：
   - `/finance/wechat-pay/orders`
   - 从微信支付配置页 `/finance/wechat-pay` 可进入。
   - 只展示订单，不提供确认收款、改状态、关闭订单或退款操作。

4. 小程序 handoff：
   - 本轮不修改 orange 仓库。
   - 明确小程序后续只通过 workflow action 触发微信支付订单创建。
   - 小程序不得绕过 workflow 直接调用 `/payments`。

## API 契约

### POST /finance/wechat-pay/orders

用途：为一个收款 workflow 待办创建微信支付订单。

认证：

- 员工登录 token。
- 必须有租户上下文。
- 当前员工必须能执行对应 `workflow_task_id` 的待办。

请求：

```json
{
  "project_id": "project-id",
  "receivable_plan_id": "receivable-plan-id",
  "workflow_task_id": "workflow-task-id",
  "amount": 8000
}
```

字段说明：

- `project_id`：项目 ID。
- `receivable_plan_id`：当前收款节点关联的应收计划 ID。
- `workflow_task_id`：当前收款 workflow 待办 ID。
- `amount`：本次微信支付订单金额，必须大于 0，且不能超过应收计划剩余金额。

返回示例：

```json
{
  "idempotent": false,
  "payment_request": null,
  "order": {
    "id": "order-id",
    "tenant_id": "tenant-id",
    "payment_config_id": "config-id",
    "project_id": "project-id",
    "workflow_instance_id": "workflow-instance-id",
    "workflow_task_id": "workflow-task-id",
    "receivable_plan_id": "receivable-plan-id",
    "payment_id": null,
    "out_trade_no": "WX202607011130001234ABCD",
    "transaction_id": null,
    "amount": 8000,
    "paid_amount": 0,
    "currency": "CNY",
    "status": "pending",
    "prepay_id": null,
    "paid_at": null,
    "created_at": "2026-07-01T11:30:00.000Z"
  },
  "receivable_plan": {
    "id": "receivable-plan-id",
    "title": "中期进度款",
    "amount": 10000,
    "paid_amount": 2000,
    "remaining_amount": 8000,
    "status": "partially_paid"
  }
}
```

当前说明：

- `payment_request` 固定为 `null`。
- 本轮不会调用微信支付真实下单接口。
- 本轮不会生成 `prepay_id`。
- 本轮不会创建 `payments`。
- 本轮不会写 `finance_ledger`。
- 本轮不会推进 workflow。
- 创建订单前会校验微信支付配置：
  - 配置必须为 `active`。
  - 服务商子商户模式必须已有 `sub_mchid` / `sub_appid`。
  - 服务商子商户模式必须 `applyment_state=opened` 且 `appid_binding_state=bound`。
- 订单 `metadata` 会记录非敏感路由信息：
  - `principal_type`
  - `merchant_mode`
  - `merchant_id`
  - `sub_merchant_id`
  - `app_id`
  - `sub_app_id`

这些能力留到 Task 4 的真实微信支付下单和回调闭环。

### 幂等规则

同一个租户下，同一个 `workflow_task_id` 如果已有 `pending`
微信支付订单，重复请求会返回已有订单：

```json
{
  "idempotent": true,
  "payment_request": null,
  "order": {
    "id": "existing-order-id",
    "status": "pending"
  },
  "receivable_plan": null
}
```

前端可以把这个行为当成防重复点击能力。不要因为重复点击再本地生成新订单号。

### 校验与错误码

稳定错误码：

- `WECHAT_PAY_TASK_NOT_FOUND`：流程待办不存在。
- `WECHAT_PAY_TASK_NOT_PENDING`：流程待办已处理。
- `WECHAT_PAY_INSTANCE_NOT_FOUND`：流程实例不存在。
- `WECHAT_PAY_TASK_PROJECT_MISMATCH`：待办不属于当前项目。
- `WECHAT_PAY_NODE_NOT_CURRENT`：待办节点不是当前节点。
- `WECHAT_PAY_TASK_NOT_PAYMENT_COLLECTION`：待办不是收款节点。
- `WECHAT_PAY_TASK_NOT_EXECUTABLE`：当前员工无权执行该待办。
- `WECHAT_PAY_RECEIVABLE_NOT_FOUND`：应收计划不存在。
- `WECHAT_PAY_RECEIVABLE_PROJECT_MISMATCH`：应收计划不属于当前项目。
- `WECHAT_PAY_AMOUNT_EXCEEDS_RECEIVABLE`：订单金额超过应收剩余金额。
- `WECHAT_PAY_CONFIG_NOT_ACTIVE`：微信支付配置未启用。
- `WECHAT_PAY_CONFIG_INCOMPLETE`：微信支付商户号或 AppID 未配置。
- `WECHAT_PAY_SUB_MERCHANT_NOT_READY`：租户特约商户尚未开通或 AppID 未完成绑定。

通用错误：

- `TENANT_CONTEXT_REQUIRED`：缺少租户上下文。
- `VALIDATION_ERROR`：请求参数格式不正确。
- `FORBIDDEN`：无读取订单列表权限。

### GET /finance/wechat-pay/orders

用途：Admin 只读查看微信支付订单。

权限：

- 员工登录 token。
- 必须有租户上下文。
- 需要 `wechat_pay.order.read`。

Query：

```text
page=1
pageSize=20
status=pending
project_id=project-id
receivable_plan_id=receivable-plan-id
workflow_task_id=workflow-task-id
```

分页：

- 默认 `page=1&pageSize=20`。
- `pageSize` 最大 100。

返回：

```json
{
  "list": [
    {
      "id": "order-id",
      "out_trade_no": "WX202607011130001234ABCD",
      "amount": 8000,
      "paid_amount": 0,
      "status": "pending",
      "transaction_id": null,
      "created_at": "2026-07-01T11:30:00.000Z",
      "project": {
        "id": "project-id",
        "name": "张三项目",
        "status": "construction"
      },
      "receivable_plan": {
        "id": "receivable-plan-id",
        "title": "中期进度款",
        "payment_type": "stage_2",
        "status": "partially_paid"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## Admin 对接

页面：

- `/finance/wechat-pay`：商户配置页，新增“支付订单”入口。
- `/finance/wechat-pay/orders`：微信支付订单只读页。

订单页展示：

- 创建时间。
- 项目。
- workflow task ID。
- 应收计划。
- 商户订单号 `out_trade_no`。
- 订单金额。
- 已付金额。
- 状态。
- 微信交易号 `transaction_id`。
- 支付时间。

订单页行为：

- 支持状态筛选。
- 支持分页。
- 不提供写操作。
- 不手工确认收款。
- 不手工推进 workflow。

## 小程序对接口径

本轮 orange 无必改。

小程序后续接入时必须遵守：

1. 收款入口仍以 workflow 为唯一来源。
   - 只从 `workflow_state.actions`、`timeline_nodes[].actions` 或
     `/workflow-tasks?status=pending` 读取动作。
   - 不根据节点名称、本地枚举、旧状态字段或 `action_label` 推导微信支付能力。

2. 小程序不要直接调用 `/payments`。
   - 微信支付订单创建走 `POST /finance/wechat-pay/orders`。
   - 支付成功后的 `payments`、`finance_ledger`、应收核销和 workflow 推进由后端回调闭环处理。

3. 小程序不要本地生成 `out_trade_no`。
   - 订单号由后端生成。
   - 同一个 `workflow_task_id` 重复创建会返回已有 pending 订单。

4. 当前 Task 3 不拉起微信支付。
   - `payment_request` 为 `null`。
   - 小程序可以先按只读/占位结果处理，不调用 `wx.requestPayment`。
   - Task 4 后端返回真实 `prepay_id` 和支付参数后，再接 `wx.requestPayment`。

5. 金额来源以后应来自后端 workflow action / node attributes。
   - 当前创建接口要求提交 `amount`。
   - 小程序不应自行计算应收剩余金额。
   - 当后端在 workflow action 输出 `receivable_context` / `payment_order_context`
     时，小程序按后端字段展示和提交。

## 建议的小程序调用顺序

Task 4 之前：

1. 员工进入项目详情或任务中心。
2. 读取 workflow v2 actions。
3. 如果后端没有返回微信支付动作，则保持现有人工确认收款流程。
4. 如果后端返回订单创建动作，可调用 `POST /finance/wechat-pay/orders` 创建 pending 订单。
5. 看到 `payment_request: null` 时，不拉起微信支付，只展示“订单已创建/等待支付能力开放”。

Task 4 之后：

1. 继续从 workflow action 进入。
2. 调用订单创建接口。
3. 后端返回 `payment_request`。
4. 小程序调用 `wx.requestPayment`。
5. 支付成功以后等待后端回调处理。
6. 刷新项目详情和 workflow state。

## Smoke 建议

后端：

1. 用能执行收款待办的财务账号登录。
2. 查询 `/workflow-tasks?status=pending&subject_type=project`。
3. 选取 payment collection 待办。
4. 确认待办 action、应收计划 ID 和剩余金额。
5. 调用 `POST /finance/wechat-pay/orders`。
6. 再次调用同一请求，确认 `idempotent=true` 且订单 ID 不变。
7. 调用 `GET /finance/wechat-pay/orders?status=pending`，确认订单可见。

Admin：

1. 打开 `/finance/wechat-pay/orders`。
2. 确认订单号、项目、应收计划、金额、状态、创建时间可见。
3. 使用状态筛选。
4. 确认页面没有写操作按钮。

小程序：

1. 当前阶段只做只读口径确认。
2. 不执行 `/payments`。
3. 不执行 workflow complete。
4. 不调用 `wx.requestPayment`。

## 本轮验证

API：

```bash
cd apps/api
bun test src/schema/wechat-pay-orders.test.ts src/services/wechat-pay-orders.test.ts
bun run typecheck
bun run build
bun run check:file-size
```

Admin：

```bash
cd apps/admin
bun test components/finance/finance-wechat-pay-orders-page-layout.test.ts components/finance/finance-wechat-pay-page-layout.test.ts
pnpm run check
```

全局：

```bash
git diff --check
```

## 未纳入本轮

- 真实微信支付统一下单。
- `prepay_id` 生成。
- `wx.requestPayment` 参数返回。
- 微信支付回调验签。
- 回调幂等确认 payment。
- 自动写入 finance ledger。
- 自动核销 receivable plan。
- 自动推进 workflow。
- 退款和关单。
