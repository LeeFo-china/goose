# 租户部门旧兼容层退场清单

日期：2026-05-13

## 结论

当前不能删除旧 `departments` 表，也不能删除 `employees.department_id`、`department_post_rules.department_code`。

原因是旧字段仍承担三个职责：

- 兼容旧客户端和旧 API 响应
- 作为 `tenant_departments.legacy_department_id` 的映射来源
- 在部分初始化、岗位创建、展示 fallback 链路中仍被使用

短期建议是：把旧 `departments` 定义为兼容映射层，保持只读语义，不作为业务主数据源；继续推进剩余依赖收口，观察一个版本周期后再评估删除。

## 当前主数据源

主数据源：

- `department_templates`
- `tenant_departments`

兼容层：

- `departments`
- `employees.department_id`
- `department_post_rules.department_code`

已迁移主字段：

- `employees.tenant_department_id`
- `department_post_rules.tenant_department_id`

## 已完成收口

- `/departments` 主读 `tenant_departments`
- 员工新增/编辑双写新旧部门字段
- admin 员工表单使用 `tenant_department_id`
- 登录上下文返回 `tenant_department_id`
- 权限范围判断优先使用 `tenant_department_id`
- 费用审批候选人部门范围支持 `tenant_department_id`
- 项目创建员工候选人带出 `tenant_department`
- 部门岗位规则写入 `tenant_department_id`

## 仍存在的旧依赖

### 1. `departments` 表直接写入

位置：

- `apps/api/src/controllers/departments/index.ts`
- `apps/api/src/repositories/platform-tenants.ts`

用途：

- `/departments` 启用标准部门时同步创建或复用旧 `departments`
- 新租户初始化时仍会 upsert 旧 `departments`
- `tenant_departments.legacy_department_id` 依赖旧部门 ID

处理建议：

- 短期保留同步写入
- 后续阶段将新租户初始化改成先写 `tenant_departments`
- 旧 `departments` 只在需要兼容 ID 时延迟创建

### 2. `employees.department_id`

位置：

- API 员工创建/更新仍双写
- 权限、费用、客户、项目等链路仍作为 fallback
- admin 类型和展示仍保留兼容字段

用途：

- 兼容旧客户端
- 历史员工 fallback
- 与旧 `departments` 联查展示 fallback

处理建议：

- 继续保留一个版本周期
- 新代码不得只写 `department_id`
- 新查询应优先使用 `tenant_department_id`

### 3. `department_post_rules.department_code`

位置：

- `PUT /department-post-rules/:department_code`
- admin 组织架构部门岗位规则仍以部门 code 作为路由参数
- 规则响应仍返回 `department_code`

用途：

- 兼容现有 API URL
- 稳定业务语义展示

处理建议：

- 短期保留 URL 不变
- 后续可以新增 `/department-post-rules/by-tenant-department/:tenant_department_id`
- 新接口稳定后再考虑旧 URL 退场

### 4. 旧 `departments` 联查 fallback

位置：

- 员工列表/详情
- 后台登录
- 权限上下文
- 费用审批链
- 项目创建员工候选人

用途：

- 当 `tenant_department` 缺失时展示旧部门名称

处理建议：

- 短期保留 fallback
- 后续先加监控或 SQL 巡检，确认 `tenant_department_id` 覆盖率长期为 100%

### 5. admin 组织架构岗位创建

位置：

- `apps/admin/components/organization/post-mutations.tsx`
- `apps/api/src/services/posts.ts`

原现状：

- 新增岗位仍提交 `department_id`
- 后端 `departmentPostRuleService` 已兼容新旧 ID

阶段 9A 已处理：

- admin 新增岗位主提交 `tenant_department_id`
- 后端 posts 创建接口同时兼容 `tenant_department_id` 和旧 `department_id`
- 服务层统一用 `tenant_department_id || department_id` 解析目标部门

处理建议：

- 过渡期保留 `department_id`

## 不建议现在做的事

- 不删除 `departments`
- 不删除 `employees.department_id`
- 不删除 `department_post_rules.department_code`
- 不移除旧 `departments!employees_department_id_fkey` 展示 fallback
- 不把 `/department-post-rules/:department_code` 直接改成新 URL

## 下一阶段建议

### 阶段 9A：岗位创建切新字段

状态：已执行并通过基础验收。

目标：

- admin 组织架构新增岗位提交 `tenant_department_id`
- 后端 posts 接口支持 `tenant_department_id`
- 部门岗位规则启用逻辑以 `tenant_department_id` 为主

验收：

- 新增岗位时部门选择 value 是 `tenant_department_id`
- 创建岗位后自动启用对应部门岗位规则
- 旧 `department_id` 仍可兼容
- `bun run api:typecheck`、`bun run api:build`、admin TypeScript 检查通过

### 阶段 9B：新增只读保护

状态：已执行并通过基础验收。

目标：

- 明确旧 `departments` 不允许自由 CRUD
- `/departments` 保持“启用标准部门/维护别名”语义
- 禁止新增非标准部门
- 禁止通过更新接口修改标准部门 code
- 旧 `departments` 已有映射只复用，不再随租户别名修改而更新

验收：

- 不能创建模板外部门编码
- 不能修改部门 code
- 停用部门不出现在员工/岗位候选列表
- `bun run api:typecheck`、`bun run api:build`、admin TypeScript 检查通过

### 阶段 9C：退场前数据巡检

状态：已落地巡检 SQL 和执行脚本，并在 linked Supabase 通过。

巡检文档：

- `docs/2026-05-13-tenant-department-retirement-audit-plan.md`

执行脚本：

- `scripts/audit-tenant-department-retirement.sh`

底层 SQL：

- `scripts/audit-tenant-department-retirement.sql`

验收：

- 所有 `blocker` 巡检结果连续一个版本周期为 0
- `warning` 巡检结果如果非 0，需要人工记录原因
- admin 和小程序均不再以旧字段作为主写入字段
- 新增租户、新增员工、新增岗位、新增规则都主写新字段

本次执行结果：

- 所有 `blocker` 巡检项：0
- `enabled_tenant_department_missing_legacy`：0
- 当前只代表本次巡检通过，不代表可以立即删除旧字段

## 删除旧表前置条件

删除旧 `departments` 前必须同时满足：

- `tenant_departments.legacy_department_id` 不再需要
- `employees.department_id` 不再写入
- `department_post_rules.department_code` 不再作为主查询条件
- admin、小程序、后端接口均已切换到 `tenant_department_id`
- 旧报表和审计查询有替代方案
- 至少一个版本周期的数据巡检无异常

当前不满足删除条件。
