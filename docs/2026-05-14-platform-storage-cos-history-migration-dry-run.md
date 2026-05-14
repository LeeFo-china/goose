# 平台历史图片迁移 COS Dry-run 方案

日期：2026-05-14  
阶段：平台存储迁移第二阶段  
目标：在不修改业务表、不删除 Supabase Storage 对象的前提下，先验证历史图片从 Supabase/旧 URL 迁移到腾讯云 COS 的可行性、规模、失败原因和回滚依据。

## 1. 当前进度

已完成：

- 新上传图片通过 `/uploads/images` 进入统一文件网关。
- COS 配置已接入平台配置，密钥使用 `TENCENT_COS_SECRET_ID` / `TENCENT_COS_SECRET_KEY` 独立配置。
- `platform_file_objects` 已记录新上传文件。
- 高频展示链路已支持 resolver：
  - 项目日志图片。
  - 项目详情日志封面。
  - 工序验收图片、整改图片、引用图片。
  - 客户自助端最近动态和项目日志图片。
  - 客户跟进评论图片。
- 第二批读路径已补 resolver：
  - 客户抖音截图 `customers.douyin_screenshot_images`。
  - 费用申请明细凭证 `expense_request_items.evidence_images`。
  - 费用打款凭证 `expense_request_settlements.evidence_images`。
  - 项目介绍费打款凭证 `project_referrals.paid_evidence_images`。
  - H5 活动页封面 `marketing_pages.cover_image`。

## 2. Dry-run 原则

- 只读业务表和旧文件，不修改业务表。
- 可以选择写入一张临时报告表或只生成本地 JSON/CSV 报告；第一版建议先生成报告文件。
- 不删除 Supabase Storage 对象。
- 不覆盖 COS 已存在对象；object key 使用新规则生成。
- 对每个旧图片值保留原始字段、原始值、解析结果、预估目标 object key、失败原因。

## 3. 扫描范围

第一批 dry-run 扫描以下字段：

| 优先级 | 表/来源 | 字段 | 备注 |
| --- | --- | --- | --- |
| P0 | `project_logs` | `images` | 项目日志主图，历史量最大 |
| P0 | `project_log_comments` | `images` | 日志评论图片 |
| P0 | 工序验收 action 表 | `images`、`rectification_images`、`referenced_images` | 以实际表结构为准 |
| P1 | `customer_follow_up_comments` | `images` | 客户跟进评论 |
| P1 | `customers` | `douyin_screenshot_images` | 抖音截图 |
| P1 | `expense_request_items` | `evidence_images` | 费用明细凭证 |
| P1 | `expense_request_settlements` | `evidence_images` | 费用打款凭证 |
| P1 | `project_referrals` | `paid_evidence_images` | 介绍费打款凭证 |
| P1 | `employees` | `avatar` | 员工头像 |
| P1 | `marketing_pages` | `cover_image` | H5 封面 |

第二批再处理 `payments.evidence_images`、`marketing_assets.file_url`、客户分享头像快照等低频或快照字段。

## 4. 旧值分类规则

每个图片字符串先按以下规则分类：

| 类型 | 判断 | 处理 |
| --- | --- | --- |
| 已是 COS object key | 以 `tenants/`、`public/`、`system/` 开头 | 不迁移，只计入 already_cos_object_key |
| 已是 COS/CDN URL | host 命中当前 COS/CDN 域名 | 不迁移，尝试反解 object key |
| Supabase public URL | URL host/path 包含 Supabase Storage `project-logs` | 下载后迁移 |
| Supabase legacy path | 非 http 且不是 COS object key | 按 `project-logs` bucket path 下载后迁移 |
| 外部 URL | http(s) 但不是平台 Supabase/COS | 第一版不迁移，只计入 external_url |
| 空值/非法值 | 空字符串、非字符串 | 跳过并计入 invalid |

## 5. Dry-run 输出报告

建议输出目录：

```text
reports/storage-migration/{yyyyMMdd-HHmmss}/
  summary.json
  items.csv
  failures.csv
  tenants.csv
```

`summary.json` 示例：

```json
{
  "started_at": "2026-05-14T12:00:00.000Z",
  "finished_at": "2026-05-14T12:05:00.000Z",
  "dry_run": true,
  "total_values": 1200,
  "migratable": 860,
  "already_cos": 180,
  "external_url": 90,
  "invalid": 12,
  "download_failed": 30,
  "duplicate_legacy_value": 28,
  "estimated_bytes": 987654321
}
```

`items.csv` 字段：

```text
tenant_id,source_table,source_id,source_field,array_index,legacy_value,value_type,legacy_bucket,legacy_path,target_object_key,estimated_size_bytes,status,reason
```

## 6. Worker 设计

第一版脚本建议放在：

```text
apps/api/src/scripts/storage-migration-dry-run.ts
```

当前已落地：

- 脚本路径：`apps/api/src/scripts/storage-migration-dry-run.ts`
- package script：`pnpm --dir apps/api storage:migration:dry-run -- ...`
- 支持参数：
  - `--tenant-id <uuid>`：扫描指定租户。
  - `--all-tenants`：扫描全部租户和平台公共数据。
  - `--limit <number>`：限制本次报告输出的图片值数量。
  - `--out <dir>`：指定报告输出根目录。
  - `--check-remote`：对可迁移对象执行 HEAD 检查并记录 content-length/失败原因。

