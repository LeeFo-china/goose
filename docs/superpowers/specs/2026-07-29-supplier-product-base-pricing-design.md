# 供应商商品与基础供货价设计

**日期：** 2026-07-29
**状态：** 已确认，进入实施规划
**所属阶段：** 供应商管理平台阶段 1 的第一个垂直切片

## 1. 背景

阶段 0 已具备平台供应商主数据、租户合作关系、合同、下单资格和标准类目/品牌/单位，但采购流程仍缺少可被订单稳定引用的供应商 SKU 与供货价格事实。

本切片先建立：

1. 供应商 SPU / SKU。
2. 默认基础供货价格簿。
3. 价格发布和历史追溯。
4. 租户采购员代录与审计。
5. 后续采购订单可引用的稳定字段。

## 2. 目标与非目标

### 2.1 目标

- 供应商商品绑定启用的末级标准类目和启用品牌。
- SKU 表达可采购规格、型号、采购单位及基础单位换算。
- 默认价格簿以不可变发布版本保存含税/未税单价和税率。
- 只有具备相应权限且与供应商存在有效合作关系的租户员工可以查看或代录。
- 商品与价格写操作保留操作者、代录来源、代录原因、幂等键和版本。
- 所有列表分页，查询只返回必要字段。
- 为采购订单后续保存 `supplier_sku_id`、价格簿 ID/版本和价格快照提供稳定契约。

### 2.2 非目标

本切片不实现：

- 买方等级价、指定租户协议价和数量阶梯价。
- 供应商门户登录、账号绑定和自助操作界面。
- 实时库存、库存快照或装修公司仓库库存。
- 采购申请、预算预检、采购订单、发货、收货、应付和付款。
- 业主销售目录与业主报价。
- 图片、附件和批量导入。

这些能力分别在后续切片扩展，不改变本切片的供应商商品和不可变价格版本语义。

## 3. 管理通道与权限

### 3.1 当前通道

当前没有供应商门户认证上下文，因此第一版从装修公司 Admin 的“采购供应 / 商品与价格”进入。员工选择一个已建立合作关系的供应商后维护其商品和默认价格。

所有写操作固定记录：

- `acting_employee_id`
- `acting_tenant_id`
- `operation_source = tenant_proxy`
- 非空 `proxy_reason`
- `operated_at`

后续供应商门户使用独立 controller 和 auth context，继续调用相同 service。届时 `operation_source = supplier_portal`，不复制商品或定价业务规则。

### 3.2 权限

新增权限：

- `supplier.product.view`
- `supplier.product.manage`
- `supplier.cost-price.view`
- `supplier.cost-price.manage`

权限边界：

- 商品列表和详情需要 `supplier.product.view`。
- 商品、SKU 写操作需要 `supplier.product.manage`。
- 供货价列表和详情需要 `supplier.cost-price.view`。
- 价格草稿、条目维护和发布需要 `supplier.cost-price.manage`。
- `supplier.manage` 只维护合作关系，不隐式获得商品或价格管理权限。
- 财务、仓库、现场和业主接口不复用包含成本价的 DTO。

租户 `system_admin` 初始获得上述权限，其他角色通过现有角色权限体系显式配置。

### 3.3 合作关系门禁

service 从认证上下文取得 `tenant_id`，禁止接受客户端传入租户 ID。

- 读取要求供应商模块已启用，并存在当前租户与目标供应商的合作关系。
- 写入要求合作关系状态为 `active`。
- 平台供应商必须已准入且运营状态为 `active`。
- 租户暂停、终止或拉黑关系后，历史商品与价格仍可追溯，但不能新增或修改。

## 4. 领域模型

### 4.1 `supplier_products`

供应商级 SPU，核心字段：

- `id`
- `supplier_id`
- `product_code`：供应商内唯一
- `name`
- `category_id`
- `brand_id`
- `description`
- `status = draft | active | inactive`
- `version`
- 创建、更新和代录审计字段

规则：

- 类目必须启用且为末级类目。
- 品牌必须启用。
- 草稿可以编辑；启用前至少存在一个启用 SKU。
- 停用 SPU 时同时阻止其 SKU 被新价格版本或采购订单引用，但不覆盖历史。
- 已经被发布价格引用的 SPU 不删除，只允许停用。

### 4.2 `supplier_skus`

供应商级可采购 SKU，核心字段：

- `id`
- `supplier_id`
- `supplier_product_id`
- `sku_code`：供应商内唯一
- `name`
- `specification`
- `model`
- `purchase_unit_id`
- `base_unit_id`
- `base_unit_conversion numeric(18, 8)`
- `batch_managed`
- `color_managed`
- `serial_managed`
- `status = draft | active | inactive`
- `version`
- 创建、更新和代录审计字段

规则：

