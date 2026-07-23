# 供应商管理平台设计

日期：2026-07-23
状态：设计已确认，待规格文档复核
适用仓库：`/Users/leefo/Public/work/gooes`

## 1. 背景

Gooes 已具备装修公司经营管理的主要基础能力：

- 多租户、客户、项目、员工、部门、角色和权限。
- 项目 workflow、任务中心和后端 action 契约。
- 费用申请、审批、打款和财务台账。
- 项目成本分类、成本预算、应收和经营利润分析。
- Admin、员工小程序 Orange 与客户侧页面的多端协作基础。

现有财务系统把供应商付款列为后续扩展方向，但明确没有采购、库存、供应商结算和供应商门户实体。当前费用明细中的 `vendor_name`、结算记录中的 `payee_name` 只是自由文本，无法支撑供应商准入、标准商品、价格协议、采购履约、库存、退换货、应付对账和供应商评价。

本设计建设一个面向装修行业的完整供应商平台，目标是：

> 平台统一治理供应商身份和标准目录，装修公司独立管理合作条件，通过项目或仓库形成从需求、采购、履约、库存、应付到付款的完整闭环。

## 2. 已确认产品决策

本轮设计已确认以下决策：

1. 目标范围是完整供应商平台，不是单一供应商档案页面。
2. 采用“平台统一供应商主体 + 装修公司独立合作关系”的混合模型。
3. 同时支持项目直送和公司仓库备货。
4. 同时支持供应商门户自助和装修公司代操作；代操作必须审计。
5. 同时支持内部采购和业主选材，但供货价与业主报价严格分层。
6. 同时支持 BOM 计划采购和临时采购；临时采购必须填写原因并经过预算校验。
7. 采用领域完整、分期上线方案，不采用费用申请补丁或一次性大而全方案。
8. 对账以确认的收货、退货和折让事实为基础，发票用于三单匹配和付款门禁。
9. workflow 只负责编排动作，采购、库存、应付和财务事实必须写入各自业务表。
10. 首个生产闭环优先交付项目直采，不先引入仓库计价和盘点复杂度。

## 3. 设计目标

### 3.1 逻辑清晰

- 供应商、商品、价格、采购、履约、库存、应付和付款各自有明确边界。
- 一张业务单据只表达一种事实，不用一个“大订单状态”承载所有过程。
- workflow、业务事实、项目成本和现金台账分层存储。

### 3.2 关系明确

- 每张采购订单必须属于一个租户、一个合作供应商和一个采购员。
- 每张采购订单只能有一个收货目标：项目现场或仓库。
- 每个订单明细都能追溯到需求、商品、价格版本、收货、退货、应付和付款分配。
- 平台供应商主体与租户合作关系分离，平台黑名单和租户暂停互不混淆。

### 3.3 操作简单

- 采购单最多三步完成，系统自动带入项目、采购员、成本分类、价格版本和审批路径。
- 支持从 BOM 生成、复制历史订单、扫码收货和只填异常。
- 页面只展示后端返回的当前可执行 action，不要求用户理解内部状态机。
- 已数字化供应商自助操作，线下供应商由装修公司代录，不阻断业务。

### 3.4 可审计与可扩展

- 所有关键动作保留操作人、来源端、业务幂等键、版本号和前后状态。
- 成交价格、单位换算、税率和收货事实以快照保存，不被后续配置覆盖。
- 数据模型从一开始支持分批履约、退补货、账期、分次付款和仓库领料。

## 4. 非目标

以下内容不属于首个供应商生产闭环：

- 完整会计总账、借贷凭证、税务申报和自动银行对账。
- 强制所有区域供应商第一天注册并使用门户。
- 第一阶段接入所有供应商的实时库存 API。
- 自动把历史 `vendor_name` 或 `payee_name` 猜测并迁移成供应商。
- 第一阶段建设复杂询比价、招投标和采购寻源平台。
- 第一阶段建设跨租户采购合单、集中采购或跨公司财务合并。
- 在 gooes 任务中修改 `/Users/leefo/Public/work/orange`。

## 5. 核心设计原则

### 5.1 业务单据分工

