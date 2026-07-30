# 供应商采购履约 MVP 设计

**日期：** 2026-07-30  
**状态：** 已批准，进入实施  
**范围：** Gooes API、Admin、Supabase migration；不改动 orange 仓库

## 1. 背景与目标

采购单 MVP 已形成服务端计价、提交和取消闭环，但提交后没有记录供应商确认、
分批发货和项目收货验收的结构化事实。下一阶段交付一个以已提交采购单为来源的
履约闭环：

1. 租户员工记录供应商已经接受采购单。
2. 一张采购单可按明细分多批发货。
3. 项目人员可按已发货未收数量分批验收。
4. 每次验收记录接受、拒收数量和差异原因。
5. 系统维护逐行累计履约事实和可供后续应付使用的接受金额。
6. Admin 在现有采购单详情中完成确认、发货、收货和履约查看。

## 2. 范围边界

### 2.1 本阶段包含

- 租户员工代录供应商确认结果；不建设供应商门户。
- 多批次发货和多批次收货。
- 发货单号、承运方、运单号、发货时间和备注。
- 收货时间、接受数量、拒收数量和逐行差异原因。
- 采购单、发货、收货的幂等、乐观锁、审计和租户隔离。
- 基于采购单冻结价格快照计算累计接受金额。
- 已开始履约后禁止取消采购单。

### 2.2 本阶段不包含

- 供应商登录、在线确认或外部通知。
- 仓库、库位、库存、批次、序列号和出入库流水。
- 退货、换货、补发和验收冲销。
- 发票、对账单、应付单、付款申请、付款和财务凭证。
- 修改微信小程序或 `/Users/leefo/Public/work/orange`。

接受金额只是后续应付模块的事实输入，不在本阶段生成财务债务。

## 3. 架构决策

### 3.1 独立履约聚合

采购单继续表达采购承诺和冻结价格，不把多批次履约状态塞入
`supplier_purchase_orders.status`。新增一对一履约头、发货事件、发货行、
收货事件、收货行和逐采购行累计表。

优势：

- 采购单生命周期仍保持 `draft | submitted | cancelled`。
- 多批次发货和收货有独立、不可变的审计事实。
- 履约状态可从累计量稳定派生，不依赖客户端推断。
- 后续库存、退货和应付可以引用稳定 ID，不需要重写采购单事实。

### 3.2 员工代录供应商确认

本阶段没有供应商身份和门户，因此“供应商确认”表示租户员工基于线下沟通录入：

- 确认时间默认由客户端提供业务时间，数据库同时记录创建时间。
- 可填写不超过 500 字的确认备注。
- 记录操作员工和认证用户。
- 只允许对 `submitted` 采购单确认一次。

供应商拒绝不单独形成确认状态；员工应在尚未履约时使用现有取消命令并填写原因。

## 4. 数据模型

### 4.1 `supplier_purchase_order_fulfillments`

每张已开始履约的采购单最多一行：

- `id`
- `tenant_id`
- `supplier_purchase_order_id`
- `status`
- `confirmed_at`
- `confirmed_by_employee_id`
- `confirmation_remark`
- `version`
- `created_at`
- `updated_at`

状态：

- `confirmed`：已确认，尚未发货。
- `partially_shipped`：累计发货数量小于订购数量。
- `shipped`：全部订购数量已发货，尚未完成收货。
- `partially_received`：已有收货，但仍有未收数量。
- `received`：全部订购数量已收且无拒收。
- `received_with_variance`：全部订购数量已收，至少一行存在拒收。
- `cancelled`：已确认但尚未发货时，采购单被取消。

状态由数据库命令根据累计量重算，客户端不得提交。

### 4.2 `supplier_purchase_order_item_fulfillments`

每个采购单明细一行累计事实：

- `supplier_purchase_order_item_id`
- `ordered_quantity`
- `shipped_quantity`
- `received_quantity`
- `accepted_quantity`
- `rejected_quantity`
- `accepted_subtotal_amount`
- `accepted_tax_amount`
- `accepted_total_amount`
- `updated_at`

约束：

```text
0 <= received_quantity <= shipped_quantity <= ordered_quantity
accepted_quantity + rejected_quantity = received_quantity
```

接受金额始终用采购单明细冻结的单价、税率和含税标志按累计接受数量重算，
不累加客户端金额，也不读取当前价格簿。

### 4.3 `supplier_purchase_order_shipments`

发货头：

