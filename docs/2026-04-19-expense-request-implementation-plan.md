# 员工报销与费用申请落地执行方案

日期：2026-04-19

## 背景

当前仓库里已经存在 `expense_requests` 表，也已经有费用状态和费用模式的 domain 枚举：

- [packages/domain/src/expense.ts](/Users/leefo/Public/work/gooes/packages/domain/src/expense.ts:1)
- [types/database.ts](/Users/leefo/Public/work/gooes/types/database.ts:184)
- [20260405091426_create_expense_request_table_new.sql](/Users/leefo/Public/work/gooes/supabase/migrations/20260405091426_create_expense_request_table_new.sql:4)

但现状更像“有一张申请单表”，还不是一套完整可落地的员工报销 / 费用申请流程。

主要问题：

1. 目前只有数据库表，没有完整的 `controller / service / repository / routes`
2. `expense_requests` 只能表达单条金额、单个原因，不适合真实报销单的多明细场景
3. `current_step_role = 'project_manager'` 与现有员工角色值域不一致
4. `audit_log jsonb` 只能留痕，难以查询、统计和审计
5. `payment_id` 指向现有 `payments`，语义容易和项目收款混淆

因此，这次不建议只在现有表上继续零碎打补丁，而应该按正式流程补齐主单、明细、审批、结算四层模型。

---

## 一、目标

本次方案目标：

1. 支持员工提交费用申请 / 员工报销
2. 支持多条费用明细
3. 支持审批流
4. 支持财务登记打款
5. 支持完整审批与支付审计
6. 不复用现有 `payments` 作为费用打款主表
7. 所有稳定状态和值域统一收口到 `@gooes/domain`
8. 保持符合当前项目分层规范：
   - controller 只处理 HTTP
   - service 处理业务编排
   - repository 直接访问 Supabase

---

## 二、核心结论

## 1. 保留 `expense_requests` 作为主单

不要废弃现有 `expense_requests`，但要把它升级成“主申请单”。

它负责存：

- 谁提交
- 属于哪个项目
- 是什么模式
- 当前状态
- 当前审批节点
- 汇总金额
- 提交 / 审批 / 驳回 / 撤回 / 完成时间

## 2. 新增明细表，不再把单据压成单条金额

真实报销单经常包含多笔费用明细，因此必须拆出 `expense_request_items`。

## 3. 新增审批表，不只靠 `audit_log jsonb`

审批轨迹必须结构化存储，不能长期只靠 JSONB 数组。

## 4. 新增结算表，不直接复用 `payments`

当前 `payments` 的语义是项目收款，见：

- [packages/domain/src/payment.ts](/Users/leefo/Public/work/gooes/packages/domain/src/payment.ts:1)
- [schema/payment.ts](/Users/leefo/Public/work/gooes/schema/payment.ts:1)

它不适合作为员工报销打款表。

因此建议新增独立的费用结算表。

---

## 三、目标流程

建议 v1 流程固定为：

1. 员工创建费用申请单
2. 员工保存草稿
3. 员工提交申请
4. 直属审批节点审核
5. 财务审核
6. 财务登记打款
7. 单据完成

状态流建议：

```text
draft -> pending -> approved -> paid
draft -> pending -> rejected
draft -> cancelled
pending -> cancelled
rejected -> draft
```

说明：

- `draft`：草稿，员工自己可编辑
- `pending`：已提交，审批中
- `approved`：审批通过，待打款
- `rejected`：已驳回
- `paid`：已打款完成
- `cancelled`：已撤回 / 已作废

这套状态和当前 [packages/domain/src/expense.ts](/Users/leefo/Public/work/gooes/packages/domain/src/expense.ts:1) 的值域一致，可以复用。

---

## 四、数据模型设计

## 1. 升级 `expense_requests`

当前表保留，但建议增加下列字段：

```sql
ALTER TABLE public.expense_requests
ADD COLUMN IF NOT EXISTS request_no text,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_step text NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejected_reason text;
```

建议逐步废弃这些旧字段：

- `current_step_role`
- `audit_log`
- `payment_id`
- `amount`
- `category`
- `reason`
- `evidence_images`

说明：