| 单据 | 负责表达的事实 |
| --- | --- |
| 采购建议 / 申请 | 为什么要买、买什么、预算是否允许 |
| 采购订单 | 向哪个供应商以什么成交条件采购 |
| 发货单 | 供应商实际发出了什么 |
| 收货单 | 项目现场或仓库实际收到并验收了什么 |
| 差异 / 退货 / 补发单 | 原履约事实发生了什么异常和纠正 |
| 应付事件 | 因合格收货、退货或折让产生的应付增减 |
| 对账单 | 某一期间双方确认的应付事件集合 |
| 付款申请 | 哪些应付或预付款需要审批支付 |
| 付款记录 | 实际支付了多少钱以及分配到哪些业务事实 |
| 财务台账 | 付款完成后的现金事实 |

### 5.2 workflow 不承载业务事实

workflow 负责：

- 准入审核。
- 采购申请和超预算审批。
- 高风险退货或折让审批。
- 付款审批和任务分派。

建议 workflow subject type：

- `supplier_onboarding`
- `purchase_requisition`
- `purchase_order_amendment`
- `purchase_return`
- `supplier_payment_request`

发货、收货和普通库存流水是领域命令，不为每个物流动作创建 workflow。

业务领域负责：

- 商品、价格和采购承诺。
- 发货、收货、库存和退货。
- 应付、对账、付款分配和项目成本。

报表不得扫描 workflow 历史计算采购额、库存、应付或项目成本。

### 5.3 不覆盖已确认事实

- 已确认采购订单只能通过变更单调整，不能直接修改历史明细。
- 已确认收货单不能回写覆盖，使用差异、退货、补发或折让单纠正。
- 已确认应付事件不可删除，使用反向冲销事件更正。
- 已支付记录不可删除，使用退款、冲销或更正流程处理。

## 6. 参与角色和产品界面

### 6.1 平台运营后台

负责：

- 供应商准入、驳回、平台暂停和黑名单。
- 资质模板、资质有效期和跨租户风险。
- 标准类目、品牌和单位字典。
- 平台级履约质量汇总。

### 6.2 装修公司 Admin

新增独立的“采购供应”业务组，建议包含：

1. 采购工作台。
2. 采购申请。
3. 采购订单。
4. 收货与退货。
5. 库存与领料。
6. 供应商。
7. 商品与价格。
8. 应付与对账。

“采购供应”不塞入现有“财务”导航。应付和对账从采购供应进入，付款完成后回流现有财务台账。

### 6.3 员工小程序 Orange

面向采购员、项目经理、现场收货人和仓库管理员：

- 查看 BOM 采购建议。
- 发起临时采购。
- 查看订单和交付进度。
- 扫描发货码收货。
- 拍照记录少货、破损、错货和批次。
- 仓库领料和退料。

小程序不本地计算预算、价格优先级、应付或项目利润，也不自行推导 action。

### 6.4 供应商门户

供应商只能访问自身数据，负责：

- 接单、拒单、确认数量和承诺交期。
- 维护商品、价格簿和库存可用性快照。
- 创建发货单、补发单和退货接收记录。
- 确认对账单或发起差异申诉。
- 维护自身联系人和资质资料。

装修公司可以为线下供应商代操作。每次代操作必须记录：

- `acting_employee_id`
- `operation_source = tenant_proxy`
- `proxy_reason`
- `operated_at`

### 6.5 业主选材界面

业主只看到装修公司发布的销售目录和业主报价：

- 不暴露供应商结算价、采购折扣、账期或信用额度。
- 不直接操作采购订单。
- 选材或增项确认形成项目材料需求，再由装修公司采购流程承接。

## 7. 领域边界和逻辑表组

以下名称用于明确领域职责。实施计划可以按阶段拆分 migration，但不得改变语义边界。

### 7.1 平台供应商主数据

#### `suppliers`

平台统一供应商主体。

关键字段：

- `id`
- `code`
- `name`
- `legal_name`
- `unified_social_credit_code`
- `supplier_type`
- `onboarding_status`
- `operational_status`
- `created_at`
- `updated_at`

约束：

- 统一社会信用代码在非空时平台唯一。
- 平台黑名单阻断所有租户的新采购，但不阻断已有订单的收货、退货和结算收尾。

#### `supplier_qualifications`

供应商资质和合同附件。

关键字段：

- `supplier_id`
- `qualification_type`
- `document_file_id`
- `certificate_no`
- `valid_from`
- `valid_until`
- `verification_status`
- `verified_by`
- `verified_at`

资质健康状态由有效期和核验状态计算：

- `valid`
- `expiring`
- `expired`
- `missing`

