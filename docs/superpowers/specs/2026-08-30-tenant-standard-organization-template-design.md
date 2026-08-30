# 新租户标准组织与权限模板设计

## 背景

当前新租户使用 `default_decoration_company` 模板初始化部门、岗位、角色、管理员和权限。现有实现存在两个问题：

- 平台直接创建租户走 TypeScript 多步写入，入驻审批走数据库 RPC，两套逻辑已经发生漂移。
- 当前模板只提供 4 个角色，全部标准岗位默认启用，不能直接表达装修公司的常用组织和岗位关系。

2026 年 8 月 29 日对生产租户“固始晴天装饰工程有限公司”进行了只读核对。该租户有 7 个实际启用部门、20 条有效部门岗位关系、11 个角色、0 条员工级权限覆盖。它可以作为业务样本，但不能直接复制：其中有 2 个随机编码岗位、若干随机编码角色、2 个零权限角色，并包含员工和历史运行数据。

本设计把该租户的有效组织经验整理成稳定、可版本化、可审计的新租户标准模板，而不是制作数据库快照。

## 目标

- 新租户创建后立即具备装修公司的常用部门、岗位关系和业务角色。
- 初始管理员拥有当前租户全部有效业务权限，但绝不获得 `platform.*` 平台权限。
- 平台直接创建和入驻审批共用同一套初始化规则。
- 模板有明确版本，初始化可追踪、可验证、可受控升级。
- 不复制员工、手机号、项目、客户、业务数据或员工级权限覆盖。

## 非目标

- 首期不修改任何现有租户，包括样本租户。
- 首期不提供现有租户“一键套用模板”或自动升级模板功能。
- 不把样本租户中的自定义编码、人员分工和历史权限记录原样复制。
- 不新增租户模板编辑器、模板市场或多行业模板选择界面。

## 方案选择

### 采用：版本化规则模板与统一数据库命令

使用现有 `tenant_templates` 和 `tenant_template_applications` 记录模板定义与应用结果。新增 `default_decoration_company` 的 `2026.08.30` 版本，并由一个数据库事务命令完成新租户创建和模板初始化。入驻审批在自身事务中调用同一个初始化函数。

优点：两个入口共用一套规则，初始化具有事务边界，模板应用可审计，后续可以通过新版本演进。

### 不采用：复制样本租户数据库记录

实现快，但会复制随机编码、过时权限、人员信息和运行数据，无法稳定升级，也难以证明权限边界正确。

### 不采用：继续维护 TypeScript 与 SQL 两套初始化

改动较小，但当前已经发生权限过滤和模板内容漂移。继续双写会让每次新增部门、岗位或权限都需要同步两份实现。

## 模板版本

- 模板代码：`default_decoration_company`
- 新版本：`2026.08.30`
- 业务名称：`装修公司标准组织模板`
- 旧版本 `2026.05.10` 保留历史记录，不删除应用记录。
- 新租户入口显式使用 `2026.08.30`，不通过“查询最新一条”决定版本，避免部署顺序改变行为。

`tenant_templates.payload` 必须记录以下快照：

- 42 个标准部门及默认启用状态。
- 标准岗位目录及默认启用状态。
- 20 条业务部门岗位关系和 1 个管理员岗位关系。
- 11 个稳定角色及精确权限范围。
- 模板来源说明和版本发布时间。

运行时初始化以 migration 中的确定性 SQL 配置为准，`payload` 用于审计和展示，两者由 migration 合同测试校验一致。

## 标准部门

继续为新租户建立完整的 42 个标准部门目录，方便租户后续启用，但默认只启用以下 7 个部门：

| 顺序 | 部门编码 | 默认名称 |
| --- | --- | --- |
| 1 | `EXEC_OFFICE` | 总裁办/总经理办公室 |
| 2 | `MARKETING` | 市场部 |
| 3 | `DESIGN` | 设计部 |
| 4 | `PROJECT` | 工程部 |
| 5 | `FINANCE` | 财务部 |
| 6 | `SELF_MEDIA` | 自媒体部 |
| 7 | `CUSTOMER_SERVICE` | 客服部 |

其余标准部门写入 `tenant_departments` 但设为未启用。模板不创建租户自定义部门。

## 标准岗位与部门岗位关系

完整标准岗位目录继续写入租户岗位表，但只有下列业务岗位和 `SYSTEM_ADMIN` 默认启用。其他岗位默认停用，租户以后可自行启用。

