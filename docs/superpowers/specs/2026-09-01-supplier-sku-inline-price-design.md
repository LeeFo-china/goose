# 租户私有 SKU 保存并立即生效价格设计

**日期：** 2026-09-01  
**状态：** 待实施  
**范围：** 租户 Admin 私有供应商商品、SKU、默认基础供货价

## 1. 背景与问题

当前“商品与价格”页面把 SKU 主数据和基础供货价拆成两个操作区：用户先创建
SKU，再进入“基础供货价”创建草稿、添加价格条目并发布。该拆分符合价格版本、
权限隔离和历史追溯要求，但对租户代录私有供应商商品而言步骤过多，且容易产生
“SKU 已存在但没有有效价格、仍不可采购”的中间状态。

SKU 表单目前只提交名称、规格、型号、采购单位和管理属性。价格属于租户与供应商
合作关系下的价格簿条目，而不是 SKU 固有字段；已发布价格又必须保持不可变。因此
本次不在 `supplier_skus` 增加价格列，也不允许前端依次调用多个写接口拼接业务
事务，而是在一个用户表单下组合两个领域能力。

仓库已经存在“商品 + SKU + 价格”原子创建命令，可复用其权限、价格版本、发布、
审计、幂等和回放模式，为既有商品增加“SKU + 价格”原子保存能力。

## 2. 目标与非目标

### 2.1 目标

1. 新建租户私有 SKU 时同时填写基础供货价，一次保存即可参与后续采购。
2. 编辑 SKU 时展示当前有效价格，并可在同一表单中调整价格。
3. 价格保存后立即生效；历史采购申请、采购单和价格版本不被改写。
4. SKU 与价格写入保持同一事务，禁止留下半完成状态。
5. 保持商品权限与成本价权限独立，不能因为可编辑 SKU 就泄露采购成本。
6. 保留“基础供货价”页作为批量调价、版本历史和高级操作入口。

### 2.2 非目标

- 不把供货价改成 SKU 主表字段。
- 不修改平台共享 SKU 的所有权和租户独立定价规则。
- 不增加销售价、阶梯价、客户等级价或合同协议价。
- 不取消价格簿版本、发布审计和采购价格快照。
- 不为供应商门户复制一套表单。

## 3. 核心决策

### 3.1 保存即生效

租户私有 SKU 的主流程按钮为“保存并生效”。服务端在一个数据库事务内完成：

1. 创建或更新 SKU；
2. 按状态规则启用 SKU 和所属商品；
3. 创建默认价格簿的下一版本；
4. 复制当前版本的其它 SKU 价格条目；
5. 写入本次 SKU 的基础供货价；
6. 退役被替代版本并发布新版本；
7. 写入聚合审计事件。

任一步骤失败时整个事务回滚。前端不会看到 SKU 已保存但价格未生效的状态。

新价格只影响保存后新建或重新计价的采购草稿。已提交采购申请、采购单及其价格
快照继续引用原价格版本，不因本次修改而变化。

立即生效时间使用数据库事务时间，不接受客户端时间。若价格系列已经存在未来
计划版本，本次新版本的 `effective_until` 自动取最早未来版本的
`effective_from`，不得退役、覆盖或延后未来计划版本；到达计划时间后仍按原计划
切换。若当前时间已经落入不可安全切分的重叠区间，则返回价格周期冲突，不用
覆盖计划的方式兜底。

### 3.2 默认未税

- “含税价格”开关默认关闭。
- 开关关闭时，用户录入金额解释为未税单价。
- 开关开启时，用户录入金额解释为含税单价。
- 新建 SKU 的税率优先沿用该供应商最近一个有效基础价格的税率；没有历史价格时
  默认 `13%`。
- 编辑 SKU 时优先使用该 SKU 当前有效价格的税率和含税标记。
- 币种固定为 `CNY`，最低数量固定为 `1`，不展示给普通用户填写。
- 金额和税率在前后端都使用十进制字符串传输，禁止经过 JavaScript 浮点运算后
  再提交。

### 3.3 价格仍属于价格簿

表单合并不改变领域所有权：

- SKU 继续描述供应商商品规格、单位和履约属性。
- 基础供货价继续属于当前租户、合作关系、供应商和价格簿版本。
- 发布版本不可修改；调价必须创建下一版本。
- 平台共享 SKU 不携带平台统一采购价，各租户仍维护自己的价格事实。

