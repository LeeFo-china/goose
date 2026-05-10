# Phase 5D Admin 对接文档：租户停用拦截

日期：2026-05-10

## 1. 变化摘要

平台超管在 `/platform/tenants` 停用租户后，该租户员工不能继续登录或使用 admin。

## 2. 错误码

```text
TENANT_NOT_AVAILABLE
```

可能出现在：

- `/admin/auth/send-code`
- `/admin/auth/login`
- `/admin/auth/me`
- 其他需要员工租户上下文的业务接口

## 3. 前端建议

admin 登录页收到：

```json
{
  "code": "TENANT_NOT_AVAILABLE",
  "message": "租户状态不可用"
}
```

建议提示：

```text
当前公司服务已暂停，请联系平台管理员
```

已登录状态下 `/api/auth/me` 如果因为后端返回 `TENANT_NOT_AVAILABLE` 失败，当前 admin BFF 会视为 session 失效并跳转登录页。后续可优化为专门的“服务暂停”页面。

## 4. 平台超管例外

`platform_admin` 不受普通租户停用影响，仍可登录平台后台和管理停用租户。
