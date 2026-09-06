# 租户客户线索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划默认按任务顺序执行；不要求子代理。

**Goal:** 让租户员工在微信小程序“客户线索”中查看、分配、跟进和转化现有抖音线索，与 Admin 共用数据，并建立后续渠道可复用的管理契约。

**Architecture:** 在 `marketing_leads` 和当前线索命令基础上提取通用 controller/service/repository，保留旧抖音接口作为限定来源的兼容入口。来源适配负责平台字段和预约/预算扩展，通用层负责权限、分页、负责人、跟进、转客户和并发控制。数据库事实不复制，历史物理表名首期保留。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、现有 shadcn/ui、`@gooes/domain`；orange 使用现有 Taro/React，由小程序团队实施。

**Spec:** `docs/superpowers/specs/2026-09-06-tenant-customer-leads-design.md`。

**执行状态：** 2026-09-06 四步基础工作之后，已继续实现 Task 3–5 的通用后端，并将两项 migration 应用到 api-dev 开发库，579 条 Local/Remote 对齐。新旧接口共享命令、分页与幂等记录；本地 SQL 回滚、定向 API/HTTP smoke 及远端只读查询通过，数据库类型已按实际生成结果定向同步。实际双账号并发与真机验收尚未执行，API 进程/domain 包尚未部署发布。Task 6–9 的 Admin 新界面、客户端接入和发布验收不包含在本轮；已先产出小程序交接文档。记录见 `docs/operations/evidence/2026-09-06-customer-leads.md`。Task 1–5 的实现条目已勾选，真实双端端到端验收仍按 Task 9 待办执行，不重复应用 migration。

**后续更新：** 用户继续批准后，Task 6–7 已完成代码及本地交付：新旧 Admin 共用工作台、42 条定向回归及 8 条真实浏览器/模拟后端用例通过；domain 1.20.0 本地 tarball、packed consumer、完整 JSON 示例/错误码/验收交接完成。记录见 `docs/operations/evidence/2026-09-06-customer-leads-admin-handoff.md`。没有提交/推送或远端 API/Admin 部署；没有 registry 发布；orange 未修改，Task 8–9 仍待小程序实施与正式联调。下面 Task 6–7 的勾选表示实现及本地验收，不代表远端上线。

**当前发布状态：** 上述两段保留阶段历史。功能已提交并推送到当前分支，开发环境 API/Admin 已通过 Release Dev `34016423164` 发布提交 `d1d29a09c8331863ea5b3e4d99d3e3e1208114f5`，2026-09-06 14:33:04（北京时间）发布成功。579 条迁移对齐，单个现有 Admin 账号的新旧 API/浏览器只读检查通过；新旧列表逐项 ID 相同。实际环境地址及证据见 `docs/operations/evidence/2026-09-06-customer-leads-dev-release.md`。未合并 main、未发布生产/registry、未修改 orange；Task 8 与 Task 9 的微信/双账号/远端写操作矩阵仍待执行。

---

## 工作边界与验证约定

- gooes 可修改：API、Admin、domain、migration、交接及验收文档。
- orange 只读：禁止修改、构建、生成、安装依赖和 Git 写操作；任务 8 是交给小程序团队的工作清单。
- 首期仅开放已有 `douyin_miniapp` 来源。小红书、视频号采集与 H5/平台线索纳入均不在本期。
- 不新增依赖，不搭建测试框架。遵循项目最小验证要求，复用现有回归检查，新增行为通过定向 smoke/数据库断言留下证据。
- 每个任务独立完成验证后再进入下一任务。若执行时工作区已有改动，先检查重叠；不整体暂存其他人的文件。
- 计划中的新文件名和接口是拟定契约；函数实现前必须核对最新本地定义和目标库只读 catalog，不能拿早期 migration 覆盖后续修复。

## 文件职责