## 4. Admin 交互设计

### 4.1 适用范围

合并表单只用于租户侧、当前租户拥有的私有商品和 SKU，并要求合作关系为
`active`。平台 Admin 维护共享 SKU 时不展示租户价格字段；租户查看平台共享 SKU
时也不能编辑其主数据。

### 4.2 表单结构

现有 SKU 基础信息和结构化规格保持不变。在管理属性之后增加一个不套卡片的
“采购价格”区段，以分隔线区分：

1. `基础供货价`：必填金额输入，后缀展示“元 / {采购单位}”。
2. `含税价格`：Switch，默认关闭。
3. `税率`：Select 提供 `0%`、`1%`、`3%`、`6%`、`9%`、`13%`；历史数据为
   其它合法税率时增加“当前税率”选项，避免打开表单后丢值。

币种、最低数量、价格簿编码、价格簿名称、生效时间和版本号由系统维护，不要求
租户填写。表单不得展示数据库 ID、内部价格条目 ID 或技术版本字段。

### 4.3 新建 SKU

- 价格为必填项。
- `含税价格=false`。
- 税率使用供应商最近有效值，没有历史值时为 `13%`。
- 主按钮为“保存并生效”。
- 成功后关闭弹窗，刷新当前 SKU 内容区和可采购数据；提示“SKU 与供货价已生效”。
- SKU 以系统编码创建并启用。所属商品为草稿时一并启用；商品已停用时拒绝保存，
  不隐式恢复已停用商品。

### 4.4 编辑 SKU

- 打开表单时通过独立价格读取接口加载当前有效价格，不把成本价加入普通 SKU
  列表 DTO。
- 当前有效价格预填到表单。
- SKU 字段变化但价格未变化时，只更新 SKU，不创建空的价格版本。
- 价格发生变化时，原子创建并发布下一价格版本。
- SKU 为草稿时，填写价格并保存会启用 SKU。
- SKU 已停用时不隐式恢复。表单可编辑主数据，但价格区只读，主按钮为“保存
  修改”；用户需要先通过既有“启用 SKU”动作恢复后才能调价。
- 价格发生并发变化时不覆盖新版本，保留用户输入并提示刷新当前价格后重试。

### 4.5 高级价格页

“基础供货价”Tab 继续存在，用于：

- 查看价格版本和生效历史；
- 一次调整多个 SKU；
- 创建计划生效版本；
- 处理高级版本冲突和发布确认。

普通 SKU 表单只负责当前默认价格立即生效，不承载计划调价或批量调价。

## 5. 权限与数据隔离

### 5.1 前端可见性

- 同时具有 `supplier.product.manage`、`supplier.cost-price.view` 和
  `supplier.cost-price.manage`：使用合并表单。
- 只有 `supplier.product.manage`：保留 SKU 主数据表单，不请求或展示价格；新建
  SKU 保持草稿，不能通过该入口直接变为可采购。
- 只有 `supplier.cost-price.view`：可以在价格页查看，无权编辑 SKU 或价格。
- 同时具有 `supplier.cost-price.view` 和 `supplier.cost-price.manage`、但没有商品管理
  权限：继续通过价格页维护已有可见 SKU，无权修改 SKU 主数据。
- 具有 `supplier.cost-price.manage` 但缺少 `supplier.cost-price.view`：不展示价格
  UI，需补齐读取权限后才能操作。
- 无 `supplier.cost-price.view`：浏览器不得发起任何成本价读取请求。

### 5.2 后端校验

复合写接口必须同时校验两项 manage 权限，并从认证上下文取得 tenant、employee
和 auth user。服务端还必须校验：

- 供应商模块已启用；
- 合作关系属于当前租户且状态为 `active`；
- supplier、product、SKU 和 price list 属于同一租户边界；
- 商品和 SKU 为租户私有，不能借此修改平台共享主数据；
- 当前操作人仍为有效员工；
- 不接受客户端提供 tenant ID、supplier ID、SKU 编码或价格簿技术字段。

读取当前价格需要 `supplier.cost-price.view`；普通 SKU DTO 保持不包含价格字段。

## 6. API 契约

在不改变现有 SKU CRUD 的前提下新增复合接口：

```http
GET /supplier-products/:productId/purchasable-skus/price-defaults
GET /supplier-products/:productId/purchasable-skus/:skuId/price
POST /supplier-products/:productId/purchasable-skus/:skuId
PATCH /supplier-products/:productId/purchasable-skus/:skuId
```

