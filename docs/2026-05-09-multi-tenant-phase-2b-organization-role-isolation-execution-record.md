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

### 2026-05-11 补充：角色接口租户上下文硬保护

`/roles` 是租户后台的角色管理接口，不再承载平台级角色管理。

已补充 service 层硬校验：

- `GET /roles`
- `GET /roles/:id`
- `POST /roles`
- `PATCH /roles/:id`
- `PUT /roles/:id/permissions`
- `POST /employees/:id/roles`

上述接口必须存在明确的 `authContext.tenantId`。如果平台超管处于 `tenant_id = null` 的平台管理模式，即使绕过 admin 前端直接调用接口，也会返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "角色管理必须在租户上下文中操作"
}
```

这样可以避免平台超管空租户上下文落到 repository 层，触发无 `tenant_id` 过滤的角色查询或写入。

平台级角色管理如后续需要，应单独设计 `/platform/roles`，不能复用 `/roles`。

### 2026-05-11 补充：组织架构接口租户上下文硬保护

组织架构相关接口同样是租户业务接口，不承载平台级组织模板管理。

已补充 controller / service 层硬校验：

- `GET /departments`
- `GET /departments/:id`
- `POST /departments`
- `PATCH /departments/:id`
- `GET /posts`
- `GET /posts/:id`
- `POST /posts`
- `PATCH /posts/:id`
- `GET /department-post-rules`
- `PUT /department-post-rules/:department_code`
- `GET /project-member-role-post-rules`
- `PUT /project-member-role-post-rules/:role_code`

上述接口必须存在明确的 `authContext.tenantId`。如果平台超管处于 `tenant_id = null` 的平台管理模式，即使绕过 admin 前端直接调用接口，也会返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "组织架构必须在租户上下文中操作"
}
```

或项目成员岗位规则场景返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "项目成员岗位规则必须在租户上下文中操作"
}
```

这样可以避免空租户上下文落到 repository 层，触发无 `tenant_id` 过滤的岗位查询、空租户写入，或按 `department_code` / `role_code` 批量影响多个租户的规则。

平台级组织模板、默认部门岗位字典、租户初始化模板升级等能力，后续必须单独设计 `/platform/*` 接口，不能复用租户组织架构接口。

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
