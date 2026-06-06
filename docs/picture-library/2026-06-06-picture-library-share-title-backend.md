# 图片资料库分享标题后端对接记录

日期：2026-06-06

## 背景

visitor 图片资料库中部分图片标题来自导入阶段或文件夹批量生成，例如
`法式 14`、`原木 9`。这些标题不适合作为小程序可见主标题或分享卡片标题。

后端已将详情接口的 `share.title` 改为按图片分类生成，避免 visitor 分享链路继续暴露随机占位标题。

## 接口

```http
GET /visitor/picture-library/assets/:id
```

本轮只调整详情接口返回的 `data.share.title`。以下接口不变：

```http
POST /visitor/picture-library/assets/:id/share-events
```

## 生成规则

`data.share.title` 按以下规则生成：

1. 使用图片分类列表中的第一个分类作为主分类。
2. 分类列表由 `picture_asset_categories.sort_order ASC`、`created_at ASC` 稳定排序。
3. 如果分类名称已包含 `效果图`，直接使用分类名称。
4. 如果分类名称不包含 `效果图`，返回 `${分类名称}装修效果图`。
5. 如果图片没有分类，兜底返回 `装修效果图`。

说明：当前数据模型没有显式 `primary_category_id` 字段，因此主分类等价于排序后的第一个分类。

## 返回兼容性

详情接口继续返回：

```json
{
  "title": "原木 9",
  "categories": [
    {
      "id": "b2c3afa2-1284-47c7-b79e-9325764dd1ff",
      "name": "原木",
      "slug": "style-5d685c7cd6"
    }
  ],
  "share": {
    "title": "原木装修效果图",
    "path": "/packageVisitor/pages/picture-library-detail/index?id=791d57a9-83c5-4e3a-96aa-8bec7fab910f"
  }
}
```

`data.title` 保持兼容返回，但 visitor 小程序不要再把它作为图片详情可见主标题或分享标题的第一选择。

## 真实接口样例

### 单分类图片

请求：

```http
GET /visitor/picture-library/assets/791d57a9-83c5-4e3a-96aa-8bec7fab910f
```

抽样返回：

```json
{
  "id": "791d57a9-83c5-4e3a-96aa-8bec7fab910f",
  "title": "原木 9",
  "categories": [
    {
      "id": "b2c3afa2-1284-47c7-b79e-9325764dd1ff",
      "name": "原木",
      "slug": "style-5d685c7cd6"
    }
  ],
  "share_title": "原木装修效果图",
  "share_image_variant": "cover"
}
```

### 多分类图片

请求：

```http
GET /visitor/picture-library/assets/da3f792f-c6e7-4f65-9d8e-58672f812c6b
```

抽样返回：

```json
{
  "id": "da3f792f-c6e7-4f65-9d8e-58672f812c6b",
  "title": "欧美 9",
  "categories": [
    {
      "id": "4834ee65-85c2-4e72-82bb-9d2e1f635dd1",
      "name": "欧美",
      "slug": "style-bde30cf951"
    },
    {
      "id": "e7bd5491-5bb5-4e70-a895-85ed6fa7d5ff",
      "name": "美式",
      "slug": "style-d75f2c3f89"
    }
  ],
  "share_title": "欧美装修效果图",
  "share_image_variant": "cover"
}
```

## 小程序对接建议

- 分享优先使用后端 `data.share.title`。
- 如果 `data.share.title` 缺失，小程序按第一分类兜底生成。
- 如果没有分类，小程序兜底为 `装修效果图`。
- 图片详情页和列表页不要突出展示随机导入标题。
- 分享事件上报继续使用既有接口和 `channel` 枚举。

## 验收结果

| 检查项 | 结果 |
| --- | --- |
| 单分类图片分享标题 | `原木装修效果图` |
| 多分类图片分享标题 | `欧美装修效果图` |
| 分类字段兼容 | `categories` 继续返回 |
| 分享事件接口 | 未改动 |
| API 检查 | `bun run api:check` 通过 |

