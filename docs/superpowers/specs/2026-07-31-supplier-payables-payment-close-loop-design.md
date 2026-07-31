# 供应商采购应付与付款闭环设计

**日期：** 2026-07-31
**状态：** 已批准，待实施
**所属阶段：** 供应商管理平台阶段 1 收口

## 1. 背景

当前供应商采购链路已经具备：

1. 平台供应商准入、资质、标准类目、品牌和单位。
2. 租户合作关系、合同、供应商商品、SKU 和基础供货价。
3. 项目采购申请、成本分类、预算预检、审批和预算承诺。
4. 采购申请转采购单。
5. 供应商确认、分批发货、分批收货、合格与拒收数量。
6. 按采购单冻结价格累计的合格收货金额。

现有链路在合格收货后停止。合格收货尚未形成正式项目成本和供应商应付，
财务人员也没有供应商付款申请、付款确认和应付核销入口。项目预算承诺不会随
合格收货转为实际成本，现金台账也无法区分供应商采购付款。

本设计补齐阶段 1 的最后一段：

> 合格收货 → 项目成本 → 供应商应付 → 付款申请 → 付款 → 现金台账

## 2. 范围

### 2.1 本阶段包含

- 采购单保存成本分类、结算账期和付款前发票要求快照。
- 合格收货原子生成项目成本事件和供应商应付事件。
- 分批收货按订单冻结金额确认成本和应付。
- 预算承诺随成本确认逐步消耗。
- 应付分页查询、余额和到期状态。
- 付款申请草稿、提交、审批、驳回、取消和部分付款后关闭。
- 应付占用、部分付款、多次付款和付款分配。
- 付款凭证、付款流水号和付款时间。
- 付款确认原子写入现有现金台账。
- 项目财务汇总同时展示预算、承诺、实际成本、未付应付和已付现金。
- Admin 的供应商应付、付款申请和采购单财务摘要。
- 稳定权限、审计事件、错误码、幂等、分页和性能索引。

### 2.2 本阶段不包含

- 供应商发票登记、验真、红票和三单匹配。
- 月度或项目供应商对账单、争议和差异协商。
- 退货、换货、补发、折让、收货冲销和付款冲销。
- 采购预付款、保证金、跨项目合并付款和外币付款。
- 银企直连、自动付款、银行回单解析和自动对账。
- 供应商登录、供应商门户和外部通知。
- 仓库、库存、批次、项目领料和退料。
- 修改微信小程序或 `/Users/leefo/Public/work/orange`。

## 3. 核心决策

### 3.1 收货、成本和应付同事务

项目成本事件和应付事件不是收货后的异步投影。创建收货的数据库 RPC 在插入
收货头、收货行和履约累计的同一事务内创建成本与应付事件并消费预算承诺。

任一写入失败时整次收货回滚，不允许出现以下中间状态：

- 收货成功但没有项目成本。
- 有项目成本但没有供应商应付。
- 已形成成本但预算承诺未减少。

本阶段不引入队列、缓存或补偿任务。

### 3.2 三类经营事实保持分离

系统分别保存：

1. `project_cost_commitments`：已经批准但尚未形成实际成本的预算占用。
2. `project_cost_events`：合格收货形成的不可变项目成本。
3. `finance_ledger_entries`：付款完成后的现金流出。

供应商付款现金流水不得再次计入项目成本。项目经营视图按以下规则聚合：

- 现有费用申请仍从现有已支付费用事实计入成本。
- 供应商采购从 `project_cost_events` 计入成本。
- `entry_type = supplier_payment` 的现金流水只计入已付现金。

### 3.3 订单保存商业条件快照

采购申请转采购单时保存：

- 每个采购行的 `cost_category_id`。
- 订单级 `settlement_term_days_snapshot`。
- 订单级 `invoice_required_before_payment_snapshot`。

快照优先采用下单时有效合同；没有有效合同时采用租户供应商合作关系的默认值。
订单生成后，合同和合作关系的后续修改不回写历史订单。

### 3.4 发票要求不允许人工绕过

本阶段不建设发票实体。若订单快照要求付款前取得发票：

- 仍允许形成项目成本、应付和付款申请。
- 仍允许付款申请进入批准状态。
- 确认付款时返回 `SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED`。
- Admin 显示“合同要求发票，当前阶段暂不能付款”。