执行参数：

```bash
pnpm --dir apps/api storage:migration:dry-run -- --tenant-id 51111111-1111-4111-8111-111111111111 --limit 500 --out reports/storage-migration
pnpm --dir apps/api storage:migration:dry-run -- --all-tenants --limit 5000 --out reports/storage-migration
```

第一版只做：

- 扫描数据库字段。
- 分类旧图片值。
- 对可迁移 Supabase 对象执行 HEAD 或轻量下载检查。
- 生成目标 COS object key。
- 输出报告。

暂不做：

- 上传 COS。
- 写入 `platform_file_objects`。
- 修改业务表。
- 删除旧对象。

## 7. 验收标准

进入真实迁移前，dry-run 必须满足：

- 单租户 dry-run 能完整扫描 P0/P1 字段并生成报告。
- 报告中每条记录能追溯到 `tenant_id + source_table + source_id + source_field + array_index`。
- `migratable` 样本中至少抽 20 条人工验证，旧图片可下载，目标 object key 符合规则。
- `download_failed` 有明确失败原因，例如 404、403、timeout、invalid_url。
- `external_url` 不进入迁移，避免误搬第三方图片。
- dry-run 重复执行不会产生数据库副作用。

## 8. 下一步

建议下一步先实现 `storage-migration-dry-run.ts` 的 P0 字段扫描和报告输出，然后选一个测试租户跑 500 条以内样本。dry-run 验收通过后，再进入“小批量真实上传 COS + 写入 platform_file_objects + 业务表仍不改”的阶段。

## 9. 第一次小批量验证记录

验证时间：2026-05-14  
租户：`91d255fe-60a2-4379-b939-8aff35e693ac`  
命令：

```bash
pnpm --dir apps/api storage:migration:dry-run -- --tenant-id 91d255fe-60a2-4379-b939-8aff35e693ac --limit 50 --check-remote --out /tmp/gooes-storage-migration-reports
```

报告目录：

```text
/tmp/gooes-storage-migration-reports/20260514T094625Z
```

结果摘要：

| 指标 | 数量 |
| --- | ---: |
| total_values | 49 |
| migratable | 25 |
| external_url | 23 |
| download_failed | 1 |
| invalid | 0 |
| estimated_bytes | 20,427,558 |

失败项：

- `expense_request_items.a4fcab99-987a-4c93-9563-f138b39e1cfc.evidence_images[0]`
- 原始值：`verify-expense-item-1`
- 分类：`supabase_legacy_path`
- 失败原因：`head_400`

结论：

- 项目日志历史 Supabase path 可访问，能拿到 `content-length`，具备进入小批量真实上传验证的条件。
- 外部 URL 被正确跳过，不会误迁移第三方图片。
- 空头像等无图片字段已从脚本中跳过，不再计入 invalid。
- 费用审批中存在测试占位路径，后续真实迁移前需要按 `download_failed` 清单人工判断是否忽略或修正。

## 10. 第一次真实上传样本记录

验证时间：2026-05-14  
输入报告：

```text
/tmp/gooes-storage-migration-reports/20260514T094625Z/items.csv
```

服务器执行预演：

```bash
bun src/scripts/storage-migration-upload.ts -- --input /tmp/gooes-storage-migration-upload-input/items.csv --limit 3 --out /tmp/gooes-storage-migration-upload-reports
```

预演结果：

- `planned=3`
- `failed=0`
- `already_exists=0`

服务器执行真实上传：

```bash
bun src/scripts/storage-migration-upload.ts -- --input /tmp/gooes-storage-migration-upload-input/items.csv --limit 3 --apply --out /tmp/gooes-storage-migration-upload-reports
```

真实上传报告：

```text
/tmp/gooes-storage-migration-upload-reports/20260514T095337Z
```

结果摘要：

| 指标 | 数量 |
| --- | ---: |
| total_items | 3 |
| uploaded | 3 |
| failed | 0 |
| already_exists | 0 |
| uploaded_bytes | 4,656,646 |

写入的 `platform_file_objects.id`：

- `b84d3df4-247f-44aa-8498-0835daf21f14`
- `8d957870-f8b3-4bb6-9037-e6fc1dd8086a`
- `d8d247c9-2e89-49dd-bf43-ba813700a081`

重要发现：

- COS 对象上传成功，`platform_file_objects` 已写入 3 条索引。
- 当前业务表未回填，线上展示仍读取旧 Supabase path，不受影响。
- 当前 `PLATFORM_COS_PUBLIC_BASE_URL` 拼出的 COS URL 返回 `403 Forbidden`，说明 COS bucket 或 CDN 公开读取策略尚未打通。
- 在公开访问或签名 URL 解析策略修复前，不能扩大真实迁移，也不能回填业务表。

下一步阻塞项：

1. 明确普通业务图片采用公开 CDN 访问，还是后端签名 URL 访问。
2. 如果采用公开 CDN，需配置 COS bucket/CDN 访问策略，并验证样本 URL 返回 `200`。
3. 如果采用签名 URL，需要改造 `file-url-resolver`，让 object key 出参生成短期可访问 URL，而不是直接拼 public base URL。
4. 访问策略验证通过后，再继续做 20 条以上真实迁移样本。
