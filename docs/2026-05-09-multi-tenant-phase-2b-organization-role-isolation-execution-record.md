# 多租户阶段 2B 执行记录：组织、岗位、角色租户化

日期：2026-05-09

## 本阶段目标

补齐阶段 2 中暂缓的组织、岗位、角色租户隔离能力，避免后续业务模块继续租户化时依赖全局部门、岗位和角色数据。

## 已落地内容

### 数据库

新增 migration：

```text
supabase/migrations/20260509150000_tenant_scope_organization_roles.sql
```

变更内容：

- `departments` 增加 `tenant_id`。
- `posts` 增加 `tenant_id`。
- `roles` 增加 `tenant_id`。
- `department_post_rules` 增加 `tenant_id`。
- `project_member_role_post_rules` 增加 `tenant_id`。
- 历史数据全部回填到默认租户 `gooes_default`。
- 将以下唯一规则改为租户内唯一：
  - `departments(tenant_id, code)`
  - `posts(tenant_id, code)`
  - `posts(tenant_id, name)`
  - `roles(tenant_id, code)`
  - `department_post_rules(tenant_id, department_code, post_code)`
  - `project_member_role_post_rules(tenant_id, role_code, post_code)`
- 移除规则表对全局 `departments.code` / `posts.code` 的外键依赖。

### 后端接口

已按当前登录租户过滤：

- `GET /departments`
- `GET /departments/:id`
- `POST /departments`
- `PATCH /departments/:id`
- `GET /posts`
- `GET /posts/:id`
- `POST /posts`
- `PATCH /posts/:id`
- `GET /roles`
- `GET /roles/:id`
- `POST /roles`
- `PATCH /roles/:id`
- `PUT /roles/:id/permissions`
- `GET /department-post-rules`
- `PUT /department-post-rules/:department_code`
- `GET /project-member-role-post-rules`
- `PUT /project-member-role-post-rules/:role_code`

### 员工与权限

- 员工创建/更新时，部门与岗位规则校验增加租户上下文。
- 员工角色分配时，员工和角色必须属于同一租户。
- 员工权限上下文查询不能跨租户读取。
- 员工权限覆盖不能跨租户修改。
- 项目成员候选岗位规则按当前租户读取。
- 项目创建员工候选岗位 ID 查询按当前租户过滤。

## 兼容说明

规则表仍保留 `department_code`、`post_code`、`role_code` 字段，以兼容当前 admin 组织配置页面和 domain 枚举。区别是这些 code 不再是平台全局唯一语义，而是租户内语义。

## 验证

已执行：

```text
bun run api:typecheck
bun run api:build
pnpm --filter @gooes/admin build
```

验证结果均通过。

## 后续建议

阶段 3 可以继续推进费用、任务中心、施工日志等业务模块隔离。

另建议后续在平台超管能力中增加“租户初始化模板复制”：

- 创建新租户时复制默认部门字典。
- 创建新租户时复制岗位字典。
- 创建新租户时复制角色模板和权限绑定。
- 创建新租户时复制部门岗位规则和项目成员岗位规则。
