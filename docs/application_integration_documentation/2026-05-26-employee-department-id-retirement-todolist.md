# employees.department_id 清理分阶段执行 TODO

## 目标

彻底清理旧员工部门字段 `employees.department_id`，员工部门归属统一使用 `employees.tenant_department_id`。

完成后的目标状态：

- 员工首页默认配置只按 `employee_id`、`post_id`、`tenant_department_id`、租户默认配置解析。
- 后端权限、费用、员工、项目成员、客户负责人等部门范围判断只使用 `tenant_department_id`。
- Admin 员工管理、组织架构、岗位规则不再读取或提交 `department_id`。
- 小程序端只消费后端返回的 `tenant_department_id` / 部门展示信息，不再依赖旧部门 ID。
- 数据库删除 `employees.department_id`，Supabase types 不再包含该字段。

## 执行规则

- 每个阶段单独执行、测试、验收、提交。
- 前一阶段未通过，不进入下一阶段。
- 每个阶段提交必须能独立回滚。
- 禁止在同一阶段同时做权限切换、Admin 改造和数据库删字段。
- 不再新增 `department_id` fallback；发现缺少 `tenant_department_id` 的数据必须先通过数据阶段修复。

## 阶段 1：引用盘点和清理边界

状态：已完成

目标：

- 找出旧字段、旧外键、旧部门 fallback 的所有引用点。
- 按模块和风险拆分后续阶段。
- 本阶段不改业务逻辑。

引用清单：

| 分类 | 文件/模块 | 当前依赖 |
| --- | --- | --- |
| API schema | `apps/api/src/schema/employee.ts` | 员工创建/编辑仍接受 `department_id` |
| API schema | `apps/api/src/schema/post.ts` | 岗位创建仍允许 `department_id` 或 `tenant_department_id` 二选一 |
| API schema | `apps/api/src/schema/expense-requests.ts` | 费用筛选仍接受 `department_id` |
| 员工服务 | `apps/api/src/services/employee-core.ts` | `tenant_department_id` 与 `department_id` 双写、校验兼容、旧字段回填 |
| 员工仓储 | `apps/api/src/repositories/employee-core.ts` | 查询、列表、可见范围仍 join `departments!employees_department_id_fkey`，部门范围 `.or(tenant_department_id,department_id)` |
| 授权上下文 | `apps/api/src/services/authorization.ts` | `AuthContext.departmentId` 仍由 `employee.department_id` 填充 |
| 权限策略 | `apps/api/src/services/access-policy.ts` | 部门范围判断仍 fallback 到 `department_id` |
| 权限仓储 | `apps/api/src/repositories/permissions.ts` | 员工权限上下文和部门员工列表仍读取旧字段；`listEmployeeIdsByDepartmentId` 同时查新旧字段 |
| Admin 登录上下文 | `apps/api/src/repositories/admin-auth.ts`、`apps/api/src/services/admin-auth.ts` | 管理端身份返回仍含 `department_id` 和旧部门 join |
| 微信登录 RPC | `supabase/migrations/20260520190000_*`、`20260520191500_*` | RPC 返回 `employee_department_id` 并 join 旧 `departments` |
| 微信控制器 | `apps/api/src/controllers/wechat/index.ts` | 登录序列化仍带 `department_id` |
| 员工控制器 | `apps/api/src/controllers/employee/index.ts` | 响应仍补 `department_id` 兼容字段 |
| 费用审批 | `apps/api/src/repositories/expense-requests.ts`、`apps/api/src/services/expense-requests.ts` | 审批人部门范围、候选人过滤、展示仍 fallback 旧字段 |
| 客户负责人 | `apps/api/src/repositories/customer-owner-assignments.ts` | 负责人候选/分配校验仍读取 `department_id` |
| 项目成员/项目候选 | `apps/api/src/repositories/project-members.ts`、`apps/api/src/repositories/projects.ts` | 员工候选和成员展示仍 join 旧部门 |
| 平台租户 | `apps/api/src/repositories/platform-tenants.ts` | 租户详情员工列表和初始化仍写/读 `department_id` |
| 部门岗位规则 | `apps/api/src/repositories/department-post-rules.ts`、`apps/api/src/services/department-post-rules.ts` | 仍通过 `legacy_department_id` / `department_code` 兼容旧规则 |
| Admin 员工页 | `apps/admin/app/(console)/employees/page.tsx`、`apps/admin/components/employees/*` | 类型、默认值、展示 fallback 仍用 `department_id` |
| Admin 组织架构 | `apps/admin/components/organization/*` | 部分交互仍允许 fallback 到旧部门 `id` |
| Admin lib | `apps/admin/lib/backend.ts` | 当前用户类型仍含 `department_id` |
| 数据库类型 | `apps/api/src/types/database.ts` | `employees.department_id` 和外键仍存在 |
| 数据库迁移/RPC | `supabase/migrations/*` | 历史迁移可保留；当前 RPC 需要新增替换 migration |

