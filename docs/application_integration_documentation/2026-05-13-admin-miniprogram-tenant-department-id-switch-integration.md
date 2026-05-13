# Admin 与微信小程序租户部门 ID 切换对接说明

日期：2026-05-13

## 背景

组织架构已从旧 `departments` 表逐步迁移到 `tenant_departments`。

当前后端已完成：

- `employees.tenant_department_id` 字段新增和回填
- 员工创建/更新双写：
  - `department_id`
  - `tenant_department_id`
- 员工列表/详情响应同时返回新旧字段
- `/department-post-rules` 候选部门返回 `tenant_department_id`
- 登录上下文返回 `tenant_department_id`、`department_code`、`department_name`
- 岗位新增接口支持 `tenant_department_id`
- 旧 `departments` 表已收口为兼容映射层

## 字段口径

### 旧字段

`department_id`

- 含义：旧 `departments.id`
- 当前仍保留，作为兼容字段
- 新页面不得继续以它作为选择控件的 value
- 新写入不得以它作为主字段

### 新字段

`tenant_department_id`

- 含义：租户部门配置 `tenant_departments.id`
- 表达租户启用的标准部门
- 当前 admin 新增/编辑员工、新增岗位已经应使用该字段
- 小程序展示、权限体验判断、业务筛选应优先使用该字段

### 展示字段

`department_name`

- 优先来自 `tenant_departments.alias_name`
- fallback 旧 `departments.name`

`department_code`

- 优先来自 `tenant_departments.code`
- 用于稳定业务语义和权限判断

## admin 对接

### 员工列表

员工列表接口 `/employees` 响应中的部门展示建议按以下顺序取值：

1. `department_name`
2. 候选部门中通过 `tenant_department_id` 匹配出的 `name`
3. 候选部门中通过旧 `department_id` 匹配出的 `name`
4. 空值显示 `-`

部门编码同理：

1. `department_code`
2. 候选部门匹配出的 `code`

### 员工新增/编辑

部门选择控件应使用：

```json
{
  "value": "tenant_department_id",
  "label": "部门名称 · 部门编码"
}
```

提交员工创建/编辑时应传：

```json
{
  "tenant_department_id": "租户部门配置 ID 或 null",
  "post_id": "岗位 ID 或 null"
}
```

不再要求 admin 同时传 `department_id`。

后端会根据 `tenant_department_id` 自动反写旧 `department_id`。

### 岗位新增

新增岗位时，部门选择控件同样使用：

```json
{
  "value": "tenant_department_id",
  "label": "部门名称 · 部门编码"
}
```

提交岗位创建时应传：

```json
{
  "tenant_department_id": "租户部门配置 ID",
  "code": "DESIGNER",
  "name": "设计师",
  "status": 1
}
```

不再要求 admin 同时传 `department_id`。

后端兼容旧客户端只传 `department_id`，但 admin 新代码不得继续主写旧字段。

### 兼容期

过渡期后端仍支持：

- 只传 `department_id`
- 只传 `tenant_department_id`
- 同时传两个字段

如果同时传两个字段但不属于同一个租户部门，后端返回：

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "department_id 与 tenant_department_id 不匹配"
}
```

如果修改部门配置时提交 `code`，后端返回：

```json
{
  "success": false,
  "message": "标准部门编码不可修改"
}
```

## 微信小程序对接

### 读取员工身份

小程序端展示员工身份、部门名称时应优先使用：

```json
{
  "tenant_department_id": "租户部门配置 ID",
  "department_name": "部门显示名称",
  "department_code": "标准部门编码"
}
```

不要在小程序端硬编码部门名称。

### 本地缓存

如果小程序端本地缓存了旧 `department_id`，需要注意：

- 缓存 key 不应只依赖 `department_id`
- 新版本应同时缓存 `tenant_department_id`
- 展示以接口返回的 `department_name` 为准

### 写入场景

当前微信小程序端暂无员工部门编辑入口时，不需要立即改写入。

如果后续小程序端新增员工资料编辑或组织归属编辑，应提交：

```json
{
  "tenant_department_id": "租户部门配置 ID 或 null"
}
```

### 权限与业务判断

小程序端如果需要做体验层权限判断，应使用登录上下文中的：

```json
{
  "tenant_department_id": "租户部门配置 ID",
  "department_code": "标准部门编码"
}
```

其中：

- 部门范围匹配优先使用 `tenant_department_id`
- 页面展示使用 `department_name`
- 固定语义判断使用 `department_code`
- 旧 `department_id` 仅作为历史缓存或旧接口兼容，不再作为新逻辑主判断

## 验收标准

admin：

- 员工新增时，部门选择控件 value 为 `tenant_department_id`
- 员工编辑时，可正确回显已有部门
- 保存后员工响应中同时存在 `department_id` 和 `tenant_department_id`
- 列表部门名称优先展示 `department_name`
- 新旧部门 ID 不匹配时能展示后端错误
- 岗位新增时，部门选择控件 value 为 `tenant_department_id`
- 岗位新增请求体包含 `tenant_department_id`
- 部门配置不能编辑 `code`

微信小程序：

- 员工身份展示优先读取 `department_name`
- 需要部门 ID 的判断优先使用 `tenant_department_id`
- 固定部门语义判断优先使用 `department_code`
- 旧版本只读 `department_id` 时仍不受影响

## 后续

后续进入观察期：

- 连续一个版本周期执行 `scripts/audit-tenant-department-retirement.sh`
- 巡检结果所有 blocker 均为 0 后，再评估旧字段退场
- 未完成观察期前，不删除 `departments`、`employees.department_id`、`department_post_rules.department_code`
