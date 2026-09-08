# 采购用途与可采购分类：微信小程序对接说明

日期：2026-09-08

适用范围：Gooes API / Admin、`@gooes/domain` 与 Orange 微信小程序采购模块。

## 1. 交付结论与边界

Gooes 已将采购表单面向用户的“采购原因”统一为“采购用途”，并在
`@gooes/domain@1.21.1` 提供跨端稳定的用途建议。接口和数据库字段仍为自由文本
`reason`，没有新增 `purpose` 字段，也没有把建议值改成封闭枚举。

本次共享包制品：

- 文件：`.artifacts/domain/gooes-domain-1.21.1.tgz`
- 大小：72,383 bytes
- SHA-256：`fa1de189695e9c6c7f2901efb6a3c28a36e0452468831d7783142d22541655d3`
- 包内容边界：npm 固有的 `package.json`，以及 `files` 白名单中的 `README.md`、`dist/`

Gooes 还增加了采购批次“可采购叶子分类”只读接口。该接口只返回当前租户确实存在
可采购 SKU 的分类，避免小程序使用通用分类接口后出现“分类有数据、商品列表为空”的
假入口。

本次没有修改 `/Users/leefo/Public/work/orange`。Gooes 只交付共享包、后端契约与本文；
依赖安装、小程序代码修改、构建、提交和真机验收均由小程序团队在 orange 仓库完成。
新分类接口依赖 migration
`20260908110000_resolve_supplier_purchase_batch_category_options.sql`，联调前须由后端确认
目标环境 migration 与 API 已部署；本文和本地制品不代表生产环境已经发布。

## 2. 共享采购用途契约

### 2.1 稳定建议

```ts
import { SUPPLIER_PURCHASE_PURPOSE_PRESETS } from '@gooes/domain';

SUPPLIER_PURCHASE_PURPOSE_PRESETS.project;
// readonly ['项目备料', '现场补料']

SUPPLIER_PURCHASE_PURPOSE_PRESETS.warehouse;
// readonly ['仓库补货']
```

| 采购目的地 | `destination_type` | 建议项 |
| --- | --- | --- |
| 项目采购 | `project` | `项目备料`、`现场补料` |
| 仓库采购 | `warehouse` | `仓库补货` |

这些值是排序稳定的 UI 建议，不是 `reason` 的枚举。客户端必须保留自由文本兼容能力。

### 2.2 “其他”与历史草稿

- “其他”仅是客户端打开自定义输入的 UI 入口，不在共享常量中，也不是提交值。
- 选择“其他”后显示单行输入；提交用户填写并 trim 后的具体文本到 `reason`。
- 不要向后端提交 `purpose`、`purpose_code` 或字面值“其他”来代替真实用途。
- 加载旧草稿或详情时，如果 `reason` 不在当前建议中，自动进入自定义状态并原样回显；
  不清空、不映射、不强制改写历史自由文本。
- `reason` 仍必填，trim 后 1–500 字；`remark` 仍为选填自由文本。
- 页面标签、占位与校验提示统一使用“采购用途”，但请求 JSON 继续使用 `reason`。

推荐的纯 UI 适配方式：

```ts
import { SUPPLIER_PURCHASE_PURPOSE_PRESETS } from '@gooes/domain';

type DestinationType = 'project' | 'warehouse';

export const getPurposeOptions = (destinationType: DestinationType) => [
  ...SUPPLIER_PURCHASE_PURPOSE_PRESETS[destinationType],
  '其他' as const,
];

export const isCustomPurpose = (
  destinationType: DestinationType,
  reason: string,
) =>
  Boolean(reason.trim()) &&
  !SUPPLIER_PURCHASE_PURPOSE_PRESETS[destinationType].some(
    (preset) => preset === reason.trim(),
  );
```

## 3. 保存接口保持不变

小程序继续复用已有采购批次接口：

```http
POST /supplier-purchase-batches/:id/save-draft
Authorization: Bearer <tenant-employee-token>
Idempotency-Key: <operation-uuid>
Content-Type: application/json
```

项目采购示例：

```json
{
  "destination_type": "project",
  "project_id": "project-uuid",
  "warehouse_id": null,
  "expected_version": 0,
  "reason": "现场补料",
  "expected_delivery_date": "2026-09-15",
  "remark": null,
  "items": [
    {
      "supplier_sku_id": "supplier-sku-uuid",
      "cost_category_id": "cost-category-uuid",
      "quantity": "10"
    }
  ]
}
```

仓库补货示例：

```json
{
  "destination_type": "warehouse",
  "project_id": null,
  "warehouse_id": "warehouse-uuid",
  "expected_version": 3,
  "reason": "仓库补货",
  "expected_delivery_date": null,
  "remark": "到货后放入一号库位",
  "items": [
    {
      "supplier_sku_id": "supplier-sku-uuid",
      "cost_category_id": "cost-category-uuid",
      "quantity": "20"
    }
  ]
}
```

