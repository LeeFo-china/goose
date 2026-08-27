# 供应商采购批次与自动拆单：Orange 小程序 API 交接

日期：2026-08-28

适用范围：Gooes API、Supabase 数据库命令与 Orange 微信小程序对接。

## 1. 交付结论与边界

Gooes 后端已经完成一张采购批次跨多个供应商选品、按
`tenant_supplier_id` 确定性拆分、整批审批、自动生成并直接提交采购单的能力。
员工维护的是“一个项目的一张采购批次”，不是在小程序内逐供应商创建采购单。

后端已完成：

- 采购批次、批次明细、命令事件、子采购申请和采购单归属字段；
- 12 个小程序所需采购批次 HTTP 接口；
- 跨供应商、分页、仅返回当前可采购 SKU 的目录；
- 草稿保存时的服务端计价、快照和按供应商拆单预览；
- 提交时按供应商生成子采购申请，并按项目成本分类检查和占用预算；
- 审批通过时在一个 PostgreSQL 事务内重验事实、创建并直接提交全部采购单；
- 价格、预算、供应商、商品或 SKU 漂移时持久化 `revision_required` 结果，整批退回草稿；
- 幂等重放、并发审批唯一胜者、失败全回滚、分页及关键查询索引。

本次没有修改 `/Users/leefo/Public/work/orange`。Orange 团队需要在自己的仓库中实现
页面、类型、service wrapper、权限入口和真机验收。本交接只描述当前代码已经存在的契约，
不把建议中的字段当成已实现字段。

> 知识库降级说明：按 GoodCMS 文档流程尝试 LightRAG query/health 时均返回 HTTP 502。
> 因此本文以当前 gooes、orange 本地代码和 migration 为准；没有引用不可验证的历史 RAG
> 结论。LightRAG 恢复后可再做一次历史决策交叉核对，但不能覆盖当前代码事实。

## 2. 通用 HTTP 约定

- 基础路径沿用 Orange 的 `TARO_APP_BASEURL`；下文均为相对 API path。
- 所有接口要求租户员工 Bearer token。Orange 的 `src/utils/https.ts` 已统一注入 token、
  处理刷新和错误 toast。
- 成功响应为 `{ data: T, message: "success" }`，业务数据在 `response.data`。
- 错误响应为
  `{ success: false, message, code, details?, requestId }`；Orange 会把 HTTP 错误包装为
  `ApiError`，稳定分支应读取 `statusCode`、`code`、`details`，不要解析中文 `message`。
- 所有列表均为
  `{ list, pagination: { page, pageSize, total, totalPages } }`。
- 所有列表默认 `page=1&pageSize=20`，`pageSize` 最大 100；Orange 必须增量加载。
- 金额、数量、税率、换算系数均按十进制字符串消费，不得转成浮点数后作为写入事实。
- 预计交付日期为 `YYYY-MM-DD`；时间字段为带时区 ISO datetime。
- 四个 mutation 必须把 `Idempotency-Key` 放在请求头，长度 1–120；不能放入 body。
- 新批次 `:id` 由客户端预生成 UUID；第一次 `save-draft` 使用
  `expected_version: 0`。保存成功后后续命令始终使用服务端返回的新 `version`。

## 3. 12 个采购批次接口

公共前置条件：租户员工身份存在、供应商模块已启用。`project.read` / `project.update`
还会按员工的项目数据范围过滤。越权资源按 403 或在空项目范围中按 404/空列表处理，
客户端不能据此推断其他租户或范围外资源是否存在。

| Method / path | 权限与项目范围 | Query / body / header | `data` 响应 | 分页 | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| `GET /supplier-purchase-batch-project-options` | `supplier.purchase-requisition.view`；`project.read` 可见项目 | Query：`keyword?`、`page?`、`pageSize?` | `Page<{ id, name, status }>` | 是，1/20/100 | 401、403、`SUPPLIER_MODULE_DISABLED` |
| `GET /supplier-purchase-batch-cost-categories` | `supplier.purchase-requisition.manage`；无单项目参数 | Query：`keyword?`、`page?`、`pageSize?` | `Page<{ id, code, name, status:"active", sort_order }>` | 是，1/20/100 | 401、403、`SUPPLIER_MODULE_DISABLED` |
| `GET /supplier-purchase-batch-catalog` | `supplier.purchase-requisition.manage`；目标项目须可 `project.update` | Query：必填 `projectId`；可选 `keyword`、`categoryId`、`brandId`、`tenantSupplierId`、`page`、`pageSize` | `Page<PurchaseBatchCatalogItem>` | 是，1/20/100 | 400 `VALIDATION_ERROR`、403、目录/供应商命令错误 |
| `GET /supplier-purchase-batches` | `supplier.purchase-requisition.view`；按 `project.read` 范围 | Query：`keyword?`、`status?`、`projectId?`、`page?`、`pageSize?` | `Page<PurchaseBatch>`；列表项有 `project`，没有 `actions` | 是，1/20/100 | 400、401、403、`SUPPLIER_MODULE_DISABLED` |
| `GET /supplier-purchase-batches/:id` | `supplier.purchase-requisition.view`；批次项目须可 `project.read` | Path：批次 UUID | `PurchaseBatch & { project, actions }` | 否 | 400、403、404 `SUPPLIER_PURCHASE_BATCH_NOT_FOUND` |
| `GET /supplier-purchase-batches/:id/items` | 同详情 | Query：`page?`、`pageSize?` | `Page<PurchaseBatchItem>` | 是，1/20/100 | 400、403、404 |
| `GET /supplier-purchase-batches/:id/requisitions` | 同详情 | Query：`page?`、`pageSize?` | `Page<PurchaseBatchRequisition>` | 是，1/20/100 | 400、403、404 |
| `GET /supplier-purchase-batches/:id/orders` | 同详情 | Query：`page?`、`pageSize?` | `Page<PurchaseBatchOrder>` | 是，1/20/100 | 400、403、404 |
| `POST /supplier-purchase-batches/:id/save-draft` | `supplier.purchase-requisition.manage`；新建时目标项目须可 `project.update`；修改时旧项目也须在 update 范围，换项目时新项目再校验 | Header：`Idempotency-Key`；body 见 3.1 | `{ status:"saved", idempotent, batch, version, split_preview }` | 否 | 400 验证/重复 SKU/100 行或 20 供应商上限；403；404；409 ID、版本、状态、项目、价格/商品/供应商错误或幂等冲突 |
| `POST /supplier-purchase-batches/:id/submit` | `supplier.purchase-requisition.manage`；当前项目须可 `project.update` | Header：`Idempotency-Key`；body `{ expected_version }` | `{ status:"submitted", idempotent, batch, version, requisition_ids }` | 否 | 400、403、404；409 版本/状态/项目/价格/预算/供应商/幂等冲突 |
| `POST /supplier-purchase-batches/:id/review` | `supplier.purchase-requisition.approve`；项目须可 `project.read`；创建人/提交人不得自审；超预算通过时额外 `finance.budget.manage` | Header：`Idempotency-Key`；body `{ expected_version, action:"approve"|"reject", remark? }`；reject 的 `remark` 必填 | approve：`{ status:"ordered", idempotent, batch, version, requisition_ids, orders }`；reject：`{ status:"rejected", idempotent, batch, version }`；漂移见第 8 节 | 否 | 400、403、404；409 版本/状态/自审/预算覆盖/修订/幂等冲突；任一订单失败整事务回滚 |
| `POST /supplier-purchase-batches/:id/cancel` | `supplier.purchase-requisition.manage`；当前项目须可 `project.update`；仅 draft / pending_approval | Header：`Idempotency-Key`；body `{ expected_version, reason }` | `{ status:"cancelled", idempotent, batch, version }` | 否 | 400、403、404；409 版本/状态/幂等冲突 |

