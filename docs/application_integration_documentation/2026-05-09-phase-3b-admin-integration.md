# 阶段 3B Admin 对接说明：施工日志租户隔离

日期：2026-05-09

## 结论

Admin 端无需新增请求参数。施工日志接口会根据当前登录员工的租户上下文自动过滤。

## 受影响接口

- `GET /project-logs`
- `GET /project-logs/:id`
- `POST /project-logs`
- `PATCH /project-logs/:id`
- `PUT /project-logs/:id`
- `GET /project-logs/projects`
- `GET /project-logs/projects/calendar`
- `GET /project_log_comments`
- `POST /project_log_comments`

## 行为变化

- 创建施工日志时，后端从项目继承 `tenant_id`。
- 施工日志列表只返回当前租户且当前员工有权限访问的项目日志。
- 施工日志详情和更新会同时校验租户与项目权限。
- 日志评论从日志继承 `tenant_id`。
- 评论列表只返回当前日志所属租户评论。
- 员工不能给其他租户项目的施工日志新增评论。

## Admin 端建议

- 不要传 `tenant_id`。
- 项目切换或账号切换后，清空施工日志和评论本地缓存。
- 如果施工日志详情返回 404/403，优先检查项目是否属于当前租户、当前员工是否有项目权限。

## 联调检查

- A 租户员工不能看到 B 租户施工日志。
- A 租户员工不能更新 B 租户施工日志。
- A 租户员工不能评论 B 租户施工日志。
- 新建施工日志后，数据库 `project_logs.tenant_id` 等于所属项目 `tenant_id`。