仍须保持以下既有边界：

- 新建批次 ID 由客户端预生成 UUID，首存 `expected_version=0`；后续使用响应最新版本。
- 同一操作意图只生成一个 `Idempotency-Key`；超时或结果未知时以相同 body、版本和 key 重试。
- 成功后刷新详情；刷新失败只重试 GET，不重复提交写命令。
- 409 版本冲突先刷新并让用户重新确认；新的操作意图使用新 key 和新版本。
- 商品顺序、数量字符串、成本分类、预计到货日期和备注规则保持不变。
- 商品价格、供应商、税额和合计继续由服务端校验与计算，客户端不得作为事实回传。
- 权限、项目/仓库范围、审批、自审限制和服务端 actions 均保持不变。

采购申请 `POST /supplier-purchase-requisitions/:id/save-draft` 同样继续发送 `reason`，不发送
`purpose`。采购申请当前是项目场景，使用 `project` 建议；其项目、单供应商、版本、幂等、
明细顺序与审批契约均不变。

## 4. 新增可采购分类只读接口

```http
GET /supplier-purchase-batch-category-options?page=1&pageSize=20&keyword=主材
Authorization: Bearer <tenant-employee-token>
```

### 4.1 请求、权限与分页

- 身份：租户员工 Bearer token；租户 ID 从会话读取，客户端不能传 `tenant_id`。
- 权限：`supplier.purchase-requisition.manage`，且租户供应商模块必须启用。
- Query：`page` 默认 1；`pageSize` 默认 20、最大 100；`keyword` 可选，trim 后最长 80 字。
- 必须按服务端分页增量加载，筛选或关键词变化时回到第 1 页并废弃旧请求结果。
- 此接口只供分类筛选。创建分类、品牌等资料维护仍使用原有目录管理接口。

成功响应：

