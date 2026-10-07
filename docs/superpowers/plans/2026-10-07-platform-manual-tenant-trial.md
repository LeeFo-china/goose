# Platform Manual Tenant Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 超管手动建户时可设置试用天数，未核验企业也可试用，到期后 7 天只读，列表可查看和延期。

**Architecture:** Supabase migration 承载来源、授权策略、临时试用身份与原子建户；现有试用记录和访问判定仍是唯一服务访问事实。Fastify controller 只校验并调用 service，repository 只执行有界 SQL/RPC；Admin 复用现有租户表单、列表和试用延期接口。

**Tech Stack:** Bun、TypeScript、Fastify、Zod 4、Supabase/PostgreSQL migration、Next.js Admin。

**Design:** `docs/superpowers/specs/2026-10-07-platform-manual-tenant-trial-design.md`

---

## 文件职责

- `supabase/migrations/20261007100000_manual_tenant_access_policy.sql`：租户来源、显式旧版访问资格回填、访问事实 RPC。
- `supabase/migrations/20261007101000_provisional_manual_tenant_trials.sql`：未核验临时身份、唯一约束及现有试用命令兼容。
- `supabase/migrations/20261007102000_atomic_manual_tenant_trial_create.sql`：手动建户和标准试用同事务；其他建户入口显式保留策略。
- `supabase/migrations/20261007103000_batch_tenant_service_access.sql`：分页租户列表的有界服务状态投影。
- `apps/api/src/services/tenant-service-access.ts` 与 `apps/api/src/repositories/tenant-service-access.ts`：统一访问优先级与新事实解析。
- `apps/api/src/schema/platform-tenants.ts`、`apps/api/src/services/platform-tenants.ts`、`apps/api/src/repositories/platform-tenants/legacy/commands.ts`：建户输入、权限及 RPC 边界。
- `apps/api/src/repositories/platform-tenants/legacy/tenants.ts`：分页后批量读取服务状态。
- `apps/admin/components/platform-tenants/*`：新建表单、租户列表状态和延期入口。

## Task 1：固定访问策略与兼容边界

**Files:** `supabase/migrations/20261007100000_manual_tenant_access_policy.sql`；`apps/api/src/repositories/tenant-service-access.ts`；`apps/api/src/services/tenant-service-access.ts`；对应的 `*.test.ts`。

- [x] 先在 `tenant-service-access.test.ts` 写失败用例：历史租户无订阅保持 `legacy`；`entitlement_required` 新租户无授权为 `service_blocked`；到期／撤销试用不回落 `legacy`；有效合同、已付款待开通及租户停用仍维持原优先级。用固定数据库时钟覆盖试用截止与 7 天宽限期截止两个边界。
- [x] 在新 migration 给 `tenants` 增加 `creation_source` 与 `service_access_policy` 约束。已有行回填 `legacy_compatible`，数据库默认保持 `legacy_compatible`，手动创建包装 RPC 显式写入 `entitlement_required`；替换 `platform_service_trial_access_facts(uuid)`，返回显式策略而非根据旧订阅缺行判断。迁移必须维持 service-role 执行权限、固定 search_path 和有界事实查询。
- [x] 在 repository Zod envelope 加入策略字段；service 判定仅在显式 `legacy_compatible` 且旧订阅未锁定时给 `legacy`。`entitlement_required` 无当前授权时返回 `service_blocked`。现有 `session`、`recovery`、`read`、`write` 路由语义不变。
- [x] 在 `apps/api` 运行 `bun test src/services/tenant-service-access.test.ts src/repositories/tenant-service-access.test.ts`，随后 `bun run api:typecheck`；确认失败用例转绿，且旧租户测试仍通过。

## Task 2：允许平台手动租户使用临时试用身份

**Files:** `supabase/migrations/20261007101000_provisional_manual_tenant_trials.sql`；`apps/api/src/repositories/service-trials.ts`；`apps/api/src/repositories/service-trial-records.ts`；`apps/api/src/services/platform-service-trials.test.ts`；相关 migration contract 测试。

