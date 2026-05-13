# Admin 租户部门配置对接说明

日期：2026-05-13

## 适用范围

租户 admin 的组织架构页面、员工表单、岗位表单、部门岗位规则配置。

本轮调整后，admin 不应再把部门理解为“自由新增的部门实例”，而应理解为：

- 从平台标准部门中启用
- 给启用部门设置租户侧显示名称
- 控制启用/停用
- 在启用部门下新增岗位

## 页面交互要求

### 组织架构 / 部门

页面主按钮：

- 使用“启用部门”
- 不再使用“新增部门”

列表展示：

- 显示名称：`name`
- 标准部门：`template_name`
- 状态：`enabled`
- 编码：`code`
- 排序：`sort`

编辑弹窗：

- 可编辑 `name`
- 可编辑 `enabled`
- 可编辑 `sort`
- 不允许编辑 `code`
- 标准部门名称和编码仅展示

### 组织架构 / 岗位

新增岗位时必须先选择部门。

部门候选来源：

- `/department-post-rules`
- 该接口已只返回启用部门

新增岗位提交必须优先使用租户部门 ID：

```json
{
  "tenant_department_id": "tenant_departments.id，也就是 /department-post-rules 返回的 department.tenant_department_id",
  "code": "DESIGNER",
  "name": "设计师",
  "status": 1
}
```

兼容期后端仍接受旧 `department_id`，但 admin 新代码不得再把旧 `department_id` 作为新增岗位的主提交字段。

### 员工新增/编辑

部门候选来源：

- `/department-post-rules`

要求：

- 只展示启用部门
- 选择部门后再展示该部门允许的岗位
- 提交时传 `tenant_department_id`
- 不要求同时传旧 `department_id`
- 后端会根据 `tenant_department_id` 自动反写旧 `department_id`

## API 对接

### 获取部门配置

```http
GET /departments?page=1&pageSize=20
```

支持筛选：

```http
GET /departments?code=DESIGN&enabled=true&keyword=设计
```

响应字段：

```json
{
  "id": "兼容 departments.id",
  "tenant_department_id": "tenant_departments.id",
  "code": "DESIGN",
  "name": "设计中心",
  "template_name": "设计部",
  "enabled": true,
  "sort": 50,
  "created_at": "2026-05-13T00:00:00Z",
  "updated_at": "2026-05-13T00:00:00Z"
}
```

注意：

- 当前阶段 admin 新增/编辑员工、新增岗位应使用 `tenant_department_id`
- `id` 仍是旧 `departments.id`，只做兼容展示和旧客户端兜底

### 启用部门

```http
POST /departments
```

请求：

```json
{
  "code": "DESIGN",
  "name": "设计中心",
  "enabled": true,
  "sort": 50
}
```

语义：

- 不是自由新增部门
- 是从平台标准部门模板启用一个租户部门配置
- 后端会同步兼容旧 `departments`

### 修改部门配置

```http
PATCH /departments/:id
```

`:id` 使用 `GET /departments` 返回的 `id`。

请求：

```json
{
  "name": "项目交付中心",
  "enabled": true,
  "sort": 60
}
```

禁止：

```json
{
  "code": "PROJECT"
}
```

后端会拒绝编码修改语义，前端不要提供编码编辑入口。

## 禁止对接方式

- 不要直接操作 `departments` 表
- 不要在 admin 前端构造非标准部门编码
- 不要把 `/departments` 当作自由 CRUD
- 不要把停用部门提供给员工、岗位、规则表单

## 兼容说明

当前仍保留：

- `employees.department_id -> departments.id`
- `department_post_rules.department_code`
- `/department-post-rules` 返回兼容部门 `id`
- `POST /posts` 仍兼容旧 `department_id`

兼容字段只用于旧客户端和历史数据兜底。admin 新写入必须以 `tenant_department_id` 为主。

## 回归检查

- 组织架构部门页按钮显示“启用部门”
- 启用部门后列表出现该部门配置
- 编辑部门不能修改编码
- 停用部门后，员工表单不再出现该部门
- 停用部门后，岗位新增不能选择该部门
- 部门岗位规则只显示启用部门
- 已有员工列表仍能显示部门名称
- 员工新增/编辑请求体包含 `tenant_department_id`
- 岗位新增请求体包含 `tenant_department_id`
- 请求体携带 `code` 修改部门时，后端返回“标准部门编码不可修改”