租户合作关系继续使用现有 `tenantSupplierId` 查询参数。`price-defaults` 只返回新建
表单所需的推荐税率、`tax_inclusive=false` 和采购币种，不返回其它 SKU 价格。
单个 SKU 的 `price` 接口返回当前有效价格、当前价格簿 ID/版本及推荐默认税率；
不存在有效价格时返回 `current_price=null`，而不是 `404`。

新建请求示例：

```json
{
  "sku": {
    "name": "净味乳胶漆 18L",
    "purchase_unit_id": "uuid",
    "specification": "18L",
    "model": null,
    "batch_managed": false,
    "color_managed": false,
    "serial_managed": false,
    "spec_values": {}
  },
  "price": {
    "unit_price": "328.00",
    "tax_rate": "0.13",
    "tax_inclusive": false
  }
}
```

编辑请求额外提交：

```json
{
  "sku": {
    "expected_version": 3
  },
  "price": {
    "unit_price": "318.00",
    "tax_rate": "0.13",
    "tax_inclusive": false,
    "expected_price_list_id": "uuid",
    "expected_price_list_version": 5
  }
}
```

实际更新 Schema 要求 `sku.expected_version`，并要求“至少一个可更新 SKU 字段”
或“价格相对当前版本发生变化”两者至少满足一个；请求始终携带完整规范化价格
快照。服务端对比当前有效价格；规范化后完全相同时不创建新价格版本。

所有写接口要求 `Idempotency-Key`。响应返回 SKU、当前价格概要、是否创建价格
版本及可执行动作，但不返回其它 SKU 的价格集合。

## 7. 后端分层与事务

### 7.1 Controller

- 解析 path、query、body 和 `Idempotency-Key`。
- 使用 Zod 校验 UUID、金额、税率、未知字段和 expected version。
- 调用 service，并通过 `ResponseHandler.success` 返回。
- 不直接访问 Supabase，不编排多个写操作。

### 7.2 Service

- 组合商品管理和成本价管理权限。
- 解析租户供应商合作关系与资源所有权。
- 生成系统 SKU 编码和服务端受控 ID。
- 调用 repository 的单个复合 RPC。
- 将 RPC 状态映射为 `error-factory.ts` 稳定错误。

### 7.3 Repository

- 只负责调用复合 RPC 和验证响应 envelope。
- 数据库错误必须使用 `Errors.dbError()` 包装。
- 禁止 repository 先写 SKU 再单独写价格。

### 7.4 Migration 与复合 RPC

通过 migration 新增 `command_supplier_purchasable_sku_v1`，复用既有
`command_supplier_sku_v3`、`command_supplier_price_list_v2` 和
`command_supplier_price_item_v2`。事务顺序固定为：

1. 在加锁前完成 JSON key、类型、数值范围和基础 UUID 校验；
2. 按父幂等键加 advisory transaction lock，先处理成功回放或冲突；
3. 锁定 tenant supplier、目标商品、目标 SKU 和默认价格系列；
4. 创建或更新 SKU，并按规则启用；
5. 解析当前已发布默认价格版本和最早未来计划版本；
6. 价格变化时以集合 SQL 复制上一版本条目，禁止逐条 N+1；
7. 以数据库事务时间设置新版本开始时间；存在未来计划时把新版本结束时间设置为
   最早未来版本开始时间；
8. upsert 目标 SKU 价格，只退役被当前版本替代的来源版本，不改变未来计划版本，
   然后发布新版本；
9. 重新解析目标 SKU 的当前可采购事实，确认 SKU、单位和价格一致；
10. 写入父命令审计 envelope 并返回。

RPC 为 `SECURITY DEFINER`、固定 `search_path`，只授予 `service_role` 执行权。
所有表结构、函数、权限和索引变化都必须在同一受控 migration 中声明，并给出
forward-only 回滚说明。

## 8. 并发、幂等与错误

### 8.1 并发与幂等

- 相同 auth user、幂等键和请求指纹必须返回同一结果。
- 相同幂等键但不同请求指纹返回 `SUPPLIER_IDEMPOTENCY_CONFLICT`。
- SKU 使用 `expected_version` 防止覆盖并发主数据修改。
- 价格使用当前 price list ID 和 row version 防止覆盖并发调价。
- 同一供应商默认价格系列串行发布，避免两个 SKU 同时保存导致版本交叠。
- 当前版本和未来计划版本在同一锁内读取，防止检查之后又插入重叠计划。
- 发布后再次解析当前价格，确保响应和采购解析器读取的是同一版本。

