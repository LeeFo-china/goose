# System Settings 权限边界核查

日期：2026-05-19

## 结论

`system-settings` 不是纯平台接口，当前是平台配置和租户覆盖配置的混合入口。

暂不建议直接迁移到 `PlatformBaseController` 的纯 `getRequiredPlatformAdminContext()` 口径，否则会误伤租户侧“自有短信通道”配置。

当前更合理的处理方式是：

1. 保持现有接口行为不变。
2. 后续先补 `TenantBaseController`。
3. 再把 `system-settings` 拆成平台配置入口和租户配置入口。
4. 拆完后，平台入口走 `PlatformBaseController`，租户入口走 `TenantBaseController`。

## 当前接口

Controller：`apps/api/src/controllers/system-settings/index.ts`

接口：

- `GET /admin/system-settings`
- `PATCH /admin/system-settings/:key`

当前 controller 行为：

- 平台管理员直接放行。
- 非平台管理员必须具备：
  - `system.settings.read`
  - `system.settings.update`
- 调用 `systemSettingsService.listSettings(authContext)`。
- 调用 `systemSettingsService.updateSetting(authContext, key, value)`。

## 数据模型

表：`system_settings`

关键字段：

- `tenant_id is null`：平台级配置。
- `tenant_id is not null`：租户覆盖配置。
- `key`：配置 key。
- `value_text`：配置值，敏感项加密存储。
- `is_secret`：是否敏感配置。
- `updated_by_employee_id`：最后更新员工。

唯一约束：

- 平台配置：`uniq_system_settings_platform_key`，同一个 `key` 只允许一条平台记录。
- 租户配置：`uniq_system_settings_tenant_key`，同一个租户同一个 `key` 只允许一条覆盖记录。

变更日志：

- `system_setting_change_logs.tenant_id` 区分平台变更和租户变更。
- 旧的 `setting_key -> system_settings(key)` 外键已删除，因为租户覆盖后 `key` 不再全局唯一。

## Service 边界

Service：`apps/api/src/services/system-settings.ts`

### 读取逻辑

`listSettings(authContext)`：

- `authContext.isPlatformAdmin === true`
  - 返回全部平台级配置。
  - `tenant_id = null`。
- 普通租户上下文
  - 只返回租户短信相关可覆盖配置。
  - 平台短信密钥、签名、模板默认不直接展示真实平台值。
  - 租户只看到：
    - `SMS_CHANNEL_MODE`
    - 自有阿里云短信配置项
    - 自有腾讯云短信配置项

### 写入逻辑

`updateSetting(authContext, key, value)`：

- 平台管理员：
  - `tenantId = null`
  - 修改平台级配置。
- 普通租户上下文：
  - `tenantId = authContext.tenantId`
  - 只允许修改 `TENANT_OVERRIDABLE_SETTING_KEYS`。
  - 修改的是租户覆盖记录，不会修改平台配置。

租户尝试修改非可覆盖配置时返回：

```text
SYSTEM_SETTING_PLATFORM_ONLY
```

## 租户可覆盖配置清单

租户当前只允许覆盖短信通道相关配置。

基础配置：

- `SMS_CHANNEL_MODE`

自有阿里云短信：

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `ALIYUN_SMS_SIGN_NAME`
- `ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER`
- `ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE`
- `ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN`
- `ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE`
- `PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS`

自有腾讯云短信：

- `TENCENT_SMS_SECRET_ID`
- `TENCENT_SMS_SECRET_KEY`
- `TENCENT_SMS_REGION`
- `TENCENT_SMS_ENDPOINT`
- `TENCENT_SMS_SDK_APP_ID`
- `TENCENT_SMS_SIGN_NAME`
- `TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER`
- `TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE`
- `TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN`
- `TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE`
- `PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS`

租户切回 `SMS_CHANNEL_MODE=platform` 时，后端会清空历史租户短信覆盖值，避免遗留半套自有通道配置。

## 平台专属配置范围

除上述租户可覆盖短信配置外，其余配置均应视为平台专属。

