# 租户管理员登录手机号变更 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 按依赖推进；独立认证、数据库测试及页面由不同工作单元负责，公共认证文件不并行修改。

**Goal:** 超管验证新手机号后，为同一租户管理员变更登录号码，保留身份与历史记录，并使旧后台会话失效。

**Architecture:** 沿用 controller/service/repository 分层，以数据库命令保证验证码消费、员工更新和审计原子性。复用现有短信通道、号码锁及凭证版本，补齐租户后台请求验证；UI 通过独立详情页操作调用新接口。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、现有 shadcn/ui、Bun test 与 Playwright。无新依赖。

---

设计依据：`docs/superpowers/specs/2026-10-08-tenant-admin-login-phone-change-design.md`。用户连续“下一步”后进入计划阶段；仍采用新号短信验证方案。实施与验证进度见 `docs/operations/evidence/2026-10-08-tenant-admin-phone-change.md`；未勾选发布项不代表已上线。

## 已核对的实现事实

1. `admin-auth.ts` 按 `employees.phone` 找唯一员工，以员工 `user_id` 签发自有 JWT；账号未绑定时才创建认证账号。未找到此链路调用 Supabase `signInWithOtp`、`verifyOtp` 或 `refreshSession`。
2. 当前租户后台 JWT 已包含 `admin_auth_version`，但每次请求的数据库版本校验主要在平台控制器生效。只修改版本不能撤销普通租户后台请求。
3. `20260509143000_tenant_scope_core_unique_indexes.sql` 已移除员工手机号全局唯一索引，当前为租户内唯一。不能把此约束当成跨租户号码冲突保护。
4. `20260714220000_create_tenant_onboarding_approval_rpc.sql` 已建立 `lock_tenant_onboarding_employee_phones(text[])` 和员工号码变更触发器；锁目前围绕 active 员工，不足以单独保证本功能的所有状态冲突要求。
5. 短信公共服务只返回发送成功和冷却时间，不返回预留记录 ID，不能在发送后通过“取最新验证码”关联变更对象。
6. 手机号多身份选择会重新检查员工当前号码；仍需验证发现候选到签发身份之间与换号并发的行为。

## 固定业务与接口契约

入口：租户详情 → 当前管理员 → 变更登录手机号。只允许平台超管操作。目标为租户内有效 `system_admin` 员工；员工状态 active，租户未归档。暂停或服务到期不妨碍超管纠正号码，也不恢复服务。

| 方法 | 路径 | 请求与结果 |
| --- | --- | --- |
| GET | `/platform/tenants/:id/admins` | `page=1&pageSize=20`，最多 100；当前管理员、版本、脱敏号码、绑定标记和操作能力 |
| POST | `/platform/tenants/:id/admins/:employeeId/phone-change/send-code` | `new_phone,expected_version,idempotency_key`；返回 `challenge_id,expires_at,cooldown_seconds` |
| POST | `/platform/tenants/:id/admins/:employeeId/phone-change/confirm` | `new_phone,expected_version,challenge_id,code,reason,same_person_confirmed,idempotency_key`；返回 `employee_id,phone_masked,version,changed_at,idempotent` |

前端不提交操作者 ID；controller 从已验证的超管会话取得。旧号码由挑战的服务端快照绑定，不接受前端伪造旧号码。任何列表必须真实分页，不在获取全量后切片。

验证码固定独立场景 `tenant_admin_phone_change`，6 位，5 分钟，发送冷却 60 秒，最多 5 次错误尝试；同一员工重新发送即废弃旧挑战。保留现有手机号/IP/设备频控，并加员工维度冷却，避免轮换新号绕过。

错误使用 `Errors.business`/`Errors.unauthorized`/`Errors.dbError`，不直接抛普通 Error。新业务码前缀 `TENANT_ADMIN_PHONE_`，分别为 `CONFLICT`、`VERSION_CONFLICT`、`TARGET_UNAVAILABLE`、`CHALLENGE_INVALID`、`CODE_INVALID`、`CODE_EXHAUSTED`、`IDEMPOTENCY_CONFLICT`；旧会话使用现有 `ADMIN_SESSION_REVOKED`。

## 文件职责

新增文件按下列名字创建，公共文件只增加集成点；单个 API 文件不超过 500 行。

