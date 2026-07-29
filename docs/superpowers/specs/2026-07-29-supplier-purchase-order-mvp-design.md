# 供应商采购单 MVP 设计

**日期：** 2026-07-29
**状态：** 已批准，进入实施
**范围：** Gooes API、Admin、Supabase migration；不改动 orange 仓库

## 1. 背景与目标

供应商基础阶段已经具备租户合作关系、准入判断、供应商品、SKU 和默认基础供货价，但还没有把这些能力串成采购动作。下一阶段交付一个可实际使用、可审计的项目采购单最小闭环：

1. 员工在有权限访问和更新的项目下选择可下单供应商。
2. 从该供应商当前生效的商品价格目录中选 SKU、填写采购数量。
3. 服务端统一解析价格并保存采购事实快照。
4. 草稿可反复保存，随后提交或取消。
5. Admin 能完成列表、创建、编辑草稿、提交、查看和取消。

## 2. 明确不做

本阶段不包含：

- 供应商门户或供应商自行确认订单。
- 审批流、询价比价、议价和手工改价。
- 协议价、阶梯价、项目专属价或多币种换算。
- 发货、收货、退货、入库、库存和批次流水。
- 对账、发票、付款、应付台账和财务凭证。
- 修改微信小程序或 `/Users/leefo/Public/work/orange`。

这些能力必须以后续独立设计和 migration 扩展，不能塞进本次采购单命令。

## 3. 核心业务决策

### 3.1 项目与供应商

- 每张采购单必须绑定一个 `project_id`。
- 项目必须属于当前租户；查看订单需同时具备采购单查看权限和项目读取权限。
- 新建或修改草稿需具备采购单管理权限和项目更新权限。
- 每张采购单必须绑定一个 `tenant_supplier_id`。
- 创建、保存和提交均复用 `TenantSuppliersService.assertCanCreatePurchaseOrder()` 的准入语义：供应商模块已启用、合作关系有效、供应商已审批且正常运营，并满足租户的有效合同策略。
- 草稿建立后不允许更换租户、项目或供应商。需要改变时取消原单并新建，避免审计事实混杂。

### 3.2 价格与币种

- MVP 只接受租户合作关系的 `default_currency = CNY`，并只解析 `currency = CNY`、`scope_type = default` 的已发布价格簿。
- 客户端保存草稿时只提交 `supplier_sku_id` 和 `quantity`，不提交价格簿、价格条目、单价、税率或金额。
- 数据库在一次草稿保存命令内以同一个 `priced_at` 解析所有 SKU 的当前有效价格：
  - `lifecycle_status = published`
  - `effective_from <= priced_at`
  - `effective_until IS NULL OR effective_until > priced_at`
  - 商品和 SKU 均为 `active`
  - SKU、价格条目和价格簿属于订单供应商
- 当前 Phase 1 已禁止同一 SKU 的已发布有效期重叠；解析结果必须恰好一条。缺价、重复价或失效商品都使整单保存失败。
- 草稿保存是整单原子替换：所有行使用同一 `priced_at` 和同一批解析结果，不能产生混合计价时点。
- 提交前再次按数据库当前时间解析价格，并与草稿快照中的价格条目和价格簿版本比较。任何变化返回 `SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED`，前端提示用户重新保存草稿以统一刷新价格。
- 已提交订单不随商品、单位或价格簿后续变化而变化。

### 3.3 金额规则

数量使用 `numeric(18,4)` 且必须大于 0；单价使用 `numeric(14,2)`；行金额和整单金额使用 `numeric(18,2)`。

若价格含税：

```text
line_total = round(quantity × unit_price, 2)
line_subtotal = round(line_total ÷ (1 + tax_rate), 2)
line_tax = line_total - line_subtotal
```

若价格不含税：

```text
line_subtotal = round(quantity × unit_price, 2)
line_tax = round(line_subtotal × tax_rate, 2)
line_total = line_subtotal + line_tax
```

整单金额分别汇总行未税金额、税额和含税金额。所有金额均由数据库计算，API 和 Admin 不作为事实来源。

## 4. 数据模型

### 4.1 `supplier_purchase_orders`

主要字段：

