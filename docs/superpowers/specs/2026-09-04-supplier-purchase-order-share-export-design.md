# 采购单供应商分享与导出设计

**日期：** 2026-09-04
**状态：** 已确认，进入实施
**范围：** Gooes API、Supabase migration、小程序交接文档；不修改 `/Users/leefo/Public/work/orange`

## 1. 背景

采购单详情与履约登记第一阶段已由 Orange 验收通过。当前链路已经覆盖：

- 从采购批次进入采购单详情。
- 根据 `fulfillment` 状态展示确认履约、登记发货、登记收货。
- 正常收货、异常拒收、超发/超收和幂等重试。

下一阶段需要解决“采购单如何正式交付给供应商”和“如何生成单据归档”。

## 2. 目标

本阶段目标包含供应商分享和真实 PDF/XLSX 导出，两部分同阶段交付。

### 2.1 阶段 2A：供应商分享与只读交付页

交付：

- 员工在采购单详情点击“发送给供应商”。
- 后端生成只允许查看当前采购单的短 token。
- 供应商通过公开链接或小程序分享路径查看采购单。
- 供应商查看页展示采购单头、项目、供应商、商品明细、金额、备注、到货要求。
- 后端记录查看次数、最后查看时间。
- 可选提供“确认收到采购单”公开动作，作为供应商已读/已确认事实。

### 2.2 正式 PDF/XLSX 导出

交付：

- 单个采购单导出 PDF。
- 单个采购单导出 XLSX。
- 批次维度导出 XLSX，按供应商拆 sheet。
- 后续可扩展 ZIP 批量导出。

当前代码库没有 PDF/XLSX 生成运行时依赖。已确认本阶段落成真实 `.pdf` / `.xlsx`，允许新增运行时依赖。

新增依赖：

- XLSX：`exceljs`
- PDF：`pdfkit`

中文 PDF 需要字体支持。实现应支持 `SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH` 环境变量；未配置时按常见系统字体路径回退。如果运行镜像没有中文字体，部署侧必须补字体文件或配置该环境变量。

## 3. 不做事项

本阶段不做：

- 供应商登录体系。
- 供应商修改采购单。
- 供应商报价、议价、确认价格变更。
- 收货异常处理闭环。
- 自动发送短信、微信服务通知或企业微信通知。
- 小程序仓库代码改动。

## 4. 数据模型

新增表：

```text
supplier_purchase_order_share_links
```

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `tenant_id` | `uuid` | 租户 |
| `supplier_purchase_order_id` | `uuid` | 采购单 |
| `tenant_supplier_id` | `uuid` | 租户供应商关系 |
| `supplier_id` | `uuid` | 平台供应商 |
| `share_token` | `text` | 高熵分享 token，唯一 |
| `status` | `text` | `active` / `disabled` |
| `expires_at` | `timestamptz` | 过期时间，默认 30 天 |
| `created_by_employee_id` | `uuid` | 创建员工 |
| `idempotency_key` | `text` | 创建链接幂等键 |
| `last_viewed_at` | `timestamptz` | 最近查看时间 |
| `viewed_count` | `integer` | 查看次数 |
| `confirmed_at` | `timestamptz` | 供应商确认收到时间 |
| `confirm_remark` | `text` | 确认备注 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

约束：

- `share_token` 使用 32 字节以上随机数生成，禁止可猜测序号。
- 一张采购单允许存在多条分享记录，但同一员工多次点击可以复用未过期 active 链接。
- 只允许分享 `submitted` 采购单。
- 采购单、供应商关系和平台供应商必须属于同一租户/供应商事实。
- 表启用并强制 RLS，仅 `service_role` 访问。
- 同一租户、采购单、员工、`idempotency_key` 唯一，重复请求返回同一条分享链接。

索引：

