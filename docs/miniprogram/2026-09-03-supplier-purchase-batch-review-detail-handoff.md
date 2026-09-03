# 采购批次审批明细展示对接

## 1. 结论

采购审批页补充“采购内容 / 采购申请 / 采购单”明细时，不需要新增后端接口。
现有三个只读接口已经提供冻结商品事实、供应商拆分结果和审批后采购单：

- `GET /supplier-purchase-batches/:id/items`
- `GET /supplier-purchase-batches/:id/requisitions`
- `GET /supplier-purchase-batches/:id/orders`

本次由 Orange 调整审批页；Gooes 不修改接口、数据库和权限模型。

## 2. 通用契约

- 认证：租户员工登录态。
- 权限：明确要求 `supplier.purchase-requisition.view`，并受 `project.read` 项目可见范围
  约束。审批角色应同时分配 view 权限，不能用 manage/approve 推断替代。
- Query：`page` 默认 `1`，`pageSize` 默认 `20`、最大 `100`。
- 响应：`{ data: { list, pagination }, message: "success" }`。
- 金额、数量、税率和换算系数均按字符串处理，客户端不得转为浮点数后回传。
- 请求中的租户、批次和项目范围全部由服务端校验；范围外批次按不存在处理。

审批页应使用 `pageSize=100` 完整加载当前批次。单批次最多 100 项商品、20 家
供应商；如果 `pagination.totalPages > 1`，仍需继续分页，不能只展示第一页后允许审批。

## 3. 页面加载顺序

1. 并发读取批次详情、采购内容、采购申请和当前 workflow 待办。
2. `pending_approval` 状态不要求读取采购单；采购单区域显示“审批通过后生成”。
3. `ordered` 状态再读取采购单；审批成功响应也会返回精简采购单摘要。
4. 审批成功后重新读取 `/orders`，以后端分页详情作为最终展示事实。
5. 任一必要明细加载失败，或加载数量与批次统计不一致时，显示重试状态并禁止盲审。

建议完整性检查：

- 已加载采购内容数量等于 `batch.item_count`。
- 当前 `split_generation` 的采购申请数量等于 `batch.supplier_count`。
- 当前代次每个 `tenant_supplier_id` 都能匹配至少一项采购内容。
- `ordered` 状态采购单数量等于 `batch.supplier_count`。

## 4. 采购内容

`/items` 返回保存和提交时冻结的事实。用户可见字段建议如下：

| UI | 字段 |
| --- | --- |
| 商品 | `product_name_snapshot` |
| 规格/SKU | `sku_name_snapshot`，按需补充 `specification_snapshot`、`model_snapshot` |
| 数量 | `quantity` + `purchase_unit_symbol_snapshot` |
| 供应商 | `supplier_name_snapshot` |
| 单价 | `unit_price` |
| 小计 | `line_total_amount` |
| 税 | `tax_inclusive`、`tax_rate`、`line_tax_amount` |

按 `tenant_supplier_id` 分组即可形成审批前的供应商拆分区。客户端不得按供应商名称
分组，也不得重新计算或回传拆分结果。

## 5. 采购申请

`/requisitions` 同时包含当前和历史拆分代次。审批页默认只展示：

```text
row.split_generation === batch.split_generation
```

建议展示 `request_no`、状态、`budget_status`、`total_amount` 和供应商名称。采购申请
本身提供 `tenant_supplier_id`；供应商名称使用同一 `tenant_supplier_id` 的采购内容
快照，不额外调用供应商接口。

历史代次只能放在折叠的“历史申请”区域，不能与当前待审批拆分混排。

## 6. 采购单

审批前采购单尚未正式生成，因此 `pending_approval` 状态显示说明性空态，不把空列表
当作异常。最终审批通过后，服务端在同一事务中按供应商生成并提交采购单。

`ordered` 状态建议展示：

- `order_no`
- `supplier.name`
- `status`
- `total_amount`
- `purchase_requisition.request_no`

批次生成的采购单已经是 `submitted`，Orange 不得再次调用采购单提交接口。

## 7. 审批边界

- 是否显示并启用审批操作只使用批次详情的 `actions.can_review`。
- 审批命令继续通过 workflow task complete 执行，沿用现有幂等键和版本号。
- 商品、价格和拆分展示使用冻结快照，不用当前商品目录覆盖历史事实。
- HTTP `409` 后清空旧幂等键，重新加载批次和全部明细，再决定是否允许重试。
- 审批按钮提交期间保持禁用，避免同一待办重复操作。

## 8. 预算解释后续项

批次详情已有 `budget_status` 和以成本分类 ID 为 key 的 `budget_snapshot`，其中包含：

- `requested_amount`
- `budget_amount`
- `expense_amount`
- `other_commitment_amount`
- `available_amount`

这些字段足以执行服务端预算校验，但缺少成本分类名称、明确的超出金额和用户可读原因，
不适合作为完整的超预算解释。本次审批明细展示不依赖它们。后续如增加预算解释，应由
后端提供稳定的展示 DTO，不要求 Orange 根据 UUID 和金额自行推导原因。

## 9. Orange 改动范围

只读核查时，Orange 已有三个接口 wrapper：

- `src/services/supplier_procurement.ts`
- `src/types/api/supplier_procurement.d.ts`

审批页当前只加载批次详情、采购单和 workflow 待办，需在以下页面补充采购内容与采购
申请状态、完整性检查和分区展示：

- `src/packageProcurement/pages/batch-review/index.tsx`

Orange 当前本地类型是后端响应的裁剪版本。实现前应在
`src/types/api/supplier_procurement.d.ts` 至少补齐：

- `PurchaseBatch`：`split_generation`。
- `PurchaseBatchItem`：`tenant_supplier_id`、`specification_snapshot`、
  `model_snapshot`、`tax_inclusive`、`line_subtotal_amount`、
  `line_tax_amount`。
- `PurchaseBatchRequisition`：`split_generation`。
- `PurchaseBatchOrder`：需要展示来源申请时补充 `purchase_requisition`。

这些字段均来自既有响应，不能用类型断言或前端临时对象替代。

可复用批次详情页已有的分页合并与行展示逻辑：

- `src/packageProcurement/pages/batch-detail/index.tsx`
- `src/packageProcurement/model.ts`

Gooes 侧不会修改 Orange 文件。

## 10. 验收清单

- 待审批批次能看到所有商品、规格、数量、供应商、单价和小计。
- 当前代次采购申请按供应商拆分展示，历史代次不混入。
- 待审批状态的采购单区域明确显示“审批通过后生成”。
- 最终审批通过后刷新并展示全部采购单号及供应商。
- 任一必要接口失败或明细不完整时，审批操作不可执行且提供重试。
- 金额展示保持字符串精度，前端不重新计算可信拆分结果。
- 无查看权限、项目范围外和不存在批次分别维持既有 403/404 行为。

完整基础契约参见：

- `docs/miniprogram/2026-08-28-supplier-procurement-batch-api-handoff.md`
- `docs/miniprogram/supplier-procurement-batch-contract.ts`
