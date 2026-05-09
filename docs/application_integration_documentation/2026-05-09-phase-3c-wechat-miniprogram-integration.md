# 阶段 3C 微信小程序对接说明：工序验收租户隔离

日期：2026-05-09

## 结论

小程序端无需新增 `tenant_id` 参数。员工端和客户侧工序验收接口均由后端按登录态、项目归属和 ticket 归属自动隔离。

## 受影响入口

- 员工端项目详情的工序验收列表
- 员工端验收详情、填写、提交、删除草稿
- 领导端验收复核、驳回
- 客户端待确认验收详情
- 客户端确认通过 / 我有疑问
- 短信跳转验收详情 ticket 校验

## 行为变化

### 员工端

- `GET /project-acceptances` 只返回当前租户数据。
- `POST /project-acceptances` 不需要传 `tenant_id`，后端自动继承项目租户。
- 验收项、操作记录自动继承验收单租户。
- 复核人不属于当前租户时，后端会返回业务错误。

### 客户端

- `GET /customer/project-acceptances` 只返回当前客户所属租户项目验收。
- `GET /customer/project-acceptances/:id` 登录态访问时，客户必须和验收单同租户。
- ticket 访问时，ticket、验收单、项目和客户必须匹配。
- `POST /project-acceptances/:id/customer-confirm`
- `POST /project-acceptances/:id/customer-dispute`

以上客户操作必须满足客户和验收单同租户。

## 小程序端建议

- 不要传 `tenant_id`。
- 短信入口继续传 `id`、`projectId`、`ticket`。
- 如果 ticket 失效，继续按原文档展示失效提示。
- 员工切换账号后清空验收列表和详情缓存。

## 联调检查

- A 租户客户不能打开 B 租户验收单。
- A 租户短信 ticket 不能用于 B 租户验收单。
- 客户确认后，操作记录 `tenant_id` 等于验收单租户。
- 客户提出疑问后，员工端同租户可见，其他租户不可见。