- 第一阶段不要立即删除旧字段
- 先新增新结构，待代码完全切换后再清理旧字段

### 为什么要加这些字段

- `request_no`：方便财务、人事、审批沟通
- `title`：让列表页可快速识别单据
- `total_amount`：主单持久化汇总金额，避免每次现算
- `current_step`：明确当前审批节点，不再混用 role
- `submitted_at / approved_at / rejected_at / cancelled_at / completed_at`：保证流程追溯
- `assignee_id`：明确当前由谁处理，而不是只存角色

---

## 2. 新增费用明细表 `expense_request_items`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.expense_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  occurred_at timestamptz,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  remark text,
  invoice_no text,
  vendor_name text,
  evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

说明：

- 一张申请单可以有多条费用明细
- 附件更合理地落在明细维度，而不是整个申请单只挂一个附件数组
- `category` 第一版可以先保留 `text`
- 如果财务后续要求稳定分类，再单独升级成 domain 枚举

---

## 3. 新增审批记录表 `expense_request_approvals`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.expense_request_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  step text NOT NULL,
  action text NOT NULL,
  approver_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

用途：

- 每个审批动作单独留一条结构化记录
- 可以清楚记录：
  - 哪个节点
  - 谁处理的
  - 通过 / 驳回 / 撤回
  - 意见是什么
  - 时间是什么

这张表会替代当前 `audit_log` 作为主审计来源。

---

## 4. 新增费用结算表 `expense_request_settlements`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.expense_request_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL UNIQUE REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  payee_name text NOT NULL,
  payee_bank text,
  payee_account text,
  method text NOT NULL,
  paid_amount numeric(12,2) NOT NULL CHECK (paid_amount >= 0),
  paid_at timestamptz NOT NULL,
  paid_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

说明：

- 一张费用申请单对应一条打款记录
- 结算信息和申请信息分开，更清晰
- 不再复用 `payments`

---

## 五、`@gooes/domain` 需要同步更新的内容

按照 [docs/domain-enum-guideline.md](/Users/leefo/Public/work/gooes/docs/domain-enum-guideline.md:1)，凡是稳定业务值域，都必须先进入 `@gooes/domain`。

## 1. 现有 `expense` 枚举继续保留

当前已存在，可继续复用：

- `EXPENSE_STATUS_VALUES`
- `EXPENSE_MODE_VALUES`

位置：

- [packages/domain/src/expense.ts](/Users/leefo/Public/work/gooes/packages/domain/src/expense.ts:1)

## 2. 新增 `EXPENSE_REQUEST_STEP_VALUES`

建议新增：

```ts
export const EXPENSE_REQUEST_STEP_VALUES = [
  "draft",
  "manager_review",
  "finance_review",
  "payment",
  "done",
  "cancelled",
] as const;
```

用途：

- 代替当前数据库里的 `current_step_role`
- 让“当前节点”变成明确业务步骤，而不是角色字符串

## 3. 新增 `EXPENSE_APPROVAL_ACTION_VALUES`

建议新增：

```ts
export const EXPENSE_APPROVAL_ACTION_VALUES = [
  "submit",
  "approve",
  "reject",
  "cancel",
  "resubmit",
  "pay",
] as const;
```

用途：

- 给 `expense_request_approvals.action` 收口
- 方便前后端统一展示审批历史

## 4. 新增 `EXPENSE_SETTLEMENT_METHOD_VALUES`

建议新增：

```ts
export const EXPENSE_SETTLEMENT_METHOD_VALUES = [
  "bank_transfer",
  "wechat",
  "alipay",
  "cash",
] as const;
```

用途：

- 给结算方式收口
- 前端支付登记页可以直接复用

## 5. 建议新增 `Config`

建议为下面这些值域补 `Config`：

- `ExpenseRequestStepConfig`
- `ExpenseApprovalActionConfig`
- `ExpenseSettlementMethodConfig`

这样前端直接拿 label / type 渲染状态即可。

## 6. 导出位置

新增完成后，还要同步更新：

- `packages/domain/src/index.ts`
- `packages/domain/src/shared.ts`

---

## 六、数据库约束建议

