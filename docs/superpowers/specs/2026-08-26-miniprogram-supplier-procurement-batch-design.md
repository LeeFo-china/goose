# 小程序供应商采购批次与自动拆单设计

**日期：** 2026-08-26

**状态：** 已完成业务评审，待书面复核

**范围：** Gooes API、Supabase migration、共享领域契约与 orange 小程序对接；本设计阶段不修改 orange 仓库

## 1. 背景

员工需要在微信小程序中按商品维度发起采购。一次采购可能包含多个供应商的不同商品，但员工只应维护一份项目采购意图；系统负责根据每个供货 SKU 已绑定的租户供应商关系拆分单据。

当前系统不是从零建设，已经具备：

- 租户私有供应商与平台共享供应商关系；
- 租户分类、品牌、单位、供应商商品、SKU、价格簿与已发布供货价；
- 供应商采购申请、预算检查、审批与转单；
- 供应商采购单、发货、收货、应付与付款闭环；
- 项目权限范围、采购权限、乐观锁和幂等命令模式。

现有采购申请和采购单均为“一张单据绑定一个项目和一个供应商”。当前没有跨供应商采购批次，也没有服务端自动拆单命令。小程序端尚无供应商采购模块。

本设计在现有单供应商单据上增加聚合层，不复制现有供应商、价格、采购申请或采购单模型。

## 2. 已确认的业务决策

1. 员工一次提交一张采购批次，批次只关联一个项目。
2. 批次可包含多个供应商的不同商品。
3. 员工选择具体供货 SKU 和报价；系统不自动选择最低价供应商。
4. 服务端根据 SKU 所属 `tenant_supplier_id` 确定性分组，客户端不提交可信拆单结果。
5. 提交后生成多张供应商采购申请，但审批以整个批次为单位。
6. 不允许部分供应商通过或部分下单。
7. 审批通过后，后端在一个事务内生成并直接提交全部采购单。
8. 任一供应商、商品、价格、预算或订单创建失败时，不生成任何采购单。
9. 审批时价格变化会阻止下单；批次退回草稿，申请人确认新价格后重新提交。
10. 普通采购申请人只能选择已有主数据；新建供应商、品牌、商品继续使用独立权限。
11. 新建商品必须一次完成商品、SKU 和已发布供货价，成功后立即可采购。
12. 拆单是确定性领域规则，不引入 AI、缓存、队列或新基础设施。

## 3. 目标与非目标

### 3.1 目标

- 为小程序提供跨供应商分页选品、购物车、草稿、提交、审批和结果查询能力。
- 保证拆单结果完全由服务端可信数据派生。
- 保证整批审批、采购申请转单和采购单提交的原子性。
- 复用现有价格解析、预算检查、供应商准入、采购申请和采购单规则。
- 为网络超时、重复点击和并发审批提供稳定幂等结果。
- 保持现有 Admin 单供应商采购流程兼容。

### 3.2 非目标

- 不做最低价、交期、质量评分或历史履约驱动的自动选供应商。
- 不做询价、竞价、议价、合同自动匹配或 AI 推荐。
- 不允许一张采购批次跨项目。
- 不支持部分审批、部分转单或部分成功补偿。
- 不在本阶段改造库存、仓库、物流、应付或付款模型。
- 不在 gooes 任务中修改 `/Users/leefo/Public/work/orange`。

## 4. 方案比较与结论

### 4.1 数据库事务拆单，采用

小程序提交采购意图，API 负责鉴权和协议，数据库 RPC 负责锁定、校验、分组、生成子申请、创建采购单和提交采购单。所有写入处于同一 PostgreSQL 事务。

该方案符合现有 Supabase RPC 命令模式，能提供真正的全有或全无语义。

### 4.2 API 服务层循环编排，不采用

Fastify service 逐个调用现有 RPC 并在失败后补偿取消。该方案无法覆盖进程退出、网络中断或补偿失败，可能留下部分已提交采购单。

### 4.3 小程序端拆单，不采用

小程序按供应商分组并逐张提交。该方案把安全规则、幂等和一致性分散到客户端，无法满足原子下单要求。

## 5. 领域边界与主流程

