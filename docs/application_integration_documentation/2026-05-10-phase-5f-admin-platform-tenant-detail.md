# 阶段 5F Admin 对接文档：平台租户详情页

日期：2026-05-10

## 1. 页面入口

租户列表 `/platform/tenants` 操作列新增：

```text
查看
```

跳转：

```text
/platform/tenants/:id
```

仅 `platform_admin` 角色可访问。

## 2. 详情接口

页面使用：

```http
GET /platform/tenants/:id
```

返回字段包含：

```json
{
  "id": "tenant-id",
  "name": "某装修公司",
  "slug": "demo",
  "status": "active",
  "contact_name": "张三",
  "contact_phone": "18600000000",
  "created_at": "2026-05-10T10:00:00.000Z",
  "updated_at": "2026-05-10T10:00:00.000Z",
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
    "applied_at": "2026-05-10T10:00:00.000Z",
    "departments_count": 42,
    "posts_count": 48,
    "roles_count": 4,
    "admin_employee_id": "employee-id",
    "admin_role_id": "role-id",
    "admin_employee": {
      "id": "employee-id",
      "name": "管理员",
      "phone": "18600000000",
      "status": "active"
    },
    "admin_role": {
      "id": "role-id",
      "code": "system_admin",
      "name": "系统管理员",
      "status": "active"
    }
  },
  "admin_employees": [],
  "roles": []
}
```

## 3. 页面展示

详情页展示四块：

1. 用量摘要
   - 员工数
   - 客户数
   - 项目数
   - H5 页面数
   - 摄像头数

2. 基础信息
   - 租户 ID
   - slug
   - 联系人
   - 联系电话
   - 创建时间
   - 更新时间

3. 租户管理员
   - 管理员姓名
   - 管理员手机号
   - 管理员状态
   - 管理员角色

4. 初始化结果与角色
   - 模板编码
   - 模板版本
   - 应用时间
   - 部门/岗位/角色初始化数量
   - 执行人
   - 租户角色列表

## 4. 兼容规则

历史租户可能没有初始化记录：

```json
{
  "initialization": null
}
```

admin 页面会显示空状态，不阻断详情页展示。

如果 `initialization.admin_employee` 为空，页面会使用 `admin_employees[0]` 兜底展示管理员。

## 5. 验收

- 平台超管可从列表进入详情页。
- 详情页刷新后仍能正常加载。
- 初始化记录为空时页面不报错。
- 租户角色为空时显示空状态。
- 非平台超管访问时提示无权限。
