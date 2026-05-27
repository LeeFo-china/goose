# 租户部门兼容层退场巡检方案

日期：2026-05-13

## 目标

阶段 9C 的目标是建立旧部门兼容层退场前的可执行验收标准。

这一步不删除旧表和旧字段，只确认以下问题是否已经收口：

- 员工 `tenant_department_id` 与租户部门归属是否一致
- 部门岗位规则是否仍依赖旧 `department_post_rules.department_code`
- `tenant_departments` 与旧 `departments` 的兼容映射是否一致
- 租户部门是否与标准部门模板一致

## 执行脚本

统一巡检 SQL：

```bash
scripts/audit-tenant-department-retirement.sh
```

底层 SQL 文件：

```bash
scripts/audit-tenant-department-retirement.sql
```

脚本默认通过 Supabase CLI 查询 linked 项目，只读执行，不修改数据。

## 巡检项

| check_code | 含义 | 严重级别 | 推进要求 |
| --- | --- | --- | --- |
| `employee_tenant_department_tenant_mismatch` | 员工 `tenant_id` 与租户部门 `tenant_id` 不一致 | blocker | 必须为 0 |
| `rules_missing_tenant_department` | 部门岗位规则缺少 `tenant_department_id` | blocker | 必须为 0 |
| `rule_department_code_mismatch` | 规则 `department_code` 与租户部门 `code` 不一致 | blocker | 必须为 0 |
| `rule_tenant_department_tenant_mismatch` | 规则 `tenant_id` 与租户部门 `tenant_id` 不一致 | blocker | 必须为 0 |
| `enabled_tenant_department_missing_legacy` | 已启用租户部门缺少旧部门映射 | warning | 需要人工确认是否仍兼容旧客户端 |
| `tenant_department_legacy_missing_department` | 租户部门旧映射指向不存在的旧部门 | blocker | 必须为 0 |
| `tenant_department_code_template_mismatch` | 租户部门 code 与标准模板 code 不一致 | blocker | 必须为 0 |

## 阶段 9C 验收标准

阶段 9C 可以通过的最低标准：

- 所有 `blocker` 巡检项 `issue_count = 0`
- `warning` 项允许非 0，但必须写明原因
- 脚本可以在 linked Supabase 项目上成功执行
- 巡检结果需要记录到迁移计划文档

## 旧字段退场门槛

只有同时满足以下条件，才可以进入删除旧字段评估：

- 所有 `blocker` 巡检项连续一个版本周期为 0
- admin 端新增/编辑员工、新增岗位均主写 `tenant_department_id`
- 小程序端登录上下文、员工资料、权限判断均优先使用 `tenant_department_id`
- 后端权限、费用、项目、客户负责人等链路均不再依赖旧字段作为主判断
- 新租户初始化不再把旧 `departments` 作为业务主数据源

## 不在本阶段处理

- 不删除 `departments`
- 不删除 `department_post_rules.department_code`
- 不移除旧字段 fallback
- 不新增 admin 可视化页面

## 2026-05-27 更新

- linked dev 库中 `employees.department_id` 已不存在。
- 巡检脚本不再检查 `employees.department_id`。
- 本阶段剩余兼容对象为 `departments`、`tenant_departments.legacy_department_id` 和 `department_post_rules.department_code`。