```text
员工选择多个供货 SKU
        ↓
一张采购批次（一个项目）
        ↓
服务端按 tenant_supplier_id 分组
        ↓
多张供应商采购申请
        ↓
整批统一审批
        ↓
事务内重验价格、预算和供应商资格
        ↓
多张已提交采购单
```

### 5.1 聚合根

`supplier_purchase_batches` 是员工采购意图的聚合根，也是小程序主要操作对象。批次控制：

- 项目归属；
- 商品明细；
- 拆单代次；
- 汇总金额和预算状态；
- 整批状态与版本；
- 子采购申请和采购单的生命周期。

带 `purchase_batch_id` 的采购申请由批次命令控制。原有单采购申请 mutation 不得单独提交、审批、取消或转单这些记录，避免绕过整批一致性；原有只读列表和详情可以继续展示，并标明其批次归属。

### 5.2 草稿与提交

草稿只维护批次及批次明细。保存时服务端：

1. 校验租户、项目更新权限和批次版本；
2. 一次性解析全部 SKU 的商品、供应商、关系、价格、单位和税信息；
3. 拒绝重复 SKU、无有效报价或不可采购数据；
4. 保存商品、供应商和价格快照；
5. 按供应商生成拆单预览和金额汇总。

提交时服务端：

1. 锁定批次；
2. 重验供应商准入和有效价格；
3. 按整个项目与成本分类聚合检查预算；
4. 递增 `split_generation`；
5. 按供应商物化采购申请及明细；
6. 将批次和子申请统一转为待审批。

### 5.3 审批与直接下单

整批通过时，单个数据库命令执行：

1. 校验审批权限、项目可见范围、禁止申请人自审和批次版本；
2. 按稳定顺序锁定批次、供应商关系、价格序列、预算和子申请，避免死锁；
3. 重新解析全部 SKU 的当前价格并与提交快照比较；
4. 重新聚合检查预算；超预算时要求 `finance.budget.manage`；
5. 验证全部供应商、商品和 SKU 仍可采购；
6. 为每个供应商创建采购单草稿；
7. 立即提交每张采购单；
8. 将子采购申请标记为 `approved` 后转为 `converted`；
9. 将批次标记为 `ordered` 并保存采购单关联。

任何创建或提交失败都会回滚整个下单事务，不允许出现部分采购单。

### 5.4 需要修订

若审批时发现价格、预算或供应商/商品可用性变化，数据库命令不抛出导致事务回滚的 SQL 异常，而是：

1. 记录可重放的命令事件和结构化阻断明细；
2. 将当前代次子采购申请退回批次控制的草稿状态；
3. 将批次退回 `draft`，递增版本；
4. 不创建任何采购单；
5. 返回 `revision_required` 结果。

API 将该结果映射为 `409` 业务错误，同时携带新版本和变更明细。数据库状态变更已经提交，申请人可以刷新、确认新数据并重新提交。该返回不能通过 `RAISE EXCEPTION` 实现，否则退回草稿和命令事件也会被回滚。

## 6. 数据模型

所有表、列、索引、约束、函数、触发器、RLS 和初始化数据均通过 `supabase/migrations/` 管理。

### 6.1 `supplier_purchase_batches`

主要字段：

- 身份与归属：`id`、`tenant_id`、`project_id`、`batch_no`；
- 状态：`status`；
- 业务字段：`reason`、`expected_delivery_date`、`remark`；
- 计价与金额：`priced_at`、`subtotal_amount`、`tax_amount`、`total_amount`；
- 预算：`budget_checked_at`、`budget_status`、预算快照；
- 拆单：`split_generation`、`supplier_count`、`item_count`；
- 并发：`version`；
- 审计：创建、提交、审批、驳回、取消人员与时间；
- 时间戳：`created_at`、`updated_at`。

状态只允许：

- `draft`
- `pending_approval`
- `rejected`
- `cancelled`
- `ordered`

`approved` 不作为批次持久状态。审批通过和全部采购单提交处于同一事务，成功后直接进入 `ordered`。

### 6.2 `supplier_purchase_batch_items`

主要字段：

- `id`、`tenant_id`、`purchase_batch_id`、`line_no`；
- 输入事实：`supplier_sku_id`、`quantity`、`cost_category_id`；
- 派生归属：`supplier_id`、`tenant_supplier_id`；
- 商品快照：商品、SKU、品牌、规格、型号、采购单位；
- 价格快照：价格簿、价格条目、单价、税率、含税标记和 `priced_at`；
- 金额：行未税金额、税额和含税金额；
- `created_at`、`updated_at`。