不增加“已人工核对发票”复选框或备注绕过合同规则。发票阶段上线后由正式发票
匹配结果解除阻断。

### 3.5 首版付款申请不跨项目

一张付款申请只能包含同一：

- `tenant_id`
- `project_id`
- `tenant_supplier_id`
- `currency`

的应付事件。币种固定为 `CNY`。该边界保证项目权限、审批责任、现金台账和项目
财务摘要均可明确归属。跨项目合并付款留到对账阶段。

## 4. 数据模型

所有结构变更、索引、约束、RLS、函数、权限和初始化数据必须通过
`supabase/migrations/` 下的前向 migration 完成。

### 4.1 采购单与采购行快照

`supplier_purchase_orders` 新增：

- `settlement_term_days_snapshot integer NOT NULL`
- `invoice_required_before_payment_snapshot boolean NOT NULL`

`supplier_purchase_order_items` 新增：

- `cost_category_id uuid NULL`

新的采购申请转换必须写入非空成本分类。历史数据仅在
`purchase_requisition_id + supplier_sku_id` 能唯一匹配采购申请行时回填。
无法可靠映射的历史直接采购单保持 `NULL` 并进入诊断结果，不猜测分类。

新增收货命令遇到 `cost_category_id IS NULL` 的采购行时返回
`SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED`，不创建新的无分类成本。

### 4.2 项目成本事件

新增 `project_cost_events`：

- `id`
- `tenant_id`
- `project_id`
- `cost_category_id`
- `source_type = supplier_purchase_receipt_item`
- `source_id = supplier_purchase_order_receipt_items.id`
- `supplier_purchase_order_id`
- `supplier_purchase_order_item_id`
- `purchase_requisition_id`
- `amount`
- `currency = CNY`
- `occurred_at`
- `created_by_employee_id`
- `created_at`

事件只追加、不更新、不删除。唯一键：

```text
(tenant_id, source_type, source_id)
```

保证同一收货行只能形成一次项目成本。

### 4.3 供应商应付事件

新增 `supplier_payable_events`：

- `id`
- `tenant_id`
- `tenant_supplier_id`
- `supplier_id`
- `project_id`
- `cost_category_id`
- `supplier_purchase_order_id`
- `supplier_purchase_order_item_id`
- `receipt_id`
- `receipt_item_id`
- `source_type = supplier_purchase_receipt_item`
- `source_id = supplier_purchase_order_receipt_items.id`
- `amount`
- `currency = CNY`
- `occurred_at`
- `due_at`
- `created_by_employee_id`
- `created_at`

应付事件也是只追加事实。首版只有合格收货产生的正向应付，不保存用户可修改的
“应付状态”或“剩余金额”。已付和占用余额从付款申请分配与付款分配聚合得到。

唯一键：

```text
(tenant_id, source_type, source_id)
```

### 4.4 预算承诺消费

`project_cost_commitments` 新增：

- `recognized_amount numeric(18, 2) NOT NULL DEFAULT 0`
- `consumed_at timestamptz NULL`

状态扩展为：

- `reserved`：采购申请已提交，尚未转换采购单。
- `converted`：已转换采购单，仍有未确认成本。
- `consumed`：承诺金额已全部形成项目成本。
- `released`：申请、订单取消后释放未形成成本的余额。

活动承诺金额统一计算为：

```text
status IN (reserved, converted)
  ? greatest(amount - recognized_amount, 0)
  : 0
```

部分收货增加 `recognized_amount`。达到 `amount` 时变为 `consumed`。取消订单只释放
未确认余额；已经形成的成本事件保留。任何写入都不允许
`recognized_amount > amount`。

### 4.5 付款申请

新增 `supplier_payment_requests`：

- `id`
- `tenant_id`
- `project_id`
- `tenant_supplier_id`
- `supplier_id`
- `request_no`
- `status`
- `currency = CNY`
- `requested_amount`
- `paid_amount`
- `reason`
- `remark`
- `version`
- 提交、审批、驳回、取消、关闭的操作人与时间
- `created_by_employee_id`
- `updated_by_employee_id`
- `created_at`
- `updated_at`

状态：

```text
draft
pending_approval
approved
partially_paid
paid
rejected
cancelled
closed
```

