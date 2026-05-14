# Admin 身份排障工具对接说明

日期：2026-05-14

## 背景

多端登录重构进入 `AUTH_IDENTITY_SOURCE=membership` 灰度后，登录问题不能再只看 `customers.user_id` 或 `employees.user_id`。超管需要一个只读排障入口，把手机号、openid、auth user、OAuth 凭证、业务身份关系和旧字段放在同一屏里核对。

## 后端接口

```http
GET /platform/identity-diagnostics?keyword=关键词
```

权限：

- 仅平台超管可访问。
- 非平台超管返回 `403 FORBIDDEN`。

`keyword` 支持：

- 11 位手机号
- 微信小程序 openid
- auth user_id
- 客户或员工档案 ID

返回数据：

- `auth_users`
- `oauth_identities`
- `legacy_wechat_identities`
- `memberships`
- `current`
  - `memberships`：当前 `active` 业务身份。
  - `oauth_identities`：当前 `active` OAuth 凭证。
- `history`
  - `memberships`：历史解绑、禁用等非 `active` 业务身份。
  - `oauth_identities`：历史解绑、禁用等非 `active` OAuth 凭证。
- `customers`
- `employees`
- `tenants`
- `auth_events`
- `issues`
- `summary`

## Admin 页面

新增页面：

```text
/platform/identity-diagnostics
```

导航位置：

```text
平台运营 -> 身份排障
```

页面能力：

- 输入手机号 / openid / user_id 查询。
- 查看当前业务身份关系。
- 查看历史解绑业务身份。
- 查看客户 / 员工档案旧 `user_id`。
- 查看当前 `user_oauth_identities`。
- 查看历史解绑 `user_oauth_identities`。
- 查看旧 `wechat_identities`。
- 查看最近身份事件。
- 展示一致性问题：
  - 红色：需要处理。
  - 黄色：需要关注。

## 第一版只读范围

本版不提供任何修改操作：

- 不解绑微信。
- 不恢复 OAuth。
- 不修改 membership。
- 不清旧字段。

处理动作仍走既有后台流程或后端脚本，避免排障页变成高风险操作入口。

## 验收记录

已验证：

```bash
bun run api:typecheck
bun run api:build
pnpm --dir apps/admin build
```

接口验证：

```http
GET /platform/identity-diagnostics?keyword=19100005007
GET /platform/identity-diagnostics?keyword=oD-Pj5FxfjI8pupbHleYD9XGVTlM
```

结果：

- 接口返回 `success`。
- 能识别手机号和 openid。
- 能聚合 OAuth、membership、旧微信表、客户/员工档案和身份事件。
- 能区分当前 `active` 记录与历史 `unbound` 记录。
- 重绑后如果同一 `user_id + platform + openid` 已存在当前 active OAuth，历史 unbound OAuth 不再触发 `unbound_oauth_has_legacy_wechat` 误报。
