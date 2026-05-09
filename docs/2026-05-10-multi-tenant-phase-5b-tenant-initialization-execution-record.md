# 多租户改造阶段 5B 执行记录：租户初始化

日期：2026-05-10

## 本阶段目标

在 5A 的租户基础 API 上，补齐“新租户可投入使用”的初始化能力：

- 默认部门
- 默认岗位
- 默认角色
- 租户管理员员工
- 租户模板版本记录

## 已完成

### 1. 模板表

新增 migration：

```text
supabase/migrations/20260510110000_create_tenant_templates.sql
```

新增表：

- `tenant_templates`
- `tenant_template_applications`

并种子写入：

```text
default_decoration_company / 2026.05.10
```

### 2. 租户创建初始化

`POST /platform/tenants` 创建成功后会自动初始化：

- `departments`：来自 `@gooes/domain` 的 `DepartmentConfig`
- `posts`：来自 `@gooes/domain` 的 `EmployeePostConfig`
- `roles`：
  - `system_admin`
  - `employee_base`
  - `finance_base`
  - `design_manage`
- `role_permissions`：`system_admin` 绑定所有 active 权限，范围为 `all`
- `tenant_template_applications`：记录初始化模板版本和结果

### 3. 租户管理员

`POST /platform/tenants` 支持传入 `admin`：

```json
{
  "admin": {
    "name": "管理员",
    "phone": "18600000000",
    "department_code": "ADMIN",
    "post_code": "SYSTEM_ADMIN"
  }
}
```

创建后：

- 在当前租户下创建 `employees` 记录。
- 员工 `role = admin`。
- 员工 `status = active`。
- 绑定 `system_admin` 角色。
- 默认部门为 `ADMIN`。
- 默认岗位为 `SYSTEM_ADMIN`。

### 4. 管理员手机号策略

当前 admin 后台登录仍是“手机号 -> 员工身份”的单点匹配。

因此 5B 暂时做保守限制：

- 创建租户管理员前，会检查该手机号是否已绑定任何员工。
- 如果已存在员工，返回：

```text
409 TENANT_ADMIN_PHONE_EXISTS
```

这样可以避免同一个手机号绑定多个员工后，后台登录无法判断进入哪个租户。

后续如果 admin 登录支持租户选择，可再放开为“手机号租户内唯一”。

## 返回结构

创建租户成功后，响应会追加：

```json
{
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

## 文件变更

- `apps/api/src/schema/platform-tenants.ts`
- `apps/api/src/repositories/platform-tenants.ts`
- `apps/api/src/services/platform-tenants.ts`
- `supabase/migrations/20260510110000_create_tenant_templates.sql`

## 验证

```bash
bun run api:typecheck
```

## 后续阶段

### 5C：admin 页面

- `/platform/tenants` 增加创建租户表单。
- 表单增加租户管理员姓名和手机号。
- 展示初始化结果。

### 5D：租户停用状态拦截

- 停用租户后阻止该租户员工登录。
- 停用租户后阻止客户访问客户项目页。