`closed` 只用于已有部分付款后主动释放未付申请余额；历史付款仍然有效。结算账期
按自然日计算，`due_at = received_at + settlement_term_days_snapshot`。

新增 `supplier_payment_request_allocations`：

- `id`
- `tenant_id`
- `payment_request_id`
- `payable_event_id`
- `requested_amount`
- `paid_amount`
- `created_at`
- `updated_at`

同一付款申请内一个应付事件只能出现一次。提交后分配不可编辑。

### 4.6 付款与付款分配

新增 `supplier_payments`：

- `id`
- `tenant_id`
- `project_id`
- `tenant_supplier_id`
- `supplier_id`
- `payment_request_id`
- `payment_no`
- `currency = CNY`
- `amount`
- `payment_method`
- `payment_reference`
- `paid_at`
- `evidence_images`
- `remark`
- `confirmed_by_employee_id`
- `idempotency_key`
- `created_at`

付款在确认成功时一次性创建，之后不可编辑或删除。`evidence_images` 复用现有费用
打款凭证上传和存储解析方式，至少一张并限制现有上传组件允许的最大数量。
`payment_method` 固定为 `bank_transfer | wechat | alipay | cash | other`；选择
`other` 时必须填写备注。

新增 `supplier_payment_allocations`：

- `id`
- `tenant_id`
- `supplier_payment_id`
- `payment_request_allocation_id`
- `payable_event_id`
- `amount`
- `created_at`

每次付款必须显式分配到申请中的应付事件。付款总额、分配总额以及申请增加的
`paid_amount` 必须完全相等。

### 4.7 现金台账扩展

`finance_ledger_entries.entry_type` 增加：

```text
supplier_payment
```

付款确认写入：

- `direction = out`
- `entry_type = supplier_payment`
- `source_type = supplier_payment`
- `source_id = supplier_payments.id`
- `project_id`
- `amount`
- `occurred_at = paid_at`
- `metadata` 保存付款申请号、付款号和供应商名称快照

沿用现有来源唯一索引，保证一笔付款只形成一条现金流水。

## 5. 金额与舍入

### 5.1 收货金额

每个采购单行独立计算：

1. 前序合格收货金额从已有项目成本事件汇总。
2. 若本次收货后累计合格数量等于订单数量，本次金额为
   `订单行冻结总额 - 前序已确认金额`。
3. 否则按 `round(订单行冻结总额 × 本次合格数量 ÷ 订单数量, 2)`。
4. 拒收数量不形成项目成本或应付。

因此完整收货后所有成本事件金额之和严格等于订单行冻结总额，不产生分批舍入差。

### 5.2 应付余额

对单个应付事件：

```text
paid_amount
  = sum(supplier_payment_allocations.amount)

reserved_unpaid_amount
  = sum(
      active_request_allocation.requested_amount
      - active_request_allocation.paid_amount
    )

open_amount
  = payable_event.amount - paid_amount

available_to_request_amount
  = open_amount - reserved_unpaid_amount
```

活动申请状态为：

```text
pending_approval
approved
partially_paid
```

草稿不占用应付余额；驳回、取消、已付和关闭状态不再占用未付余额。

### 5.3 并发锁顺序

提交付款申请和确认付款均按以下顺序加锁：

1. 付款申请头。
2. 应付事件，按 `id` 排序。
3. 活动付款申请分配，按 `payment_request_id, payable_event_id` 排序。
4. 当前付款申请分配。

固定锁顺序用于避免并发超额占用和死锁。任何余额校验必须在锁内重新计算，不信任
客户端提交的余额。

## 6. 状态机

### 6.1 付款申请动作

| 当前状态 | 动作 | 下一状态 | 关键条件 |
|---|---|---|---|
| `draft` | 保存 | `draft` | 分配总额大于 0，范围一致 |
| `draft` | 提交 | `pending_approval` | 锁内余额足够 |
| `draft` | 取消 | `cancelled` | 填写原因 |
| `pending_approval` | 批准 | `approved` | 具备审批权限 |
| `pending_approval` | 驳回 | `rejected` | 具备审批权限并填写原因 |
| `pending_approval` | 取消 | `cancelled` | 尚无付款并填写原因 |
| `approved` | 确认部分付款 | `partially_paid` | 分配合法、凭证完整 |
| `approved` | 确认全额付款 | `paid` | 分配覆盖全部申请余额 |
| `approved` | 取消 | `cancelled` | 尚无付款并填写原因 |
| `partially_paid` | 继续付款 | `partially_paid`/`paid` | 不超过申请和应付余额 |
| `partially_paid` | 关闭 | `closed` | 填写原因，释放未付占用 |