当前平台专属配置组包括：

- `sms` 中的平台短信服务商和平台默认短信链接策略。
- `ezviz` 萤石开放平台配置。
- `tencent_iot_video` 腾讯云监控配置。
- `storage` COS / 文件访问策略配置。
- `ai` 平台 AI 默认配置和装修问答默认提示词。
- `social_video` 短视频转文本和脚本改写 worker 配置。
- `wechat` 微信小程序页面、AppID、Secret 等配置。
- `notify` 发布通知和 SMTP 配置。

## Admin 端现状

页面：`apps/admin/app/(console)/settings/page.tsx`

当前同一个 `/settings` 页面同时服务：

- 平台模式：显示“平台系统配置”，拉取全部平台配置。
- 租户模式：显示“租户短信配置”，只显示租户短信通道配置。

Admin 判断方式：

- `isPlatformOnlySession(session)` 判断平台模式。
- 两种模式都调用同一个后端接口 `/admin/system-settings`。

## 风险点

### 1. 直接改成平台管理员专属会误伤租户

如果 `system-settings` 直接改成 `getRequiredPlatformAdminContext()`：

- 租户管理员无法进入租户短信配置。
- 自有短信通道配置无法保存。
- 当前 admin 租户侧 `/settings` 页面会加载失败。

### 2. 当前接口路径语义不够清晰

`/admin/system-settings` 同时承载平台配置和租户配置，靠登录上下文自动判断写入平台记录还是租户覆盖记录。

这套逻辑当前可用，但长期看不利于权限审计。

### 3. 租户权限点名称容易误解

`system.settings.read/update` 容易被理解成“系统配置全部可读写”。实际租户只能读写短信覆盖配置。

后续可以考虑新增更明确的租户权限点：

- `tenant.sms_settings.read`
- `tenant.sms_settings.update`

旧权限点保留一段兼容期。

## 建议迁移方案

### 阶段 1：保持行为，先补基类

先实现 `TenantBaseController`，不要在本阶段直接修改 `system-settings` 行为。

验收：

- 租户端 `/settings` 仍能查看短信通道。
- 租户端仍只能修改租户可覆盖短信 key。
- 平台端仍能查看和修改平台配置。

### 阶段 2：拆明确接口

新增更清晰的接口：

- `GET /platform/system-settings`
- `PATCH /platform/system-settings/:key`
- `GET /tenant/system-settings`
- `PATCH /tenant/system-settings/:key`

旧接口 `/admin/system-settings` 暂时保留兼容：

- 平台登录转发到平台逻辑。
- 租户登录转发到租户逻辑。
- 文档标记为兼容入口，不作为新代码首选。

### 阶段 3：Admin 对接

Admin 端按模式调用新接口：

- 平台模式调用 `/platform/system-settings`。
- 租户模式调用 `/tenant/system-settings`。

页面文案保持：

- 平台：平台系统配置。
- 租户：租户短信配置。

### 阶段 4：收紧旧接口

确认 Admin 已完成对接后：

- 废弃 `/admin/system-settings`。
- 或保留只读兼容一段时间。
- 最终删除旧混合入口。

## 验收标准

后续任何一次 `system-settings` 迁移都必须满足：

- 平台管理员可以读取和修改平台级配置。
- 租户管理员只能读取和修改租户短信覆盖配置。
- 租户不能读取平台密钥真实值。
- 租户不能修改 `storage`、`ai`、`social_video`、`wechat`、`notify`、`ezviz`、`tencent_iot_video` 等平台专属配置。
- 租户尝试修改平台专属配置时返回 `SYSTEM_SETTING_PLATFORM_ONLY`。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

## 下一步建议

先不要直接改 `system-settings`。

建议下一步执行：

1. 新增 `TenantBaseController`。
2. 选择一个低风险租户 controller 做试点，例如 `expense-request-categories` 或 `posts`。
3. Tenant 基类稳定后，再回头拆 `system-settings` 的平台和租户入口。