关键资质过期后：

- 禁止新建和确认采购订单。
- 已有订单仍允许收货、退货、对账和付款。
- 不直接覆盖供应商运营状态。

#### `supplier_qualification_types`

平台维护资质类型、适用供应商类型、预警天数和是否阻断新订单。系统不能根据资质名称硬编码阻断规则。

#### `supplier_service_regions`

记录供应商可服务的行政区和区域级别。订单提交和供应商接单时校验交付地址是否在有效服务区域内。

#### `supplier_addresses` / `supplier_contacts`

维护供应商注册地址、发货地址、退货地址和公开联系人。租户自己的供应商负责人继续记录在合作关系中，不覆盖供应商公开资料。

#### `supplier_users` / `supplier_user_access_grants`

`supplier_users` 绑定供应商门户用户与供应商主体。供应商用户不成为装修公司员工，也不继承租户角色。

`supplier_user_access_grants` 显式限制用户可访问的租户合作关系和门户角色，例如：

- `supplier_owner`
- `order_operator`
- `catalog_operator`
- `finance_operator`

供应商用户默认无权访问任何租户交易；只有获得对应 `tenant_supplier_id` 授权后才能查看相关订单、发货和对账数据。

### 7.2 租户合作关系

#### `tenant_suppliers`

表示装修公司与平台供应商的合作关系。

关键字段：

- `tenant_id`
- `supplier_id`
- `relationship_status`
- `buyer_tier_id`
- `settlement_term_days`
- `credit_limit`
- `invoice_required_before_payment`
- `default_currency`
- `default_tax_inclusive`
- `started_at`
- `ended_at`

唯一约束：

- `(tenant_id, supplier_id)` 唯一。

关系状态：

- `evaluating`
- `active`
- `suspended`
- `terminated`
- `blacklisted`

租户暂停或黑名单只影响本租户。平台黑名单优先级更高。

#### `supplier_contracts`

保存租户与供应商合同、有效期、账期、发票门禁和附件。合同临期只预警；合同失效是否阻断新订单由租户策略控制。

#### `supplier_buyer_tiers`

供应商定义的买方等级，如普通合作商、核心伙伴。等级只参与供货价格选择，不决定业主报价。

### 7.3 标准目录、商品和价格

#### 平台标准字典

- `catalog_categories`
- `catalog_brands`
- `catalog_units`

类目使用树结构。供应商 SPU 必须绑定末级标准类目和品牌。单位字典需要支持采购单位与基础单位换算。

#### `supplier_products` / `supplier_skus`

- SPU 表达商品族。
- SKU 表达可采购的规格、型号、颜色、包装和单位。
- 供应商库存只保存可用性快照，不作为装修公司仓库库存事实。
- 可按 SKU 配置是否启用批次、色号或序列管理。

#### `supplier_price_lists` / `supplier_price_list_items`

供应商供货价格簿，支持：

- 默认价格簿。
- 买方等级价格簿。
- 指定租户协议价格簿。
- 生效和失效时间。
- 数量阶梯价。
- 含税 / 未税价和税率。
- 版本发布和历史追溯。

价格优先级固定为：

1. 指定租户有效协议价。
2. 当前买方等级有效价。
3. 供应商默认有效价。

同一作用域、SKU、数量区间和有效期不得出现无法判定优先级的重叠价格。

采购订单行必须保存：

- `supplier_sku_id`
- `price_list_id`
- `price_list_version`
- `purchase_unit`
- `base_unit_conversion`
- `unit_price`
- `tax_rate`
- `tax_inclusive`
- `line_amount`

后续价格调整不回写历史订单。

#### `tenant_sales_price_lists` / `tenant_sales_price_list_items`

装修公司面向业主的销售价格簿，独立于供应商供货价格。

销售价格可以基于供应商 SKU，但必须由租户发布。供应商不能直接决定业主看到的价格。

### 7.4 项目物料计划和采购

#### `project_material_plans` / `project_material_plan_items`

项目 BOM 表达材料需求，不强制绑定具体供应商。

BOM 明细应支持：

- 标准类目和品牌要求。
- 规格属性或说明。
- 需求数量和基础单位。
- 期望到货时间。
- 成本分类。
- 可选的首选供应商 SKU。

采购阶段再选择实际供应商和 SKU，避免 BOM 与某个供应商永久耦合。

#### `purchase_requisitions` / `purchase_requisition_items`

