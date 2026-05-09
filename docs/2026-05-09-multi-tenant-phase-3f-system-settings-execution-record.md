# 多租户阶段 3F 执行记录：系统配置平台级 / 租户级拆分

日期：2026-05-09

## 范围

本阶段处理 `system_settings` 的平台级与租户级配置分层，目标是保持腾讯云、AI、短信网关等基础设施配置为平台级，同时为租户级品牌和短信签名等覆盖配置预留能力。

## 已完成

### 数据库

- 新增 migration：`20260509180000_tenant_scope_system_settings.sql`。
- `system_settings` 新增：
  - `id uuid` 主键。
  - `tenant_id uuid null`。
- `tenant_id IS NULL` 表示平台级配置。
- `tenant_id IS NOT NULL` 表示租户级覆盖配置。
- 原 `key` 主键改为：
  - `uniq_system_settings_platform_key`：平台级 `key` 唯一。
  - `uniq_system_settings_tenant_key`：同一租户内 `key` 唯一。
- `system_setting_change_logs` 新增 `tenant_id`，用于记录平台级或租户级变更。
- 移除旧的 `system_setting_change_logs.setting_key -> system_settings.key` 单字段外键，避免租户级同 key 多记录后外键歧义。

### 后端

- 系统配置 repository 支持按 `tenant_id + key` 精确读取和更新。
- 系统配置 service 支持可选 `tenantId` 读取：
  - 先查租户级覆盖配置。
  - 租户配置缺失或空值时回退平台级配置。
  - 平台级配置缺失时继续回退环境变量和默认值。
- 现有调用不传 `tenantId` 时，仍读取平台级配置，保持向后兼容。
- 平台管理员更新平台级配置。
- 租户管理员只能更新允许租户覆盖的配置；MVP 白名单为：
  - `ALIYUN_SMS_SIGN_NAME`
- 租户级配置不存在时，更新接口会从平台级元数据创建租户覆盖记录。
- Admin 系统配置列表对租户管理员返回当前租户的有效配置；对平台管理员返回平台配置。
- 短信发送底层支持可选 `tenantId` 读取租户级短信签名。
- 项目验收短信已传入验收单租户，优先使用租户短信签名，缺失时回退平台签名。

## 平台级配置规则

以下配置保持平台级，不随租户隔离：

- 腾讯云 IoT Video / SIP 配置。
- 腾讯云 ASR 配置。
- Apify API Token 和 Actor 配置。
- AI API Key、endpoint、默认模型。
- 萤石开放平台配置。
- 短信网关 AccessKey、Provider、模板 Code。
- 微信 AppID / Secret。
- SMTP / 部署通知等平台运维配置。

## 租户级配置规则

MVP 先落地租户级覆盖能力，当前开放：

- `ALIYUN_SMS_SIGN_NAME`：租户短信签名。

后续可在同一机制上增加：

- H5 品牌色。
- 自定义 Logo。
- 租户文案偏好。
- 租户短信签名扩展字段。

## 暂未处理

- 暂未新增 H5 品牌色、Logo、租户文案偏好字段。
- 暂未新增配置审计列表接口。
- 暂未新增平台超管按租户查看配置的 UI。
- AI 多 provider、token 统计和场景路由仍放在阶段 3G。

## 验证

- `bun run api:build` 通过。
- `bun run api:typecheck` 通过。