约束：

- 同一批次一个 `supplier_sku_id` 只能出现一次；
- 数量使用字符串协议进入 API，数据库使用 `numeric(18,4)` 且大于零；
- 供应商和租户供应商关系由 SKU 反查，不能信任客户端；
- 明细的租户、供应商和项目上下文必须与批次一致。

### 6.3 现有表扩展

`supplier_purchase_requisitions` 增加：

- `purchase_batch_id uuid NULL`；
- `split_generation integer NULL`；
- 批次控制标识由 `purchase_batch_id IS NOT NULL` 派生。

`supplier_purchase_orders` 增加：

- `purchase_batch_id uuid NULL`；
- `source_requisition_id` 继续保持一对一转单关系。

索引与唯一性：

- 当前拆单代次内，一个批次、一个租户供应商最多一张采购申请；
- 一个批次、一个租户供应商最多一张最终采购单；
- 批次列表索引覆盖 `tenant_id, status, updated_at DESC, id DESC`；
- 明细索引覆盖 `tenant_id, purchase_batch_id, line_no, id`；
- 跨供应商目录查询按实际执行计划补充供应商状态、SKU 状态、价格有效期和搜索索引。

旧 Admin 创建的采购申请和采购单 `purchase_batch_id` 为空，原流程保持不变。

### 6.4 命令事件

批次 mutation 使用独立的
`supplier_purchase_batch_command_events` 命令事件表，避免改变现有单供应商
命令事件的实体约束。事件至少保存：

- `tenant_id`、`purchase_batch_id`、命令类型；
- `idempotency_key`、请求指纹；
- actor 用户和员工；
- 首次结果，包括 `revision_required`；
- 创建时间。

同一键和同一指纹重放第一次结果；同一键不同指纹返回冲突。

## 7. API 契约

所有接口要求租户员工登录态。响应继续使用 `ResponseHandler.success`，错误继续由 `error-factory.ts` 和供应商命令错误映射包装。

### 7.1 选项与跨供应商目录

#### `GET /supplier-purchase-batch-project-options`

查询当前员工可更新的项目，支持 `keyword`、`page=1`、`pageSize=20`，`pageSize <= 100`。

#### `GET /supplier-purchase-batch-cost-categories`

查询启用的成本分类，分页规则同上。

#### `GET /supplier-purchase-batch-catalog`

查询跨供应商可采购 SKU，参数：

- `projectId`：必填，用于项目权限和后续扩展；
- `keyword`：可选；
- `categoryId`、`brandId`、`tenantSupplierId`：可选；
- `page=1`、`pageSize=20`，`pageSize <= 100`。

只返回必要字段：

- `supplier_sku_id`、商品和 SKU 名称；
- 分类、品牌、采购单位和规格摘要；
- `supplier_id`、`tenant_supplier_id`、供应商名称；
- 当前有效单价、税率、含税标记、币种和价格版本；
- 当前可采购状态。

目录必须由单次分页 RPC 完成，禁止逐商品查询供应商或价格。

### 7.2 批次读接口

- `GET /supplier-purchase-batches`
- `GET /supplier-purchase-batches/:id`
- `GET /supplier-purchase-batches/:id/items`
- `GET /supplier-purchase-batches/:id/requisitions`
- `GET /supplier-purchase-batches/:id/orders`

列表和子资源均分页。详情返回服务端派生的：

- `actions.can_edit`
- `actions.can_submit`
- `actions.can_review`
- `actions.can_cancel`
- `actions.can_create_supplier`
- `actions.can_create_catalog`
- `actions.can_create_purchasable_product`

小程序只使用这些动作控制可见性和交互；后端仍必须在命令入口重新鉴权。

### 7.3 保存草稿

#### `POST /supplier-purchase-batches/:id/save-draft`

请求头：

```text
Idempotency-Key: <stable UUID, max 120 chars>
```

请求体：