采购申请来源：

- 项目 BOM。
- 仓库补货。
- 临时采购。

临时采购必须填写原因。项目采购必须进行成本预算预检；仓库补货使用公司采购额度或仓库预算，不提前归入某个项目成本。

#### `purchase_orders` / `purchase_order_items`

采购订单关键约束：

- 一张订单只有一个 `tenant_supplier_id`。
- 一张订单只有一个 `purchaser_employee_id`。
- 一张订单只有一个币种。
- 收货目标必须二选一：
  - 项目直送：`project_id` 非空，`warehouse_id` 为空。
  - 仓库备货：`warehouse_id` 非空，`project_id` 为空。
- 不允许一张订单混合多个项目或项目与仓库。
- 跨项目集中采购使用采购批次聚合多个独立订单，不破坏单订单归属。

#### `purchase_order_amendments`

供应商确认订单后，数量、价格、交期和收货目标变化必须创建变更单。变更通过审批和供应商确认后生效。

### 7.5 履约、收货和库存

#### `supplier_shipments` / `supplier_shipment_items`

一张采购订单可以产生多张发货单。发货单保存物流单号、承运方、预计到达时间和发货明细。

#### `goods_receipts` / `goods_receipt_items`

收货明细保存：

- 实收数量。
- 合格数量。
- 拒收数量。
- 少货、破损、错货原因。
- 批次、色号或序列信息。
- 收货图片和凭证。
- 收货人、收货时间和收货位置。

默认按发货数量全部合格，用户只修改异常项。

#### `receipt_discrepancies`

收货差异独立记录，可选择：

- 补发。
- 拒收。
- 退货。
- 折让。
- 接受超发。

差异处理不能覆盖原收货明细。

#### `purchase_returns` / `purchase_return_items`

退货必须引用原收货明细。退货完成后：

- 冲减对应应付。
- 项目直送冲减项目成本。
- 仓库退货生成库存出库流水。
- 需要补发时创建独立补发关系，不把退货改成发货。

#### `warehouses` / `inventory_transactions`

公司库存以不可变库存流水为事实来源，至少支持：

- purchase_receipt
- project_issue
- project_return
- supplier_return
- transfer_in
- transfer_out
- adjustment_in
- adjustment_out

库存余额是流水的投影或受控汇总，不允许业务代码直接随意修改余额。

计价方式：

- 普通 SKU 默认移动加权平均。
- 批次管理 SKU 可以使用指定批次实际成本。

### 7.6 应付、对账和付款

#### `supplier_payable_events`

不可变应付事实：

- 合格收货：正向应付。
- 退货：反向冲销。
- 折让：反向调整。
- 经审批的价差：正向或反向调整。

每个事件必须有：

- `tenant_id`
- `tenant_supplier_id`
- `project_id` 或 `warehouse_id`
- `source_type`
- `source_id`
- `amount`
- `currency`
- `occurred_at`
- `idempotency_key`

#### `supplier_invoices` / `supplier_invoice_items`

发票与采购订单、收货和应付事件关联。租户合作关系决定付款前是否必须取得有效发票。

#### `supplier_statements` / `supplier_statement_items`

对账单按租户、供应商、币种和期间生成，不跨租户合并。对账状态：

- `draft`
- `issued`
- `disputed`
- `confirmed`
- `closed`

供应商可以申诉差异，但不能直接改应付事件。

#### `supplier_payment_requests` / `supplier_payment_allocations`

付款申请类型：

- `payable_settlement`
- `purchase_advance`

应付结算分配到开放应付事件。采购预付款绑定采购订单，后续收货形成应付时再进行预付款核销。

#### `supplier_payments` / `supplier_payment_allocations`

付款完成后：

- 保存付款方式、时间、凭证、实付金额和操作人。
- 分配到应付或预付款。
- 写入 `finance_ledger_entries`，`source_type = supplier_payment`。

付款支持部分付款和多次付款。对账确认不等于付款完成。

## 8. 三类经营事实与现有财务的关系

### 8.1 预算承诺

采购订单审批通过后生成预算承诺：

- 项目直送占用项目成本预算。
- 取消或减少未履约数量时释放承诺。
- 收货后把对应承诺转为已发生项目成本。

### 8.2 项目成本事件

建议新增不可变项目成本事件层：

- 项目直送：合格收货时形成项目成本。
- 仓库备货：收货时只形成库存；领料到项目时形成项目成本。
- 项目退料或供应商退货时生成反向成本事件。