| 部门 | 岗位编码 | 对用户显示 |
| --- | --- | --- |
| `EXEC_OFFICE` | `GENERAL_MANAGER` | 总经理 |
| `EXEC_OFFICE` | `SYSTEM_ADMIN` | 系统管理员（管理员专用） |
| `MARKETING` | `SALES_CONSULTANT` | 销售专员 |
| `MARKETING` | `MARKETING_MANAGER` | 市场经理 |
| `DESIGN` | `DESIGN_DIRECTOR` | 设计总监 |
| `DESIGN` | `CHIEF_DESIGNER` | 主案设计师 |
| `PROJECT` | `ENGINEERING_DIRECTOR` | 工程总监 |
| `PROJECT` | `CONSTRUCTION_SUPER` | 工程监理 |
| `PROJECT` | `HYDROPOWER_FOREMAN` | 水电工长 |
| `PROJECT` | `TILE_FOREMAN` | 瓦工工长 |
| `PROJECT` | `CARPENTRY_FOREMAN` | 木工工长 |
| `PROJECT` | `PAINT_FOREMAN` | 油工工长 |
| `PROJECT` | `MAINTENANCE_WORKER` | 维修工 |
| `FINANCE` | `FINANCE_ACCOUNTANT` | 财务专员 |
| `FINANCE` | `FINANCE_MANAGER` | 财务经理 |
| `SELF_MEDIA` | `OPERATIONS_DIRECTOR` | 运营总监 |
| `SELF_MEDIA` | `NEW_MEDIA_OPERATOR` | 新媒体运营 |
| `SELF_MEDIA` | `VIDEO_EDITOR` | 视频剪辑 |
| `SELF_MEDIA` | `LIVE_STREAM_OPERATOR` | 直播运营 |
| `CUSTOMER_SERVICE` | `CUSTOMER_SERVICE_MANAGER` | 客服经理 |
| `CUSTOMER_SERVICE` | `CUSTOMER_SERVICE` | 客服专员 |

样本租户的两个随机岗位不进入模板：

- 自定义“销售专员”使用标准 `SALES_CONSULTANT`，通过部门岗位关系的别名显示“销售专员”。
- 自定义“财务专员”使用标准 `FINANCE_ACCOUNTANT`，通过部门岗位关系的别名显示“财务专员”。

初始化管理员归属 `EXEC_OFFICE`，岗位为 `SYSTEM_ADMIN`。`SYSTEM_ADMIN` 对应第 21 条管理员岗位关系，仅用于管理员档案，不作为普通业务岗位提供给批量分配流程。

## 标准角色

模板创建以下 11 个稳定角色。角色编码是系统契约，不使用随机编码。

| 角色编码 | 名称 | 用途 |
| --- | --- | --- |
| `system_admin` | 系统管理员 | 新租户初始管理员 |
| `employee_base` | 员工基础角色 | 无明确业务岗位时的最小基础权限 |
| `business_manager` | 业务经理 | 管理市场客户、线索和项目转化 |
| `salesperson` | 业务员 | 维护本人客户、线索和项目 |
| `design_manage` | 设计主管 | 管理设计部门项目和施工流程 |
| `designer` | 设计师 | 维护本人参与的项目和日志 |
| `engineering_manager` | 工程部主管 | 管理工程项目、流程和验收 |
| `construction_supervisor` | 工程监理 | 执行项目流程、日志和验收 |
| `construction_worker` | 施工人员 | 执行本人施工节点和日志 |
| `finance_base` | 财务基础角色 | 财务核算、收支、预算和报表 |
| `cashier` | 出纳员 | 收付款和应收账款操作 |

保留 `employee_base`、`finance_base` 和 `design_manage` 编码，因为既有工作流与权限逻辑引用这些稳定编码。

岗位与权限角色保持独立。当前系统没有“员工选择岗位后自动继承权限角色”的通用数据模型，本期不新增隐式授权规则。模板只创建岗位和角色；除初始管理员外，不创建 `employee_roles`。租户新增员工时仍由管理员显式选择角色，避免岗位名称变化或一人多岗造成越权。后续若要降低分配成本，应单独设计“岗位推荐角色”，默认只做推荐，不直接授权。

## 权限规则

### 系统管理员

`system_admin` 在初始化时动态获得所有满足以下条件的权限：

- `permissions.status = 'active'`
- `permissions.code NOT LIKE 'platform.%'`

这使以后新增租户业务权限时，新创建租户可自动获得该权限，同时阻止租户管理员获得平台超管权限。migration 合同测试必须断言 SQL 中存在平台权限排除条件。

### 基础与业务角色

非管理员角色使用显式权限清单，不按模块模糊授权。每条权限同时固定 `access_scope`。权限不存在或已停用时，初始化必须失败，不能静默跳过，否则模板应用记录会与真实权限不一致。

权限基线如下：