| 范围 | 拟新增或调整的文件 | 职责 |
|---|---|---|
| 共享契约 | `packages/domain/src/customer-lead.ts`、`src/index.ts`、`src/permission.ts` | 来源、DTO、命令、权限目录 |
| API 边界 | `apps/api/src/controllers/tenant-customer-leads/index.ts`、`schema/tenant-customer-leads.ts` | HTTP、参数校验、响应包装 |
| 业务 | `apps/api/src/services/tenant-customer-leads.ts`、`tenant-customer-lead-access.ts`、`tenant-customer-lead-serializer.ts` | 通用编排、范围和脱敏投影 |
| 来源映射 | `apps/api/src/services/customer-lead-sources.ts` | 首期抖音映射与可选扩展，不包含采集逻辑 |
| 数据层 | `apps/api/src/repositories/tenant-customer-leads.ts`、`tenant-customer-lead-list.ts`、`tenant-customer-lead-commands.ts` | 限字段查询、批量补充摘要、RPC |
| 兼容 | 当前 `tenant-douyin-leads` controller/service/repository/schema 与 public serializer | 委托通用核心，保留旧输入输出与错误 |
| 数据库 | CLI 生成的三组新 migration | 权限、通用命令、查询与索引 |
| Admin | `apps/admin/app/(console)/customer-leads/page.tsx`、`components/customer-leads/` | 新入口及复用工作台 |
| 菜单 | `apps/admin/components/layout/menu-config.ts`、`components/roles/role-permission-display.ts` | 导航与权限名称 |
| 交接 | `docs/2026-09-06-customer-leads-miniprogram-handoff.md` | 最终接口、示例、前端改动及验收 |
| 证据 | `docs/operations/evidence/2026-09-06-customer-leads.md` | 实际命令、环境、结果、遗留问题 |

## Task 1：建立基线与锁定契约

**读取：** 根及目录 AGENTS；现有 `tenant-douyin-leads` 的 controller/schema/service/repository；`tenant-douyin-leads-public.ts`；`tenant-douyin-leads-hydration.ts`；`apps/api/src/services/access-policy.ts` 及其真实实现；现有 Admin 工作台。

- [x] 检查 `git status --short`，记录当前分支、提交和与上述文件重叠的改动。
- [x] 梳理 migration 中四种管理命令的最新定义、重载、函数 owner、GRANT、调用关系、版本触发器、来源触发器和流水摘要算法。
- [x] 阅读 `20260821105620_reject_stale_douyin_customer_preflight.sql`、`20260821105650_harden_douyin_customer_source_snapshots.sql`、`20260830110000_align_douyin_measurement_command_owners.sql`，并检索其后的替换定义。
- [x] 记录当前旧接口的成功、403、404、409 响应和命令结果字段，作为兼容基线。记录 `customer.create` 范围限制，不能只看线索 convert 权限。
- [x] 固定以下通用接口表，写入共享契约；参数沿用现有命名，避免前端再做一套字段翻译。

| Method | Path（前缀 `/tenant/customer-leads`） | 契约 |
|---|---|---|
| GET | 空路径 | `page/pageSize/status/source/assigneeId/assignment/dateFrom/dateTo/keyword`；`assignment=all/assigned/unassigned` 默认 all |
| GET | `/assignee-candidates` | 分页、关键词；使用 assign 权限 |
| GET | `/assignee-filter-options` | 分页、关键词、`includeEmployeeId`；使用 read 权限 |
| GET | `/:id` | 返回详情、版本、客户跳转能力及操作能力 |
| GET | `/:id/appointments` | 可选预约的分页列表，无预约返回标准空页 |
| GET/POST | `/:id/follow-ups` | 分页历史 / 新增跟进，预约可空 |
| POST | `/:id/assign` | `assigned_employee_id` 加版本、幂等键 |
| POST | `/:id/convert-customer` | 版本、幂等键；返回关联客户结果 |
| POST | `/:id/mark-invalid` | `reason` 加版本、幂等键 |

