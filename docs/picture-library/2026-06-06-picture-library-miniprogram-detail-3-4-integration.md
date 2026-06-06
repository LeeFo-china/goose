# 图片资料库 detail 3:4 展示图小程序对接文档

日期：2026-06-06

## 背景

产品要求图片详情页实现“统一高度 + 不留白 + 小程序侧不裁切”。由于源图比例不一致，小程序直接使用原图无法同时满足这三个条件。

后端已新增统一展示图字段 `images.detail`，固定比例为 3:4。小程序详情页优先使用 `images.detail` 渲染固定比例图片区域。

## 当前状态

当前后端已返回 `images.detail`。

详情接口现在返回：

- `images.detail`
- `images.thumb`
- `images.cover`
- `images.large`
- `images.original`

其中 `images.detail` 是固定 3:4 安全裁剪展示图；`thumb` / `large`
仍是等比例缩放图，不建议用于统一高度详情主图场景。

## 接口范围

### 图片详情

```http
GET /visitor/picture-library/assets/:id
```

详情接口 `data.images` 下已新增：

```json
{
  "data": {
    "id": "uuid",
    "title": "装修效果图",
    "image": {
      "url": "https://...",
      "variant": "large",
      "width": 1200,
      "height": 1600,
      "file_size": 123456,
      "mime_type": "image/webp"
    },
    "images": {
      "detail": {
        "url": "https://...",
        "variant": "detail",
        "width": 900,
        "height": 1200,
        "file_size": 123456,
        "mime_type": "image/webp"
      },
      "thumb": {
        "url": "https://...",
        "variant": "thumb",
        "width": 240,
        "height": 320,
        "file_size": 12345,
        "mime_type": "image/webp"
      },
      "cover": {
        "url": "https://...",
        "variant": "cover",
        "width": 1200,
        "height": 900,
        "file_size": 123456,
        "mime_type": "image/webp"
      },
      "large": {
        "url": "https://...",
        "variant": "large",
        "width": 1200,
        "height": 1600,
        "file_size": 123456,
        "mime_type": "image/webp"
      },
      "original": null
    }
  },
  "message": "success"
}
```

## 字段定义

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `images.detail` | object/null | 图片详情页统一展示图 |
| `images.detail.variant` | string | 固定为 `detail` |
| `images.detail.width` | number/null | 目标比例宽度，宽高比固定为 3:4 |
| `images.detail.height` | number/null | 目标比例高度，宽高比固定为 3:4 |
| `images.detail.mime_type` | string | 预期为 `image/webp` |

后端目标规格：

| 项 | 约定 |
| --- | --- |
| 比例 | 3:4 |
| 建议尺寸 | `900x1200` 或等比例尺寸 |
| 格式 | WebP |
| 生成方式 | 后端基于源图做居中安全裁剪，生成固定比例图 |
| 小程序使用场景 | 图片详情页主图、需要统一高度的详情展示区域 |

## 小程序渲染规则

### 优先级

详情页主图取图优先级：

```text
images.detail -> images.large -> images.cover -> images.original -> images.thumb -> image
```

小程序必须兼容 `images.detail` 暂时为空的情况。

### 推荐渲染

当 `images.detail` 存在时：

- 容器比例固定为 3:4。
- 图片使用 `images.detail.url`。
- 小程序侧不要再基于原图做裁剪计算。
- 可以使用固定比例容器配合 `image mode="aspectFill"`；由于后端 detail 已经是 3:4，正常不会再发生额外裁切。

当 `images.detail` 不存在时：

- 使用旧的回退链路。
- 允许维持现有展示策略。
- 不要为了兼容旧图强制改动现有列表或互动逻辑。

## 后端实现要求

后端已完成：

1. `picture_asset_variants.variant` 支持新值 `detail`。
2. 变体补齐脚本支持生成 `detail`。
3. 生成策略固定为 3:4，开发库当前尺寸为 `900x1200`。
4. 详情接口 `GET /visitor/picture-library/assets/:id` 返回 `images.detail`。
5. 现有 `image` 字段保持兼容，不因为新增 `detail` 改变含义。
6. 健康检查已纳入 `detail` 缺失规格检测。

后续可选扩展：

- 小程序已接入后，可逐步考虑列表页是否也需要同类固定比例字段。

## 验收标准

后端验收：

- 任意已发布图片详情返回 `images.detail`。
- `images.detail.variant=detail`。
- `images.detail.width / images.detail.height = 3 / 4`。
- `images.detail.url` 可访问。
- `images.thumb`、`images.cover`、`images.large` 等旧字段不受影响。
- 变体补齐复跑后 `detail` 缺失数为 0。

开发库后端验收结果：

| 检查项 | 结果 |
| --- | --- |
| `detail` 补齐 dry-run | `candidate_asset_count=0`，`missing_variant_count=0` |
| 健康检查 | 196 张图片，18 个分类，`missing_variant_asset_total=0`，`issue_total=0` |
| 详情接口抽查 | `images.detail.variant=detail` |
| 详情图尺寸 | `900x1200` |
| 旧字段兼容 | `images.thumb` / `images.cover` / `images.large` 正常返回 |

小程序验收：

- 详情页优先展示 `images.detail.url`。
- 多张不同比例源图在详情页展示区域高度一致。
- 使用 `detail` 时无留白。
- 小程序侧不再针对源图比例做额外裁剪计算。
- `images.detail=null` 时可回退旧展示，不阻断页面渲染。

## 注意事项

- 严格意义上，“统一高度 + 不留白 + 完全不裁切源图”不能同时成立。
- 本方案中的“不裁切”指小程序侧不再裁切；固定比例展示图由后端生成。
- 后端生成 `detail` 时会进行可控安全裁剪，避免把裁剪逻辑分散到多个小程序页面。

## 对接状态

- 后端文档：已提供。
- 后端实现：已完成。
- 小程序实现：待对接。
- 联调前置：小程序可以开始优先读取 `images.detail`，并保留旧字段回退链路。