### 3.1 mutation 请求体

保存草稿：

```json
{
  "project_id": "project-uuid",
  "expected_version": 0,
  "reason": "项目主材采购",
  "expected_delivery_date": "2026-09-10",
  "remark": null,
  "items": [
    {
      "supplier_sku_id": "sku-uuid",
      "cost_category_id": "cost-category-uuid",
      "quantity": "20.0000"
    }
  ]
}
```

约束：`items` 1–100 行，同一 SKU 不得重复；`quantity` 大于 0、最多 4 位小数、
整数最多 14 位。客户端不能提交供应商、价格、税率、金额或拆单结果。

提交：

```json
{ "expected_version": 1 }
```

通过 / 驳回：

```json
{
  "expected_version": 2,
  "action": "approve",
  "remark": null
}
```

```json
{
  "expected_version": 2,
  "action": "reject",
  "remark": "采购依据不完整"
}
```

取消：

```json
{
  "expected_version": 1,
  "reason": "采购计划取消"
}
```

`reason` / 非空 `remark` 最长 500 字；驳回备注必须为 1–500 字。

## 4. 批次、目录、拆单与子单字段

### 4.1 批次状态与页面含义

| 持久状态 | 页面含义 | 可出现的服务端 action |
| --- | --- | --- |
| `draft` | 可编辑草稿或因事实漂移退回的草稿 | `can_edit`、`can_submit`、`can_cancel`，以及有额外权限时的三个快速新建 action |
| `pending_approval` | 已提交、当前代次子采购申请待整批审核 | 非自审审批人可 `can_review`；有项目更新权限的管理人可 `can_cancel` |
| `rejected` | 整批驳回，终态 | 当前实现所有 mutation action 为 false |
| `cancelled` | 整批取消，终态 | 全 false |
| `ordered` | 已整批通过且每个供应商采购单均为 submitted | 全 false；展示采购单列表 |

没有持久 `approved` 状态。通过审批与全部采购单提交在同一事务，成功直接变成
`ordered`。`revision_required` 也不是持久批次状态，而是 review 命令结果；数据库会把批次
持久化回 `draft` 并递增版本。

### 4.2 `PurchaseBatch` 字段

详情和命令中的批次字段为：

```text
id, tenant_id, project_id, batch_no, status,
reason, expected_delivery_date, remark,
priced_at, currency,
subtotal_amount, tax_amount, total_amount,
budget_checked_at, budget_status, budget_snapshot,
split_generation, supplier_count, item_count, version,
created_by_employee_id, updated_by_employee_id,
submitted_by_employee_id, submitted_at,
reviewed_by_employee_id, reviewed_at, review_remark,
cancelled_by_employee_id, cancelled_at, cancel_reason,
created_at, updated_at
```

读接口额外返回 `project: { id, name, status }`。只有批次详情额外返回：

```ts
type PurchaseBatchActions = {
  can_edit: boolean;
  can_submit: boolean;
  can_review: boolean;
  can_cancel: boolean;
  can_create_supplier: boolean;
  can_create_catalog: boolean;
  can_create_purchasable_product: boolean;
};
```

小程序对批次页面的按钮显隐只使用 `actions`，不要本地复制状态机、项目 scope 或自审规则。
命令入口仍会重新鉴权，所以 action 为 true 也不能替代错误处理。

金额和快照：

- `currency` 当前固定为 `CNY`；
- `subtotal_amount`、`tax_amount`、`total_amount` 都是金额字符串；
- `budget_status` 为 `unchecked | within_budget | over_budget`；
- `budget_snapshot` 以成本分类 UUID 为 key，每项含
  `requested_amount`、`budget_amount`、`expense_amount`、
  `other_commitment_amount`、`available_amount`，均为字符串；
- `split_generation` 初始为 0，每次提交生成新代次。

### 4.3 `PurchaseBatchCatalogItem`

```text
supplier_product_id, product_code, product_name,
supplier_sku_id, sku_code, sku_name, specification, model,
supplier_price_list_id, price_list_code, price_list_version,
effective_from, effective_until, supplier_price_list_item_id,
purchase_unit_id, purchase_unit_code, purchase_unit_name, purchase_unit_symbol,
base_unit_id, base_unit_code, base_unit_name, base_unit_symbol,
base_unit_conversion, unit_price, tax_rate, tax_inclusive,
category_id, category_name, brand_id, brand_name,
tenant_supplier_id, supplier_id, supplier_name,
currency, purchasable_status
```