- `(tenant_id, supplier_purchase_order_id, status, created_at desc)`
- `(share_token) unique`
- `(tenant_id, supplier_purchase_order_id, created_by_employee_id, idempotency_key) unique`
- `(tenant_id, created_by_employee_id, created_at desc)`
- `(expires_at) where status = 'active'`

## 5. API 契约

### 5.1 员工生成分享链接

```http
POST /supplier-purchase-orders/:id/share-link
Idempotency-Key: <uuid>
Content-Type: application/json
```

权限：

- `supplier.purchase-order.view`
- 目标项目必须在 `project.read` 可见范围内。

请求：

```json
{
  "expires_in_days": 30
}
```

响应：

```json
{
  "share_link": {
    "id": "uuid",
    "token": "opaque-token-returned-once",
    "expires_at": "2026-10-04T00:00:00.000Z",
    "status": "active",
    "viewed_count": 0,
    "last_viewed_at": null,
    "confirmed_at": null,
    "share_path": "/packageProcurement/pages/supplier-order-share/index?token=opaque-token",
    "public_url": "https://api-dev.goodcms.cn/public/supplier-purchase-orders/opaque-token"
  }
}
```

说明：

- token 原文只在创建/复用接口响应中给员工端，用于小程序分享。
- 如果同一员工对同一采购单已有未过期 active 链接，幂等返回原链接。
- 如果同一 `Idempotency-Key` 提交不同请求，返回 `409 / SUPPLIER_IDEMPOTENCY_CONFLICT`。

### 5.2 公开查看采购单

```http
GET /public/supplier-purchase-orders/:token
```

认证：

- 匿名公开接口。
- 只根据高熵分享 token 查当前采购单，不接受 `tenantId`、`supplierId` 等客户端传参。

响应：

```json
{
  "share": {
    "status": "active",
    "expires_at": "2026-10-04T00:00:00.000Z",
    "viewed_count": 1,
    "last_viewed_at": "2026-09-04T12:00:00.000Z",
    "confirmed_at": null
  },
  "purchase_order": {
    "id": "uuid",
    "order_no": "PO-20260901-00000068",
    "status": "submitted",
    "currency": "CNY",
    "expected_delivery_date": "2026-09-10",
    "remark": "备注",
    "subtotal_amount": "100.00",
    "tax_amount": "13.00",
    "total_amount": "113.00",
    "project": {
      "id": "uuid",
      "name": "项目名称",
      "address": "项目地址"
    },
    "supplier": {
      "id": "uuid",
      "name": "供应商名称"
    },
    "items": [
      {
        "line_no": 1,
        "product_name": "商品",
        "sku_name": "SKU",
        "specification": "规格",
        "quantity": "1.0000",
        "unit_symbol": "件",
        "unit_price": "100.00",
        "tax_rate": "0.1300",
        "total_amount": "113.00"
      }
    ]
  }
}
```

规则：

- token 不存在：`404 / SUPPLIER_PURCHASE_ORDER_SHARE_LINK_NOT_FOUND`
- token 禁用：`410 / SUPPLIER_PURCHASE_ORDER_SHARE_LINK_DISABLED`
- token 过期：`410 / SUPPLIER_PURCHASE_ORDER_SHARE_LINK_EXPIRED`
- 采购单已取消：仍可查看，但标记 `purchase_order.status = "cancelled"`；页面提示“该采购单已取消”。
- 每次成功查看增加 `viewed_count` 并更新 `last_viewed_at`。

### 5.3 供应商确认收到

```http
POST /public/supplier-purchase-orders/:token/confirm-view
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "confirmed_at": "2026-09-04T12:00:00+08:00",
  "remark": "已收到"
}
```

响应：

```json
{
  "status": "confirmed",
  "idempotent": false,
  "share": {
    "confirmed_at": "2026-09-04T04:00:00.000Z",
    "confirm_remark": "已收到"
  }
}
```

说明：

- 该动作只记录分享链接确认，不等同于员工代录的采购单履约 `confirm-fulfillment`。
- 若后续需要让供应商确认触发履约状态流转，应单独设计权限、责任和审计边界。

