# 平台 COS 图片预览与直传加速对接说明

日期：2026-05-15

## 背景

平台文件已迁移到腾讯云 COS，头像、日志评论图片等场景默认按签名 URL 访问。直传完成后如果前端直接使用 COS 原始公开地址，会在私有桶或签名访问策略下出现图片加载失败。

## 本次后端调整

- `/uploads/cos/direct-complete` 返回的 `url` 改为按 `PLATFORM_FILE_ACCESS_POLICY` 解析后的访问 URL。
- Admin 头像预览统一走 `/uploads/public-url?path=...`，由后端按最新策略生成签名跳转 URL。
- 新增平台配置 `PLATFORM_COS_UPLOAD_USE_ACCELERATE`：
  - `false`：默认使用 bucket 地域域名上传。
  - `true`：直传上传 URL 使用腾讯云 COS 全球加速域名。

## Admin 对接

Admin 头像上传无需额外改接口：

1. 上传仍调用 `/uploads/cos/direct-init`。
2. 浏览器 PUT 到 `upload_url`。
3. 调用 `/uploads/cos/direct-complete`。
4. 预览图片使用 `/uploads/public-url?path=${storage_path}`。

如果超管后台开启 `PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`，Admin 会自动拿到加速上传 URL。

## 微信小程序对接

小程序端无需改上传流程。继续使用现有三段式直传：

1. `/uploads/cos/direct-init`
2. PUT `upload_url`
3. `/uploads/cos/direct-complete`

如果后端配置开启 `PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`，小程序拿到的 `upload_url` 会自动变为腾讯云 COS 全球加速上传域名。

## 腾讯云配置要求

使用全球加速前，需要在腾讯云 COS bucket 开启全球加速。腾讯云官方说明：上传场景可使用 `<BucketName-APPID>.cos.accelerate.myqcloud.com`，适用于 `PUT Object`、`POST Object`、分块上传等写入场景。

同时 COS CORS 需要包含实际前端来源：

- `https://admin.goodcms.cn`
- 小程序网络请求对应域名
- `https://api.goodcms.cn`

允许方法至少包含：

- `PUT`
- `GET`
- `POST`
- `HEAD`

允许请求头建议为 `*`，暴露响应头建议包含：

- `ETag`
- `Content-Length`
- `x-cos-request-id`

## 验收标准

- Admin 员工头像上传后不再出现“头像图片加载失败，请重新上传”。
- 员工头像预览请求最终跳转到可访问的签名 URL。
- 小程序评论图片上传日志中 `direct-init` 到 `direct-complete` 的间隔明显下降。
- 后端不再出现头像上传回退到 `/uploads/images` 的慢请求。