### 8.3 现金台账

`finance_ledger_entries` 继续记录付款完成后的现金支出。

项目经营报表需要形成新的统一成本视图：

- 现有费用申请继续以现有已支付费用事实计入成本。
- 供应商采购以项目成本事件计入成本。
- 对应供应商付款台账不再次计入项目成本，避免双计。
- 仓库采购付款不直接归入项目，项目领料时再归集。

报表分别展示：

- 已承诺成本。
- 已发生项目成本。
- 未付应付。
- 已付现金。

## 9. 状态机

### 9.1 供应商状态拆分

准入状态：

```text
draft -> pending_review -> approved
                        -> rejected
```

运营状态：

```text
active <-> suspended -> blacklisted
```

资质健康状态为派生状态：

```text
valid -> expiring -> expired
```

不得用单一 `status` 同时表达审核、运营和资质。

### 9.2 采购订单状态

```text
draft
  -> pending_approval
  -> pending_supplier
  -> accepted
  -> fulfilling
  -> fulfilled
  -> closed
```

终止分支：

- `rejected`
- `cancelled`

订单状态表达商业承诺阶段。已发、已收、已退和已付数量从明细汇总，不由用户直接填写。

### 9.3 收货差异状态

```text
pending
  -> accepted
  -> replacement_pending
  -> return_pending
  -> allowance_pending
  -> resolved
```

### 9.4 付款申请状态

```text
draft
  -> pending_approval
  -> approved
  -> partially_paid
  -> paid
```

终止分支：

- `rejected`
- `cancelled`

## 10. 端到端主流程

### 10.1 BOM 计划采购

```text
项目 BOM
  -> 采购建议
  -> 采购申请
  -> 预算预检
  -> workflow 审批
  -> 采购订单
  -> 供应商接单
```

### 10.2 临时采购

```text
选择项目或仓库
  -> 填写临时采购原因
  -> 选择供应商和商品
  -> 预算 / 额度预检
  -> workflow 审批
  -> 采购订单
```

### 10.3 发货和收货

```text
供应商分批发货
  -> 现场 / 仓库扫码
  -> 逐行验收
  -> 合格收货
  -> 项目成本或库存流水
  -> 应付事件
```

### 10.4 差异和退补货

```text
收货差异
  -> 补发 / 拒收 / 退货 / 折让
  -> 独立纠正单据
  -> 库存、项目成本和应付冲销
  -> 差异关闭
```

### 10.5 对账和付款

```text
应付事件
  -> 采购订单 × 收货 / 退货 × 发票匹配
  -> 供应商对账单
  -> 双方确认或差异申诉
  -> 付款申请
  -> workflow 审批
  -> 付款完成
  -> finance_ledger_entries
```

## 11. 简化操作设计

### 11.1 采购工作台

默认只展示：

- 待我审批。
- 待供应商接单。
- 今日待收货。
- 差异待处理。
- 对账争议。
- 资质或合同临期。

每行只保留一个主要动作，次要动作放入菜单。

### 11.2 三步采购单

1. 选择来源：项目 BOM、仓库补货或临时采购。
2. 确认商品：供应商、SKU、数量、单位、成交价和替代品。
3. 确认交付和预算：项目或仓库、期望日期、预算结果。

系统自动填充：

- 订单号。
- 采购员。
- 租户和项目上下文。
- 成本分类。
- 价格簿版本。
- 审批路径。

### 11.3 高频快捷能力

- 从 BOM 生成采购申请。
- 复制历史订单。
- 常购商品和最近供应商。
- 批量调整数量和交期。
- 扫描发货码进入收货。
- 默认全部合格，只录入异常。
- 后端返回 `actions`，各端按 action 展示按钮。

## 12. API 设计约束

### 12.1 分层

遵守现有项目边界：

- controller：读取请求、校验参数、调用 service、包装成功响应。
- service：领域规则、状态迁移、权限、幂等和业务编排。
- repository / gateway：Supabase、SQL、RPC 和外部系统访问。

错误必须通过 `error-factory.ts` 包装，禁止直接 `throw new Error()`。

### 12.2 路由分组

平台：

- `/platform/suppliers`
- `/platform/supplier-qualifications`
- `/platform/catalog/categories`
- `/platform/catalog/brands`
- `/platform/catalog/units`