| 角色 | `all` | `department` | `self` |
| --- | --- | --- | --- |
| `employee_base` | 无 | 无 | `dashboard.read`, `employee.read`, `expense_request.create`, `expense_request.read`, `expense_request.submit`, `task_center.read` |
| `business_manager` | `customer.assign_owner`, `project.read` | `customer.create`, `customer.phone.call`, `customer.phone.copy`, `customer.phone.view`, `customer.read`, `customer.update`, `employee.read`, `expense_request.approve_manager`, `expense_request.read`, `marketing_lead.read`, `marketing_lead.update`, `marketing_page.create`, `marketing_page.delete`, `marketing_page.publish`, `marketing_page.read`, `marketing_page.update`, `project.create`, `project.delete`, `project.update` | `dashboard.read`, `expense_request.create`, `expense_request.submit`, `project_acceptance.read`, `task_center.read` |
| `salesperson` | 无 | 无 | `customer.create`, `customer.phone.call`, `customer.phone.view`, `customer.read`, `customer.update`, `dashboard.read`, `expense_request.create`, `expense_request.read`, `expense_request.submit`, `marketing_lead.read`, `marketing_lead.update`, `marketing_page.read`, `project.create`, `project.delete`, `project.read`, `project.update`, `task_center.read` |
| `design_manage` | `project_acceptance.read` | `expense_request.approve_manager`, `expense_request.read`, `project.read` | `dashboard.read`, `expense_request.create`, `expense_request.submit`, `project_procedure.adjust`, `project_procedure.assign`, `project_procedure.read`, `task_center.read` |
| `designer` | 无 | 无 | `dashboard.read`, `expense_request.create`, `expense_request.read`, `expense_request.submit`, `project.read`, `project.update`, `project_log.create`, `project_procedure.read`, `project_acceptance.read`, `task_center.read` |
| `engineering_manager` | `project_acceptance.manage`, `project_acceptance.reject`, `project_acceptance.review`, `project_acceptance.submit`, `project.read`, `project.update` | `expense_request.approve_manager`, `expense_request.read`, `project_acceptance.create`, `project_acceptance.read`, `project_log.create`, `project_procedure.adjust`, `project_procedure.assign`, `project_procedure.read` | `customer.phone.call`, `customer.phone.view`, `dashboard.read`, `employee.read`, `expense_request.create`, `expense_request.submit`, `project_acceptance.update_own`, `task_center.read` |
| `construction_supervisor` | 无 | `project_acceptance.create`, `project_acceptance.submit`, `project_acceptance.update_own`, `project.read` | `dashboard.read`, `expense_request.create`, `expense_request.read`, `expense_request.submit`, `project_acceptance.read`, `project_log.create`, `project_procedure.adjust`, `project_procedure.assign`, `project_procedure.complete`, `project_procedure.read`, `project.update`, `social_video_transcription.create`, `social_video_transcription.manage`, `task_center.read` |
| `construction_worker` | 无 | 无 | `project_log.create`, `project_procedure.assignee`, `task_center.read` |
| `finance_base` | `expense_request.approve_finance`, `expense_request.pay`, `expense_request.read`, `finance.budget.manage`, `finance.budget.view`, `finance.closing.manage`, `finance.closing.read`, `finance.cost-allocation.manage`, `finance.cost-category.manage`, `finance.cost-category.view`, `finance.dashboard.view`, `finance.expense.pay`, `finance.expense.review`, `finance.ledger.view`, `finance.payment.confirm`, `finance.payment.create`, `finance.receivable.manage`, `finance.receivable.view`, `finance.reconciliation.manage`, `finance.reports.export`, `finance.reports.read`, `finance.view`, `project_acceptance.read`, `project.read`, `project_referral.manage`, `project_referral.read`, `wechat_pay.notify.read`, `wechat_pay.order.read` | 无 | `dashboard.read`, `expense_request.create`, `expense_request.submit`, `task_center.read` |
| `cashier` | `expense_request.approve_finance`, `expense_request.pay`, `expense_request.read`, `finance.expense.pay`, `finance.expense.review`, `finance.ledger.view`, `finance.payment.create`, `finance.receivable.manage`, `finance.receivable.view`, `finance.view` | `task_center.read` | `dashboard.read`, `finance.budget.view`, `finance.cost-allocation.manage`, `finance.cost-category.manage`, `finance.cost-category.view`, `finance.dashboard.view` |

模板不创建 `employee_permission_overrides`。员工级覆盖继续只用于租户后续的个别授权。

## 初始化架构

### 规范化初始化函数

通过 migration 更新 `initialize_default_decoration_tenant(...)`，让它成为模板初始化的唯一实现。该函数：

1. 校验模板版本、租户状态和管理员输入。
2. 写入完整部门目录并启用 7 个默认部门。
3. 写入完整岗位目录，启用精选岗位并建立部门岗位关系。
4. 写入 11 个稳定角色及其权限。
5. 创建初始管理员并绑定 `EXEC_OFFICE`、`SYSTEM_ADMIN` 和 `system_admin`。
6. 写入 `tenant_template_applications`，记录计数、管理员和模板版本。
7. 返回结构化初始化结果。

