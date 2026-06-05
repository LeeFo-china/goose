# Visitor 登录态 token 形态后端对接

更新时间：2026-06-05

来源文档：

```text
/Users/leefo/Public/work/orange/docs/2026-06-05-visitor-auth-session-token-backend.md
```

## 背景

visitor 首页定位相关接口要求使用新形态 visitor 会话 token：

```json
{
  "token_type": "visitor_session",
  "visitor_id": "wechat_visitor_xxx",
  "openid": "wechat-openid",
  "login_channel": "wechat",
  "roles": ["visitor"]
}
```

旧的纯 visitor auth token：

```json
{
  "sub": "auth-user-id",
  "openid": "wechat-openid",
  "roles": ["visitor"]
}
```

不再作为 `/visitor/location/*` 的有效凭证。

## 后端决策

- 不兼容旧纯 visitor auth token。
- `/auth` 在 `platform_visitor` 分支统一返回 `visitor_session` token。
- `/visitor/location/*` 继续严格要求 `token_type=visitor_session` 且存在 `visitor_id`。
- employee/customer token 不允许访问 visitor 定位上下文。

## 后端实现记录

已完成：

- 新建微信 visitor 继续通过 `createVisitorSessionResponse()` 返回 `visitor_session`。
- 已存在 auth user 但无员工/客户身份的 visitor-only 分支，改为通过 `createAuthUserVisitorResponse()` 返回 `visitor_session`。
- customer 角色验证手机号无客户匹配时，返回 `platform_visitor` 也改为 `visitor_session`。
- `platform_visitor` 响应补充 `authMode="platform_visitor"`。
- `platform_visitor` 响应返回 `user_id=null`、`visitor_id`、`roles=["visitor"]`。
- `visitor_id` 使用稳定派生规则：

```text
wechat_visitor_${sha256(openid).slice(0, 32)}
```

保持不变：

- `/visitor/location/options`
- `/visitor/location-context`
- `/visitor/location-bootstrap`
- `/visitor/location-bootstrap/confirm`
- `/visitor/location-bootstrap/skip`

上述接口仍只接受：

```ts
request.user?.token_type === "visitor_session" && request.user.visitor_id
```

## 响应示例

```json
{
  "mode": "platform_visitor",
  "authMode": "platform_visitor",
  "token": "<visitor_session_jwt>",
  "user_id": null,
  "visitor_id": "wechat_visitor_xxx",
  "roles": ["visitor"],
  "tenant": null,
  "employee": null,
  "customer": null,
  "has_customer_profile": false
}
```

## 开发库 smoke

| 用例 | 结果 |
| --- | --- |
| 新形态 `visitor_session` token 调 `GET /visitor/location/options` | 200 |
| 旧纯 visitor token 调 `GET /visitor/location/options` | 401，`请使用 visitor 登录态` |

验证命令：

```text
bun run api:check
git diff --check
```

## 小程序侧配合

小程序侧继续执行来源文档中的策略：

- 启动恢复时发现本地 visitor token 不是 `visitor_session`，强制重新 `/auth`。
- token 未就绪时不请求 `/visitor/location/*`。
- 不向用户展示“请使用 visitor 登录态”这类内部认证文案。