- [x] 写失败的 SQL 契约和服务测试：未核验 `platform_manual` 租户可由具备 `platform.service_trial.manage` 的平台人员发放；自主申请仍要求已核验企业；其他来源未核验时拒绝；同租户不能并行拥有两个有效试用；延期、撤销、转正式都接受临时身份；现有企业级去重仍生效。
- [x] migration 将试用身份依据明确为 `verified_enterprise | provisional_tenant`。历史记录回填前者；临时记录仅 `platform_grant` 可用，以显式身份依据和 `provisional-tenant:` 命名空间区分身份键，保留既有非空身份键命令协议；既有企业索引保持不变，增加临时试用按租户和有效状态的部分唯一索引。发放、申请查询同时检查租户历史与已核验企业对应租户的历史。
- [x] 将身份依据加入内部解析，但不向 Admin 或普通租户输出企业摘要。核验后重复试用检查必须同时覆盖已核验记录及已核验租户名下的临时记录；保留原始试用事实及审计，重复发放返回业务错误，不静默撤销已生效试用；本次不新增核验流程的冲突记录机制。
- [x] 运行 `bun test apps/api/src/services/platform-service-trials.test.ts apps/api/src/repositories/service-trials.test.ts` 及新增 migration contract 测试，再运行 `bun run api:typecheck`。检查每个引用 `enterprise_identity_hash` 的 SQL 分支都不会对临时记录执行空值企业锁。

## Task 3：建户与试用发放原子化

**Files:** `supabase/migrations/20261007102000_atomic_manual_tenant_trial_create.sql`；`apps/api/src/schema/platform-tenants.ts`；`apps/api/src/services/platform-tenants.ts`；`apps/api/src/repositories/platform-tenants/legacy/commands.ts`；`apps/api/src/services/platform-tenants.test.ts`；`apps/api/src/repositories/platform-tenants/legacy/commands.test.ts`。

- [x] 先写失败用例：默认标准试用 30 天；明确选择“暂不开通”；自定义试用天数遵守当前策略；超过策略上限需 `platform.service_trial.override`；缺少 `platform.service_trial.manage` 不能开通试用；建户或试用任一步失败都不留下租户／管理员／试用；合作伙伴建户仍保留原访问策略。
- [x] 扩展 `CreatePlatformTenantSchema`，使用明确的 `trial` 判别输入：`{ enabled: false }` 或 `{ enabled: true, trial_days: number, reason: string, idempotency_key: UUIDv4 }`。旧调用方不传 `trial` 时按“暂不开通”处理，Admin 新表单默认提交 30 天试用。后端强制 7 天宽限期，不接受客户端自定义宽限天数。
- [x] 新增 `create_platform_tenant_with_trial` 包装 RPC，在同一个 RPC 事务中写入 `creation_source=platform_manual`、`service_access_policy=entitlement_required`，完成组织初始化后调用受控平台试用发放逻辑。不要让 Admin 发第二个请求补建试用。其他入口保留原 RPC 和数据库兼容默认值；普通租户更新接口不能修改来源或访问策略。
- [x] Service 在调用 repository 前校验试用权限、规则开关与 override，仍由 RPC 再校验平台操作者权限；创建响应返回试用 ID、状态及服务器计算的两个截止时间。审计保留 `tenant_create` 和试用发放事件，不写 0 元订单。
- [x] 运行上述聚焦测试、`bun run api:typecheck`、`bun run api:build`；用事务 smoke 验证失败回滚和两个建户入口。

## Task 4：租户列表批量展示真实服务状态

**Files:** `supabase/migrations/20261007103000_batch_tenant_service_access.sql`；`apps/api/src/repositories/platform-tenants/legacy/tenants.ts`；`apps/api/src/repositories/platform-tenants/legacy/shared.ts`；`apps/api/src/services/platform-tenants.ts`；`apps/admin/components/platform-tenants/platform-tenant-types.ts`；对应列表测试。

