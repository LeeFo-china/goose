# 阶段 4D 小程序对接说明：客户登录态与租户选择

日期：2026-05-09

## 1. 结论

小程序客户登录不能再假设一个手机号只对应一个客户身份。

`POST /auth/verify-role` 在 `target_role=customer` 时，需要按 `mode` 分流：

```text
customer
select_tenant
platform_visitor
```

## 2. 客户登录接口

请求不变：

```http
POST /auth/verify-role
Authorization: Bearer <微信登录 token>
Content-Type: application/json
```

```json
{
  "phone": "18638374738",
  "code": "123456",
  "target_role": "customer"
}
```

## 3. mode = customer

手机号只命中一个装修公司客户时返回：

```json
{
  "mode": "customer",
  "token": "正式客户token",
  "roles": ["customer"],
  "tenant": {
    "id": "tenant-id",
    "name": "某某装饰",
    "slug": "tenant_slug"
  },
  "customer": {
    "id": "customer-id",
    "name": "客户名",
    "phone": "18638374738"
  }
}
```

小程序处理：

- 保存返回的 `token`。
- 进入客户首页。
- 后续客户接口不用传 `tenant_id`，后端从 token 读取。

## 4. mode = select_tenant

手机号命中多个装修公司客户时返回：

```json
{
  "mode": "select_tenant",
  "token": "待选择token",
  "phone": "18638374738",
  "tenants": [
    {
      "tenant_id": "tenant-a",
      "tenant_name": "A装饰",
      "tenant_slug": "tenant_a",
      "customer_id": "customer-a",
      "customer_name": "张三",
      "project_count": 1,
      "latest_project_name": "绿城花园装修"
    }
  ]
}
```

小程序处理：

- 保存这个临时 `token`。
- 展示“请选择服务公司”页面。
- 用户点击某家公司后调用：

```http
POST /customer/auth/select-tenant
Authorization: Bearer <select_tenant 返回的 token>
Content-Type: application/json
```

```json
{
  "tenant_id": "tenant-a",
  "customer_id": "customer-a"
}
```

成功后返回 `mode=customer` 和正式客户 token。小程序替换本地 token 并进入客户首页。

## 5. mode = platform_visitor

手机号没有命中任何装修公司客户时返回：

```json
{
  "mode": "platform_visitor",
  "token": "平台访客token",
  "phone": "18638374738",
  "has_customer_profile": false,
  "message": "暂未匹配到装修公司，可先提交装修需求，平台顾问会协助分配。"
}
```

小程序处理：

- 保存 token。
- 进入平台访客页。
- 不展示项目、施工日志、工序验收、摄像头入口。
- 展示装修需求提交入口。

注意：装修需求提交接口属于阶段 4E，本阶段只返回访客态。

## 6. 客户上下文接口

```http
GET /auth/me/customer-context
```

已返回：

```json
{
  "mode": "customer",
  "tenant_id": "tenant-id",
  "customer_id": "customer-id",
  "has_customer_profile": true
}
```

如果是 `platform_visitor`，小程序应保持访客页，不要请求项目类接口。

## 7. 兼容注意

- 不要再根据 `roles.includes("customer")` 直接进入客户首页，必须优先看 `mode`。
- `select_tenant` token 不是正式客户 token，只用于选择装修公司。
- 正式客户 token 由 `/customer/auth/select-tenant` 或 `mode=customer` 响应返回。
- 后续客户接口不需要也不应该手动传 `tenant_id`。
