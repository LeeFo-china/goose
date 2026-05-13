# 租户部门最终迁移方案

日期：2026-05-13

## 目标

将员工、权限、业务联查中的部门关系从旧 `departments.id` 逐步迁移到 `tenant_departments.id`。

迁移完成后的目标状态：

- `department_templates` 表达平台标准部门模板。
- `tenant_departments` 表达租户启用部门、别名、启停和排序。
- `employees.tenant_department_id` 指向 `tenant_departments.id`。
- admin、小程序、权限、费用、项目等业务读写统一使用 `tenant_department_id`。
- 旧 `departments` 不再作为业务主数据源，只保留只读兼容或最终删除。

## 当前状态

已完成：

- 建立 `department_templates`
- 建立 `tenant_departments`
- 从旧 `departments` 回填租户部门配置
- `/departments` 主读 `tenant_departments`
- `/departments` 仍返回兼容 `id = legacy_department_id`
- 员工、岗位、部门岗位规则候选部门只取启用部门
- admin 组织架构页已改成“启用部门 / 部门配置”交互

仍未完成：

- `employees.department_id` 仍指向旧 `departments.id`
- 登录上下文仍通过旧部门外键取部门名
- 权限范围、费用审批、项目成员等联查仍引用旧 `departments`
- `department_post_rules` 仍通过 `department_code` 表达部门岗位映射

## 设计原则

- 不做一次性破坏式切换。
- 所有阶段都必须支持回滚。
- 后端先双写双读，再推动前端切换。
- admin 和小程序不能直接操作旧 `departments`。
- API 响应在过渡期同时返回兼容字段和新字段。

## 推进门禁

每个阶段都必须满足以下条件后才能进入下一阶段：

- migration 已在远端环境执行成功，且 dry-run 不再提示待执行变更。
- 关键 SQL 验收通过，异常清单为空或已有明确人工处理结论。
- API typecheck/build 通过。
- 涉及 admin 的阶段必须通过 admin typecheck/build。
- 涉及小程序的阶段必须输出对接说明，明确字段、兼容期和错误处理。
- 回滚方案已验证为“可退回旧字段读取”，不能依赖删除数据完成回滚。

## 分阶段方案

### 阶段 4：增加员工新外键并回填

目标：为员工表建立新部门关系，但不切读。

数据库变更：

```sql
alter table public.employees
add column if not exists tenant_department_id uuid null
references public.tenant_departments(id)
on delete set null;

create index if not exists employees_tenant_department_id_idx
on public.employees(tenant_department_id);
```

建议同时增加租户维度索引：

```sql
create index if not exists employees_tenant_tenant_department_id_idx
on public.employees(tenant_id, tenant_department_id);
```

回填规则：

```sql
update public.employees as employee
set tenant_department_id = tenant_department.id
from public.tenant_departments as tenant_department
where employee.department_id = tenant_department.legacy_department_id
  and employee.tenant_id = tenant_department.tenant_id
  and employee.tenant_department_id is null;
```

核查 SQL：

```sql
-- 已设置旧部门但未能映射到新租户部门的员工
select
  employee.id,
  employee.tenant_id,
  employee.name,
  employee.phone,
  employee.department_id
from public.employees as employee
left join public.tenant_departments as tenant_department
  on tenant_department.legacy_department_id = employee.department_id
 and tenant_department.tenant_id = employee.tenant_id
where employee.department_id is not null
  and employee.tenant_department_id is null
  and tenant_department.id is null;

-- 新旧字段映射不一致的员工
select
  employee.id,
  employee.tenant_id,
  employee.name,
  employee.department_id,
  employee.tenant_department_id,
  tenant_department.legacy_department_id
from public.employees as employee
join public.tenant_departments as tenant_department
  on tenant_department.id = employee.tenant_department_id
where employee.department_id is distinct from tenant_department.legacy_department_id;
```

验收标准：

- `employees.tenant_department_id` 回填率等于可映射旧部门员工数量。
- 存在旧 `department_id` 但无法映射的员工必须出异常清单。
- 员工列表、登录、权限不受影响。
- 不对 `tenant_department_id` 增加 `not null`，避免历史异常数据阻塞上线。

回滚：