- 身份与归属：`id`、`tenant_id`、`project_id`、`tenant_supplier_id`、`supplier_id`
- 单号与状态：`order_no`、`status`
- 业务字段：`currency`、`expected_delivery_date`、`remark`
- 计价与金额：`priced_at`、`subtotal_amount`、`tax_amount`、`total_amount`
- 并发与审计：`version`、`created_by_employee_id`、`updated_by_employee_id`、`submitted_by_employee_id`、`submitted_at`、`cancelled_by_employee_id`、`cancelled_at`、`cancel_reason`、时间戳

约束：

- 状态仅允许 `draft | submitted | cancelled`。
- 订单与项目、租户供应商关系、供应商必须保持租户和供应商一致。
- 单号全局唯一，格式为 `PO-YYYYMMDD-########`，由数据库序列生成。
- `submitted_*`、`cancelled_*` 元数据必须与状态匹配。
- `version > 0`，每次成功 mutation 增加 1。

### 4.2 `supplier_purchase_order_items`

主要字段：

- 身份：`id`、`tenant_id`、`supplier_purchase_order_id`、`line_no`
- 来源引用：`supplier_product_id`、`supplier_sku_id`、`supplier_price_list_id`、`supplier_price_list_item_id`
- 商品快照：商品编码/名称、SKU 编码/名称、规格、型号
- 单位快照：采购单位和基础单位的 ID、编码、名称、符号、换算率
- 价格快照：数量、单价、税率、是否含税
- 金额事实：行未税金额、税额、含税金额
- 时间戳

约束：

- 每单最多 100 行，同一 SKU 每单只允许一行。
- 行号唯一且按请求顺序从 1 连续生成。
- 外键使用 `ON DELETE RESTRICT`；已提交事实不能因基础数据变更丢失。

### 4.3 索引与安全

新增索引覆盖：

- `tenant_id + status + updated_at + id` 的订单列表。
- `tenant_id + project_id + updated_at + id` 的项目订单列表。
- `tenant_id + tenant_supplier_id + updated_at + id` 的供应商订单列表。
- `supplier_purchase_order_id + line_no` 的明细分页。
- 有效价格解析沿用并核查 Phase 1 的价格簿和价格条目索引；若执行计划不足，只通过本 migration 增补。

两张表启用并强制 RLS，只向 `service_role` 授予必要权限。写入只能经过受限的数据库命令函数；不能由客户端直接写表。

## 5. 命令、幂等与并发

### 5.1 草稿保存

`save_supplier_purchase_order_draft` 接收：

- 订单 ID、租户、项目、合作关系。
- `expected_version`：创建为 0，更新为当前版本。
- 预计交付日期、备注。
- 1 到 100 个 `{ supplier_sku_id, quantity }`。
- actor user/employee 与 `idempotency_key`。

函数在一个事务内：

1. 校验 actor 属于租户。
2. 锁定项目和供应商关系并校验归属。
3. 校验草稿状态和版本。
4. 对请求规范化后计算请求指纹。
5. 通过一条集合查询解析全部有效价格，拒绝缺价、重复 SKU 和失效商品。
6. 创建或更新订单、替换全部明细、计算金额。
7. 写入 `supplier_command_events`。
8. 返回订单头和版本。

同一 actor 的同一幂等键只有在 resource、command 和请求指纹完全一致时才返回之前结果；否则返回 `SUPPLIER_IDEMPOTENCY_CONFLICT`。

### 5.2 提交与取消

- `submit_supplier_purchase_order`：仅允许 `draft -> submitted`，要求版本匹配、至少一行、项目和供应商仍可用、当前价格与统一草稿快照一致。
- `cancel_supplier_purchase_order`：允许 `draft | submitted -> cancelled`，要求版本匹配和非空取消原因。
- 已提交订单除取消外不可编辑；已取消订单不可恢复。
- 命令均写 `supplier_command_events`，资源类型扩展为 `supplier_purchase_order`。

## 6. 权限模型

新增领域权限：

- `supplier.purchase-order.view`：查看采购单列表、详情和金额。
- `supplier.purchase-order.manage`：保存草稿、提交和取消；也允许查看创建器所需的当前有效 SKU 价格。

权限使用现有角色与 permission seed 机制通过 migration 初始化。原始商品和价格簿页面仍分别使用 `supplier.product.*` 与 `supplier.cost-price.*`；采购单权限不授予维护基础价格的能力。

订单数据还必须与项目权限求交集：

