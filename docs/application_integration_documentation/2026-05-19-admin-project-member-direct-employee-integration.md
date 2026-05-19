# Admin 项目成员直接添加员工对接说明

日期：2026-05-19

## 背景

项目成员不再要求租户先配置“项目角色 / 项目规则”。Admin 项目详情的成员维护入口改为直接选择员工，后端继续保留旧角色字段作为历史兼容，不作为新增成员时的用户操作项。

## 已完成范围

- 项目详情“成员”tab 增加“添加员工”入口。
- 添加成员弹窗支持按员工姓名 / 手机号搜索。
- 新增成员只提交 `employee_id` 和 `is_primary`。
- 成员列表以员工姓名为主展示，辅助展示部门、岗位、手机号。
- 旧的 `role_code` / `role_name` 不再作为新增成员操作入口。

## 接口口径

### 查询候选员工

```http
GET /projects/:id/member-candidates?page=1&pageSize=20&keyword=张
```

返回字段：

```json
{
  "list": [
    {
      "id": "employee_id",
      "name": "员工姓名",
      "phone": "手机号",
      "avatar": null,
      "department_name": "部门",
      "post_name": "岗位"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

说明：

- 不需要传 `role_code`。
- 即使旧端传 `role_code`，后端也不再按项目角色规则过滤候选员工。
- Admin 前端会过滤已在项目中的员工，避免重复选择。

### 新增项目成员

```http
POST /projects/:id/members
Content-Type: application/json

{
  "employee_id": "employee_id",
  "is_primary": false
}
```

说明：

- `role_code` 非必填。
- 后端为了兼容旧表结构，会写入内部默认角色值，Admin 不展示这个内部值。
- 如果员工已在项目中，后端返回业务错误。

## 验收标准

- 项目详情成员 tab 能打开添加员工弹窗。
- 搜索员工姓名 / 手机号能返回候选员工。
- 选择员工并提交后，成员列表刷新并展示新成员。
- 新增流程不出现项目角色选择。
- 历史项目成员仍能正常展示。
- Admin 类型检查通过。

## 后续清理

完成小程序同口径改造后，再进入下一阶段清理：

- 删除项目角色规则配置入口。
- 排查并替换 `project_members.role_code` / `role_name` 的业务依赖。
- 评估删除 `project_member_role_post_rules` 表和对应 service / controller。