终态为 `paid`、`rejected`、`cancelled` 和 `closed`。

### 6.2 发票门禁

发票门禁只在确认付款时检查订单快照。付款申请可以正常审批，以便财务提前完成
内部流程。若同一申请包含的任一应付事件要求发票，本阶段整次付款命令失败，
不允许只支付其他事件。

## 7. 原子命令

### 7.1 创建收货

扩展现有 `create_supplier_purchase_order_receipt` RPC：

1. 校验幂等、履约版本、订单和收货数量。
2. 插入收货头和收货行。
3. 按采购单行锁定履约累计。
4. 计算本次合格收货金额。
5. 插入项目成本事件。
6. 插入应付事件并计算到期日。
7. 按成本分类增加预算承诺的 `recognized_amount`。
8. 更新履约累计和状态。
9. 写入供应商命令事件。

步骤 1–9 在同一事务中完成。

### 7.2 提交付款申请

`submit_supplier_payment_request`：

1. 校验租户、项目、供应商、币种和版本。
2. 按固定顺序锁定应付及活动分配。
3. 重新计算每个应付事件可申请余额。
4. 校验草稿分配没有超额。
5. 冻结申请金额和分配。
6. 更新为 `pending_approval`。
7. 写入供应商命令事件。

### 7.3 审批付款申请

`review_supplier_payment_request` 接受 `approve | reject`。它只改变领域状态和审批
审计，不直接创建 workflow 事实。以后接入通用 workflow 时，由 workflow action
调用同一 RPC。

### 7.4 确认付款

`confirm_supplier_payment`：

1. 校验申请状态、版本和幂等键。
2. 校验付款时间、方式、流水号、凭证和分配。
3. 锁定申请、应付和申请分配。
4. 校验合同发票门禁。
5. 重新计算申请未付金额和应付未付金额。
6. 插入付款和付款分配。
7. 增加申请分配及申请头的 `paid_amount`。
8. 更新申请为 `partially_paid` 或 `paid`。
9. 插入唯一现金台账。
10. 写入供应商命令事件。

步骤 1–10 在同一事务中完成。

## 8. API

### 8.1 查询

```text
GET /supplier-payables
GET /supplier-payment-requests
GET /supplier-payment-requests/:id
GET /supplier-payment-requests/:id/payments
GET /supplier-purchase-orders/:id/financial-summary
```

所有列表：

- 默认 `page=1&pageSize=20`。
- `pageSize` 最大 `100`。
- 默认按业务时间倒序，再按 `id` 倒序稳定排序。
- 只查询 DTO 所需字段。

应付支持筛选：

- 项目。
- 租户供应商。
- 采购单。
- `open | reserved | partially_paid | paid | overdue` 派生状态。
- 到期时间范围。

付款申请支持筛选：

- 项目。
- 租户供应商。
- 状态。
- 申请号。
- 创建时间范围。

### 8.2 命令

```text
POST /supplier-payment-requests
PUT /supplier-payment-requests/:id
POST /supplier-payment-requests/:id/submit
POST /supplier-payment-requests/:id/approve
POST /supplier-payment-requests/:id/reject
POST /supplier-payment-requests/:id/cancel
POST /supplier-payment-requests/:id/close
POST /supplier-payment-requests/:id/payments
```

所有非只读命令要求：

- `Idempotency-Key`。
- `expected_version`。
- 服务器从认证上下文取得租户、用户和员工，不接受客户端覆盖。

创建命令使用 `expected_version = 0`；已有资源命令必须提交当前正整数版本。

controller 只读取和校验请求、调用 service、包装
`ResponseHandler.success`。service 负责权限与业务编排，repository 只访问
Supabase/RPC。

## 9. 权限

新增租户权限：

- `supplier.payable.view`
- `supplier.payment-request.view`
- `supplier.payment-request.manage`
- `supplier.payment-request.approve`
- `supplier.payment-request.pay`

规则：

