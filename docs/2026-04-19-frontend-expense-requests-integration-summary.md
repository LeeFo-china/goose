# 费用申请前端对接摘要

本文档面向前端 / 后台管理页联调。

以当前后端已经落地的 `expense-requests` 真实接口为准，不要再按旧的 `expense_requests` 数据表结构自行猜字段。

如果前端需要直接照抄的请求封装和页面状态示例，再看：
[2026-04-19-frontend-expense-requests-code-examples.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-frontend-expense-requests-code-examples.md:1)

---

## 1. 这次前端需要对接什么

前端现在需要支持一套完整的费用申请流程：

1. 创建费用申请草稿
2. 编辑费用申请草稿
3. 提交费用申请
4. 审批通过
5. 审批驳回
6. 撤回费用申请
7. 财务登记打款

如果页面只先做员工端，至少要先支持：

- 草稿创建
- 草稿编辑
- 提交
- 查看审批结果

---

## 2. 当前可用接口

### 2.1 基础接口

```http
GET /expense-requests
GET /expense-requests/:id
POST /expense-requests
PATCH /expense-requests/:id
```

### 2.2 动作接口

```http
POST /expense-requests/:id/submit
POST /expense-requests/:id/approve
POST /expense-requests/:id/reject
POST /expense-requests/:id/cancel
POST /expense-requests/:id/pay
```

---

## 3. 核心业务规则

### 3.1 状态值

当前费用申请主状态：

- `draft`
- `pending`
- `approved`
- `rejected`
- `paid`
- `cancelled`

### 3.2 当前审批节点

当前节点值：

- `draft`
- `manager_review`
- `finance_review`
- `payment`
- `done`
- `cancelled`

### 3.3 模式值

当前费用申请模式：

- `reimbursement`
- `advance`
- `direct`
- `petty_cash`

### 3.4 核心规则

- 草稿和驳回状态允许编辑
- `pending` 后不允许继续编辑
- 提交前至少要有 1 条费用明细
- 提交后进入 `pending + manager_review`
- 第一次 `approve` 会把节点推进到 `finance_review`
- 第二次 `approve` 才会真正进入 `approved + payment`
- 只有 `approved + payment` 才能调用支付接口
- 支付完成后状态变成 `paid + done`

---

## 4. 推荐页面拆分

建议至少拆成 3 个页面：

1. 费用申请列表页
2. 费用申请详情 / 编辑页
3. 财务支付登记弹窗或页面

### 4.1 员工端列表页

建议展示：

- 单号 `request_no`
- 标题 `title`
- 模式 `mode`
- 总金额 `total_amount`
- 状态 `status`
- 当前节点 `current_step`
- 创建时间

### 4.2 详情 / 编辑页

建议展示 4 个区块：

1. 基础信息
   - 标题
   - 模式
   - 关联项目

2. 费用明细
   - 发生时间
   - 分类
   - 金额
   - 发票号
   - 商户名称
   - 说明
   - 附件

3. 审批记录
   - 节点
   - 动作
   - 审批人
   - 时间
   - 备注

4. 支付信息
   - 仅 `paid` 后展示

### 4.3 财务支付页

建议字段：

- 收款人
- 收款银行
- 收款账号
- 支付方式
- 打款金额
- 打款时间
- 打款登记人
- 打款凭证
- 支付备注

---

## 5. 创建费用申请

### 请求

```http
POST /expense-requests
Content-Type: application/json
```

```json
{
  "employee_id": "f2a2f1fa-0d20-4a8a-9d26-2a35a1945610",
  "project_id": null,
  "mode": "reimbursement",
  "title": "4 月材料采购报销",
  "items": [
    {
      "occurred_at": "2026-04-19T09:00:00.000Z",
      "category": "材料费",
      "amount": 320.5,
      "remark": "木工辅料采购",
      "invoice_no": "FP20260419001",
      "vendor_name": "郑州建材店",
      "evidence_images": [
        "https://example.com/e1.jpg"
      ]
    }
  ]
}
```

### 前端注意

- 创建时就可以带明细
- `items` 可以为空，但空明细只能保存草稿，不能提交
- 创建成功后建议直接跳转详情页

---

## 6. 编辑费用申请

### 请求

```http
PATCH /expense-requests/:id
Content-Type: application/json
```

```json
{
  "title": "4 月材料采购报销-修订",
  "items": [
    {
      "occurred_at": "2026-04-19T09:00:00.000Z",
      "category": "材料费",
      "amount": 320.5,
      "remark": "木工辅料采购",
      "invoice_no": "FP20260419001",
      "vendor_name": "郑州建材店",
      "evidence_images": [
        "https://example.com/e1.jpg"
      ]
    },
    {
      "occurred_at": "2026-04-19T12:00:00.000Z",
      "category": "运输费",
      "amount": 80,
      "remark": "货拉拉",
      "invoice_no": null,
      "vendor_name": "货拉拉",
      "evidence_images": []
    }
  ]
}
```

### 前端规则

- 只有 `draft` 和 `rejected` 状态允许编辑
- 后端会整单替换明细，不是局部 patch 某一条明细
- 前端编辑明细时建议本地维护完整数组后整体提交

---

## 7. 提交费用申请

### 请求

```http
POST /expense-requests/:id/submit
Content-Type: application/json
```

```json
{
  "operator_id": "f2a2f1fa-0d20-4a8a-9d26-2a35a1945610",
  "comment": "请审批"
}
```

### 提交后的行为

- 状态变为 `pending`
- 当前节点变为 `manager_review`
- 写入一条审批记录

### 前端规则

- 提交前必须校验至少 1 条明细
- 金额合计必须大于 0
- 提交成功后，编辑入口应切只读