`assigneeId` 与 `assignment=unassigned` 同时传入返回 400。分页默认 1/20，上限沿用 page=10000、pageSize=100。列表返回 `{ list, pagination: { page, pageSize, total, totalPages } }`，外层使用 `ResponseHandler.success`。

**基线验证：**

```bash
bun run api:typecheck
bun test --cwd apps/api src/services/tenant-douyin-leads-access.test.ts
bun test --cwd apps/api src/services/tenant-douyin-leads.test.ts
bun test --cwd apps/api src/controllers/tenant-douyin-leads/index.test.ts
```

预期：退出码 0；已有失败必须记录原始错误、定位是否与本次相关，不得跳过后宣称通过。

## Task 2：共享契约与独立权限

**修改/新增：** 文件职责表中的 domain 文件；`apps/api/src/services/authorization/legacy/context-builder.ts`（仅在真实推导逻辑需要时）；角色权限展示；新 permissions migration。

- [x] 在 domain 定义 `CustomerLeadStatus`、`CustomerLeadAction`、分页 DTO、线索摘要和详情、命令输入与结果。状态保留四种，不把未分配混入状态。
- [x] 新 DTO 增加 `source/source_label/assigned_employee_id`；客户使用 `customer_id` 与 `can_view_customer`，ID 在无客户访问权限时返回 null。预约、预算和 AI 作为可选数据，不要求其他渠道提供抖音字段。
- [x] 明确命令输入（可空字段可省略，schema 规范化为 null；规范化后的类型为 `CustomerLeadFollowUpCommand`）：

```ts
export type CustomerLeadCommandInput = {
  expected_lead_version: number;
  idempotency_key: string;
};
export type CustomerLeadFollowUpInput = CustomerLeadCommandInput & {
  appointment_id?: string | null;
  follow_up_type: 'phone' | 'wechat' | 'online_meeting' | 'onsite' | 'other';
  summary: string;
  result: string;
  next_follow_up_at?: string | null;
  appointment_status?: 'confirmed' | 'completed' | 'canceled' | 'invalid' | null;
  confirmed_visit_at?: string | null;
};
```

- [x] `appointment_id=null` 时，`appointment_status/confirmed_visit_at` 必须为 null；确认预约时必须填写确认时间；复用当前字符长度和日期校验。命令体禁止额外的 `tenant_id/source/customer_id`。
- [x] 注册 `customer_lead.read/assign/follow_up/convert`，中文展示分别为查看、分配、跟进、转化客户线索。无效操作仍由 convert 控制。
- [x] CLI 生成 `20260906040943_tenant_customer_lead_permissions.sql` 并写入权限种子；参考原 migration 字段，仅为有效租户 system_admin 补授权。文件尚未应用远端。
- [x] 不复制普通角色的旧权限，不覆盖已有数据库授权。交接中要求租户管理员为需要入口的部门/员工配置新权限；保留现有 system_admin 自动全权限分支。

**验证：** `bun run --cwd packages/domain build`、`bun test ./packages/domain/src/permission.test.ts`、`bun run api:typecheck`。检查权限目录、数据库种子、系统管理员推导及展示名称一致。

## Task 3：数据库通用命令与普通跟进

**新增：** `supabase migration new tenant_customer_lead_commands` 生成的 migration。
**基于：** Task 1 锁定的最新 assign/follow_up/convert/mark_invalid 定义、来源保护和 owner 修复；不得直接修改历史 migration。