### 8.2 稳定错误

优先复用现有错误码：

- `SUPPLIER_SKU_STATE_CONFLICT`
- `SUPPLIER_PRICE_LIST_VERSION_CONFLICT`
- `SUPPLIER_PRICE_PERIOD_CONFLICT`
- `SUPPLIER_ORDER_NOT_ELIGIBLE`
- `SUPPLIER_IDEMPOTENCY_CONFLICT`
- `FORBIDDEN`

仅为无法归入现有语义的复合命令 envelope 增加
`SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED`。错误信息不得返回成本价集合、SQL、令牌或
其它租户资源标识。

## 9. 性能边界

- SKU 列表继续分页，不为了展示价格联查整张价格表。
- 编辑弹窗只读取目标 SKU 当前价格；新建弹窗只读取一个供应商级推荐税率。
- 复制上一价格版本使用单条集合插入，不逐 SKU 调 RPC。
- migration 应确认默认价格解析和版本复制所需索引已存在；缺失索引通过同一
  migration 增加。
- 在开发库使用真实规模脱敏供应商执行 `EXPLAIN ANALYZE`，验证当前价格解析、
  版本复制和目标 SKU upsert。
- 不为该功能引入缓存、队列、Redis 或新依赖。

## 10. 兼容与发布

- 原 SKU CRUD 和独立价格页接口保持兼容，现有调用方无需同步升级。
- 旧 SKU 没有有效价格时，编辑弹窗显示空价格并要求填写后才能“保存并生效”。
- 已停用 SKU 继续遵守显式启用规则，不因编辑名称或规格被恢复。
- 复合接口先发布 API 和 migration，再灰度 Admin；旧 Admin 在灰度期间仍使用原
  接口。
- Admin 灰度稳定后，租户私有 SKU 默认进入合并表单；高级价格页不下线。
- 本次不要求微信或抖音小程序改动，它们继续读取服务端解析后的可采购事实。

## 11. 验证与验收

### 11.1 自动化测试

- Schema：金额小数、正数、税率范围、默认未税、未知字段和 UUID。
- Controller：路径、权限上下文、幂等键和 `ResponseHandler.success`。
- Service：双权限、租户私有边界、系统编码、decimal string 和错误映射。
- Repository：RPC 参数、成功 envelope、异常包装和敏感数据拒绝。
- Migration contract：锁序、子命令顺序、版本复制、发布、回放和 grant/revoke。
- Admin：新建默认未税、编辑预填、价格未变不发新版本、无价格权限不请求价格。
- Admin：存在未来计划价格时展示“本次价格有效至计划版本生效前”，不要求用户
  手工填写结束时间。
- E2E：创建、编辑调价、并发冲突恢复、停用 SKU 和产品停用边界。

### 11.2 数据库与接口 Smoke

1. 新建 SKU 与未税价后，SKU、商品和价格立即可被采购解析器命中。
2. 修改价格后产生下一发布版本，旧版本和已提交采购快照不变。
3. 仅修改 SKU 名称不产生价格版本。
4. 重放相同幂等请求不重复创建 SKU 或价格版本。
5. 两个并发调价只有一个按旧 expected version 成功，另一个稳定冲突。
6. 已有未来计划版本时，即时版本只生效至该计划开始时间，未来计划保持不变。
7. 无成本价权限不能读取或写入价格；无商品权限不能借价格接口修改 SKU。
8. 平台共享 SKU、其它租户 SKU 和非 active 合作关系均被拒绝。
9. 开发环境 migration Local/Remote 对齐，接口和采购解析 smoke 通过后才能部署
   生产。

## 12. 验收标准

- 租户管理员新建私有 SKU 时只需一个表单和一次“保存并生效”。
- “含税价格”默认关闭，服务端保存 `tax_inclusive=false`。
- 编辑有效 SKU 可以在同一表单调整价格并立即影响后续新采购。
- 任意失败不会留下 SKU、价格草稿或发布版本的半完成数据。
- 历史采购价格和已发布价格版本保持可追溯且不可变。
- 无成本价权限的用户看不到价格，也不会产生价格 API 请求。
- 价格高级页继续支持批量、计划和历史操作。
