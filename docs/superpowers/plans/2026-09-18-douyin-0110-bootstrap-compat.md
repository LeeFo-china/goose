# Douyin 0.1.10 Bootstrap Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the published Douyin mini-program 0.1.10 without changing the 0.1.39 review package or disabling modern Douyin phone authorization for newer versions.

**Architecture:** The HTTP controller parses Douyin's fixed Referer into an explicit bootstrap feature contract. The content service applies the legacy phone fields only for the authenticated target AppID on version 0.1.10; every other request returns the persisted runtime configuration unchanged.

**Tech Stack:** Bun, TypeScript, Fastify, bun:test

---

### Task 1: Add the content-service feature contract

**Files:**
- Modify: `apps/api/src/services/douyin-miniapp/content.ts`
- Test: `apps/api/src/services/douyin-miniapp/content.test.ts`

- [ ] **Step 1: Write the failing service tests**

Add tests that build an installation with modern phone features, call both contracts, and verify that the legacy response is a copy:

```ts
test("downgrades only phone feature fields for the 0.1.10 bootstrap contract", async () => {
  const modernFeatures = {
    ...runtime.features,
    douyin_phone: true as const,
    phone_capture_mode: "douyin_phone" as const,
  };
  const deps = dependencies({ findActiveInstallation: mock(async () => ({
    ...installation,
    runtime_config: { ...runtime, features: modernFeatures },
  })) });

  const result = await new DouyinMiniappContentService(deps as never).bootstrap(user, {
    featureContract: "legacy_0_1_10",
  });

  expect(result.features).toEqual({
    ...modernFeatures,
    douyin_phone: false,
    phone_capture_mode: "sms",
  });
  expect(modernFeatures).toMatchObject({
    douyin_phone: true,
    phone_capture_mode: "douyin_phone",
  });
});

test("keeps runtime phone features for the current bootstrap contract", async () => {
  const modernFeatures = {
    ...runtime.features,
    douyin_phone: true as const,
    phone_capture_mode: "douyin_phone" as const,
  };
  const deps = dependencies({ findActiveInstallation: mock(async () => ({
    ...installation,
    runtime_config: { ...runtime, features: modernFeatures },
  })) });

  const result = await new DouyinMiniappContentService(deps as never).bootstrap(user, {
    featureContract: "runtime",
  });

  expect(result.features).toEqual(modernFeatures);
});
```

- [ ] **Step 2: Run the service tests and verify the new calls fail**

Run:

```bash
bun test apps/api/src/services/douyin-miniapp/content.test.ts
```

Expected: FAIL because `bootstrap` does not accept the contract options and still returns modern fields.

- [ ] **Step 3: Implement the minimal service contract**

Add the exported option types and use a focused mapper:

```ts
export type DouyinBootstrapFeatureContract = "legacy_0_1_10" | "runtime";

export type DouyinBootstrapOptions = {
  readonly featureContract: DouyinBootstrapFeatureContract;
};

async bootstrap(
  user?: JwtPayload,
  options: DouyinBootstrapOptions = { featureContract: "runtime" },
) {
  // existing loading remains unchanged
  return {
    // existing response remains unchanged
    features: bootstrapFeatures(context.runtime.features, options.featureContract),
  };
}

function bootstrapFeatures(
  features: DouyinRuntimeConfig["features"],
  contract: DouyinBootstrapFeatureContract,
): DouyinRuntimeConfig["features"] {
  if (contract !== "legacy_0_1_10") return features;
  return { ...features, douyin_phone: false, phone_capture_mode: "sms" };
}
```

Keep the existing bootstrap response fields and repository calls exactly as they are; replace only the current `features: context.runtime.features` expression.

- [ ] **Step 4: Run the focused service tests**

Run:

```bash
bun test apps/api/src/services/douyin-miniapp/content.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the service contract**

```bash
git add apps/api/src/services/douyin-miniapp/content.ts \
  apps/api/src/services/douyin-miniapp/content.test.ts
