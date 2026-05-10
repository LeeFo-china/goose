# Phase 5C Admin 对接文档：平台租户管理页面

日期：2026-05-10

## 1. 页面入口

```text
/platform/tenants
```

入口显示条件：

```ts
session.roles.includes("platform_admin")
```

## 2. 页面能力

已接入：

- 租户列表
- 状态筛选
- 关键词搜索
- 分页
- 创建租户
- 编辑租户
- 启用/停用租户

## 3. 已用接口

```http
GET /platform/tenants
POST /platform/tenants
PATCH /platform/tenants/:id
POST /platform/tenants/:id/suspend
POST /platform/tenants/:id/activate
```

## 4. 创建租户字段

```json
{
  "name": "某某装饰",
  "slug": "demo_tenant",
  "contact_name": "张三",
  "contact_phone": "18600000000",
  "admin": {
    "name": "张三",
    "phone": "18600000000"
  }
}
```

## 5. 注意事项

- `slug` 创建后不可编辑。
- 管理员手机号如果已绑定员工，后端会返回 `TENANT_ADMIN_PHONE_EXISTS`。
- `archived` 租户当前只读。
- 停用/启用操作已有二次确认。

## 6. 暂未实现

- 独立租户详情页。
- 租户模板初始化记录查看。
- 租户管理员补建/重置。
- 平台审计日志。