已确认的清理原则：

- `tenant_departments.legacy_department_id` 在删除 `employees.department_id` 前可以临时保留，用于历史映射和旧文档解释；不作为员工部门归属判断。
- `departments` 历史表本轮不一定删除，除非所有部门模板和租户部门链路都已脱离。
- `department_post_rules.department_code` 是另一条兼容链路，可在本计划中同步收口，但不阻塞 `employees.department_id` 删除，只要员工部门判断不再依赖旧字段。

验收：

- [x] 清单覆盖 API、Admin、RPC、DB 类型、迁移脚本、文档引用。
- [x] 后续阶段拆分避免一次性大爆改。
- [x] `git status` 在文档创建前为干净状态。
- [x] 文档提交完成。

测试：

- [x] `rg "department_id|employees_department_id_fkey|tenant_department_id|legacy_department_id|department:" apps/api/src apps/admin packages/domain/src supabase/migrations docs -S`
- [x] `rg "department_id|employees_department_id_fkey|department:departments" apps/api/src/services apps/api/src/repositories apps/api/src/schema apps/api/src/controllers -S`
- [x] `rg "department_id|employees_department_id_fkey|department:departments" apps/admin/app apps/admin/components apps/admin/lib -S`
- [x] `rg "department_id|employees_department_id_fkey|legacy_department_id" supabase/migrations -S`

提交：

- [ ] `docs: plan employee department id retirement`

## 阶段 2：数据一致性校验和 backfill

状态：待执行

目标：

- 确认所有有效员工都具备正确的 `tenant_department_id`。
- 在任何代码切换前，先消除缺失和不一致数据。

TODO：

- [ ] 新增只读校验脚本，统计：
  - `employee_missing_tenant_department`
  - `employee_tenant_department_tenant_mismatch`
  - `employee_tenant_department_disabled`
  - `employee_with_old_department_only`
  - `employee_old_new_department_mismatch`
- [ ] 如仍有可从旧字段映射的员工，新增显式 `--apply` backfill。
- [ ] 对无法映射的员工输出异常清单，不自动猜测部门。
- [ ] dry-run 默认不写库。

验收：

- [ ] dry-run 可输出问题数量和明细。
- [ ] blocker 项为 0，或有明确人工处理结论。
- [ ] backfill 后再次 dry-run 为 0。

测试：

- [ ] API typecheck。
- [ ] 执行 dry-run。
- [ ] 必要时执行 backfill 并复跑 dry-run。

提交：

- [ ] `feat: add employee tenant department consistency check`

## 阶段 3：后端权限和业务读取去旧字段

状态：待执行

目标：

- 后端部门级权限和业务范围只使用 `tenant_department_id`。
- 移除 `department_id` fallback，但暂不删除数据库字段。

TODO：

- [ ] `AuthContext` 移除或废弃 `departmentId` 参与判断，只保留 `tenantDepartmentId`。
- [ ] `access-policy` 的部门匹配只比较 `tenant_department_id`。
- [ ] `permissions` repository 的部门员工查询只用 `tenant_department_id`。
- [ ] 费用审批、客户负责人、项目成员候选、员工列表可见范围只用 `tenant_department_id`。
- [ ] 旧 `departments!employees_department_id_fkey` join 改为 `tenant_departments!employees_tenant_department_id_fkey`。

验收：

- [ ] 部门范围权限只命中同一 `tenant_department_id` 员工。
- [ ] 缺少 `tenant_department_id` 的员工不会被旧字段兜底命中。
- [ ] 费用审批、客户负责人、项目候选范围正确。

