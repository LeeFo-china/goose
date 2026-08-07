# Admin Session Expiry Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make Admin authentication failures clear the stale login cookie and immediately return the user to login instead of rendering a false permission-denied state.

**Architecture:** Keep stateless JWT authentication. Add one shared browser-side 401 classifier/redirector, clear the HttpOnly token cookie at the Next.js BFF boundary, and mount a no-UI session guard that checks `/api/auth/me` after long idle periods. HTTP 403 and transient failures stay in their existing business-error paths.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Bun test, HttpOnly cookies.

---

### Task 1: Clear stale JWT cookies at the BFF boundary

**Files:**
- Create: `apps/admin/lib/admin-auth-cookie.ts`
- Modify: `apps/admin/app/api/backend/[...path]/route.ts`
- Modify: `apps/admin/app/api/backend/[...path]/route.test.ts`
- Modify: `apps/admin/app/api/auth/me/route.ts`
- Create: `apps/admin/app/api/auth/me/route.test.ts`

- [x] **Step 1: Write failing route tests**

Configure the mocked backend response and assert these exact outcomes:

```typescript
backendFetch.mockResolvedValueOnce(Response.json({
  success: false,
  code: "TOKEN_EXPIRED",
}, { status: 401 }));
const unauthorized = await GET(proxyRequest, proxyContext);
expect(unauthorized.status).toBe(401);
expect(unauthorized.headers.get("set-cookie")).toContain("gooes_admin_token=");

backendFetch.mockResolvedValueOnce(Response.json({
  success: false,
  code: "FORBIDDEN",
}, { status: 403 }));
const forbidden = await GET(proxyRequest, proxyContext);
expect(forbidden.status).toBe(403);
expect(forbidden.headers.get("set-cookie")).toBeNull();
```

Add equivalent `/api/auth/me` tests for 401 cookie deletion and 403 preservation.

- [x] **Step 2: Run tests and verify RED**

```bash
cd apps/admin
bun test 'app/api/backend/[...path]/route.test.ts' app/api/auth/me/route.test.ts
```

Expected: FAIL because authentication 401 responses do not delete the Cookie.

- [x] **Step 3: Implement the response helper**

Create:

```typescript
import { NextResponse } from "next/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/backend";

export function clearAdminTokenCookie<T extends NextResponse>(response: T): T {
  response.cookies.delete(ADMIN_TOKEN_COOKIE);
  return response;
}

export function clearAdminTokenCookieOnUnauthorized<T extends NextResponse>(
  response: T,
): T {
  return response.status === 401 ? clearAdminTokenCookie(response) : response;
}
```

Apply it to locally generated `TOKEN_MISSING`, proxied backend responses, and
`/api/auth/me`. Preserve status and JSON; never redirect an API `fetch()`.

- [x] **Step 4: Run tests and verify GREEN**

Run the command from Step 2. Expected: all route tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/admin/lib/admin-auth-cookie.ts \
  'apps/admin/app/api/backend/[...path]/route.ts' \
  'apps/admin/app/api/backend/[...path]/route.test.ts' \
  apps/admin/app/api/auth/me/route.ts \
  apps/admin/app/api/auth/me/route.test.ts
git commit -m "fix(auth): 清理后台失效登录凭证"
```

### Task 2: Centralize browser-side session expiry handling

**Files:**
- Create: `apps/admin/lib/admin-session-expiry.ts`
- Create: `apps/admin/lib/admin-session-expiry.test.ts`
- Modify: `apps/admin/lib/backend-client.ts`
- Create: `apps/admin/lib/backend-client.test.ts`

- [x] **Step 1: Write failing utility tests**

```typescript
expect(isAdminAuthenticationFailure({ status: 401, code: "TOKEN_EXPIRED" }))
  .toBe(true);
expect(isAdminAuthenticationFailure({ status: 403, code: "FORBIDDEN" }))
  .toBe(false);

const redirect = createAdminSessionExpiryRedirect({ location, storage });
expect(redirect({ status: 401, code: "TOKEN_INVALID" })).toBe(true);
expect(location.replace).toHaveBeenCalledWith("/login?reason=session_expired");
redirect({ status: 401, code: "TOKEN_MISSING" });
expect(location.replace).toHaveBeenCalledTimes(1);
```

Add a `requestBackendJson()` test proving a 401 still throws a structured error
with status, code, and Request-ID after invoking the redirect handler.

- [x] **Step 2: Run tests and verify RED**

```bash
cd apps/admin
bun test lib/admin-session-expiry.test.ts lib/backend-client.test.ts
```

Expected: FAIL because the classifier/redirector and request integration do not exist.

- [x] **Step 3: Implement the browser-safe utility**

Provide these contracts:

```typescript
export type AdminAuthenticationFailure = {
  status: number;
  code?: string;
};

export function isAdminAuthenticationFailure(
  failure: AdminAuthenticationFailure,
): boolean {
  return failure.status === 401;
}

export function createAdminSessionExpiryRedirect(input: {
  location: Pick<Location, "replace">;
  storage: Pick<Storage, "key" | "length" | "removeItem"> | null;
}) {
  let hasRedirected = false;
  return (failure: AdminAuthenticationFailure) => {
    if (!isAdminAuthenticationFailure(failure)) return false;
    clearAdminSessionScopedStorage(input.storage);
    if (!hasRedirected) {
      hasRedirected = true;
      input.location.replace("/login?reason=session_expired");
    }
    return true;
  };
}
```

Expose a lazy `handleBrowserAdminSessionExpiry()` that returns `false` during
server rendering. Call it in `requestBackendJson()` before throwing the existing
structured error.

- [x] **Step 4: Run tests and verify GREEN**

Run the command from Step 2. Expected: all utility tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/admin/lib/admin-session-expiry.ts \
  apps/admin/lib/admin-session-expiry.test.ts \
  apps/admin/lib/backend-client.ts \
  apps/admin/lib/backend-client.test.ts
git commit -m "fix(auth): 统一处理后台会话失效"
```