- [x] 复用现有跟进及操作流水表，首期保留物理名称。允许 `douyin_lead_follow_ups.douyin_measurement_appointment_id` 为 null；保留已有复合外键、幂等唯一约束和只追加限制。
- [x] 非空预约必须属于同租户同线索，旧接口仍要求预约；新增普通跟进与预约跟进共用同一条版本/幂等事务路径。
- [x] 提取 `assign_customer_lead`、`append_customer_lead_follow_up`、`convert_customer_lead_to_customer`、`mark_customer_lead_invalid` 核心函数。四种操作使用一致租户、有效员工、版本、来源支持范围检查；保留抖音预约联动作为来源分支。
- [x] 旧函数保持签名和限定抖音条件，委托通用核心。保留旧账本的 request hash 计算及历史 result_payload，新旧 HTTP 入口使用同一业务参数时可重放同一事实，不能因路由名或重命名产生新摘要。
- [x] 将来源校验集中在受控映射中，首期仅 `douyin_miniapp` 可进入管理核心。未来渠道注册时扩展映射及其 schema/约束；禁止把任意 `marketing_leads.source` 纳入新命令。
- [x] 转客户保留 `(tenant_id, phone)` 去重、锁定顺序、preflight 前置条件、已有客户负责人和创建权限检查。当前抖音新客户继续使用 `customers.source='douyin'`。
- [x] 无预约转化也写客户来源事实；使用 `marketing_lead_id` 作为通用关联。同一客户、同一线索、无预约来源只写一次；已有按预约去重的记录和快照保持原样，来源时间线不重复展示同一事件。
- [x] 更新来源记录 guard，使无预约来源合法且字段受限；抖音预约快照继续执行原 schema。缺电话时给出明确业务错误，不用占位电话创建客户。
- [x] 保留状态限制、记录不可变性和版本由数据库管理；若新旧命令版本冲突返回原有 409，不能静默重试写入。
- [x] `SECURITY DEFINER` 设置固定 `search_path`；函数 owner 对齐实际 `marketing_leads` owner，保留 anon/authenticated 无写命令权限，service_role 只能调用公开命令。内部核心不额外暴露绕过校验的入口。
- [x] 在 migration 注释写明锁超时、数据保留和前向回退；产生空预约记录后不能用恢复 NOT NULL 作为回退。

**定向验证场景：** 在可丢弃测试库或明确的开发验收租户执行现有 RPC 数据库检查；创建持久验收数据必须使用独立 fixture migration，禁止在远端手工 DML 修库。重点验证同幂等键同请求、同键不同请求、旧请求升级后重放、两端同时转化、部门调岗冲突、跨租户预约、无预约跟进与来源记录唯一性。实际 SQL、HTTP 请求及结果记录到证据文档。

## Task 4：分页查询与通用数据层

**新增/调整：** `tenant-customer-leads.ts`、`tenant-customer-lead-list.ts`、`tenant-customer-lead-commands.ts`；复用现有 assignee candidates/filter-options 的底层查询；`supabase migration new tenant_customer_lead_queries`；更新生成的 API database types。

- [x] 建立 `list_tenant_customer_leads` RPC：tenant 必填，支持来源、负责人、未分配、状态、日期、关键词和分页。对无可见员工返回空页，不能把空数组解释为不限制。
- [x] 查询的来源集合由服务端支持目录约束；未传 source 表示所有已启用来源，首期只有抖音。旧查询固定抖音。
- [x] count 和 list 使用完全相同条件；排序固定 `created_at DESC,id DESC`。返回白名单字段，不暴露 form_data 原文、手机号、openid、安装凭证、request_ip 等内部信息。
- [x] 对单页最多 100 个 ID 批量查询负责人、客户和预约摘要；无预约返回 null/空页，禁止逐行请求。客户可见范围在批量预取或详情阶段计算，不产生每行权限查询。
- [x] 员工选择器按有效员工和 assign 范围查询；负责人筛选器按 read 范围查询，保留历史负责人回显规则，不混用两个接口。
- [x] 优先复用现有索引；新建候选索引围绕 `(tenant_id,source,created_at,id)` 与 `(tenant_id,assigned_employee_id,created_at,id)`，依据实际查询计划决定，避免与现有部分索引重复。
- [x] 在有代表性数据的环境用只读 `EXPLAIN (ANALYZE, BUFFERS)` 检查列表、负责人过滤与关键词查询；记录数据规模、耗时与扫描量。必要时调整查询或 migration 索引，不引入缓存/队列。
- [x] repository 将数据库异常包装为 `Errors.dbError()`；响应校验失败也返回受控错误。SQL 命令返回由 service 映射，controller 不直接访问 Supabase。

