# 图片资料库阶段 6 小程序对接文档

日期：2026-06-06

## 背景

阶段 6 已为 visitor 图片资料库增加分享字段和分享事件统计。小程序可在图片详情页接入微信好友分享、朋友圈分享和海报分享统计。

本阶段不包含海报生成接口。小程序如需海报，可先使用当前详情页图片自行生成本地海报，后续再评估后端海报生成。

## 鉴权

图片详情公开可读：

```http
GET /visitor/picture-library/assets/:id
```

分享事件写入必须携带 visitor session token：

```http
Authorization: Bearer <visitor_session_token>
```

未携带 token 或 token 不是 visitor session 时，写接口返回 401。

## 图片详情新增字段

```http
GET /visitor/picture-library/assets/:id
```

返回中新增 `share` 对象：

```json
{
  "data": {
    "id": "uuid",
    "title": "法式 14",
    "share_count": 1,
    "share": {
      "title": "法式 14",
      "image": {
        "url": "https://example.com/signed-or-public-url",
        "variant": "cover",
        "width": 1200,
        "height": 1600,
        "file_size": 123456,
        "mime_type": "image/webp"
      },
      "path": "/packageVisitor/pages/picture-library-detail/index?id=uuid"
    }
  },
  "message": "success"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `share.title` | string | 分享标题 |
| `share.image.url` | string | 分享图 URL，小程序不要拼接 COS 地址 |
| `share.path` | string | 小程序分享路径 |
| `share_count` | number | 分享事件计数 |

注意：

- `share.path` 当前按小程序现有详情页路径返回。
- 如果小程序路由后续调整，请先回写文档，后端再同步路径。

## 分享事件接口

```http
POST /visitor/picture-library/assets/:id/share-events
Authorization: Bearer <visitor_session_token>
Content-Type: application/json
```

请求体：

```json
{
  "channel": "wechat_session"
}
```

`channel` 可选值：

| 值 | 说明 |
| --- | --- |
| `wechat_session` | 分享好友或群 |
| `wechat_timeline` | 分享朋友圈 |
| `poster` | 保存或转发海报 |

返回：

```json
{
  "data": {
    "id": "uuid",
    "asset_id": "uuid",
    "visitor_id": "visitor-id",
    "channel": "wechat_session",
    "share_count": 2,
    "created_at": "2026-06-06T08:00:00.000Z"
  },
  "message": "success"
}
```

规则：

- 图片不存在、隐藏、删除或未发布时返回 404。
- 未登录提交分享事件返回 401。
- 非法 `channel` 返回 400。
- 后端会写入 `picture_asset_share_events` 并更新图片 `share_count`。

## 小程序接入建议

- 图片详情页 `onShareAppMessage` 使用 `share.title`、`share.path` 和 `share.image.url`。
- 图片详情页 `onShareTimeline` 使用 `share.title`、`share.path` 和 `share.image.url`。
- 用户触发好友分享时，可调用 `share-events` 写入 `wechat_session`。
- 用户触发朋友圈分享时，可调用 `share-events` 写入 `wechat_timeline`。
- 用户保存或转发海报时，可调用 `share-events` 写入 `poster`。
- 分享事件接口失败不应阻塞微信分享能力，只做轻提示或静默失败。
- 接口返回的 `share_count` 可用于更新详情页计数。

## 后端验收记录

执行日期：2026-06-06

已完成接口：

- `GET /visitor/picture-library/assets/:id` 返回 `share` 对象。
- `POST /visitor/picture-library/assets/:id/share-events` 记录分享事件。

验证结果：

| 检查项 | 结果 |
| --- | --- |
| 详情接口返回分享标题 | `share.title` 有值 |
| 详情接口返回分享图 | `share.image.url` 有值 |
| 详情接口返回分享路径 | `share.path` 有值 |
| 未登录写分享事件 | 401 |
| visitor token 写 `wechat_session` | 返回事件 ID 和 `share_count` |
| 非法渠道 | 400，提示 `无效的分享渠道` |
| 写入事件后重新查详情 | `share_count` 已增加 |

## 待小程序复测

- 好友分享卡片标题、路径、图片正确。
- 朋友圈分享标题、路径、图片正确。
- 从分享入口打开详情页可正常加载图片。
- 分享事件接口失败不影响微信分享动作。
- 触发分享后详情页 `share_count` 可刷新。

## 小程序回写对接记录

回写来源：

```text
/Users/leefo/Public/work/orange/docs/2026-06-06-picture-library-miniprogram-stage6-share.md
```

小程序侧已完成：

- 图片详情页启用好友分享和朋友圈分享。
- `onShareAppMessage` 使用后端返回的 `share.title`、`share.path`、`share.image.url`。
- `onShareTimeline` 使用后端返回的 `share.title`、`share.image.url`，并从 `share.path` 中提取详情页 query。
- 分享菜单启用 `shareAppMessage` 和 `shareTimeline`。
- 互动区增加轻量分享计数按钮，好友分享通过 `openType=share` 触发。
- 用户触发好友分享时上报 `wechat_session` 分享事件。
- 用户触发朋友圈分享时上报 `wechat_timeline` 分享事件。
- 分享事件上报失败只记录日志，不阻断微信分享返回值。
- 分享事件返回 `share_count` 后同步更新详情页计数。

小程序侧已更新文件：

- `src/services/picture_library.ts`
- `src/packageVisitor/pages/picture-library-detail/index.tsx`
- `src/packageVisitor/pages/picture-library-detail/index.scss`
- `src/packageVisitor/pages/picture-library-detail/index.config.ts`

小程序侧接口复测：

| 检查项 | 结果 |
| --- | --- |
| 详情接口返回 `share.title` | 200，有值 |
| 详情接口返回 `share.image.url` | 200，有值 |
| 详情接口返回 `share.path` | 200，有值 |
| 详情接口返回 `share_count` | 200，有值 |
| 未登录写分享事件 | 401，`TOKEN_MISSING` |

构建校验已通过：

```bash
pnpm run check:file-size src/services/picture_library.ts src/packageVisitor/pages/picture-library-detail/index.tsx src/packageVisitor/pages/picture-library-detail/index.scss src/packageVisitor/pages/picture-library-detail/index.config.ts src/packageVisitor/pages/picture-library-detail/components/PictureCommentSection.tsx
pnpm run typecheck
git diff --check
pnpm run build:weapp:dev
```

剩余真机验收：

- 使用当前 `/auth` 新签发的 `visitor_session` token 上报分享事件。
- 好友分享、朋友圈分享和详情页打开链路在真机内复测。