### Task 3: Detect expiry on long-lived pages

**Files:**
- Create: `apps/admin/components/layout/admin-session-guard.tsx`
- Create: `apps/admin/components/layout/admin-session-guard.test.ts`
- Modify: `apps/admin/components/layout/admin-shell.tsx`

- [x] **Step 1: Write failing session-check tests**

```typescript
expect(await checkAdminSession({
  fetchSession: async () => Response.json({ success: true }, { status: 200 }),
})).toBe("active");
expect(await checkAdminSession({
  fetchSession: async () => Response.json({ code: "TOKEN_EXPIRED" }, { status: 401 }),
})).toBe("expired");
expect(await checkAdminSession({
  fetchSession: async () => Response.json({ code: "FORBIDDEN" }, { status: 403 }),
})).toBe("unavailable");
expect(await checkAdminSession({
  fetchSession: async () => { throw new TypeError("network"); },
})).toBe("unavailable");
```

Add a source contract assertion that `AdminShell` mounts
`<AdminSessionGuard />` exactly once.

- [x] **Step 2: Run test and verify RED**

```bash
cd apps/admin
bun test components/layout/admin-session-guard.test.ts
```

Expected: FAIL because the guard does not exist.

- [x] **Step 3: Implement the no-UI guard**

`checkAdminSession()` requests `/api/auth/me` with `cache: "no-store"` and
returns `"active"`, `"expired"`, or `"unavailable"`. The component must use:

```typescript
const ADMIN_SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
```

It skips an initial duplicate request, checks on the interval, `window.focus`,
and visible `document.visibilitychange`, prevents concurrent checks with a ref,
redirects only for `expired`, and removes all timers/listeners on unmount.
Mount it once inside `AdminSessionScopeProvider`.

- [x] **Step 4: Run test and verify GREEN**

Run the command from Step 2. Expected: all guard tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/admin/components/layout/admin-session-guard.tsx \
  apps/admin/components/layout/admin-session-guard.test.ts \
  apps/admin/components/layout/admin-shell.tsx
git commit -m "fix(auth): 增加后台会话状态检查"
```

### Task 4: Explain expiry on the login page

**Files:**
- Modify: `apps/admin/components/login-form-navigation.ts`
- Modify: `apps/admin/components/login-form-navigation.test.ts`
- Modify: `apps/admin/components/login-form.tsx`
- Modify: `apps/admin/app/login/page.tsx`

- [x] **Step 1: Write a failing notice test**

```typescript
expect(getAdminLoginNotice("session_expired"))
  .toBe("登录已过期，请重新登录");
expect(getAdminLoginNotice("unknown")).toBeNull();
expect(getAdminLoginNotice(undefined)).toBeNull();
```

- [x] **Step 2: Run test and verify RED**

```bash
cd apps/admin
bun test components/login-form-navigation.test.ts
```

Expected: FAIL because `getAdminLoginNotice()` does not exist.

- [x] **Step 3: Implement the fixed notice**

Add the pure resolver, pass `sessionNotice?: string | null` to `LoginForm`, and
render:

```tsx
{sessionNotice ? (
  <StatusAlert tone="warning">{sessionNotice}</StatusAlert>
) : null}
```

The login page awaits `searchParams` and passes only the fixed resolved string;
it never renders arbitrary query-string content.

- [x] **Step 4: Run test and verify GREEN**

Run the command from Step 2. Expected: all login tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/admin/components/login-form-navigation.ts \
  apps/admin/components/login-form-navigation.test.ts \
  apps/admin/components/login-form.tsx apps/admin/app/login/page.tsx
git commit -m "fix(auth): 提示后台登录会话过期"
```

### Task 5: Verify the complete fix

**Files:**
- Modify: `docs/superpowers/plans/2026-08-07-admin-session-expiry-handling.md`

- [x] **Step 1: Run focused tests**

```bash
cd apps/admin
bun test \
  'app/api/backend/[...path]/route.test.ts' \
  app/api/auth/me/route.test.ts \
  lib/admin-session-expiry.test.ts \
  lib/backend-client.test.ts \
  components/layout/admin-session-guard.test.ts \
  components/login-form-navigation.test.ts
```

Expected: all focused tests pass without warnings.

- [x] **Step 2: Run static verification and build**

```bash
cd ../..
pnpm --dir apps/admin run check
pnpm --dir apps/admin run build
git diff --check
```

Expected: file-size, Next type generation, TypeScript, production build, and
whitespace validation all exit successfully.

- [x] **Step 3: Review security behavior**

Confirm that no token enters browser JavaScript, only 401 clears/redirects,
403 and 5xx preserve the session, the target is a fixed local URL, all event
listeners are cleaned up, and there is no database or API contract change.

- [x] **Step 4: Record completion**

Mark all plan checkboxes complete and commit:

```bash
git add docs/superpowers/plans/2026-08-07-admin-session-expiry-handling.md
git commit -m "docs(auth): 记录后台会话修复验证"
```
