# 采购单履约闭环小程序对接交接

**日期：** 2026-09-04
**后端仓库：** `/Users/leefo/Public/work/gooes`
**小程序仓库：** `/Users/leefo/Public/work/orange`（本次只读核查，未修改）
**适用端：** 微信小程序员工态采购模块
**结论：** 采购批次审批通过后，采购链路不应停在“生成采购单”。建议先接入现有采购单详情与履约接口，再分阶段补供应商分享、PDF/Excel 导出和差异处理闭环。

## 1. 当前状态

### 1.1 后端已经具备的能力

Gooes API 当前已经支持采购单和基础履约：

| 能力 | 当前状态 |
| --- | --- |
| 采购批次审批通过后按供应商生成采购单 | 已有 |
| 采购单详情 | 已有 |
| 采购单明细分页 | 已有 |
| 采购单履约详情 | 已有 |
| 员工代录供应商确认 | 已有 |
| 发货登记 | 已有 |
| 收货登记 | 已有 |
| 收货接受数量、拒收数量、差异原因 | 已有 |
| Admin 侧采购履约面板 | 已有 |

对应代码：

- `apps/api/src/controllers/supplier-purchase-orders/index.ts`
- `apps/api/src/schema/supplier-purchase-orders.ts`
- `apps/api/src/services/supplier-purchase-fulfillments.ts`
- `apps/api/src/repositories/supplier-purchase-fulfillment-records.ts`
- `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-*`

### 1.2 当前缺口

当前还没有完整支持：

| 能力 | 当前状态 | 建议阶段 |
| --- | --- | --- |
| 小程序采购单详情页 | 小程序未接 | 第一阶段 |
| 小程序履约登记 | 小程序未接 | 第一阶段 |
| 供应商免登录查看链接 | 后端未实现 | 第二阶段 |
| 供应商确认收到采购单 | 后端未实现供应商端动作 | 第二阶段或第四阶段 |
| PDF 导出 | 后端未实现 | 第三阶段 |
| Excel 导出 | 后端未实现 | 第三阶段 |
| 批次维度 ZIP / 多 sheet 导出 | 后端未实现 | 第三阶段 |
| 异常照片 | 后端未实现 | 第四阶段 |
| 补货、退货、关闭剩余、超收审批 | 后端未实现 | 第四阶段 |

## 2. 推荐产品链路

完整链路建议定义为：

```text
采购批次审批通过
→ 后端按供应商生成采购单
→ 员工查看采购单详情
→ 员工发送/交付给供应商
→ 供应商查看或确认收到
→ 发货登记
→ 收货核对
→ 差异记录
→ 差异处理闭环
→ PDF/Excel 导出归档
```

但落地时不建议一次性做完。当前最优先的是让小程序先接上已经存在的采购单详情和基础履约接口。

## 3. 第一阶段：小程序先接采购单详情与履约登记

### 3.1 小程序页面改造

Orange 当前采购批次详情页已有“采购单”tab，但只展示采购单卡片，没有进入采购单详情。

建议新增：

```text
src/packageProcurement/pages/order-detail/index.tsx
src/packageProcurement/pages/order-detail/index.config.ts
```

并修改：

```text
src/packageProcurement/pages/batch-detail/index.tsx
src/services/supplier_procurement.ts
src/types/api/supplier_procurement.d.ts
src/app.config.ts
```

页面入口：

- 批次详情 `orders` tab 中，点击采购单卡片进入采购单详情。
- 跳转参数使用采购单 ID：`/packageProcurement/pages/order-detail/index?id=<purchaseOrderId>`。

### 3.2 采购单详情页展示内容

建议展示：

- 采购单号
- 采购单状态
- 供应商名称
- 项目名称
- 预计到货日期
- 备注
- 商品明细
- 采购金额
- 履约状态
- 发货记录
- 收货记录

商品明细以服务端返回快照为准，小程序不能重新计算正式金额。

### 3.3 第一阶段使用现有接口

#### 采购单详情

```http
GET /supplier-purchase-orders/:id
```

权限：

- `supplier.purchase-order.view`
- 后端同时校验项目数据范围。

#### 采购单明细

```http
GET /supplier-purchase-orders/:id/items?page=1&pageSize=100
```

说明：

- 每张采购单明细上限按现有后端规则最大 100 行。
- 小程序详情页可以一次加载 100 行；如果后续超过 100，必须分页加载。

#### 采购单履约详情