`purchasable_status` 当前只会是 `purchasable`。目录卡片可展示服务端单价，但保存草稿时只提交
SKU、成本分类和数量；后端重新解析价格事实。

### 4.4 `split_preview`

保存草稿返回的拆单预览按 `tenant_supplier_id` 稳定排序：

```ts
type SplitPreview = {
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  item_count: number;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
};
```

预览只能展示，不能由客户端回传或作为可信拆单结果。一个批次有 N 个
`tenant_supplier_id`，提交后就有 N 张子采购申请；通过后有 N 张采购单。

### 4.5 批次明细、子采购申请与采购单

`/items` 返回保存时的完整冻结事实：

```text
id, tenant_id, purchase_batch_id, line_no,
supplier_sku_id, quantity, cost_category_id,
supplier_id, tenant_supplier_id, supplier_product_id,
supplier_price_list_id, supplier_price_list_item_id,
catalog_category_id, category_name_snapshot, brand_id, brand_name_snapshot,
product_code_snapshot, product_name_snapshot, sku_code_snapshot, sku_name_snapshot,
specification_snapshot, model_snapshot,
purchase_unit_id, purchase_unit_code_snapshot, purchase_unit_name_snapshot,
purchase_unit_symbol_snapshot,
base_unit_id, base_unit_code_snapshot, base_unit_name_snapshot,
base_unit_symbol_snapshot, base_unit_conversion,
supplier_name_snapshot, price_list_code_snapshot, price_list_version_snapshot,
price_effective_from_snapshot, price_effective_until_snapshot, priced_at,
unit_price, tax_rate, tax_inclusive,
line_subtotal_amount, line_tax_amount, line_total_amount,
created_at, updated_at
```

`/requisitions` 返回当前和历史拆单代次中归属于该批次的采购申请记录：

```text
id, tenant_id, request_no, project_id, tenant_supplier_id, supplier_id,
status, budget_status, currency, reason, expected_delivery_date, remark,
priced_at, subtotal_amount, tax_amount, total_amount,
purchase_order_id, purchase_batch_id, split_generation, version,
created_by_employee_id, updated_by_employee_id,
submitted_by_employee_id, submitted_at,
reviewed_by_employee_id, reviewed_at, review_remark,
cancelled_by_employee_id, cancelled_at, cancel_reason,
created_at, updated_at
```

`/orders` 返回归属于该批次的采购单记录：

```text
id, tenant_id, project_id, tenant_supplier_id, supplier_id,
order_no, status, currency, expected_delivery_date, remark, priced_at,
subtotal_amount, tax_amount, total_amount,
purchase_requisition_id, purchase_batch_id, version,
created_by_employee_id, updated_by_employee_id,
submitted_by_employee_id, submitted_at,
cancelled_by_employee_id, cancelled_at, cancel_reason,
created_at, updated_at,
project, supplier, purchase_requisition
```

批次审批成功返回的 `orders` 是精简摘要，不是上述分页详情：

```ts
type OrderedSummary = {
  id: string;
  order_no: string;
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  status: 'submitted';
};
```

## 5. 真实可用的快速新建接口

### 5.1 新建私有供应商：当前必须两步

第一步，新建私有供应商和租户合作关系：

```http
POST /suppliers/private
Idempotency-Key: <uuid>
```

最简 body：

```json
{
  "name": "上海示例建材",
  "primary_contact": {
    "name": "张三",
    "phone": "13800000000",
    "email": null
  },
  "remark": null
}
```

`primary_contact` 可省略。最简 schema 接受 `remark`，但当前 service 的简化创建分支没有把
`remark` 传入数据库命令；Orange 不应依赖该字段已持久化。

权限和 rollout：

- `supplier.master.manage`；
- 供应商模块启用；
- `private_supplier_writes_enabled`。

响应是完整租户供应商关系，关键字段：

```text
id (= tenant_supplier_id), tenant_id, supplier_id,
relationship_status, internal_supplier_code, version,
supplier { id, code, name, legal_name, supplier_type,
           onboarding_status, operational_status, ownership_scope,
           owner_tenant_id, version, ... },
primary_contact, address
```

当前创建结果的供应商主档为 `approved + active`，但合作关系是 `evaluating`，尚不能写商品或
用于采购。因此第二步必须启用合作关系：

```http
POST /suppliers/:tenantSupplierId/activate
Idempotency-Key: <another-uuid>
Content-Type: application/json

{ "expected_version": 1 }
```

该接口额外要求 `supplier.manage`。成功响应是命令 envelope；应读取
`data.tenant_supplier` 和 `data.version` 中的最新关系及版本，再进入商品创建。

当前契约缺口：批次详情的 `actions.can_create_supplier` 只检查
`supplier.master.manage`，没有同时表达第二步所需的 `supplier.manage`。所以它能控制“创建供应商”
入口，但不能保证用户有权把新关系立即启用。Orange 不得绕过后端；若激活返回 403，应保留已
创建供应商并提示“已创建，需供应商管理员启用”，不能继续调用商品创建。后端若要把“新建并
立即可采购供应商”做成严格单动作，需另行增加复合命令或扩展服务端 action，本次未实现。

### 5.2 新建分类和品牌

品牌必须绑定一个已启用分类。若分类已存在，只需创建品牌；若没有，先创建分类。

```http
POST /catalog/categories
Idempotency-Key: <uuid>

{
  "parent_id": null,
  "name": "瓷砖",
  "status": "active"
}
```

响应命令状态为 `created`，已验证资源可从 `data.resource` 读取；原 envelope 同时保留
`data.catalog_category`。分类资源包含：

```text
id, parent_id, code, name, level, full_name, is_leaf,
mapped_platform_category_id, ownership_scope, owner_tenant_id,
status, sort_order, version, created_by_employee_id,
updated_by_employee_id, created_at, updated_at
```

然后创建品牌：

```http
POST /catalog/brands
Idempotency-Key: <uuid>

{
  "category_id": "category-uuid",
  "name": "示例品牌",
  "status": "active"
}
```

响应可从 `data.resource` 或 `data.catalog_brand` 读取，字段为：

