# 公司仓库采购与库存闭环设计

**日期：** 2026-09-05

**状态：** 待书面评审

**范围：** Gooes API、Admin、Domain、Supabase migration 和对接文档；不改动 Orange 仓库

## 1. 背景

现有供应商采购链路以项目直采为唯一业务范围。采购批次、采购申请、采购单、
预算承诺、收货成本、供应商应付和付款记录均依赖非空 `project_id`。这能支持材料
直接配送到项目现场，但不能支持装修公司先采购到公司仓库、后续按项目领用。

供应商平台总体设计已经确认同时支持项目直送和公司仓库备货，但此前为控制范围，
生产闭环只实现了项目直采。本阶段补齐仓库采购的最小纵向闭环，不建设完整 WMS。

## 2. 目标

1. 采购批次可选择“项目采购”或“仓库补货”。
2. 仓库采购按现有供应商目录、价格、拆单、审批、履约、应付和付款链路执行。
3. 仓库合格收货形成库存，不提前形成项目成本。
4. 仓库材料领用到项目时扣减库存并形成项目成本。
5. 项目退料回仓时增加库存并冲减项目成本。
6. 用户不需要手工选择内部编码、库存成本或重复选择成本分类。
7. 现有项目采购接口和历史数据保持兼容。

## 3. 非目标

首期不包含：

- 多仓调拨和在途库存。
- 库区、库位和货架管理。
- 盘点任务与盘盈盘亏审批。
- 实际批号、色号、序列号和有效期管理。
- 库存预留、安全库存和自动补货。
- BOM 自动生成仓库补货计划。
- 个别计价、先进先出或指定批次成本。
- Orange 仓库代码修改。

## 4. 核心决策

### 4.1 不使用虚拟项目

禁止创建“公司仓库”虚拟项目。虚拟项目会污染项目权限、项目预算、施工统计、
项目成本和经营报表，并且无法表达多仓场景。

采购业务使用明确的收货目的地：

```text
destination_type = project | warehouse

project    -> project_id 非空，warehouse_id 为空
warehouse  -> warehouse_id 非空，project_id 为空
```

数据库必须使用检查约束保证目的地与外键一致。不要只依赖前端校验，也不要使用
无法建立外键的通用 `destination_id`。

### 4.2 复用现有采购聚合

采购批次仍是用户发起采购的主要入口。批次提交后继续按供应商拆成采购申请，审批
通过后生成采购单。批次、申请和采购单必须保存同一个目的地，子单不得改变目的地。

现有项目采购路径保持原语义；仓库补货只在预算、权限、收货过账和成本确认时走独立
分支。

### 4.3 库存以不可变流水为事实来源

`inventory_transactions` 是库存数量和价值的事实来源。库存余额是可重建投影，不能
只保存一个可直接覆盖的当前数量。

首期流水类型：

- `purchase_receipt`：仓库采购合格收货。
- `project_issue`：仓库领料到项目。
- `project_return`：项目退料回仓。
- `supplier_return`：仓库材料退回供应商，为后续退货命令预留。
- `adjustment_in`、`adjustment_out`：只预留领域值，首期不开放人工操作。

### 4.4 移动加权平均计价

首期按仓库和 SKU 维护移动加权平均成本。采购入库使用采购单冻结成交金额；项目
领料使用出库时的移动平均单位成本。前端不得计算或提交库存成本。

金额和数量计算必须在数据库事务内完成。禁止库存变为负数；并发出库必须锁定同一
仓库和 SKU 的余额范围。

### 4.5 成本与应付分离

项目直送合格收货：

```text
收货 -> project_cost_events + supplier_payable_events
```

仓库备货合格收货：

```text
收货 -> inventory_transactions(purchase_receipt)
     -> supplier_payable_events
     -> 不写 project_cost_events
```

项目领料：

```text
领料确认 -> inventory_transactions(project_issue)
         -> project_cost_events
```

项目退料生成反向库存流水和反向项目成本事件。付款只影响应付和现金台账，不重复计入
项目成本。

## 5. 数据模型

### 5.1 `warehouses`

至少包含：

- `id`、`tenant_id`
- 系统生成的 `warehouse_code`
- `name`
- `address`、`contact_name`、`contact_phone`
- `manager_employee_id`
- `is_default`、`status = active | inactive`
- `version`
- 创建、更新和审计字段

同一租户最多一个默认仓库。停用仓库不能创建新采购或新出库，但历史单据可继续查看。
租户首次启用仓库采购时，系统自动创建名为“公司仓库”的默认仓库并生成编码；管理员
可以重命名和补充地址，不要求普通采购人员先维护仓库资料。

### 5.2 采购目的地字段

以下表增加 `destination_type` 和可空 `warehouse_id`，并将 `project_id` 改为可空：

- `supplier_purchase_batches`
- `supplier_purchase_requisitions`
- `supplier_purchase_orders`
- `supplier_payable_events`
- `supplier_payment_requests`
- `supplier_payments`

