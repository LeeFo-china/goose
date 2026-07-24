# 供应商管理 Phase 0 API 交接

日期：2026-07-23

适用仓库：`gooes`

状态：以本文所列 routes、schemas、services、repositories 和 migrations 的当前实现为准

## 1. 范围与责任边界

Phase 0 建立供应商基础主数据、平台准入、资质、服务区域、联系人/地址、租户合作关系、合同、下单资格判断和标准目录。它解决“谁可以合作、由谁维护、当前能否下新单”的基础问题。

本阶段不包含：

- 商品 SPU/SKU、供应商商品上架和租户商品映射。
- 展示价、结算价、等级价、阶梯价或任何成本价接口。
- 项目 BOM、采购建议单、采购订单、库存、发货、收货、差异单。
- 应付、对账、付款申请、退换货、补发和供应商评分。
- 供应商门户或供应商自助账号。
- 租户侧服务区域明细接口；服务区域仍是平台供应商主数据，租户端只读说明。
- DELETE 接口。Phase 0 使用状态字段、暂停、终止或黑名单保留历史。

### Orange 小程序影响

Orange 在 Phase 0 **没有代码变更**，无需新增页面、接口调用、类型或登录处理。`/Users/leefo/Public/work/orange` 本次仅做只读影响核查，未修改、格式化、生成、暂存或提交任何文件。当前 Orange 源码/文档未发现供应商业务模块；后续若开放员工采购下单，必须另开 handoff，按本合同的 `order-eligibility` 结果接入，不能在小程序本地重算准入、资质或合同状态。

## 2. 认证、身份与通用响应

所有接口要求 `Authorization: Bearer <token>`。平台接口要求当前身份为 `platform_admin`；租户接口要求存在当前 `tenant_id`，且服务端始终从认证上下文取租户，不接受请求体或查询参数覆盖租户。

成功响应统一为：

```json
{
  "data": {},
  "message": "success"
}
```

分页响应的 `data` 为：