```text
id, category_id, code, name, legal_name, logo_file_id,
mapped_platform_brand_id, ownership_scope, owner_tenant_id,
status, sort_order, version, created_by_employee_id,
updated_by_employee_id, created_at, updated_at
```

两个写接口均要求 `supplier.catalog.manage`、供应商模块、所有权读取 rollout 和
`private_catalog_writes_enabled`。分类/品牌列表是：

```text
GET /catalog/categories?page=1&pageSize=20&keyword=...
GET /catalog/brands?page=1&pageSize=20&keyword=...
GET /catalog/units?page=1&pageSize=20&keyword=...
```

它们当前也要求 `supplier.catalog.manage`。创建商品前从单位列表选择 active 单位；小程序不能
新建正式单位，只能使用现有单位或走独立的单位建议流程。

### 5.3 原子新建商品 + SKU + 供货价，成功后立即可采购

```http
POST /supplier-purchasable-products/:supplierId?tenantSupplierId=:tenantSupplierId
Idempotency-Key: <uuid>
```

这里 path 的 `:id` 是 `supplierId`，不是商品 ID；商品 ID 由服务端生成。SKU ID 由客户端
生成并放在 body：

```json
{
  "sku_id": "client-generated-sku-uuid",
  "product": {
    "name": "800×800 通体砖",
    "category_id": "category-uuid",
    "brand_id": "brand-uuid"
  },
  "sku": {
    "name": "灰色 800×800",
    "purchase_unit_id": "unit-uuid",
    "spec_values": {
      "color": "灰色",
      "size": "800×800"
    }
  },
  "price": {
    "unit_price": "89.50",
    "tax_rate": "0.13",
    "tax_inclusive": true
  }
}
```

当前 body 没有 `description`、`specification`、`model`、生效时间或备注字段，不能擅自添加。
单价大于 0、整数最多 12 位、小数最多 2 位；税率为 0–1 的十进制字符串，最多 6 位小数。

权限和前置：

- 同时拥有 `supplier.product.manage` 与 `supplier.cost-price.manage`；
- 供应商模块启用；
- `tenantSupplierId` 属于当前租户且合作关系为 `active`；
- 私有供应商属于当前租户，或平台供应商满足现有代录规则；
- 分类、品牌、采购单位存在且有效。

成功响应：

```ts
type PurchasableProductCreated = {
  status: 'created';
  idempotent: boolean;
  product: { id: string; status: 'active'; version: 2; /* 及主档字段 */ };
  sku: { id: string; status: 'active'; version: 2; /* 及 SKU 字段 */ };
  price: { id: string; unit_price: string; tax_rate: string; tax_inclusive: boolean; /* ... */ };
  catalog_item: {
    supplier_product_id: string;
    product_code: string;
    product_name: string;
    supplier_sku_id: string;
    sku_code: string;
    sku_name: string;
    specification: null;
    model: null;
    supplier_price_list_id: string;
    price_list_code: 'DEFAULT';
    price_list_version: number;
    effective_from: string;
    effective_until: string | null;
    supplier_price_list_item_id: string;
    purchase_unit_id: string;
    purchase_unit_code: string;
    purchase_unit_name: string;
    purchase_unit_symbol: string;
    base_unit_id: string;
    base_unit_code: string;
    base_unit_name: string;
    base_unit_symbol: string;
    base_unit_conversion: string;
    unit_price: string;
    tax_rate: string;
    tax_inclusive: boolean;
  };
};
```

商品、SKU、默认价格簿新版本、价格条目发布和目录可采购校验在一个事务中完成，失败不留半成品。
成功后该 SKU 已可采购。由于复合命令的 `catalog_item` 不包含批次目录新增的分类、品牌、
`tenant_supplier_id`、供应商名和 `currency` 字段，Orange 应刷新
`GET /supplier-purchase-batch-catalog`，再从批次目录选中该 SKU；不要制造缺失字段。

## 6. Orange 推荐页面、模块和文件影响

建议使用独立分包，避免扩大主包：

```text
src/packageProcurement/
├── model.ts
└── pages/
    ├── batches/          # 批次列表
    ├── batch-edit/       # 项目、原因、交付日期、购物车、拆单预览
    ├── catalog/          # 跨供应商分页选品
    ├── batch-detail/     # 批次、明细、子申请、采购单
    ├── batch-review/     # 整批通过/驳回和 revision blocker
    ├── supplier-create/  # 私有供应商创建 + 激活结果
    ├── brand-create/     # 分类选择/创建 + 品牌创建
    └── product-create/   # 商品 + SKU + 供货价复合表单
```

Orange 团队建议新增/修改：

| 文件 | 操作 | 目的 |
| --- | --- | --- |
| `src/services/supplier_procurement.ts` | 新增 | 本文接口类型、分页、mutation wrapper、revision error narrowing |
| `src/services/index.ts` | 修改 | 导出 `SupplierProcurementService` |
| `src/types/api/supplier_procurement.d.ts` | 新增 | 批次、目录、子单、错误详情类型；不要放页面状态 |
| `src/packageProcurement/model.ts` | 新增 | 购物车去重、分页合并、金额展示、blocker 描述；不计算可信金额 |
| 上述 `src/packageProcurement/pages/**` | 新增 | 三个主页面与快速新建页面 |
| `src/app.config.ts` | 修改 | 注册 `packageProcurement` 及页面 |
| `src/pages/index/homeModel.tsx` | 修改 | 按采购查看/管理权限增加采购工作台入口 |
| `src/pages/index/homeModel.test.tsx` | 新增/修改 | 权限入口测试 |
| `src/utils/permission.ts` | 修改 | 当前本地静态权限列表未列供应商权限；补充显示映射时使用 `@gooes/domain` 已有 code |
| `src/services/task_center.ts` | 条件修改 | 仅当后端未来产生 `supplier_purchase_batch` workflow task 时映射详情 URL |
| `src/types/api/task_center.d.ts` | 条件修改 | 新增明确的 todo type（若后端任务契约落地） |
| `scripts/supplier-procurement-contract-smoke.mjs` | 新增 | dev API 非写契约 + 显式 opt-in mutation smoke |
| `package.json` | 修改 | 增加小程序采购 contract smoke 命令 |