- `supplier_id` 必须与 SPU 一致。
- 采购单位必须启用。
- 基础单位和换算因子由当前标准单位关系解析并写入 SKU，客户端不能自行指定。
- SKU 可以在草稿 SPU 下先启用用于上架准备；所属 SPU 停用时不能启用 SKU。
- 只有 SKU 与所属 SPU 都为启用状态时，SKU 才能对外参与价格发布和后续采购。
- 已经被发布价格引用的 SKU 不删除，只允许停用。
- SKU 编码和规格字段只表达供应商商品，不承载租户销售编码。

### 4.3 `supplier_price_lists`

每一行代表一个不可变发布版本或其发布前草稿。核心字段：

- `id`
- `supplier_id`
- `price_list_code`
- `version_number`
- `scope_type = default`
- `name`
- `currency = CNY`
- `lifecycle_status = draft | published | retired`
- `effective_from`
- `effective_until`
- `supersedes_price_list_id`
- `published_at`
- `row_version`
- 创建、更新和代录审计字段

唯一键：

- `(supplier_id, price_list_code, version_number)`
- 同一 `(supplier_id, price_list_code)` 最多一个草稿版本

规则：

- 草稿可修改，发布后价格簿头和条目不可修改。
- 修改已发布价格必须创建下一草稿版本，复制原条目后再编辑。
- `version_number` 是业务发布版本；`row_version` 是草稿并发控制版本。
- 退役只影响新的价格选择，不修改历史订单引用。

### 4.4 `supplier_price_list_items`

核心字段：

- `id`
- `supplier_price_list_id`
- `supplier_sku_id`
- `minimum_quantity = 1`
- `maximum_quantity = null`
- `purchase_unit_id`
- `base_unit_id`
- `base_unit_conversion numeric(18, 8)`
- `unit_price numeric(14, 2)`
- `tax_rate numeric(7, 6)`
- `tax_inclusive`
- 创建、更新审计字段

本切片固定每个价格簿版本内每个 SKU 一条基础价格，数量范围为 `[1, +∞)`。保留数量上下界字段是为了后续增加阶梯价，但当前 API 拒绝其他范围。

条目保存单位与换算快照。后续标准单位或 SKU 变更不会改写已经发布的价格版本。

## 5. 发布与重叠规则

发布使用数据库 RPC 原子完成：

1. 按供应商加事务级 advisory lock，串行化同一供应商的价格发布。
2. 校验价格簿仍为草稿且 `row_version` 匹配。
3. 校验至少一个条目，所有 SKU 均启用且属于同一供应商。
4. 校验金额、税率、单位和有效期。
5. 校验默认作用域下，同一 SKU 的已发布有效期不存在重叠。
6. 标记草稿为 `published`，写入发布时间和审计事件。
7. 返回发布版本及可用动作。

有效期按半开区间 `[effective_from, effective_until)` 处理；`effective_until = null` 表示长期有效。相邻区间允许，交叠区间拒绝并返回 `SUPPLIER_PRICE_PERIOD_CONFLICT`。

## 6. API

统一返回 `ResponseHandler.success`，错误使用 `error-factory.ts`。

### 6.1 商品与 SKU

- `GET /supplier-products?page=1&pageSize=20&tenantSupplierId=...`
- `GET /supplier-products/:id`
- `POST /supplier-products/:id`
- `PATCH /supplier-products/:id`
- `POST /supplier-products/:id/activate`
- `POST /supplier-products/:id/deactivate`
- `GET /supplier-products/:id/skus?page=1&pageSize=20`
- `POST /supplier-products/:id/skus/:skuId`
- `PATCH /supplier-products/:id/skus/:skuId`
- `POST /supplier-products/:id/skus/:skuId/activate`
- `POST /supplier-products/:id/skus/:skuId/deactivate`

创建路由使用客户端生成 UUID 和 `Idempotency-Key`；更新和状态命令带 `expected_version`。

### 6.2 默认价格簿

- `GET /supplier-price-lists?page=1&pageSize=20&tenantSupplierId=...`
- `GET /supplier-price-lists/:id`
- `POST /supplier-price-lists/:id`
- `PATCH /supplier-price-lists/:id`
- `GET /supplier-price-lists/:id/items?page=1&pageSize=20`
- `PUT /supplier-price-lists/:id/items/:itemId`
- `DELETE /supplier-price-lists/:id/items/:itemId`
- `POST /supplier-price-lists/:id/publish`
- `POST /supplier-price-lists/:id/new-version`
- `POST /supplier-price-lists/:id/retire`

价格 DTO 只从需要成本价权限的 controller 返回。商品 DTO 不包含价格字段。

### 6.3 稳定错误码

- `SUPPLIER_PRODUCT_NOT_FOUND`
- `SUPPLIER_SKU_NOT_FOUND`
- `SUPPLIER_PRODUCT_STATE_CONFLICT`
- `SUPPLIER_SKU_STATE_CONFLICT`
- `SUPPLIER_CATALOG_REFERENCE_INVALID`
- `SUPPLIER_PRICE_LIST_NOT_FOUND`
- `SUPPLIER_PRICE_LIST_VERSION_CONFLICT`
- `SUPPLIER_PRICE_LIST_INVALID_ACTION`
- `SUPPLIER_PRICE_PERIOD_CONFLICT`
- `SUPPLIER_PROXY_REASON_REQUIRED`
- `SUPPLIER_ORDER_NOT_ELIGIBLE`

