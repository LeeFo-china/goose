# 平台统一 COS 存储治理方案

日期：2026-05-15

## 结论

平台存储第一阶段已具备统一迁移到腾讯云 COS 的基础能力：新上传文件可通过统一文件网关写入 COS，直传链路支持签名 PUT URL，访问链路支持后端签名 URL 解析。下一步不建议再新增 Supabase Storage 或本地 `/uploads/images` 的新业务写入能力，新业务应直接接入 COS 直传或统一文件网关。

## 当前生产口径

- 存储提供商：`PLATFORM_STORAGE_PROVIDER=tencent_cos`
- Bucket：`windwill-1259348056`
- Region：`ap-nanjing`
- 上传加速：`PLATFORM_COS_UPLOAD_USE_ACCELERATE=true`
- 加速上传域名：`windwill-1259348056.cos.accelerate.myqcloud.com`
- 访问策略：私有 bucket 优先，后端返回签名 URL。
- 直传登记：`/uploads/cos/direct-complete` 写入 `platform_file_objects`。

## 业务接入边界

| 业务 | 推荐上传方式 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| 小程序评论图片 | COS 直传 | 已接入 | 小程序端不再由本仓库修改，后续只给对接文档 |
| 小程序施工日志图片 | COS 直传 | 已接入 | 由 reconcile worker 兜底补登记 |
| Admin 员工头像 | COS 直传 | 已接入 | 直传失败直接报错，不静默回退慢链路 |
| Admin 客户头像 | COS 直传 | 已接入 | 预览走 `/uploads/public-url` |
| 工序验收图片 | COS 直传 | Admin 已接入，小程序待对接 | 场景 `project_acceptance` |
| 费用审批附件 | COS 直传 | Admin 已接入 | 场景 `expense_request` |
| H5 活动图片 | 先保持 `/uploads/images` 兼容 | 待逐步切换 | 后续按页面逐个改为直传 |
| 360 全景图 | COS 对象存储 | 规划中 | 原图、拼接图、瓦片都应走 COS |

## URL 有效期建议

当前系统使用 `PLATFORM_COS_SIGNED_URL_TTL_SECONDS` 控制签名 URL 默认有效期。第一版建议：

| 场景 | 建议有效期 | 原因 |
| --- | --- | --- |
| 上传 PUT URL | `900s` | 覆盖移动端选择图片和弱网重试，不宜过长 |
| 头像预览 | `3600s` | Admin 列表/详情会重复加载，减少刷新压力 |
| 评论/施工日志图片 | `1800s` | 用户查看频繁，但图片仍属于租户业务数据 |
| 项目验收/费用附件 | `1800s` | 业务图片敏感度中等，按会话级访问 |
| 360 全景瓦片 | `3600s` 到 `7200s` | 瓦片数量多，短 TTL 会造成频繁签名刷新 |

现阶段后端是全局 TTL。如果后续要更精细控制，应新增“场景级访问策略表”或系统配置项，例如：

```text
PLATFORM_COS_SIGNED_URL_TTL_BY_SCENE
```

配置示例：

```json
{
  "employee_avatar": 3600,
  "customer_avatar": 3600,
  "project_log_comment": 1800,
  "project_log": 1800,
  "panorama_tile": 7200
}
```

## 日志降噪口径

后端新增上传 timing 降噪参数：

```env
UPLOAD_TIMING_LOG_ENABLED=true
UPLOAD_TIMING_LOG_SCENES=project_log_comment,project_log,project_acceptance,expense_request,employee_avatar,customer_avatar
UPLOAD_TIMING_LOG_MIN_DURATION_MS=1000
```

含义：

- `UPLOAD_TIMING_LOG_ENABLED=false`：生产默认关闭。
- `UPLOAD_TIMING_LOG_ENABLED=true`：开启上传 timing。
- `UPLOAD_TIMING_LOG_SCENES`：只输出指定场景，逗号分隔；为空表示所有场景。
- `UPLOAD_TIMING_LOG_MIN_DURATION_MS`：只输出超过阈值的阶段；为空或 `0` 表示全量输出。

建议生产排障时使用：

```env
UPLOAD_TIMING_LOG_ENABLED=true
UPLOAD_TIMING_LOG_SCENES=project_log_comment,project_acceptance,expense_request,employee_avatar,customer_avatar
UPLOAD_TIMING_LOG_MIN_DURATION_MS=1000
```

稳定后恢复：

```env
UPLOAD_TIMING_LOG_ENABLED=false
```

## 迁移推进顺序

1. 已完成业务继续观察：评论图片、施工日志图片、员工头像、客户头像。
2. 工序验收图片改为 COS 直传。
3. 费用审批附件改为 COS 直传。
4. H5 活动图片改为 COS 直传。
5. 360 全景原图、拼接图、瓦片统一落 COS。
6. 对旧 Supabase Storage 和历史 URL 做 dry-run、迁移、校验、只读兼容。
7. 关闭新业务 `/uploads/images` 写入，只保留历史兼容入口。

## 验收标准

- 新业务不再新增 Supabase Storage 写入。
- 新业务上传成功后必须在 `platform_file_objects` 有登记记录。
- 直传上传失败时前端明确报错，不静默回退到慢链路。
- 图片预览通过后端签名 URL 或受控 CDN URL 打开。
- 小程序侧如需改动，只提供对接文档，由小程序团队执行。

## 2026-05-15 生产配置记录

已在服务器 `/home/ubuntu/actions-runner/.env` 和当前 API 工作区 `.env` 写入：

```env
UPLOAD_TIMING_LOG_ENABLED=true
UPLOAD_TIMING_LOG_SCENES=project_log_comment,project_log,project_acceptance,expense_request,employee_avatar,customer_avatar
UPLOAD_TIMING_LOG_MIN_DURATION_MS=1000
```

服务器当前部署版本：

```text
feature/multi-tenant @ 1aa43a9
```

API 进程已执行：

```bash
pm2 reload goose --update-env
```

后端 smoke test：

- `GET https://api.goodcms.cn/` 返回 `200`，响应 `{"hello":"world"}`。
- 本地调用 `POST http://127.0.0.1:3000/uploads/cos/direct-init` 返回 `200`。
- 返回 `provider=tencent_cos`。
- 返回 `bucket=windwill-1259348056`，`region=ap-nanjing`。
- 返回上传域名为 `windwill-1259348056.cos.accelerate.myqcloud.com`。
- 返回对象前缀为 `tenants/51111111-1111-4111-8111-111111111111/project-log-comment/unassigned`。
- 本次 `direct-init` 请求耗时约 `6ms`，低于 `1000ms` 阈值，未输出 timing 慢日志，符合降噪预期。
