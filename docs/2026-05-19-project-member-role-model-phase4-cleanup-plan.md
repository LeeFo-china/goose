# 项目角色模型阶段 4 清理计划

日期：2026-05-19

## 背景

项目成员新增已经改为直接选择员工，不再要求租户维护“项目角色 / 项目规则”。组织架构页也已移除项目规则入口。因此 `project_member_role_post_rules` 这组“项目角色到岗位候选规则”的配置能力已经退出主链路。

本阶段目标是先做安全清理：删除无入口、无新链路依赖的配置 API 和 Admin 旧组件；暂不删除数据库表和 `project_members.role_code` / `role_name`。

## 当前依赖结论

可以清理：

- Admin 旧组件 `role-post-rules-client-shell.tsx`
- API 路由 `/project-member-role-post-rules`
- API controller / service / repository / schema：
  - `controllers/project-member-role-post-rules`
  - `services/project-member-role-post-rules`
  - `repositories/project-member-role-post-rules`
  - `schema/project-member-role-post-rules`

暂时保留：

- `project_member_role_post_rules` 数据库表
- `project_members.role_code`
- `project_members.role_name`
- `PROJECT_MEMBER_ROLE_*` domain 常量
- `GET /projects/member-roles`

## 暂留原因

`project_members.role_code` / `role_name` 仍被以下链路使用：

- 历史项目成员展示和排序
- 设计师 / 工程负责人 legacy 字段同步
- 客户归属虚拟成员 `customer_owner`
- 工序验收里查找 `construction_manager`
- 小程序客户自助项目成员展示兼容

因此这一阶段不能直接删除项目成员角色字段，也不应删除 `PROJECT_MEMBER_ROLE_*` 常量。

## 本阶段执行内容

已执行第一批安全清理：

- 移除 `/project-member-role-post-rules` 路由注册。
- 删除项目角色岗位规则 controller / service / repository / schema。
- 删除 Admin 旧项目规则配置组件。
- 删除 Admin organization 类型中的项目角色规则配置类型。

## Admin 对接

Admin 当前不需要新增对接：

- 组织架构页已经没有项目规则入口。
- 项目详情成员页已经支持直接添加员工。
- 项目成员新增不再选择项目角色。

## 小程序对接

小程序端继续遵循：

- 不再调用 `/project-member-role-post-rules`。
- 新增项目成员只传 `employee_id`。
- 成员展示可兼容 `role_name`，但不要把它作为新增成员的必填操作。

详细文档见：

- `docs/wechat/2026-05-19-project-member-direct-employee-integration-plan.md`

## 下一阶段建议

阶段 5 再做数据模型收敛：

1. 排查 `GET /projects/member-roles` 是否还有端侧调用。
2. 将工序验收里查 `construction_manager` 的逻辑改为明确负责人字段或项目成员标记。
3. 评估是否用 `is_primary`、`member_type` 或更明确字段替换 `role_code`。
4. 完成 Admin / 小程序确认后，再写 migration 删除 `project_member_role_post_rules` 表。

## 验收标准

- API typecheck 通过。
- Admin typecheck 通过。
- 项目创建、项目成员新增不依赖项目角色规则。
- 访问 `/project-member-role-post-rules` 不再作为支持接口。
- 组织架构页无项目规则入口。
