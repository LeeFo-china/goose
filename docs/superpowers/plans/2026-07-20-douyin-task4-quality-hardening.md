# Douyin Task 4 Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover authorizer-token rotation safely, bind tenants atomically, classify gateway errors correctly, and bound cleanup calls.

**Architecture:** Add one locked SECURITY DEFINER binding RPC, extend the existing gateway with the official recovery primitive, and keep bounded persistence/readback/compensation orchestration in the access-token service. Use injected timers and existing repository interfaces; add no dependency.

**Tech Stack:** Bun, TypeScript, Zod, Supabase/PostgreSQL migrations, bun:test.

---

### Task 1: Atomic tenant binding

**Files:**
- Create: `supabase/migrations/20260719110000_add_douyin_installation_binding_rpc.sql`
- Create: `apps/api/src/services/douyin-miniapp/binding-migration-contract.test.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-installations.test.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-installations.ts`

- [ ] Write migration/repository tests first. Assert installation `FOR UPDATE` occurs before active-tenant `FOR SHARE`, fixed search path, SECURITY DEFINER, service_role-only execute, authorized_unbound first bind, active JSONB/tenant/deployment idempotency, stable 409 mappings, one RPC call, and no table update.
- [ ] Run `cd apps/api && bun test src/services/douyin-miniapp/binding-migration-contract.test.ts src/repositories/douyin-miniapp-installations.test.ts`; verify missing migration and legacy SELECT+UPDATE behavior fail.
- [ ] Implement `bind_douyin_miniapp_installation(text,uuid,text,jsonb)` with input validation, fixed lock order, row-state transition, exact `IS DISTINCT FROM` comparisons, ACL, and repository RPC mapping.
- [ ] Re-run tests/typecheck and commit `fix(douyin): 原子化小程序租户绑定`.

### Task 2: Gateway boundaries and recovery primitive

**Files:**
- Modify: `apps/api/src/gateways/douyin-open-platform/client.test.ts`
- Modify: `apps/api/src/gateways/douyin-open-platform/client.ts`

- [ ] Write tests first for retry callback `AppError` identity, HTML non-2xx HTTP classification, safe JSON `log_id`, and the exact retrieve-auth-code POST request/response contract.
- [ ] Run the focused suite and verify the expected RED results.
- [ ] Rethrow callback `AppError`; wrap only unknown errors. Branch on HTTP status before strict JSON parsing. Add `retrieveAuthorizationCode({ componentAccessToken, authorizationAppId })` using POST `/api/tpapp/v2/auth/retrieve_auth_code/`, `access-token`, JSON `{ authorization_appid }`, and validated `data.authorization_code`.
- [ ] Re-run gateway tests/typecheck and commit `fix(douyin): 加固开放平台错误与补偿接口`.

### Task 3: Bounded persistence and cleanup

**Files:**
- Create: `apps/api/src/services/douyin-miniapp/access-tokens-recovery.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/access-tokens.ts`
- Create if file size requires: `apps/api/src/services/douyin-miniapp/access-token-support.ts`

- [ ] Write tests first for never-settling/late-reject fail RPCs, completion reject/false, exact encrypted readback, bounded attempt counts, operation deadlines, lease expiry/headroom, one compensation chain, recovery failure, and stable recoverable database errors.
- [ ] Run focused service suites and verify each new behavior RED.
- [ ] Add a 500ms best-effort settle boundary. Seal each provider result once; use at most two initial completion attempts with bounded readback. If still unconfirmed and at least 22 seconds of lease remain, call retrieve once, exchange once, then one bounded completion/readback. Never start an operation past its lease deadline and never convert persistent DB failure into permanent reauthorization.
- [ ] Re-run service suites/typecheck, keep files below 500 lines, and commit `fix(douyin): 恢复授权凭证持久化失败`.

### Task 4: Full verification and handoff

- [ ] Run all affected Bun suites, both migration contract suites, `bun run typecheck`, and `bun run build`.
- [ ] Run file-size, `git diff --check`, changed-file, and secret/error-pattern scans.
- [ ] Confirm orange untouched and `supabase migration list` shows Local/Remote alignment after the approved push.
- [ ] Report the migration path, rollback sequence, RED/GREEN evidence, and commit SHAs to the main agent.
