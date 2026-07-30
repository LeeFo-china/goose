# 供应商采购申请与预算控制设计

**日期：** 2026-07-30  
**状态：** 已批准，进入实施  
**范围：** Gooes API、Admin、Supabase migration；不改动 orange 仓库

## 1. 背景与目标

供应商采购单和履约 MVP 已完成供应商准入、服务端计价、采购承诺、供应商确认、
分批发货和项目收货，但员工仍可直接创建采购单，项目成本预算只统计已入账支出，
无法回答“为什么采购、审批是否通过、预算是否已经被其他采购占用”。

本阶段交付项目直采的申请与预算控制闭环：

1. 员工先为一个项目、一个合作供应商提交临时采购申请。
2. 申请明细绑定成本分类、供应商 SKU 和数量，价格由数据库统一解析。
3. 提交时按成本分类原子预占项目预算，避免并发超占。
4. 普通审批人处理预算内申请；超预算申请还必须具备预算管理权限。
5. 驳回或取消申请时释放预算；批准后才能生成采购单草稿。
6. 采购单保留申请来源，现有履约链路继续复用。
7. Admin 提供申请列表、创建编辑、提交、审批、取消和生成采购单操作。

## 2. 范围边界

### 2.1 本阶段包含

- 项目直送、临时采购申请。
- 一个申请绑定一个项目和一个租户合作供应商。
- 1 至 100 个供应商 SKU 明细。
- 每行必填一个项目成本分类。
- 服务端价格解析、金额快照和按成本分类汇总。
- 预算内与超预算结果、并发预算预占和释放。
- 单级人工审批和完整审批审计。
- 批准申请原子转换为一张采购单草稿。
- 新建采购单必须来源于已批准申请；历史采购单保持兼容。
- 项目成本预算页面展示已支出、已承诺和可用余额。

### 2.2 本阶段不包含

- BOM、仓库补货、库存预算和跨项目合单。
- 多级、会签、条件分支或可配置 workflow 模板。
- 询比价、议价、供应商报价或申请中更换供应商。
- 采购单变更单、退货、应付、发票、对账和付款。
- 把收货转换为正式项目成本事件；批准申请的承诺在后续项目成本阶段再结转。
- 修改微信小程序或 `/Users/leefo/Public/work/orange`。

本阶段使用领域内单级审批命令保存审批事实。数据结构和 action 语义保持清晰，
后续可由通用 workflow 调用同一批准、驳回命令，不把采购和预算事实存进 workflow。

## 3. 核心业务决策

### 3.1 申请先于采购单

- Admin 不再提供“直接新建采购单”入口，改为“新建采购申请”。
- 新采购单只能由批准申请的转换命令创建。
- `supplier_purchase_orders` 新增可空的 `purchase_requisition_id`：
  - 历史采购单允许为空。
  - 新转换采购单必须非空且一份申请最多对应一张采购单。
- 采购单草稿仍使用现有编辑、提交、取消、履约接口；转换只建立来源明确的草稿，
  不跳过采购员对最终价格和交期的复核。

### 3.2 申请中的价格与金额

- 客户端只提交 `supplier_sku_id`、`cost_category_id` 和 `quantity`。
- 数据库以同一个 `priced_at` 解析所有 SKU 的当前有效 CNY 默认价格。
- 申请行冻结商品、SKU、单位、单价、税率、含税标志和金额，计算规则与采购单一致。
- 编辑草稿时整单替换并重新计价。
- 提交后申请行不可编辑。
- 转换为采购单时使用当前价格重新计价；若结果与申请快照不同，返回
  `SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED`，员工需要撤回或重建申请，
  不能用过期批准金额静默下单。

### 3.3 预算口径

每个成本分类的可用预算为：

```text
available_amount
  = active_budget_amount
  - posted_expense_amount
  - active_commitment_amount
```

- `active_budget_amount` 来自现有 `project_cost_budgets`。
- `posted_expense_amount` 来自现有 `finance_ledger_entries` 出账事实。
- `active_commitment_amount` 来自本阶段新增的预算承诺。
- 未配置对应成本分类预算时视为超预算，不按无限额度处理。
- 预算预警阈值只影响展示；是否超预算以可用金额是否足够为准。
- 金额按数据库 `numeric(18,2)` 计算，API 和 Admin 不作为金额事实来源。

### 3.4 提交即预占

申请提交时在一个数据库事务中：

