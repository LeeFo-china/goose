# 图片资料库阶段 5 小程序对接文档

日期：2026-06-06

## 背景

阶段 5 已为 visitor 图片资料库增加评论能力，并允许 visitor 在评论中携带少量图片附件。

本阶段不包含 admin 评论审核页面和分享统计。第一版评论提交后状态为 `visible`，后续运营治理阶段再补审核流、隐藏、删除和风控。

## 鉴权

评论列表公开可读：

```http
GET /visitor/picture-library/assets/:id/comments?page=1&pageSize=20
```

评论提交和评论图片上传必须携带 visitor session token：

```http
Authorization: Bearer <visitor_session_token>
```

未携带 token 或 token 不是 visitor session 时，写接口返回 401。

## 评论列表

```http
GET /visitor/picture-library/assets/:id/comments?page=1&pageSize=20
```

返回示例：

```json
{
  "data": {
    "list": [
      {
        "id": "uuid",
        "asset_id": "uuid",
        "visitor_id": "visitor-id",
        "content": "这张图可以参考",
        "status": "visible",
        "images": [
          {
            "id": "uuid",
            "file_object_id": "uuid",
            "url": "https://example.com/signed-or-public-url",
            "width": 1080,
            "height": 1440,
            "file_size": 123456,
            "mime_type": "image/webp"
          }
        ],
        "created_at": "2026-06-06T07:00:00.000Z",
        "updated_at": "2026-06-06T07:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `content` | string | 评论内容，1-500 字 |
| `images` | array | 评论图片列表，可能为空 |
| `images[].url` | string | 后端返回的可访问 URL，小程序不要拼接 COS 地址 |
| `status` | string | 当前第一版只返回 `visible` |

## 评论提交

```http
POST /visitor/picture-library/assets/:id/comments
Authorization: Bearer <visitor_session_token>
Content-Type: application/json
```

请求体：

```json
{
  "content": "这张图可以参考",
  "image_file_ids": ["uuid"]
}
```

参数规则：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `content` | 是 | 去空格后 1-500 字 |
| `image_file_ids` | 否 | 评论图片文件对象 ID，最多 3 个 |

返回结构与评论列表单项一致：

```json
{
  "data": {
    "id": "uuid",
    "asset_id": "uuid",
    "visitor_id": "visitor-id",
    "content": "这张图可以参考",
    "status": "visible",
    "images": [],
    "created_at": "2026-06-06T07:00:00.000Z",
    "updated_at": "2026-06-06T07:00:00.000Z"
  },
  "message": "success"
}
```

## 评论图片上传

复用平台 COS 直传接口，不新增 picture-library 专用上传路径。

### 1. 初始化直传

```http
POST /uploads/cos/direct-init
Authorization: Bearer <visitor_session_token>
Content-Type: application/json
```

请求体：

```json
{
  "scene": "picture_comment",
  "filename": "comment.webp",
  "mimetype": "image/webp",
  "size_bytes": 102400
}
```

返回中的 `upload_url` 用于小程序直接 PUT 到 COS，`object_key` 需要在 complete 阶段传回。

### 2. 小程序 PUT 到 COS

使用 `direct-init` 返回的 `upload_url` 上传文件内容。

### 3. 完成直传

```http
POST /uploads/cos/direct-complete
Authorization: Bearer <visitor_session_token>
Content-Type: application/json
```

请求体沿用现有平台上传完成契约，必须包含 `scene: "picture_comment"` 和 `object_key`。完成后后端返回文件对象 ID，小程序把该 ID 放入评论提交的 `image_file_ids`。

规则：

- visitor token 只允许上传 `picture_comment` 场景。
- visitor token 上传 `picture_library` 等 admin 场景会返回 403。
- 单图大小上限 5MB。
- 评论提交最多携带 3 个 `image_file_ids`。
- `image_file_ids` 必须来自 `picture_comment` 场景且文件对象状态为 `active`。

## 小程序交互建议

- 评论列表分页加载，默认 `pageSize=20`。
- 评论输入框提交时先禁用按钮，接口返回后把新评论插入列表顶部。
- 图片上传建议先完成所有 `direct-complete`，再提交评论。
- 上传失败的图片不要放入 `image_file_ids`。
- 评论图片预览直接使用后端返回的 `images[].url`。
- 评论发布失败时保留输入内容和已选图片，提示用户重试。

## 后端验收记录

执行日期：2026-06-06

已完成接口：

- `GET /visitor/picture-library/assets/:id/comments`
- `POST /visitor/picture-library/assets/:id/comments`
- `POST /uploads/cos/direct-init`，支持 `scene=picture_comment`
- `POST /uploads/cos/direct-complete`，支持 visitor `picture_comment` 场景

验证结果：

| 检查项 | 结果 |
| --- | --- |
| 评论列表公开访问 | 200 |
| 未登录提交评论 | 401 |
| visitor token 提交纯文字评论 | 返回 `status=visible` |
| 提交后评论列表可见 | 最新评论出现在列表顶部 |
| 提交 4 张评论图片 | 400，提示 `评论图片最多 3 张` |
| visitor 初始化 `picture_comment` 直传 | 返回 `object_key` |
| visitor 初始化 `picture_library` 直传 | 403 |

本轮还修正了评论创建阻塞问题：`comment_count` 同步更新改为后台 best-effort，不再拖慢评论提交主链路。

## 待小程序复测

- 使用真实 visitor session token 提交纯文字评论。
- 使用真实 visitor session token 上传 1-3 张评论图片并提交评论。
- 评论列表能展示新评论和评论图片。
- 上传失败时不提交无效 `image_file_ids`。
- visitor token 无法上传非 `picture_comment` 场景。