| 文件 | 职责 |
| --- | --- |
| `apps/api/src/schema/platform-tenant-admin-phones.ts` | 路由参数与表单校验 |
| `apps/api/src/controllers/platform-tenant-admin-phones/index.ts` | 三个 HTTP 入口、超管上下文、响应包装 |
| `apps/api/src/services/platform-tenant-admin-phones.ts` | 列表、发送、确认与错误映射 |
| `apps/api/src/repositories/platform-tenant-admin-phones.ts` | 分页查询、挑战及变更 RPC、严格结果解析 |
| `apps/api/src/repositories/employee-admin-sessions.ts` | 按 user_id 读取最小员工安全快照，最多 2 行以检测歧义 |
| `apps/api/src/services/employee-admin-sessions.ts` | 自有后台 JWT 与数据库凭证版本匹配 |
| `apps/admin/components/platform-tenants/platform-tenant-admins-card.tsx` | 分页展示当前管理员 |
| `apps/admin/components/platform-tenants/platform-tenant-admin-phone-dialog.tsx` | 号码变更表单、短信倒计时和错误状态 |
| `apps/admin/components/platform-tenants/platform-tenant-admin-phone-state.ts` | 挑战失效、重试幂等键等表单状态逻辑 |
| `supabase/tests/tenant_admin_phone_change.sql` | 原子提交、失败回滚、权限、幂等 smoke |
| `scripts/tenant-admin-phone-change-concurrency.ts` | 仅本地隔离库的多连接并发检查 |

测试文件与实现同目录，使用 `.test.ts`。前端端到端文件为 `apps/admin/e2e/tenant-admin-phone-change.spec.ts`、`tenant-admin-phone-mock-backend.mjs` 和 `apps/admin/playwright.tenant-admin-phone.config.ts`。

## Task 1：建立身份与会话回归基线

**Files:** 新增 `apps/api/src/services/admin-auth-phone-change.test.ts`、`apps/api/src/services/phone-identity-login/phone-change.test.ts`、`apps/api/src/plugins/auth/tenant-admin-session.test.ts`；阅读 `admin-auth.ts`、`utils/jwt.ts`、`phone-identity-login/bindings.ts`、`plugins/auth/legacy-plugin.ts`。

- [x] 创建隔离 worktree，记录起点提交；复用安装的依赖，不新增包。不改 orange。
- [x] 使用两个租户、两个员工、一个同号客户和独立超管的合成夹具。生产手机号、验证码、认证账号不得进入夹具。
- [x] 建立四类令牌测试：租户 admin_web、平台 admin_web、微信员工、客户；覆盖版本匹配/不匹配、无版本和重复 user_id 映射。
- [x] 通过 Fastify inject 注册真实 auth plugin 和一条业务测试路由，证明当前旧租户令牌仍能进入 handler；以 handler 调用次数为断言，不仅检查 `/me`。
- [x] 验证裸认证层令牌无法借旧认证手机号取得该员工的自有后台会话。记录所有签发/换发入口；发现兼容入口时修复其入口校验，不通过修改共享 `auth.users.phone` 或解绑其他身份处理。
- [x] 写出“登录先读取员工，换号随后完成，登录最后签发”的可控 Promise 测试；预期旧号登录不能获得新版本可用令牌。

API 测试须在 `apps/api` 目录执行，保证 `@/` 指向 API；以下命令中的 API 路径相对该目录。

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISH=test-publish-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key JWT_SECRET=tenant-phone-test-secret bun test ./src/services/admin-auth-phone-change.test.ts ./src/services/phone-identity-login/phone-change.test.ts ./src/plugins/auth/tenant-admin-session.test.ts
```

先记录哪些测试因缺失保护失败，再实施 Task 2。认证层旧号可绕过的测试未通过前，不能发布换号入口。

## Task 2：补齐后台会话校验与登录竞态保护

**Files:** 新增 `employee-admin-sessions.ts` service/repository 和测试；修改 `plugins/auth/legacy-plugin.ts`、`services/admin-auth.ts`、`services/authorization/legacy/context-cache.ts` 的必要调用点。使用现有 `isEmployeeOperableStatus`，不自行推测员工状态。

- [x] 实现 repository：只 select `id,tenant_id,user_id,status,phone,version,admin_auth_version`，按 user_id 查询，`.limit(2)`；无记录、多记录均不默认选第一条。
- [x] 对租户 `login_channel=admin_web` 每个请求读取权威快照并比对凭证版本；平台令牌保留已有平台权限校验，微信/客户沿用现有绑定校验。缺失版本的旧后台令牌要求重新登录，不默认补 1。
- [x] 校验插在已验证 JWT 后、任何业务 handler 前；每个请求最多读取一次安全快照，不使用五分钟权限缓存决定令牌有效性。
- [x] 登录结束前再次读取安全快照；比对最初验证手机号、员工、用户关联和凭证版本。签发使用经过手机号校验的那一版凭证，不可在并发换号后取最新版本为旧验证码签发令牌。
- [x] 确保换号成功后不会从旧权限缓存给新登录签发旧版本；只为目标员工清理缓存，登录安全快照从数据库读取。两个 service 实例共享数据库的测试验证跨实例失效。
- [x] 验证同号客户仍能登录，微信身份不退出，平台超管可继续操作。

安全快照验证的最小规则（新增 service 内，错误必须走工厂）：

```ts
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";