`src/app.config.ts` 当前没有采购分包，可注册：

```ts
{
  root: 'packageProcurement',
  pages: [
    'pages/batches/index',
    'pages/batch-edit/index',
    'pages/catalog/index',
    'pages/batch-detail/index',
    'pages/batch-review/index',
    'pages/supplier-create/index',
    'pages/brand-create/index',
    'pages/product-create/index',
  ],
}
```

当前 Gooes 批次功能没有接入 workflow task center，也没有为采购审批创建任务中心记录。
所以第一版应从员工首页/工作台直接进入批次列表，审批人通过列表的
`status=pending_approval` 筛选处理。不能只改 Orange `task_center.ts` 就声称有采购待办；若要
真正进入任务中心，需要后端另行定义 workflow/task producer、subject type、card context 和
target URL，再由 Orange 添加映射。

## 7. 完整调用时序

### 7.1 新建、选品、保存、提交

```text
1. PermissionService.getMyPermissions()
2. GET /supplier-purchase-batch-project-options?page=1&pageSize=20
3. 选择项目
4. GET /supplier-purchase-batch-cost-categories?page=1&pageSize=20
5. GET /supplier-purchase-batch-catalog?projectId=...&page=1&pageSize=20
6. 分页搜索并按 supplier_sku_id 维护本地购物车
7. 可选快速新建：
   7a. 供应商：POST /suppliers/private -> POST /suppliers/:id/activate
   7b. 分类/品牌：必要时 POST /catalog/categories -> POST /catalog/brands
   7c. 商品：POST /supplier-purchasable-products/:supplierId?tenantSupplierId=...
   7d. 刷新 batch catalog page 1，并选中新 supplier_sku_id
8. POST /supplier-purchase-batches/:batchId/save-draft
9. 用响应 batch/version/split_preview 覆盖本地展示
10. POST /supplier-purchase-batches/:batchId/submit
11. 跳转批次详情，状态应为 pending_approval
```

筛选条件变化时重置为 page 1；分页合并以 SKU UUID 去重。批次草稿本地只保留
`supplier_sku_id + cost_category_id + quantity` 作为提交事实，目录展示对象另存。

### 7.2 审批通过：自动拆分并直接提交采购单

```text
1. GET /supplier-purchase-batches/:id
2. 仅 actions.can_review=true 时展示审批入口
3. POST /supplier-purchase-batches/:id/review
   { expected_version, action:"approve", remark:null }
4. 后端按 tenant_supplier_id 分组
5. 后端在一个事务中重验供应商/价格/商品/SKU/预算
6. 后端为每个供应商创建采购单并调用提交规则
7. 全部成功：batch.status=ordered，orders[*].status=submitted
8. 展示返回的所有 order_no；按需分页加载 /orders
```

客户端不能调用旧的 requisition convert，也不能逐供应商创建/提交订单。任何一个供应商订单
失败，整个 review 请求失败，数据库中保持 0 张本次采购单。

### 7.3 驳回、取消和子资源

- 驳回：`review` 使用 `action:"reject"`，必须提交备注；不需要财务预算权限。
- 取消：draft 或 pending_approval 调 `cancel`；pending_approval 的当前代次子申请同步取消。
- 子资源：详情首屏只拉批次；展开对应 section 时再以 1/20 分页加载
  `/items`、`/requisitions`、`/orders`，不要并发拉取全量。
- 网络结果不确定：先 `GET /supplier-purchase-batches/:id` 判断状态和版本，再决定是否以原 key
  重试同一动作。

## 8. 幂等键生命周期与双击保护

Orange 已有 `src/utils/idempotency.ts#createUuidV4`。推荐在页面/Hook 的 command state 或 ref
中维护 key：

```ts
import { api } from '@/utils/api';
import { createUuidV4 } from '@/utils/idempotency';

const key = createUuidV4();

await api.post<PurchaseBatchCommandResult>(
  `/supplier-purchase-batches/${batchId}/submit`,
  { expected_version: version },
  { header: { 'Idempotency-Key': key } },
);
```

生命周期规则：

1. 用户明确触发一个逻辑动作时生成 key，并立即锁定按钮，禁止 double tap。
2. 超时、断网、App 前后台切换或响应丢失后，先查详情；需要重试同一动作时复用原 key。
3. 同一 key + 同一命令指纹会返回第一次持久结果，响应 `idempotent` 可为 true。
4. 用户修改了 body、`expected_version`、审批动作、驳回原因或明确开始新动作，必须使用新 key。
5. 同一 key 复用于不同指纹会得到 HTTP 409 `SUPPLIER_IDEMPOTENCY_CONFLICT`。
6. 不要在 service wrapper 内部自动生成 key，否则网络层重试容易换 key。
7. 不要把 key 放 body；header 名使用 `Idempotency-Key`。

`revision_required` 的第一次结果会写命令事件并提交“退回 draft + 新 version”。同 key 重放会返回
同一持久修订结果，API 再映射成同一 409；客户端看不到内部重放事件差异，但必须保留
`batch`、新 `version`、`error_code` 和 blocker `details`。用户完成刷新/修改后再次保存或提交是
新动作，使用新 key。

## 9. HTTP 409 `revision_required`

### 9.1 错误 envelope

发生事实漂移时，HTTP 状态为 409，顶层 `code` 是下列四个之一。顶层 `details` 为：

```ts
type PurchaseBatchRevisionPayload = {
  batch: PurchaseBatch;       // 已持久化为 draft
  version: number;            // 新版本，等于 batch.version
  error_code:
    | 'SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE'
    | 'SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED'
    | 'SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE'
    | 'SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED';
  details: PurchaseBatchBlocker[];
};
```

在 Orange 的 `ApiError` 中，应从 `error.details` 读取这个 payload。不要只保留顶层 `code`，
否则会丢失已提交的新版本和所有 blocker。

### 9.2 discriminated blockers

