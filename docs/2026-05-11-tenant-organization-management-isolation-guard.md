# 租户组织架构管理隔离保护说明

日期：2026-05-11

## 背景

多租户改造后，部门、岗位、部门可选岗位规则、项目成员岗位规则都属于租户业务数据。

admin 前端已经在平台超管模式下阻断 `/organization` 页面，但后端仍需要独立防御，避免平台超管或异常登录态直连接口时绕过租户过滤。

## 当前结论

组织架构管理定义为租户业务能力：

- 租户管理员只维护本公司部门、岗位和岗位规则。
- 租户之间允许使用相同的部门编码、岗位编码和角色岗位规则。
- 平台超管在 `tenant_id = null` 的平台管理模式下不能调用租户组织架构接口。
- 平台组织模板、默认部门岗位字典、租户初始化模板升级等能力，后续必须单独设计 `/platform/*` 接口。

## 后端保护

已补充租户上下文硬校验。

受影响接口：

```text
GET /departments
GET /departments/:id
POST /departments
PATCH /departments/:id
GET /posts
GET /posts/:id
POST /posts
PATCH /posts/:id
GET /department-post-rules
PUT /department-post-rules/:department_code
GET /project-member-role-post-rules
PUT /project-member-role-post-rules/:role_code
```

当 `authContext.tenantId` 缺失时，接口返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "组织架构必须在租户上下文中操作"
}
```

项目成员岗位规则接口返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "项目成员岗位规则必须在租户上下文中操作"
}
```

## 为什么必须后端硬保护

组织架构规则表按编码保存，例如：

```text
department_post_rules.department_code
project_member_role_post_rules.role_code
```

如果空租户上下文进入 repository 层，更新时可能按同一个 `department_code` 或 `role_code` 影响多个租户的规则。

岗位表也存在同类风险：空 `tenantId` 时可能查询全量岗位，或创建 `tenant_id = null` 的平台外业务岗位。

因此组织架构接口必须在 controller / service 层阻断空租户上下文。

## Admin 对接要求

- 租户后台继续使用现有接口，不需要传 `tenant_id`。
- 平台超管模式下继续隐藏并阻断“组织架构”页面。
- 如果接口返回 `TENANT_CONTEXT_REQUIRED`，展示“当前为平台管理模式，不能访问租户组织架构管理”。
- 不要为平台超管临时拼租户参数调用租户组织接口。

## 验收清单

- A 租户部门列表只返回 A 租户部门。
- B 租户部门列表只返回 B 租户部门。
- A 租户岗位列表不出现 B 租户岗位。
- A 租户更新部门岗位规则不影响 B 租户。
- A 租户更新项目成员岗位规则不影响 B 租户。
- 平台超管直接访问 admin `/organization` 页面被平台模式拦截。
- 平台超管直连组织架构相关 API 返回 403。
