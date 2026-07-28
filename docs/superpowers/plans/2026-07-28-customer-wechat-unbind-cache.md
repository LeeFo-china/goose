# Customer WeChat Unbind Cache Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a customer who unbinds WeChat immediately returns as a platform visitor on the next WeChat login, while preserving phone-based customer recovery.

**Architecture:** Keep the existing Stage 5 unbind semantics: only deactivate the `wechat_mini` OAuth credential and retain the customer business membership. After the database update, explicitly invalidate both the openid login-state cache and the short-lived JWT identity-check cache so no stale customer context can be reused.

**Tech Stack:** Bun test, TypeScript, Fastify authentication services

---

### Task 1: Lock the customer unbind contract

**Files:**
- Create: `apps/api/src/services/wechat-rebind-requests/legacy/unbind.test.ts`
- Modify: `apps/api/src/services/wechat-rebind-requests/legacy/unbind.ts`
- Modify: `apps/api/src/services/wechat-rebind-requests/legacy/shared.ts`

- [x] **Step 1: Write the failing service test**

Mock the existing assertions, repositories, and services. Call `unbindCustomer()` with a valid customer JWT context and assert that it:

```ts
expect(invalidateWechatLoginState).toHaveBeenCalledWith({
  authUserId: user.sub,
  openid: user.openid,
});
expect(invalidateWechatIdentityCheckCache).toHaveBeenCalledWith({
  authUserId: user.sub,
  openid: user.openid,
});
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-rebind-requests/legacy/unbind.test.ts
```

Expected: FAIL because customer unbind currently calls neither cache invalidator.

- [x] **Step 3: Add the minimal customer unbind invalidation**

After `unbindOauthIdentityBestEffort()` succeeds, invalidate the openid login state and JWT identity-check entries for the current auth user and openid. Do not change `customers.user_id` or `user_business_memberships`.

- [x] **Step 4: Run the service test and verify GREEN**

Run:

```bash
cd apps/api
bun test src/services/wechat-rebind-requests/legacy/unbind.test.ts
```

Expected: PASS.

### Task 2: Add and verify JWT identity-check cache invalidation

**Files:**
- Create: `apps/api/src/plugins/auth/legacy/wechat-cache.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/wechat-cache.ts`

- [x] **Step 1: Write the failing cache test**

Prime an identity-check cache entry from a signed customer token, call `invalidateWechatIdentityCheckCache()`, then verify `runWechatIdentityCheckOnce()` executes its fresh handler instead of returning the primed result.

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/api
bun test src/plugins/auth/legacy/wechat-cache.test.ts
```

Expected: FAIL because the invalidation export does not exist.

- [x] **Step 3: Implement focused cache invalidation**

Delete cached and in-flight entries whose key belongs to the supplied auth user and, when supplied, the same openid. Advance a cache generation so checks that were already running before unbind cannot write a stale success back after invalidation. Leave unrelated completed cache entries untouched.

- [x] **Step 4: Run both regression tests and verify GREEN**

Run:

```bash
cd apps/api
bun test \
  src/plugins/auth/legacy/wechat-cache.test.ts \
  src/services/wechat-rebind-requests/legacy/unbind.test.ts
```

Expected: both files pass with zero failures.

### Task 3: Verify the complete fix

**Files:**
- Verify only; no additional production files.

- [x] **Step 1: Run API static verification**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
```

Expected: all commands exit successfully.

- [x] **Step 2: Run the relevant auth regression set**

Run:

```bash
cd apps/api
bun test \
  src/plugins/auth/legacy/routes.test.ts \
  src/plugins/auth/legacy/wechat-cache.test.ts \
  src/services/wechat-rebind-requests/legacy/unbind.test.ts \
  src/services/wechat-auth-legacy/partner-login.test.ts
```

Expected: zero failures.

- [x] **Step 3: Review the diff**

Confirm the diff only adds cache invalidation and tests, retains Stage 5 customer recovery semantics, contains no secret values, and does not modify `orange`.