```ts
type PurchaseBatchBlocker =
  | {
      kind: 'supplier';
      tenant_supplier_id: string;
      supplier_id: string;
      reason: string;
    }
  | {
      kind: 'price';
      supplier_sku_id: string;
      product_name: string;
      sku_name: string;
      frozen_unit_price: string;
      current_unit_price: string | null;
      frozen_price_version: number;
      current_price_version: number | null;
    }
  | {
      kind: 'item';
      supplier_sku_id: string;
      reason: string;
    }
  | {
      kind: 'budget';
      cost_category_id: string;
      submitted_requested_amount: string;
      current_requested_amount: string;
      submitted_available_amount: string;
      current_available_amount: string;
    };
```

后端会返回全部 blocker，稳定排序为：供应商 → 价格 → 商品/SKU → 预算；每个家族内部按稳定
UUID/行序排列。`error_code` 取第一个非空家族，所以后续 `details` 可能包含其他 kind；客户端
必须按 `kind` 遍历，不能假设所有元素都与顶层 code 同类。

### 9.3 客户端刷新方案

1. 立即清空审批页选中状态、关闭提交锁，但保留 409 payload 用于提示。
2. 用 payload 中的 `batch` 和 `version` 先更新页面，状态按 `draft` 处理。
3. 展示全部 blocker；价格并排显示 frozen/current，预算显示 submitted/current。
4. 申请人进入编辑页时重新加载批次明细、批次 catalog page 1 和必要的预算提示。
5. 目录项不可用时从购物车移除或要求重新选择；价格变化要求用户明确确认后重新保存。
6. 新保存使用 payload 的新版本和新幂等键；保存成功后再提交。

## 10. 主要错误处理矩阵

| HTTP | code | Orange 处理 |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | 显示字段问题；Idempotency-Key 缺失/过长也使用此 code |
| 400 | `SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR` | 保留表单，提示批次输入无效 |
| 400 | `SUPPLIER_PURCHASE_BATCH_DUPLICATE_SKU` | 定位重复 SKU，购物车去重 |
| 400 | `SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED` | 最多 100 SKU / 20 供应商 |
| 401 | `UNAUTHORIZED` 等 | 复用全局登录恢复逻辑 |
| 403 | `FORBIDDEN` | 返回上一页/隐藏入口并刷新权限；不要重试绕过 |
| 404 | `SUPPLIER_PURCHASE_BATCH_NOT_FOUND` | 返回列表并刷新；也可能是项目 scope 不可见 |
| 409 | `SUPPLIER_MODULE_DISABLED` | 隐藏采购入口，提示管理员启用供应商模块 |
| 409 | `SUPPLIER_IDEMPOTENCY_CONFLICT` | 原 key 已绑定其他指纹；刷新状态，明确新动作才换 key |
| 409 | `SUPPLIER_PURCHASE_BATCH_ID_CONFLICT` | 新批次 UUID 冲突；确认未创建后生成新 batch UUID |
| 409 | `SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT` | 强制刷新详情和 version |
| 409 | `SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT` | 强制刷新状态/actions |
| 409 | `SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID` | 重新选择项目或返回列表 |
| 409 | `SUPPLIER_PURCHASE_BATCH_SELF_REVIEW` | 隐藏审批并刷新 actions；不要换账号逻辑绕过 |
| 409 | `SUPPLIER_PURCHASE_BATCH_BUDGET_OVERRIDE_REQUIRED` | 超预算通过缺财务权限；驳回仍可执行 |
| 409 | 四个 revision code | 按第 9 节保留 payload、退回 draft、刷新修订 |
| 409 | `SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION` | 客户端错误调用了旧子申请 mutation；改回 batch 命令 |
| 409 | `SUPPLIER_PURCHASE_BATCH_OWNERSHIP_IMMUTABLE` | 不允许改写子申请/订单批次归属 |
| 500 | `DB_ERROR` | 记录脱敏 Request-ID，提示稍后重试；不要展示 SQL/details 原文 |

## 11. 权限矩阵

| 能力 | 必需权限 | 项目范围 / 额外条件 |
| --- | --- | --- |
| 批次列表、详情、明细、子申请、采购单、项目选项 | `supplier.purchase-requisition.view` | `project.read` 可见范围 |
| 成本分类、批次目录、保存、提交、取消 | `supplier.purchase-requisition.manage` | catalog/save/submit/cancel 需 `project.update`；成本分类无单项目 |
| 整批审批/驳回 | `supplier.purchase-requisition.approve` | `project.read`；不得是创建人或提交人 |
| 超预算通过 | 上述 approve + `finance.budget.manage` | 仅 `action=approve && budget_status=over_budget` |
| 新建私有供应商 | `supplier.master.manage` | private supplier rollout；激活另需 `supplier.manage` |
| 激活租户供应商关系 | `supplier.manage` | 关系当前状态允许 activate |
| 分类、品牌、单位读取与私有目录维护 | `supplier.catalog.manage` | ownership reads；写还需 private catalog writes |
| 原子新建可采购商品 | `supplier.product.manage` + `supplier.cost-price.manage` | active 合作关系；有效分类/品牌/单位 |
| 批次项目读取 | `project.read` | 服务端 scope |
| 批次项目编辑 | `project.update` | 服务端 scope |

预算权限三值必须按以下规则实现，不能写成“所有 review 都要 finance”：

| 当前预算 | review action | `finance.budget.manage` |
| --- | --- | --- |
| `within_budget` | approve | 不需要 |
| `over_budget` | approve | 必须 |
| `over_budget` | reject | 不需要 |

## 12. Orange 可复制的类型与 wrapper 示例

以下示例适配当前 `api` 返回 `ApiResponse<T>` 的方式；省略的批次审计字段应按第 4 节补齐，
不要将省略号代码原样提交。