```http
GET /supplier-purchase-orders/:id/fulfillment
```

返回核心字段：

```ts
{
  fulfillment: {
    id: string;
    status:
      | "confirmed"
      | "partially_shipped"
      | "shipped"
      | "partially_received"
      | "received"
      | "received_with_variance"
      | "cancelled";
    version: number;
    confirmed_at: string;
    confirmation_remark: string | null;
  } | null;
  item_fulfillments: Array<{
    supplier_purchase_order_item_id: string;
    ordered_quantity: string;
    shipped_quantity: string;
    received_quantity: string;
    accepted_quantity: string;
    rejected_quantity: string;
    accepted_total_amount: string;
  }>;
}
```

#### 发货记录

```http
GET /supplier-purchase-orders/:id/shipments?page=1&pageSize=20
```

列表必须分页，默认 `page=1&pageSize=20`。

#### 收货记录

```http
GET /supplier-purchase-orders/:id/receipts?page=1&pageSize=20
```

列表必须分页，默认 `page=1&pageSize=20`。

## 4. 第一阶段操作接口

所有写接口都必须带 `Idempotency-Key`。网络状态不确定时，小程序应复用同一个 key 重试或先刷新详情判断状态，不能直接生成新 key 重复提交。

### 4.1 确认供应商已收到/确认履约

```http
POST /supplier-purchase-orders/:id/confirm-fulfillment
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "expected_version": 1,
  "confirmed_at": "2026-09-04T10:00:00+08:00",
  "remark": "已电话确认供应商收到采购单"
}
```

说明：

- 当前阶段这是“员工代录供应商确认”，不是供应商本人登录确认。
- `expected_version` 使用采购单详情返回的采购单版本。
- 确认成功后，履约对象从 `version=1` 开始独立流转。

### 4.2 登记发货

```http
POST /supplier-purchase-orders/:id/shipments
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "id": "<client-generated-uuid>",
  "expected_fulfillment_version": 1,
  "shipment_no": "FH202609040001",
  "carrier_name": "供应商自送",
  "tracking_no": null,
  "shipped_at": "2026-09-04T11:00:00+08:00",
  "remark": null,
  "items": [
    {
      "purchase_order_item_id": "<purchase-order-item-id>",
      "quantity": 10
    }
  ]
}
```

规则：

- 发货前必须已有履约确认。
- 累计发货数量不能超过采购数量。
- 同一次发货内，同一采购单明细不能重复。
- 发货记录创建后不可修改、不可删除；录错需要后续冲销/差异处理能力解决。

### 4.3 登记收货

```http
POST /supplier-purchase-orders/:id/receipts
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "id": "<client-generated-uuid>",
  "expected_fulfillment_version": 2,
  "receipt_no": "SH202609040001",
  "received_at": "2026-09-04T15:00:00+08:00",
  "remark": "现场核对完成",
  "items": [
    {
      "purchase_order_item_id": "<purchase-order-item-id>",
      "accepted_quantity": 8,
      "rejected_quantity": 2,
      "variance_reason": "破损"
    }
  ]
}
```

规则：

- 收货前必须已有发货记录。
- 本次收货数量 = `accepted_quantity + rejected_quantity`，必须大于 0。
- 累计收货不能超过累计发货。
- `rejected_quantity > 0` 时必须填写 `variance_reason`。
- `rejected_quantity = 0` 时 `variance_reason` 必须为空。

## 5. 状态映射建议

### 5.1 批次状态

采购批次 `ordered` 当前在小程序里显示为“已生成采购单”。接入履约后建议文案改为：

```text
已转采购单
```

或：

```text
采购执行中
```

推荐使用“已转采购单”，更准确，不暗示所有采购单已完成。

### 5.2 采购单状态

采购单本身当前只有：

```text
draft | submitted | cancelled
```

小程序不要只依赖采购单 `status` 判断执行阶段，应结合履约状态显示。

### 5.3 履约状态展示

| 后端状态 | 小程序建议文案 | 可展示动作 |
| --- | --- | --- |
| `fulfillment = null` | 待供应商确认 | 确认供应商已收到 |
| `confirmed` | 待发货 | 登记发货 |
| `partially_shipped` | 部分发货 | 登记发货、登记收货 |
| `shipped` | 待收货 | 登记收货 |
| `partially_received` | 部分收货 | 登记收货 |
| `received` | 已收货 | 无 |
| `received_with_variance` | 收货异常 | 无，等待后续差异闭环 |
| `cancelled` | 已取消履约 | 无 |