**验证：** `bun run api:typecheck`；分页空页/末页、同时间戳排序、最大 100 条、source 不合法、未分配过滤、不可见负责人、候选与筛选项权限差异均通过定向 smoke。database types 只从确认的目标库生成并审查 diff，不使用根脚本里的固定项目 ID 盲目生成。

## Task 5：通用 service、HTTP 与旧接口兼容

**新增/修改：** 文件职责表中的 API/service 文件；当前 `tenant-douyin-leads` 对应实现；邻近 `TenantBaseController` 与 route decorators 只读参考。

- [x] 新 controller 继承 `TenantBaseController`，每个方法依次解析参数、取得租户上下文、调用 service、包装成功响应。使用现有装饰器自动注册模式。
- [x] 新 service 固定新权限命名，旧 service 以内部固定模式委托通用核心；模式和允许来源不能从 request body/query 传入。
- [x] 列表、详情、跟进、预约均按 read 范围过滤；分配、跟进、转化按动作范围再次验证目标线索。未知和不可见 ID 同样返回 404。
- [x] 复用既有客户访问策略，详情只向可访问客户的员工提供跳转 ID；命令成功回执中的 customer ID 同样受此投影约束，不因转换成功扩大客户读取范围。
- [x] 详情提供 `actions`，键为 `assign/follow_up/convert/mark_invalid`，值为 `{ enabled, reason }`。结合当前状态、动作权限及新建客户权限计算；这是前端提示，提交仍需完整复核。
- [x] 新错误使用 `CUSTOMER_LEAD_*` 语义（not found、version conflict、idempotency conflict、assignee scope conflict、customer preflight conflict），旧入口保持 `DOUYIN_LEAD_*`。不在错误里泄露已有客户的姓名或电话。
- [x] 旧请求和旧响应继续通过严格 Zod 校验；通用新增 ID、source、actions 字段只能出现在新 DTO 中，不直接加入旧 strict schema。
- [x] 保留租户停用、服务只读/写入规则和原 `/tenant/*` 服务访问分类；新入口不自动更改试用套餐能力。
- [x] 验证微信员工 auth 会话、Admin 会话均可访问；抖音访客、微信客户、未绑定员工和其他租户会话不能获得管理能力。

**验证命令：**

```bash
bun run api:typecheck
bun run api:build
bun test --cwd apps/api src/services/tenant-douyin-leads-access.test.ts
bun test --cwd apps/api src/services/tenant-douyin-leads.test.ts
bun test --cwd apps/api src/controllers/tenant-douyin-leads/index.test.ts
bun test --cwd apps/api src/services/tenant-douyin-leads-public.test.ts
bun run check:permission-boundaries
```

预期全部退出 0。再运行任务 9 的实际 API smoke；mock 通过不能替代数据库事务和微信鉴权证据。

## Task 6：Admin 通用工作台

**新增：** `apps/admin/app/(console)/customer-leads/page.tsx`。
**提取/修改：** 当前 `components/douyin-miniapp/leads-workbench*.ts*`、`leads-assignee-options.ts`、`leads-page-loaders.ts` 中可复用工作台到 `components/customer-leads/`；菜单及角色权限展示。

- [x] 实施时按项目 admin-design/shadcn 约定复用现有 Table、Sheet、Dialog、FormSelect 和状态提示，不引入另一套 UI。
- [x] 用明确的工作台配置区分通用/旧入口的标题、API 路径、权限和响应适配；共享交互和状态管理，旧文件保留薄导出，不能复制整个组件。
- [x] 新 `/customer-leads` 使用新权限显示“客户线索”，增加来源和分配状态过滤；旧 `/douyin-miniapp/leads` 保留旧权限及固定来源。
- [x] 普通跟进默认不关联预约，存在预约时可选择；只有选择预约才显示状态/确认时间。无预约不能出现“必须选择量房”的阻断。
- [x] 详情展示来源、负责人及可访问的客户链接；保留预算、AI、预约和分页历史。手机号继续脱敏。
- [x] 复用现有提交 gate、幂等意图、最新请求控制和“命令已成功，只重试刷新”的状态；列表刷新失败不能再次发出已成功的变更。
- [x] 改派后丢失详情权限视为正常权限变化，关闭详情并刷新；不要把操作成功显示成失败。

