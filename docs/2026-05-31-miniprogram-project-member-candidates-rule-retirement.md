# 小程序对接说明：项目成员候选规则下线

日期：2026-05-31

## 背景

`GET /projects/:id/member-candidates` 之前在传入 `role_code` 时，会读取数据库表 `project_member_role_post_rules`，再按角色对应的岗位规则过滤员工。

这个模型已经从 admin 组织架构入口下线，但后端候选接口仍残留依赖，导致某些租户即使工程部有员工，只要没有 `project_member_role_post_rules` 规则，`role_code=construction_manager` 也会返回空。

## 本次后端调整

后端已移除运行时对 `project_member_role_post_rules` 的依赖。

影响接口：

```text
GET /projects/:id/member-candidates
```

传入 `role_code` 时的候选口径调整为：

| role_code | 候选员工范围 |
| --- | --- |
| `construction_manager` | 当前租户工程部在职员工 |
| `supervisor` | 当前租户工程部在职员工 |
| `designer` | 当前租户设计部在职员工 |
| 其他 role_code | 当前租户在职员工 |

搜索仍支持：

```text
keyword
page
pageSize
```

示例：

```text
GET /projects/{projectId}/member-candidates?page=1&pageSize=20&role_code=construction_manager
GET /projects/{projectId}/member-candidates?page=1&pageSize=20&role_code=construction_manager&keyword=张
```

## 排期开工同步调整

排期开工时的工程负责人校验也已同步移除 `project_member_role_post_rules` 依赖。

接口：

```text
POST /projects/:id/status-transition
```

当 action 为：

```json
{
  "action": "schedule_construction",
  "start_date": "2026-06-01",
  "construction_manager_employee_id": "employee-id"
}
```

后端校验规则：

1. 员工必须属于当前租户。
2. 员工必须是 `active`。
3. 员工必须属于启用中的工程部。
4. 不再要求该员工岗位命中 `project_member_role_post_rules`。

## 小程序端需要做什么

小程序端不需要新增配置页，也不要引导租户维护“项目候选规则”。

需要确认：

1. 工程负责人选择继续调用：

```text
GET /projects/:id/member-candidates?role_code=construction_manager
```

2. 不要因为候选为空提示“请先配置候选规则”。
3. 如果候选为空，提示应改为：

```text
暂无可选工程负责人，请确认工程部已有启用员工
```

4. 排期开工提交仍使用原字段：

```json
{
  "action": "schedule_construction",
  "start_date": "YYYY-MM-DD",
  "construction_manager_employee_id": "employee-id"
}
```

## 兼容说明

- 请求参数 `role_code` 保留。
- 响应结构不变。
- 小程序端无需迁移接口路径。
- `project_member_role_post_rules` 不再作为小程序或 admin 的配置前置条件。

## 后端验收

已通过：

```bash
bun run --cwd apps/api typecheck
bun run --cwd apps/api build
git diff --check
```

新增数据库迁移：

```text
supabase/migrations/20260531174000_remove_project_member_role_rules_from_construction_schedule.sql
```
