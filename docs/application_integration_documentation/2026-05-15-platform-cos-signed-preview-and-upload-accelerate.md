# 平台 COS 图片预览与直传加速对接说明

日期：2026-05-15

## 背景

平台文件已迁移到腾讯云 COS，头像、日志评论图片等场景默认按签名 URL 访问。直传完成后如果前端直接使用 COS 原始公开地址，会在私有桶或签名访问策略下出现图片加载失败。

## 本次后端调整

- `/uploads/cos/direct-complete` 返回的 `url` 改为按 `PLATFORM_FILE_ACCESS_POLICY` 解析后的访问 URL。
- Admin 头像预览统一走 `/uploads/public-url?path=...`，由后端按最新策略生成签名跳转 URL。
- 新增平台配置 `PLATFORM_COS_UPLOAD_USE_ACCELERATE`：
  - `false`：默认使用 bucket 地域域名上传。
  - `true`：直传上传 URL 和后端兜底中转上传都使用腾讯云 COS 全球加速域名。
- Admin 员工/客户头像在直传开启时不再静默回退到 `/uploads/images`，避免直传失败时进入 10-40 秒级服务器中转慢链路；直传失败会直接展示 COS 返回状态，便于定位 CORS、签名或网络问题。

## Admin 对接

Admin 头像上传无需额外改接口：

1. 上传仍调用 `/uploads/cos/direct-init`。
2. 浏览器 PUT 到 `upload_url`。
3. 调用 `/uploads/cos/direct-complete`。
4. 预览图片使用 `/uploads/public-url?path=${storage_path}`。

如果超管后台开启 `PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`，Admin 会自动拿到加速上传 URL。员工/客户头像直传失败时，不再自动回退到 `/uploads/images`。

## 微信小程序对接

小程序端无需改上传流程。继续使用现有三段式直传：

1. `/uploads/cos/direct-init`
2. PUT `upload_url`
3. `/uploads/cos/direct-complete`

如果后端配置开启 `PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`，小程序拿到的 `upload_url` 会自动变为腾讯云 COS 全球加速上传域名。

## 当前生产配置

- Bucket：`windwill-1259348056`
- Region：`ap-nanjing`
- 全球加速域名：`windwill-1259348056.cos.accelerate.myqcloud.com`
- 系统开关：`PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`
- 直传 URL 验证结果：后端已生成 `https://windwill-1259348056.cos.accelerate.myqcloud.com/...` 上传地址。

服务器端探测结果：

- 普通 COS 上传：约 `911ms`
- 全球加速 COS 上传：约 `1918ms`
- 结论：腾讯云侧全球加速已开启，系统侧开关已打开。

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

## 小程序评论图片验收结果

单图上传实测：

- 图片大小：`155874B`
- `compress`：`55ms`
- `direct-init`：`511ms`
- `read-local-file`：`10ms`
- `put-cos`：`2668ms`
- `direct-upload-total`：`3200ms`
- `direct-complete-async`：`536ms`

对比全球加速开启前：

- 加速前 `put-cos`：`25803ms`
- 加速后 `put-cos`：`2668ms`
- 加速前 `direct-upload-total`：`27701ms`
- 加速后 `direct-upload-total`：`3200ms`

多图上传实测：

- 图片数量：`3`
- 总大小：`785945B`
- 并发数：`2`
- `direct-upload-total`：`8366ms`
- 单张 `put-cos`：`3214ms`、`3018ms`、`4212ms`
- `direct-complete-async`：`821ms` 到 `916ms`

验收判断：

- 单图 100-300KB 上传总耗时约 `3.2s`，通过。
- 3 图约 768KB 上传总耗时约 `8.4s`，通过。
- 本轮测试未出现 `/uploads/images` fallback。
- 本轮测试未出现 `direct-complete-async-failed`。

## 后续观察项

- 继续抽样观察单图、2 图、3 图上传耗时，重点看 `put-cos` 和 `direct-upload-total`。
- 如果 3 图以内持续稳定在 `10s` 内，可视为小程序评论图片上传链路验收通过。
- 如果再次出现 `put-cos > 10s`，优先排查手机网络到 COS 全球加速域名的链路，不优先改后端。
- 小程序端日志目前存在输出顺序乱序、同一 `direct-init` 偶发重复打印的问题，建议小程序团队后续整理日志打印，不影响当前上传链路。