```json
{
  "project_id": "uuid",
  "expected_version": 0,
  "reason": "项目主材采购",
  "expected_delivery_date": "2026-09-10",
  "remark": null,
  "items": [
    {
      "supplier_sku_id": "uuid",
      "cost_category_id": "uuid",
      "quantity": "20.0000"
    }
  ]
}
```

客户端不提交供应商、价格、税率、金额、拆单数量或拆单结果。

响应包含批次、版本、总金额和按供应商聚合的拆单预览。

### 7.4 提交、审批和取消

#### `POST /supplier-purchase-batches/:id/submit`

请求体：

```json
{ "expected_version": 1 }
```

#### `POST /supplier-purchase-batches/:id/review`

请求体：

```json
{
  "expected_version": 2,
  "action": "approve",
  "remark": null
}
```

`approve` 成功响应包含全部采购申请 ID、采购单 ID、单号和供应商摘要。
`reject` 必须填写 1 至 500 个字符的驳回原因，并以整个批次为单位生效；
数据库同步驳回当前代次的全部子申请。

#### `POST /supplier-purchase-batches/:id/cancel`

请求体：

```json
{
  "expected_version": 1,
  "reason": "采购计划取消"
}
```

仅 `draft` 和 `pending_approval` 可取消；取消待审批批次时同步取消当前代次子申请。

## 8. 一次创建可采购商品

### 8.1 复用接口

- `POST /suppliers/private`：新建租户私有供应商；
- `POST /catalog/categories`：新建租户分类；
- `POST /catalog/brands`：新建租户品牌；
- `GET /catalog/units`：选择平台单位。

### 8.2 复合命令

新增：

#### `POST /supplier-purchasable-products/:id`

查询参数：

- `tenantSupplierId`：目标租户供应商关系。

请求体包含：

- 商品：名称、分类、品牌、说明；
- SKU：客户端生成的 `sku_id`、名称、规格、型号、采购单位和规格值；
- 价格：单价、税率、含税标记和生效时间；
- 可选备注。

服务端在一个事务内：

1. 校验 `supplier.product.manage` 和 `supplier.cost-price.manage`；
2. 校验私有供应商归属和写权限；
3. 创建并启用商品；
4. 创建并启用 SKU；
5. 在供应商级价格发布锁内创建或推进默认价格簿版本；
6. 写入价格条目并发布，保证该 SKU 只有一个当前有效默认价格；
7. 调用采购目录解析逻辑确认结果可采购；
8. 返回完整目录项，供小程序加入购物车。

任一步失败都不保留商品、SKU 或价格半成品。

分类或品牌不存在时，小程序必须先用对应目录权限创建，再调用复合商品命令。复合商品命令不隐式创建分类或品牌。

## 9. 权限与隔离

复用现有权限：

- 查看批次：`supplier.purchase-requisition.view`；
- 保存和提交：`supplier.purchase-requisition.manage`；
- 审批：`supplier.purchase-requisition.approve`；
- 超预算通过：额外要求 `finance.budget.manage`；
- 新建私有供应商：`supplier.master.manage`；
- 新建分类或品牌：`supplier.catalog.manage`；
- 新建可采购商品：同时要求 `supplier.product.manage` 和 `supplier.cost-price.manage`。

项目范围：

- 列表和详情使用 `project.read` 可见范围；
- 保存、提交和取消使用 `project.update` 可见范围；
- 审批使用审批权限与项目读取范围；
- 申请人不得审批自己创建的批次。

所有读取按 `tenant_id` 限定。RPC 不接受客户端提供的可信 `tenant_id`、`supplier_id`、价格或金额。

## 10. 错误语义

新增错误码：

- `SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR`
- `SUPPLIER_PURCHASE_BATCH_NOT_FOUND`
- `SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT`
- `SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT`
- `SUPPLIER_PURCHASE_BATCH_ID_CONFLICT`
- `SUPPLIER_PURCHASE_BATCH_DUPLICATE_SKU`
- `SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED`
- `SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED`
- `SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED`
- `SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE`
- `SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE`
- `SUPPLIER_PURCHASE_BATCH_SELF_REVIEW`
- `SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION`
- `SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED`

HTTP 映射：

- 输入验证：`400`；
- 无权限：`403`；
- 资源不存在：`404`；
- 版本、状态、价格、预算、可用性和幂等冲突：`409`。

