# 施工日志评论图片 COS 直传稳定性收口

日期：2026-05-15  
范围：后端 API、微信小程序施工日志评论图片上传  
结论：单图 COS 直传链路验收通过；多图在微信小程序端多次 PUT COS 表现不稳定，当前稳定策略是单图直传、多图回退 `/uploads/images`。

## 1. 当前验收结果

已完成连续 10 次人工验证：

- 未出现 `direct-complete-async-failed`。
- 上传速度稳定。
- 评论发布后图片预览可打开。
- 未出现评论图片丢失。

最近一次链路耗时参考：

| 阶段 | 耗时 |
| --- | ---: |
| compress | 6ms |
| direct-init | 949ms |
| read-local-file | 5ms |
| put-cos | 400ms |
| direct-complete-async | 不阻塞发布 |

多图直传验证结果：

- 2 张图并发 PUT COS 时，单张 PUT 从 400ms 级退化到 3.7s 左右。
- 2 张图串行 PUT COS 时，单张 PUT 仍出现 8s-9s 波动。
- 因此当前不把多图纳入小程序端 COS 直传路径。

用户等待链路已经从“后端上传 + 保存”改为：

```text
direct-init -> read-local-file -> put-cos -> 返回 object_key -> 创建评论
```

`direct-complete` 仍会执行，但已经改为小程序端 best-effort 异步调用，不再阻塞发布按钮。

多图等待链路：

```text
file_count > 1 -> POST /uploads/images
```

小程序端会输出：

```text
[PROJECT_LOG_COMMENT_UPLOAD_TIMING] direct-skip-multiple-files
```

表示多图已进入旧上传回退链路。

## 2. 后端能力

### 2.1 直传初始化

```http
POST /uploads/cos/direct-init
```

当前仅开放：

```json
{
  "scene": "project_log_comment",
  "filename": "a.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 366202
}
```

返回核心字段：

```json
{
  "upload_url": "https://...signed...",
  "object_key": "tenants/{tenant_id}/project-log-comment/unassigned/yyyy/mm/dd/{uuid}.jpg",
  "storage_path": "tenants/{tenant_id}/project-log-comment/unassigned/yyyy/mm/dd/{uuid}.jpg",
  "method": "PUT",
  "headers": {
    "content-type": "image/jpeg"
  },
  "expires_in": 900,
  "expires_at": "..."
}
```

### 2.2 直传完成登记

```http
POST /uploads/cos/direct-complete
```

该接口职责是登记 `platform_file_objects`，不再作为用户发布的强依赖。

小程序端在 COS PUT 成功后异步调用：

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

后端登记逻辑：

- 默认不 `HEAD` COS，降低完成接口延迟。
- 直接插入 `platform_file_objects`。
- 如唯一键冲突，回查已有记录并返回，保证重复 complete 幂等。
- `platform_file_objects.public_url` 保存稳定 COS URL，不保存短期 signed URL。

### 2.3 已完成性能优化

- `direct-complete` 默认跳过同步 COS `HEAD`。
- COS 配置、存储 provider 配置增加 60 秒短缓存。
- 上传控制器优先使用已鉴权 token 中的 `tenant_id/customer_id/employee_id`，减少重复查身份。
- 微信 OAuth 和业务身份强校验增加 10 秒成功短缓存。
- 微信 OAuth 校验和业务身份校验并行执行。
- 小程序端将 `direct-complete` 改为 best-effort 异步执行。
- 小程序端限制 `file_count === 1` 才启用 COS 直传；多图回退 `/uploads/images`。

## 3. 补偿巡检脚本

为防止极端情况下小程序被杀进程、网络断开导致 `direct-complete` 未执行，后端新增补偿脚本：

```text
apps/api/src/scripts/project-log-comment-cos-reconcile.ts
```

package script：

```bash
bun run --cwd apps/api project-log-comments:cos:reconcile -- --limit 200
```

### 3.1 Dry-run

只扫描，不写库：

```bash
bun run --cwd apps/api project-log-comments:cos:reconcile -- \
  --tenant-id 51111111-1111-4111-8111-111111111111 \
  --limit 500 \
  --out reports/project-log-comment-cos-reconcile
```

输出：

```text
reports/project-log-comment-cos-reconcile/{timestamp}.csv
```

状态说明：

| status | 含义 |
| --- | --- |
| `exists` | 业务表图片已存在 `platform_file_objects` 记录 |
| `dry_run_missing` | 业务表保存了 COS object key，但文件索引缺失 |
| `reconciled` | `--apply` 后补写成功 |
| `failed` | 补写失败，通常是 COS `HEAD` 失败或配置异常 |

### 3.2 Apply

确认 dry-run 结果后再执行补写：

```bash
bun run --cwd apps/api project-log-comments:cos:reconcile -- \
  --tenant-id 51111111-1111-4111-8111-111111111111 \
  --limit 500 \
  --apply \
  --out reports/project-log-comment-cos-reconcile
```

补写时会：

- 扫描 `project_log_comments.images` 中的 COS object key。
- 查询 `platform_file_objects` 是否已有记录。
- 对缺失项执行 COS `HEAD` 校验。
- 写入 `platform_file_objects`：
  - `scene = project_log_comment`
  - `owner_type = project_log_comment`
  - `owner_id = project_log_comments.id`
  - `metadata.direct_upload_reconciled = true`

### 3.3 运行环境要求

脚本需要和 API 服务相同的环境变量：

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
PLATFORM_STORAGE_PROVIDER=tencent_cos
TENCENT_COS_SECRET_ID=...
TENCENT_COS_SECRET_KEY=...
PLATFORM_COS_BUCKET=...
PLATFORM_COS_REGION=...
PLATFORM_COS_PUBLIC_BASE_URL=...
```

本地未注入 `SUPABASE_URL` 时，脚本会直接失败；应在服务器或 CI 运行环境执行。

## 4. 建议运维策略

第一阶段建议人工执行：

- 每天或每次发布后执行 dry-run。
- 如果 `dry_run_missing = 0`，无需 apply。
- 如果出现缺失，先抽查 CSV，再执行 `--apply`。

稳定 1 周后可以接入定时任务：

```bash
bun run --cwd apps/api project-log-comments:cos:reconcile -- \
  --since "$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" \
  --limit 1000 \
  --apply \
  --out /var/log/gooes/project-log-comment-cos-reconcile
```

注意：Linux 环境 `date` 参数需要替换为 GNU date 写法。

## 5. 后续复用规则

后续其它上传场景迁移直传时，必须同时满足：

- 业务表保存稳定 object key，不保存短期 signed URL。
- 前端 PUT 成功后可以先提交业务数据。
- `complete` 可异步，但必须有后端补偿巡检脚本。
- 每个场景必须定义 object key 前缀、大小限制、权限校验和补偿范围。
- 图片读取统一走 `resolveStoredFileUrl` / `resolveStoredFileUrlList`。
- 微信小程序端多图不要直接复用 `Taro.request PUT` 多次直传，需要单独验证；当前已验证该路径不稳定。

建议迁移顺序：

1. 客户/员工头像。
2. 工地日志主图。
3. 工序验收整改图片。
4. 费用审批凭证。
5. H5 营销页图片。
