# 阶段 3F Admin 对接说明：系统配置平台级 / 租户级拆分

日期：2026-05-09

## 结论

Admin 端无需在现有接口中传 `tenant_id`。后端会根据当前登录员工是否为平台管理员自动决定配置层级。

## 受影响接口

- `GET /admin/system-settings`
- `PATCH /admin/system-settings/:key`

## 行为变化

### 平台管理员

- 读取平台级配置。
- 修改平台级配置。
- 平台级配置记录为 `tenant_id = null`。

### 租户管理员

- 读取当前租户的有效配置。
- 如果租户没有覆盖配置，则看到平台级配置的有效值。
- 修改时只允许修改租户级白名单配置。
- 当前 MVP 可覆盖配置：
  - `ALIYUN_SMS_SIGN_NAME`
- 修改租户级配置时，后端会创建或更新 `tenant_id = 当前租户` 的配置记录。

## 响应字段变化

系统配置项会增加或可使用以下字段：

```json
{
  "tenant_id": "租户ID或null",
  "effective_scope": "platform | tenant",
  "can_override_by_tenant": true
}
```

字段说明：

- `tenant_id = null`：平台级记录。
- `effective_scope = tenant`：当前生效值来自租户覆盖。
- `effective_scope = platform`：当前生效值来自平台默认、环境变量或默认值。
- `can_override_by_tenant`：租户管理员是否允许覆盖该配置。

## Admin 端建议

- 不要传 `tenant_id`。
- 租户管理员页面中，对 `can_override_by_tenant=false` 的配置置灰或隐藏编辑入口。
- 平台管理员页面继续展示平台配置。
- 员工切换账号或租户后，清空系统配置缓存。
- 如果更新返回 `SYSTEM_SETTING_PLATFORM_ONLY`，提示“该配置为平台级配置，请联系平台管理员修改”。

## 联调检查

- 平台管理员修改 `SMS_PROVIDER` 后，平台级记录更新。
- 租户管理员修改 `ALIYUN_SMS_SIGN_NAME` 后，只生成当前租户覆盖记录。
- 租户管理员不能修改 `AI_API_KEY`、`TENCENTCLOUD_SECRET_ID` 等平台级配置。
- 租户没有配置短信签名时，读取平台级签名。
- 配置变更日志 `system_setting_change_logs.tenant_id` 能区分平台级和租户级变更。
