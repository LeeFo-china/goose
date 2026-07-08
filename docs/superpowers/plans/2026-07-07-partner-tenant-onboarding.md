# 城市合伙人扫码装企入驻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持新装修公司通过城市合伙人专属小程序码提交入驻，后端创建租户、管理员员工，并立即归因到该合伙人。

**Architecture:** 保留已有 `POST /partner-onboarding/tenant-binding` 作为“已有租户登录后补绑定”接口；新增公开的扫码入驻接口，复用现有租户初始化仓储能力，不暴露超管接口。短信验证码使用现有 `sms_verification_codes` 能力，合伙人绑定继续写入 `tenant_partner_bindings` 并递增邀请码提交/通过计数。

**Tech Stack:** Bun + TypeScript + Fastify decorators + Zod + Supabase repository + existing SMS verification service.

---

### Task 1: 公开入驻接口契约测试

**Files:**
- Test: `apps/api/src/services/platform-partner-tenant-onboarding.test.ts`
- Test: `apps/api/src/controllers/platform-partners/routes.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖：
- `sendPublicTenantOnboardingCode()` 使用 `scene=partner_tenant_onboarding` 发送验证码。
- `submitPublicTenantOnboarding()` 在验证码通过后创建租户、初始化管理员，并创建 `tenant_partner_bindings`。
- 已存在绑定时幂等返回；已被其他合伙人绑定时返回 `TENANT_PARTNER_BINDING_EXISTS`。
- 邀请码不可用、合伙人不可用、验证码缺失/错误返回稳定错误码。
- 路由注册包含 `POST /partner-onboarding/tenant-applications/send-code` 和 `POST /partner-onboarding/tenant-applications`。

- [ ] **Step 2: 验证失败**

Run:

```bash
cd apps/api
bun test src/services/platform-partner-tenant-onboarding.test.ts src/controllers/platform-partners/routes.test.ts
```

Expected: 新 service 或方法不存在导致失败。

### Task 2: Schema 与路由

**Files:**
- Modify: `apps/api/src/schema/platform-partners.ts`
- Modify: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`

- [ ] **Step 1: 添加 Zod schema**

新增：
- `PartnerTenantOnboardingSendCodeSchema`
- `PartnerTenantOnboardingSubmitSchema`

提交字段：
- `invite_code`
- `company_name`
- `admin_name`
- `admin_phone`
- `sms_code`
- `region_code`
- `region_name`
- `address`
- `location`
- `source_id`

- [ ] **Step 2: 添加公开路由**

新增：
- `POST /partner-onboarding/tenant-applications/send-code`
- `POST /partner-onboarding/tenant-applications`

两个接口均应加入公开路由白名单，不要求登录态，不要求前端传 `tenant_id`、`partner_id` 或 `invite_code_id`。

### Task 3: Service 与 Repository

**Files:**
- Create: `apps/api/src/services/platform-partner-tenant-onboarding.ts`
- Modify: `apps/api/src/services/platform-partners.ts`
- Modify: `apps/api/src/repositories/platform-partners.ts`
- Modify: `apps/api/src/repositories/platform-tenants/legacy-repository.ts` only if public onboarding needs a narrow reusable creation method.

- [ ] **Step 1: 实现验证码发送**

发送前校验手机号格式；使用现有 SMS service，scene 固定为 `partner_tenant_onboarding`。

- [ ] **Step 2: 实现提交入驻**

顺序：
1. 校验并消费短信验证码。
2. 校验邀请码和合伙人状态。
3. 校验管理员手机号未被现有员工占用。
4. 生成租户 `slug`。
5. 创建租户并初始化默认部门、岗位、角色和管理员员工。
6. 写入 `tenant_partner_bindings`。
7. 递增邀请码 `submitted_count` 和 `approved_count`。

- [ ] **Step 3: 错误码**

稳定返回：
- `SMS_CODE_REQUIRED`
- `SMS_CODE_INVALID`
- `SMS_CODE_RATE_LIMITED`
- `PARTNER_INVITE_CODE_UNAVAILABLE`
- `PARTNER_INVITE_CODE_EXPIRED`
- `PARTNER_INVITE_PARTNER_UNAVAILABLE`
- `TENANT_ADMIN_PHONE_EXISTS`
- `TENANT_SLUG_EXISTS`
- `TENANT_PARTNER_BINDING_EXISTS`

### Task 4: 小程序交接文档

**Files:**
- Create: `docs/2026-07-07-partner-tenant-onboarding-miniprogram-handoff.md`

- [ ] **Step 1: 写接口契约**

说明小程序端需要把当前 `tenant-onboarding` 页面从“登录已有装企”改成“新装企入驻表单”。

- [ ] **Step 2: 写联调清单**

包含扫码、解析邀请码、发送验证码、提交入驻、重复提交、验证码错误、二维码失效、手机号已占用等 smoke 项。

### Task 5: 验证

- [ ] **Step 1: 跑相关单测**

```bash
cd apps/api
bun test src/services/platform-partner-tenant-onboarding.test.ts src/controllers/platform-partners/routes.test.ts src/services/platform-partner-invite-code-counts.test.ts
```

- [ ] **Step 2: 跑 API 类型检查和构建**

```bash
bun run api:check
```

- [ ] **Step 3: 检查 git diff**

确认没有改动 `/Users/leefo/Public/work/orange`，只改 gooes。