1. 锁定项目预算行，按 `cost_category_id` 升序获取锁。
2. 计算同一项目、同一分类的已入账支出和有效预算承诺。
3. 写入每个分类的预算承诺。
4. 保存预算检查快照和 `within_budget | over_budget` 结果。
5. 将申请从 `draft` 改为 `pending_approval`。

提交即预占可防止两个同时通过预算预检的申请共同超出预算。超预算申请也预占其
完整申请金额，使后续申请看到真实承诺；只有具备预算管理权限的审批人可以批准。

### 3.5 审批和预算权限

- 预算内申请：具备 `supplier.purchase-requisition.approve` 可以批准或驳回。
- 超预算申请：批准人必须同时具备：
  - `supplier.purchase-requisition.approve`
  - `finance.budget.manage`
- 申请人不能审批自己提交的申请。
- 驳回后释放全部有效承诺，状态变为 `rejected`。
- 待审批申请可由申请人或管理人取消，取消后释放承诺。
- 已批准但尚未转换的申请可以取消并释放承诺。
- 已转换申请不能直接取消；取消尚未开始履约的关联采购单时，数据库同时释放
  `converted` 承诺。已开始履约的采购单沿用现有规则禁止取消。

## 4. 数据模型

### 4.1 `supplier_purchase_requisitions`

主要字段：

- `id`
- `tenant_id`
- `request_no`，格式 `PR-YYYYMMDD-########`
- `project_id`
- `tenant_supplier_id`
- `supplier_id`
- `status`
- `budget_status`
- `currency`
- `reason`
- `expected_delivery_date`
- `remark`
- `priced_at`
- `subtotal_amount`
- `tax_amount`
- `total_amount`
- `purchase_order_id`
- `version`
- `created_by_employee_id`
- `updated_by_employee_id`
- `submitted_by_employee_id`
- `submitted_at`
- `reviewed_by_employee_id`
- `reviewed_at`
- `review_remark`
- `cancelled_by_employee_id`
- `cancelled_at`
- `cancel_reason`
- `created_at`
- `updated_at`

状态：

```text
draft -> pending_approval -> approved -> converted
                         -> rejected
draft | pending_approval | approved -> cancelled
```

`budget_status` 仅允许 `unchecked | within_budget | over_budget`：

- 草稿必须为 `unchecked`。
- 提交后必须为预算检查结果。
- 审批、取消和转换不重新解释历史检查结果。

关键约束：

- 项目、合作关系和供应商必须属于同一租户。
- `reason` 去空格后 1 至 500 字。
- 金额非负且币种只允许 `CNY`。
- 状态与提交、审批、取消、转换审计字段一致。
- `version > 0`，每次成功命令增加 1。
- `purchase_order_id` 唯一且只允许在 `converted` 状态出现。

### 4.2 `supplier_purchase_requisition_items`

每行保存：

- 身份和归属：`id`、`tenant_id`、`purchase_requisition_id`、`line_no`
- 预算：`cost_category_id`
- 商品来源：`supplier_product_id`、`supplier_sku_id`
- 价格来源：`supplier_price_list_id`、`supplier_price_list_item_id`
- 商品、SKU、规格、型号和单位快照
- `quantity`
- `unit_price`
- `tax_rate`
- `tax_inclusive`
- `line_subtotal_amount`
- `line_tax_amount`
- `line_total_amount`
- `created_at`

约束：

- 每申请 1 至 100 行。
- 同一申请中 SKU 唯一。
- 行号从 1 连续生成。
- 数量和金额精度与采购单一致。
- 成本分类必须为当前租户启用分类。

### 4.3 `project_cost_commitments`

每份申请按成本分类一行：

- `id`
- `tenant_id`
- `project_id`
- `cost_category_id`
- `source_type = supplier_purchase_requisition`
- `source_id`
- `amount`
- `status`
- `budget_amount_snapshot`
- `expense_amount_snapshot`
- `other_commitment_amount_snapshot`
- `available_amount_snapshot`
- `created_by_employee_id`
- `released_by_employee_id`
- `released_at`
- `release_reason`
- `created_at`
- `updated_at`

状态：

- `reserved`：提交后正在占用预算。
- `converted`：已生成采购单，继续占用预算。
- `released`：申请被驳回或取消，不再占用预算。

有效承诺是 `reserved | converted`。唯一约束
`(tenant_id, source_type, source_id, cost_category_id)` 防止重复占用。

### 4.4 采购单来源

`supplier_purchase_orders` 增加：

