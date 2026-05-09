# 多租户阶段 3H-2 执行记录：双租户验收脚本

日期：2026-05-09

## 1. 本阶段目标

为阶段 3 的业务模块租户隔离提供可重复执行的验收方式，覆盖：

- 费用审批
- 工序验收
- 工地摄像头
- 任务中心
- 自媒体短视频
- AI 调用用量

## 2. 已完成内容

### 2.1 新增验收脚本

新增：

```text
scripts/verify-phase3-tenant-isolation.ts
```

新增 package script：

```bash
bun run verify:tenant:phase3
```

脚本能力：

- 用 A 租户 token 请求阶段 3 业务列表和统计接口。
- 检查响应中是否包含配置的 B 租户资源 ID。
- 用 A 租户 token 访问 B 租户详情资源，期望返回 `400/403/404`。
- 检查任务中心支持 `type=project_acceptance`。
- 检查短视频用量统计返回 AI token 统计字段。

### 2.2 需要配置的环境变量

必填：

```bash
API_BASE_URL=https://admin.goodcms.cn/api/backend
TENANT_A_TOKEN=xxx
```

推荐：

```bash
TENANT_B_FORBIDDEN_IDS=expense-id,acceptance-id,camera-id,transcription-id
TENANT_B_EXPENSE_REQUEST_ID=xxx
TENANT_B_PROJECT_ACCEPTANCE_ID=xxx
TENANT_B_PROJECT_ID=xxx
TENANT_B_CAMERA_ID=xxx
TENANT_B_SOCIAL_VIDEO_TRANSCRIPTION_ID=xxx
```

严格模式：

```bash
STRICT_TENANT_VERIFY=1
```

开启后，只要有跳过项也会返回失败，适合 CI 或正式验收。

### 2.3 扩展静态审计脚本

更新：

```text
scripts/audit-tenant-scope.sh
```

覆盖表从核心表扩展到阶段 3 表：

- `project_acceptances`
- `project_acceptance_items`
- `project_acceptance_actions`
- `project_acceptance_open_tickets`
- `project_cameras`
- `social_video_transcriptions`
- `social_video_scripts`
- `ai_call_logs`

## 3. 验收项

脚本覆盖：

- A 租户费用列表不包含 B 租户资源 ID。
- A 租户费用统计可正常返回。
- A 租户不能读取 B 租户费用详情。
- A 租户验收列表不包含 B 租户资源 ID。
- A 租户不能读取 B 租户验收详情。
- A 租户摄像头项目组不包含 B 租户资源 ID。
- A 租户不能获取 B 租户摄像头播放参数。
- A 租户任务中心不包含 B 租户资源 ID。
- 任务中心可按 `project_acceptance` 类型过滤。
- A 租户短视频脚本列表不包含 B 租户资源 ID。
- A 租户短视频/AI 用量统计可正常返回。
- A 租户不能读取 B 租户短视频转写详情。

## 4. 本地验证

本阶段已做静态和构建验证。

已执行：

```bash
bun run verify:tenant:phase3
bash scripts/audit-tenant-scope.sh
bun run api:typecheck
bun run api:build
git diff --check
```

由于当前本地没有 A/B 租户 token 和对应 B 租户资源 ID，脚本未进行真实远端双租户数据验收。实际环境准备完成后执行：

```bash
STRICT_TENANT_VERIFY=1 \
API_BASE_URL=https://admin.goodcms.cn/api/backend \
TENANT_A_TOKEN=xxx \
TENANT_B_FORBIDDEN_IDS=xxx,yyy,zzz \
TENANT_B_EXPENSE_REQUEST_ID=xxx \
TENANT_B_PROJECT_ACCEPTANCE_ID=yyy \
TENANT_B_PROJECT_ID=project-b \
TENANT_B_CAMERA_ID=camera-b \
TENANT_B_SOCIAL_VIDEO_TRANSCRIPTION_ID=zzz \
bun run verify:tenant:phase3
```

## 5. 通过标准

- 正式验收必须开启 `STRICT_TENANT_VERIFY=1`。
- `failed = 0`。
- `skipped = 0`。
- 任一失败项必须先修复，不建议带着失败进入阶段 4。
