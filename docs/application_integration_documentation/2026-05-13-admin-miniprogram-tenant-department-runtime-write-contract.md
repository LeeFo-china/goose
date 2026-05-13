# Admin 与微信小程序租户部门运行期写入契约

日期：2026-05-13

## 背景

租户部门已经完成从旧 `departments` 到 `tenant_departments` 的主链路迁移。

当前旧字段仍保留，但定位已经改变：

- `tenant_departments.id` 是新主字段
- `departments.id` 是兼容映射 ID
- `employees.department_id` 是兼容字段
- `department_post_rules.department_code` 是兼容字段

本文件用于固定 admin 和微信小程序的写入规范，避免旧客户端或新代码继续把旧字段作为主数据源。

## 总原则

新写入统一使用：

```json
{
  "tenant_department_id": "tenant_departments.id"
}
```

旧字段只允许用于：

- 旧客户端兼容
- 历史数据展示 fallback
- 后端自动反写
- 巡检和退场观察

新页面、新接口对接、新业务判断不得以旧 `department_id` 作为主字段。

## Admin 对接

### 1. 员工新增/编辑

部门候选来源：

```http
GET /department-post-rules
```

部门选择控件：

```json
{
  "value": "department.tenant_department_id",
  "label": "department.name + department.code"
}
```

提交：

```json
{
  "tenant_department_id": "tenant_departments.id 或 null",
  "post_id": "岗位 ID 或 null"
}
```

禁止：

```json
{
  "department_id": "旧 departments.id"
}
```

说明：

- 后端仍兼容 `department_id`
- admin 新代码不应继续提交 `department_id`
- 后端会自动反写 `employees.department_id`

### 2. 岗位新增

部门候选来源：

```http
GET /department-post-rules
```

提交：

```json
{
  "tenant_department_id": "tenant_departments.id",
  "code": "DESIGNER",
  "name": "设计师",
  "status": 1,
  "sort": 0
}
```

后端行为：

- 使用 `tenant_department_id` 解析部门
- 创建岗位
- 自动启用对应部门岗位规则
- 同步维护 `department_post_rules.tenant_department_id`
- 兼容保留 `department_post_rules.department_code`

### 3. 部门配置

启用部门：

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

修改部门：

```http
PATCH /departments/:id
```

请求：

```json
{
  "name": "设计交付中心",
  "enabled": true,
  "sort": 60
}
```

禁止提交：

```json
{
  "code": "PROJECT"
}
```

错误文案：

```json
{
  "success": false,
  "message": "标准部门编码不可修改"
}
```

### 4. 展示口径

员工列表部门名称：

1. `department_name`
2. 根据 `tenant_department_id` 匹配候选部门名称
3. 根据旧 `department_id` 匹配候选部门名称
4. `-`

部门编码：

1. `department_code`
2. 根据 `tenant_department_id` 匹配候选部门编码
3. `-`

## 微信小程序对接

### 1. 登录上下文

小程序端读取员工身份时，优先使用：

```json
{
  "tenant_department_id": "tenant_departments.id",
  "department_code": "标准部门编码",
  "department_name": "租户侧部门显示名称"
}
```

页面展示：

- 部门名称使用 `department_name`
- 稳定业务语义使用 `department_code`
- 部门范围判断优先使用 `tenant_department_id`

### 2. 本地缓存

缓存建议：

- 新版本缓存 `tenant_department_id`
- 可继续保留旧 `department_id`，但只做兼容
- 缓存更新以登录上下文和员工详情接口返回为准

不要用旧 `department_id` 作为新业务缓存 key 的唯一依据。

### 3. 写入场景

当前如果小程序没有员工组织归属编辑入口，不需要新增写入。

如果后续新增员工资料编辑、组织归属编辑，应提交：

```json
{
  "tenant_department_id": "tenant_departments.id 或 null"
}
```

禁止新增页面只提交旧：

```json
{
  "department_id": "旧 departments.id"
}
```

## 运行期巡检

每次版本发布后，执行：

```bash
scripts/audit-tenant-department-retirement.sh
```

推进旧字段退场前，必须满足：

- 所有 blocker 项连续一个版本周期为 0
- admin 新增/编辑员工不再主写 `department_id`
- admin 新增岗位不再主写 `department_id`
- 小程序业务判断不再主依赖旧 `department_id`

## 验收清单

Admin：

- 员工新增请求体包含 `tenant_department_id`
- 员工编辑请求体包含 `tenant_department_id`
- 岗位新增请求体包含 `tenant_department_id`
- 部门配置编辑不允许修改 `code`
- 停用部门不出现在员工、岗位候选列表

微信小程序：

- 登录后本地身份包含 `tenant_department_id`
- 部门名称展示使用 `department_name`
- 部门语义判断使用 `department_code`
- 如有组织归属写入，提交 `tenant_department_id`

后端巡检：

- `scripts/audit-tenant-department-retirement.sh` 执行成功
- 所有 blocker 结果为 0

## 不做事项

- 不删除 `departments`
- 不删除 `employees.department_id`
- 不删除 `department_post_rules.department_code`
- 不要求旧客户端立即升级