- `purchase_requisition_id uuid NULL`
- 唯一索引：非空 `purchase_requisition_id` 只能对应一张采购单。
- 复合外键保证采购申请、订单和租户一致。

现有订单列表和详情增加申请编号快照或关联投影，但保持分页与必要字段查询。

## 5. 数据库命令、锁序和幂等

### 5.1 `save_supplier_purchase_requisition_draft`

接收申请 ID、租户、项目、合作供应商、预期版本、交付日期、原因、备注、明细、
actor 和幂等键。

锁序：

```text
actor + idempotency advisory lock
→ requisition-id advisory lock
→ requisition row（更新时）
→ project row
→ tenant_supplier row
→ SKU / price rows（按 id 升序）
```

数据库集合查询解析全部价格和成本分类，原子创建或整单替换草稿。创建使用
`expected_version = 0`，更新必须匹配当前版本。

### 5.2 `submit_supplier_purchase_requisition`

锁序：

```text
actor + idempotency advisory lock
→ requisition-id advisory lock
→ requisition row
→ project_cost_budgets（按 cost_category_id）
→ project_cost_commitments（同项目分类）
```

提交时重新校验供应商准入和价格未变化，集合汇总每个成本分类，计算预算快照，
写入承诺并转为 `pending_approval`。任何一项失败整单回滚。

### 5.3 `review_supplier_purchase_requisition`

接收 `action = approve | reject`、预期版本和审核意见。

- 校验待审批、审批人与申请人不同。
- Service 在调用前校验普通审批权限；超预算批准额外校验预算管理权限。
- 批准保留 `reserved` 承诺并转为 `approved`。
- 驳回把承诺转为 `released` 并记录原因。

### 5.4 `cancel_supplier_purchase_requisition`

- 允许 `draft | pending_approval | approved`，但 `approved` 必须尚未转换。
- 待审批或已批准申请取消时释放承诺。
- 原因必填，记录操作人和版本。

### 5.5 `convert_supplier_purchase_requisition`

- 只允许 `approved`，且尚无采购单。
- 调用现有采购单草稿保存数据库命令，以申请的项目、合作供应商、SKU、数量和
  当前价格建立一张采购单草稿。
- 当前价格必须与批准申请快照一致。
- 采购单写入 `purchase_requisition_id`。
- 承诺从 `reserved` 转为 `converted`。
- 申请转为 `converted` 并写入 `purchase_order_id`。
- 申请、采购单、承诺和命令事件在同一事务提交。

现有 `cancel_supplier_purchase_order` 同步扩展：关联申请的采购单在尚未开始履约时
取消，必须把对应 `converted` 承诺原子改为 `released`；幂等重放不能重复释放。

所有命令复用 `supplier_command_events`，请求指纹包含规范化明细、版本、业务字段
和 actor employee。相同 actor/key 只有请求完全相同时才能重放。

## 6. 性能、安全与错误

- 三张新表启用并强制 RLS，只向 `service_role` 授权。
- 写入只能经过 SECURITY DEFINER 命令函数。
- 列表默认 `page=1&pageSize=20`，最大 `100`。
- 列表使用必要字段、确定性排序和 `.range()`。
- 明细独立分页；详情不能无上限嵌入全部明细。
- 预算计算按分类集合查询，禁止逐行查询预算、支出或承诺。
- 索引覆盖：
  - 申请 `tenant_id + status + updated_at + id`
  - 项目申请 `tenant_id + project_id + updated_at + id`
  - 待审批 `tenant_id + status + submitted_at + id`
  - 申请明细 `purchase_requisition_id + line_no`
  - 有效承诺 `tenant_id + project_id + cost_category_id + status`
- migration 应使用 `EXPLAIN ANALYZE` 验证待审批列表和预算汇总查询。

主要错误码：

- `SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND`
- `SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT`
- `SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT`
- `SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED`
- `SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED`
- `SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW`
- `SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED`
- `SUPPLIER_ORDER_NOT_ELIGIBLE`
- `SUPPLIER_IDEMPOTENCY_CONFLICT`

Repository 映射数据库错误并经过 `error-factory.ts`；Controller 和 Service 不直接
抛出 `Error`。

## 7. 权限与 API

新增权限：

- `supplier.purchase-requisition.view`
- `supplier.purchase-requisition.manage`
- `supplier.purchase-requisition.approve`

权限还必须与项目范围求交集：