函数只允许 `service_role` 执行。数据库函数内部设置固定 `search_path`，使用限定表名，避免调用者改变解析路径。

### 平台直接创建租户

新增原子命令 `create_tenant_with_default_template(...)`：在一个数据库事务中创建租户，再调用规范化初始化函数。Service 负责权限校验、输入校验、调用 Repository 和写审计日志；Repository 只调用 RPC 并解析结果。

原 TypeScript 的 `upsertDefaultDepartments`、`upsertDefaultPosts`、`upsertDefaultRoles`、`grantAllPermissionsToRole` 等多步初始化实现删除，避免继续形成第二套规则。

### 入驻审批

`approve_tenant_onboarding_application(...)` 保留现有审批事务，但调用同一个 `initialize_default_decoration_tenant(...)`。审批状态、租户创建、管理员创建和模板初始化仍在一个事务中完成。

两个入口都必须返回 `template_code = default_decoration_company` 和 `template_version = 2026.08.30`。

## 幂等、冲突与错误

- `tenant_template_applications` 继续以租户、模板代码和模板版本唯一约束防止重复应用。
- 同一租户、同一版本的完全相同重试返回已记录结果，不重复创建管理员或角色关系。
- 已有同版本应用记录但管理员身份或关键输入不同的请求按状态冲突处理，不复用旧结果。
- 新租户若已存在同编码但结构冲突的部门、岗位或角色，函数抛出稳定业务错误 `TENANT_TEMPLATE_STATE_CONFLICT`。
- 模板引用的权限缺失或停用时抛出 `TENANT_TEMPLATE_PERMISSION_MISSING`，整个事务回滚。
- 管理员手机号冲突继续在 Service 预检查，并由数据库唯一约束承担最终并发保护。
- Repository 将 RPC 错误映射到 `error-factory.ts` 的业务错误或数据库错误；Controller 不直接处理数据库异常。
- 不通过判空、跳过缺失权限或吞异常的方式让初始化“部分成功”。

## 现有租户边界

上线 migration 只能新增模板版本、函数和命令，不能批量更新现有租户的以下数据：

- `tenant_departments`
- `posts`
- `department_post_rules`
- `roles`
- `role_permissions`
- `employee_roles`
- `employee_permission_overrides`

现有 `tenant_template_applications` 保持原版本。详情页必须按应用记录展示实际版本，不能把旧租户显示为已应用新模板。

## 数据库与类型变更

所有数据库改动通过单一 migration 纳入版本控制，包含：

- 插入 `default_decoration_company / 2026.08.30` 模板记录。
- 更新规范化初始化函数。
- 新增平台直接创建租户的原子命令。
- 更新审批 RPC 对新模板版本的调用和返回。
- 设置函数权限、注释和固定 `search_path`。

应用 migration 后重新生成或手工同步项目现有 Supabase 类型文件，不能猜测 RPC 类型。

## 验证与验收

### 静态与合同测试

- migration 合同测试验证 42 个部门中恰好 7 个默认启用。
- 验证精选业务岗位、20 条业务部门岗位关系和 1 条 `SYSTEM_ADMIN` 管理员岗位关系。
- 验证 11 个稳定角色与权限范围完全匹配设计表。
- 验证 `system_admin` 排除所有 `platform.*` 权限。
- 验证两个创建入口都调用同一个初始化函数和同一模板版本。
- 验证旧 TypeScript 多步初始化不再被创建流程调用。
- 验证现有租户表没有批量更新语句。

### 开发库 smoke

在开发库创建两个测试租户：一个走平台直接创建，一个走入驻审批。逐项核对：

- 两个租户模板版本均为 `2026.08.30`。
- 默认启用部门、岗位关系、角色和权限完全一致。
- 初始管理员可登录并拥有租户业务权限。
- 初始管理员没有任何 `platform.*` 权限。
- 重放相同初始化请求不会产生重复员工、角色或应用记录。
- 任一步骤失败时租户创建事务整体回滚。

最后运行 API 相关测试、类型检查和构建，并使用 `supabase migration list` 验证 Local/Remote 对齐。

## 发布与回滚

- 发布顺序：应用 migration，部署兼容新 RPC 的 API，执行开发 smoke，再进入生产发布。
- 生产发布后只影响此后创建的新租户。
- 不回滚已经成功初始化的新租户数据，避免删除租户正在使用的组织和权限。
- 如需停止使用新模板，通过后续 forward migration 停用 `2026.08.30`，并将新租户入口显式切回旧版本或修复后的新版本。
- API 回滚前必须确认旧 API 不会调用已变化签名的 RPC；函数签名在滚动发布期间保持兼容。

## 后续阶段

现有租户模板升级属于独立项目。后续若实施，应先提供差异预览、冲突处理和逐项选择，不能直接覆盖租户自定义部门、岗位、角色或权限。
