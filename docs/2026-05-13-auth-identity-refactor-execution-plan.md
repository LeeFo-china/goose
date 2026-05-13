# 多端登录与业务身份解耦分阶段执行计划

日期：2026-05-13

## 目标

把当前登录体系从“登录账号直接挂在 customers/employees 上”逐步改造成四层模型：

```text
auth.users
  -> user_oauth_identities       登录凭证：微信、苹果、手机号、网页等
  -> user_business_memberships   业务身份：客户、员工、平台管理员
  -> customers / employees       业务档案
```

核心目标：

- 微信解绑不再清空客户或员工业务档案。
- 一个用户可以拥有多个登录方式。
- 一个用户可以拥有多个业务身份。
- 小程序、H5、iOS、Android、Web 后续接入时不互相污染。
- token 只表达“本次选择的访问上下文”，真实绑定关系从服务端表实时校验。

## 当前约束

当前系统实际情况：

- 账号主体是 Supabase `auth.users`。
- 微信登录凭证是 `public.wechat_identities`。
- 客户业务身份绑定在 `customers.user_id`。
- 员工业务身份绑定在 `employees.user_id`。
- 远端 `customers/employees` 当前没有 `updated_at` 字段。
- `/auth` 已经开始按 `employees.user_id/customers.user_id` 实时推导身份。

因此第一阶段不能直接改成“解绑只删 openid-user 映射”。必须先补新表、迁移数据、改读写路径，最后再切换解绑语义。

## 分阶段执行

### 阶段 0：冻结当前行为与补验收用例

目标：先把当前行为固定住，避免后续重构时回归。

执行内容：

1. 明确 `/auth` 返回以 `mode` 为准：
   - `platform_visitor`
   - `customer`
   - `employee`
   - `select_tenant`
   - 后续可扩展 `select_identity`
2. 明确微信解绑当前语义：
   - 当前版本是“解除微信账号与业务身份绑定”。
   - 当前版本仍会清 `customers.user_id` 或 `employees.user_id`。
3. 固定旧 token 拦截：
   - 旧 customer token 访问客户业务接口必须实时校验 `customers.user_id = token.sub`。
4. 补充接口验收脚本或手工 SQL 验收清单。

验收标准：

- 客户解绑后 `customers.user_id is null`。
- 同微信再次 `/auth` 返回 `mode=platform_visitor`。
- 旧客户 token 请求 `/auth/me/customer-context` 返回 `CUSTOMER_CONTEXT_MISSING` 或被 auth hook 拦截。
- 已绑定其他微信的客户手机号不能自动覆盖，返回 `WECHAT_ALREADY_BOUND`。

是否需要发版：需要。此阶段是当前线上问题兜底。

### 阶段 1：新增登录凭证表和业务身份关系表

目标：新增未来模型，不改变现有业务读写路径。

落地状态：

- 已新增 migration：`supabase/migrations/20260513143000_create_user_auth_identity_tables.sql`。
- 本阶段只创建表、索引、触发器和注释，不切换任何登录或解绑主链路。
- `user_business_memberships.tenant_id` 允许为空，实际唯一索引使用 `(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))` 规避 PostgreSQL null 不参与唯一比较的问题，避免全局身份重复。

新增表建议：

```sql
create table public.user_oauth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  openid text not null,
  unionid text null,
  status text not null default 'active',
  bound_at timestamptz not null default now(),
  unbound_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_oauth_identities_status_check
    check (status in ('active', 'unbound', 'disabled')),
  constraint user_oauth_identities_platform_check
    check (platform in ('wechat_mini', 'wechat_web', 'ios', 'android', 'web', 'apple'))
);

create unique index user_oauth_identities_platform_openid_active_unique
on public.user_oauth_identities(platform, openid)
where status = 'active';

create index user_oauth_identities_user_status_idx
on public.user_oauth_identities(user_id, status);
```

