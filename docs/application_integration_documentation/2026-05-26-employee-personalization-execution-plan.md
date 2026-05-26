# 员工部门岗位个性化内容分阶段执行计划

日期：2026-05-26

## 背景

小程序端希望员工登录后可以根据员工的租户部门和岗位展示定制化内容，例如首页 banner、快捷入口、任务提醒、业务提示和模块排序。

当前员工登录和 `/employee/bootstrap` 已具备必要身份上下文：

- `employeeId`
- `tenantId`
- `tenantDepartmentId`
- `departmentCode`
- `departmentName`
- `postId`
- `postName`
- `roleCodes`

部门字段已经切换到 `tenant_department_id`，后续个性化配置严禁继续依赖旧 `department_id`。

## 总目标

通过后端配置和 Admin 管理能力，实现员工登录后按员工、岗位、租户部门、角色和租户默认规则返回定制化内容。小程序端只消费后端返回的最终配置，不在小程序端硬编码部门岗位规则。

## 核心原则

1. 配置驱动：规则配置在后端和 Admin，前端不写死业务分支。
2. Bootstrap 优先：员工首屏轻量配置通过 `GET /employee/bootstrap` 返回。
3. 不拖慢登录：bootstrap 只返回命中的轻量结果，不返回规则全集。
4. 稳定契约：小程序对接字段必须等后端验收通过后再冻结。
5. 阶段门禁：每个阶段必须验收通过并提交后，才能进入下一阶段。

## 规则匹配优先级

后端按以下优先级返回最终命中配置：

```text
employee_id
→ tenant_department_id + post_id
→ post_id
→ tenant_department_id
→ role_code
→ tenant_default
```

同一层级内按 `priority` 从大到小排序，再按 `updated_at` 从新到旧兜底。

## 阶段 0：契约确认和基线检查

### 目标

确认当前身份上下文、部门岗位字段、bootstrap 链路和 Admin 技术入口，不做业务代码变更。

### 改动范围

- 文档梳理。
- 本地确认 `/employee/bootstrap` 当前返回结构。
- 确认 `AuthContext` 中字段命名和小程序登录响应字段。

### 验收标准

- 确认不使用旧 `department_id`。
- 确认个性化匹配使用 `tenantDepartmentId` / `postId`。
- 确认 `/employee/bootstrap` 是员工首页首屏入口。
- 确认 Admin 后续新增菜单和页面归属。

### 提交要求

阶段 0 只提交文档。

建议提交信息：

```text
docs: add employee personalization rollout plan
```

## 阶段 1：后端数据模型和匹配服务

### 目标

建立个性化规则数据模型和后端 resolver，不接入 bootstrap，不影响现有接口。

### 后端改动

新增表建议：

```text
employee_personalization_rules
```

字段建议：

