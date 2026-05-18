# 租户部门兼容层阶段 10 退场执行方案

日期：2026-05-18

## 结论

租户部门重构已经进入阶段 10 的观察和退场准备期。

当前不能直接删除旧 `departments` 表，也不能删除 `employees.department_id`、`department_post_rules.department_code`。

原因：

- 旧字段仍承担兼容旧客户端、旧接口响应和历史展示 fallback 的职责。
- `tenant_departments.legacy_department_id` 仍依赖旧 `departments.id`。
- 部分 URL 语义仍保留旧口径，例如 `/department-post-rules/:department_code`。
- 删除旧层需要经过至少一个版本周期的数据巡检和发布验收。

## 当前已完成

### 数据模型

- 已建立 `department_templates`，作为平台标准部门模板。
- 已建立 `tenant_departments`，作为租户启用部门、别名、启停和排序主表。
- 已从旧 `departments` 回填租户部门配置。
- `employees` 已新增并回填 `tenant_department_id`。
- `department_post_rules` 已新增并回填 `tenant_department_id`。

### 后端主链路

- `/departments` 主读 `tenant_departments`。
- `/departments` 新增语义改为“启用标准部门”，不再自由创建部门。
- 员工新增/编辑支持 `tenant_department_id`，并兼容反写旧 `department_id`。
- 岗位新增支持 `tenant_department_id`，旧 `department_id` 仅作为兼容。
- 权限、费用审批、客户负责人、项目候选人等链路优先使用 `tenant_department_id`。
- 部门岗位规则优先使用 `department_post_rules.tenant_department_id`。

### admin 对接

- 组织架构页已改成启用标准部门、维护别名、启停、排序。
- 员工新增/编辑部门下拉主使用 `tenant_department_id`。
- 员工新增/编辑请求体主提交 `tenant_department_id`。
- 岗位新增部门下拉主使用 `tenant_department_id`。
- 当前部门缺少 `tenant_department_id` 时，岗位新增入口禁用。

2026-05-18 交互修正：

- 租户部门列表只展示已启用部门。
- 未启用的标准部门不直接进入部门列表。
- “启用部门”入口改为可搜索多选，用户选择并保存后才启用到租户部门列表。
- 部门列表不再把平台标准模板当作租户当前组织架构直接平铺展示。
- 新租户初始化不再默认启用任何标准部门，平台模板只作为待启用候选。
- 历史租户数据按安全口径修正：只保留已有员工绑定的部门为启用，其他部门和对应部门岗位规则停用。

### 小程序对接口径

小程序端不需要操作旧 `departments`。

对接要求：

- 登录上下文优先读取 `tenant_department_id`。
- 展示部门名称使用 `department_name`。
- 固定业务语义判断使用 `department_code`。
- 如后续有组织归属写入，提交 `tenant_department_id`。
- 旧 `department_id` 只能作为历史缓存和旧版本兼容，不得作为新业务缓存 key。

## 2026-05-18 巡检结果

执行命令：

```bash
scripts/audit-tenant-department-retirement.sh
```

执行结果：

| check_code | severity | issue_count | status |
| --- | --- | ---: | --- |
| `employee_department_mismatch` | blocker | 0 | pass |
| `employee_tenant_department_tenant_mismatch` | blocker | 0 | pass |
| `employees_missing_tenant_department` | blocker | 0 | pass |
| `rule_department_code_mismatch` | blocker | 0 | pass |
| `rule_tenant_department_tenant_mismatch` | blocker | 0 | pass |
| `rules_missing_tenant_department` | blocker | 0 | pass |
| `tenant_department_code_template_mismatch` | blocker | 0 | pass |
| `tenant_department_legacy_missing_department` | blocker | 0 | pass |
| `enabled_tenant_department_missing_legacy` | warning | 0 | pass |

结论：

- 当前 linked Supabase 巡检通过。
- 这只代表当前数据状态健康，不代表旧字段可以立即删除。

## 阶段 10 目标

阶段 10 的目标不是立即删表，而是把旧兼容层从“业务依赖”降级为“可退场兼容层”。

最终要达到：

- 新增租户不再依赖旧 `departments` 作为主数据源。
- 新增员工、编辑员工、新增岗位、新增规则都只主写 `tenant_department_id`。
- 后端业务判断不再以 `department_id` 或 `department_code` 作为主判断条件。
- admin 和小程序均不再新增旧字段主写入。
- 巡检连续一个版本周期为 0。
- 旧字段删除前有明确回滚方案和数据快照方案。

## 分步执行

### 第 1 步：发布验收加入巡检

每次生产发布后执行：