租户：

- `/suppliers`
- `/supplier-products`
- `/supplier-price-lists`
- `/sales-price-lists`
- `/material-plans`
- `/purchase-requisitions`
- `/purchase-orders`
- `/supplier-shipments`
- `/goods-receipts`
- `/purchase-returns`
- `/warehouses`
- `/inventory-transactions`
- `/supplier-payables`
- `/supplier-statements`
- `/supplier-payment-requests`
- `/supplier-payments`

供应商门户使用独立 controller 和 auth context，但调用相同领域 service，禁止复制一套业务逻辑。

### 12.3 命令接口

状态变化使用明确命令，不允许任意 PATCH 状态：

- `POST /purchase-requisitions/:id/submit`
- `POST /purchase-orders/:id/approve`
- `POST /purchase-orders/:id/accept`
- `POST /purchase-orders/:id/reject`
- `POST /supplier-shipments/:id/ship`
- `POST /goods-receipts/:id/confirm`
- `POST /purchase-returns/:id/approve`
- `POST /supplier-statements/:id/issue`
- `POST /supplier-statements/:id/confirm`
- `POST /supplier-payment-requests/:id/submit`
- `POST /supplier-payments/:id/confirm`

### 12.4 列表和性能

- 所有列表默认 `page=1&pageSize=20`。
- `pageSize` 最大 100。
- 库存流水、审计事件和长期时间线优先使用游标分页。
- 查询只选择必要字段。
- 常用索引至少覆盖 `tenant_id`、状态、供应商、项目 / 仓库和时间。
- 对账、库存和高频采购列表在上线前使用 `EXPLAIN ANALYZE` 验证。

## 13. 权限和安全边界

建议权限码按领域拆分。

平台：

- `platform.supplier.view`
- `platform.supplier.review`
- `platform.supplier.manage`
- `platform.supplier.blacklist`
- `platform.catalog.manage`

租户：

- `supplier.view`
- `supplier.manage`
- `supplier.contract.manage`
- `supplier.cost-price.view`
- `supplier.cost-price.manage`
- `supplier.sales-price.manage`
- `procurement.requisition.create`
- `procurement.requisition.approve`
- `procurement.order.view`
- `procurement.order.manage`
- `procurement.receipt.manage`
- `inventory.view`
- `inventory.manage`
- `accounts-payable.view`
- `accounts-payable.reconcile`
- `accounts-payable.pay`

权限原则：

- 采购员可看供货价，不默认拥有付款权限。
- 仓库和现场人员可收货、领料，不默认查看供货协议和应付。
- 财务可看应付、对账和付款，不默认修改商品或订单。
- 供应商用户只能访问自身供应商和被授权租户的相关订单。
- 业主端永远不返回成本价字段。
- 所有租户业务表必须有 `tenant_id`，repository 查询不能依赖客户端自行传入租户过滤。

## 14. 错误处理、并发和幂等

### 14.1 四道命令门禁

每次状态变化按顺序校验：

1. 租户和权限。
2. 当前状态是否允许该 action。
3. 版本号和业务幂等键。
4. 数量、金额、价格有效期和业务不变量。

### 14.2 稳定错误码

建议至少包含：

- `SUPPLIER_NOT_ELIGIBLE`
- `SUPPLIER_OUTSIDE_SERVICE_REGION`
- `PRICE_NOT_EFFECTIVE`
- `PURCHASE_ORDER_VERSION_CONFLICT`
- `PURCHASE_ORDER_INVALID_ACTION`
- `QUANTITY_EXCEEDS_REMAINING`
- `RECEIPT_ALREADY_CONFIRMED`
- `STATEMENT_HAS_UNRESOLVED_DIFFERENCE`
- `PAYMENT_ALLOCATION_EXCEEDS_OPEN_AMOUNT`
- `INVOICE_REQUIRED_BEFORE_PAYMENT`

无效状态或版本冲突应返回后端最新状态和 `actions`，客户端刷新后继续处理。

### 14.3 幂等场景

必须覆盖：

- 重复提交采购申请。
- 供应商重复接单。
- 重复确认发货。
- 扫码收货重复提交。
- 退货或折让重复确认。
- 对账单重复生成。
- 付款确认和台账重复写入。

关键命令需要在数据库事务或 RPC 内原子完成。外部通知只有在确有需要时再引入 outbox；第一阶段不为遵守模式而提前引入队列或缓存。

