# 多租户阶段 5F 执行记录：平台租户详情页

日期：2026-05-10

## 目标

补齐平台超管查看单个租户详情的能力，用于排查租户初始化、管理员、角色模板和业务用量。

## 已完成

- 新增 admin 路由：`/platform/tenants/:id`。
- 租户列表操作列增加“查看”入口。
- 租户详情页展示：
  - 基础信息：租户 ID、名称、slug、状态、联系人、联系电话、创建/更新时间。
  - 用量统计：员工、客户、项目、H5 页面、摄像头。
  - 租户管理员：姓名、手机号、状态、管理员角色。
  - 初始化结果：模板编码、模板版本、应用时间、部门/岗位/角色数量、执行人、管理员员工 ID。
  - 租户角色列表。
- 后端 `GET /platform/tenants/:id` 增强返回：
  - `initialization`
  - `admin_employees`
  - `roles`

## 文件变更

- `apps/api/src/repositories/platform-tenants.ts`
- `apps/api/src/services/platform-tenants.ts`
- `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`
- `apps/admin/app/(console)/platform/tenants/[id]/loading.tsx`
- `apps/admin/components/platform-tenants/platform-tenant-types.ts`
- `apps/admin/components/platform-tenants/platform-tenants-table.tsx`
- `docs/2026-05-09-multi-tenant-phase-5-platform-admin-todolist.md`
- `docs/application_integration_documentation/2026-05-10-phase-5f-admin-platform-tenant-detail.md`
- `docs/application_integration_documentation/2026-05-10-phase-5f-miniprogram-impact-note.md`

## 后端返回字段

`GET /platform/tenants/:id` 在原基础信息和 `usage` 之外，新增：

```json
{
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
      "name": "系统管理员"
    }
  },
  "admin_employees": [],
  "roles": []
}
```

## 设计说明

租户详情页定位为平台超管排查入口，不承担租户业务后台的编辑工作。租户状态启用/停用仍保留在列表页，避免在详情页重复设计操作路径。

历史租户可能没有 `tenant_template_applications` 记录，详情页会展示“暂无初始化记录”。

## 验收项

- 平台超管能从租户列表进入详情页。
- 非平台超管访问详情页时提示无权限。
- 详情页能展示基础信息、用量、管理员和角色。
- 有初始化记录的租户能展示模板版本和初始化数量。
- 历史租户没有初始化记录时页面不报错。

## 不包含

- 不新增租户编辑页。
- 不新增租户审计时间线。
- 不新增租户模板升级 UI。
- 不改变小程序端逻辑。