```sql
create table public.user_business_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null references public.tenants(id) on delete cascade,
  identity_type text not null,
  identity_id uuid not null,
  status text not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_business_memberships_identity_type_check
    check (identity_type in ('customer', 'employee', 'platform_admin')),
  constraint user_business_memberships_status_check
    check (status in ('active', 'disabled', 'unbound'))
);

create unique index user_business_memberships_identity_unique
on public.user_business_memberships(
  user_id,
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  identity_type,
  identity_id
)
where status = 'active';

create index user_business_memberships_user_status_idx
on public.user_business_memberships(user_id, status);

create index user_business_memberships_identity_idx
on public.user_business_memberships(identity_type, identity_id, status);
```

新增审计表建议：

```sql
create table public.user_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  platform text null,
  openid_hash text null,
  operator_user_id uuid null references auth.users(id) on delete set null,
  ip text null,
  user_agent text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

验收标准：

- migration 可重复执行。
- 三张表创建成功。
- active oauth 凭证唯一约束生效。
- active 业务身份关系唯一约束生效。
- 不影响现有 `/auth`、`/auth/verify-role`、员工后台登录。

是否需要发版：可以和阶段 2 一起发，但建议单独执行 migration 并验收。

### 阶段 2：历史数据回填

目标：把现有绑定关系写入新模型，但旧字段仍保留。

落地状态：

- 已新增 migration：`supabase/migrations/20260513150000_backfill_user_auth_identity_tables.sql`。
- 回填只读取 `wechat_identities`、`customers.user_id`、`employees.user_id`，不修改旧模型字段。
- 当前远端 `wechat_identities`、`customers`、`employees` 均不依赖 `updated_at`，回填时使用 `created_at` 或 `now()`。
- 同一用户、同一租户、同一身份类型下如存在多条业务档案，只把创建时间最早的一条标记为 `is_default=true`，避免默认身份唯一索引冲突。

回填微信凭证：

```sql
insert into public.user_oauth_identities (
  user_id,
  platform,
  openid,
  unionid,
  status,
  bound_at,
  created_at,
  updated_at
)
select
  auth_user_id,
  'wechat_mini',
  openid,
  unionid,
  'active',
  created_at,
  created_at,
  coalesce(updated_at, created_at)
from public.wechat_identities
on conflict do nothing;
```

回填客户身份：

```sql
insert into public.user_business_memberships (
  user_id,
  tenant_id,
  identity_type,
  identity_id,
  status,
  created_at,
  updated_at
)
select
  user_id,
  tenant_id,
  'customer',
  id,
  'active',
  coalesce(created_at, now()),
  now()
from public.customers
where user_id is not null
  and tenant_id is not null
on conflict do nothing;
```

回填员工身份：

```sql
insert into public.user_business_memberships (
  user_id,
  tenant_id,
  identity_type,
  identity_id,
  status,
  created_at,
  updated_at
)
select
  user_id,
  tenant_id,
  'employee',
  id,
  case when status = 'active' then 'active' else 'disabled' end,
  coalesce(created_at, now()),
  now()
from public.employees
where user_id is not null
  and tenant_id is not null
