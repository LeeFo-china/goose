# 小程序租户部门遗留层退场对接说明

日期：2026-05-27

## 背景

后端已继续清理租户部门旧兼容层：

- `/departments` 的响应 `id` 已切换为 `tenant_departments.id`。
- 后端部门新增、启用、编辑不再写旧 `departments` 表。
- 新租户初始化不再创建旧 `departments` 记录。
- 部门岗位规则运行时不再依赖旧部门 ID fallback。
- 后端运行时代码不再读取 `tenant_departments.legacy_department_id`。

小程序端需要确认本地没有继续把部门 ID 当作旧 `departments.id` 使用。

## 字段口径

当前小程序端只应使用：

```json
{
  "tenant_department_id": "tenant_departments.id 或 null",
  "department_code": "标准部门编码或 null",
  "department_name": "租户部门显示名称或 null"
}
```

不要再使用：

- `department_id`
- `employee_department_id`
- 旧 `departments.id`
- `tenant_departments.legacy_department_id`

## 影响接口

### 员工登录和身份上下文

涉及：

- `POST /wechat/auth`
- `POST /wechat/auth/phone`
- `GET /wechat/login-state`
- `GET /employee/bootstrap`

要求：

- 员工部门归属只读 `tenant_department_id`。
- 部门名称展示使用 `department_name`。
- 稳定业务语义判断使用 `department_code`。
- 本地缓存 key 如包含部门维度，必须使用 `tenant_department_id`。

### 如有调用 `/departments`

如果小程序端有组织架构、部门选择、内部配置类页面调用：

```http
GET /departments
GET /departments/:id
PATCH /departments/:id
```

需要注意：

- `id` 现在就是 `tenant_departments.id`。
- `tenant_department_id` 与 `id` 语义一致。
- 不要把 `id` 当作旧 `departments.id`。
- 调用详情或编辑接口时，应传当前返回的 `id`。

示例：

```json
{
  "id": "tenant_departments.id",
  "tenant_department_id": "tenant_departments.id",
  "code": "DESIGN",
  "name": "设计部",
  "template_name": "设计部",
  "enabled": true
}
```

### 员工个性化配置

涉及：

- `GET /employee/bootstrap`
- 员工首页或场景配置缓存

匹配优先级保持：

```text
employee_id
→ post_id
→ tenant_department_id
→ tenant_default
```

不得回退旧 `department_id`。

## 小程序端检查命令

请在小程序仓库执行：

```bash
rg "department_id|employee_department_id|legacy_department_id|/departments|tenant_department_id|department_code" src
```

重点确认：

- `department_id` / `employee_department_id` 不再用于缓存 key。
- `department_id` / `employee_department_id` 不再用于权限判断。
- `department_id` / `employee_department_id` 不再作为接口提交字段。
- 如果存在 `/departments` 调用，页面逻辑已按 `tenant_departments.id` 处理。
- `tenant_department_id` 和 `department_code` 的使用符合上面的字段口径。

## 验收标准

- `rg "department_id|employee_department_id|legacy_department_id" src` 无业务代码命中；历史注释或迁移说明除外。
- 员工登录后本地身份只保存 `tenant_department_id`、`department_code`、`department_name`。
- 员工首页配置不会因为旧部门 ID 缺失而回退错误配置。
- 如有部门列表页面，点击详情/编辑使用返回的 `id` 正常工作。
- 小程序类型检查通过。
- 小程序 dev 构建通过。

## 后端当前状态

已完成后端提交：

- `b2b1ce7 refactor(api): use tenant department ids`
- `404804f refactor(api): remove department rule legacy fallback`
- `d221ce1 refactor(api): initialize tenant departments directly`
- `febdb86 chore(api): stop reading legacy department mapping`

数据库级删除 `tenant_departments.legacy_department_id` 和旧 `departments` 表会在后续单独迁移窗口执行，本次小程序端只需要完成运行时字段口径确认。

