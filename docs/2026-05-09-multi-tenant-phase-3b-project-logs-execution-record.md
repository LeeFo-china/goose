# 多租户阶段 3B 执行记录：施工日志

日期：2026-05-09

## 范围

本阶段处理施工日志与日志评论租户隔离，并补强客户侧日志、施工日志待办、客户分享施工日志上下文中的日志租户边界。

## 已完成

### 数据库

- 新增 migration：`20260509160000_tenant_scope_project_logs.sql`。
- 给以下表增加并回填 `tenant_id`：
  - `project_logs`
  - `project_log_comments`
- `project_logs.tenant_id` 从所属项目 `projects.tenant_id` 继承，缺失时回退默认租户。
- `project_log_comments.tenant_id` 从所属日志继承。
- 增加施工日志和评论的租户复合索引：
  - `project_logs(tenant_id, project_id, created_at desc)`
  - `project_logs(tenant_id, employee_id, created_at desc)`
  - `project_logs(tenant_id, stage_code, created_at desc)`
  - `project_log_comments(tenant_id, log_id, created_at asc)`
  - `project_log_comments(tenant_id, author_type, author_id)`
- 重建 `get_customer_project_recent_log_summaries`，要求日志与评论都和项目同租户。

### 员工端接口

- `POST /project-logs` 创建日志时从项目继承 `tenant_id`。
- 覆盖通用 `GET /project-logs`，按当前租户和可见项目过滤。
- 覆盖通用 `GET /project-logs/:id`，按当前租户读取并校验项目权限。
- 覆盖通用 `PATCH/PUT /project-logs/:id`，按当前租户更新，切换项目时重新继承目标项目租户。
- `GET /project_logs/projects` 额外按当前租户过滤日志。
- 任务中心“补写施工日志”查询今日日志时按当前租户过滤。

### 客户侧接口

- 客户项目日志列表只返回该客户项目所属租户日志。
- 客户项目日志评论列表只返回该客户项目所属租户评论。
- 客户首页最近日志摘要 RPC 已要求日志、评论和项目同租户。
- 装修问答上下文读取最近日志时按项目租户过滤。

### 分享链路

- 客户分享施工日志上下文查询时，日志必须与分享项目同租户。
- 分享活动公开详情查询日志时，日志必须与分享项目同租户。
- 最近有图施工日志查询按项目租户过滤。

## 验证

- `bun run api:build` 通过。
- `bun run api:typecheck` 通过。

## 暂未处理

- `customer_project_log_shares`、`customer_log_share_campaigns` 等营销分享表自身的 `tenant_id` 仍留到阶段 4 营销/H5 租户化处理。
- 项目公开详情的日志接口仍以 project id 为边界，后续平台公开项目策略确定后可继续细化。