on conflict do nothing;
```

注意：

- 如果远端表没有 `updated_at`，回填 SQL 不能引用该列。
- 当前已确认 `customers/employees` 没有 `updated_at`，回填时只用 `created_at` 或 `now()`。

验收标准：

- `wechat_identities` active 记录数与 `user_oauth_identities(platform='wechat_mini', status='active')` 对齐。
- `customers.user_id is not null` 记录都有 customer membership。
- `employees.user_id is not null` 记录都有 employee membership。
- 重复执行不会产生重复关系。
- 抽查 5 个客户、5 个员工，身份关系正确。

是否需要发版：需要后端支持只读比对日志后再发下一阶段。

### 阶段 3：后端双读校验

目标：代码仍以旧字段为主，但旁路读取新表并比对差异。

执行内容：

1. 新增 `identityService`：
   - `findActiveOauthIdentity(platform, openid)`
   - `listActiveBusinessMemberships(userId)`
   - `findCustomerMembership(userId, tenantId, customerId)`
   - `findEmployeeMembership(userId, tenantId, employeeId)`
2. `/auth` 登录时：
   - 仍可从 `wechat_identities` 找 `auth_user_id`。
   - 同时从 `user_oauth_identities` 查 active 凭证，记录差异日志。
   - 业务身份仍以 `customers/employees.user_id` 为准。
   - 同时从 `user_business_memberships` 查 active memberships，记录差异日志。
3. 解绑、绑定、换绑：
   - 仍写旧字段。
   - 同步写新表。
4. 增加差异监控：
   - 旧字段有，新表没有。
   - 新表有，旧字段没有。
   - 身份租户不一致。

验收标准：

- `/auth`、`/auth/verify-role` 响应不变。
- 绑定客户后，新旧两边都有关系。
- 解绑客户后，新旧两边状态一致。
- 差异日志可查询。
- 试运行 3 到 7 天，差异率为 0 或可解释。

是否需要发版：需要。

### 阶段 4：后端切换为新表优先

目标：业务身份解析改为 `user_business_memberships` 优先，旧字段作为兜底。

执行内容：

1. `/auth`：
   - `openid -> user_oauth_identities(active) -> user_id` 优先。
   - 兼容期保留 `wechat_identities` fallback。
   - 业务身份从 `user_business_memberships` 查询。
   - fallback 到 `customers/employees.user_id` 时记录告警。
2. `/auth/verify-role`：
   - 绑定手机号身份时新增 membership。
   - 兼容期仍写 `customers.user_id/employees.user_id`。
3. `/auth/me/customer-context`：
   - 先校验 token 上下文是否存在 active customer membership。
   - 再查 `customers` 档案。
4. 客户/员工业务接口鉴权：
   - 用 membership 校验身份关系。
   - 旧字段作为兼容兜底。

验收标准：

- 微信一键登录按 membership 返回正确 `mode`。
- 一个用户多个 customer membership 时返回 `select_tenant` 或后续 `select_identity`。
- 一个用户既是 employee 又是 customer 时不会被错误强制进某一端。
- 旧 token 失效逻辑仍有效。
- 回滚开关可把身份解析切回旧字段。

是否需要发版：需要灰度。建议加环境变量：

```text
AUTH_IDENTITY_SOURCE=legacy|dual|membership
```

### 阶段 5：微信解绑语义切换

目标：微信解绑从“清业务身份绑定”切换为“停用微信登录凭证”。

新逻辑：

```text
POST /customer/auth/unbind-wechat
  校验当前 token 对应 user_id
  校验当前 user_id 至少还有一个可用登录方式，例如手机号
  将 user_oauth_identities(platform='wechat_mini', openid=token.openid) 置为 unbound
  写 user_auth_events
  不修改 customers
  不修改 employees
