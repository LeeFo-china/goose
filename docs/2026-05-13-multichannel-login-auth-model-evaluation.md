# 多端登录与微信解绑模型评估报告

日期：2026-05-13

## 背景

当前系统已经出现微信小程序客户解绑后，一键登录仍可能回到客户首页的问题。这个问题暴露出一个更大的设计点：后续会有微信小程序、H5/网页、iOS、Android 等多端登录，登录账号、登录凭证、业务身份、租户身份需要分层清楚。

本文评估以下建议：

1. 后期支持多端登录。
2. 第一期微信小程序 landing 页通过 code 给后端，后端拿 openid，查 openid 和 user 一对一表；查到走用户身份登录，查不到走游客身份登录。
3. 微信解绑只删除 openid 和 user 一对一关系表记录。
4. 手机号存在 user 表，user 表保存业务身份，例如 employee、customer、visitor；登录方式用手机号验证码。

## 当前后端现状

当前系统没有独立的 `public.users` 业务用户表，实际账号主体是 Supabase `auth.users`。

当前相关表：

| 表 | 作用 |
| --- | --- |
| `auth.users` | Supabase 登录账号主体，当前后端用它作为 `auth_user_id` 来源 |
| `public.wechat_identities` | 微信 `openid/unionid -> auth.users.id` 映射 |
| `public.user_profiles` | 通用用户资料，例如昵称、头像 |
| `public.employees` | 员工业务身份，使用 `employees.user_id -> auth.users.id` 绑定登录账号 |
| `public.customers` | 客户业务身份，使用 `customers.user_id -> auth.users.id` 绑定登录账号 |

远端当前字段确认：

- `wechat_identities.auth_user_id/openid/unionid` 存在。
- `customers.user_id/phone/tenant_id/status` 存在。
- `employees.user_id/phone/tenant_id/status` 存在。
- `customers.updated_at` 不存在。
- `employees.updated_at` 不存在。

当前 `/auth` 链路已经接近你的第 2 点：

```text
微信 code
  -> 微信 jscode2session 拿 openid
  -> wechat_identities 查 auth_user_id
  -> 没有则创建 visitor auth user
  -> 实时查 employees/customers.user_id 推导身份
```

当前 `/auth/verify-role` 是手机号验证码绑定业务身份的入口：

```text
visitor token + phone + code + target_role
  -> target_role=customer 时绑定 customers.user_id
  -> target_role=employee 时绑定 employees.user_id
```

## 对建议的逐条评估

### 1. 多端登录方向

结论：方向正确，而且现在必须提前分层。

推荐把登录体系拆成四层：

| 层 | 含义 | 示例 |
| --- | --- | --- |
| 账号主体 | 系统里的统一用户 | `auth.users.id` 或未来 `public.users.id` |
| 登录凭证 | 某种登录方式 | 微信 openid、手机号验证码、苹果登录、网页登录 |
| 业务身份 | 用户在业务里的角色和档案 | 员工、客户、平台访客 |
| 访问上下文 | 本次 token 选中的身份和租户 | tenant_id、employee_id、customer_id |

多端登录不能把“微信 openid”“手机号”“员工/客户身份”混成一个字段，否则解绑、换绑、多租户、多身份都会互相污染。

### 2. 第一期微信小程序 `code -> openid -> user` 登录

结论：可行，且和当前实现基本一致。

建议第一期标准化为：

```text
POST /auth
  code -> openid
  openid -> wechat_identities.auth_user_id
  查到 auth_user_id：
    实时查 employees/customers 绑定关系
    返回 employee/customer/select_tenant/platform_visitor
  查不到 auth_user_id：
    创建 visitor 用户
    写入 wechat_identities
    返回 platform_visitor
```

关键点：

- `/auth` 只能根据实时绑定关系返回业务身份。
- 不能根据历史 token、本地缓存、历史手机号、历史 roles 直接进入客户首页。
- 返回结果必须优先让前端看 `mode`，不要只看 `roles.includes("customer")`。

建议响应模式：

```json
{
  "mode": "platform_visitor",
  "roles": ["visitor"]
}
```

```json
{
  "mode": "customer",
  "roles": ["customer"],
  "tenant": {},
  "customer": {}
}
```

```json
{
  "mode": "employee",
  "roles": ["employee"],
  "tenant": {},
  "employee": {}
}
```

```json
{
  "mode": "select_tenant",
  "roles": ["customer"],
  "tenants": []
}
```

### 3. 解绑只删除 `openid-user` 一对一关系

结论：作为长期模型可以成立，但在当前系统里不能直接这么做。这里需要先澄清业务定义：解绑微信凭证不等于删除用户，也不等于删除客户或员工业务身份。

如果用户已经绑定手机号，解绑微信后仍应该能通过手机号验证码登录；如果用户没有其他登录方式，解绑微信前需要给前端明确风险提示，避免用户把唯一登录入口解绑后无法找回。