```json
{
  "list": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

全部列表默认 `page=1&pageSize=20`，`pageSize` 最大为 `100`。页码和每页数量必须是正整数。关键词会 trim，最长 80 字符。事件列表可增加 `command`（最长 120 字符）。

错误响应经过统一错误工厂，稳定字段为 `success=false`、`message`、`code`、可选 `details` 和 `requestId`。客户端应按 `code` 分支，不能匹配中文文案。

## 3. 平台供应商路由

### 3.1 路由与权限

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| GET | `/platform/suppliers` | `platform.supplier.view` | 分页查询平台供应商 |
| POST | `/platform/suppliers` | `platform.supplier.manage` | 创建平台供应商 |
| GET | `/platform/suppliers/:id` | `platform.supplier.view` | 供应商详情 |
| PATCH | `/platform/suppliers/:id` | `platform.supplier.manage` | 修改基本资料 |
| POST | `/platform/suppliers/:id/submit` | `platform.supplier.manage` | 提交准入审核 |
| POST | `/platform/suppliers/:id/approve` | `platform.supplier.review` | 准入通过 |
| POST | `/platform/suppliers/:id/reject` | `platform.supplier.review` | 驳回准入 |
| POST | `/platform/suppliers/:id/suspend` | `platform.supplier.manage` | 暂停运营 |
| POST | `/platform/suppliers/:id/resume` | `platform.supplier.manage` | 恢复运营 |
| POST | `/platform/suppliers/:id/blacklist` | `platform.supplier.blacklist` | 加入平台黑名单 |
| GET | `/platform/supplier-qualification-types` | `platform.supplier.view` | 分页查询资质类型 |
| POST | `/platform/supplier-qualification-types` | `platform.supplier.manage` | 创建资质类型 |
| PATCH | `/platform/supplier-qualification-types/:id` | `platform.supplier.manage` | 修改资质类型 |
| GET | `/platform/suppliers/:id/qualifications` | `platform.supplier.view` | 分页查询供应商资质 |
| POST | `/platform/suppliers/:id/qualifications` | `platform.supplier.manage` | 新增资质材料 |
| PATCH | `/platform/suppliers/:id/qualifications/:qualificationId` | `platform.supplier.manage` | 修改资质材料 |
| POST | `/platform/suppliers/:id/qualifications/:qualificationId/verify` | `platform.supplier.review` | 核验资质 |
| POST | `/platform/suppliers/:id/qualifications/:qualificationId/reject` | `platform.supplier.review` | 驳回资质 |
| GET | `/platform/suppliers/:id/service-regions` | `platform.supplier.view` | 分页查询服务区域 |
| POST | `/platform/suppliers/:id/service-regions` | `platform.supplier.manage` | 新增服务区域 |
| PATCH | `/platform/suppliers/:id/service-regions/:regionId` | `platform.supplier.manage` | 修改服务区域 |
| GET | `/platform/suppliers/:id/addresses` | `platform.supplier.view` | 分页查询地址 |
| POST | `/platform/suppliers/:id/addresses` | `platform.supplier.manage` | 新增地址 |
| PATCH | `/platform/suppliers/:id/addresses/:addressId` | `platform.supplier.manage` | 修改地址 |
| GET | `/platform/suppliers/:id/contacts` | `platform.supplier.view` | 分页查询联系人 |
| POST | `/platform/suppliers/:id/contacts` | `platform.supplier.manage` | 新增联系人 |
| PATCH | `/platform/suppliers/:id/contacts/:contactId` | `platform.supplier.manage` | 修改联系人 |
| GET | `/platform/suppliers/:id/events` | `platform.supplier.view` | 分页查询操作事件 |
| GET | `/platform/tenant-supplier-settings/:tenantId` | `platform.supplier.view` | 查看租户 rollout 配置 |
| PATCH | `/platform/tenant-supplier-settings/:tenantId` | `platform.supplier.manage` | 启停租户模块 |

所有写接口还要求认证上下文同时有 `authUserId` 和 `employeeId`，用于幂等和审计。

### 3.2 查询与写入字段

供应商列表查询支持：

- `keyword`：匹配编码、名称、法定名称、统一社会信用代码。
- `supplier_type`：`manufacturer | brand_agent | distributor | retailer | other`。
- `onboarding_status`：`draft | pending_review | approved | rejected`。
- `operational_status`：`active | suspended | blacklisted`。
- `qualification_health`：`valid | expiring | expired | missing`。

创建供应商：

```json
{
  "code": "SUP-001",
  "name": "晴天建材",
  "legal_name": "晴天建材有限公司",
  "unified_social_credit_code": "可选或 null",
  "supplier_type": "manufacturer"
}
```

创建后固定为 `onboarding_status=draft`、`operational_status=active`、`version=1`。普通 PATCH 必须传正整数 `expected_version`，并至少传一个可修改字段：`code`、`name`、`legal_name`、`unified_social_credit_code`、`supplier_type`。准入和运营状态不允许通过 PATCH 直接修改。

生命周期命令体：

```json
{
  "expected_version": 1,
  "reason": "可选或按动作必填"
}
```

`reject`、`suspend`、`blacklist` 必须填写 `reason`；其他动作可选。`reason` 最长 500 字符。

资质类型字段：

| 字段 | 规则 |
| --- | --- |
| `code` / `name` | 必填，最长 64 / 120 |
| `applicable_supplier_types` | 数组；空数组表示适用于全部供应商类型 |
| `warning_days` | 0..3650，创建默认 30 |
| `is_required` | 创建默认 false |
| `blocks_new_orders` | 创建默认 false；只有必需资质可阻断新订单 |
| `status` | `active | inactive`，默认 active |
| `sort_order` | 整数，默认 100 |
| `expected_version` | 仅 PATCH，正整数 |

资质材料创建字段为 `qualification_type_id`、`document_file_id`，以及可选 `certificate_no`、`valid_from`、`valid_until`。日期格式为 `YYYY-MM-DD`，结束不能早于开始；有效期可为空。创建状态固定为 `pending`。PATCH 加 `expected_version`，至少修改一项。核验使用通用命令体；驳回必须填写原因。当前实现允许使用最新版本把材料核验为 `verified` 或 `rejected`，每次均递增版本。

服务区域字段：`region_code`、`region_level=province|city|district`、`status=active|inactive`（默认 active）、可选 `valid_from/valid_until`。服务端校验行政区划存在、启用且层级一致。

地址字段：`address_type=registered|shipping|return|other`、可选省市区、必填 `region_code` 和 `address_detail`、可空经纬度、`is_default`（默认 false）、`status`（默认 active）。

联系人字段：`contact_type=primary|sales|finance|logistics|after_sales`、`name`、可空 `phone/email`、`is_public`、`is_primary`（均默认 false）、`status`（默认 active）。

租户 rollout 配置体：

```json
{
  "module_enabled": true,
  "require_active_contract_for_new_order": false,
  "expected_version": 0,
  "reason": "停用时必填"
}
```

首次初始化允许 `expected_version=0`；已有配置必须使用当前正整数版本。只有平台可以设置 `module_enabled`。租户管理员不能自行启用模块。

### 3.3 平台响应字段

供应商列表项：`id`、`code`、`name`、`legal_name`、`unified_social_credit_code`、`supplier_type`、两个状态、`qualification_health`、`version`、`created_at`、`updated_at`。

供应商详情再包含：`review_remark`、`reviewed_by_employee_id`、`reviewed_at`、`blacklisted_by_employee_id`、`blacklisted_at`、`blacklist_reason`、创建/更新员工 ID。

子资源响应：

- 资质：材料字段、`verification_status`、核验人/时间、驳回原因和审计字段。
- 服务区域、地址、联系人：上述业务字段、`supplier_id`、版本和审计字段。
- 事件：`resource_type`、`resource_id`、`command`、`from_state`、`to_state`、`reason`、操作者、`idempotency_key`、`result_version`、`created_at`。
- rollout 配置：`tenant_id`、`module_enabled`、`require_active_contract_for_new_order`、启用人/时间、版本和时间戳。

原子创建响应为：

```json
{
  "status": "created",
  "idempotent": false,
  "supplier": {},
  "version": 1
}
```

不同资源键分别为 `qualification_type`、`qualification`、`service_region`、`address`、`contact`。生命周期响应为 `status=updated`，并返回变更后资源、可选变更前快照、`idempotent` 和 `version`。

## 4. 平台供应商状态机

准入状态与运营状态是两个独立维度：

| 动作 | 允许来源 | 目标 |
| --- | --- | --- |
| `submit` | `draft`、`rejected` | `pending_review` |
| `approve` | `pending_review` | `approved` |
| `reject` | `pending_review` | `rejected` |
| `suspend` | operational `active` | `suspended` |
| `resume` | operational `suspended` | `active` |
| `blacklist` | operational `active`、`suspended` | `blacklisted` |

`submit` 和 `approve` 都会在数据库锁内检查该供应商类型适用的全部 active + required 资质；每一类都必须至少有一份当前有效的 `verified` 材料，否则返回 `SUPPLIER_STATE_CONFLICT`，details 中 reason 为 `required_qualification_missing`。`blacklisted` 在 Phase 0 为终态，没有解除黑名单动作。

## 5. 资质健康

只计算 `status=active`、`is_required=true`，且适用于该供应商类型的资质类型。空 `applicable_supplier_types` 表示适用于全部类型。每个必需类型单独计算后，再按 `missing > expired > expiring > valid` 汇总：

- `valid`：存在当前已生效且未过期的 verified 材料，并且无期限或到期日大于 `今天 + warning_days`。
- `expiring`：存在当前有效 verified 材料，但不存在上述长期有效材料。
- `expired`：有 verified 历史材料，且这些材料全部已过期。
- `missing`：没有当前有效材料，也不满足“全部 verified 材料已过期”；包括从未提交、仅 pending/rejected、仅未来生效等情况。
- 没有适用的必需资质类型时，供应商汇总为 `valid`。

同一类型多份材料采用“最佳当前材料”语义：旧的临期材料不会遮蔽新的长期有效材料；另一资质类型的材料也不能遮蔽当前类型缺失。

## 6. 标准目录路由

### 6.1 路由与权限

| 方法 | 路径 | 身份与权限 | 用途 |
| --- | --- | --- | --- |
| GET | `/platform/catalog/categories` | 平台 + `platform.catalog.manage` | 分类列表 |
| POST | `/platform/catalog/categories` | 平台 + `platform.catalog.manage` | 创建分类 |
| PATCH | `/platform/catalog/categories/:id` | 平台 + `platform.catalog.manage` | 修改分类 |
| GET | `/platform/catalog/brands` | 平台 + `platform.catalog.manage` | 品牌列表 |
| POST | `/platform/catalog/brands` | 平台 + `platform.catalog.manage` | 创建品牌 |
| PATCH | `/platform/catalog/brands/:id` | 平台 + `platform.catalog.manage` | 修改品牌 |
| GET | `/platform/catalog/units` | 平台 + `platform.catalog.manage` | 单位列表 |
| POST | `/platform/catalog/units` | 平台 + `platform.catalog.manage` | 创建单位 |
| PATCH | `/platform/catalog/units/:id` | 平台 + `platform.catalog.manage` | 修改单位 |
| GET | `/catalog/categories` | 租户 + `supplier.view` | 只读 active 分类 |
| GET | `/catalog/brands` | 租户 + `supplier.view` | 只读 active 品牌 |
| GET | `/catalog/units` | 租户 + `supplier.view` | 只读 active 单位 |

租户目录读取不依赖供应商模块 rollout，但服务端强制 `status=active`，忽略客户端传入的 inactive 过滤意图。

### 6.2 字段

分类查询支持 `keyword`、`status`、`parent_id`（UUID 或 null）、`level=1..6`。未传 `parent_id` 时当前实现查询根级分类。写入字段为 `parent_id`、`code`、`name`、`level`、`status`、`sort_order`；服务端防止环、自身为父、超过六级、移动非叶子节点及破坏启用父子约束。

品牌查询支持 `keyword`、`status`。写入字段为 `code`、`name`、可空 `legal_name`、可空 `logo_file_id`、`status`、`sort_order`。

单位查询支持 `keyword`、`status`、`base_unit_id`（UUID 或 null）和 `unit_kind=base|derived`。`unit_kind` 与 `base_unit_id` 不能同时出现：`base` 等价于筛选 `base_unit_id IS NULL`，`derived` 等价于筛选 `base_unit_id IS NOT NULL`。写入字段为 `code`、`name`、`symbol`、`base_unit_id`、`conversion_factor`、`status`、`sort_order`。基准单位 `base_unit_id=null` 且换算系数必须为字符串 `"1"`；派生单位只能引用 active 基准单位。换算系数以普通十进制字符串返回，最多 numeric(18,6)，不接受指数表示。

目录列表项统一包含 `id`、业务字段、`status`、`sort_order`、`version`、`created_at`、`updated_at`。单位列表项另带 `base_unit` 只读投影；基准单位为 `null`，派生单位为 `{id, code, name, symbol, status}`。创建返回 `{status, idempotent, category|brand|unit, version}`；PATCH 直接返回更新后记录。创建/PATCH 的单记录 `unit` 不承诺带 `base_unit` 投影，客户端需要展示关联名称时应刷新单位列表。

## 7. 租户供应商路由

### 7.1 路由与权限

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| GET | `/supplier-settings` | `supplier.view` | 获取当前租户设置 |
| PATCH | `/supplier-settings/contract-policy` | `supplier.manage` | 修改合同准入策略 |
| GET | `/suppliers` | `supplier.view` | 分页查询合作关系 |
| GET | `/suppliers/directory` | `supplier.view` | 分页查询可添加平台供应商 |
| POST | `/suppliers` | `supplier.manage` | 建立合作关系 |
| GET | `/suppliers/:id` | `supplier.view` | 合作关系详情 |
| PATCH | `/suppliers/:id` | `supplier.manage` | 修改本租户合作条款 |
| POST | `/suppliers/:id/activate` | `supplier.manage` | 激活合作 |
| POST | `/suppliers/:id/suspend` | `supplier.manage` | 暂停合作 |
| POST | `/suppliers/:id/terminate` | `supplier.manage` | 终止合作 |
| POST | `/suppliers/:id/blacklist` | `supplier.manage` | 加入租户黑名单 |
| GET | `/suppliers/:id/order-eligibility` | `supplier.view` | 计算新订单资格 |
| GET | `/suppliers/:id/contracts` | `supplier.view` | 分页查询合同 |
| POST | `/suppliers/:id/contracts` | `supplier.contract.manage` | 新建合同 |
| PATCH | `/suppliers/:id/contracts/:contractId` | `supplier.contract.manage` | 修改合同 |
| POST | `/suppliers/:id/contracts/:contractId/activate` | `supplier.contract.manage` | 生效合同 |
| POST | `/suppliers/:id/contracts/:contractId/terminate` | `supplier.contract.manage` | 终止合同 |
| GET | `/suppliers/:id/events` | `supplier.view` | 分页查询租户事件 |

除 `/supplier-settings` 的 disabled 响应外，租户供应商资源接口均要求平台已 rollout 当前租户；未启用返回 `SUPPLIER_MODULE_DISABLED`。当前租户只能看到和修改自己 `tenant_id` 下的关系、合同和事件。URL 中属于其他租户的 UUID 视为不存在或状态冲突，不会跨租户回退查询。

### 7.2 查询、写入和响应

合作列表支持 `keyword`、`relationship_status`、`eligible=true|false`。目录支持 `keyword`，只返回平台 `approved + active` 且当前租户尚未建立关系的供应商。

建立关系只提交：

```json
{ "supplier_id": "uuid" }
```

创建后为 `evaluating`、`version=1`。平台供应商主数据对租户只读；租户 PATCH 只能修改：

- `settlement_term_days`：0..3650。
- `credit_limit_minor`：非负安全整数，单位为最小货币单位。
- `invoice_required_before_payment`。
- `default_currency`：三个大写字母。
- `default_tax_inclusive`。
- `tenant_owner_employee_id`：UUID 或 null。
- `started_at`、`ended_at`：可空日期，结束不得早于开始。
- `remark`：可空，最长 500。
- `expected_version`：必填正整数。

合作状态机：

| 动作 | 允许来源 | 目标 |
| --- | --- | --- |
| `activate` | `evaluating`、`suspended` | `active` |
| `suspend` | `active` | `suspended` |
| `terminate` | `evaluating`、`active`、`suspended` | `terminated` |
| `blacklist` | `evaluating`、`active`、`suspended` | `blacklisted` |

后三个动作必须填写原因。`terminated`、`blacklisted` 在 Phase 0 为终态。租户黑名单只修改 `tenant_suppliers`，不会修改平台供应商的运营状态或其他租户关系。

合同策略 PATCH 只接受 `require_active_contract_for_new_order` 和当前 `expected_version`，不能修改 `module_enabled`。

合同创建字段：`contract_no`、`name`、`valid_from`、`valid_until`、`settlement_term_days`、`invoice_required_before_payment`、`document_file_id`。创建后为 `draft`。PATCH 加 `expected_version` 并至少修改一项。

合同状态机：

| 动作 | 允许来源 | 目标 |
| --- | --- | --- |
| `activate` | `draft` | `active` |
| `terminate` | `draft`、`active` | `terminated` |

终止必须填写原因，`terminated` 为终态。

合作关系响应包含租户条款、`supplier` 只读快照、版本与审计字段；列表项另含 `eligibility` 和 `contract_health`。合同与事件均使用标准分页。

## 8. 合同健康与新订单资格

合同健康按检查日计算，只考虑 `lifecycle_status=active`：

- `valid`：存在当前有效且到期日大于检查日 + 30 天的合同。
- `expiring`：不存在上述合同，但存在当前有效且 30 天内到期的合同。
- `expired`：没有当前有效合同，但存在已到期的 active 合同。
- `missing`：其余情况，包括没有合同、只有 draft/terminated、只有未来生效合同。

`GET /suppliers/:id/order-eligibility` 返回：

```json
{
  "eligible": false,
  "blocking_reasons": ["relationship_not_active"],
  "checked_at": "2026-07-23T00:00:00.000Z",
  "tenant_id": "uuid",
  "tenant_supplier_id": "uuid",
  "supplier_id": "uuid",
  "supplier_version": 1,
  "tenant_supplier_version": 1
}
```

`eligible` 仅在 `blocking_reasons` 为空时为 true。稳定阻断原因：

| reason | 含义 |
| --- | --- |
| `module_disabled` | 当前租户模块未启用 |
| `supplier_not_approved` | 平台供应商未准入 |
| `supplier_suspended` | 平台供应商已暂停 |
| `supplier_blacklisted` | 平台供应商已拉黑 |
| `relationship_not_active` | 当前租户合作关系非 active |
| `required_qualification_missing` | 阻断新订单的资质缺失/未当前生效 |
| `required_qualification_expired` | 阻断新订单的 verified 资质已全部过期 |
| `active_contract_required` | 租户策略要求有效合同，但当前没有 |

采购订单创建服务必须在写入前调用后端 `assertCanCreatePurchaseOrder`/同等领域守卫；失败为 `409 SUPPLIER_ORDER_NOT_ELIGIBLE`，`details` 带上述 eligibility。Admin 或小程序不能扫描分页列表后自行判断。

## 9. 幂等与乐观锁

以下接口必须带非空 `Idempotency-Key`，最长 120 字符：

- 所有 POST 创建。
- 所有 POST 生命周期/核验命令。
- 平台 PATCH `/platform/tenant-supplier-settings/:tenantId`。

普通资料 PATCH、合同策略 PATCH 不要求幂等键，但必须带当前 `expected_version`。版本不一致返回 `409 SUPPLIER_VERSION_CONFLICT`，客户端必须刷新最新记录并由用户确认后重试，不能静默覆盖。

幂等作用域为 `(actor_user_id, Idempotency-Key)`，同一操作者不能把一个 key 用于另一资源、另一命令或不同语义请求；冲突返回 `409 SUPPLIER_IDEMPOTENCY_CONFLICT`。完全相同的重放返回第一次写入的资源快照，`idempotent=true`，不会重复写事件或审计。

创建接口的资源 UUID 由服务端每次执行时生成，但生成 ID 不属于幂等指纹。网络重试即使进入 Controller 后生成了新的候选 UUID，只要操作者、key、命令和业务请求字段相同，数据库仍返回第一次创建的原资源；客户端不得依赖第二次生成的候选 UUID。若业务字段不同，必须使用新 key。

## 10. 稳定错误码

| HTTP | code | 客户端处理 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 修正字段、UUID、分页或缺失的幂等键 |
| 401 | `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` | 重新登录 |
| 403 | `FORBIDDEN` | 当前身份或权限不足 |
| 403 | `SUPPLIER_MODULE_DISABLED` | 展示 rollout 停用态，不继续加载列表/目录 |
| 404 | `SUPPLIER_NOT_FOUND` | 平台供应商或其平台子资源不存在 |
| 404 | `TENANT_SUPPLIER_NOT_FOUND` | 当前租户下合作关系不存在 |
| 409 | `SUPPLIER_STATE_CONFLICT` | 刷新并按允许状态/资质前置条件处理 |
| 409 | `TENANT_SUPPLIER_STATE_CONFLICT` | 刷新；可能是状态、归属或唯一性冲突 |
| 409 | `SUPPLIER_VERSION_CONFLICT` | 刷新最新 version 后由用户确认重试 |
| 409 | `SUPPLIER_IDEMPOTENCY_CONFLICT` | 原 key 已用于不同请求，改用新 key |
| 409 | `SUPPLIER_CATALOG_CONFLICT` | 修正编码、目录层级、基准单位或启停关系 |
| 409 | `SUPPLIER_ORDER_NOT_ELIGIBLE` | 读取 details.blocking_reasons，禁止创建新订单 |

数据库或数据映射异常会包装为 `DB_ERROR`；客户端不得将其当成业务成功。

## 11. 对接 smoke 清单

平台 Admin：

- 供应商列表支持分页及准入/运营/资质健康筛选。
- 新增弹窗不出现可直接编辑的准入/运营状态。
- 资质、区域、地址、联系人和事件子列表均分页。
- 标准类目、品牌、单位三个 tab 可切换。
- 租户详情可见“供应商模块” rollout 卡片；停用要求原因。

租户 Admin：

- 未 rollout 时只显示停用态，不请求合作列表或目录。
- rollout 后列表以 `page/pageSize` 分页。
- “添加合作供应商”目录使用 `page=1&pageSize=10`，只建立关系，不创建平台供应商。
- 页面不显示展示价、结算价或成本价。
- 租户只能修改合作条款和合同策略，不能修改平台主数据或启用模块。

Orange：

- Phase 0 不改代码。
- 后续采购接入必须以 `order-eligibility` 和稳定错误码为准，并另行评审金额可见性、角色权限和页面归属。

## 12. 实现与知识来源

当前合同以以下本地源码为准：

- `apps/api/src/controllers/platform-suppliers/index.ts`
- `apps/api/src/controllers/platform-supplier-catalog/index.ts`
- `apps/api/src/controllers/supplier-catalog/index.ts`
- `apps/api/src/controllers/tenant-suppliers/index.ts`
- `apps/api/src/schema/platform-suppliers.ts`
- `apps/api/src/schema/tenant-suppliers.ts`
- `apps/api/src/schema/supplier-catalog.ts`
- `apps/api/src/services/platform-suppliers.ts`
- `apps/api/src/services/tenant-suppliers.ts`
- `apps/api/src/services/supplier-catalog.ts`
- `apps/api/src/repositories/platform-supplier-records.ts`
- `apps/api/src/repositories/tenant-suppliers-mappers.ts`
- `packages/domain/src/supplier.ts`
- `packages/domain/src/permission.ts`
- `supabase/migrations/20260723143000_create_supplier_foundation_commands.sql`

按 GoodCMS RAG 流程查询了供应商 Phase 0 的历史业务约定。当前知识库没有供应商 Phase 0 专属文档，只返回通用的 Orange 只读交接/阶段影响惯例，参考 `gooes/docs/state_machine_migrate/orange-workflow-handoff.md`、`gooes/docs/application_integration_documentation/2026-05-10-phase-5a-miniprogram-impact-note.md` 和 `gooes/docs/application_integration_documentation/2026-05-10-phase-5b-miniprogram-impact-note.md`。若 RAG 与当前代码产生差异，始终以当前仓库实现为准。