**验证：** `bun run --cwd apps/admin typecheck`、`bun run --cwd apps/admin check:file-size`；复用 `leads-workbench.test.ts`、`leads-workbench-paging.test.ts` 及旧 page 检查。静态通过后浏览器检查新旧入口、权限缺失、空页、分页、过滤、四种动作、刷新失败重试。

## Task 7：共享包与小程序交接

**产物：** `docs/2026-09-06-customer-leads-miniprogram-handoff.md`；构建并按现有 domain 包交付流程产出版本化包。

- [x] 用最终代码生成接口表、请求响应例子和错误码表；明确 Bearer 员工会话、禁止传 tenant_id、1/20 默认分页和 100 上限。
- [x] 给出标准成功分页、空页、详情、分配、无预约跟进、预约跟进、转客户/已关联客户、409、403、404 的完整 JSON 样例。
- [x] 说明 `source` 与 `attribution.source_type` 区别、客户 ID 条件可见、action disabled 原因和新旧权限边界。
- [x] 写明同一意图的幂等键生命周期、网络结果未知时的原请求重试、确认成功后只刷新、409 刷新后重新确认。
- [x] 更新共享包版本并构建：`bun run --cwd packages/domain build`、`bun run --cwd packages/domain verify:packed-consumer`。按 `packages/domain/README.md` 的实际打包流程提供包路径/版本，不自动修改 orange 的本地 tgz 依赖。
- [x] 提供小程序团队任务 8 和验收矩阵，标明后端联调环境、实际提交、migration 对齐结果与未验证项。

## Task 8：微信小程序团队实施（orange，只交接）

**已只读核对的复用点：** `src/app.config.ts` 的 `packageCustomers`；`src/pages/index/homeModel.tsx` 的员工工作台；`src/services/permission.ts` 的 `/auth/me/permissions`；`src/services/customer.ts` 的 API 访问模式。

**拟由小程序团队新增：**

- `src/services/customer_lead.ts`：通用 API 封装、分页和错误类型。
- `src/packageCustomers/pages/customerLeads/index.tsx`：客户线索列表及筛选。
- `src/packageCustomers/pages/customerLeadDetail/index.tsx`：详情、跟进与操作。
- `src/pages/index/homeCustomerLeadAction.ts`：工作台入口配置，接入 `homeModel.tsx`。

- [ ] 在现有 `packageCustomers` 注册页面，避免增加主包体积；更新 domain 包依赖并执行该仓库自己的包一致性检查。
- [ ] 员工工作台按 `customer_lead.read` 展示入口，不受 `customer.read` 有无直接控制；访客/客户身份不显示。
- [ ] 列表支持来源、状态、负责人、未分配、时间和搜索；下拉刷新第一页、触底加载下一页，过滤变化重置分页。
- [ ] 详情与员工选择器按服务端分页加载；四种动作使用后端 action 能力和命令契约，转客户后仅在允许时跳 `/packageCustomers/pages/customerDetail/index`（参数沿该页现有实现）。
- [ ] 处理断网重试、双击、409、改派后 404、角色权限变化与租户停用；切换身份/租户后清除旧线索数据和待提交意图，防止迟到响应写回新会话。
- [ ] 小程序团队在 orange 执行自己的 typecheck、domain 包检查、微信构建和真机验证；gooes agent 不代执行任何会改变 orange 的命令。

## Task 9：迁移发布与双端验收

