# Phase 5B Admin 对接文档：创建租户并初始化管理员

日期：2026-05-10

## 1. 变化摘要

`POST /platform/tenants` 已从“只创建租户记录”升级为“创建租户 + 初始化组织数据 + 可选创建租户管理员”。

admin 创建租户表单建议新增：

- 管理员姓名
- 管理员手机号

## 2. 创建租户

```http
POST /platform/tenants
```

请求示例：

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

可选管理员字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `admin.name` | string | 建议必填 | 租户管理员姓名 |
| `admin.phone` | string | 建议必填 | 租户管理员登录手机号 |
| `admin.auth_user_id` | uuid | 否 | 已存在 Supabase Auth 用户时可传 |
| `admin.department_code` | string | 否 | 默认 `ADMIN` |
| `admin.post_code` | string | 否 | 默认 `SYSTEM_ADMIN` |

前端建议将 `admin.name`、`admin.phone` 做成必填。后端保持 `admin` 可选，是为了兼容运维只建空租户的特殊场景。

## 3. 成功响应新增字段

```json
{
  "id": "tenant-id",
  "name": "某某装饰",
  "slug": "demo_tenant",
  "status": "active",
  "usage": {
    "employee_count": 1,
    "customer_count": 0,
    "project_count": 0,
    "h5_page_count": 0,
    "camera_count": 0
  },
  "initialization": {
    "template_code": "default_decoration_company",
    "template_version": "2026.05.10",
    "departments_count": 42,
    "posts_count": 48,
    "roles_count": 4,
    "admin_employee_id": "employee-id",
    "admin_role_id": "role-id"
  }
}
```

## 4. 错误处理

### 4.1 租户 slug 已存在

```text
409 TENANT_SLUG_EXISTS
```

页面提示：

```text
租户标识已存在，请更换 slug
```

### 4.2 管理员手机号已绑定员工

```text
409 TENANT_ADMIN_PHONE_EXISTS
```

页面提示：

```text
该手机号已绑定员工身份，请更换管理员手机号
```

原因：

当前后台登录是手机号匹配员工身份。如果同一手机号绑定多个员工，登录时无法自动判断进入哪个租户。

## 5. 页面建议

创建租户弹窗建议分区：

- 公司信息
  - 公司名称
  - slug
  - 联系人
  - 联系电话
- 管理员账号
  - 管理员姓名
  - 管理员手机号

创建成功后：

- 关闭弹窗。
- 刷新租户列表。
- toast 展示：

```text
租户已创建，默认组织和管理员已初始化
```

## 6. 后续待接

5C 会补平台租户管理页面。届时 admin 前端需要新增实际页面和入口。