变价错误的 `details` 至少返回：SKU、商品名、原价格、当前价格、原价格版本和当前价格版本。预算变化返回受影响成本分类的原快照与当前可用额。不得向客户端暴露数据库错误、SQL 或内部堆栈。

## 11. 并发、幂等与锁顺序

所有 mutation 必须携带稳定的 `Idempotency-Key`。小程序首次发起动作时生成并保存在页面命令状态中；请求结果不确定时复用同一个键。

约束：

- 同键同指纹返回第一次结果；
- 同键不同指纹返回幂等冲突；
- 两名审批人并发时仅一个成功；
- 网络超时后先查详情，再决定是否以原键重试；
- 子申请和采购单 ID 在命令首次执行时生成并写入命令事件，后续重放复用已记录的 ID；
- 锁顺序固定为批次、供应商关系、价格序列、预算、子申请、采购单；
- 跨供应商循环按 UUID 稳定排序，不使用客户端顺序决定锁顺序。

## 12. 性能边界

- 每批最多 100 个不同 SKU；
- 每批最多 20 个供应商；
- 所有列表默认 `page=1&pageSize=20`，最大 `100`；
- 目录和草稿解析必须批量查询，禁止 N+1；
- 查询只选择契约需要的字段；
- 大表过滤、排序和 JOIN 所需索引由 migration 管理；
- 对跨供应商目录查询和审批事务关键查询执行 `EXPLAIN ANALYZE`；
- 不为本需求引入 Redis、消息队列、缓存层或新依赖。

## 13. orange 小程序对接

orange 当前使用 Taro 4、React 18、TypeScript、Taroify，并通过 `src/utils/https.ts` 统一处理登录态、错误响应和 token 刷新。当前没有供应商采购页面或 service。

建议新增独立分包 `packageProcurement`，避免扩大主包：

- 批次列表；
- 新建/编辑批次；
- 跨供应商选品与购物车；
- 批次详情和拆单预览；
- 整批审批；
- 有权限时的新建供应商、品牌和可采购商品页面。

建议新增：

- `src/services/supplier_procurement.ts`：API 封装和响应类型；
- `src/packageProcurement/pages/...`：页面；
- `src/packageProcurement/model.ts`：纯状态与金额展示转换；
- 对应分页、幂等键和错误映射测试；
- `src/app.config.ts` 中的分包注册；
- 首页或工作台中基于服务端权限动作的入口。

客户端调用顺序：

1. 加载权限、项目选项和第一页跨供应商目录；
2. 分页搜索并维护本地购物车；
3. 有权限时进入主数据创建流程，成功后返回可采购 SKU 并加入购物车；
4. 保存批次草稿，使用服务端拆单预览覆盖本地推断；
5. 提交批次；
6. 列表或详情轮询/刷新状态，不在客户端自行创建采购单；
7. 审批成功后展示所有采购单号；
8. 收到修订错误时刷新批次，展示变价或阻断明细。

小程序不得：

- 自行决定可信供应商分组；
- 提交价格、税率和金额作为事实；
- 在超时后生成新幂等键盲目重试；
- 绕过服务端 `actions` 推断状态转换；
- 直接修改带批次归属的子采购申请。

## 14. 测试与验收

### 14.1 API 与领域测试

- schema：分页、数量、100 SKU/20 供应商上限、重复 SKU、严格对象；
- controller：真实路由、鉴权、请求解析、幂等键和响应包装；
- service：项目范围、权限组合、自审、超预算审批权限；
- repository：分页、必要字段、RPC 参数和错误映射；
- domain：状态、错误码和共享响应类型。

### 14.2 migration 与数据库测试

- migration contract 覆盖表、外键、唯一约束、索引、函数权限和错误码；
- 两个供应商、多个 SKU 正确生成两张申请和两张已提交采购单；
- 同一供应商多个 SKU 只生成一张申请和一张采购单；
- 任一 SKU 缺价、变价、停用或供应商失效时零采购单；
- 修订结果持久化退回草稿，重放返回相同结果；
- 多供应商金额按整个批次和成本分类聚合预算；
- 重复保存、提交、审批和取消；
- 两名审批人并发；
- 中途注入采购单失败，验证事务完整回滚；
- 批次控制子申请不能通过旧 mutation 单独操作；
- 旧 Admin 无批次采购流程回归。

