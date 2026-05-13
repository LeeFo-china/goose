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

## 字段口径

### 旧字段

`department_id`

- 含义：旧 `departments.id`
- 当前仍保留，作为兼容字段
- 不建议新页面继续以它作为选择控件的 value

### 新字段

`tenant_department_id`

- 含义：租户部门配置 `tenant_departments.id`
- 表达租户启用的标准部门
- 后续 admin、小程序、权限和业务筛选都应逐步切到该字段

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

## 验收标准

admin：

- 员工新增时，部门选择控件 value 为 `tenant_department_id`
- 员工编辑时，可正确回显已有部门
- 保存后员工响应中同时存在 `department_id` 和 `tenant_department_id`
- 列表部门名称优先展示 `department_name`
- 新旧部门 ID 不匹配时能展示后端错误

微信小程序：

- 员工身份展示优先读取 `department_name`
- 需要部门 ID 的判断优先使用 `tenant_department_id`
- 旧版本只读 `department_id` 时仍不受影响

## 后续

阶段 6 完成后，再进入阶段 7：

- 登录上下文切换到 `tenant_department_id`
- 权限范围判断切换到 `tenant_department_id`
- 客户、项目、费用等部门范围查询逐步收口