- `id`：客户端预生成 UUID，作为命令资源 ID。
- `tenant_id`
- `supplier_purchase_order_id`
- `shipment_no`：每张订单内唯一，去空格后 1 至 80 字。
- `carrier_name`：可空，最长 100 字。
- `tracking_no`：可空，最长 120 字。
- `shipped_at`
- `remark`：可空，最长 500 字。
- `created_by_employee_id`
- `created_at`

发货一经记录不可修改或删除。本阶段发生录入错误时停止后续操作，由未来冲销命令
处理，禁止直接更新历史事实。

### 4.4 `supplier_purchase_order_shipment_items`

- `shipment_id`
- `supplier_purchase_order_item_id`
- `quantity numeric(18,4)`
- 同一发货批次内采购行唯一。

一批 1 至 100 行；累计发货不得超过订购数量。

### 4.5 `supplier_purchase_order_receipts`

收货头：

- `id`：客户端预生成 UUID。
- `tenant_id`
- `supplier_purchase_order_id`
- `receipt_no`：每张订单内唯一，去空格后 1 至 80 字。
- `received_at`
- `remark`：可空，最长 500 字。
- `received_by_employee_id`
- `created_at`

收货事件不可修改或删除。

### 4.6 `supplier_purchase_order_receipt_items`

- `receipt_id`
- `supplier_purchase_order_item_id`
- `accepted_quantity numeric(18,4)`
- `rejected_quantity numeric(18,4)`
- `variance_reason`：存在拒收时必填，最长 500 字；无拒收时必须为空。

每行本次收货量为接受与拒收之和，必须大于 0。累计收货不得超过累计发货。

## 5. 数据库约束、安全与性能

- 所有表包含 `tenant_id`，并通过复合外键保证采购单、采购行和履约事实同租户。
- 所有表启用并强制 RLS，仅 `service_role` 具备必要访问权限。
- 写操作只能经过 SECURITY DEFINER 命令函数。
- 履约头与累计行可更新；发货、收货及其明细只允许命令函数插入。
- 索引覆盖：
  - 履约头：`tenant_id + status + updated_at + id`
  - 发货：`tenant_id + supplier_purchase_order_id + shipped_at + id`
  - 收货：`tenant_id + supplier_purchase_order_id + received_at + id`
  - 发货/收货明细：父 ID + 采购行 ID
- 发货和收货列表默认 `page=1&pageSize=20`，最大 `100`。
- 列表查询限定必要字段并使用 `.range()`；详情读取用集合查询，不允许 N+1。

## 6. 命令、锁序与幂等

所有命令先校验基础参数和 actor，再使用统一锁序：

```text
actor + idempotency advisory lock
→ purchase-order-id advisory lock
→ purchase order row
→ fulfillment row
→ purchase item rows（按 id 升序）
```

### 6.1 `confirm_supplier_purchase_order_fulfillment`

输入：

- 采购单 ID、租户 ID、采购单预期版本。
- 确认时间、备注。
- actor user/employee、幂等键。

规则：

- 采购单必须为 `submitted`。
- 尚不存在履约头。
- 创建履约头和所有采购行累计记录。
- 采购单保持不变；履约头从 `version = 1` 开始独立乐观锁。
- 返回采购单、履约头和履约版本。

### 6.2 `create_supplier_purchase_order_shipment`

输入：

- 发货 ID、采购单 ID、租户 ID、履约预期版本。
- 发货单号、承运方、运单号、发货时间、备注。
- 1 至 100 个 `{ purchase_order_item_id, quantity }`。
- actor user/employee、幂等键。

规则：

- 采购单为 `submitted`，履约已确认且未完成收货。
- 每行属于该采购单。
- 累计发货不得超过订购数量。
- 原子写入发货头、发货行，更新累计行和履约状态/版本。

### 6.3 `create_supplier_purchase_order_receipt`

输入：

- 收货 ID、采购单 ID、租户 ID、履约预期版本。
- 收货单号、收货时间、备注。
- 1 至 100 个 `{ purchase_order_item_id, accepted_quantity,
  rejected_quantity, variance_reason }`。
- actor user/employee、幂等键。

规则：

- 采购单为 `submitted`，履约已发货。
- 本次和累计收货不超过累计发货。
- 拒收数量大于 0 时必须提供差异原因。
- 原子写入收货头、收货行，更新累计量、接受金额、履约状态和版本。

### 6.4 幂等响应

复用 `supplier_command_events`，资源类型继续使用
`supplier_purchase_order`，resource ID 使用采购单 ID，command 分别为：