## 1. `expense_requests.status`

继续和现有 domain 保持一致：

- `draft`
- `pending`
- `approved`
- `rejected`
- `paid`
- `cancelled`

## 2. `expense_requests.mode`

继续和现有 domain 保持一致：

- `reimbursement`
- `advance`
- `direct`
- `petty_cash`

## 3. `expense_requests.current_step`

建议补 CHECK：

```sql
CHECK (
  current_step = ANY (
    ARRAY[
      'draft'::text,
      'manager_review'::text,
      'finance_review'::text,
      'payment'::text,
      'done'::text,
      'cancelled'::text
    ]
  )
)
```

## 4. `expense_request_approvals.action`

建议补 CHECK：

- `submit`
- `approve`
- `reject`
- `cancel`
- `resubmit`
- `pay`

## 5. `expense_request_settlements.method`

建议补 CHECK：

- `bank_transfer`
- `wechat`
- `alipay`
- `cash`

---

## 七、核心业务规则

## 1. 草稿阶段

- 只有申请人本人可编辑
- 可以修改主单和明细
- 可以删除
- 不允许支付

## 2. 提交阶段

当员工提交时：

- 必须至少有 1 条明细
- `total_amount` 必须等于明细汇总
- 状态改为 `pending`
- `current_step` 改为 `manager_review`
- 写入一条 `expense_request_approvals(action=submit)`

## 3. 审批通过

经理审批通过时：

- 状态仍可保持 `pending`
- `current_step` 切到 `finance_review`
- 写入一条审批记录

财务审批通过时：

- 状态改为 `approved`
- `current_step` 改为 `payment`
- 写入一条审批记录
- `approved_at` 写入

## 4. 驳回

任一审批节点驳回时：

- 状态改为 `rejected`
- `current_step` 改为 `draft`
- `rejected_at` 写入
- `rejected_reason` 写入
- 写入一条审批记录

## 5. 重新提交

已驳回单据允许申请人修改后重提：

- 状态从 `rejected` 回到 `pending`
- `current_step` 回到 `manager_review`
- 写入 `resubmit` 记录

## 6. 撤回 / 作废

- 草稿可直接取消
- 审批中的单据允许申请人撤回
- 已 `approved` 或已 `paid` 后不允许撤回

## 7. 支付

只有 `approved` 状态的单据允许登记支付。

支付时：

- 必须填写 `paid_amount`
- 必须填写 `method`
- 必须填写 `paid_at`
- 必须填写 `paid_by`
- 至少上传 1 张支付凭证

支付完成后：

- 写入 `expense_request_settlements`
- 主单状态改为 `paid`
- `current_step` 改为 `done`
- `completed_at` 写入
- 写入一条 `action=pay` 的审批记录

---

## 八、推荐接口设计

建议新增资源：

- `/expense-requests`

### 基础 CRUD

- `GET /expense-requests`
- `GET /expense-requests/:id`
- `POST /expense-requests`
- `PATCH /expense-requests/:id`

### 额外动作接口

- `POST /expense-requests/:id/submit`
- `POST /expense-requests/:id/approve`
- `POST /expense-requests/:id/reject`
- `POST /expense-requests/:id/cancel`
- `POST /expense-requests/:id/pay`

### 推荐查询接口

- `GET /expense-requests/mine`
- `GET /expense-requests/pending`

### 返回结构建议

详情接口建议直接联查返回：

- `employee`
- `project`
- `items`
- `approvals`
- `settlement`

这样前端不需要自己拆多次请求拼装。

---

## 九、代码落点建议

## 1. schema

建议新增：

- `schema/expense-requests.ts`

内容包括：

- `CreateExpenseRequestSchema`
- `UpdateExpenseRequestSchema`
- `SubmitExpenseRequestSchema`
- `ApproveExpenseRequestSchema`
- `RejectExpenseRequestSchema`
- `PayExpenseRequestSchema`
- `ExpenseRequestListQuerySchema`

所有稳定值域都必须直接引用 `@gooes/domain`。

## 2. repository

建议新增：

- `repositories/expense-requests.ts`

职责：

- 查询主单
- 查询联查详情
- 创建 / 更新主单
- 批量写明细
- 写审批记录
- 写结算记录

