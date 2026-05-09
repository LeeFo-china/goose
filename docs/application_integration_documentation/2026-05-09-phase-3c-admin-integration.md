# 阶段 3C Admin 对接说明：工序验收租户隔离

日期：2026-05-09

## 结论

Admin 端无需新增 `tenant_id` 请求参数。工序验收接口会根据当前登录员工的租户上下文自动过滤。

## 受影响接口

- `GET /project-acceptances`
- `GET /project-acceptances/:id`
- `POST /project-acceptances`
- `PATCH /project-acceptances/:id`
- `DELETE /project-acceptances/:id`
- `POST /project-acceptances/:id/submit`
- `POST /project-acceptances/:id/approve`
- `POST /project-acceptances/:id/reject`
- `POST /project-acceptances/:id/cancel`
- `POST /project-acceptances/:id/notify-customer`

## 行为变化

- 创建验收单时，后端从项目继承 `tenant_id`。
- 验收单、验收项、操作记录、短信 ticket 都会写入同一个租户。
- 验收列表只返回当前租户且当前员工有项目权限的数据。
- 复核人只能选择当前租户员工。
- 领导通过后创建的短信 ticket 绑定当前租户。
- 今日工作筛选中的验收数据只统计当前租户。

## Admin 端建议

- 不要传 `tenant_id`。
- 员工切换账号后，清空验收列表、详情、待确认通知等本地缓存。
- 如果验收单详情返回不存在或无权限，优先检查项目归属租户和员工项目权限。

## 联调检查

- A 租户员工不能看到 B 租户验收单。
- A 租户员工不能提交、复核、驳回、删除 B 租户验收单。
- A 租户验收单不能选择 B 租户员工作为复核人。
- 领导通过后生成的 `project_acceptance_open_tickets.tenant_id` 等于验收单租户。