```

产品规则：

- 如果当前用户没有手机号或其他 active 登录方式，禁止解绑微信。
- 前端提示：“解绑微信后，可继续使用手机号验证码登录。”
- 解绑成功后清本地 token，回 landing。
- 同微信再次 `/auth` 时，因为 oauth identity 已 unbound，应返回新 visitor，而不是原账号身份。

关键技术点：

- 不能再通过 `${openid}@wechat.local` 或 `find_auth_user_by_openid` 自动找回旧账号。
- `find_auth_user_by_openid` 应只作为历史修复工具，不应该在 active oauth identity 不存在时自动补回。
- `wechat_identities` 需要停止作为主身份映射，或同步标记状态。

验收标准：

- 解绑微信后，`user_oauth_identities.status='unbound'`。
- `customers/employees` 业务档案不被修改。
- 同微信再次 `/auth` 返回 `platform_visitor`。
- 同用户用手机号验证码登录后，仍能看到原 customer/employee 身份。
- 没有手机号的用户不能解绑唯一微信凭证。
- `user_auth_events` 有解绑审计记录。

是否需要发版：需要重点灰度和真机验证。

### 阶段 6：停止写旧字段

目标：停止依赖 `customers.user_id/employees.user_id`。

执行内容：

1. 新代码不再写 `customers.user_id`。
2. 新代码不再写 `employees.user_id`。
3. 所有身份判断走 `user_business_memberships`。
4. 后台保留只读展示旧字段差异，用于排查。
5. 运行一段稳定期后，再决定是否删除旧字段。

验收标准：

- 新增客户绑定只产生 membership。
- 新增员工绑定只产生 membership。
- 旧字段为空也能正常登录和鉴权。
- 所有客户/员工业务接口都能通过 membership 校验。
- 没有新增差异告警。

是否需要发版：需要。

### 阶段 7：清理旧模型

目标：完成模型收敛，减少双写复杂度。

可清理项：

- `wechat_identities` 改为只读归档或迁移到 `user_oauth_identities`。
- `customers.user_id` 废弃或删除。
- `employees.user_id` 废弃或删除。
- `find_auth_user_by_openid` RPC 停止用于登录主链路。
- 文档和前端对接改为新模型描述。

是否删除字段要谨慎：

- 先标记 deprecated。
- 至少一个版本周期不写、不读。
- 确认报表、后台、脚本都不依赖。
- 再出 migration 删除。

验收标准：

- 删除前全仓 `rg "customers.user_id|employees.user_id|wechat_identities"` 无主链路依赖。
- 备份历史数据。
- 删除后全量 typecheck/build 通过。
- 登录、解绑、换绑、手机号登录、多身份选择全部通过验收。

## Admin 对接点

第一阶段不需要 admin 立即新增页面。

从阶段 3 开始建议增加只读排查能力：

- 用户账号详情页：
  - 登录凭证列表。
  - 业务身份列表。
  - 最近登录/解绑/换绑事件。
- 客户/员工详情页：
  - 当前绑定账号。
  - 绑定来源。
  - 是否来自旧字段兼容。
- 超管排障工具：
  - 根据手机号查用户、oauth、membership、customer、employee。
  - 展示差异告警。

阶段 5 之后，admin 可以支持：

- 人工解绑某个 oauth 凭证。
- 人工恢复误解绑凭证。
- 查看解绑审计。

## 微信小程序对接点

第一阶段继续按现有接口：

- landing 调 `/auth`。
- 按 `mode` 分流，不按本地 roles 分流。
- visitor 通过 `/auth/verify-role` 绑定手机号身份。
- 客户个人中心解绑调用 `/customer/auth/unbind-wechat`。

阶段 5 切换后需要调整文案：

- 解绑微信前提示手机号登录兜底。
- 如果后端返回 `LAST_LOGIN_IDENTITY_REQUIRED`，引导先绑定手机号。
- 解绑后清本地 token，并回到 landing。
- 同微信再次登录是 visitor，手机号登录后可恢复原业务身份。

## 风险与回滚

主要风险：

- 新旧模型双写不一致。
- 历史 openid 修复逻辑把已解绑微信重新补回。
- 多身份用户被前端错误分流。
- 旧 token 未实时校验 membership。
- 没有手机号的用户解绑后无法登录。

回滚策略：

- 阶段 1/2 只新增表和回填，可直接停止使用新表。
- 阶段 3 双读不改主链路，可关闭差异日志。
- 阶段 4 必须有 `AUTH_IDENTITY_SOURCE=legacy` 回滚开关。
- 阶段 5 切换解绑语义前必须保留旧解绑接口逻辑开关。
- 阶段 6/7 之前不要删除旧字段。

建议开关：

```text
AUTH_IDENTITY_SOURCE=legacy|dual|membership
WECHAT_UNBIND_MODE=business_identity|oauth_identity
AUTH_OAUTH_IDENTITY_ENABLED=false|true
```

## 总体验收清单

- 微信解绑不再导致客户/员工业务档案丢失。
- 微信解绑后，同微信一键登录不能进入原客户首页。
- 用户可通过手机号验证码重新进入原业务身份。
- 一个用户能同时拥有 customer 和 employee 身份。
- 一个用户能在多个租户下拥有不同身份。
- 前端始终按后端 `mode` 分流。
- 所有客户/员工业务接口都实时校验 token 上下文。
- 解绑、绑定、换绑都有审计记录。
- 新旧模型切换有回滚开关。

## 建议执行顺序

1. 先完成阶段 0，确保当前线上问题不回归。
2. 执行阶段 1 migration，新增表但不改业务。
3. 执行阶段 2 回填并验收数据。
4. 执行阶段 3 双写双读观察。
5. 观察稳定后执行阶段 4，新表优先。
6. 再执行阶段 5，切换微信解绑语义。
7. 阶段 6/7 放到稳定运行后处理，不急于删除旧字段。