### 14.4 金额和数量精度

- 金额字段使用 `numeric(14, 2)` 或满足业务上限的等价精确类型，禁止浮点数。
- 材料数量使用 `numeric(18, 4)`，支持平方米、米、公斤等小数单位。
- 单位换算因子使用 `numeric(18, 8)`。
- 比率和税率使用明确小数精度，API 不使用格式化百分数字符串参与计算。
- 每次跨单位计算后按目标字段精度统一舍入，并保留原采购单位和基础单位快照。

## 15. 供应商评价

评价以客观事件为主、人工评价为辅。

建议指标：

- 交付准时率。
- 一次验收合格率。
- 少货、破损和退货率。
- 补发和差异处理时长。
- 价格偏差率。
- 对账争议率。
- 人工服务评价。

评分按租户和统计周期生成版本化快照。平台跨租户评分只有在达到最小样本量后才能展示脱敏汇总，不暴露某个装修公司的交易数据。

初始推荐权重：

- 交付准时率：35%。
- 一次验收合格率：30%。
- 破损 / 退货率：20%。
- 对账与服务稳定性：15%。

## 16. 分期路线

### 阶段 0：统一主体与标准

范围：

- 平台供应商主体。
- 租户合作关系。
- 资质、服务区域和联系人。
- 标准类目、品牌和单位。
- 权限、审计和共享领域类型。

验收：

- 同一供应商可被多个租户建立独立合作关系。
- 平台黑名单和租户暂停边界正确。
- 关键资质过期阻断新订单但不阻断存量收尾。

### 阶段 1：项目直采到付款

范围：

- SKU 和基础供货价。
- 临时采购申请。
- 项目预算预检。
- 采购订单和供应商接单。
- 单批发货和单次项目收货；底层关系保留一对多，但本阶段不开放分批操作。
- 应付事件、付款申请、付款和财务台账。
- 供应商自助与采购员代录。

验收：

- 从项目发起采购到付款完成可完整追溯。
- 采购批准产生预算承诺。
- 合格收货产生项目成本和应付。
- 付款只产生一次财务台账。
- 费用申请原链路不受影响。

### 阶段 2：复杂履约和对账

范围：

- 分批发货、分批收货。
- 差异、补发、退货和折让。
- 发票记录和三单匹配。
- 月度和项目对账单。
- 对账争议。

验收：

- 原始发货和收货事实不会被纠正动作覆盖。
- 退货和折让正确冲减应付与项目成本。
- 部分付款和多次付款分配准确。

### 阶段 3：BOM 和仓库

范围：

- 项目 BOM 和采购建议。
- 仓库、库存流水和库存余额投影。
- 批次、色号和单位换算。
- 项目领料和退料。
- 仓库补货和采购额度。

验收：

- 仓库收货不提前形成项目成本。
- 项目领料按移动平均或指定批次形成项目成本。
- 库存流水与余额一致。

### 阶段 4：平台化经营

范围：

- 买方等级和阶梯价格簿。
- 租户业主报价簿。
- 业主选材和增项需求。
- 资质与合同预警。
- 供应商评分、筛选和运营分析。

验收：

- 不同租户只能看到自身供货价和业主报价。
- 业主接口不返回任何成本字段。
- 评分可追溯到客观事件和评分策略版本。

## 17. 测试和质量门禁

### 17.1 单元与领域测试

- 所有合法和非法状态迁移。
- 价格优先级、阶梯数量和有效期。
- 单位换算、金额精度和税额。
- 发货、收货、退货和未履约数量不变量。
- 预算承诺占用、转换和释放。
- 项目直送与仓库领料成本时点。
- 应付增减、对账汇总和付款分配。

### 17.2 并发与幂等测试

- 两次并发接单只能成功一次。
- 两次扫码收货不能重复入库、成本或应付。
- 重复付款确认不能重复写台账。
- 版本冲突返回最新状态和 actions。

### 17.3 权限和租户隔离测试

- 平台、租户员工、供应商用户和业主四类身份。
- 跨租户供应商关系、订单、价格、库存和对账不可见。
- 供应商用户不能访问其他供应商数据。
- 业主端成本字段序列化测试。

### 17.4 API 与性能测试

- 所有列表分页和最大 pageSize。
- 高频查询字段选择和索引。
- 对账、库存流水和项目采购汇总执行计划。
- 大量订单明细、收货和应付事件下的稳定分页。