- `confirm_supplier_purchase_order_fulfillment`
- `create_supplier_purchase_order_shipment`
- `create_supplier_purchase_order_receipt`

请求指纹包含事件 ID、业务字段、规范化明细和 actor employee。相同 actor/key
只有请求完全一致时返回原结果，否则返回 `SUPPLIER_IDEMPOTENCY_CONFLICT`。

### 6.5 取消边界

替换现有 `cancel_supplier_purchase_order`：

- 尚无履约头时保持当前行为。
- 已确认但没有任何发货时仍允许取消，同时将履约头保留为审计事实并标记
  `cancelled`。
- 已存在发货或收货时返回
  `SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED`，禁止取消。

## 7. API 与分层

新增接口：

```text
GET  /supplier-purchase-orders/:id/fulfillment
GET  /supplier-purchase-orders/:id/shipments
GET  /supplier-purchase-orders/:id/receipts
POST /supplier-purchase-orders/:id/confirm-fulfillment
POST /supplier-purchase-orders/:id/shipments
POST /supplier-purchase-orders/:id/receipts
```

- Controller：只读取 request、Zod 校验、提取幂等键、调用 service、
  `ResponseHandler.success`。
- Service：组合采购单权限、项目范围、订单存在性和状态前置条件。
- Repository：唯一直接访问 Supabase 表和 RPC 的层。
- 所有错误由 repository 映射并经过 `error-factory.ts`。

权限：

- 查看履约：`supplier.purchase-order.view` + 目标项目 `project.read`。
- 确认、发货、收货：`supplier.purchase-order.manage` + 目标项目
  `project.update`。

## 8. Admin 体验

履约功能放在现有采购单详情，不新增侧边栏入口。

- 订单摘要下增加紧凑的履约区：
  - 状态 Badge。
  - 已确认时间。
  - 订购、已发、已收、接受、拒收数量摘要。
  - 接受含税金额。
- 履约时间线按时间倒序展示确认、发货和收货事件。
- 管理操作：
  - `submitted` 且未确认：`记录供应商确认`。
  - 已确认且仍有未发数量：`记录发货`。
  - 已有未收发货数量：`记录收货`。
- 发货和收货对话框使用采购行表格，只显示仍可操作数量。
- 数量输入就近显示上限和字段错误；拒收时同行要求填写差异原因。
- mutation 期间按钮禁用并显示 Spinner。
- 只读用户可查看所有履约事实，不显示 mutation 按钮。
- 加载、空、错误和冲突状态使用现有 `StatusAlert`、`Skeleton` 和 toast。

页面保持中后台密度：中性表面、语义状态色、14px 正文、无嵌套装饰卡和新 UI
依赖。

## 9. 测试与验收

按 TDD 顺序：

1. Zod schema：分页、UUID、时间、行数、数量精度、拒收原因和未知字段。
2. migration 契约：表、约束、复合外键、索引、RLS、最小授权、命令、锁序、
   幂等、状态派生、超量保护、取消边界和回滚说明。
3. repository：必要字段、分页 `.range()`、RPC 参数、响应 Zod 和错误映射。
4. service/controller：权限与项目范围、路由、输入和幂等键传递。
5. Admin 规则：动作可见性、逐行剩余量、payload 不包含金额、拒收校验。
6. Playwright 确定性 E2E：
   - 提交采购单。
   - 记录确认。
   - 两批发货。
   - 部分收货。
   - 最终收货含拒收差异。
   - 校验最终 `received_with_variance` 和 mutation journal。
7. 真实数据库 smoke：
   - 幂等重放与冲突。
   - 乐观锁冲突。
   - 超发、超收和未发先收拒绝。
   - 接受金额按冻结价格计算。
   - 履约开始后取消被拒绝。
   - 双租户隔离。
   - 全部 fixture 强制回滚。
8. API/Admin 类型检查、构建、权限扫描和写入审计。
9. migration 应用前事务回滚验证；应用后 Local/Remote 对齐。

## 10. 发布与回滚

发布顺序：

1. 应用履约 migration。
2. 生成并提交 Supabase 类型。
3. 发布 API。
4. 发布 Admin 履约区。

回滚必须使用前向 migration：

- 先隐藏 Admin mutation，停止新履约事件。
- 保留所有确认、发货、收货和累计事实。
- 若需停止履约，只撤销命令函数执行权限，不删除审计数据。
- 只有确认从未产生履约记录且没有下游引用时，才允许在单独前向 migration
  中按明细、事件、累计、履约头的依赖顺序删除。

禁止手工在远端数据库执行 DDL/DML。
