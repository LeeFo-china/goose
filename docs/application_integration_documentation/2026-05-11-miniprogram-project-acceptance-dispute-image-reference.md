# 小程序工序验收客户疑问引用图片对接说明

## 1. 后端变更

客户提交“我有疑问”时，接口已支持把客户补充上传的新图片和引用的验收原图分开提交、分开返回。

接口：

```http
POST /project-acceptances/:id/customer-dispute
```

请求新增字段：

```json
{
  "comment": "卫生间地面这张照片看不清楚，请补充近景",
  "images": [
    "project-id/acceptance/customer-dispute/2026/05/11/customer-a.jpg"
  ],
  "referenced_image_ids": [
    "acceptance-image-id"
  ],
  "referenced_image_paths": [
    "project-id/acceptance/2026/05/08/a.jpg"
  ],
  "ticket": "ticket_xxx",
  "project_id": "project-id"
}
```

规则：

- `images` 只放客户补充上传的新图片 path。
- `referenced_image_ids` / `referenced_image_paths` 只放客户引用的验收项原图。
- 如果同时传 `referenced_image_ids` 和 `referenced_image_paths`，后端优先使用 `referenced_image_ids`。
- 引用图片最多 9 张。
- 后端会校验引用图片必须属于当前验收单的 `image_items` 或 `rectification_image_items`。
- 短信 ticket 打开的链路使用同一套校验。

## 2. 验收详情图片结构

员工端和客户侧验收详情的验收项图片会继续保留原字段，同时 `image_items` / `rectification_image_items` 增加稳定 `id`：

```json
{
  "id": "acceptance-item-id",
  "title": "卫生间坡度",
  "images": ["https://..."],
  "image_items": [
    {
      "id": "acceptance-image-id",
      "acceptance_id": "acceptance-id",
      "item_id": "acceptance-item-id",
      "item_title": "卫生间坡度",
      "path": "project-id/acceptance/2026/05/08/a.jpg",
      "url": "https://...",
      "thumb_url": "https://...",
      "source": "acceptance_item",
      "created_at": null
    }
  ]
}
```

小程序端推荐优先提交 `referenced_image_ids`；如果旧数据没有 `id`，可以提交 `referenced_image_paths`。

## 3. 操作记录返回

`customer_dispute` 操作记录会返回：

```json
{
  "action": "customer_dispute",
  "comment": "卫生间地面这张照片看不清楚，请补充近景",
  "images": [
    "project-id/acceptance/customer-dispute/2026/05/11/customer-a.jpg"
  ],
  "image_items": [
    {
      "path": "project-id/acceptance/customer-dispute/2026/05/11/customer-a.jpg",
      "url": "https://...",
      "thumb_url": "https://..."
    }
  ],
  "referenced_images": [
    {
      "id": "acceptance-image-id",
      "item_id": "acceptance-item-id",
      "item_title": "卫生间坡度",
      "path": "project-id/acceptance/2026/05/08/a.jpg",
      "url": "https://...",
      "thumb_url": "https://...",
      "source": "acceptance_item"
    }
  ]
}
```

前端展示建议：

- “客户补充图片”展示 `image_items`。
- “客户引用的验收图片”展示 `referenced_images`。
- 操作记录时间轴继续使用 `operator/action/comment/created_at`，图片详情在该节点下展开展示。