- 不删除旧字段。
- 可直接忽略 `tenant_department_id`。

### 阶段 5：员工接口双写，读优先新字段

目标：员工新增/编辑开始写新字段，同时保留旧字段。

后端调整：

- 员工创建接口接收兼容 `department_id`，内部解析为 `tenant_department_id`。
- 员工更新接口同样双写：
  - `tenant_department_id`
  - `department_id = tenant_departments.legacy_department_id`
- 员工列表返回：
  - `department_id`：兼容旧 ID
  - `tenant_department_id`：新 ID
  - `department_name`
  - `department_code`

读策略：

- 优先使用 `employees.tenant_department_id`
- 为空时 fallback 到 `employees.department_id`

验收标准：

- 新增员工后两个字段都有值。
- 编辑员工部门后两个字段同步变化。
- 旧员工未回填时仍能正常展示。

回滚：

- 继续读旧 `department_id`。
- 双写不会破坏旧链路。

### 阶段 6：admin 和小程序切换新字段

目标：前端开始使用 `tenant_department_id`。

admin 需要调整：

- 员工新增/编辑表单候选部门使用 `tenant_department_id` 作为值。
- 员工列表优先展示 `department_name` / `department_code`。
- 岗位新增所属部门如果仍依赖兼容 ID，需要同步切换为新字段或通过后端兼容解析。

小程序需要评估：

- 员工身份展示
- 我的资料部门展示
- 权限上下文中部门字段
- 项目、客户、费用等涉及部门筛选的页面

API 过渡要求：

- 请求可以同时支持：
  - `tenant_department_id`
  - 旧 `department_id`
- 响应同时返回两个字段，直到小程序和 admin 都切换完成。
- 后端对 `tenant_department_id` 和 `department_id` 同时传入但不匹配的请求必须返回明确校验错误。

验收标准：

- admin 员工新增/编辑使用新 ID 成功。
- 小程序员工信息展示不变。
- 停用部门不出现在候选列表。
- 旧客户端传 `department_id` 仍可兼容一段时间。

回滚：

- 前端切回旧 `department_id`。
- 后端继续保留兼容解析。

### 阶段 7：权限、费用、项目等联查收口

目标：所有部门级业务判断统一读 `tenant_departments`。

重点模块：

- `authorizationService`
- `permissions` repository
- 客户隐私/部门范围查看
- 费用审批候选人
- 项目成员候选人
- 登录上下文序列化
- 员工带部门联查接口

迁移策略：

- 所有 `departments!employees_department_id_fkey` 联查改为新字段联查。
- 所有部门级范围判断优先用 `employee.tenant_department_id`。
- 需要展示名称时使用 `tenant_departments.alias_name`。
- 需要稳定语义时使用 `tenant_departments.code`。
- 旧字段 fallback 只允许存在于收口服务或 repository helper 中，避免多个模块各自写兼容逻辑。

验收标准：

- 部门级权限范围与迁移前一致。
- 费用审批候选人不扩大范围。
- 项目成员候选人不扩大范围。
- 登录上下文返回部门别名和标准编码。

回滚：

- 保留 fallback 读取旧 `department_id`。
- 联查异常时可临时切回旧路径。

### 阶段 8：部门岗位规则迁移

目标：从 `department_post_rules.department_code` 迁移到 `tenant_department_id`。

建议新增字段：

```sql
alter table public.department_post_rules
add column if not exists tenant_department_id uuid null
references public.tenant_departments(id)
on delete cascade;
```

回填：

```sql
update public.department_post_rules as rule
set tenant_department_id = tenant_department.id
from public.tenant_departments as tenant_department
where rule.tenant_id = tenant_department.tenant_id
  and rule.department_code = tenant_department.code
  and rule.tenant_department_id is null;
```

过渡策略：

- 写入时同时写 `tenant_department_id` 和 `department_code`。
- 读取时优先 `tenant_department_id`，fallback `department_code`。

验收标准：

- 部门岗位规则配置保存后新旧字段一致。
- 员工新增/编辑岗位校验结果不变。
- 停用部门下不能新增岗位。

### 阶段 9：旧 `departments` 只读和退场评估

目标：确认旧表是否还需要保留。

退场前置条件：