因此“只删除 openid-user 一对一关系”成立的前提是系统已经存在统一账号和多登录凭证模型：

```text
user
  -> phone 登录凭证
  -> wechat_mini openid 登录凭证
  -> wechat_web openid 登录凭证
  -> apple 登录凭证
  -> password/web 登录凭证
```

解绑微信时，只停用其中一个微信登录凭证，不删除用户，不删除手机号，不删除业务身份。

当前不能只删 `wechat_identities` 的原因：

1. 当前客户身份绑定在 `customers.user_id` 上。如果只删除 `wechat_identities`，`customers.user_id` 仍指向原 `auth.users.id`，业务身份没有解绑。
2. 当前 `auth.users` 创建时使用 `${openid}@wechat.local`，并且有历史 `find_auth_user_by_openid` 兼容逻辑。只删 `wechat_identities` 后，同一个 openid 再登录时，后端可能通过历史 email 或 metadata 找回同一个 auth user，并重新补建 `wechat_identities`。
3. 一旦重新找回同一个 auth user，而 `customers.user_id` 没清空，用户仍会被解析成 customer。

因此当前第一期正确做法是：

```text
客户解绑微信：
  校验 token.sub + token.customer_id + token.tenant_id
  清空 customers.user_id
  失效 auth/customer context 缓存
  保留 wechat_identities
  之后 /auth 实时查不到 customers.user_id，返回 platform_visitor
```

也就是说，当前“解绑微信”实际上是“解除当前微信账号与客户业务身份的绑定”，不是删除微信登录凭证。

如果未来要改成“解绑只删 openid-user 关系”，必须同时完成这些架构调整：

- 登录账号不能再用 `${openid}@wechat.local` 作为可找回的稳定账号标识。
- `find_auth_user_by_openid` 这类历史修复逻辑不能在解绑后把 openid 自动补回旧账号。
- 业务身份不能只挂在 `customers.user_id/employees.user_id` 上，必须能通过手机号账号重新选择或绑定。
- 要有统一的登录凭证表，明确 credential 删除后不能自动恢复。

推荐未来表模型：

```sql
user_accounts (
  id uuid primary key,
  phone text null,
  status text not null,
  created_at timestamptz not null
)

user_oauth_identities (
  id uuid primary key,
  user_id uuid not null,
  platform text not null, -- wechat_mini, wechat_web, ios, android, apple
  openid text not null,
  unionid text null,
  status text not null default 'active', -- active, unbound
  bound_at timestamptz not null default now(),
  unbound_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(platform, openid)
)
```

在这个模型里，微信解绑不建议物理删除，建议逻辑解绑：

```sql
update user_oauth_identities
set status = 'unbound',
    unbound_at = now(),
    updated_at = now()
where user_id = :user_id
  and platform = 'wechat_mini'
  and openid = :openid
  and status = 'active';
```

为什么建议逻辑解绑：

- 安全审计可以追溯“哪个微信曾经绑定过哪个用户”。
- 可支持解绑通知、异常换绑排查、风控判断。
- 避免用户频繁解绑/绑定导致历史关系完全丢失。
- 后续可统计解绑原因、设备来源、操作 IP。

建议同时增加解绑审计：

```sql
user_auth_events (
  id uuid primary key,
  user_id uuid not null,
  event_type text not null, -- bind_oauth, unbind_oauth, rebind_oauth
  platform text null,
  openid_hash text null,
  operator_user_id uuid null,
  ip text null,
  user_agent text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
)
```

对于用户体验，也建议：

- 解绑前提示：解绑微信后仍可通过手机号验证码登录。
- 如果没有手机号或其他登录方式，禁止直接解绑，要求先绑定手机号。
- 解绑成功后通知用户，例如站内通知/短信/微信服务通知，第一期至少记录审计日志。

但这是下一阶段，不建议在当前表结构上硬改。当前仍应先清 `customers.user_id`，保证解绑后不能一键进入客户首页。

### 4. 手机号存在 user 表，user 表保存业务身份

结论：手机号放统一用户表是合理的；业务身份不建议只存在 user 表里。

原因：

- 一个用户可能在 A 租户是 customer，在 B 租户是 customer。
- 一个用户也可能既是某装修公司的 employee，又是另一个业务里的 customer。
- 平台超管、租户员工、客户、游客并不是互斥关系。
- 业务身份带租户上下文，不能用单个 `users.role = customer/employee/visitor` 表达。

推荐做法：

1. `user_accounts.phone` 保存手机号，作为统一账号联系方式。
2. 业务身份继续由 `employees/customers` 或未来 `user_business_memberships` 表表达。
3. `users` 表可以保存“默认身份”或“最近使用身份”，但只能作为体验优化，不能作为权限判断来源。

推荐未来业务身份表：

