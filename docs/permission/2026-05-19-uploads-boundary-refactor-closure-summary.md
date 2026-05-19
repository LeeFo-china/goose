# Uploads 权限边界重构闭环摘要

日期：2026-05-19

## 范围

- `POST /uploads/images`
- `GET /uploads/public-url`
- `POST /uploads/cos/direct-init`
- `POST /uploads/cos/direct-complete`

## 本次调整

- 新增 `apps/api/src/repositories/uploads.ts`。
- 新增 `apps/api/src/services/uploads.ts`。
- 将 `UploadController` 中的客户 active membership 查询下沉到 `uploadRepository.findDefaultActiveCustomerMembership()`。
- 将 `UploadController` 中的旧客户绑定查询下沉到 `uploadRepository.findLegacyCustomerBinding()`。
- `UploadController` 删除 `SupabaseDB` 直接依赖。

## 权限口径

上传接口仍保持原行为：

- 所有上传入口必须有登录用户。
- 普通 multipart 上传根据 token、后台 auth context、客户 membership、旧客户绑定推导上传身份。
- COS 直传初始化和完成也使用同一上传身份推导逻辑。
- `project_log` 直传要求传入项目 ID，并通过 `project_log.create` 校验项目写日志权限。
- 直传完成时校验 object key 必须属于当前登录身份的租户前缀。

## 租户边界

- 员工上传优先使用 token 中的 `tenant_id + employee_id`。
- 客户上传优先使用 token 中的 `tenant_id + customer_id`。
- token 缺少业务身份时，先通过后台 auth context 尝试解析员工身份。
- 如果不是员工身份，再通过 `user_business_memberships` 找 active customer membership。
- 最后兼容旧 `customers.user_id` 绑定。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/uploads/index.ts` 无 `SupabaseDB`、`getAdminClient`、`getClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