### 17.5 每期端到端 Smoke

至少覆盖：

1. 采购员创建并提交订单。
2. 供应商自助接单。
3. 采购员为线下供应商代录接单。
4. 现场扫码收货。
5. 制造少货或破损差异并完成纠正。
6. 财务对账、付款并核对台账来源。

## 18. Migration、发布和回滚

- 所有表、索引、约束、RLS、函数、触发器、权限和初始化字典必须通过 `supabase/migrations/`。
- 每个阶段使用独立 migration 组，不提前创建长期未使用的全部表。
- 应用前确认待执行 migration。
- 应用后使用 `supabase migration list` 核对 Local / Remote。
- 首期优先采用新增表和新增视图，不破坏现有费用与财务表。
- 如需回滚，先关闭租户功能开关，再停止新写入，导出新增业务数据，最后回滚本阶段新增视图、策略和表。
- 任何涉及已确认采购、收货、库存、应付或付款数据的回滚不得直接删数据，必须提供数据保留和重新接管方案。

## 19. 兼容和灰度

- 新模块使用租户级功能开关灰度。
- 现有费用申请、审批、打款和财务台账接口保持原语义。
- 历史 `vendor_name` 和 `payee_name` 保持只读展示，不自动匹配供应商。
- 后续可提供有审计的人工关联工具，但不能批量猜测写回历史。
- Orange 接入必须形成正式 API handoff，明确分页、字段、action、错误码和 smoke 清单。
- Orange 仓库只读，不由 gooes 任务修改。

## 20. 风险和应对

| 风险 | 应对 |
| --- | --- |
| 把供应商付款继续当费用申请 | 使用独立应付和付款实体，只复用 workflow runtime |
| 供货价泄露给业主或无权限员工 | 成本价权限分域，业主 DTO 做字段白名单测试 |
| 仓库采购导致项目成本失真 | 收货只入库存，领料才形成项目成本 |
| 分批履约后订单状态混乱 | 订单表达承诺，数量状态从明细累计 |
| 退货覆盖原收货数据 | 使用独立退货和冲销事件 |
| 价格变化改写历史订单 | 订单行保存价格簿版本和成交快照 |
| 重复扫码或网络重试重复入库 | 幂等键、版本号和原子 RPC |
| 供应商不上线导致流程无法使用 | 供应商自助与装修公司代录双通道 |
| 一次性建设范围过大 | 领域完整、纵向切片、租户灰度 |
| 财务现金与项目成本双计 | 项目成本视图排除供应商付款台账的重复成本 |

## 21. 现有项目依据

本设计参考并延续以下现有决策：

- `docs/decoration-finance/2026-06-16-prd.md`
  - workflow 驱动动作，不承载财务事实。
  - 供应商付款是后续项目成本来源。
  - 第四阶段规划供应商、班组和发票。
- `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-prd.md`
  - 已有项目成本分类、预算和利润偏差口径。
  - 当时明确不做采购、库存和供应商结算。
- `supabase/migrations/20260624100000_finance_cost_budget.sql`
  - 已有租户成本分类、项目预算和财务成本归集字段。
- `packages/domain/src/expense.ts`
  - 已有费用审批、打款和结算状态，不应扩展成采购订单状态。
- `docs/state_machine_migrate/README.md`
  - 状态推进统一走 workflow runtime，前端按后端 action 操作。
- `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md`
  - 小程序不直接写财务台账，不本地计算预算和利润。
- `/Users/leefo/Public/work/orange/AGENTS.md`
  - Orange 是员工小程序，gooes 任务只能只读参考。
- Orange 当前代码和文档已有项目、费用和财务工作台，但没有供应商、采购、库存或供应商门户模块。

## 22. 最终建议

供应商管理不能以“供应商档案 + 费用付款”方式补丁式落地。正确方向是：

1. 平台统一供应商身份和标准目录。
2. 租户独立管理合作、价格、合同和评价。
3. 用采购订单、收货、库存、应付和付款建立清晰数据血缘。
4. 用项目或仓库作为唯一收货与成本锚点。
5. 用价格簿和成交快照替代商品 JSON 价格。
6. 用收货、退货和折让事件作为应付与对账事实。
7. 用 workflow 复用审批能力，但不复用费用申请承载采购业务。
8. 先交付项目直采纵向闭环，再扩展复杂履约、仓库和平台化经营。