## 3. service

建议新增：

- `services/expense-requests.ts`

职责：

- 草稿保存
- 提交
- 审批通过
- 驳回
- 撤回
- 支付登记
- 汇总金额校验
- 状态流转校验

## 4. controller

建议新增：

- `controllers/expense-requests/index.ts`

职责：

- 解析 HTTP 请求
- 调 schema
- 调 service
- 包装 `ResponseHandler.success`

## 5. routes

在 [routes/index.ts](/Users/leefo/Public/work/gooes/routes/index.ts:1) 注册：

```ts
app.register(createResourceRoutes("expense-requests", ExpenseRequestsController));
```

---

## 十、执行顺序

建议按下面顺序落地。

## Phase 1：先统一 domain

1. 更新 `packages/domain/src/expense.ts` 或拆出新的 `expense-request.ts`
2. 新增：
   - `EXPENSE_REQUEST_STEP_VALUES`
   - `EXPENSE_APPROVAL_ACTION_VALUES`
   - `EXPENSE_SETTLEMENT_METHOD_VALUES`
3. 更新：
   - `packages/domain/src/index.ts`
   - `packages/domain/src/shared.ts`
4. 重新 build / pack `@gooes/domain`

## Phase 2：做数据库迁移

1. `ALTER TABLE expense_requests` 补主单字段
2. 新增 `expense_request_items`
3. 新增 `expense_request_approvals`
4. 新增 `expense_request_settlements`
5. 补 CHECK / DEFAULT / INDEX
6. 先不要删旧字段，等代码切换完成再清

## Phase 3：后端接入

1. 新增 schema
2. 新增 repository
3. 新增 service
4. 新增 controller
5. 注册 routes
6. 跑 `bunx tsc --noEmit`
7. 跑 `bun build app.ts --outdir dist --target node`

## Phase 4：联调

验证这几条主链路：

1. 草稿创建成功
2. 明细汇总金额正确
3. 提交后进入审批中
4. 审批通过后进入待打款
5. 驳回后可重提
6. 支付后进入已完成
7. 已支付单据不能再次修改或再次支付

## Phase 5：清理旧字段

当新代码稳定后，再评估是否删除：

- `current_step_role`
- `audit_log`
- `payment_id`
- `amount`
- `category`
- `reason`
- `evidence_images`

---

## 十一、验收标准

本次方案完成后，至少要满足：

1. 员工可以创建费用申请草稿
2. 一张申请单支持多条费用明细
3. 提交时会校验明细和汇总金额
4. 审批动作有结构化审计记录
5. 财务可以登记打款
6. 打款信息独立落表，不复用项目收款表
7. 已支付单据不可重复支付
8. 所有稳定状态和值域统一进入 `@gooes/domain`
9. 前端可直接使用 domain 的状态和配置映射

---

## 十二、补充说明

## 1. 为什么不建议继续用 `current_step_role`

当前旧表里默认值是：

- `project_manager`

但现有员工角色值域是：

- `admin`
- `employee`
- `finance`

两者并不一致。  
这说明“审批节点”不应该继续建模成 `role` 字段，而应该独立成 `current_step`。

## 2. 为什么不建议继续只用 `audit_log jsonb`

JSONB 适合做补充快照，但不适合做主审批记录来源。  
后续只要涉及：

- 审批列表
- 审批统计
- 操作人追溯
- 驳回原因查询

结构化表一定更稳。

## 3. 为什么 `payments` 不适合直接复用

当前 `payments` 的状态和值域明显是项目回款语义，不是费用支出语义。  
如果强行复用，会把“收入”和“支出”混在一套业务模型里，后续报表和财务对账会越来越乱。

---

## 十三、结论

当前数据结构可以作为员工报销 / 费用申请流程的起点，但不能直接认为已经足够上线。  
正确的落地方向是：

- 保留 `expense_requests` 作为主单
- 新增明细、审批、结算三张表
- 所有稳定值域同步更新到 `@gooes/domain`
- 完整补齐后端资源与动作接口

这样才能支撑一套正式、可审计、可联调、可扩展的费用申请流程。
