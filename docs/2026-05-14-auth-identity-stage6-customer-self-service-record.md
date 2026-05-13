# 多端登录重构第 6 阶段：客户自助业务身份切换记录

日期：2026-05-14

## 背景

第 5 阶段已经将微信解绑改为只解绑 OAuth 凭证，不再清空 `employees.user_id` / `customers.user_id`。第 6 阶段继续把客户自助相关接口切到 `user_business_memberships`，避免客户解绑微信后，仍因为旧的 `customers.user_id` 兼容逻辑导致小程序或 Web 客户端身份判断不一致。

## 本次改动

### 后端

- `apps/api/src/services/project-acceptances.ts`
  - 新增 `AUTH_IDENTITY_SOURCE=legacy|dual|membership` 解析。
  - 新增客户业务身份解析方法，优先从 `user_business_memberships` 读取 `identity_type=customer`、`status=active` 的客户身份。
  - `dual` 模式下合并 membership 与旧 `customers.user_id` 查询结果，作为灰度兼容。
  - `membership` 模式下只认 `user_business_memberships`，用于阶段验收和后续正式切换。
  - 客户验收列表、详情、开放票据登录态访问、客户操作人解析统一改用新的身份解析方法。

- `apps/api/src/repositories/project-acceptances.ts`
  - `listCustomers()` 补充查询 `tenant.status`，保证 membership 路径下仍能执行租户可用性校验。

- `apps/api/src/services/customer-project-log-shares.ts`
  - 客户分享活动、到店礼活动、分享图等客户自助营销接口的客户身份解析同步支持 `AUTH_IDENTITY_SOURCE`。
  - `membership` 模式下只通过 `user_business_memberships` 查客户身份。
  - `dual` 模式下合并 membership 与旧 `customers.user_id` 结果，避免灰度期间旧数据中断。

## 影响接口

- `GET /customer/project-acceptances`
- `GET /customer/project-acceptances/:id`
- 客户登录态访问开放票据验收详情
- 客户确认 / 提疑问等验收动作中的客户身份解析
- `GET /customer/projects/:projectId/share-campaigns/summary`
- 客户项目日志分享图、分享活动、到店礼活动等依赖客户项目归属的接口

## Admin 对接

本阶段无 Admin 页面改动要求。

Admin 后续只需要继续以 `user_business_memberships` 作为用户业务身份展示与排查依据。员工 / 客户列表可以保留 `customers.user_id`、`employees.user_id` 作为兼容观察字段，但不要再把它作为解绑、登录态判断的唯一来源。

## 微信小程序对接

本阶段小程序不需要改接口参数。

小程序仍按现有登录结果携带 token 请求客户自助接口。后端会根据 token 中的 `sub`、`tenant_id`、`customer_id` 到 `user_business_memberships` 校验客户业务身份。解绑微信后，如果用户仍通过手机号登录并拥有 active 客户身份，客户自助接口应继续可用。

## 验收结果

### 构建

```bash
bun run api:build
```

结果：通过。

### 接口验证

验证环境变量：

```bash
AUTH_IDENTITY_SOURCE=membership
```

验证样本：

- tenant_id：`51111111-1111-4111-8111-111111111111`
- customer_id：`5aaaaaaa-0005-4aaa-8aaa-aaaaaaaaaaaa`
- user_id：`1a3f8715-37bf-43fe-bf15-4c13571b5f99`
- project_id：`5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa`
- acceptance_id：`7de3d4f9-91cc-4432-b63f-2c1abfb45541`

验证接口：

```bash
GET /customer/project-acceptances?project_id=5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa&page=1&pageSize=5
GET /customer/project-acceptances/7de3d4f9-91cc-4432-b63f-2c1abfb45541
GET /customer/projects/5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa/share-campaigns/summary
```

结果：

- 列表接口返回 `200 OK`，分页 `total=6`。
- 详情接口返回 `200 OK`，数据归属为上述 `tenant_id` 和 `customer_id`。
- 分享活动汇总接口返回 `200 OK`，可通过 membership 客户身份读取项目分享配置。

## 下一步

进入第 7 阶段前建议先完成：

1. 全量搜索剩余旧身份依赖，继续收敛 `customers.user_id` / `employees.user_id` 的登录判断用途。
2. 把 `AUTH_IDENTITY_SOURCE` 从 `dual` 灰度切到 `membership` 做一轮完整验收。
3. 验收通过后，再进入旧字段兼容层清理与数据约束收紧。
