# 小程序采购商品自动成本归类对接

## 目标

采购人员选择商品时不再逐条选择成本分类。租户管理员在 Admin 按商品分类维护默认成本分类，特殊商品可以设置单品覆盖；API 在保存采购草稿前再次解析并写入成本分类快照。

## 后端版本要求

需部署包含以下 migration 和 API 改动的 Gooes revision：

- `20260902100000_supplier_catalog_cost_category_rules.sql`
- `20260902180000_supplier_purchase_auto_cost_category.sql`

数据库 migration 必须先于 API revision 应用。

## 采购目录契约

接口保持不变：

```http
GET /supplier-purchase-batches/catalog
```

每条目录商品新增：

```json
{
  "default_cost_category_id": "uuid | null",
  "default_cost_category_name": "主材 | null",
  "cost_category_source": "product | category | ancestor | null"
}
```

字段语义：

| 字段 | 说明 |
| --- | --- |
| `product` | 当前租户对该商品设置了单品覆盖 |
| `category` | 使用商品当前分类的默认成本分类 |
| `ancestor` | 使用最近一个已配置上级分类的默认成本分类 |
| `null` | 后台尚未完成归类，当前商品不能加入采购草稿 |

内部成本分类编码不应展示给用户。

## 保存草稿契约

接口保持不变：

```http
PUT /supplier-purchase-batches/:id
```

新客户端应省略自动归类商品的 `cost_category_id`：

```json
{
  "project_id": "uuid",
  "expected_version": 0,
  "reason": "现场补料",
  "items": [
    {
      "supplier_sku_id": "uuid",
      "quantity": "2.0000"
    }
  ]
}
```

旧客户端继续提交合法 `cost_category_id` 仍兼容。API 会对省略字段的 SKU 做一次最多 100 条的批量解析，然后调用既有采购保存命令；最终采购明细、预算占用和后续台账仍保存非空成本分类快照。

未配置规则时返回：

```json
{
  "statusCode": 409,
  "code": "SUPPLIER_COST_CATEGORY_REQUIRED",
  "message": "部分商品尚未配置成本分类，请先在商品目录中完成归类"
}
```

## Orange 改动要求

1. 删除采购目录已选商品卡片中的成本分类 Picker。
2. 删除“请为已选商品选择成本分类”的前端必填校验。
3. `default_cost_category_id` 非空时允许选择商品，可用弱提示展示 `归入：{default_cost_category_name}`。
4. 默认值为空时禁用加入操作，显示“待后台归类”，不要在小程序提供临时成本分类选择器。
5. 保存草稿时省略自动归类条目的 `cost_category_id`。
6. 编辑历史草稿时允许保留 API 已返回的成本分类快照，但不要开放修改。
7. 对 `SUPPLIER_COST_CATEGORY_REQUIRED` 显示服务端中文消息并引导联系管理员。

## 联调清单

- 分类直接配置为“主材”，商品目录返回 `source=category`。
- 子分类未配置、父分类配置为“辅材”，返回 `source=ancestor`。
- 商品设置覆盖后返回 `source=product`。
- 删除商品覆盖后恢复分类或上级分类结果。
- 无任何规则时商品显示“待后台归类”，保存请求也被 API 阻断。
- 100 条以内混合规则的采购草稿只触发一次批量归类 RPC。
- 旧客户端显式成本分类仍可保存。
- 已有采购单、预算占用、应付和财务台账数据不发生变化。

## 仓库边界

本次仅修改 Gooes 后端、Admin 和本文档。Orange 仓库应由小程序团队按本文档独立修改、测试、提交和发布。