git commit -m "fix(douyin): 支持旧版 bootstrap 功能合同"
```

### Task 2: Resolve the contract from the trusted Douyin Referer

**Files:**
- Create: `apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.ts`
- Create: `apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Test: `apps/api/src/controllers/douyin-miniapp/index.test.ts`

- [ ] **Step 1: Write failing Referer resolver tests**

Create the resolver test with the exact compatibility boundary:

```ts
import { describe, expect, test } from "bun:test";
import { resolveDouyinBootstrapFeatureContract } from "./bootstrap-client-contract";

const APP_ID = "ttd033a68e4e56ccd301";

describe("resolveDouyinBootstrapFeatureContract", () => {
  test("selects the legacy contract only for the authenticated 0.1.10 app", () => {
    expect(resolveDouyinBootstrapFeatureContract(
      `https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`,
      APP_ID,
    )).toBe("legacy_0_1_10");
  });

  test.each([
    [`https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.39`, APP_ID],
    [`https://tmaservice.developer.toutiao.com/?appid=tt-other&version=0.1.10`, APP_ID],
    [`https://example.com/?appid=${APP_ID}&version=0.1.10`, APP_ID],
    [`http://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`, APP_ID],
    [`https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`, "tt-other"],
    ["not-a-url", APP_ID],
    [undefined, APP_ID],
    [[`https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`], APP_ID],
  ] as const)("keeps the runtime contract for %p", (referer, authenticatedAppId) => {
    expect(resolveDouyinBootstrapFeatureContract(referer, authenticatedAppId))
      .toBe("runtime");
  });
});
```

- [ ] **Step 2: Run the resolver test and verify the module is missing**

Run:

```bash
bun test apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.test.ts
```

Expected: FAIL because `bootstrap-client-contract.ts` does not exist.

- [ ] **Step 3: Implement the strict Referer resolver**

Create the focused pure function:

```ts
import type { DouyinBootstrapFeatureContract } from
  "@/services/douyin-miniapp/content";

const DOUYIN_REFERER_HOST = "tmaservice.developer.toutiao.com";
const LEGACY_APP_ID = "ttd033a68e4e56ccd301";
const LEGACY_VERSION = "0.1.10";

export function resolveDouyinBootstrapFeatureContract(
  rawReferer: unknown,
  authenticatedAppId: string | undefined,
): DouyinBootstrapFeatureContract {
  if (typeof rawReferer !== "string") return "runtime";
  try {
    const referer = new URL(rawReferer);
    const appId = referer.searchParams.get("appid");
    const version = referer.searchParams.get("version");
    return referer.protocol === "https:"
      && referer.hostname === DOUYIN_REFERER_HOST
      && appId === LEGACY_APP_ID
      && appId === authenticatedAppId
      && version === LEGACY_VERSION
      ? "legacy_0_1_10"
      : "runtime";
  } catch {
    return "runtime";
  }
}
```

- [ ] **Step 4: Run the resolver test**

Run:

```bash
bun test apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Write the failing controller dispatch test**

Add a test that calls the public controller handler directly:

```ts
test("dispatches the 0.1.10 feature contract from the authenticated Referer", async () => {
  const bootstrap = mock(async () => ({}));
  const content = {
    bootstrap,
    company: mock(async () => ({})),
    listCases: mock(async () => ({})),
    getCase: mock(async () => ({})),
    listSites: mock(async () => ({})),
    getSite: mock(async () => ({})),
    listSiteLogs: mock(async () => ({})),
    listProjects: mock(async () => ({})),
    getProject: mock(async () => ({})),
    listProjectLogs: mock(async () => ({})),
  };
  const controller = new DouyinMiniappController(undefined, content as never);
  const authenticatedUser = {
    token_type: "douyin_miniapp",
    douyin_app_id: "ttd033a68e4e56ccd301",
  };

  await controller.bootstrap({
    user: authenticatedUser,
    headers: {
      referer: "https://tmaservice.developer.toutiao.com/" +
        "?appid=ttd033a68e4e56ccd301&version=0.1.10",
    },
  } as never);

  expect(bootstrap).toHaveBeenCalledWith(authenticatedUser, {
    featureContract: "legacy_0_1_10",
  });
});
```