## 6. 打印预览

新增：

```http
GET /supplier-purchase-orders/:id/print-preview
GET /public/supplier-purchase-orders/:token/print-preview
```

返回 JSON，不返回 HTML：

- 订单头。
- 项目、供应商。
- 商品明细。
- 金额汇总。
- 页脚信息。

小程序端可用这个接口渲染预览，Admin/H5 后续也可以共用。

## 7. PDF/XLSX 导出策略

真实导出使用后端依赖生成，不由小程序拼装。

新增接口：

```http
GET /supplier-purchase-orders/:id/export.pdf
GET /supplier-purchase-orders/:id/export.xlsx
GET /supplier-purchase-batches/:id/export.xlsx
GET /public/supplier-purchase-orders/:token/export.pdf
GET /public/supplier-purchase-orders/:token/export.xlsx
```

生成策略：

- `exceljs` 生成真正 `.xlsx`，设置列宽、表头、金额列格式和汇总行。
- `pdfkit` 生成真正 PDF，使用可配置中文字体。
- 单采购单导出只包含当前采购单。
- 批次 XLSX 包含批次下所有采购单，每个供应商一个 sheet；如果同一供应商多张采购单，放在同一 sheet 内按采购单号分组。
- 文件名使用采购单号或批次号，不使用用户输入的任意文件名。
- 金额、数量、商品名称和单位均来自采购单快照，不重新计算业务金额。

不推荐：

- 小程序端自行拼正式 PDF/XLSX。
- 用 CSV 冒充 XLSX。
- 用 HTML 改扩展名冒充 Excel。
- 在 API 运行时引入 Playwright 做 PDF，容器体积和稳定性成本过高。

## 8. 小程序对接

Orange 需要新增或调整：

- 采购单详情页增加“发送给供应商”。
- 调用 `POST /supplier-purchase-orders/:id/share-link`。
- 使用返回的 `share_path` 发起小程序分享。
- 员工端采购单详情增加“下载 PDF / 下载 Excel”入口，分别调用员工鉴权导出接口。
- 新增供应商只读查看页：
  - `/packageProcurement/pages/supplier-order-share/index?token=<token>`
  - 调用 `GET /public/supplier-purchase-orders/:token`
  - 显示采购单内容。
  - 可选调用 `POST /public/supplier-purchase-orders/:token/confirm-view`
  - 可选展示“下载 PDF / 下载 Excel”，分别调用公开 token 导出接口。
- 员工端展示分享状态：
  - `viewed_count`
  - `last_viewed_at`
  - `confirmed_at`

## 9. 验收

供应商分享验收：

1. 员工生成分享链接成功。
2. 重复点击返回同一个未过期 active 分享链接。
3. 公开 token 只能查看当前采购单。
4. 无 token、错误 token、过期 token、禁用 token 均返回稳定错误码。
5. 查看后 `viewed_count` 增加，`last_viewed_at` 更新。
6. 供应商确认收到后 `confirmed_at` 写入。
7. 小程序可从分享卡片进入供应商只读页。
8. 所有新增路由通过租户服务能力映射测试。

导出验收：

1. 单采购单 PDF 下载内容与详情快照一致。
2. 单采购单 XLSX 下载内容与详情快照一致。
3. 批次 XLSX 按供应商维度可区分。
4. 金额字段由后端快照输出，不由前端重新计算。
5. 中文 PDF 在 dev/prod 容器中可正常显示。

## 10. 推荐执行顺序

1. 增加数据库 migration：分享链接表、share token 唯一索引、状态约束、RLS。
2. 增加后端数据聚合：采购单打印/导出快照、分享链接创建/公开读取。
3. 增加 PDF/XLSX 生成器和下载路由。
4. 增加公开 token 路由和 auth bypass。
5. 补齐租户服务能力映射测试、schema/service/repository/controller 测试。
6. 更新小程序交接文档并发布 dev。