- 列表：`supplier.purchase-order.view` + `project.read` 可见项目范围。
- 详情：`supplier.purchase-order.view` + 对目标项目的 `project.read`。
- 保存/提交/取消：`supplier.purchase-order.manage` + 对目标项目的 `project.update`。

## 7. API 设计

所有列表默认 `page=1&pageSize=20`，`pageSize <= 100`。

```text
GET  /supplier-purchase-orders
GET  /supplier-purchase-orders/:id
GET  /supplier-purchase-orders/:id/items
GET  /supplier-purchase-order-catalog
POST /supplier-purchase-orders/:id/save-draft
POST /supplier-purchase-orders/:id/submit
POST /supplier-purchase-orders/:id/cancel
```

列表过滤：

- 订单：`keyword`、`status`、`projectId`、`tenantSupplierId`。
- 明细：仅分页。
- 可采购目录：必填 `tenantSupplierId`，支持 `keyword`、`page`、`pageSize`。

`Idempotency-Key` 请求头对三个 mutation 必填，最长 120 字符。Controller 只解析 HTTP、Zod 校验、调用 service 并包装 `ResponseHandler.success`；service 组合权限和业务；repository 是唯一访问 Supabase 表和 RPC 的层。

主要业务错误码：

- `SUPPLIER_PURCHASE_ORDER_NOT_FOUND`
- `SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT`
- `SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT`
- `SUPPLIER_PURCHASE_ORDER_PRICE_MISSING`
- `SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED`
- `SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID`
- `SUPPLIER_ORDER_NOT_ELIGIBLE`
- `SUPPLIER_IDEMPOTENCY_CONFLICT`

数据库错误必须由 repository 映射并经过 `error-factory.ts` 包装，不直接抛出 `Error`。

## 8. Admin 体验

在“采购供应”下新增“采购订单”菜单，受 `supplier.purchase-order.view` 控制。

页面采用现有 Admin 组件：

- 页面头：标题、简短说明、“新建采购单”主按钮。
- 列表：单号、项目、供应商、状态、含税总额、计价时间、预计交付日期、更新时间和操作。
- 过滤：关键字、状态、项目、供应商；服务端分页。
- 新建/编辑使用大尺寸 Sheet 或 Dialog：
  - 先选项目和供应商。
  - 从分页可采购目录添加 SKU。
  - 修改数量后仅在客户端预估；保存后以后端返回金额为准。
  - 草稿保存成功后刷新版本和明细。
- 草稿操作：编辑、提交、取消。
- 已提交操作：查看、取消。
- 已取消操作：查看。
- 提交或取消使用确认弹窗；版本冲突和价格变化显示明确恢复动作。
- 缺少查看权限时显示无权状态，缺少管理权限时隐藏 mutation 按钮。

不复制 shadcn 组件，不新增 UI 依赖。

## 9. 测试与验收

按测试驱动顺序：

1. 领域权限和 Zod schema 单测。
2. migration 静态契约测试：表、约束、RLS、索引、函数、权限 seed、幂等与状态机。
3. repository/service/controller 单测：分页、项目范围、准入、RPC 参数、错误映射。
4. Admin 组件测试：权限、按钮状态、表单提交、版本/价格冲突恢复。
5. 独立内存 Mock Backend + Playwright 确定性 E2E：
   - 新建并保存草稿。
   - 编辑数量并统一刷新价格。
   - 提交。
   - 从列表查看并取消。
   - 校验 mutation journal 不接受客户端价格字段。
6. API/Admin 类型检查和构建。
7. 将 migration 应用到目标 Supabase，生成数据库类型。
8. 运行数据库 smoke 验证真实命令、价格变化冲突、乐观锁和租户隔离。
9. `supabase migration list` 验证 Local/Remote 对齐。

## 10. 发布与回滚

发布顺序：

1. 先应用数据库 migration。
2. 生成并提交数据库类型。
3. 发布 API。
4. 发布 Admin 菜单与页面。

回滚使用新的前向 migration 和应用回退：

1. 先隐藏 Admin 菜单并停止 mutation 流量。
2. 撤销新权限的角色授权。
3. 保留采购单、明细和命令事件作为审计事实。
4. 只有确认从未产生采购单且没有任何下游引用时，才允许在前向 migration 中按函数、明细、订单、序列的依赖顺序删除；执行前必须导出并核对数据。

任何情况下都不手工修改远端 DDL/DML。