export function assertAdminCredentialVersion(
  actual: number,
  claimed: number | undefined,
): void {
  if (!Number.isInteger(actual) || actual < 1 || claimed !== actual) {
    throw Errors.unauthorized("登录状态已失效，请重新登录", ErrorCodes.ADMIN_SESSION_REVOKED);
  }
}
```

单元测试必须有以下实际断言，集成测试还要覆盖数据库快照变化：

```ts
import { expect, test } from "bun:test";
import { assertAdminCredentialVersion } from "./employee-admin-sessions";

test("rejects missing and stale versions", () => {
  expect(() => assertAdminCredentialVersion(2, 1)).toThrow("登录状态已失效");
  expect(() => assertAdminCredentialVersion(2, undefined)).toThrow("登录状态已失效");
  expect(() => assertAdminCredentialVersion(2, 2)).not.toThrow();
});
```

- [x] 运行 Task 1 命令和 `bun run api:check`，通过后提交 `fix(auth): 校验租户后台会话凭证版本`。

## Task 3：挑战记录、并发与原子命令 migration

**Files:** 用 `supabase migration new tenant_admin_phone_change_foundation` 与 `supabase migration new tenant_admin_phone_change_commands` 生成新 migration；实际时间戳由 CLI 生成并写入执行记录，禁止修改既有 migration。新增 `supabase/tests/tenant_admin_phone_change.sql`。

- [x] 新挑战表 `tenant_admin_phone_change_challenges`：id、actor_employee_id、actor_user_id、tenant_id、employee_id、expected_version、old_phone、new_phone、sms_verification_id（唯一）、status、failed_attempts、expires_at、created_at、confirmed_at、send_idempotency_key；确认请求指纹和结果存放在原子审计 metadata.request/result。状态为 `sending/ready/failed/superseded/consumed`，failed_attempts 为 0..5。
- [x] 对操作者+发送幂等键设唯一约束；按 employee_id/created_at 和过期时间建立必要索引。启用 RLS，撤销普通角色表访问；不存第二份明文验证码。
- [x] 短信 scene CHECK 在保留所有现有 scene 的基础上增加 `tenant_admin_phone_change`；新增场景同时加入 domain 常量。
- [x] 建立 `reserve_tenant_admin_phone_change`：服务端校验操作者和目标，原子调用现有 `reserve_sms_verification_code` 并保存其返回 ID，建立 `sending` 挑战。5 分钟过期、60 秒冷却；相同发送幂等键不能重复发送。
- [x] 建立 `complete_tenant_admin_phone_change_send`：仅 `sending → ready/failed`；发送成功后才允许确认。新挑战 ready 时废弃该员工旧挑战；外部短信失败不得改变员工。发送结果不明时不自动再次发送，返回可重试提示并受冷却限制。
- [x] 建立 `confirm_tenant_admin_phone_change`：先读取同操作者幂等结果并比较业务指纹，再锁定员工、挑战、短信及用于管理员资格判定的角色关系。锁超时或死锁按可重试冲突返回，不吞异常。
- [x] 验证挑战操作者/租户/员工/新号码/版本、期限、ready、尝试次数及 scene；错误验证码递增计数后返回业务状态。**不要 RAISE 导致错误次数回滚**。service 在 RPC 返回后转换为 400/429。
- [x] 成功路径在一个事务中消费验证码、更新号码、增加员工版本和后台版本、消费挑战、保存幂等结果和成功审计；审计写入失败回滚全部成功路径。
- [x] 复用现有号码 advisory lock；扩展保护至本次变更号码的所有员工写入状态，并明确所有写入路径锁顺序。不能仅新 RPC 加锁，普通员工写入也必须参与相同冲突保护。
- [x] 建立 `tenant_admin_login_phone_reservations`（employee_id 主键、phone 唯一），只为使用本功能的管理员登记受保护号码，迁移不强制把历史全库改成全局唯一。其号码预留必须被普通员工创建/编辑、建户、恢复状态路径共同检查；员工换号/删除时更新或释放，不因临时停用静默释放。使用 employee 变更触发器保证跨路径一致性；表同样启用 RLS 并撤销普通角色访问。
- [x] 号码、用户关联、影响资格的员工字段发生变更时递增 version；号码变化递增 admin_auth_version。采用 `GREATEST(NEW.version, OLD.version+1)` 等规则避免现有 RPC 已递增后再双加。头像和 last_login_time 不使挑战失效；角色资格在确认事务中重新判定并锁定。
- [x] 所有 SECURITY DEFINER 函数固定 search_path、完整限定表名。执行权限显式撤销 PUBLIC/anon/authenticated，只向 service_role 开放入口；内部辅助函数不公开。

原子更新语义（由触发器统一维护版本，命令不重复加）：

```sql
UPDATE public.employees
SET phone = v_challenge.new_phone -- 实际 employees 表没有 updated_at 列
WHERE id = v_challenge.employee_id
  AND tenant_id = v_challenge.tenant_id
  AND version = v_challenge.expected_version
  AND phone IS NOT DISTINCT FROM v_challenge.old_phone