- [ ] **Step 6: Run the controller test and verify it fails**

Run:

```bash
bun test apps/api/src/controllers/douyin-miniapp/index.test.ts
```

Expected: FAIL because the controller currently calls `bootstrap(request.user)` without a contract.

- [ ] **Step 7: Wire the resolver into the controller**

Import the resolver and replace the expression-bodied handler:

```ts
import { resolveDouyinBootstrapFeatureContract } from
  "./bootstrap-client-contract";

bootstrap = async (request: FastifyRequest) => {
  const featureContract = resolveDouyinBootstrapFeatureContract(
    request.headers?.referer,
    request.user?.douyin_app_id,
  );
  return ResponseHandler.success(await this.content().bootstrap(request.user, {
    featureContract,
  }));
};
```

- [ ] **Step 8: Run controller and resolver tests**

Run:

```bash
bun test apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.test.ts \
  apps/api/src/controllers/douyin-miniapp/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Commit the HTTP compatibility boundary**

```bash
git add apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.ts \
  apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.test.ts \
  apps/api/src/controllers/douyin-miniapp/index.ts \
  apps/api/src/controllers/douyin-miniapp/index.test.ts
git commit -m "fix(douyin): 按线上版本兼容 bootstrap"
```

### Task 3: Verify the API change

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: Run all focused Douyin content and controller tests**

```bash
bun test apps/api/src/services/douyin-miniapp/content.test.ts \
  apps/api/src/controllers/douyin-miniapp/bootstrap-client-contract.test.ts \
  apps/api/src/controllers/douyin-miniapp/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run the API type check**

```bash
bun run --cwd apps/api typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Build the API**

```bash
bun run api:build
```

Expected: exit code 0.

- [ ] **Step 4: Confirm the worktree is clean and inspect the final diff**

```bash
git status --short
git diff main...HEAD --check
git diff --stat main...HEAD
```

Expected: clean status, no whitespace errors, and changes limited to the design, plan, content contract, Referer resolver, controller wiring, and their tests.

### Task 4: Integrate and release the production API

**Files:**
- Git and deployment operations only.

- [ ] **Step 1: Rebase the completed branch onto the latest main**

```bash
git fetch origin
git rebase origin/main
```

Expected: rebase completes without conflicts and verification remains valid.

- [ ] **Step 2: Fast-forward main and push**

From the primary worktree:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only fix/douyin-0110-bootstrap-compat
git push origin main
```

Expected: `origin/main` points at the verified compatibility commit.

- [ ] **Step 3: Run the repository's production API deployment workflow**

Identify the existing production deployment workflow without changing it:

```bash
gh workflow list
```

Dispatch the existing production deployment workflow for the merged main SHA and monitor it to completion. Do not deploy admin or upload a Douyin mini-program package.

Expected: API build and production deployment jobs succeed for the merged SHA.

- [ ] **Step 4: Perform safe server-side smoke checks**

```bash
curl -fsS https://api.goodcms.cn/
curl -sS -o /dev/null -w '%{http_code}\n' https://api.goodcms.cn/douyin-mini/bootstrap
```

Expected: root health succeeds and unauthenticated bootstrap returns `401`, proving routing and authentication are intact. The exact version behavior requires the authenticated iPhone checks below.

- [ ] **Step 5: Complete the production iPhone acceptance checks**

For published 0.1.10, confirm home, project showcase, budget estimate, and free-measure pages load. For the 0.1.39 review QR, confirm home, project showcase, budget estimate, free-measure Douyin phone authorization, and customer-project phone login still work.

- [ ] **Step 6: Keep the compatibility until its removal criteria are met**

Remove the branch only after integration. Retain the production code until 0.1.39 is fully published, all listed iPhone checks pass, and seven consecutive days pass without a 0.1.10 compatibility incident.