- 所有接口先校验供应商模块已启用。
- 应付和付款申请查询同时校验项目读取权限。
- 新建、保存、提交、取消和关闭同时校验项目更新权限。
- 审批要求独立审批权限。
- 确认付款要求独立付款权限，不由申请管理权限隐式获得。
- 平台超管身份不自动绕过租户和项目边界。
- 成本价和付款金额只返回给具备对应供应链财务权限的员工。

## 10. Admin

新增租户导航：

- `/supplier-payables`：供应商应付。
- `/supplier-payment-requests`：供应商付款申请。

### 10.1 应付页面

包含：

- 项目、供应商、采购单、收货单、发生时间、到期日。
- 应付金额、已申请未付、已付、可申请余额。
- 状态和逾期提示。
- 分页、筛选和批量选择同一项目/供应商的可申请应付。
- “创建付款申请”动作。

### 10.2 付款申请页面

沿用现有 Admin 的筛选栏、数据表、详情抽屉和命令对话框：

- 草稿编辑器选择应付事件并填写申请金额、原因和备注。
- 详情展示状态时间线、分配、付款记录和凭证。
- 审批对话框显示项目、供应商、申请总额和应付来源。
- 付款对话框默认填充剩余申请金额，允许按应付事件调整本次分配。
- 发票门禁以阻断提示展示，不显示绕过按钮。

### 10.3 采购单和项目财务

采购单详情新增财务摘要：

- 合格收货金额。
- 已形成应付。
- 已申请未付。
- 已付。
- 未付应付。

项目财务摘要新增或校准：

- 预算金额。
- 活动预算承诺。
- 已发生项目成本。
- 未付供应商应付。
- 已付供应商现金。

命令执行期间按钮禁用。成功后刷新应付、付款申请、采购单和项目财务摘要。
版本或余额冲突时刷新详情并显示明确错误，不静默覆盖。

## 11. 错误码

service 将 RPC 结果映射为 `error-factory.ts` 的稳定业务错误，至少包含：

| 错误码 | 含义 |
|---|---|
| `SUPPLIER_PAYABLE_EVENT_NOT_FOUND` | 应付事件不存在或不属于当前范围 |
| `SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE` | 应付可申请或可支付余额不足 |
| `SUPPLIER_PAYMENT_REQUEST_NOT_FOUND` | 付款申请不存在 |
| `SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT` | 当前状态不允许执行动作 |
| `SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT` | 乐观锁版本不一致 |
| `SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH` | 项目、供应商或币种范围不一致 |
| `SUPPLIER_PAYMENT_ALLOCATION_INVALID` | 付款分配为空、超额或合计不一致 |
| `SUPPLIER_PAYMENT_EVIDENCE_REQUIRED` | 没有付款凭证 |
| `SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED` | 合同要求发票但正式发票能力尚未满足 |
| `SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT` | 同一幂等键对应不同请求 |
| `SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED` | 历史采购行无法取得可靠成本分类 |

数据库错误仍统一经 `Errors.dbError()` 包装，禁止直接 `throw new Error()`。

## 12. 查询与性能

新增索引至少覆盖：

- 应付：`tenant_id, project_id, due_at, id`。
- 应付：`tenant_id, tenant_supplier_id, occurred_at, id`。
- 应付来源唯一键。
- 付款申请：`tenant_id, status, updated_at, id`。
- 付款申请：`tenant_id, project_id, tenant_supplier_id, updated_at, id`。
- 活动申请分配：`tenant_id, payable_event_id, payment_request_id`。
- 付款：`tenant_id, payment_request_id, paid_at, id`。
- 成本事件：`tenant_id, project_id, cost_category_id, occurred_at, id`。
- 成本事件来源唯一键。

repository 禁止逐条查询项目、供应商、应付余额或付款记录。列表使用必要字段、
关系选择或受控聚合 RPC，一次请求内不得出现 N+1。

在有代表性数据量下对以下查询运行 `EXPLAIN ANALYZE`：

- 租户应付列表按项目、供应商和到期状态筛选。
- 付款申请列表按状态和更新时间分页。
- 单项目成本、承诺、应付和现金汇总。

高基数表不得在核心过滤路径接受无说明的顺序扫描。

## 13. 迁移、历史数据与回滚

### 13.1 历史回填

migration 执行：

