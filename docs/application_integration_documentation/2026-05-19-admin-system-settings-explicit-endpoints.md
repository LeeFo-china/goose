# Admin System Settings 显式入口对接说明

日期：2026-05-19

## 背景

后端已新增系统配置显式入口，拆清平台配置和租户配置边界。

旧接口仍兼容：

- `GET /admin/system-settings`
- `PATCH /admin/system-settings/:key`

Admin 当前不需要立即改代码，但后续建议切到新接口，降低平台配置和租户短信配置混用风险。

## 新接口

### 平台模式

平台系统配置页使用：

- `GET /platform/system-settings`
- `PATCH /platform/system-settings/:key`

要求：

- 当前登录身份必须是平台管理员。
- 不需要租户上下文。
- 返回平台级配置。
- 写入平台级配置。

### 租户模式

租户短信配置页使用：

- `GET /tenant/system-settings`
- `PATCH /tenant/system-settings/:key`

要求：

- 当前登录身份必须有租户上下文。
- 读取要求 `system.settings.read`。
- 写入要求 `system.settings.update`。
- 只能读取和修改租户短信通道覆盖配置。

## 前端切换建议

Admin `/settings` 页面已有平台模式和租户模式判断。

建议请求路径改为：

```ts
const basePath = isPlatformMode
  ? "/platform/system-settings"
  : "/tenant/system-settings";
```

读取：

```ts
GET basePath
```

保存：

```ts
PATCH `${basePath}/${key}`
```

请求体保持不变：

```json
{
  "value": "xxx"
}
```

响应结构保持不变。

## 错误码

租户修改平台专属配置时：

```text
SYSTEM_SETTING_PLATFORM_ONLY
```

租户访问平台入口时：

```text
FORBIDDEN
```

无租户上下文访问租户入口时：

```text
TENANT_CONTEXT_REQUIRED
```

## 小程序影响

无影响。

小程序端不需要对接本次系统配置入口调整。