历史记录全部回填 `destination_type = project`。迁移先加字段和约束，再回填，再切换
写入路径，最后收紧非空和互斥约束，避免中间状态破坏生产读写。

项目预算承诺仍只服务项目采购，不扩展为仓库预算承诺。仓库补货首期进入采购审批，
预算状态明确显示“仓库采购暂不适用项目预算”，不能伪装为预算内。

### 5.3 `inventory_transactions`

至少包含：

- `id`、`tenant_id`、`warehouse_id`
- `supplier_sku_id`
- `transaction_type`
- `quantity_delta`、`unit_cost`、`value_delta`
- `source_type`、`source_id`
- 可空 `project_id`、`cost_category_id`
- `occurred_at`、`created_by_employee_id`、`created_at`

`(tenant_id, source_type, source_id)` 唯一，保证重复收货或重复领料不会重复记账。
流水只允许插入，不允许更新和删除。

### 5.4 `inventory_balances`

按 `(tenant_id, warehouse_id, supplier_sku_id)` 唯一，至少保存：

- `quantity_on_hand`
- `inventory_value`
- `average_unit_cost`
- `version`
- `updated_at`

余额由原子库存命令维护，并提供流水重算校验工具。余额表不是独立业务事实。

### 5.5 项目领料和退料

新增：

- `warehouse_issue_orders` / `warehouse_issue_order_items`
- `warehouse_return_orders` / `warehouse_return_order_items`

领料单绑定一个仓库和一个项目，不允许一张单跨仓或跨项目。明细绑定 SKU、数量和
成本分类快照。成本分类默认从商品/SKU 后台配置解析；无法解析时阻断提交，并提示
管理员完成商品成本归类，普通领料用户不手工选择。

首期状态使用：

```text
draft -> submitted -> completed
                  \-> cancelled
```

`completed` 命令原子完成库存扣减和项目成本事件写入。

## 6. 权限与数据范围

新增最小权限：

- `inventory.warehouse.view`
- `inventory.warehouse.manage`
- `inventory.stock.view`
- `inventory.issue.manage`
- `inventory.issue.approve`

仓库采购继续要求现有采购权限；仓库和库存操作不能要求 `project.read/update`。
项目领料同时要求仓库出库权限和目标项目 `project.read`；审批或完成出库需要目标项目
在当前员工的数据范围内，并要求 `inventory.issue.approve`。不复用 `project.update`
作为仓库出库权限，避免仓库管理员被迫获得项目编辑能力。

所有表启用强制 RLS，仓库、库存和流水均以 `tenant_id` 隔离。列表默认
`page=1&pageSize=20`，最大 `100`。

## 7. Workflow 与审批

采购批次继续使用 `supplier_purchase_batch` workflow：

- 项目采购：保持现有采购审批和项目预算分支。
- 仓库补货：执行采购审批；首期不计算项目预算，也不进入“超项目预算”分支。
- Workflow context 保存 `destination_type`、`project_id` 或 `warehouse_id`。
- 审批任务展示“项目采购”或“仓库补货”及具体目的地名称。

项目领料首期使用独立业务状态和权限审批，不把库存事实写入 workflow 表。若后续需要
多级审批，再将同一完成命令接入通用 workflow。

## 8. API 与分层

新增分页读取接口：

```text
GET /warehouses
GET /warehouses/:id
GET /inventory/balances
GET /inventory/transactions
GET /warehouse-issues
GET /warehouse-issues/:id
GET /warehouse-issues/:id/items
GET /warehouse-returns
GET /warehouse-returns/:id
GET /warehouse-returns/:id/items
```

新增命令接口：

```text
POST /warehouses
PATCH /warehouses/:id
POST /warehouse-issues/:id/save-draft
POST /warehouse-issues/:id/submit
POST /warehouse-issues/:id/complete
POST /warehouse-issues/:id/cancel
POST /warehouse-returns/:id/save-draft
POST /warehouse-returns/:id/complete
```

现有采购批次、申请和采购单接口扩展目的地字段，不新建一套平行仓库采购 API。

Controller 只处理 HTTP 和校验；Service 编排权限、状态和业务分支；Repository/RPC
直接访问数据库。所有错误经过 `error-factory.ts`。

## 9. Admin 交互

### 9.1 新建采购批次

第一步使用分段选择：

- 项目采购
- 仓库补货

项目采购显示项目选择；仓库补货显示启用仓库。只有一个启用仓库时自动选择；多个
仓库时默认选中默认仓库。用户继续选择商品、填写数量、原因和期望到货日期。

列表、详情、审批、采购单、应付、付款和导出统一显示“采购去向”，内容为项目名称或
仓库名称，不展示内部编码。

### 9.2 仓库与库存

“采购供应”下新增“仓库库存”，包含：

- 库存余额：商品、SKU、仓库、现存数量、平均成本、库存金额。
- 库存流水：时间、类型、数量变化、价值变化、来源单据和操作人。
- 项目领料：草稿、待确认、已完成和已取消。
- 项目退料。
- 仓库设置仅对管理权限显示。