1. 为可唯一映射的采购行回填成本分类。
2. 为已有订单回填当时无法还原时的合作关系默认结算快照；使用 migration
   执行时的当前合作关系并在诊断中标记为 `legacy_default_snapshot`。
3. 对已有合格收货，仅在订单行具有成本分类且金额可确定时幂等生成成本和应付事件。
4. 同步对应承诺的 `recognized_amount`。
5. 生成只读诊断查询，列出未映射采购行和未财务化收货行。

历史回填不关联或修改 Orange 数据，不以名称、备注或金额相似度猜测关系。

### 13.2 应用顺序

1. 审查待执行 migration 和历史诊断 SQL。
2. 应用 additive migration。
3. 重新生成 `apps/api/src/types/database.ts`。
4. 执行真实数据库 smoke。
5. 使用 `supabase migration list` 验证 Local/Remote 对齐。
6. 开放 Admin 导航。

### 13.3 回滚

本阶段产生经营事实后不直接删除表或事件。回滚顺序：

1. 关闭租户供应商模块或隐藏新付款入口，停止新写入。
2. 导出新成本、应付、申请、付款、分配和现金流水。
3. 保留已确认付款和财务台账。
4. 使用前向修复 migration 撤销函数权限或修正投影。

只有确认没有业务数据时，才允许经审查的前向回滚 migration 按依赖逆序删除新增
对象。禁止手工在远端执行 DDL/DML 修库。

## 14. 测试与验证

### 14.1 静态和单元测试

- Zod 分页、命令、金额、凭证和状态参数。
- service 权限、项目范围、错误映射和 repository 调用边界。
- Admin 状态动作、金额合计、冲突刷新和发票门禁。
- 共享 domain 状态和金额派生规则。

### 14.2 migration contract 测试

- 表、外键、唯一键、检查约束和 RLS。
- 直接写保护和不可变事件保护。
- RPC 的租户范围、员工范围、幂等请求快照和乐观锁。
- 固定锁顺序与余额锁内复算。
- 现金台账来源唯一。
- 项目成本统计排除供应商付款现金流水。

### 14.3 数据库行为测试

- 单次完整收货形成相等的成本、应付和承诺消费。
- 多次分批收货最终金额严格等于订单冻结金额。
- 拒收数量不形成成本或应付。
- 同一收货幂等重放不重复生成事件。
- 两个并发付款申请不能超额占用同一应付。
- 驳回、取消和部分付款后关闭正确释放余额。
- 一张申请支持部分付款和多次付款。
- 重复付款幂等重放不重复写付款或现金台账。
- 发票要求阻断整次付款且不产生部分写入。
- 订单取消只释放未确认承诺，保留已发生成本。

### 14.4 端到端

Playwright 覆盖：

1. 从已批准采购申请转换采购单。
2. 确认、发货和分批收货。
3. 查看项目成本与应付。
4. 创建、提交和批准付款申请。
5. 确认部分付款后继续全额付清。
6. 查看付款凭证、应付余额、采购单财务摘要和现金台账。

### 14.5 完成门禁

- API 相关测试通过。
- Admin 相关测试通过。
- API 与 Admin 类型检查通过。
- API 与 Admin 构建通过。
- 供应商采购申请和采购单旧 E2E 通过。
- 新付款闭环 E2E 通过。
- 真实 Supabase smoke 通过。
- migration Local/Remote 对齐。
- 关键查询执行计划满足索引边界。
- Orange 工作区相对基线没有 Agent 造成的变化。

## 15. 验收标准

本阶段完成时必须同时满足：

1. 每个合格收货行只能形成一次项目成本和一次应付。
2. 分批收货累计成本与采购单冻结金额一致。
3. 预算承诺随收货逐步转为实际成本，不重复占用。
4. 应付余额在并发付款申请下不会变成负数。
5. 付款申请审批、部分付款、多次付款和余额释放可追溯。
6. 合同要求发票时不能绕过规则确认付款。
7. 每次付款只写入一次现金台账。
8. 供应商付款现金不重复计入项目成本。
9. 项目可同时查看预算、承诺、成本、未付应付和已付现金。
10. 原费用申请、采购申请、采购单和履约链路不受影响。
11. 所有列表分页且关键查询具备明确性能边界。
12. 数据库变更全部由版本化 migration 管理并完成 Local/Remote 对齐验证。
