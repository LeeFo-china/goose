# 仓库项目领料／退料 Stage C 对接契约

日期：2026-09-08。代码交付仓库：gooes。本文对应本地候选实现，不表示开发／生产环境已迁移或发布。

## 范围与身份

本阶段包含项目领料出库、原项目退料回原仓库及库存／项目净成本联动。不包含调拨、盘点、手工调整，也不会因领退料产生供应商应付或付款。

沿用员工登录、当前租户上下文和请求封装。客户端不得传 `tenant_id`、操作者、价格、金额、单位成本或成本分类。后端和数据库都校验权限，数据库再核对有效员工、租户及目标项目范围。

| 操作 | 权限交集 |
| --- | --- |
| 单据列表、详情、明细 | `inventory.stock.view` + `project.read`，并满足项目数据范围 |
| 保存草稿、提交领料、取消 | `inventory.issue.manage` + `project.read`，并满足项目数据范围 |
| 确认领料／退料 | `inventory.issue.approve` + `project.read`，并满足项目数据范围 |
| 项目选项 | `inventory.issue.manage` 或 `inventory.issue.approve`，另需 `project.read` 及数据范围 |
| 专用开关读取 | 上述库存查看／领料管理／领料确认任一权限 + `project.read` |

写命令不额外要求 `inventory.stock.view` 或 `project.update`；包含成本的页面读取需要库存查看权限。选择仓库沿用 `/warehouses`，另需 `inventory.warehouse.view`。

## 接口

以下路径均相对 API 基地址；Admin 的 `/api/backend` 代理前缀不属于小程序 API 路径。

| 方法 | 路径 | 参数／结果 |
| --- | --- | --- |
| GET | `/warehouse-issues/settings` | 只返回 `{warehouse_materials_enabled:boolean}`，不依赖 `supplier.view` |
| GET | `/warehouse-issues/project-options` | `keyword?`、分页；选项 `{id,name}` |
| GET | `/warehouse-issues`、`/warehouse-returns` | `warehouseId?`、`projectId?`、`status?`、`keyword?`、分页 |
| GET | `/warehouse-issues/:id`、`/warehouse-returns/:id` | 单据摘要与关联名称、总金额、明细数 |
| GET | `/warehouse-issues/:id/items`、`/warehouse-returns/:id/items` | 明细分页及原领料／累计已退／剩余可退信息 |
| POST | `/warehouse-issues/:id/save-draft` | 新草稿或完整替换已有草稿明细 |
| POST | `/warehouse-issues/:id/submit` | 冻结成本分类，进入待出库，不扣库存 |
| POST | `/warehouse-issues/:id/complete` | 原子出库并计入项目成本 |
| POST | `/warehouse-issues/:id/cancel` | 取消草稿／待出库单 |
| POST | `/warehouse-returns/:id/save-draft` | 新草稿或完整替换已有退料草稿明细 |
| POST | `/warehouse-returns/:id/complete` | 原子回库并冲减原项目成本 |
| POST | `/warehouse-returns/:id/cancel` | 取消退料草稿；没有退料 submit 接口 |

所有列表默认 `page=1&pageSize=20`，`pageSize` 最大 100。超出最后一页仍返回正确总数及空 `list`。HTTP 成功包装为 `{data,message}`；列表的 `data` 是 `{list,pagination:{page,pageSize,total,totalPages}}`。业务数量、单位成本和金额使用十进制字符串，不要转成 JavaScript Number 再计算或回传；`item_count`、分页计数和版本仍是 number。

### 写入示例

客户端先生成单据 UUID，所有 POST 都带 `Idempotency-Key`。新草稿 `expected_version=0`，以后使用成功响应／详情中的当前版本。已有单据的仓库、项目或原领料单身份不可更换。

领料草稿：

```json
{
  "expected_version": 0,
  "warehouse_id": "<仓库 UUID>",
  "project_id": "<项目 UUID>",
  "reason": "施工领料",
  "items": [{"supplier_sku_id": "<SKU UUID>", "quantity": "1.2500"}]
}
```

退料草稿：

```json
{
  "expected_version": 0,
  "original_issue_order_id": "<已完成领料单 UUID>",
  "reason": "剩余材料退回",
  "items": [{"original_issue_item_id": "<原领料明细 UUID>", "quantity": "0.2500"}]
}
```

其余命令仅接收 `{"expected_version": 1}`。草稿最多 100 条不重复明细；数量必须是正数字符串，最多 14 位整数、4 位小数，不接受指数形式。保存是完整明细替换；编辑已有单据前必须读齐全部明细，并核对总数，不能只保存第一页。

命令结果为 `{status:"saved"|"submitted"|"completed"|"cancelled",order:{...}}`。这里的 `order` 是原始单据，不包含摘要名称／金额；成功后按需重新读取详情和明细，不把命令结果当成完整详情。

### 状态与成本

领料：`draft → submitted → completed`，`draft/submitted → cancelled`。退料：`draft → completed`，`draft → cancelled`。已完成单不可修改或取消；退料必须关联一张已完成领料单的原明细，不允许改项目或仓库。

领料提交时按 SKU 所属商品解析租户成本规则：商品规则优先，其次目录分类及上级分类规则，解析后冻结成本分类；当前没有独立 SKU 级成本分类规则。缺配置会阻断提交。出库时按实时库存移动平均成本核算，最后出清使用余额剩余价值。没有库存预留，确认时仍可能库存不足。

