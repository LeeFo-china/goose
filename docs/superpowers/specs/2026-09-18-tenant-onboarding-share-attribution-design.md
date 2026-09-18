# 装企入驻分享归因后端设计

日期：2026-09-18

## 目标与边界

为微信小程序装企入驻页提供可验证的分享归因。后端签发不可猜的 `share_token`，记录分享页打开次数，在申请提交事务内解析 token 并保存转发人快照，同时提供按分享链接分页查询统计和归因申请的接口。

本次只修改 `gooes`。`orange` 中的小程序交接文档保持只读；小程序调用新接口、携带 token 的代码由小程序团队完成。

## 方案选择

采用独立的 `tenant_onboarding_share_links` 模型，不复用 `tenant_share_links`。现有表面向具体租户的员工获客，强制 `tenant_id` 且包含客户绑定语义；装企入驻分享允许平台员工和租户员工发起，归因对象是平台入驻申请，两者生命周期和权限边界不同。

分享 token 使用 `tnob_` 前缀加 256 位随机内容，表仅允许服务角色访问。创建接口要求 UUID `Idempotency-Key`，以 `(sharer_user_id, idempotency_key)` 保证重试返回同一链接。默认有效期 30 天，可通过状态吊销。

## 数据模型

新增 `tenant_onboarding_share_links`：

- `id`
- `share_token`，唯一、不可由连续 ID 推断
- `scene`，固定为 `tenant_onboarding`
- `sharer_user_id`，引用 `auth.users`
- `sharer_employee_id`，引用 `employees`
- `sharer_openid`，创建时从可信 JWT 快照，可空
- `sharer_display_name`，员工名称快照
- `idempotency_key`
- `status`：`active` / `revoked`
- `expires_at`
- `view_count`
- `submitted_count`
- `created_at` / `updated_at`

`tenant_onboarding_applications` 新增：

- `share_link_id`
- `referred_by_user_id`
- `referred_by_openid`
- `referred_by_employee_id`
- `referral_source`，有效归因时为 `tenant_onboarding_share`

对分享链接创建者、过期状态、申请关联和审核状态查询建立必要索引。表启用 RLS 且不向 `anon` / `authenticated` 授表权限，所有访问经 API 服务角色完成。

## API

### 创建链接

`POST /tenant-onboarding/share-links`

- 需要已登录且状态有效的员工身份；平台员工额外验证平台会话版本。
- 要求 UUID `Idempotency-Key`。
- 请求体为空对象。
- 返回 `share_token`、固定标题、含 token 的小程序路径、过期时间和转发人信息。

### 记录打开

`POST /tenant-onboarding/share-links/:token/open`

- 需要 `visitor_session`。
- 数据库函数原子校验状态和过期时间并增加 `view_count`。
- 无效、过期、吊销 token 均返回 HTTP 200 与 `valid:false`，不阻断入驻。

### 提交申请

`POST /tenant-onboarding/applications` 增加可选 `share_token`。

- API 只传 token，不接受前端身份字段。
- `submit_tenant_onboarding_application` 在现有 SMS 消费和申请创建事务中锁定有效分享链接，派生全部归因字段，并只在首次创建申请时增加 `submitted_count`。
- token 无效时按无归因继续创建。
- 同一 `Idempotency-Key` 重试直接返回原申请，归因保持首次值。

### 查询统计

- `GET /tenant-onboarding/share-links?page=1&pageSize=20`
- `GET /tenant-onboarding/share-links/:id/applications?page=1&pageSize=20`

两者仅返回当前员工创建的链接及其申请。列表由单个分页 RPC 汇总打开数、提交数、审核通过数，避免逐行查询。申请列表限定必要字段并使用 `.range()`，最大 `pageSize=100`。

## 错误与降级

认证、权限、参数和数据库错误沿用 `Errors` / `error-factory.ts`。创建链接失败或查询越权返回明确业务错误。分享 token 无效属于可降级归因缺失，不作为申请错误，也不暴露 token 对应身份。

## 验证

- Schema 测试：可选 token、未知身份字段拒绝、分页限制。
- Service 测试：幂等创建、平台会话、无效 token 降级、分页归属校验。
- Controller 路由和 visitor 路由分类测试。
- Migration 合同测试：表、索引、RLS、原子打开、原子提交派生和计数。
- 运行相关 Bun 测试、API typecheck、API build、文件大小检查和 migration history 静态校验。