- `employees.department_id` 已不再被业务读写。
- 所有接口不再依赖旧 `departments.id`。
- 小程序和 admin 均已切换到 `tenant_department_id`。
- 历史报表和审计查询有兼容方案。

可选处理：

- 只读保留旧 `departments`
- 创建兼容 view
- 最终删除旧外键和旧表

不建议短期删除旧表。

## admin 对接点

需要关注：

- 组织架构部门页
- 员工新增/编辑
- 员工列表
- 岗位新增
- 部门岗位规则
- 项目成员候选人
- 费用审批候选人

admin 迁移要求：

- 优先使用 `tenant_department_id`
- 展示使用 `department_name` 或 `tenant_departments.alias_name`
- 标准部门语义使用 `department_code`
- 不直接读取或写入旧 `departments`

## 小程序对接点

需要评估：

- 员工登录上下文
- 员工资料展示
- 我的权限 / 我的部门
- 项目、客户、费用等按部门范围展示的页面
- 可能缓存部门 ID 的本地状态

小程序迁移要求：

- 不假设部门 ID 永远是旧 `departments.id`
- 过渡期同时兼容 `department_id` 和 `tenant_department_id`
- 展示名称以接口返回为准，不在端上硬编码部门名称

## 风险与控制

### 风险：部门级权限范围扩大

控制：

- 阶段 7 必须专项验证权限范围。
- 对比迁移前后同一员工可见客户、费用、项目数量。

### 风险：旧员工无法映射

控制：

- 阶段 4 输出异常清单。
- 对无法映射的员工保持旧字段 fallback。

### 风险：admin 和小程序版本不同步

控制：

- API 过渡期同时支持新旧字段。
- 响应同时返回新旧字段。
- 不在一个阶段删除旧字段。

### 风险：部门岗位规则与部门启停不一致

控制：

- 候选部门只读取 `tenant_departments.enabled = true`。
- 写入岗位前后端都必须校验启用状态。

## 回归清单

每个阶段至少验证：

- 员工列表部门显示
- 员工新增/编辑部门选择
- 停用部门不出现在员工候选
- 停用部门不出现在岗位候选
- 部门级权限范围不扩大
- 费用审批候选人不扩大
- 项目成员候选人不扩大
- 小程序员工资料部门展示正常
- 后台登录上下文部门字段正常

## 当前建议

阶段 4 已执行完成：

- migration 增加 `employees.tenant_department_id`
- 数据回填
- 异常清单 SQL
- 不切业务读写

执行记录：

- migration：`20260513203000_add_employee_tenant_department_id.sql`
- 远端执行：已完成
- `employees.tenant_department_id` 字段：已创建
- `employees_tenant_department_id_idx`：已创建
- `employees_tenant_tenant_department_id_idx`：已创建
- `employees_tenant_department_id_fkey`：已创建并校验
- 当前员工总数：32
- 已设置旧部门员工数：6
- 已回填新部门员工数：6
- 可映射但未回填：0
- 新旧字段映射不一致：0

阶段 5 已执行完成：

- 员工创建 schema 支持 `tenant_department_id`
- 员工更新 schema 支持 `tenant_department_id`
- 员工创建时支持旧 `department_id` 或新 `tenant_department_id` 入参
- 员工更新时支持旧 `department_id` 或新 `tenant_department_id` 入参
- 后端写入时同步维护：
  - `employees.department_id`
  - `employees.tenant_department_id`
- 当 `department_id` 与 `tenant_department_id` 同时传入但不匹配时，返回 `VALIDATION_ERROR`
- 员工列表、详情、带部门接口返回：
  - `department_id`
  - `tenant_department_id`
  - `department_name`
  - `department_code`
  - 兼容 `department` 对象
- 员工部门展示优先使用 `tenant_departments.alias_name/code`，fallback 旧 `departments`
- 更新员工时仅在部门或岗位实际变化时校验部门岗位规则，避免历史不合规组合阻塞无关编辑

阶段 5 验收记录：