RETURNING * INTO v_employee;
IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TENANT_ADMIN_PHONE_VERSION_CONFLICT';
END IF;
```

SQL smoke 每次在 BEGIN/ROLLBACK 中创建合成数据，先覆盖单次成功、验证码错误次数真实累加、审计失败回滚、同幂等键重试和权限撤销。使用本地迁移后的库：

```sh
psql "$TENANT_PHONE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/tenant_admin_phone_change.sql
```

- [x] 检查执行计划：安全快照按 user_id 可用已有唯一索引（本地小样本优化器选择顺序扫描）；管理员列表通过 EXISTS 筛选角色并分页；如缺索引，在本次新 migration 增加。
- [x] 提交 `feat(platform): 增加租户管理员换号原子命令`，附带前向回滚说明：关闭新入口、保留变更/审计/版本保护，禁止恢复旧号或降低会话版本。

## Task 4：短信发送与应用服务

**Files:** 新增 service/repository 及各自测试；修改 `packages/domain/src/auth.ts`、`apps/api/src/services/sms/legacy/config.ts` 及相邻测试。

- [x] service 生成验证码使用 Node `randomInt(100000, 1000000)`；先预留挑战，取得其专属短信记录，再调用现有 `sendSmsCode`，最后完成发送状态。不可调用发送后不返回 reservation ID 的通用 `sendCode` 再查“最新一条”。
- [x] 场景映射使用现有验证码模板配置；对阿里云/腾讯云分别断言配置 key，不新增供应商依赖。平台操作使用平台短信通道，不依赖已到期租户的短信余额；检查既有计费行为与此一致。
- [x] mock 仅在本地测试使用；本功能不受 `AUTH_PHONE_LOGIN_WITHOUT_CODE` 绕过，不调用 `reserveBypassCode`。
- [x] IP 从服务端 request.ip 获取，不信任表单中的操作者/IP 字段；发送日志仅包含请求标识、挑战 ID、状态和脱敏号码。
- [x] repository 对所有 RPC 返回值严格校验，缺字段、未知状态、不正确类型转为 `Errors.dbError`。号码、验证码和数据库原始错误不写入普通日志。
- [x] 同 actor+幂等键的请求内容必须一致；确认指纹覆盖租户、员工、新号、版本、挑战、原因和本人确认，不含验证码，以便输入纠错后可继续同一操作。
- [x] confirm 成功后清理目标员工权限缓存，读回号码与版本；不修改 `user_id`、角色、微信 OAuth 或业务成员记录。

必须测试：短信供应商失败；ready 写入失败；相同发送键重复请求；不同超管重用挑战；重发旧挑战；CODE_INVALID/EXHAUSTED 映射；认证 bypass 环境下仍需验证码；日志脱敏；成功幂等重试不再次发送/更新。

命令：

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISH=test-publish-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key bun test ./src/services/platform-tenant-admin-phones.test.ts ./src/repositories/platform-tenant-admin-phones.test.ts ../../packages/domain/src/auth.test.ts
```