---

## 8. 审批通过

### 请求

```http
POST /expense-requests/:id/approve
Content-Type: application/json
```

```json
{
  "approver_id": "a19c0b30-0d22-4334-89dc-b66c89e35165",
  "comment": "通过"
}
```

### 行为说明

第一次通过：

- `pending + manager_review`
  ->
- `pending + finance_review`

第二次通过：

- `pending + finance_review`
  ->
- `approved + payment`

### 前端规则

- 前端不要假设一次审批就结束
- 审批按钮文案可以统一叫“通过”，但状态刷新后要看 `current_step`

---

## 9. 审批驳回

### 请求

```http
POST /expense-requests/:id/reject
Content-Type: application/json
```

```json
{
  "approver_id": "a19c0b30-0d22-4334-89dc-b66c89e35165",
  "rejected_reason": "附件不完整，请补发票",
  "comment": "附件不完整，请补发票"
}
```

### 驳回后的行为

- 状态变为 `rejected`
- 当前节点变为 `draft`
- 申请人可再次编辑并重新提交

### 前端规则

- 驳回后应展示 `rejected_reason`
- 驳回后重新开放编辑
- 重新提交仍然走 `submit` 接口，不是单独的 `resubmit` 接口

---

## 10. 撤回费用申请

### 请求

```http
POST /expense-requests/:id/cancel
Content-Type: application/json
```

```json
{
  "operator_id": "f2a2f1fa-0d20-4a8a-9d26-2a35a1945610",
  "comment": "本单撤回"
}
```

### 前端规则

- `draft`、`pending`、`rejected` 可撤回
- `approved` 和 `paid` 不允许撤回

---

## 11. 财务登记支付

### 请求

```http
POST /expense-requests/:id/pay
Content-Type: application/json
```

```json
{
  "payee_name": "张三",
  "payee_bank": "招商银行",
  "payee_account": "6225888888888888",
  "method": "bank_transfer",
  "paid_amount": 400.5,
  "paid_at": "2026-04-19T16:00:00.000Z",
  "paid_by": "f2a2f1fa-0d20-4a8a-9d26-2a35a1945610",
  "evidence_images": [
    "https://example.com/pay-proof-1.jpg"
  ],
  "remark": "已打款"
}
```

### 前端规则

- 只有 `approved + payment` 可支付
- `paid_amount` 必须等于 `total_amount`
- `evidence_images` 至少 1 张
- `paid_by` 必传

### 支付成功后的行为

- 状态变为 `paid`
- 当前节点变为 `done`
- 详情页应切成只读

---

## 12. 列表查询

### 请求

```http
GET /expense-requests?page=1&pageSize=20
GET /expense-requests?page=1&pageSize=20&status=pending
GET /expense-requests?page=1&pageSize=20&mode=reimbursement
GET /expense-requests?page=1&pageSize=20&current_step=finance_review
GET /expense-requests?page=1&pageSize=20&employee_id=<employeeId>
GET /expense-requests?page=1&pageSize=20&keyword=ER2026
```

### 当前支持的查询参数

- `page`
- `pageSize`
- `employee_id`
- `assignee_id`
- `project_id`
- `status`
- `mode`
- `current_step`
- `keyword`

---

## 13. 返回结构

### 列表接口

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0
    }
  },
  "message": "success"
}
```

### 详情接口

详情会直接带联查结果，主要结构包括：

- `employee`
- `project`
- `assignee`
- `items`
- `approvals`
- `settlement`

### 关键字段

- `request_no`：单号
- `total_amount`：总金额
- `status`：主状态
- `current_step`：当前节点
- `submitted_at / approved_at / rejected_at / cancelled_at / completed_at`
- `rejected_reason`

---

## 14. 前端状态矩阵

| 状态 | 是否可编辑 | 是否可提交 | 是否可审批 | 是否可支付 | 是否可撤回 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `draft` | 可以 | 可以 | 不可以 | 不可以 | 可以 |
| `pending` | 不可以 | 不可以 | 可以 | 不可以 | 可以 |
| `approved` | 不可以 | 不可以 | 不可以 | 仅 `current_step=payment` 时可以 | 不可以 |
| `rejected` | 可以 | 可以 | 不可以 | 不可以 | 可以 |
| `paid` | 不可以 | 不可以 | 不可以 | 不可以 | 不可以 |
| `cancelled` | 不可以 | 不可以 | 不可以 | 不可以 | 不可以 |

---

## 15. 前端最容易踩错的点

- 把 `pending` 理解成“已审批通过”
- 以为一次 `approve` 就会直接进入 `approved`
- 在 `pending` 状态下继续允许编辑
- 驳回后没有重新开放编辑
- 支付时 `paid_amount` 不等于 `total_amount`
- 支付时没传 `paid_by`
- 支付时没传至少 1 张凭证
- 明细编辑用局部 patch，而不是整体提交 `items`

---

## 16. 前端联调建议顺序

建议按这个顺序接：

1. 列表页
2. 详情页
3. 草稿创建与编辑
4. 提交
5. 审批通过 / 驳回
6. 财务支付

这样最容易一次对齐。

---

## 17. 前端还需要同步的 domain 包

这次如果前端直接依赖 `@gooes/domain`，建议升级到：

- `@gooes/domain@1.2.0`

主要新增可复用值域：

- `EXPENSE_REQUEST_STEP_VALUES`
- `EXPENSE_APPROVAL_ACTION_VALUES`
- `EXPENSE_SETTLEMENT_METHOD_VALUES`

参考：

- [2026-04-19-domain-frontend-upgrade-note.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-domain-frontend-upgrade-note.md:1)