- [x] 开发目标 api-dev 已通过受控配置核对，579 条迁移对齐，本次发布无待应用 migration；不混入无关文件、不输出敏感连接信息。
- [x] 最终合并为两项 migration，此前已预演并应用开发库，证据见后端记录；本轮只复查，不重复应用，不 relink。其他环境需独立确认与预演。
- [x] 应用后及发布前均用同一开发 direct 目标执行 migration list；发布流程也确认完整 Local/Remote 集合对齐。修复仍须追加 migration。
- [x] 开发 API/Admin 已通过现有 Release Dev 按 API 健康检查 → Admin 顺序发布；整体发布后新旧线索专用只读 smoke 通过。未向发布流程增加线索专用门禁，未执行远端业务写入。
- [ ] 配置小程序验收角色的新权限并完成双端联调；普通角色不自动授权，微信发布以真机证据为完成条件。

| 验收场景 | 必须观察到的结果 |
|---|---|
| 抖音提交现有线索 | Admin 与微信看到同一 lead ID，来源为抖音小程序 |
| 新权限不存在但有旧权限 | 旧入口正常，新入口不可用；不会扩大授权 |
| all/department/self | 列表、详情、操作及候选员工均符合范围 |
| 未分配线索 | all 可见可派；department/self 不因筛选而获得公海访问 |
| 跨租户 ID、员工、预约 | 无数据泄露、无写入；详情按 404 处理 |
| 同步改派或员工调岗 | 过时请求冲突，不把线索派到越权目标 |
| 无预约普通跟进 | 成功，跟进可分页读取，版本更新一次 |
| 预约跟进与确认时间 | 原状态机有效，跨线索预约被拒绝 |
| 新手机号转客户 | 创建潜在客户，负责人正确，写来源事实 |
| 同租户同手机号已有客户 | 关联已有客户，不改变原负责人，重复点击不新增 |
| 无 customer.create 权限 | 需要创建时拒绝；已有客户关联沿原规则处理 |
| 无 customer.read 范围 | 不返回可跳转客户 ID，不借线索入口读取客户详情 |
| Admin/微信并发命令 | 版本冲突可恢复，不静默覆盖 |
| 新旧入口幂等重放 | 同一命令只产生一次业务效果，旧历史请求仍可重放 |
| 非法同键不同请求 | 409，不新增跟进或客户来源 |
| 已转客户标无效/无效转客户 | 保留原状态禁止规则 |
| 成功后刷新失败 | 可重试读取，不重复提交命令 |
| 租户/身份切换 | 不展示上一会话数据，不提交上一会话意图 |
| H5、平台线索及未知 source | 不意外进入首期客户线索列表 |
| 迁移与旧链路 | 旧抖音提交、预约、跟进、转化均正常，Local/Remote 对齐 |

- [ ] 将每项的实际结果、环境、版本及证据写入 `docs/operations/evidence/2026-09-06-customer-leads.md`。未验证的小程序结果明确标记未验证，不能仅凭后端构建宣称双端完成。
- [ ] 回退先关闭新入口或回退前端版本，保留新数据；数据库仅前向修复。不得删除空预约跟进、来源或幂等流水以迁就旧约束。

## 交付检查与顺序

依赖顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 小程序团队 8 → 双端 9。任务 9 的 migration 预演/开发环境应用需在任务 3–5 的数据库验证期间执行，正式发布再复核一次目标与待执行集合。

- [x] 后端开发联调可用：任务 1–5、静态检查、本地事务/权限 smoke、开发 migration 对齐及发布后只读 API 检查完成；不等于双端验收完成。
- [x] Admin 开发联调可用：任务 6 完成，新旧入口本地验证及开发环境发布后浏览器只读检查通过。
- [x] 交接材料齐全：任务 7 包、示例、权限说明和验收表完整，已登记开发 API 基地址与实际发布提交。
- [ ] 微信功能完成：小程序团队完成任务 8，任务 9 双端证据齐全。

每一阶段单独审查 diff 和最小验证；需要提交时按明确任务文件逐项暂存，使用 `feat(customer-leads): ...` 等 Conventional Commit，禁止 `git add -A` 纳入无关改动。