- [x] 通过后提交 `feat(platform): 编排管理员换号短信与业务校验`。

## Task 5：接口与真实分页

**Files:** 新增 schema/controller 及测试；修改 `apps/api/src/routes/index.ts` 注册 controller，复用 `PlatformBaseController.getRequiredPlatformSuperAdminContext`。

校验 schema 的完整基本定义如下；列表 query 复用现有 PaginationQuerySchema：

```ts
import { z } from "zod";

export const TenantAdminPhoneParamsSchema = z.object({
  id: z.uuid("无效的租户 ID"),
  employeeId: z.uuid("无效的员工 ID"),
});
const phone = z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确");
export const SendTenantAdminPhoneCodeSchema = z.object({
  new_phone: phone,
  expected_version: z.number().int().min(1),
  idempotency_key: z.uuid(),
}).strict();
export const ConfirmTenantAdminPhoneSchema = SendTenantAdminPhoneCodeSchema.extend({
  challenge_id: z.uuid(),
  code: z.string().trim().regex(/^\d{6}$/, "请输入六位验证码"),
  reason: z.string().trim().min(1, "请填写变更原因").max(500),
  same_person_confirmed: z.literal(true),
}).strict();
```

- [x] schema 测试拒绝额外 actor 字段、无本人确认、空原因、非整数版本和 pageSize>100。
- [x] controller 只做超管上下文、safeParse、service 调用、ResponseHandler.success；发短信和确认均独立验证超管，不靠隐藏按钮。
- [x] 列表允许有租户查看权限的平台人员读取脱敏展示，但只给超管 `can_change=true`。发送/确认端点只允许超管。
- [x] 在 `apps/api/src/schema/platform-audit-logs.ts` 和 `apps/admin/components/platform-audit-logs/platform-audit-log-types.ts` 加入 `tenant_admin_phone_change` 及中文名称“变更管理员登录手机号”，确认平台审计列表可以筛选和展示新事件。
- [x] 用 EXISTS 或等价 RPC 过滤当前有效 system_admin，准确 count、稳定按 created_at/id 排序，数据库分页。避免先取全量管理员 ID 再 `.in()`；不增加租户列表逐行查询。
- [x] 在详情页接入前，Fastify inject 验证三个真实路由：超管成功、运营 403、跨租户目标拒绝、管理员已撤销拒绝、平台试用到期仍可办理、分页数量正确。
- [x] 运行 `bun run api:check` 与新 controller/schema/service 测试，通过后提交 `feat(api): 开放超管管理员换号接口`。

## Task 6：后台详情页表单

**Files:** 新增文件职责表中的三个组件；修改 `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`；复用 `platform-tenant-requests.ts`、Field/Input/Textarea/Dialog/Button/StatusAlert 和相邻延期弹窗模式。

- [x] 当前管理员卡片使用新分页接口，原“初始化管理员”数据保留在初始化信息中，不能将历史快照作为操作目标。
- [x] UI 状态为 editing/sending/ready/submitting/success；发送和提交分别持有幂等键。网络错误保留确认键，改变新号、挑战、原因或目标时更新业务操作键。
- [x] 修改新号码立即清空挑战和验证码，提交期间禁用修改与关闭；冷却仅影响发短信按钮，不阻止有效挑战提交。
- [x] 展示目标员工和号码影响说明、必填原因、本人确认、新号验证码。新号码冲突提示不会覆盖对方；本人微信绑定保留，后台需重新登录。
- [x] 成功后关闭弹窗并按项目现有延迟刷新模式更新详情；失败保持输入，409 刷新目标版本并要求重新发送，401 引导超管重新登录。
- [x] 增加纯状态测试：换号清挑战、发送失败回 editing、提交超时保留同一键、换目标丢弃旧状态；不编写只检查 JSX 字符串的测试。
- [x] 使用 admin-design 技能核对组件规范；第三方组件 API 只从安装类型和邻近用法确认。

命令：

```sh
bun test ./apps/admin/components/platform-tenants/platform-tenant-admin-phone-state.test.ts
bun run admin:check
bun run admin:build
```

- [x] 通过后提交 `feat(admin): 增加租户管理员登录手机号变更入口`。

## Task 7：数据库并发和端到端验收

**Files:** 新增职责表中的 SQL smoke、并发脚本、浏览器配置及 mock；参考 `apps/admin/playwright.service-access.config.ts` 和对应 e2e 登录方式。

