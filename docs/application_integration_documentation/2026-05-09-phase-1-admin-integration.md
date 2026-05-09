# 阶段 1 Admin 对接文档：默认租户登录态

日期：2026-05-09

## 背景

后端已经开始返回后台登录员工所属租户信息。阶段 1 只做“当前公司展示”和类型预留，不改变现有后台业务操作路径。

## 接口变化

### POST `/admin/auth/login`

成功响应新增：

```json
{
  "tenant": {
    "id": "tenant-id",
    "name": "默认装修公司",
    "slug": "gooes_default",
    "status": "active"
  }
}
```

### GET `/admin/auth/me`

成功响应同样新增 `tenant` 字段：

```json
{
  "user_id": "auth-user-id",
  "login_channel": "admin_web",
  "tenant": {
    "id": "tenant-id",
    "name": "默认装修公司",
    "slug": "gooes_default",
    "status": "active"
  }
}
```

如果员工没有绑定租户，后端会返回 403：

```json
{
  "success": false,
  "message": "员工未绑定租户"
}
```

如果租户状态不可用，后端会返回 403：

```json
{
  "success": false,
  "message": "租户状态不可用"
}
```

## Admin 前端行为

- `AdminSession` 已增加 `tenant`。
- 顶部用户区域已显示当前租户名称。
- 当前阶段不需要增加租户切换器。
- 当前阶段不允许 admin 前端自行传 `tenant_id`。

## 联调检查

- 登录后顶部能看到公司名称。
- 刷新页面后 `/admin/auth/me` 能继续返回 tenant。
- 权限数量、菜单、原业务页面不受影响。
- 如果后端返回 403，按现有登录失效逻辑回到登录页即可。
