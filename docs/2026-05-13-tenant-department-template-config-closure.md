# 租户部门模板与部门配置收口说明

日期：2026-05-13

## 背景

租户组织架构原来直接使用 `departments` 表，租户端页面也提供“新增部门”。这个设计会让租户自由创建部门实例，但系统里的权限、统计、部门岗位规则、员工归属都依赖稳定的部门编码，长期会造成不可控的部门语义和规则映射。

新的设计拆成两层：

- 平台标准部门模板：平台维护标准部门编码和默认名称。
- 租户部门配置：租户选择启用哪些标准部门，并配置显示名称、启停和排序。

岗位仍然允许租户扩展，但岗位必须挂在已启用部门下。

## 当前落地阶段

### 阶段一：建模与回填

已新增：

- `department_templates`
- `tenant_departments`

已完成：

- 从旧 `departments` 回填 `tenant_departments`
- `tenant_departments.legacy_department_id` 记录旧 `departments.id`
- 新租户初始化时同步写旧 `departments` 和新 `tenant_departments`
- 旧部门新增/编辑接口同步写 `tenant_departments`

### 阶段二：后端读写切换

已完成：

- `/departments` 主读 `tenant_departments`
- `/departments` 返回的 `id` 仍为旧 `departments.id`
- `POST /departments` 语义改为启用标准部门
- `PATCH /departments/:id` 只允许改显示名称、启停和排序
- 员工、岗位、部门岗位规则的候选部门只读取 `tenant_departments.enabled = true`

### 阶段三：admin 交互切换

已完成：

- 租户组织架构页不再显示“新增部门”
- 按“启用部门”从标准部门中选择
- 部门编辑只维护显示名称、启停和排序
- 部门列表展示显示名称、标准部门、状态、编码、排序

## 表职责

### `department_templates`

平台标准部门模板表。

用途：

- 保存标准部门编码
- 保存默认名称
- 控制平台级可用部门
- 为租户初始化和启用部门提供模板

关键字段：

- `code`：标准部门编码，系统语义稳定字段
- `default_name`：默认部门名称
- `enabled`：平台是否允许租户启用
- `sort`：平台默认排序

### `tenant_departments`

租户部门配置表。

用途：

- 表达租户启用了哪些标准部门
- 保存租户侧显示名称
- 控制租户侧启停
- 记录当前兼容旧表的映射

关键字段：

- `tenant_id`
- `template_id`
- `code`
- `alias_name`
- `enabled`
- `sort`
- `legacy_department_id`

### `departments`

旧兼容表，当前仍保留。

当前职责：

- 为 `employees.department_id` 提供兼容外键
- 为现有 admin/业务接口返回兼容 `id`
- 作为逐步迁移到 `tenant_departments` 前的兼容层

禁止事项：

- 新业务不要直接把 `departments` 当作租户部门配置源
- 新页面不要直接从 `departments` 创建自由部门
- 新接口不要依赖 `departments.code` 作为唯一组织配置来源

## 当前接口语义

### `GET /departments`

返回租户部门配置列表。

数据来源：

- 主表：`tenant_departments`
- 关联：`department_templates`

兼容返回：

- `id`：仍返回 `legacy_department_id`
- `tenant_department_id`：新租户部门配置 ID
- `name`：租户显示名称，即 `alias_name`
- `template_name`：标准部门名称
- `code`：标准部门编码
- `enabled`：租户侧启停状态
- `sort`：租户侧排序

### `POST /departments`

语义：启用一个标准部门。

请求仍兼容：

```json
{
  "code": "DESIGN",
  "name": "设计中心",
  "enabled": true,
  "sort": 50
}
```

后端行为：

- 校验 `code` 必须来自启用的 `department_templates`
- 创建或复用旧 `departments`
- upsert `tenant_departments`
- 返回兼容部门结构

### `PATCH /departments/:id`

语义：修改租户部门配置。

允许修改：

- `name`
- `enabled`
- `sort`

不允许修改：

- `code`

## 候选部门规则

以下链路只应读取启用部门：

- 员工新增/编辑部门选择
- 岗位新增所属部门选择
- 部门岗位规则配置

当前实现已经通过 `department-post-rules` 仓储收口到：

```sql
tenant_departments.enabled = true
```

同时返回的 `id` 仍是 `legacy_department_id`，兼容现有 `employees.department_id`。

## 后续迁移方向

下一步不建议立即删除旧 `departments`。

建议后续单独规划：

1. 为 `employees` 增加 `tenant_department_id`
2. 回填员工部门关系
3. 员工创建/编辑接口改写 `tenant_department_id`
4. 项目、费用、权限等部门联查改读 `tenant_departments`
5. `department_post_rules` 从 `department_code` 逐步迁移到 `tenant_department_id`
6. 旧 `departments` 降级为只读兼容表，最后再评估删除

## 验收口径

- 租户端不能自由新增非标准部门
- 租户端可以启用平台标准部门
- 租户端可以设置部门显示名称
- 租户端可以停用部门
- 停用部门不出现在员工、岗位、部门岗位规则候选列表
- 旧员工部门显示不受影响
- 岗位仍可在启用部门下创建并自动写入部门岗位规则

