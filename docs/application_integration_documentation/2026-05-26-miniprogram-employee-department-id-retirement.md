# 小程序员工部门字段清理对接说明

日期：2026-05-26

## 背景

员工部门归属统一切换到 `tenant_department_id`。旧字段 `department_id` / `employee_department_id` 不再作为小程序端判断、缓存或展示的依据。

## 影响接口

### 微信登录员工身份

涉及：

- `POST /wechat/auth`
- `POST /wechat/auth/phone`
- `GET /wechat/login-state`
- 其他返回微信登录身份列表的接口

员工身份中的部门字段以这些字段为准：

```json
{
  "employee": {
    "id": "员工 ID",
    "name": "员工姓名",
    "status": "active",
    "tenant_department_id": "tenant_departments.id 或 null",
    "department_code": "租户部门编码或 null",
    "department_name": "租户部门名称或 null",
    "post_id": "岗位 ID 或 null",
    "post_name": "岗位名称或 null",
    "avatar": "头像地址或 null"
  }
}
```

不再返回：

- `employee.department_id`
- `employee_department_id`

### 员工首页 bootstrap

涉及：

- `GET /employee/bootstrap`

首页配置和默认首页能力后续只允许按以下优先级解析：

```text
employee_id
→ post_id
→ tenant_department_id
→ tenant_default
```

小程序端不要再用旧 `department_id` 作为首页配置 key、缓存 key 或兜底判断。

## 小程序改造要求

- 本地员工身份模型移除 `department_id` / `employee_department_id`。
- 员工部门归属只读取 `tenant_department_id`。
- 部门展示只读取 `department_name` / `department_code`。
- 若 `tenant_department_id` 为空，只允许走岗位或租户默认逻辑，不得回退旧部门。
- 本地缓存 key 如包含部门维度，改为 `tenant_department_id`。

## 兼容说明

- 后端数据库字段 `employees.department_id` 会在后续阶段删除。
- 历史 migration 和历史文档中出现的旧字段只代表历史事实，不是当前接口契约。
- 小程序端升级后不需要再解析旧字段。

## 验收点

- 员工登录后本地身份不包含旧部门 ID。
- 员工首页不同租户部门可使用 `tenant_department_id` 区分。
- 缺少 `tenant_department_id` 的员工不会被旧部门配置命中。
- 部门名称展示来自 `department_name`，部门编码展示来自 `department_code`。