```ts
import { api } from '@/utils/api';
import type { RequestOptions } from '@/utils/https';

export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PurchaseBatchStatus =
  | 'draft'
  | 'pending_approval'
  | 'rejected'
  | 'cancelled'
  | 'ordered';

export type PurchaseBatchDraftPayload = {
  project_id: string;
  expected_version: number;
  reason: string;
  expected_delivery_date?: string | null;
  remark?: string | null;
  items: Array<{
    supplier_sku_id: string;
    cost_category_id: string;
    quantity: string;
  }>;
};

const commandOptions = (key: string): RequestOptions => ({
  header: { 'Idempotency-Key': key },
});

export const SupplierProcurementService = {
  listBatches: (query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: PurchaseBatchStatus;
    projectId?: string;
  } = {}) => api.get<Page<PurchaseBatch>>('/supplier-purchase-batches', query),

  getBatch: (id: string) =>
    api.get<PurchaseBatchDetail>(`/supplier-purchase-batches/${id}`),

  listCatalog: (query: {
    projectId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
    categoryId?: string;
    brandId?: string;
    tenantSupplierId?: string;
  }) => api.get<Page<PurchaseBatchCatalogItem>>(
    '/supplier-purchase-batch-catalog',
    query,
  ),

  saveDraft: (
    id: string,
    payload: PurchaseBatchDraftPayload,
    key: string,
  ) => api.post<PurchaseBatchSaved>(
    `/supplier-purchase-batches/${id}/save-draft`,
    payload,
    commandOptions(key),
  ),

  submit: (id: string, expectedVersion: number, key: string) =>
    api.post<PurchaseBatchSubmitted>(
      `/supplier-purchase-batches/${id}/submit`,
      { expected_version: expectedVersion },
      commandOptions(key),
    ),

  review: (
    id: string,
    payload: {
      expected_version: number;
      action: 'approve' | 'reject';
      remark?: string | null;
    },
    key: string,
  ) => api.post<PurchaseBatchOrdered | PurchaseBatchRejected>(
    `/supplier-purchase-batches/${id}/review`,
    payload,
    commandOptions(key),
  ),

  cancel: (
    id: string,
    expectedVersion: number,
    reason: string,
    key: string,
  ) => api.post<PurchaseBatchCancelled>(
    `/supplier-purchase-batches/${id}/cancel`,
    { expected_version: expectedVersion, reason },
    commandOptions(key),
  ),
};
```

快速商品 wrapper：

```ts
const skuId = createUuidV4();
const key = createUuidV4();

await api.post<PurchasableProductCreated>(
  `/supplier-purchasable-products/${supplierId}` +
    `?tenantSupplierId=${encodeURIComponent(tenantSupplierId)}`,
  {
    sku_id: skuId,
    product: { name, category_id: categoryId, brand_id: brandId },
    sku: { name: skuName, purchase_unit_id: unitId, spec_values: specValues },
    price: { unit_price: unitPrice, tax_rate: taxRate, tax_inclusive: true },
  },
  { header: { 'Idempotency-Key': key } },
);
```

## 13. 兼容性与禁止调用

- 旧的单供应商采购申请、采购单 API 保持可读，历史记录的 `purchase_batch_id` 为 null。
- 批次生成的子申请/采购单可继续被旧只读列表和详情展示，并通过
  `purchase_batch_id` 识别来源。
- `purchase_batch_id != null` 的子采购申请禁止通过旧 mutation 单独 submit、review、cancel
  或 convert；后端返回 `SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION`。
- 批次归属和拆单代次不可被旧更新入口改写。
- Orange 不得直接调用 `convert_supplier_purchase_requisition`，也不得逐供应商调用采购单
  save/submit；只调用 batch `review approve`。
- 审批成功返回的每张采购单都已经是 `submitted`，不需要也不允许小程序再提交一次。
- 后端按 `tenant_supplier_id` 分单，不按供应商名称，也不信任客户端分组。

## 14. UI 与状态处理注意事项

- 新建批次进入页面时只生成一次 batch UUID；保存失败保留该 UUID，除非确认是 ID conflict。
- 使用 string formatter 展示金额；不要 `Number(total_amount)` 后再累加或回传。
- `expected_delivery_date` 使用日期选择器，传 `YYYY-MM-DD` 或 null；时间戳仅展示。
- 空项目 scope：列表/项目选项展示空态；详情 404；不要将空数组解释为全项目。
- 详情按钮只看 `actions`。尤其 `can_review` 已包含创建人/提交人自审限制。
- mutation 按钮点击后立即 disabled；同一 command pending 时拒绝 double tap。
- 列表、目录和三个 child 资源使用 page 1 替换、后续页追加、ID 去重、`totalPages` 停止。
- `revision_required` 后清空审批选中和旧拆单展示，刷新详情、批次明细、catalog 与预算提示。
- 列表项没有 `actions`；需要行内动作时先打开/预取详情，不能在列表本地推导。
- 审批成功展示返回的所有订单号，不要只展示第一张。
- 用户明确新动作/修改指纹才换幂等键；网络失败不自动换 key。

## 15. Mini-program smoke / 验收清单

### 15.1 静态和只读验收

- [ ] 12 个 route wrapper 的 method/path/query/body/header 与第 3 节一致。
- [ ] 所有 list 默认 1/20、最大 100，使用上拉加载或“加载更多”。
- [ ] `ApiResponse<T>` 读取 `response.data`，409 读取 `ApiError.code/details`。
- [ ] 价格、金额、数量、税率类型均为 string。
- [ ] 首页入口按采购权限显示；批次详情动作只使用后端 `actions`。
- [ ] `app.config.ts` 已注册采购分包，页面不落在主包。
- [ ] 无 token、tenant ID、SQL、数据库 error details 被写入日志/埋点。

### 15.2 Dev mutation 验收

- [ ] 新建 supplier：创建返回 evaluating；有 manage 权限时激活为 active。
- [ ] 新建分类、品牌；品牌请求包含 `category_id`。
- [ ] 一次请求创建商品 + SKU + 供货价，返回 `status=created` 和 `catalog_item`。
- [ ] 刷新 batch catalog 后新 SKU 可被检索并加入购物车。
- [ ] 一个项目选择至少两个供应商的 SKU，保存返回 `split_preview.length=2`。
- [ ] 保存响应覆盖客户端预览；客户端没有上传供应商或金额。
- [ ] submit 返回两张 `requisition_ids`，批次进入 pending_approval。
- [ ] 创建人/提交人看不到 review；另一审批人可处理。
- [ ] within-budget approve 不要求 finance；over-budget approve 要求 finance；over-budget reject
  不要求 finance。