- 列表和详情：申请查看权限 + `project.read`。
- 创建、编辑、提交、取消、转换：申请管理权限 + `project.update`。
- 审批：申请审批权限 + `project.read`。
- 超预算批准：再要求 `finance.budget.manage`。

API：

```text
GET  /supplier-purchase-requisitions
GET  /supplier-purchase-requisitions/:id
GET  /supplier-purchase-requisitions/:id/items
POST /supplier-purchase-requisitions/:id/save-draft
POST /supplier-purchase-requisitions/:id/submit
POST /supplier-purchase-requisitions/:id/review
POST /supplier-purchase-requisitions/:id/cancel
POST /supplier-purchase-requisitions/:id/convert
```

辅助选项继续复用现有分页项目、供应商和可采购目录接口；成本分类使用现有分页
财务分类接口。所有 mutation 要求 `Idempotency-Key`。

分层：

- Controller：HTTP 解析、Zod、幂等键、ResponseHandler。
- Service：租户、权限、项目范围、供应商准入和超预算审批权限。
- Repository：必要字段列表、明细分页和 RPC。

## 8. Admin 体验

在“采购供应”下新增“采购申请”，位于“采购订单”之前。

列表展示：

- 申请单号、项目、供应商、状态、预算状态、申请金额、申请人、提交时间、更新时间。
- 服务端过滤：关键字、状态、预算状态、项目、供应商。
- 待我审批快捷筛选。

创建和编辑使用大尺寸 Sheet：

1. 选择项目和可采购供应商。
2. 从分页目录添加 SKU。
3. 每行选择成本分类、填写数量。
4. 填写临时采购原因、期望到货日期和备注。
5. 保存后展示后端价格和分类金额汇总。

详情只显示后端允许的主要动作：

- `draft`：编辑、提交、取消。
- `pending_approval`：有审批权限时批准或驳回；申请人可取消。
- `approved`：生成采购单。
- `converted`：查看采购单。
- `rejected | cancelled`：只读。

预算卡展示：

- 申请金额。
- 已支出。
- 其他有效承诺。
- 本申请承诺。
- 批准后可用余额。

超预算使用语义警告色和明确差额，不用模糊的红色装饰。版本、价格或预算变化时
提示刷新，不静默重试 mutation。

项目成本预算面板增加：

- 已承诺金额。
- 可用预算。
- 分类行的支出、承诺、可用余额。

复用现有 shadcn/ui、`StatusAlert`、分页表格和金额格式化工具，不新增依赖。

## 9. 测试与验收

按 TDD 顺序：

1. Zod：分页、状态、UUID、金额精度、原因、1 至 100 行、SKU 唯一。
2. migration 契约：表、复合外键、约束、索引、RLS、授权、权限 seed、锁序、
   幂等、价格解析、预算汇总、预占、释放、转换和回滚说明。
3. Repository：项目范围分页、明细分页、RPC 参数、严格响应和错误映射。
4. Service/Controller：租户、项目权限、自审拒绝、超预算双权限和幂等键。
5. Admin 规则：action 可见性、分类汇总、payload 不包含价格金额、冲突恢复。
6. Playwright 确定性 E2E：
   - 创建预算内申请。
   - 编辑并提交。
   - 批准并生成采购单草稿。
   - 创建超预算申请。
   - 普通审批人不能批准，预算管理员批准。
   - 驳回或取消释放承诺。
7. 真实数据库回滚 smoke：
   - 两个并发申请不会共同超占同一预算。
   - 幂等重放与幂等冲突。
   - 乐观锁、价格变化和预算变化冲突。
   - 自审、跨租户和越权拒绝。
   - 转换只生成一张采购单。
8. API/Admin 类型检查、构建、权限扫描和写入审计。
9. migration 应用前事务回滚；应用后 `supabase migration list` Local/Remote 对齐。

## 10. 发布与回滚

发布顺序：

1. 应用数据库 migration。
2. 生成并提交 Supabase 数据库类型。
3. 发布 API。
4. 发布 Admin 申请页面和预算展示。
5. 隐藏直接新建采购单入口。

回滚必须使用前向 migration：

- 先隐藏申请 mutation 和转换入口。
- 恢复旧版采购单入口仅作为应急应用回退。
- 撤销新权限的角色授权。
- 保留申请、明细、审批和预算承诺审计事实。
- 将仍为 `reserved` 且确认不再执行的承诺通过受控修复命令释放。
- 不删除已转换申请、采购单或命令事件。
- 任何情况下不手工修改远端 DDL/DML。
