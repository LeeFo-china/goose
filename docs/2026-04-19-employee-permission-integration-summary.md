# 员工权限系统接入摘要

日期：2026-04-19

本文档描述当前已经接入权限系统的资源范围，以及各资源当前使用的数据范围规则。

## 一、当前已接入资源

目前已接入新权限体系的资源：

1. `customers`
2. `employees`
3. `projects`
4. `expense-requests`
5. `project-referrals`
6. `roles`
7. `permissions`
8. `employee-permissions`

## 二、已启用的权限点

当前实际已启用的核心权限点：

- `customer.read`
- `customer.create`
- `customer.update`
- `customer.assign_owner`
- `employee.read`
- `employee.create`
- `employee.update`
- `employee.permission_manage`
- `project.read`
- `project.create`
- `project.update`
- `expense_request.read`
- `expense_request.create`
- `expense_request.submit`
- `expense_request.approve_manager`
- `expense_request.approve_finance`
- `expense_request.pay`
- `project_referral.read`
- `project_referral.manage`

## 三、资源接入明细

## 1. customers

已接入接口：

- `GET /customers`
- `GET /customers/:id`
- `PATCH /customers/:id`
- `PUT /customers/:id`
- `POST /customers`
- `GET /customers/:id/detail`
- `GET /customers/:id/follow_ups`
- `POST /customers/:id/follow_ups`

当前规则：

- `customer.read`
  - `self`：只能看 `owner_id = 当前员工`
  - `assigned`：当前与 `self` 等价处理
  - `department`：只能看负责人属于本部门的客户
  - `all`：可看全部客户
- `customer.create`
  - 允许创建客户
  - 非 `all` 范围下，如果没传 `owner_id`，后端会自动回填成当前员工
- `customer.update`
  - 只能更新自己可访问范围内的客户
- `customer.assign_owner`
  - `PATCH /customers/:id` 中，当 `owner_id` 实际发生变化时独立生效
  - `self`：只能把负责人改成自己
  - `department`：只能把本部门可管理客户分配给本部门有效员工
  - `all`：可把任意客户分配给任意有效员工
  - 目标负责人必须存在且状态为 `active`

当前模板补权状态：

- `system_admin`
  - `customer.assign_owner = all`
- `design_manage`
  - `customer.read = department`
  - `customer.assign_owner = department`

跟进记录规则：

- `GET /customers/:id/follow_ups` 依赖 `customer.read`
- `POST /customers/:id/follow_ups` 依赖 `customer.update`
- 非 `all` 范围下：
  - 如果没传 `employee_id`，后端会回填成当前员工
  - 如果传了其他员工 `employee_id`，会被拒绝

## 2. employees

已接入接口：

- `GET /employees`
- `GET /employees/:id`
- `POST /employees`
- `PATCH /employees/:id`
- `PUT /employees/:id`
- `GET /employees/withdepartment`
- `GET /employees/withdepartment/:id`
- `GET /employees/withpost`

当前规则：

- `employee.read`
  - `self`：只能看自己
  - `department`：只能看本部门员工
  - `all`：可看全部员工
- `employee.create`
  - 允许创建员工
- `employee.update`
  - 只能更新自己可访问范围内的员工

兼容说明：

- `GET /employees/:id` 当前会先按员工 `id` 查
- 如果没查到，会兼容按 `user_id` 再查一次

## 3. projects

已接入接口：

- `GET /projects`
- `GET /projects/:id`
- `POST /projects`
- `PATCH /projects/:id`
- `PUT /projects/:id`
- `GET /projects/status`
- `GET /projects/create/customers`
- `GET /projects/create/employees`

当前规则：

- `project.read`
  - `self`：项目 `designer_id` 或 `supervisor_id` 是自己
  - `assigned`：当前与 `self` 等价处理
  - `department`：项目设计师或监理属于本部门
  - `all`：可看全部项目
- `project.create`
  - 允许新建项目
  - 允许访问创建页客户/员工选择接口
- `project.update`
  - 只能更新自己可访问范围内的项目

说明：

- `projects/frontend-visible` 当前未接入新权限范围控制，保持原业务逻辑

## 4. expense-requests

已接入接口：

- `GET /expense-requests`
- `GET /expense-requests/:id`
- `POST /expense-requests`
- `PATCH /expense-requests/:id`
- `POST /expense-requests/:id/submit`
- `POST /expense-requests/:id/approve`
- `POST /expense-requests/:id/reject`
- `POST /expense-requests/:id/cancel`
- `POST /expense-requests/:id/pay`

当前规则：

- `expense_request.read`
  - `self`：只能看自己提交的申请
  - `assigned`：可看自己提交的，或当前指派给自己的
  - `department`：可看本部门员工提交的，或当前指派给本部门员工的
  - `all`：可看全部
- `expense_request.create`
  - 可创建和修改自己的草稿/驳回单
- `expense_request.submit`
  - 可提交和撤回自己的申请
- `expense_request.approve_manager`
  - 可审批主管节点
- `expense_request.approve_finance`
  - 可审批财务节点
- `expense_request.pay`
  - 可登记打款

请求体约束：

- 非 `all` 范围下：
  - `employee_id` 必须等于当前登录员工
  - `operator_id` 必须等于当前登录员工
  - `approver_id` 必须等于当前登录员工
  - `paid_by` 必须等于当前登录员工

## 5. project-referrals

已接入接口：

- `GET /project-referrals`
- `GET /project-referrals/:id`
- `GET /project-referrals/project`
- `POST /project-referrals`
- `PATCH /project-referrals/:id`
- `POST /project-referrals/:id/pay`

当前规则：

- `project_referral.read`
  - `all`：可看全部介绍费
  - 非 `all`：按可见项目范围收敛
- `project_referral.manage`
  - 允许创建、修改、支付
  - 非 `all`：按可管理项目范围收敛

请求体约束：

- 非 `all` 范围下：
  - `paid_by` 必须等于当前登录员工

## 6. 权限管理自身接口

已接入接口：

- `GET /auth/me/permissions`
- `GET /roles`
- `GET /roles/:id`
- `POST /roles`
- `PATCH /roles/:id`
- `GET /permissions`
- `GET /permissions/:id`
- `POST /permissions`
- `PATCH /permissions/:id`
- `GET /employees/:id/permissions`
- `POST /employees/:id/roles`
- `POST /employees/:id/permission-overrides`
- `DELETE /employees/:id/permission-overrides/:permission_id`

当前规则：

- 这些接口都依赖 `employee.permission_manage`

## 四、当前默认角色模板效果

远端 migration 已自动完成历史员工回填：

- `employees.role = admin` -> `system_admin`
- `employees.role = employee` -> `employee_base`
- `employees.role = finance` -> `finance_base`

其中：

- `system_admin`：默认拿全部权限，范围 `all`
- `employee_base`：默认拿基础客户、项目、费用申请能力
- `finance_base`：默认拿费用申请财务处理和介绍费管理能力

## 五、当前限制与后续建议

当前已能用于第一轮上线，但仍有这些边界：

1. 数据范围是 v1 规则，主要按“自己 / 部门 / 项目归属”判断
2. 还没有把所有旧资源全部接入新权限体系
3. 还没有把统一 `authorize(permissionCode)` 下沉到所有路由注册层
4. 还没有补权限管理后台页面

下一阶段建议：

1. 继续接入 `payments / project-logs`
2. 把授权校验逐步从 controller 下沉成统一 preHandler
3. 补前端权限管理页面和联调文档