- [ ] approve 返回两张且仅两张 `status=submitted` 订单；批次为 ordered。
- [ ] 同一动作网络重试复用 key，返回同一资源/版本，不重复下单。
- [ ] 两个审批人并发时仅一个成功，另一个 version conflict。
- [ ] reject 必须填写备注，整批和当前代次子申请均驳回。
- [ ] draft / pending 批次可取消，终态不能再操作。
- [ ] 依次验证 supplier、price、item、budget blocker；混合漂移显示全部 blocker。
- [ ] revision 后批次为 draft、版本递增、0 张新采购单；新版本可重新保存和提交。
- [ ] 逐页展开 items/requisitions/orders，停止条件使用 `totalPages`。
- [ ] 真机验证弱网、超时、重复点击、前后台切换与返回页刷新。

## 16. 团队责任与发布前置

Gooes 团队负责：

- 维护本文 12 个 API、数据库 migration、幂等/原子性和错误契约；
- 通过仓库 workflow 部署 migration 和 API；
- 提供已部署 dev 版本、测试租户、权限账号和脱敏 Request-ID 排障；
- 若要采购审批进入任务中心，另行交付 workflow/task contract；
- 若要“私有供应商单接口新建后立即可采购”，另行闭合创建 + 激活的复合命令或 action 契约。

Orange 团队负责：

- 只在 orange 仓库实现第 6 节文件；
- 使用现有 HTTP/auth/idempotency/permission 约定；
- 不复制后端拆单、金额、预算、权限或状态机；
- 完成 service/model tests、typecheck、文件体积检查、WeChat build 和 dev 真机 smoke；
- 回传环境、接口 path、HTTP、稳定 code、脱敏 Request-ID、batch/order ID 与 key 是否复用，
  不回传 token 或原始数据库错误。

### 16.1 当前后端验证证据

截至本文生成时，本地证据为：

- migration `20260826140500`、`20260826141000`、`20260826141500`、
  `20260826142000` 在本地 Local/DB 对齐，dry-run 显示 up to date；
- 真实 smoke：2 个供应商生成 2 张 submitted orders，幂等重放安全；7 个独立 drift
  场景返回 exact/full revision；第二张订单失败时完整回滚；fixture 最终回滚；
- 并发 smoke：两个审批人、不同 key，结果为 1 个 winner + 1 个 version conflict；
  submitted orders=2、success event=1、conflict event=1、cleanup=true；
- 默认 planner `EXPLAIN ANALYZE`：6/6 命中 product/sku GIN、batch、items、
  requisitions、orders 预期索引，fixture 回滚；
- batch focused tests：139 pass；release orchestration：141 pass；
- `api:check`、typecheck、build、API 文件 `<500` 行门禁和 `git diff --check` 均通过。

这些都是 local-only 证据。远端 Supabase 没有连接、没有应用本批 migration，API 也没有发布；
Orange 不应在 dev API 实际部署前开始写 mutation 真机验收。

### 16.2 非事务 migration 部署要求

`20260826140500` 与 `20260826141500` 使用 `CREATE INDEX CONCURRENTLY`。
Supabase CLI 2.99 的直接 `db push` / `db reset` 会把 migration 放入事务，不能用于这两份文件。

正式部署只能使用仓库的：

- dev：`.github/workflows/migrate-dev-database.yml`；
- production：`.github/workflows/migrate-production-database.yml`。

workflow 必须按 140500 → 141000 → 141500 → 142000 执行，在事务外建索引，执行严格
post-DDL catalog 校验后才登记 migration history。部署后在授权环境运行
`supabase migration list`，确认 Local/Remote 对齐至 `20260826142000`。禁止手工 DDL/DML、
禁止绕过 workflow 手工补 history。详细恢复流程见
`docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md`。

## 17. 证据路径

Gooes 当前实现：

- `apps/api/src/controllers/supplier-purchase-batches/index.ts`
- `apps/api/src/schema/supplier-purchase-batches.ts`
- `apps/api/src/services/supplier-purchase-batches.ts`
- `apps/api/src/services/supplier-purchase-batch-access.ts`
- `apps/api/src/repositories/supplier-purchase-batches.ts`
- `apps/api/src/repositories/supplier-purchase-batch-records.ts`
- `apps/api/src/repositories/supplier-purchase-batch-command-records.ts`
- `apps/api/src/repositories/supplier-purchase-batch-errors.ts`
- `apps/api/src/controllers/supplier-purchasable-products/index.ts`
- `apps/api/src/schema/supplier-purchasable-products.ts`
- `apps/api/src/repositories/supplier-purchasable-product-records.ts`
- `apps/api/src/controllers/tenant-suppliers/index.ts`
- `apps/api/src/schema/tenant-suppliers.ts`
- `apps/api/src/controllers/supplier-catalog/index.ts`
- `apps/api/src/schema/supplier-catalog.ts`
- `apps/api/src/schema/supplier-catalog-extensions.ts`
- `packages/domain/src/supplier-purchase-batch.ts`
- `packages/domain/src/permission.ts`
- `supabase/migrations/20260826140500_prepare_supplier_price_item_batch_snapshot_key.sql`
- `supabase/migrations/20260826141000_create_supplier_purchase_batches.sql`
- `supabase/migrations/20260826141500_prepare_supplier_purchase_batch_catalog_search.sql`
- `supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql`
- `docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md`

Orange 只读检查过的具体文件：

- `AGENTS.md`
- `src/utils/api.ts`
- `src/utils/https.ts`
- `src/utils/idempotency.ts`
- `src/services/index.ts`
- `src/services/permission.ts`
- `src/services/task_center.ts`
- `src/types/api/permission.d.ts`
- `src/types/api/task_center.d.ts`
- `src/utils/permission.ts`
- `src/app.config.ts`
- `src/pages/index/homeModel.tsx`
- `src/packageEmployees/pages/expenseAction/index.tsx`
- `src/packageEmployees/pages/expenseDetail/index.tsx`

Orange 仓库在本次交接中保持未修改，也没有运行 formatter、generator、build、package install
或任何 Git 写操作。