### 14.3 性能验证

- 100 SKU、20 供应商上限场景；
- 跨供应商目录分页和关键词搜索；
- 批次列表、明细和子单列表；
- 审批事务关键 SQL 的 `EXPLAIN ANALYZE`；
- 验证无逐商品、逐供应商或逐价格 N+1。

### 14.4 orange 验收清单

- 无权限员工看不到主数据新建入口，直接调用也返回 `403`；
- 商品搜索分页、筛选和加载更多正常；
- 一张购物车可加入多个供应商商品；
- 服务端拆单预览供应商数量和小计正确；
- 连续点击保存、提交或审批不产生重复记录；
- 一个供应商失败时看不到任何采购单；
- 变价时展示原价、新价并刷新到可编辑草稿；
- 审批成功后采购单数量等于供应商数量，且全部为 `submitted`；
- 批次详情可以跳转或查看所有子申请和采购单。

## 15. 发布、迁移与回滚

发布顺序：

1. 提交 additive migration、API、共享领域类型和后端测试；
2. 应用 migration 前确认待执行文件和破坏性风险；
3. 应用后运行 `supabase migration list`，确认 Local/Remote 对齐；
4. 后端 API 与旧 Admin 回归通过；
5. 向小程序团队交付接口文档和 smoke 清单；
6. orange 接入并在开发环境联调；
7. 小程序入口灰度开放。

回滚策略：

- 首选关闭小程序入口和批次写 API；
- 回退 API 版本，但保留新增表、外键列和审计数据；
- additive 列不影响旧 Admin 的 `NULL purchase_batch_id` 路径；
- 不直接删除已生成的采购申请或采购单；
- 若必须物理回退 schema，单独编写回滚 migration，并在执行前导出受影响批次、子申请、采购单和命令事件。

## 16. 所有权与交付边界

gooes 团队负责：

- migration、RPC、索引和数据约束；
- controller/service/repository 分层；
- 共享领域类型、错误码、API 测试和数据库 smoke；
- 小程序对接文档和兼容性说明。

orange 小程序团队负责：

- 新增采购分包、页面、service 和客户端状态；
- 权限入口、分页加载、幂等键持久化和错误展示；
- 小程序 typecheck、构建和开发环境联调。

本设计的 orange 调研仅使用只读命令，未修改、格式化、构建、生成、暂存或提交 orange 仓库内容。

## 17. 现状依据

本设计以 2026-08-26 当前代码和版本化文档为准，主要依据：

- `apps/api/src/controllers/tenant-suppliers/index.ts`
- `apps/api/src/controllers/supplier-catalog/index.ts`
- `apps/api/src/controllers/supplier-products/index.ts`
- `apps/api/src/controllers/supplier-price-lists/index.ts`
- `apps/api/src/controllers/supplier-purchase-requisitions/index.ts`
- `apps/api/src/controllers/supplier-purchase-orders/index.ts`
- `apps/api/src/services/supplier-purchase-requisitions.ts`
- `apps/api/src/services/supplier-purchase-orders.ts`
- `apps/api/src/repositories/supplier-purchase-requisitions.ts`
- `apps/api/src/repositories/supplier-purchase-orders.ts`
- `apps/api/src/schema/supplier-purchase-requisitions.ts`
- `apps/api/src/schema/supplier-purchase-orders.ts`
- `packages/domain/src/permission.ts`
- `docs/superpowers/specs/2026-07-29-supplier-purchase-order-mvp-design.md`
- `docs/superpowers/specs/2026-07-30-supplier-purchase-requisition-budget-control-design.md`
- `docs/superpowers/specs/2026-08-13-tenant-private-supplier-catalog-design.md`
- `docs/superpowers/plans/2026-08-23-simplify-tenant-private-supplier-workflow.md`
- orange `AGENTS.md`
- orange `src/utils/https.ts`
- orange `src/app.config.ts`
- orange `src/services/index.ts`

GoodCMS LightRAG 查询在本次设计期间返回 `502 Bad Gateway`，因此未将 RAG 输出作为事实依据。若知识库恢复后发现历史说明与当前代码不一致，以当前代码和 migration 为准，并在实施计划前记录差异。