## 6. 差异收货规则

第一阶段按现有接口支持三类基础场景：

### 6.1 正常收货

```text
accepted_quantity = 本次合格数量
rejected_quantity = 0
variance_reason = null
```

### 6.2 少收

例如采购 100，只发/只到 80。

第一阶段处理：

- 只登记本次实际收到数量。
- 未收到的剩余数量继续保留为待发货或待收货。
- 不把少收数量填入 `rejected_quantity`。

原因：

- `rejected_quantity` 表示到了但被拒收，例如错货、破损、质量问题。
- 少收表示尚未收到，后续仍可能补发/补收。

### 6.3 错货、破损、质量问题

处理：

- 合格部分填 `accepted_quantity`。
- 拒收部分填 `rejected_quantity`。
- 必须填写 `variance_reason`。
- 履约最终可能进入 `received_with_variance`。

### 6.4 多收

第一阶段不建议支持自动多收。

处理：

- 前端不允许提交超过待收数量。
- 后端会返回 `over_received`。
- 小程序提示：`收货数量超过可收数量，请联系采购负责人处理。`

后续如果业务确认要接受超收，应新增独立的“接受超收”命令，并根据金额变化决定是否触发预算/审批。

## 7. 错误处理

小程序需要重点处理：

| 错误 | 场景 | 小程序处理 |
| --- | --- | --- |
| `version_conflict` / `SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT` | 采购单或履约版本变化 | 刷新详情后让用户重新操作 |
| `idempotency_conflict` / `SUPPLIER_IDEMPOTENCY_CONFLICT` | 同一个 key 提交了不同内容 | 停止重试，提示重新进入页面 |
| `state_conflict` | 当前状态不允许操作 | 刷新履约状态 |
| `over_shipped` | 发货超过采购数量 | 提示超出可发数量 |
| `over_received` | 收货超过已发未收数量 | 提示超出可收数量 |
| `variance_reason_required` | 有拒收但未填原因 | 定位到对应明细要求补填 |

## 8. 后续第二阶段：供应商维度交付页

当前后端未提供供应商分享接口，需要 Gooes 新增。

建议新增：

```http
POST /supplier-purchase-orders/:id/share-link
GET /public/supplier-purchase-orders/:token
POST /public/supplier-purchase-orders/:token/confirm-view
```

后端建议新增 migration：

```text
supplier_purchase_order_share_links
```

建议字段：

- `id`
- `tenant_id`
- `supplier_purchase_order_id`
- `tenant_supplier_id`
- `token_hash`
- `status`
- `expires_at`
- `created_by_employee_id`
- `last_viewed_at`
- `viewed_count`
- `created_at`
- `updated_at`

安全要求：

- token 只能查看当前采购单。
- 不能查询租户其它数据。
- 不能暴露其它供应商、其它项目、其它采购批次。
- token 建议存 hash，不直接明文落库。
- 分享页只读；供应商确认收到可作为单独动作。

小程序侧：

- 员工点击“发送给供应商”。
- 调用 `share-link` 生成链接或小程序路径。
- 使用小程序分享卡片或复制链接。
- 展示供应商查看/确认状态。

## 9. 后续第三阶段：PDF / Excel 导出

当前后端未实现采购单导出接口。正式单据应由后端生成，小程序只负责下载、打开、转发。

建议新增：

```http
GET /supplier-purchase-orders/:id/print-preview
GET /supplier-purchase-orders/:id/export.pdf
GET /supplier-purchase-orders/:id/export.xlsx
GET /supplier-purchase-batches/:id/export.xlsx
GET /supplier-purchase-batches/:id/export.zip?format=pdf|xlsx
```

导出要求：

- 单据金额以后端采购单快照为准。
- 每个供应商采购单独立导出。
- 批次导出可以生成 ZIP，也可以生成一个 Excel 多 sheet。
- 导出记录应纳入审计。
- 小程序端不拼金额、不拼正式 PDF、不拼 Excel。

## 10. 后续第四阶段：差异处理闭环

当前基础履约只记录收货结果，不负责后续异常处理闭环。

建议新增差异处理模型：

```text
supplier_purchase_order_variances
supplier_purchase_order_variance_actions
```

建议动作：

- `request_replenishment`：要求补货
- `return_goods`：退货
- `close_remaining`：关闭剩余数量
- `accept_overage`：接受超收
- `resolve_quality_issue`：处理质量问题

