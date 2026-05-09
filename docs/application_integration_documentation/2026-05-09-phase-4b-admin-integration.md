# 阶段 4B Admin 对接说明：营销/H5 基础租户隔离

日期：2026-05-09

## 1. 结论

阶段 4B 后端已完成营销活动、H5 页面、H5 线索的租户隔离。

Admin 端本阶段不需要传 `tenant_id`，也不需要展示 `tenant_id`。

## 2. Admin 接口行为变化

以下接口会自动按当前登录员工所属租户过滤：

- `GET /marketing-pages`
- `GET /marketing-pages/:id`
- `PATCH /marketing-pages/:id`
- `DELETE /marketing-pages/:id`
- `GET /marketing-pages/:id/draft`
- `PUT /marketing-pages/:id/draft`
- `POST /marketing-pages/:id/publish`
- `POST /marketing-pages/:id/offline`
- `POST /marketing-pages/:id/duplicate`
- `GET /marketing-leads`
- `PATCH /marketing-leads/:id`
- `POST /marketing-leads/:id/convert-customer`
- `GET /employee/marketing-center/campaigns`
- `GET /employee/marketing-center/campaigns/:campaignId`
- `PUT /employee/marketing-center/campaigns/:campaignId`
- `POST /employee/marketing-center/campaigns/:campaignId/status`

## 3. 前端需要注意

- 创建 H5 页面时不用传 `tenant_id`。
- 创建营销活动时不用传 `tenant_id`。
- 活动包含项目选择器继续使用现有分页搜索接口。
- 如果手工访问其他租户的 H5 页面、线索、营销活动，后端会返回 `404/403`。
- H5 线索转客户时，后端只会在当前租户内按手机号匹配客户。

## 4. 联调检查

建议用两个租户账号验证：

- A 租户账号看不到 B 租户 H5 页面。
- A 租户账号看不到 B 租户 H5 线索。
- A 租户账号看不到 B 租户营销活动。
- A 租户账号不能通过 URL 打开 B 租户 H5 页面编辑页。
- A 租户账号不能把 B 租户线索转为客户。