- [x] 本地双连接并发：两个超管改同一员工、不同员工抢同一号码、普通员工创建/编辑与超管换号竞争、角色撤销与确认竞争。数据库最终只能出现满足业务约束的结果，失败事务无验证码成功消费及成功审计。
- [x] 并发脚本只接收 `TENANT_PHONE_TEST_DATABASE_URL`，必须拒绝非 loopback 地址；启动前明确使用独立本地测试库。使用合成夹具并完整清理，不能把两个连接分别 BEGIN/ROLLBACK 当作互相可见的并发夹具。
- [x] SQL 权限测试以实际 SET ROLE 和 has_function_privilege 核对 anon/authenticated 无执行权限，service_role 实际调用通过。本地 PG 17.6 无权限调用触发 signal 11，停止重复该路径，限制已记入验收记录。
- [x] 浏览器 mock 运行在 3996，Admin 在 3036，独立 `.next-e2e/tenant-admin-phone`，单 worker。启动前检查端口空闲和静态检查通过，不停止不属于本任务的服务。
- [x] 浏览器测试：超管选中第二个管理员并成功换号；运营没有按钮；错误验证码可修正；重发使旧挑战不可提交；新号冲突保留输入；提交超时重试同键；无障碍名称与键盘关闭可用。
- [x] UI mock 只能证明交互。使用真实本地 API + 数据库再检查新号码实际登录、旧号失败、旧 JWT 调用真实业务接口 401、同号客户与本人微信身份仍可用。

浏览器断言示例（合成账号由专用 mock 登录，验证码仅来自测试夹具）：

```ts
import { expect, test } from "@playwright/test";

test("changes the selected admin phone", async ({ page }) => {
  await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "123456" },
  });
  await page.goto("/platform/tenants/00000000-0000-4000-8000-000000000101");
  await page.getByRole("button", { name: "变更登录手机号" }).nth(1).click();
  await page.getByLabel("新手机号").fill("13999100109");
  await page.getByLabel("变更原因").fill("管理员本人更换手机号");
  await page.getByLabel("管理员本人未变更").check();
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("验证码", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "确认变更" }).click();
  await expect(page.getByText("登录手机号已变更，请管理员使用新号码重新登录后台。")).toBeVisible();
});
```

执行：

```sh
bun run api:check
bun run admin:check
cd apps/admin
bun run test:e2e --config=playwright.tenant-admin-phone.config.ts
cd ../..
bun scripts/tenant-admin-phone-change-concurrency.ts
```

- [x] 记录命令、退出码、失败修复和必要截图；接口/SQL/跨实例会话验证全部通过后提交测试及验收证据。

## Task 8：发布准备与验收记录

**Files:** 新增 `docs/operations/evidence/2026-10-08-tenant-admin-phone-change.md`，执行日期不同时改用实际日期。

- [x] 审查最终 diff，无 orange 变更、真实个人数据、验证码日志、新依赖及与目标无关的重构。
- [x] migration 为向前兼容新增；发布前列出实际待应用文件，检查 Local/Remote。先应用基础/命令 migration，再部署已含会话校验的 API，最后部署 Admin 开放入口。
- [x] 若生产短信 provider 为 mock/disabled、模板不适配或认证旧号恢复链路未闭合，不开放入口，明确记录具体原因；不能用免验证码或放宽 JWT 校验代替修复。
- [x] 应用后 `supabase migration list` 验证对齐，确认函数 ACL、API/Admin 健康和版本一致。只读生产检查默认不消耗用户验证码、不修改真实租户号码。
- [x] 发布回执关联构建 commit、镜像、migration 和工作流，注明真实用户换号需由超管执行验证。回退保留已生效号码及会话撤销，只关闭新入口并向前修正。

## 设计覆盖检查

| 设计要求 | 对应任务 |
| --- | --- |
| 当前管理员识别与分页 | 5、6 |
| 新号验证、旧号无需验证、短信失败不变更 | 3、4 |
| 超管权限与租户服务状态分离 | 3、5 |
| 号码冲突、版本冲突、并发写入 | 1、3、7 |
| 老 JWT 失效、旧验证码竞态、跨实例 | 1、2、7 |
| 保留员工/客户/微信身份与历史数据 | 1、4、7 |
| 原子审计、验证码次数、幂等及重发 | 3、4、7 |
| 静态检查先行、UI 与真实后端分别验收 | 6、7 |
| migration、权限验证、发布与回退 | 3、7、8 |