### 9.3 简化原则

- 一个仓库时不重复要求用户选择。
- SKU 编码、成本计算和流水号均由系统生成。
- 成本分类默认解析，普通用户只处理异常。
- 不让用户填写库存单价、平均成本或项目成本金额。
- 不在采购页面暴露会计和内部状态编码。

## 10. 错误处理

新增稳定错误码至少包括：

- `WAREHOUSE_NOT_FOUND`
- `WAREHOUSE_INACTIVE`
- `PURCHASE_DESTINATION_INVALID`
- `INVENTORY_BALANCE_INSUFFICIENT`
- `INVENTORY_COST_UNAVAILABLE`
- `INVENTORY_SOURCE_CONFLICT`
- `WAREHOUSE_ISSUE_STATE_CONFLICT`
- `WAREHOUSE_RETURN_EXCEEDS_ISSUED_QUANTITY`

库存不足、重复来源和版本冲突必须由数据库原子命令判断。前端预检只用于改善体验，
不能作为最终门禁。

## 11. 兼容与迁移

1. 所有数据库变更通过 `supabase/migrations/`，禁止远端手工修库。
2. 历史采购记录回填为项目目的地，项目采购响应保持兼容。
3. 现有只读取 `project_id` 的客户端在兼容期继续可用；新增字段以加法方式发布。
4. API 和 Admin 先兼容双目的地，再开放仓库采购功能开关。
5. 收货财务 RPC 必须先能区分目的地，再允许创建仓库采购单。
6. `supplier_payable_events.purchase_requisition_id` 的数据库可空语义与 API 解析类型需
   在本阶段一并对齐，禁止通过类型断言掩盖。
7. `project_cost_events` 增加 `event_direction = increase | decrease`，历史事件回填
   `increase`；仓库项目领料写 `increase`，项目退料写 `decrease`。数量和金额继续保存
   正数，报表按方向计算净成本，避免把负数混入现有金额约束。
8. `project_cost_events.source_type` 扩展为采购收货、仓库领料和仓库退料三类稳定来源，
   每个来源明细仍只能生成一条成本事件。
9. migration 应用后必须使用 `supabase migration list` 核对 Local/Remote。

回滚采用只前进策略：先关闭仓库采购和领料入口，保留仓库、库存流水和已发生财务
事实；不得删除已确认库存或成本数据。需要纠正时使用反向流水。

## 12. 测试与验收

### 12.1 数据库与并发

- 项目和仓库目的地互斥约束。
- 重复收货只产生一条入库流水和一份应付。
- 并发出库不会超卖或产生负库存。
- 移动平均成本和金额尾差正确。
- 项目退料不超过历史净领用数量。
- 流水汇总与余额投影一致。

### 12.2 权限与租户隔离

- 无项目权限但有仓库权限的采购员可以处理仓库采购。
- 无仓库权限的项目员工不能查看公司库存成本。
- 不同租户不能访问对方仓库、余额、流水或领料单。
- 领料项目仍受项目数据范围限制。

### 12.3 财务不变量

- 项目直送收货继续形成项目成本和应付。
- 仓库收货只形成库存和应付，不形成项目成本。
- 项目领料只形成一次项目成本，不形成第二份应付。
- 项目退料生成反向项目成本，不修改原始事件。
- 付款不会重复计入项目成本。

### 12.4 端到端 Smoke

1. 创建默认仓库。
2. 创建仓库补货采购批次并完成审批拆单。
3. 完成采购单确认、发货和仓库收货。
4. 核对库存数量、库存价值和供应商应付。
5. 从仓库领料到项目并核对库存减少和项目成本增加。
6. 项目退料并核对反向流水。
7. 回归现有项目采购、收货、付款和财务报表。

## 13. 分阶段实施

### 阶段 A：目的地与仓库基础

- 仓库主数据、权限和租户功能开关。
- 采购批次、申请、采购单、应付和付款支持双目的地。
- Admin 新建采购批次和详情展示采购去向。

### 阶段 B：采购入库与库存台账

- 库存流水、余额和移动平均成本。
- 仓库采购收货原子入库。
- 库存余额、流水和财务核对页面。

### 阶段 C：项目领料与退料

- 领料、审批/确认、出库和项目成本确认。
- 项目退料及反向成本。
- 项目成本、库存和经营报表联动。

### 阶段 D：增强能力

- 调拨、盘点、库位、批号、安全库存和自动补货。
- BOM 与仓库库存联动。

每个阶段必须独立 migration、独立验证和可关闭的租户级功能开关；不得在阶段 A
提前开放尚未具备库存过账能力的仓库采购。

阶段 A、B、C 分别形成实施计划和验收提交。阶段 A 只建立兼容基础，不单独向用户开放
仓库采购；阶段 B 与阶段 A 一起发布后才开放“仓库补货”；阶段 C 发布后才开放项目
领料和退料。
