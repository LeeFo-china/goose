# 多端登录重构阶段 5 微信解绑语义切换记录

日期：2026-05-14

## 目标

将微信解绑从“解除业务身份绑定”切换为“停用当前微信登录凭证”。

## 后端改动

### 1. 解绑不再清业务身份

`POST /customer/auth/unbind-wechat`：

- 不再清空 `customers.user_id`。
- 不再解绑 `user_business_memberships`。
- 仅删除旧兼容映射 `wechat_identities`。
- 仅将当前 `user_oauth_identities(platform='wechat_mini', openid)` 标记为 `unbound`。

`POST /employee/auth/unbind-wechat`：

- 不再清空 `employees.user_id`。
- 不再解绑 `user_business_memberships`。
- 仅删除旧兼容映射 `wechat_identities`。
- 仅将当前 `user_oauth_identities(platform='wechat_mini', openid)` 标记为 `unbound`。

### 2. 禁止无手机号档案解绑

如果当前客户或员工档案没有手机号，后端返回：

```json
{
  "code": "UNBIND_FORBIDDEN",
  "message": "当前账号未绑定手机号，无法解绑唯一微信登录方式"
}
```

原因：当前阶段手机号验证码是恢复原业务身份的主要路径。

### 3. 旧 token 失效

全局 auth 插件增加 openid active OAuth 校验：

- `AUTH_IDENTITY_SOURCE=membership`：必须存在 active `user_oauth_identities`。
- `AUTH_IDENTITY_SOURCE=dual`：优先 active OAuth，兼容 fallback 到 `wechat_identities`。
- `AUTH_IDENTITY_SOURCE=legacy`：保持旧逻辑。

解绑后旧 token 再访问业务接口，会返回：

```json
{
  "code": "WECHAT_BINDING_NOT_MATCHED",
  "message": "当前微信登录凭证已失效，请重新登录"
}
```

### 4. 客户手机号恢复路径

客户解绑后，同微信再次进入会变成 visitor。

用户通过手机号验证码恢复客户身份时，如果客户档案仍绑定原 auth user 且原 auth user 没有其他 active 微信 openid，后端会：

- 将当前 openid 重新绑定回原 auth user。
- 同步 active `user_oauth_identities`。
- 保留并同步 active customer membership。
- 返回正式 customer token。

员工侧此前已有类似恢复逻辑，本阶段继续保留。

## 非破坏性验收

本地 API 使用：

```bash
AUTH_IDENTITY_SOURCE=membership LOG_LEVEL=error PORT=3000 bun run api:start
```

使用真实 customer membership 但伪造不存在的 openid 访问：

```http
GET /auth/me/customer-context
```

返回：

```http
401 Unauthorized
```

```json
{
  "success": false,
  "message": "当前微信登录凭证已失效，请重新登录",
  "code": "WECHAT_BINDING_NOT_MATCHED"
}
```

结论：解绑后旧 token 即使仍带有有效业务 membership，也会因为微信 OAuth 凭证失效被拒绝。

## 验证命令

已通过：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

## 小程序对接

见：

`docs/application_integration_documentation/2026-05-14-miniprogram-wechat-unbind-stage5-integration.md`

## 后续建议

1. 灰度环境先设置 `AUTH_IDENTITY_SOURCE=membership` 验证解绑、重登、手机号恢复。
2. 真机验收客户和员工两条链路。
3. 再考虑清理旧兼容逻辑和历史 `wechat_identities` 主读路径。