退料按原领料金额的累计比例计算本次冲减额，不使用当前库存平均成本；最后一次退清带走尾差。每行累计退料不能超过原领料数量，数据库在锁内重算。明细字段：

- `quantity`、`unit_cost`、`amount`：本单数量、单位成本和金额；未完成单的成本可能为 null。
- `original_issued_quantity`、`original_issued_amount`：原领料基数。
- `returned_quantity`、`returned_amount`：所有已完成退料的累计量／额。
- `returnable_quantity`：当前剩余可退量，不代表预留或下次必定可退。
- `cost_category_id`、`cost_category_name`：只读分类快照；未提交领料可能为空。
- `document_type`、`warehouse_name`、`project_name`、`total_amount`、`item_count`：摘要字段。未命名项目统一显示“未命名项目”。退料还包含 `original_issue_order_id`、`original_issue_order_no`。

## 开关、重试与错误

独立开关 `warehouse_materials_enabled` 默认关闭，只依赖供应商模块，不要求 `warehouse_procurement_enabled`。已有库存可以在关闭新采购入口时继续领退料。小程序只读取有效开关，不修改平台配置；缺字段／读取失败时禁止新写入，保留有权限的历史读取。

关闭开关或停用仓库后，新写入被拒绝；成功命令重放仍返回原回执。重试依然要求有效身份及权限，不能用历史幂等键绕过授权。

必须冻结原始路径、请求体、版本、单据 ID 和幂等键。超时、断网、5xx 等结果不明时显示“重试原请求”，不得换键或按刷新后的版本重新发送。成功后的详情刷新失败，只重读；已知版本冲突则刷新后让用户重新确认新的操作。

| 稳定错误码后缀（均带 `WAREHOUSE_MATERIAL_`） | HTTP | 客户端处理 |
| --- | --- | --- |
| `INVALID`、`ITEMS_INVALID`、`SKU_INVALID`、`WAREHOUSE_INVALID` | 400 | 修正输入；HTTP schema 错误也可能为 `VALIDATION_ERROR` |
| `FORBIDDEN`、`ACTOR_INVALID`、`NOT_ENABLED` | 403 | 提示权限／身份／开关；结果不明的旧请求不要擅自丢弃 |
| `NOT_FOUND` | 404 | 提示单据不存在或不可访问 |
| `VERSION_CONFLICT`、`STATE_CONFLICT` | 409 | 刷新并重新确认 |
| `IDEMPOTENCY_CONFLICT` | 409 | 同键载荷不同，不能自动生成新键补发 |
| `INSUFFICIENT_STOCK`、`RETURN_QUANTITY_EXCEEDED` | 409 | 刷新可用数量，由用户调整 |
| `COST_CATEGORY_REQUIRED` | 409 | 请管理员补齐商品或目录分类的租户成本规则 |
| `WAREHOUSE_INACTIVE`、`SOURCE_CONFLICT`、`IMMUTABLE` | 409 | 提示来源／状态限制，不自动绕过 |

## 库存来源兼容与 Orange 接入位置

`/inventory/transactions` 的 `source_document` 为 null 或三种对象之一。必须按字段判别，不能再假定一定有采购单：

| 来源 | 对象字段 |
| --- | --- |
| 采购收货 | `receipt_id`、`receipt_no`、`purchase_order_id`、`order_no` |
| 项目领料 | `issue_order_id`、`issue_order_no` |
| 项目退料 | `return_order_id`、`return_order_no`、`issue_order_id`、`issue_order_no` |

本轮只读检查了 Orange 的 Stage B 文档、`src/services/supplier_procurement.ts`、`src/types/api/procurement_destination.d.ts`、`src/packageProcurement/commands.ts`、`InventoryRecords.tsx` 及库存模块文件路径。应由小程序团队处理：

- `src/services/supplier_procurement.ts`：增加领退料与专用开关接口，项目选择使用本阶段专用选项，不依赖采购选项权限。
- `src/types/api/procurement_destination.d.ts`：增加独立开关与库存来源联合类型；领退料类型可单独建文件。
- `src/packageProcurement/commands.ts`：复用租户／员工隔离的冻结请求和未知结果恢复机制。
- `src/packageProcurement/pages/inventory/InventoryRecords.tsx`、`useInventory.ts`、`index.tsx`：来源显示和有权限的领退料入口；新增单据列表／编辑／详情页由该团队设计落地。

Orange 保持未修改。本地 API／数据库通过不表示小程序真机、实际租户授权或部署验收通过。

## 联调清单

- [ ] 只有领料管理／确认与项目读取权限时，可以读取专用开关和项目选项；无项目范围不能访问目标单据。
- [ ] 默认仓库、分页选 SKU／项目、草稿保存和读齐明细；拒绝重复 SKU、非法精度和成本字段。
- [ ] 提交不扣库存，确认后库存减少、项目成本增加；不足库存时全部回滚。
- [ ] 分次退料、最后退清、当前库存成本已变化的退料，按原领料金额冲减。
- [ ] 并发超领／超退、幂等重放、同键异载荷、过期版本、权限撤销、停用仓库、关闭开关。
- [ ] 库存来源链接区分采购、领料、退料；无详情权限仅显示单号。
- [ ] 桌面／375px／微信真机、断网恢复、成功后刷新失败；不把 UI fixture 结果当真实过账证明。