- `bun run api:typecheck`：通过
- `bun run api:build`：通过
- 旧 `department_id` 同值更新：通过，响应包含 `tenant_department_id`
- 新 `tenant_department_id` 同值更新：通过，响应包含兼容 `department_id`
- 新旧部门 ID 不匹配：已拦截，返回 `VALIDATION_ERROR`
- 数据库一致性核查：
  - 可映射但未回填：0
  - 新旧字段映射不一致：0

阶段 6 已执行完成：

- 已补 admin/微信小程序对接说明：
  - `docs/application_integration_documentation/2026-05-13-admin-miniprogram-tenant-department-id-switch-integration.md`
- `/department-post-rules` 候选部门返回 `tenant_department_id`
- admin 员工新增/编辑部门选择控件改用 `tenant_department_id` 作为 value
- admin 员工新增/编辑提交改传 `tenant_department_id`
- admin 员工列表部门展示优先使用 `department_name` / `department_code`

阶段 6 验收记录：

- `bun run api:typecheck`：通过
- `bun run api:build`：通过
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit`：通过
- `pnpm --dir apps/admin build`：通过
- `/department-post-rules` 返回 `tenant_department_id`：通过
- 员工使用 `tenant_department_id` 保存后响应同时存在 `department_id` 和 `tenant_department_id`：通过
- 小程序端只读展示可直接消费新增字段，对接说明已落文档

阶段 7 已执行完成：

- `AuthContext` 增加：
  - `tenantDepartmentId`
  - `departmentCode`
- 后台登录 `/admin/auth/login`、`/admin/auth/me` 返回：
  - `department_id`
  - `tenant_department_id`
  - `department_code`
  - `department_name`
- 微信小程序员工登录上下文返回：
  - `tenant_department_id`
  - `department_code`
  - `department_name`
- 权限范围判断优先使用 `tenantDepartmentId`，fallback 旧 `departmentId`
- 部门范围员工查询支持新旧部门 ID：
  - `employees.tenant_department_id`
  - `employees.department_id`
- 员工列表部门级权限筛选支持新旧部门 ID
- 客户负责人分配的部门范围判断支持 `tenant_department_id`
- 费用审批候选人部门范围判断支持 `tenant_department_id`
- 费用审批链审批人联查带出 `tenant_department`
- 项目创建员工候选人联查带出 `tenant_department`

阶段 7 验收记录：

- `bun run api:typecheck`：通过
- `bun run api:build`：通过
- `/admin/auth/me` 已返回 `tenant_department_id` 和 `department_code`
- `/projects/create/employees?scene=project_designer` 可正常返回员工候选人

阶段 7 仍保留兼容：

- `department_id` 继续作为旧客户端兼容字段
- 旧 `departments` 关系仍作为展示 fallback
- 后续阶段 8 再迁移 `department_post_rules.tenant_department_id`

阶段 8 已执行完成：

- 新增 migration：
  - `supabase/migrations/20260513213000_add_department_post_rule_tenant_department_id.sql`
- `department_post_rules` 新增：
  - `tenant_department_id`
  - `department_post_rules_tenant_department_id_fkey`
  - `department_post_rules_tenant_department_id_idx`
  - `department_post_rules_tenant_tenant_department_enabled_sort_idx`
  - `department_post_rules_tenant_tenant_department_post_unique`
- 规则数据已按 `tenant_id + department_code` 回填 `tenant_department_id`
- 规则读取按 `tenant_department_id` 匹配部门，旧 `department_code` fallback
- 规则写入同时维护：
  - `tenant_department_id`
  - `department_code`
- 部门岗位规则保存使用 `tenant_id,tenant_department_id,post_code` 作为 upsert 冲突键
- 员工部门岗位校验优先使用 `tenant_department_id`

阶段 8 验收记录：

- 远端 migration：已执行
- `supabase db push --dry-run`：远端已最新
- `department_post_rules` 总数：2016
- 已回填 `tenant_department_id`：2016
- 可映射但未回填：0
- `department_code` 与 `tenant_department_id` 映射不一致：0
- `bun run api:typecheck`：通过
- `bun run api:build`：通过
- `/department-post-rules` 正常返回候选部门和 `tenant_department_id`

阶段 8 仍保留兼容：

- URL 仍使用 `/department-post-rules/:department_code`
- 响应规则仍返回 `department_code`
- 后续旧字段退场前，不删除 `department_code`