```text
id uuid primary key
tenant_id uuid not null
scene text not null
employee_id uuid null
tenant_department_id uuid null
post_id uuid null
role_code text null
priority int not null default 0
content_json jsonb not null
status text not null default 'draft'
starts_at timestamptz null
ends_at timestamptz null
created_by uuid null
updated_by uuid null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

约束建议：

- `status in ('draft', 'active', 'disabled')`
- `scene` 非空。
- `content_json` 必须是 object。
- 同一规则至少配置一个匹配维度，或明确使用租户默认规则。

索引建议：

- `(tenant_id, scene, status)`
- `(tenant_id, scene, employee_id)`
- `(tenant_id, scene, tenant_department_id, post_id)`
- `(tenant_id, scene, post_id)`
- `(tenant_id, scene, tenant_department_id)`
- `(tenant_id, scene, role_code)`

新增 service：

```text
employee-personalization.ts
```

核心方法：

```ts
resolveForEmployee(authContext, scene): Promise<EmployeePersonalizationPayload>
```

### API 行为

本阶段只提供内部 resolver 和最小调试能力，不修改小程序可见契约。

### 验收标准

- migration 可执行。
- resolver 能按优先级命中规则。
- 未命中时返回稳定空配置。
- 禁用、未开始、已过期规则不会命中。
- 多租户隔离：A 租户规则不能被 B 租户员工命中。
- 运行：

```bash
bun run api:typecheck
```

如涉及 migration 验证，运行：

```bash
supabase migration list
```

或在目标环境按发布流程执行 migration 验证。

### 提交门禁

验收全部通过后提交，不通过不得进入阶段 2。

建议提交信息：

```text
feat(api): add employee personalization rule resolver
```

## 阶段 2：接入 `/employee/bootstrap` 和读取接口

### 目标

让员工首页首屏可以拿到命中的轻量个性化配置，同时提供独立读取接口用于页面内刷新。

### 后端改动

`GET /employee/bootstrap` 新增字段：

```json
{
  "personalization": {
    "version": "2026-05-26-001",
    "matched_rule": {
      "id": "rule_xxx",
      "scope": "department_post"
    },
    "scenes": {
      "employee_home": {
        "blocks": [],
        "quick_actions": []
      }
    }
  }
}
```

新增员工读取接口：

```text
GET /employee/personalization?scene=employee_home
```

接口要求：

- 只返回当前员工最终命中的配置。
- 不返回规则全集。
- 无配置返回空配置，不报错。
- bootstrap 内 resolver 失败时不阻断员工登录，返回空配置并记录 warning。

### 缓存要求

缓存 key 至少包含：

```text
tenant_id
employee_id
tenant_department_id
post_id
roleCodes
scene
rules_version
```

Admin 更新规则后必须刷新 `rules_version` 或清除相关缓存。

### 验收标准

- `/employee/bootstrap` 正常返回原有字段。
- 未配置规则时 `personalization.scenes.employee_home.blocks` 为空数组。
- 命中员工级规则时优先返回员工级配置。
- 命中 `tenant_department_id + post_id` 规则时覆盖单岗位或单部门规则。
- resolver 异常不会导致 bootstrap 500。
- 运行：

```bash
bun run api:typecheck
```

可选本地 smoke：

```bash
curl --noproxy '*' -i http://127.0.0.1:3000/employee/personalization?scene=employee_home
```

需要带员工 token 才能验完整权限链路。

### 提交门禁

验收全部通过后提交，不通过不得进入阶段 3。

建议提交信息：

```text
feat(api): expose employee personalization payload
```

## 阶段 3：Admin 配置管理和预览

### 目标

Admin 支持管理个性化规则，并能预览某个员工或部门岗位组合的最终命中结果。

### Admin 改动

新增页面建议：

```text
/platform/employee-personalization
```

功能：

- 规则列表。
- 新建规则。
- 编辑规则。
- 启用 / 停用规则。
- 设置场景 `scene`。
- 设置匹配维度：员工、租户部门、岗位、角色、租户默认。
- 编辑 `content_json`。
- 预览最终命中结果。

### API 改动

新增 Admin 接口：

```text
GET /admin/employee-personalization-rules
POST /admin/employee-personalization-rules
GET /admin/employee-personalization-rules/:id
PATCH /admin/employee-personalization-rules/:id
POST /admin/employee-personalization-rules/:id/status
POST /admin/employee-personalization-rules/preview
```

预览输入示例：

```json
{
  "scene": "employee_home",
  "employee_id": "employee_xxx"
}
```

或：

```json
{
  "scene": "employee_home",
  "tenant_department_id": "department_xxx",
  "post_id": "post_xxx",
  "role_codes": ["employee"]
}
```

### 验收标准

- Admin 可创建租户默认规则。
- Admin 可创建部门+岗位规则。
- Admin 可创建员工专属规则。
- 预览结果符合匹配优先级。
- 禁用规则后，预览和 bootstrap 不再命中。
- 非平台/非授权用户不能管理规则。
- 运行：

```bash
bun run api:typecheck
pnpm --dir apps/admin build
```

如 build 受环境变量影响，至少执行 Admin TypeScript/Next 编译链路并记录阻塞原因。

### 提交门禁

验收全部通过后提交，不通过不得进入阶段 4。

建议提交信息：

```text
feat(admin): add employee personalization rule management
```

## 阶段 4：观测、缓存失效和回归

### 目标

补齐线上排查能力，确保规则命中、缓存和 bootstrap 性能可观测。

### 改动范围

- resolver 命中日志。
- bootstrap 个性化配置耗时日志。
- Admin 更新规则后的缓存失效日志。
- 规则版本字段或系统设置。
- 空配置、异常配置的 warning。

### 日志字段建议

```ts
{
  requestId,
  tenantId,
  employeeId,
  tenantDepartmentId,
  postId,
  scene,
  matchedRuleId,
  matchedScope,
  rulesVersion,
  durationMs,
}
```

### 验收标准

- bootstrap 日志能看出是否命中规则。
- resolver 异常有 warning，但不影响登录。
- Admin 更新规则后，新 bootstrap 能拿到新版本配置。
- 缓存命中不跨员工、不跨租户。
- 回归 `/employee/bootstrap` 性能，没有因为个性化配置明显拖慢首屏。

### 提交门禁

验收全部通过后提交，不通过不得进入阶段 5。

建议提交信息：

```text
chore(api): add employee personalization observability
```

## 阶段 5：后端/Admin 总验收和契约冻结

### 目标

冻结小程序可对接契约，明确字段、场景、兜底和兼容策略。

### 总体验收清单

- 数据模型已上线。
- resolver 匹配优先级正确。
- bootstrap 返回稳定 `personalization`。
- Admin 可配置、启停、预览。
- 缓存失效生效。
- 未配置规则时小程序可安全使用默认首页。
- 多租户隔离通过。
- 操作权限通过。
- 文档更新完成。

### 必须产出

冻结小程序对接文档：

```text
docs/application_integration_documentation/2026-05-26-miniprogram-employee-personalization-integration.md
```

注意：阶段 5 之前只允许保留草案，不能通知小程序团队按字段开发。

### 提交门禁

总验收通过后提交最终文档。

建议提交信息：

```text
docs: finalize miniprogram employee personalization integration
```

## 阶段 6：小程序联调支持

### 目标

后端/Admin 已完成并提交后，支持小程序团队对接和联调。

### 小程序端预期改动

小程序端只做消费：

- 登录后读取 `/employee/bootstrap.personalization`。
- 首页按 `scenes.employee_home` 渲染。
- 配置缺失或解析失败时使用默认首页。
- 不在小程序端写死部门岗位规则。
- 本地缓存 key 如需区分配置，使用 `version`，不得使用旧 `department_id`。

### 联调验收

- 不同部门岗位员工看到不同首页内容。
- 员工专属规则优先级高于部门岗位规则。
- 部门岗位规则高于租户默认规则。
- 禁用规则后小程序恢复默认或命中低优先级规则。
- 配置解析失败时不影响登录和首页进入。

### 提交要求

本仓库只提交后端/Admin 和文档。小程序端代码由小程序项目团队在对应仓库提交。

## 风险和边界

| 风险 | 处理 |
| --- | --- |
| bootstrap 被拖慢 | 只返回命中结果，短缓存，异常降级为空配置 |
| 小程序提前依赖草案字段 | 阶段 5 前不冻结契约 |
| 配置错误导致首页异常 | content schema 校验，小程序兜底默认首页 |
| 部门字段混用 | 只允许 `tenant_department_id`，禁止旧 `department_id` |
| 多租户串配置 | 所有查询必须带 `tenant_id` |

## 阶段推进规则

1. 每个阶段只做本阶段范围内的改动。
2. 每个阶段必须完成验收清单。
3. 验收未通过，不提交，不进入下一阶段。
4. 验收通过后先提交，再开始下一阶段。
5. 小程序对接文档只在后端/Admin 总验收后冻结。