版本冲突返回最新 `version/status/actions`，但不返回调用者无权查看的价格字段。

## 7. 分层与查询边界

### controller

- 读取认证上下文、path/query/body 和 `Idempotency-Key`。
- 使用 Zod 校验。
- 调用 service。
- 使用 `ResponseHandler.success`。

### service

- 校验模块、权限、租户合作关系、供应商状态和代录原因。
- 组合商品、SKU、价格状态迁移规则。
- 调 repository / RPC。
- 将数据库冲突映射为稳定业务错误。

### repository

- 直接访问 Supabase / RPC。
- 所有查询由 service 解析出的 `supplier_id` 限定。
- 列表统一 `.range()`，默认 20，最大 100。
- 商品列表不联查价格；价格列表只选择概要字段。
- 详情所需类目、品牌、单位用有界关联查询或单次 RPC 返回，禁止 N+1。

## 8. 并发、幂等与审计

- 创建、发布、新版本、启停命令必须要求 `Idempotency-Key`。
- 草稿编辑和条目写入使用 `expected_version`；条目增删与价格簿版本递增在
  单个 RPC 内原子完成。
- 发布和新版本通过 RPC 原子完成。
- 重复幂等请求返回首次结果，不重复创建版本或审计事件。
- 商品、SKU 和价格命令写入不可变供应商命令事件，事件保存目标、命令、幂等键、前后版本、租户、员工、来源和代录原因。
- 日志不得记录请求头、令牌或完整价格条目集合。

## 9. 数据库安全与性能

- 所有新表启用并强制 RLS。
- `anon`、`authenticated` 无表直访权限；服务端 `service_role` 只获得所需表权限。
- RPC 从 `PUBLIC/anon/authenticated` 撤销，只授予 `service_role`。
- 索引至少覆盖：
  - 商品：`(supplier_id, status, updated_at desc, id desc)`
  - SKU：`(supplier_product_id, status, updated_at desc, id desc)`
  - SKU 编码：`(supplier_id, sku_code)`
  - 价格簿：`(supplier_id, lifecycle_status, effective_from desc, id desc)`
  - 价格条目：`(supplier_price_list_id, supplier_sku_id)`
  - 发布冲突查询：`(supplier_sku_id, supplier_price_list_id)`
- 大表上线前对商品、SKU、价格列表和发布冲突查询执行 `EXPLAIN ANALYZE`。

## 10. Admin 界面

“采购供应”新增“商品与价格”入口：

- 左侧/上方选择合作供应商。
- 商品页展示 SPU，展开或详情区分页展示 SKU。
- 价格页独立展示价格簿版本，不在商品表直接暴露价格。
- 无商品管理权限时保持只读。
- 无成本价权限时不请求价格 API，也不渲染价格入口。
- 所有代录表单要求填写“代录原因”。
- 发布使用确认弹窗，明确生效时间、SKU 数量和发布后不可修改。

首版不为供应商门户复制页面；后续门户可复用纯展示组件和领域校验，但保留独立认证入口。

## 11. 验证

### 11.1 自动化

- domain：状态值、权限码和动作契约。
- schema：分页上限、金额/税率精度、代录原因、有效期。
- service：权限、租户隔离、合作关系、状态迁移、价格字段隔离。
- repository：必要字段、分页 range、供应商过滤、版本冲突。
- migration contract：表、约束、索引、RLS、授权、RPC 原子性和回滚说明。
- Admin：无权限不请求价格、代录原因必填、发布确认和版本冲突恢复。
- 确定性 E2E：创建 SPU/SKU、启用、创建基础价格草稿、发布、创建下一版本。

### 11.2 数据库

- 应用前确认待执行 migration。
- 应用后运行 `supabase migration list`，确认 Local/Remote 对齐。
- 使用只读查询核查表、约束、索引、RLS、函数授权。
- 对关键列表和发布冲突查询运行 `EXPLAIN ANALYZE`。

## 12. 发布与回滚

发布顺序：

1. migration 和共享权限/领域类型。
2. API。
3. Admin。
4. 为指定测试租户启用新入口并执行 smoke。

回滚采用前向 migration：

- 先隐藏 Admin 入口并停止写入。
- 保留已发布价格和审计事实供追溯。
- 若尚无采购订单引用，可在导出核对后删除新增函数、表和权限映射。
- 一旦采购订单开始引用，禁止直接删除商品、SKU 或价格版本，只能停用功能并修复前向兼容。

## 13. 后续演进

1. 在现有价格簿作用域上增加买方等级价和指定租户协议价。
2. 放开数量区间并增加阶梯价重叠约束。
3. 增加供应商门户 auth context，复用同一 service。
4. 采购订单按固定优先级解析有效价格，并保存价格与单位快照。
5. 另建租户销售价格簿，始终与供货价 DTO 隔离。
