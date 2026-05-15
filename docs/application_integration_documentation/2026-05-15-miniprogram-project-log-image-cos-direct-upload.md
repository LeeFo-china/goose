# 微信小程序施工日志图片 COS 直传对接说明

日期：2026-05-15  
适用端：微信小程序员工发布施工日志  
状态：已对接，待线上单图/多图验收。

## 1. 流程

```text
选择现场图片
-> prepareImagesForUpload
-> POST /uploads/cos/direct-init，scene=project_log，必须传 project_id
-> Taro.request PUT upload_url
-> 立即返回 storage_path/object_key 给创建施工日志流程
-> 异步 POST /uploads/cos/direct-complete
-> POST /project-logs 创建施工日志，images 保存 object key
```

多图直传并发限制为 2。直传失败时回退旧接口：

```http
POST /uploads/images
```

## 2. 环境变量

```env
TARO_APP_DIRECT_COS_UPLOAD=true
TARO_APP_UPLOAD_TIMING_LOG_ENABLED=false
```

`TARO_APP_UPLOAD_TIMING_LOG_ENABLED=true` 只用于临时排查上传耗时。

## 3. 后端接口

### 3.1 初始化直传

```http
POST /uploads/cos/direct-init
```

请求：

```json
{
  "scene": "project_log",
  "project_id": "5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa",
  "filename": "site.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 366202
}
```

后端强校验：

- 必须登录。
- 必须是员工身份。
- 必须对 `project_id` 有 `project_log.create` 权限。
- 单张图片不能超过当前上传大小限制。

### 3.2 完成登记

```http
POST /uploads/cos/direct-complete
```

请求：

```json
{
  "scene": "project_log",
  "project_id": "5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa",
  "filename": "site.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 366202,
  "object_key": "tenants/{tenant_id}/project-log/projects/{project_id}/yyyy/mm/dd/{uuid}.jpg",
  "etag": "..."
}
```

调用方式：

- 不阻塞施工日志创建。
- 成功后写入 `platform_file_objects`。
- 失败时由后端对账 worker 兜底。

## 4. 创建施工日志

`POST /project-logs` 的 `images` 保存稳定 object key：

```json
{
  "project_id": "5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa",
  "stage_code": "water_electricity",
  "node_name": "水电整改",
  "content": "现场施工记录",
  "images": [
    "tenants/51111111-1111-4111-8111-111111111111/project-log/projects/5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa/2026/05/15/a.jpg"
  ]
}
```

字段选择顺序：

```ts
storage_path || object_key || path || url
```

## 5. 后端对账

后端 worker 已纳入施工日志图片：

```text
goose-project-log-comment-cos-reconcile-worker
```

每次 tick 同时扫描：

- `project_logs.images`
- `project_log_comments.images`

施工日志图片缺失 `platform_file_objects` 时，会执行 COS `HEAD` 并补写：

- `scene = project_log`
- `owner_type = project_log`
- `owner_id = project_logs.id`
- `metadata.direct_upload_reconciled = true`

也可以手动执行：

```bash
bun run --cwd apps/api project-logs:cos:reconcile -- \
  --tenant-id 51111111-1111-4111-8111-111111111111 \
  --limit 500 \
  --apply
```

## 6. 验收标准

- 单图发布施工日志 3 次，图片可预览。
- 多图发布施工日志 3 次，图片可预览。
- 后端日志中 `project_log` 的 `direct-init/direct-complete` 均为 200。
- 不出现新的 `/uploads/images` 兜底，除非主动模拟直传失败。
- 对账 worker 无 `failed`，如出现 `reconciled` 应能解释为异步 complete 漏登记。
