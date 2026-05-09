# 多租户阶段 4D 执行记录：客户登录态与租户选择

日期：2026-05-09

## 1. 目标

阶段 4D 落地客户侧登录状态拆分：

- 手机号没有命中任何租户客户时，返回 `platform_visitor`。
- 手机号命中多个租户客户时，返回 `select_tenant`。
- 客户选择装修公司后，签发带 `tenant_id/customer_id` 的客户会话。
- 客户项目、日志、验收接口优先使用 token 内的客户租户上下文，避免多家公司客户被旧逻辑拦截。

本阶段不实现 `platform_leads` 建表和平台线索分配；该部分留给阶段 4E。

## 2. 后端改动

### 2.1 登录响应模式

`POST /auth/verify-role` 在 `target_role=customer` 时新增三种响应：

```text
mode = customer
mode = select_tenant
mode = platform_visitor
```

#### mode = customer

手机号只命中一个可用租户客户时：

- 自动绑定 `customers.user_id`。
- 签发包含 `tenant_id`、`tenant_slug`、`customer_id` 的 token。

#### mode = select_tenant

手机号命中多个可用租户客户时：

- 不默认选择任何装修公司。
- 返回 `tenants` 数组。
- 签发临时 token，包含 `verified_phone`，供后续选择租户时校验。

#### mode = platform_visitor

手机号未命中任何可用租户客户时：

- 不再创建 `tenant_id = null` 的客户。
- 不归入默认租户。
- 返回平台访客态 token，包含 `verified_phone`。

### 2.2 新增选择租户接口

```http
POST /customer/auth/select-tenant
Authorization: Bearer <select_tenant token>
Content-Type: application/json
```

请求：

```json
{
  "tenant_id": "tenant-id",
  "customer_id": "customer-id"
}
```

后端校验：

- 客户存在。
- `customer.tenant_id = tenant_id`。
- 租户状态为 `active`。
- 当前 token 的 `verified_phone` 匹配客户手机号，或该客户已经绑定当前 auth user。
- 客户未绑定其他 auth user。

成功后：

- 绑定 `customers.user_id`。
- 签发正式客户 token。
- token 内包含 `tenant_id`、`tenant_slug`、`customer_id`。

### 2.3 客户侧接口上下文

以下客户侧接口已支持 token 中的 `tenant_id/customer_id`：

- `GET /auth/me/customer-context`
- `GET /customer/profile`
- `GET /customer/projects`
- `GET /customer/projects/:id`
- `GET /customer/projects/:id/logs`
- `GET /customer/projects/:id/logs/:logId/comments`
- `GET /customer/project-acceptances`
- `GET /customer/project-acceptances/:id`
- `POST /project-acceptances/:id/customer-confirm`
- `POST /project-acceptances/:id/customer-dispute`

## 3. 安全边界

- 未选择租户的客户不会获得 `customer_id/tenant_id`。
- 多租户客户不能由前端直接传 `tenant_id` 访问业务数据。
- 客户业务接口只读取 token 中的租户客户上下文。
- `platform_visitor` 不能访问项目、日志、验收、摄像头等租户客户数据。

## 4. 验证

已完成：

```text
bun run api:typecheck
```

本地烟测已启动并覆盖以下场景，但远程 Supabase 在验证码状态更新和认证查询中出现过 `TimeoutError`，已为验证码状态更新增加短重试。

计划 smoke 场景：

- 未命中手机号返回 `platform_visitor`。
- 命中两个租户客户返回 `select_tenant`。
- 调用 `/customer/auth/select-tenant` 后返回 `customer`。
- 正式客户 token 访问 `/auth/me/customer-context` 返回正确 `tenant_id/customer_id`。

## 5. 后续阶段

阶段 4E 建议继续实现：

- `platform_leads`。
- 平台访客提交装修需求。
- 平台超管手动分配。
- 分配时目标租户内客户去重。
- `customer_sources` 来源时间线。