- [x] 写失败用例：分页 20/100 条时只使用一次按当前页租户 ID 的批量服务事实查询；历史兼容、未开通、试用中、宽限期、已到期、正式服务、已停用状态均正确；列表不返回试用原因或企业身份摘要。
- [x] 在 migration 中增加有界批量读取 RPC，复用单租户访问事实的数据库时钟与优先级；对 `tenant_service_trials(tenant_id, created_at DESC, id DESC)` 等相关索引核验执行计划，确有必要再通过 migration 加索引。Repository 先 `.range()` 取得当前页租户，再传最多 100 个 ID 获取投影；不得逐行 RPC 或返回全量租户。
- [x] 列表 DTO 加入 `service_access`：`mode`、`trial_id`、`trial_status`、`trial_ends_at`、`grace_ends_at`、`version`、可延期标志。平台租户读取权限可看状态；执行延期仍由试用模块权限校验。
- [x] 运行列表 repository/service 测试、`bun run api:typecheck`；大页查询必要时用 `EXPLAIN ANALYZE` 核对索引和行数。

## Task 5：Admin 新建表单和列表延期

**Files:** `apps/admin/components/platform-tenants/platform-tenant-dialog.tsx`；`apps/admin/components/platform-tenants/platform-tenants-table.tsx`；`apps/admin/components/platform-tenants/platform-tenant-types.ts`；新增局部延期对话框；相邻 `*.test.ts(x)`。

- [x] 表单默认显示“标准试用 30 天、结束后 7 天只读”，允许修改试用天数或选“暂不开通”；提交 `trial` 判别输入。建户成功后刷新列表，失败保持表单和后端错误信息。只在试用访问开关可用且具备试用管理权限时开放开通选项。
- [x] 列表增加服务状态与两个截止时间，延期入口只在 `active/grace_period` 且具备 `platform.service_trial.manage` 和 `platform.service_trial.override` 时展示。沿用现有 `POST /platform/billing/service-trials/:id/extend` 的版本、幂等键、原因和延期天数契约；成功后刷新服务端列表，不在客户端直接改截止时间。其他状态提供前往试用管理详情的查看路径。
- [x] 用已有表单测试和页面合同测试验证默认值、暂不开通、错误显示、状态文案及按钮可见性；运行 `pnpm --dir apps/admin check`。只有静态检查通过后再做浏览器 smoke。

## Task 6：迁移、回归与发布

- [x] 在独立本地数据库应用六个功能 migration，以 `supabase migration list` 核对验证目录 Local/Remote 对齐。完整历史重放受到既有数据修复 migration 的前置数据限制，具体见设计文档验证记录。破坏性回滚仅通过前向补偿 migration 恢复访问策略和函数版本，保留试用及审计历史。
- [x] 运行聚焦 API/Admin 测试、`bun run api:check`、`pnpm --dir apps/admin check`、`git diff --check`。验证试用开始、试用截止、7 天宽限期截止、延期、撤销、已付费优先、旧租户兼容、合作伙伴建户及无试用新租户。
- [x] 本地实际 SQL 创建/延期/回滚 smoke 与浏览器模拟 API smoke 通过；API 和表单在开关关闭时均禁止新开试用。
- [ ] 部署到目标环境：核对远端历史、协调 migration/API/Admin 维护窗口，检查 `PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED`；本轮不更改远端数据库或开关。
- [x] 审核 migration 执行计划、权限与服务角色边界，确认没有对 orange 工作区写入；最后提交聚焦的代码与迁移变更。

### 执行补充

- 增加 `20261007151339_manual_tenant_trial_extension_version.sql`：修复刚进入宽限期但生命周期任务未运行时的延期版本误判。
- 增加 `20261007152046_manual_tenant_trial_verified_history.sql`：核验后重复校验纳入临时身份历史。
- 状态批量读取位于独立 `tenant-service-access-batch.ts` repository，由 service 在已有分页结果上编排；单租户 RPC 和批量 RPC 共用 SQL 事实。
- SQL 回归脚本：`supabase/tests/manual_tenant_trial.sql`，所有测试写入事务回滚。
- 浏览器 smoke：默认 30 天、改为 15 天、暂不开通、宽限期延长、刷新及无浏览器异常均通过。