测试：

- [ ] API typecheck/build。
- [ ] 权限范围静态搜索无旧字段业务判断。
- [ ] 两个部门员工账号手动验权。

提交：

- [ ] `refactor: use tenant department for backend scopes`

## 阶段 4：员工接口和 Admin 去旧字段

状态：待执行

目标：

- 员工创建/编辑不再接受或提交 `department_id`。
- Admin 员工管理只使用 `tenant_department_id`。

TODO：

- [ ] `EmployeeSchema` 移除 `department_id` 入参并启用 strict。
- [ ] `employee-core` 移除双写旧字段逻辑。
- [ ] 员工列表响应不再返回 `department_id`。
- [ ] Admin 员工页类型、默认值、展示 fallback 清理。
- [ ] Admin 当前用户类型清理 `department_id`。

验收：

- [ ] 新增员工只写 `tenant_department_id`。
- [ ] 编辑员工部门后只更新 `tenant_department_id`。
- [ ] 员工列表部门显示来自租户部门。
- [ ] 旧字段为空不影响 Admin 员工管理。

测试：

- [ ] API typecheck/build。
- [ ] Admin typecheck/build。
- [ ] 员工新增/编辑手动验收。

提交：

- [ ] `refactor: remove employee department id from admin flows`

## 阶段 5：小程序和员工首页配置对接

状态：待执行

目标：

- 员工首页默认配置只支持 `employee_id`、`post_id`、`tenant_department_id`、租户默认配置。
- 小程序不再消费旧 `department_id`。

TODO：

- [ ] 后端员工首页配置 resolver 不写 `department_id` fallback。
- [ ] 员工身份接口、微信登录上下文不再返回旧部门 ID。
- [ ] 新增或更新小程序对接文档，明确字段和优先级。
- [ ] 如 RPC 返回员工身份字段，新增替换 RPC migration。

首页配置优先级：

```text
employee_id
→ post_id
→ tenant_department_id
→ tenant_default
```

验收：

- [ ] 员工首页不同租户部门可命中不同默认配置。
- [ ] 没有 `tenant_department_id` 的员工只能走岗位或租户默认，不走旧字段。
- [ ] 小程序对接文档完整。

测试：

- [ ] API typecheck/build。
- [ ] 微信登录/员工身份接口响应检查。
- [ ] 小程序对接文档验收。

提交：

- [ ] `feat: resolve employee home config by tenant department`

## 阶段 6：数据库删字段和类型清理

状态：待执行

目标：

- 业务完全脱离旧字段后，删除数据库字段和类型残留。

TODO：

- [ ] 新增 migration 删除 `employees.department_id` 外键和字段。
- [ ] 更新所有当前 RPC，移除 `employee_department_id` 输出和旧部门 join。
- [ ] 重新生成 Supabase types。
- [ ] 确认 `rg "department_id"` 只剩历史迁移、历史文档、非员工业务表字段。

验收：

- [ ] migration 可执行。
- [ ] `employees` 类型不再包含 `department_id`。
- [ ] API/Admin typecheck 通过。
- [ ] 代码区无 `employees.department_id` 业务引用。

测试：

- [ ] migration dry-run 或本地执行。
- [ ] `supabase gen types`。
- [ ] API typecheck/build。
- [ ] Admin typecheck/build。

提交：

- [ ] `chore: drop employee department id`

## 阶段 7：最终回归和收尾

状态：待执行

目标：

- 确认旧部门字段清理完整，员工首页配置可以继续推进。

TODO：

- [ ] 员工登录、Admin 登录、权限范围、费用审批、客户负责人、项目成员候选全链路回归。
- [ ] 更新最终清理记录。
- [ ] 如历史文档存在“最新接口仍使用 department_id”的误导说明，补充废弃说明，不改历史事实。

验收：

- [ ] 核心链路回归通过。
- [ ] 工作区干净。
- [ ] 所有阶段提交完成。

测试：

- [ ] API typecheck/build。
- [ ] Admin typecheck/build。
- [ ] 关键接口手动请求。

提交：

- [ ] `docs: close employee department id retirement`
