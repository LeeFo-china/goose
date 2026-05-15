# 微信小程序施工日志评论图片 COS 直传对接说明

日期：2026-05-15  
适用端：微信小程序客户/员工施工日志评论  
状态：已对接，10 次人工验证通过。

## 1. 当前小程序流程

小程序端评论图片上传流程：

```text
选择图片
-> prepareImagesForUpload
-> POST /uploads/cos/direct-init
-> Taro.request PUT upload_url
-> 立即返回 storage_path/object_key 给评论发布流程
-> 异步 POST /uploads/cos/direct-complete
```

关键变化：

- 评论发布不再等待 `direct-complete`。
- `direct-complete` 失败只打 `direct-complete-async-failed` 日志，不阻塞用户。
- 评论保存的 `images` 必须优先使用 `storage_path/object_key/path`，不能保存本地临时路径。

## 2. 环境变量

小程序需要开启：

```env
TARO_APP_DIRECT_COS_UPLOAD=true
```

关闭时会回退到旧接口：

```http
POST /uploads/images
```

## 3. 请求接口

### 3.1 初始化直传

```http
POST /uploads/cos/direct-init
```

请求：

```json
{
  "scene": "project_log_comment",
  "filename": "a.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 366202
}
```

响应：

```json
{
  "upload_url": "https://...",
  "object_key": "tenants/{tenant_id}/project-log-comment/unassigned/yyyy/mm/dd/{uuid}.jpg",
  "storage_path": "tenants/{tenant_id}/project-log-comment/unassigned/yyyy/mm/dd/{uuid}.jpg",
  "method": "PUT",
  "headers": {
    "content-type": "image/jpeg"
  }
}
```

### 3.2 PUT 到 COS

使用 `Taro.request`：

```ts
await Taro.request({
  url: initData.upload_url,
  method: 'PUT',
  data: fileData,
  header: {
    ...(initData.headers || {}),
    'content-type': mimetype,
  },
});
```

成功条件：

```text
statusCode >= 200 && statusCode < 300
```

### 3.3 异步完成登记

```http
POST /uploads/cos/direct-complete
```

请求：

```json
{
  "scene": "project_log_comment",
  "filename": "a.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 366202,
  "object_key": "tenants/{tenant_id}/project-log-comment/unassigned/yyyy/mm/dd/{uuid}.jpg",
  "etag": "..."
}
```

调用方式：

- 不要 `await`。
- 成功打印 `direct-complete-async`。
- 失败打印 `direct-complete-async-failed`。

## 4. 评论提交

发布评论时，`images` 字段保存 object key：

```json
{
  "log_id": "...",
  "content": "按要求整改到位",
  "images": [
    "tenants/51111111-1111-4111-8111-111111111111/project-log-comment/unassigned/2026/05/15/a.jpg"
  ]
}
```

字段选择顺序：

```ts
storage_path || object_key || path || url
```

注意：

- `url` 只是本地预览兜底，不应作为最终保存值。
- 后端读取评论时会把 object key 解析为可预览 signed URL。

## 5. 日志判断

正常日志：

```text
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] compress
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] direct-init
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] read-local-file
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] put-cos
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] direct-complete-async
```

异常日志：

```text
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] direct-complete-async-failed
```

如果出现异常：

- 用户发布不应被阻塞。
- 图片如果已经保存到评论，后端补偿脚本会补 `platform_file_objects`。
- 若图片无法预览，优先检查 COS object 是否存在、bucket 签名 URL 策略、`resolveStoredFileUrl`。

## 6. 验收标准

本场景继续迭代前，必须满足：

- 连续 10 次单图上传无 `direct-complete-async-failed`。
- 多图上传不丢图。
- 评论发布按钮不会因 `direct-complete` 转圈。
- 评论列表和详情中的图片都能打开预览。
- 后端补偿脚本 dry-run 可扫描出缺失项。
