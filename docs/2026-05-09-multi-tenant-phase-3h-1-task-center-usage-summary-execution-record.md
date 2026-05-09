# 多租户阶段 3H-1 执行记录：任务中心与用量统计收口

日期：2026-05-09

## 1. 本阶段目标

收口阶段 3 的两个剩余点：

- 任务中心补齐“工序验收待办”，并继续保持租户隔离。
- 费用、短视频识别、AI 调用增加租户内统计口径。

## 2. 已完成内容

### 2.1 工序验收待办

任务中心新增待办类型：

```text
project_acceptance
```

覆盖场景：

- `submitted`：复核人或具备验收管理权限的员工看到“工序验收待复核”。
- `draft`：发起人看到“工序验收草稿待提交”。
- `rejected`：发起人看到“工序验收待整改”或“业主有疑问待整改”。

租户边界：

- 查询 `project_acceptances` 时强制使用当前 `tenant_id`。
- 不会把其他租户验收单聚合到待办中心。

### 2.2 费用统计

新增接口：

```http
GET /expense-requests/stats/summary
```

复用费用列表的过滤参数：

- `employee_id`
- `assignee_id`
- `project_id`
- `status`
- `mode`
- `current_step`
- `keyword`
- `created_from`
- `created_to`

返回内容：

- 总申请数
- 总金额
- 各状态数量
- 各状态金额
- 各模式数量

租户边界：

- 按当前登录态 `tenant_id` 查询。
- 统计前继续套用费用可见范围，避免用户看到无权限费用的聚合结果。

### 2.3 短视频与 AI 用量统计

新增接口：

```http
GET /admin/social-video/usage-summary
```

支持过滤：

- `created_from`
- `created_to`

返回内容：

- 转写任务数、成功数、失败数、处理中数。
- 总识别时长、平均识别时长、有时长记录数、无时长记录数。
- 转写 provider 分布。
- AI 脚本生成次数、成功数、失败数。
- AI 调用次数、成功数、失败数。
- AI provider / model 分布。
- `prompt_tokens`、`completion_tokens`、`total_tokens`。
- token 缺失记录数。

统计口径：

- `audio_duration_seconds` 为空时，不参与平均时长计算。
- 无时长记录单独计入 `missing_duration_count`。
- 供应商未返回 token 时，不把空值作为真实计费依据，只计入 `missing_token_count`。

## 3. 新增索引

新增 migration：

```text
supabase/migrations/20260509190000_add_usage_summary_indexes.sql
```

索引：

- `social_video_scripts(tenant_id, status, created_at desc)`
- `social_video_scripts(tenant_id, created_at desc)`
- `ai_call_logs(tenant_id, created_at desc)`
- `ai_call_logs(tenant_id, status, created_at desc)`

## 4. 未完成项

- 尚未做 admin 页面展示，只提供后端接口和对接文档。
- 尚未做阶段 3 双租户自动化验收脚本，留到 3H-2。
- 工序验收“业主待确认”属于客户侧动作，本次不放入员工任务中心。

## 5. 验证

已执行：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

通过。
