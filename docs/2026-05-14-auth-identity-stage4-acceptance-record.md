# 多端登录重构阶段 4 验收记录

日期：2026-05-14

## 本阶段目标

阶段 4 的目标是让微信小程序登录链路从旧模型逐步切到新身份模型：

- 登录凭证优先读 `user_oauth_identities(platform='wechat_mini', status='active')`。
- 业务身份优先读 `user_business_memberships(status='active')`。
- 旧表 `wechat_identities`、`employees.user_id`、`customers.user_id` 在兼容期继续作为 fallback。
- 保留 `AUTH_IDENTITY_SOURCE=legacy|dual|membership` 回滚开关。

## 已完成提交

- `89ea21f feat: prefer identity memberships for wechat auth`
- `f6c0bc0 feat: validate wechat role binding by memberships`

## 构建验收

已通过：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

## 远端数据一致性核验

使用 `supabase db query --linked` 对远端做只读核验。

| 检查项 | 结果 |
| --- | ---: |
| `wechat_identities` 记录数 | 18 |
| `user_oauth_identities` active 微信小程序记录数 | 18 |
| 旧微信映射与 active OAuth 不一致 | 0 |
| active 客户旧绑定缺少 customer membership | 0 |
| active 员工旧绑定缺少 employee membership | 1 |
| active membership 没有微信 OAuth | 4 |

说明：

- 1 条缺少 employee membership 的员工为 `tenant_id = null` 的孤立档案，不属于可登录租户。
- 4 条没有微信 OAuth 的 active membership 均为历史/测试员工身份，当前没有微信小程序登录凭证，不影响微信一键登录主链路。

## 重点手机号复核

### 19951111302

该员工此前出现“解绑后仍可进入员工首页”的问题。当前复核结果：

- `employees.user_id = null`
- 无 `wechat_identities`
- 无 active `user_oauth_identities`
- `user_business_memberships` 为 `unbound`

结论：按阶段 4 新主读逻辑，不会再通过微信一键登录进入员工首页。

### 19000005001 / 19000005002

当前两条员工档案存在 active employee membership，但没有微信 OAuth：

- 这代表业务身份仍有效。
- 但微信小程序一键登录没有 active openid 凭证，不会被 `/auth` 直接登录为员工。
- 手机号验证码绑定或网页端登录仍可按业务规则处理。

## 接口验收

本地启动 API：

```bash
AUTH_IDENTITY_SOURCE=membership LOG_LEVEL=error PORT=3000 bun run api:start
```

使用安全样本调用：

```http
POST /customer/auth/select-tenant
```

样本：

- `user_id`: `d08b0231-af88-4ebf-9ef7-0b792bf0b7e8`
- `tenant_id`: `91d255fe-60a2-4379-b939-8aff35e693ac`
- `customer_id`: `31b5f2c7-103b-49f9-b3c7-4ab9e3775114`

返回结果：

```json
{
  "message": "客户租户已选择",
  "mode": "customer",
  "tenant_id": "91d255fe-60a2-4379-b939-8aff35e693ac",
  "customer_id": "31b5f2c7-103b-49f9-b3c7-4ab9e3775114",
  "roles": ["customer"],
  "has_token": true
}
```

结论：`AUTH_IDENTITY_SOURCE=membership` 下，客户租户选择可以通过 active customer membership 完成正式客户登录。

## 当前结论

阶段 4 第一轮后端切换可以继续灰度。

建议灰度顺序：

1. 测试环境设置 `AUTH_IDENTITY_SOURCE=membership`。
2. 生产环境先保持默认 `dual`。
3. 观察 `user_auth_events` 中 `identity_oauth_mismatch`、`identity_membership_mismatch`、`identity_observe_failed`。
4. 若 24-48 小时无异常，再考虑生产切换到 `membership`。

## 下一步

进入阶段 5 前，建议先补齐：

1. `/auth/me/customer-context` active customer membership 校验。
2. 客户/员工业务接口鉴权逐步从旧字段切到 membership。
3. 微信解绑语义从“清业务身份绑定”切换为“停用微信登录凭证”，并确保用户仍有手机号等其他登录方式。