如果支持照片，需要接入现有附件/文件能力，记录：

- 照片文件 ID
- 上传人
- 上传时间
- 所属收货记录或差异记录

这部分涉及数据库结构和业务状态流转，必须通过 `supabase/migrations/` 管理。

## 11. Orange 第一阶段改造清单

小程序仓库建议改造如下，Gooes 不直接修改 orange：

### 11.1 Service

文件：

```text
src/services/supplier_procurement.ts
```

新增方法：

```ts
getPurchaseOrder(id)
listPurchaseOrderItems(id, params)
getPurchaseOrderFulfillment(id)
listPurchaseOrderShipments(id, params)
listPurchaseOrderReceipts(id, params)
confirmPurchaseOrderFulfillment(id, payload, key)
createPurchaseOrderShipment(id, payload, key)
createPurchaseOrderReceipt(id, payload, key)
```

### 11.2 Types

文件：

```text
src/types/api/supplier_procurement.d.ts
```

新增类型：

- `PurchaseOrderDetail`
- `PurchaseOrderItem`
- `PurchaseOrderFulfillment`
- `PurchaseOrderItemFulfillment`
- `PurchaseOrderShipment`
- `PurchaseOrderReceipt`
- `PurchaseOrderFulfillmentCommandResult`
- `PurchaseOrderFulfillmentConfirmPayload`
- `PurchaseOrderShipmentPayload`
- `PurchaseOrderReceiptPayload`

### 11.3 Pages

新增：

```text
src/packageProcurement/pages/order-detail/index.tsx
src/packageProcurement/pages/order-detail/index.config.ts
```

修改：

```text
src/packageProcurement/pages/batch-detail/index.tsx
```

要求：

- `orders` tab 的采购单卡片可点击。
- 采购单详情页支持下拉刷新。
- 发货/收货历史列表分页。
- 写操作防重复点击。
- 版本冲突后刷新页面。

### 11.4 app config

修改：

```text
src/app.config.ts
```

注册采购单详情页。

## 12. 第一阶段验收清单

1. 采购批次审批通过后，批次详情“采购单”tab 展示供应商拆分后的采购单。
2. 点击采购单进入采购单详情。
3. 详情页展示采购单基础信息、供应商、项目、商品明细、金额。
4. 未履约采购单展示“确认供应商已收到”。
5. 确认后刷新，展示履约状态和版本。
6. 已确认采购单可以登记发货。
7. 发货数量不能超过采购数量。
8. 有已发未收数量时可以登记收货。
9. 收货支持合格数量和拒收数量。
10. 拒收数量大于 0 时必须填写差异原因。
11. 少收时剩余数量继续待收，不记为拒收。
12. 超收被前端拦截；后端返回 `over_received` 时前端能明确提示。
13. 写操作使用 `Idempotency-Key`，重复点击不会产生重复记录。
14. 版本冲突后提示并刷新详情。
15. 发货/收货记录分页加载。
16. 无 `supplier.purchase-order.manage` 权限时隐藏写操作。
17. 分享供应商、PDF、Excel 按“暂不可用/后续能力”处理，不在第一阶段伪造。

## 13. 建议对小程序端的同步口径

可以直接同步：

> 后端当前已具备采购单详情和基础履约接口，小程序第一阶段先接“采购单详情 + 供应商确认代录 + 发货登记 + 收货登记”。供应商分享、PDF/Excel 导出、差异处理闭环是后端后续新增能力，不阻塞第一阶段。
>
> 批次详情的采购单列表需要支持点击进入采购单详情。详情页按采购单 ID 拉取基础信息、明细、履约详情、发货记录和收货记录。
>
> 操作按钮不要只看采购单状态，要结合履约状态判断：无履约显示确认，已确认显示发货，已发货显示收货，已完成或异常只读展示。
>
> 收货时，少收不填拒收数量；破损、错货、质量问题填拒收数量并填写差异原因。第一阶段不支持超收，超收需要后续差异闭环或预算审批能力。

## 14. 本次交接的范围边界

本交接文档只定义小程序第一阶段可对接的现有接口，以及后续后端能力的建议拆分。

本次不包含：

- Gooes API 代码改动。
- Supabase migration。
- Orange 小程序代码改动。
- PDF/Excel 实现。
- 供应商公开分享页实现。
- 差异闭环实现。

如果确认进入开发，建议下一步先做 Orange 第一阶段接入；Gooes 仅在联调发现接口字段不足时补充兼容字段。
