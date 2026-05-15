# 微信小程序工序验收图片 COS 直传对接

日期：2026-05-15

## 背景

后端已开放 `project_acceptance` 场景的 COS 直传能力。Admin 工序验收图片已改为优先走 COS 直传。微信小程序端由小程序团队对接，本仓库不直接修改小程序代码。

## 推荐链路

```text
选择图片
-> POST /uploads/cos/direct-init
-> PUT upload_url 到腾讯云 COS
-> POST /uploads/cos/direct-complete
-> 将返回的 storage_path/object_key 写入验收单 images 或 rectification_images
```

## 1. 初始化直传

```http
POST /uploads/cos/direct-init
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "scene": "project_acceptance",
  "project_id": "项目ID",
  "filename": "acceptance.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 382144
}
```

响应重点字段：

```json
{
  "provider": "tencent_cos",
  "bucket": "windwill-1259348056",
  "region": "ap-nanjing",
  "object_key": "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg",
  "storage_path": "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg",
  "upload_url": "https://windwill-1259348056.cos.accelerate.myqcloud.com/...",
  "method": "PUT",
  "headers": {
    "content-type": "image/jpeg"
  },
  "expires_in": 900
}
```

## 2. 上传到 COS

用微信小程序文件上传能力或请求能力将本地图片 `PUT` 到 `upload_url`。

要求：

- Method 使用响应里的 `method`，当前为 `PUT`。
- Header 使用响应里的 `headers`，至少要包含对应的 `content-type`。
- 成功状态按 `200` 或腾讯云 SDK 返回成功判断。
- 如果响应 header 有 `ETag`，下一步传给后端；没有也可以不传。

## 3. 登记上传结果

```http
POST /uploads/cos/direct-complete
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "scene": "project_acceptance",
  "project_id": "项目ID",
  "filename": "acceptance.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 382144,
  "object_key": "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg",
  "etag": "COS返回的ETag，可选"
}
```

响应重点字段：

```json
{
  "url": "后端解析后的预览URL",
  "path": "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg",
  "storage_path": "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg",
  "object_key": "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg",
  "provider": "tencent_cos"
}
```

小程序提交验收单时，建议存 `storage_path`，没有则使用 `object_key` 或 `path`。

## 4. 图片字段映射

验收项目现场照片：

```json
{
  "items": [
    {
      "id": "item-id",
      "images": [
        "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg"
      ]
    }
  ]
}
```

整改回复照片：

```json
{
  "items": [
    {
      "id": "item-id",
      "rectification_images": [
        "tenants/{tenant_id}/project-acceptance/projects/{project_id}/2026/05/15/{uuid}.jpg"
      ]
    }
  ]
}
```

## 5. 验收标准

- 上传 URL host 为 `windwill-1259348056.cos.accelerate.myqcloud.com`。
- 成功后 `platform_file_objects` 有 `scene=project_acceptance` 的记录。
- 验收详情、流程记录、客户引用图片都能正常预览。
- 正常链路不再走 `POST /uploads/images`。
- 失败时提示“图片上传失败，请重试”，不要让提交按钮一直 loading。

## 6. 注意事项

- 多图上传建议并发控制为 `2`，避免移动网络下 PUT 波动。
- 上传成功但 `direct-complete` 失败时，应提示重试；后端不会把失败静默当成成功。
- 生产 timing 日志只记录超过阈值的慢阶段，小程序侧如需排查可临时打开自己的上传 timing 日志。
