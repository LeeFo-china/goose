# System Settings 权限边界重构闭环摘要

日期：2026-05-19

## 范围

新显式入口：

- `GET /platform/system-settings`
- `PATCH /platform/system-settings/:key`
- `GET /tenant/system-settings`
- `PATCH /tenant/system-settings/:key`

兼容入口：

- `GET /admin/system-settings`
- `PATCH /admin/system-settings/:key`

## 本次调整

- `SystemSettingsController` 改为继承 `TenantBaseController`。
- Controller 删除对 `authorizationService` 和 `accessPolicyService` 的直接依赖。
- 新增平台专属入口 `/platform/system-settings`，只允许平台管理员访问。
- 新增租户专属入口 `/tenant/system-settings`，要求租户上下文和 `system.settings.read/update`。
- 保留旧 `/admin/system-settings` 混合入口，兼容现有 Admin 页面。

## 平台配置口径

平台入口要求：

- 必须是平台管理员。
- 读取只返回平台级配置记录。
- 写入只修改 `tenant_id is null` 的平台配置记录。
- 平台配置变更日志 `tenant_id = null`。

平台入口用于：

- 短信平台默认配置。
- COS / 文件访问策略。
- AI 默认配置和系统提示词。
- 短视频转文本与脚本改写配置。
- 微信小程序 AppID / Secret 等配置。
- 萤石、腾讯云 IoT Video、通知、SMTP 等平台配置。

## 租户配置口径

租户入口要求：

- 必须有租户上下文。
- 读取要求 `system.settings.read`。
- 写入要求 `system.settings.update`。
- 租户只能读取和修改短信通道覆盖配置。
- 租户写入只生成或更新 `tenant_id = authContext.tenantId` 的覆盖记录。

租户尝试修改平台专属配置时返回：

```text
SYSTEM_SETTING_PLATFORM_ONLY
```

## 兼容入口口径

`/admin/system-settings` 暂时保留：

- 平台管理员访问时走平台配置逻辑。
- 租户用户访问时走租户短信覆盖配置逻辑。

该入口只作为兼容入口保留，新代码优先使用显式入口。

## 小程序与 Admin 对接

本轮不影响小程序端。

Admin 当前可以继续使用旧接口，不需要立即改代码。

后续建议 Admin 按登录模式切换到新接口：

- 平台模式：`/platform/system-settings`
- 租户模式：`/tenant/system-settings`

切换后再考虑废弃 `/admin/system-settings`。

## 验收

- 平台管理员可通过 `/platform/system-settings` 读取和修改平台配置。
- 租户用户不能访问 `/platform/system-settings`。
- 租户用户可通过 `/tenant/system-settings` 读取租户短信配置。
- 租户用户只可修改租户可覆盖短信配置。
- 租户用户不能修改 `storage`、`ai`、`social_video`、`wechat`、`notify`、`ezviz`、`tencent_iot_video` 等平台专属配置。
- 旧 `/admin/system-settings` 行为保持兼容。
- `apps/api/src/controllers/system-settings/index.ts` 无 `authorizationService`、`accessPolicyService`、`SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
