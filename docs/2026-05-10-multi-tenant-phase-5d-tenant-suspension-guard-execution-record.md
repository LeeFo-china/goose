# 多租户改造阶段 5D 执行记录：租户停用状态拦截

日期：2026-05-10

## 本阶段目标

平台超管在 admin 停用租户后，该租户员工和客户不能继续正常使用业务系统。

## 已完成

### 1. 统一错误码

新增错误码：

```text
TENANT_NOT_AVAILABLE
```

统一响应：

```json
{
  "success": false,
  "code": "TENANT_NOT_AVAILABLE",
  "message": "租户状态不可用"
}
```

客户侧业务接口文案为：

```text
装修公司服务已暂停，请联系装修公司
```

### 2. admin 员工登录拦截

后端已有 `/admin/auth/login` 和 `/admin/auth/me` 租户状态校验，本阶段补强：

- 发送登录验证码前也校验员工所属租户状态。
- 非 `platform_admin` 的员工，如果租户不是 `active`，返回 `TENANT_NOT_AVAILABLE`。
- `platform_admin` 不受普通租户状态影响。

### 3. 已登录会话失效

平台超管停用/启用租户时，会清理当前 API 进程内该租户的授权缓存：

```ts
authorizationService.invalidateTenantContext(tenantId)
```

这样租户状态变更后，不需要等缓存自然过期才生效。

### 4. 小程序客户态拦截

已拦截客户态业务接口：

- `/auth/me/customer-context`
- `/customer/profile`
- `/customer/projects`
- `/customer/projects/:id`
- `/customer/projects/:id/logs`
- `/customer/projects/:id/logs/:logId/comments`
- `/customer/project-acceptances`
- `/customer/project-acceptances/:id`
- 验收短信 open ticket 校验和详情访问

停用租户下的客户访问这些接口时，返回：

```text
403 TENANT_NOT_AVAILABLE
```

### 5. 微信客户登录和分享链路

已补强：

- 客户手机号匹配租户时只返回 `active` 租户。
- 客户手动选择租户时校验租户状态。
- 员工分享链路绑定后签发客户 token 前再次校验租户状态。

### 6. H5 策略

本阶段不强制关闭已发布 H5 页面。

原因：

- H5 活动页是公开营销入口，停用后是否展示维护提示、继续留资、或完全关闭，需要产品策略确认。
- 当前 5D 先保证登录态业务数据不可访问。

后续如需关闭停用租户 H5，可在 H5 页面解析租户后统一检查 `tenant.status`。

## 文件变更

- `apps/api/src/errors/error-codes.ts`
- `apps/api/src/services/authorization.ts`
- `apps/api/src/services/admin-auth.ts`
- `apps/api/src/services/platform-tenants.ts`
- `apps/api/src/services/project-acceptances.ts`
- `apps/api/src/repositories/admin-auth.ts`
- `apps/api/src/repositories/project-acceptances.ts`
- `apps/api/src/controllers/customer-self-service/index.ts`
- `apps/api/src/controllers/wechat/index.ts`

## 验证

```bash
bun run api:typecheck
bun run api:build
```

## 后续

### 5E 可选增强

- 增加平台审计日志。
- 在 admin 停用租户时展示影响范围。
- 对 H5 公开页补停用策略配置。
