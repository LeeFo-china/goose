# Phase 4F 微信小程序对接文档：员工分享直绑定客户

日期：2026-05-09

## 背景

装修公司员工通过小程序码、H5 活动页、报价表单拓客时，入口会携带 `share_token`。

客户登录时如果传入 `share_token`，后端会直接把客户绑定到分享员工所在租户，不进入平台公海线索。

## 1. 公开解析分享链接

小程序扫码或打开链接后，可先调用：

```http
GET /public/tenant-share-links/:token
```

成功返回：

```json
{
  "token": "ts_xxx",
  "source": "employee_share",
  "target_type": "miniprogram",
  "target_id": null,
  "status": "active",
  "expires_at": null,
  "available": true,
  "tenant": {
    "id": "tenant-id",
    "name": "某装修公司",
    "slug": "demo"
  },
  "share_employee": {
    "id": "employee-id",
    "name": "张三"
  }
}
```

小程序建议：

- `available = true` 时缓存 `share_token`。
- `available = false` 时提示“分享链接不可用”，但仍可允许用户走普通客户登录。

## 2. 登录时透传 share_token

客户短信验证码登录接口：

```http
POST /auth/verify-role
Authorization: Bearer <wechat_auth_token>
Content-Type: application/json
```

Body：

```json
{
  "phone": "18638374738",
  "code": "123456",
  "target_role": "customer",
  "share_token": "ts_xxx"
}
```

成功返回：

```json
{
  "mode": "customer",
  "token": "customer_token",
  "user_id": "auth-user-id",
  "roles": ["customer"],
  "tenant": {
    "id": "tenant-id",
    "name": "某装修公司",
    "slug": "demo"
  },
  "customer": {
    "id": "customer-id",
    "name": "客户4738",
    "phone": "18638374738"
  },
  "share_binding": {
    "share_link_id": "share-link-id",
    "share_employee_id": "employee-id",
    "dedupe_result": "created_customer",
    "source": "employee_share"
  }
}
```

`dedupe_result`：

| 值 | 含义 |
| --- | --- |
| `created_customer` | 该租户下没有该手机号，后端创建了新客户 |
| `existing_customer` | 该租户下已有该手机号，后端复用旧客户 |

## 3. 小程序端处理规则

1. 进入小程序时解析 scene 或 query。
2. 如果拿到 `share_token`，本地缓存到登录流程上下文。
3. 登录前可调用 `GET /public/tenant-share-links/:token` 展示装修公司名称和分享员工。
4. 调用 `/auth/verify-role` 时传入 `share_token`。
5. 如果返回 `mode = customer`，替换本地 token 并进入客户首页。
6. 登录成功后清除本地临时 `share_token`。

## 4. 错误处理

| code | 场景 | 前端建议 |
| --- | --- | --- |
| `TENANT_SHARE_LINK_NOT_FOUND` | 分享链接不存在 | 提示链接无效，走普通登录 |
| `TENANT_SHARE_LINK_DISABLED` | 分享链接已停用 | 提示链接已停用 |
| `TENANT_SHARE_LINK_EXPIRED` | 分享链接已过期 | 提示链接已过期 |
| `TENANT_NOT_AVAILABLE` | 装修公司不可用 | 提示装修公司状态不可用 |
| `TENANT_SHARE_EMPLOYEE_NOT_AVAILABLE` | 分享员工不可用 | 提示分享人状态不可用 |
| `CUSTOMER_ALREADY_BOUND` | 目标租户客户已绑定其他微信 | 提示联系工作人员 |

## 5. 与平台访客态区别

| 对比 | 员工分享路径 | 平台访客路径 |
| --- | --- | --- |
| 是否进入 `platform_leads` | 否 | 是 |
| 是否需要平台分配 | 否 | 是 |
| 租户来源 | `share_token` 反查 | 平台超管分配 |
| 登录成功 mode | 直接 `customer` | 可能 `platform_visitor` |

## 6. 注意事项

- 前端不能自己传 `tenant_id` 做绑定，必须传后端生成的 `share_token`。
- 同手机号已存在其他租户不影响本次绑定。
- 如果同一租户已有该手机号客户，后端不会重复创建客户。