```bash
scripts/audit-tenant-department-retirement.sh
```

验收标准：

- 所有 `blocker` 必须为 0。
- `warning` 如果非 0，必须记录原因和处理结论。
- 巡检结果写入发布记录或本文件的后续记录区。

不通过处理：

- 停止进入旧字段退场。
- 先修复数据映射或业务写入路径。

### 第 2 步：收紧新写入

后端要求：

- 员工新增/编辑主字段为 `tenant_department_id`。
- 岗位新增主字段为 `tenant_department_id`。
- 部门岗位规则主字段为 `tenant_department_id`。
- 旧 `department_id` 和 `department_code` 只允许作为兼容输入或响应字段。

admin 要求：

- 不再提交旧 `department_id` 作为主字段。
- 不再允许新增非模板部门。
- 不允许直接编辑标准部门 `code`。

小程序要求：

- 不新增旧 `department_id` 主写入。
- 缓存和权限判断优先使用 `tenant_department_id`。

### 第 3 步：新增新口径接口，弱化旧 URL

建议新增或稳定以下接口口径：

- `GET /department-post-rules/by-tenant-department/:tenant_department_id`
- `PUT /department-post-rules/by-tenant-department/:tenant_department_id`

保留旧接口：

- `PUT /department-post-rules/:department_code`

旧接口处理方式：

- 短期继续兼容。
- 内部仍解析到 `tenant_department_id`。
- 日志记录旧接口调用量，观察是否还有客户端依赖。

验收标准：

- admin 新逻辑可以完全使用新接口。
- 旧接口调用量连续一个版本周期可控或为 0。
- 旧接口仍不破坏旧客户端。

### 第 4 步：新租户初始化切换

当前新租户初始化仍会同步旧 `departments`。

目标：

- 新租户初始化主写 `tenant_departments`。
- 旧 `departments` 只在需要兼容 ID 时延迟创建或补齐映射。
- 不再把旧 `departments` 作为租户组织架构主数据源。

验收标准：

- 新建租户后 `tenant_departments` 完整。
- admin 组织架构可正常启用、停用、改别名。
- 员工、岗位、岗位规则均使用 `tenant_department_id`。
- 巡检结果仍全部通过。

### 第 5 步：集中 fallback

把旧字段 fallback 收敛到少数 helper 或 repository。

目标：

- 业务 service 不再到处手写 `department_id` fallback。
- 展示 fallback 只处理历史数据，不参与新业务判断。
- 新业务逻辑必须优先使用 `tenant_department_id`。

验收标准：

- `department_id` 的引用只剩类型、兼容响应、兼容解析、fallback helper。
- 权限、费用、客户、项目链路不再直接以旧字段做主判断。

### 第 6 步：退场评审

进入删除旧字段评估前，必须同时满足：

- 连续一个版本周期所有 `blocker = 0`。
- admin 已完全主写 `tenant_department_id`。
- 小程序团队确认没有旧字段主写入。
- 新租户初始化不再以旧 `departments` 为主数据源。
- 旧接口调用量已记录并有处理结论。
- 已准备好迁移回滚方案和数据库备份方案。

评审通过后，才能规划：

- 停止双写旧 `employees.department_id`。
- 停止依赖 `department_post_rules.department_code`。
- 移除旧 `departments` 展示 fallback。
- 最后再评估删除旧字段和旧表。

## 不能做的事

当前阶段禁止：

- 直接删除 `departments`。
- 直接删除 `employees.department_id`。
- 直接删除 `department_post_rules.department_code`。
- 直接移除旧接口 `/department-post-rules/:department_code`。
- 让小程序端在未确认前强依赖仅新字段响应。

## 验收清单

阶段 10 每推进一步都需要验收：

- `scripts/audit-tenant-department-retirement.sh` 通过。
- `bun run api:typecheck` 通过。
- `bun run api:build` 通过。
- 涉及 admin 时，`pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- 涉及小程序时，只输出对接文档，不直接改小程序代码。

## 关联文档

- `docs/2026-05-13-tenant-department-final-migration-plan.md`
- `docs/2026-05-13-tenant-department-legacy-retirement-checklist.md`
- `docs/2026-05-13-tenant-department-retirement-audit-plan.md`
- `docs/2026-05-13-tenant-department-template-config-closure.md`
- `docs/application_integration_documentation/2026-05-13-admin-miniprogram-tenant-department-runtime-write-contract.md`
- `docs/application_integration_documentation/2026-05-13-admin-miniprogram-tenant-department-id-switch-integration.md`
- `docs/application_integration_documentation/2026-05-13-admin-tenant-department-config-integration.md`
