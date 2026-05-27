# 微信小程序施工日志图片 COS 直传对接说明

日期：2026-05-15  
适用端：微信小程序员工发布施工日志  
状态：已对接，线上单图/多图验收通过。2026-05-27 起旧接口 `POST /uploads/images` 已退休，不再允许 fallback。

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

多图直传并发限制为 2。直传失败时提示用户重试，不再回退旧接口。

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

## 7. 2026-05-15 线上验收记录

验收范围：

- 租户：`51111111-1111-4111-8111-111111111111`
- 项目：`5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa`
- 员工：`5aaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa`
- 时间：2026-05-15 10:40-10:43 左右

实际落库结果：

| 日志 ID | 图片数 | 内容 | 阶段 |
| --- | ---: | --- | --- |
| `d6ae89b1-1fe7-497c-8ace-933c595f920b` | 1 | 小米 | `tiling` |
| `556985e2-9200-4d5d-b95e-f8421f353307` | 1 | 固始 | `tiling` |
| `1f9398f8-b0ce-4b34-b086-e20b5c28480b` | 3 | 固始 | `tiling` |
| `6d845492-35cb-41ce-ac7d-002285fd0519` | 2 | 固始 | `tiling` |
| `4719f406-fcfc-4464-9301-894057a2f0e5` | 2 | 固始 | `tiling` |

验收结论：

- 本次实际图片分布为 `1、1、3、2、2`，共 `9` 张。
- `platform_file_objects` 中 `scene = project_log` 的对应对象共 `9` 条，状态均为 `active`。
- 后端对账 worker 最新结果：`project_log.scanned = 9`，`summary.exists = 9`。
- 最新这批员工施工日志未观察到 `/uploads/images` 回退，均走 `/uploads/cos/direct-init` 和 `/uploads/cos/direct-complete`。
- `POST /project-logs` 均创建成功，业务表 `project_logs.images` 保存稳定 COS object key，不保存短期 signed URL。