```json
{
  "message": "success",
  "data": {
    "list": [
      {
        "id": "category-uuid",
        "code": "CAT-001",
        "name": "主材",
        "full_name": "装修材料 / 主材",
        "status": "active"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

列表只包含 active 叶子分类，且至少有一条满足当前采购准入、合作关系、合同、品牌、单位、
SKU、唯一有效供应商价格及租户/平台归属边界的商品。小程序只调用 HTTP 接口，不得直连
`resolve_supplier_purchase_batch_category_options` RPC；RPC 为 `SECURITY INVOKER`，仅授权
后端 `service_role`。

客户端展示优先用 `full_name`，空值时回退 `name`；选择后把 `id` 作为既有
`GET /supplier-purchase-batch-catalog` 的 `categoryId`。该商品目录仍须传目标信息并分页：

```http
GET /supplier-purchase-batch-catalog?destinationType=warehouse&warehouseId=<uuid>&categoryId=<uuid>&page=1&pageSize=20
```

主要错误处理：

| HTTP / code | 小程序处理 |
| --- | --- |
| 400 `VALIDATION_ERROR` | 显示筛选参数错误，不自动重试 |
| 401 | 进入既有员工会话恢复流程 |
| 403 `FORBIDDEN` | 隐藏/禁用采购编辑入口，不切换通用分类接口绕过 |
| 409 `SUPPLIER_MODULE_DISABLED` | 提示管理员开启供应商模块 |
| 5xx / 网络异常 | 保留当前选择并提供重试；不能把失败当成空分类 |

## 5. Orange 适配位置与步骤

以下基于 2026-09-08 对 orange `main@b428d1cf` 的只读核对，实施时由小程序团队复核
最新分支：

1. `package.json` 当前仍指向 `gooes-domain-1.21.0.tgz`。校验制品 SHA 后升级为
   `@gooes/domain@1.21.1` 的交付 tarball，并更新锁文件。
2. `src/packageProcurement/pages/batch-edit/components/BatchTextFields.tsx` 删除本地
   `REASON_OPTIONS` 和仓库用途硬编码，改为导入
   `SUPPLIER_PURCHASE_PURPOSE_PRESETS`；标签、空态、输入提示改成“采购用途”。
3. 保留这个组件现有的自定义输入逻辑，但“其他”只负责打开输入；未知历史 `reason`
   必须自动按自定义值回显。
4. `src/packageProcurement/pages/batch-edit/useBatchEdit.ts` 将
   “请选择或填写采购原因”改成“请选择或填写采购用途”；不要改版本、pending command、
   草稿恢复和同 key 重试逻辑。
5. `src/packageProcurement/destination.ts` 继续 trim 后发送 `reason`。切换目的地时继续按
   现有规则清空已选商品；若保留旧用途，只有仍属于新目的地建议时才可显示为建议，否则
   必须按自定义文本回显，不能静默改值。
6. `src/services/supplier_procurement.ts` 新增单独的批次可采购分类 loader，调用
   `/supplier-purchase-batch-category-options`。不要直接把现有 `listCategories` 全局换掉，
   因为创建分类/品牌页面仍需要通用目录接口。
7. `src/packageProcurement/pages/catalog/components/CatalogCategories.tsx` 与
   `CatalogFilterSheet.tsx` 的商品筛选分类改用新 loader，展示 `full_name || name`，保留
   20 条分页、加载更多、错误重试和竞态隔离。
8. 为共享建议、旧自由文本、项目/仓库切换、分类分页和保存请求补单测；再执行小程序构建、
   开发接口联调和真机验收。Gooes 不代替 orange 团队提交这些变动。

安装前先核对：

```bash
shasum -a 256 /path/to/gooes-domain-1.21.1.tgz
```

应得到：

```text
fa1de189695e9c6c7f2901efb6a3c28a36e0452468831d7783142d22541655d3
```

然后由 orange 团队用仓库既有包管理方式安装该本地 tarball，并提交 `package.json` 与锁文件。

## 6. 完整验收清单

### 共享包与静态检查

- [ ] 安装的是 `@gooes/domain@1.21.1`，制品文件名和 SHA-256 与本文一致。
- [ ] TypeScript 可从包根导入 `SUPPLIER_PURCHASE_PURPOSE_PRESETS`。
- [ ] project 精确为“项目备料、现场补料”，warehouse 精确为“仓库补货”，共享常量不含“其他”。
- [ ] orange 中不再维护另一套采购用途数组，构建和类型检查通过。

### 采购用途交互

- [ ] 项目采购只展示 project 建议，仓库采购只展示 warehouse 建议。
- [ ] 页面所有面向用户的“采购原因”改为“采购用途”。
- [ ] 选择建议后，保存 body 的 `reason` 为对应中文文本，没有 `purpose` 字段。
- [ ] “其他”打开单行输入，空值不能保存；填写后提交具体自由文本而不是“其他”。
- [ ] 历史非建议 `reason` 原样回显、可继续保存，不被清空或强制迁移。
- [ ] 切换项目/仓库后不会把旧目的地的建议误标为新目的地建议。
- [ ] remark、预计到货日期、已选商品与原草稿恢复行为没有退化。

### 分类与商品目录

- [ ] 分类请求使用 `/supplier-purchase-batch-category-options`，不是通用 `/catalog/categories`。
- [ ] 分类首屏 `page=1&pageSize=20`，可连续加载至 `totalPages`，不会一次拉取全量。
- [ ] 搜索 trim 后发出，搜索/清除/切换筛选均回到第 1 页，旧响应不能覆盖新结果。
- [ ] 展示 `full_name || name`，选择后以 `categoryId` 重新请求批次商品目录。
- [ ] 每个返回分类至少能查到当前可采购商品；无匹配时显示真实空态。
- [ ] 分类接口失败显示错误与重试，不降级到通用分类制造空商品入口。
- [ ] 新建分类/品牌页面仍使用原通用目录接口，未被批次筛选改动影响。

### 命令、权限与可靠性

- [ ] 首次保存版本为 0，后续命令使用响应最新 version。
- [ ] 双击只发送一次；超时重试复用同 body、version、Idempotency-Key。
- [ ] 写成功但刷新失败只重试 GET；409 先刷新再由用户确认新意图。
- [ ] 商品顺序、数量字符串、成本分类与服务端计价边界保持不变。
- [ ] 无 manage 权限、非租户员工和供应商模块关闭时均不能读取筛选或提交采购。
- [ ] 项目范围、仓库权限、审批 actions、自审限制和错误码处理保持原逻辑。
- [ ] 开发接口联调通过后完成 iOS/Android 微信真机的项目采购、仓库补货、旧草稿回显、
      弱网重试与 409 冲突验收。

## 7. 可直接转发给小程序团队

> 请把采购编辑页面向用户的“采购原因”统一改成“采购用途”，并升级使用
> `@gooes/domain@1.21.1` 的 `SUPPLIER_PURCHASE_PURPOSE_PRESETS`：项目采购显示“项目备料、
> 现场补料”，仓库采购显示“仓库补货”。“其他”只作为小程序端打开自定义输入的入口，
> 不放进共享常量；接口仍提交原来的自由文本 `reason`，不要新增 `purpose` 字段。旧草稿中
> 不在建议列表里的 `reason` 必须按自定义值原样回显。批次商品分类请新增独立 loader 调用
> `GET /supplier-purchase-batch-category-options?page=1&pageSize=20`，展示
> `full_name || name`，选中后把 id 传给现有商品目录的 `categoryId`；不要把通用
> `/catalog/categories` 全局替换掉。版本、幂等键、商品顺序、权限、服务端计价和审批逻辑
> 全部保持不变。制品 `gooes-domain-1.21.1.tgz` 的 SHA-256 是
> `fa1de189695e9c6c7f2901efb6a3c28a36e0452468831d7783142d22541655d3`。请由小程序团队在
> orange 自行安装、改代码、提交，并完成开发联调和微信真机验收；Gooes 没有修改 orange。
