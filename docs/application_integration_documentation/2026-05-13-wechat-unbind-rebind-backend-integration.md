# 微信解绑与人工换绑后端对接说明

日期：2026-05-13

## 后端范围

本次后端已支持小程序客户/员工自助解绑微信，以及旧微信不可用时提交人工换绑申请。

关键约束：

- 自助解绑只允许当前 token 对应的 `customer_id + tenant_id + auth_user_id` 或 `employee_id + tenant_id + auth_user_id` 清空绑定。
- 解绑后旧业务 token 会在后续请求中实时校验失败，前端需要重新登录。
- 手机号验证码换绑场景使用 `rebind_wechat`。
- 当目标客户或员工已绑定其他微信时，登录绑定不再自动覆盖，后端返回 `WECHAT_ALREADY_BOUND`，由小程序引导用户提交换绑申请。
- 换绑审核入口限定当前租户员工，并要求 `customer.update` 权限。

## 数据库

新增 migration：

`supabase/migrations/20260513103000_create_wechat_rebind_requests.sql`

新增表：

`public.wechat_rebind_requests`

主要字段：

| 字段 | 说明 |
| --- | --- |
| `tenant_id` | 所属租户，必填 |
| `target_role` | `customer` 或 `employee` |
| `target_customer_id` | 客户换绑目标 |
| `target_employee_id` | 员工换绑目标 |
| `phone` | 验证手机号 |
| `old_auth_user_id` | 原微信 auth 用户，不对小程序暴露 |
| `new_auth_user_id` | 新微信 auth 用户 |
| `status` | `pending`、`approved`、`rejected`、`cancelled` |
| `reviewer_employee_id` | 审核员工 |
| `review_comment` | 审核说明 |

同一目标身份同一手机号只允许存在一条 `pending` 申请。

## 小程序接口

### 发送换绑验证码

`POST /auth/send-code`

```json
{
  "phone": "19000005002",
  "scene": "rebind_wechat"
}
```

第一版短信模板复用绑定客户验证码模板。

### 客户自助解绑

`POST /customer/auth/unbind-wechat`

要求客户登录 token。

成功后返回：

```json
{
  "success": true,
  "message": "微信绑定已解除"
}
```

### 员工自助解绑

`POST /employee/auth/unbind-wechat`

要求员工登录 token。

成功后返回：

```json
{
  "success": true,
  "message": "微信绑定已解除"
}
```

### 提交换绑申请

`POST /auth/wechat-rebind-requests`

要求新微信的 visitor token 或其他已登录 token。

客户换绑：

```json
{
  "phone": "19000005002",
  "code": "123456",
  "target_role": "customer",
  "tenant_id": "51111111-1111-4111-8111-111111111111",
  "customer_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "applicant_name": "张三",
  "project_hint": "某项目",
  "community_hint": "某小区",
  "remark": "旧微信无法使用"
}
```

员工换绑：

```json
{
  "phone": "19000005002",
  "code": "123456",
  "target_role": "employee",
  "tenant_id": "51111111-1111-4111-8111-111111111111",
  "employee_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "applicant_name": "张三",
  "remark": "旧微信无法使用"
}
```

成功后返回申请 ID 和状态。

## Admin 接口

### 换绑申请列表

`GET /employee/auth/wechat-rebind-requests?status=pending&page=1&pageSize=20`

权限：`customer.update`

列表中手机号只返回脱敏值 `phone_masked`。

### 审核通过

`POST /employee/auth/wechat-rebind-requests/:id/approve`

```json
{
  "comment": "身份已确认"
}
```

后端会校验：

- 申请仍为 `pending`。
- 当前员工属于申请租户。
- 目标身份手机号仍匹配。
- 目标身份仍绑定申请里的旧微信。
- 员工目标账号仍为可用状态。

通过后目标身份绑定到新微信，并清理旧/新 auth 上下文缓存。

### 审核拒绝

`POST /employee/auth/wechat-rebind-requests/:id/reject`

```json
{
  "comment": "资料不匹配"
}
```

## 前端错误处理

绑定客户/员工时，如果后端返回：

```json
{
  "code": "WECHAT_ALREADY_BOUND",
  "details": {
    "can_request_rebind": true,
    "target_role": "customer",
    "tenant_id": "51111111-1111-4111-8111-111111111111",
    "customer_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "employee_id": null
  }
}
```

小程序应展示“该手机号已绑定其他微信，可提交换绑申请”，并带入 `details` 打开换绑申请页。

如果后端返回：

`WECHAT_BINDING_NOT_MATCHED`

说明当前业务 token 已失效，前端需要清理本地登录态并重新登录。