```sql
user_business_memberships (
  id uuid primary key,
  user_id uuid not null,
  tenant_id uuid null,
  identity_type text not null, -- employee, customer, platform_admin
  identity_id uuid null, -- employees.id / customers.id
  status text not null,
  created_at timestamptz not null,
  unique(user_id, tenant_id, identity_type, identity_id)
)
```

第一期不一定要新增这张表，可以继续从 `employees/customers` 实时推导。但文档和代码要明确：`roles` 是推导结果，不是唯一事实来源。

## 推荐落地方案

### 第一阶段：基于当前架构修稳

目标：不大改表结构，先解决微信解绑和一键登录问题。

后端规则：

- `/auth`：
  - 只从 `wechat_identities.openid -> auth_user_id` 找账号。
  - 业务身份实时查 `employees.user_id/customers.user_id`。
  - 没有绑定时返回 `platform_visitor`。
- `/customer/auth/unbind-wechat`：
  - 只清 `customers.user_id = null`。
  - 不写 `customers.updated_at`，因为当前远端表没有该字段。
  - 不依赖前端传 customer_id。
- `/auth/me/customer-context`：
  - 旧 token 带 `customer_id/tenant_id` 但实时查不到绑定时，返回 `CUSTOMER_CONTEXT_MISSING`。
- `/auth/verify-role`：
  - 才允许手机号验证码重新绑定 customer/employee。
  - 已绑定其他微信时返回 `WECHAT_ALREADY_BOUND`，不能自动覆盖。

这一阶段与当前代码最匹配。

### 第二阶段：补统一账号表或账号视图

目标：把手机号、用户资料、多端登录凭证收敛到统一账号层。

可选方案：

1. 保持 Supabase `auth.users` 为账号主体，新增 `user_account_profiles`。
2. 新增 `public.user_accounts`，逐步从 `auth.users` 迁移到业务账号主体。

更稳妥的是第一种：

```text
auth.users
  -> user_profiles / user_account_profiles
  -> user_login_identities
  -> employees/customers
```

### 第三阶段：统一多端登录凭证

目标：支持微信小程序、H5、iOS、Android、手机号验证码、苹果登录等。

新增统一凭证表：

```text
user_oauth_identities / user_login_identities
```

字段建议：

| 字段 | 说明 |
| --- | --- |
| `user_id` | 统一账号 |
| `provider/platform` | `wechat_miniprogram`、`wechat_web`、`phone_otp`、`apple`、`password` |
| `provider_subject/openid` | openid、手机号、apple sub 等 |
| `platform` | mini_program、h5、ios、android、web |
| `status` | active、unbound、disabled |
| `last_login_at` | 最近登录时间 |

解绑微信时再转为：

```text
停用 user_oauth_identities 中对应 openid 记录
不直接删除用户账号
不直接删除业务身份
```

## 当前建议的取舍

| 建议 | 当前可行性 | 结论 |
| --- | --- | --- |
| 多端登录要提前设计 | 高 | 应立即按账号、凭证、业务身份、访问上下文分层 |
| 小程序 code -> openid -> user -> 身份解析 | 高 | 当前已接近，应继续强化 `mode` 驱动 |
| 解绑只删 openid-user 映射 | 当前低，未来高 | 当前不能只删；未来要先改登录凭证模型 |
| 手机号存 user 表 | 中高 | 可做，但当前先用 `auth.users + user_profiles` 过渡 |
| user 表直接存 employee/customer/visitor | 不建议 | 业务身份应实时从员工/客户/成员关系推导 |

## 推荐决策

第一期不要重构成“解绑只删 openid-user 映射”。当前最稳方案是：

```text
微信身份表保留。
客户解绑清 customers.user_id。
/auth 实时查业务绑定，没绑定就 visitor。
手机号验证码重新绑定走 /auth/verify-role。
```

中长期可以演进到：

```text
auth.users 或 public.user_accounts 作为统一账号
user_login_identities 管多端登录凭证
employees/customers/user_business_memberships 管业务身份
token 只表达本次选择的访问上下文
```

这样既能解决当前微信解绑问题，也能支撑后续网页端、iOS、Android 和多身份切换。

## 验收标准

第一期验收：

1. 客户解绑后，`customers.user_id` 为空。
2. 同一个微信再次 `/auth`，返回 `mode=platform_visitor`。
3. 旧 customer token 访问 `/auth/me/customer-context`，返回 `CUSTOMER_CONTEXT_MISSING` 或 visitor 空上下文。
4. visitor token 通过 `/auth/verify-role` + 手机验证码，可以重新绑定客户。
5. 已绑定其他微信的手机号不能被自动覆盖，必须返回 `WECHAT_ALREADY_BOUND`。

中长期验收：

1. 同一用户可以绑定多个登录凭证。
2. 删除某个登录凭证不会删除用户账号。
3. 一个用户可以拥有多个租户、多个业务身份。
4. 前端跳转只按 `mode` 和服务端上下文，不按本地历史 roles。
5. 所有业务接口都实时校验 token 上下文对应的业务绑定关系。
