# 微信小程序微信解绑语义切换对接文档

日期：2026-05-14

## 背景

多端登录重构阶段 5 将“解绑微信”的语义从“解除业务身份绑定”改为“停用当前微信登录凭证”。

旧语义：

- 清空 `customers.user_id` 或 `employees.user_id`。
- 解绑后业务身份与账号关系丢失。

新语义：

- 不修改 `customers.user_id`。
- 不修改 `employees.user_id`。
- 不解绑 `user_business_memberships`。
- 只将当前 `user_oauth_identities(platform='wechat_mini', openid)` 标记为 `unbound`。
- 删除旧兼容表 `wechat_identities` 中当前 auth user 的映射。

## 小程序端需要对接

接口不变：

```http
POST /customer/auth/unbind-wechat
POST /employee/auth/unbind-wechat
```

请求头：

```http
Authorization: Bearer <当前正式 customer/employee token>
```

成功响应语义不变：

```json
{
  "success": true,
  "message": "微信绑定已解除"
}
```

小程序端成功后必须：

1. 清理本地 token、用户信息、当前租户/身份上下文缓存。
2. 回到 landing 页。
3. 再次微信一键登录时，应按 `platform_visitor` 处理。
4. 用户需要恢复原客户/员工身份时，走手机号验证码：
   - 客户：`POST /auth/verify-role target_role=customer`
   - 员工：`POST /auth/verify-role target_role=employee`

## 新错误码

### `UNBIND_FORBIDDEN`

场景：

- 当前客户/员工档案没有手机号。
- 后端判断解绑后没有可用的手机号恢复路径。

建议文案：

```text
当前账号未绑定手机号，暂不能解绑微信
```

处理方式：

- 不清 token。
- 停留当前页面。
- 引导用户联系装修公司或平台管理员补充手机号。

### `WECHAT_BINDING_NOT_MATCHED`

场景：

- 当前 token 的微信登录凭证已失效。
- 当前 openid 已不是该 auth user 的 active OAuth 凭证。
- 业务身份与当前 token 不匹配。

建议文案：

```text
登录状态已变化，请重新登录
```

处理方式：

- 清 token。
- 回 landing。

## 解绑后的登录表现

### 1. 同微信再次一键登录

预期：

```json
{
  "mode": "platform_visitor"
}
```

原因：

- 原 openid 对应的 `user_oauth_identities` 已是 `unbound`。
- 后端不会再通过历史 `${openid}@wechat.local` 或 `find_auth_user_by_openid` 把 openid 补回原账号。

### 2. 手机号验证码恢复身份

客户或员工输入业务档案手机号后：

- 后端识别手机号对应原客户/员工档案。
- 如果原档案没有绑定其他 active 微信 openid，则允许当前微信重新绑定回原 auth user。
- 返回正式 customer/employee token。

## admin 端是否需要对接

本阶段 admin 暂无必须改动。

可选优化：

- 员工列表“登录绑定”列后续可以区分：
  - 微信小程序已绑定
  - 微信小程序已解绑
  - 仅手机号可恢复
- 超管用户身份事件页可展示 `identity_oauth_unbound` 事件。

## 后端验收点

- 解绑微信后，`customers.user_id` 不变。
- 解绑微信后，`employees.user_id` 不变。
- 解绑微信后，`user_business_memberships.status` 不变。
- 解绑微信后，`user_oauth_identities.status = 'unbound'`。
- 解绑微信后，旧 token 访问业务接口返回 `401 WECHAT_BINDING_NOT_MATCHED`。
- 同 openid 再次 `/auth` 返回 `platform_visitor`。
- 手机号验证码可以恢复原客户/员工身份。
