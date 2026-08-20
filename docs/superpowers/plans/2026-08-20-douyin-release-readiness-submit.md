# Douyin Release Readiness and Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent incomplete or unsafe tenant content from being submitted again, prove the complete user-to-CRM flow in every configured Douyin host, and prepare a review package for 固始晴天装饰工程有限公司.

**Architecture:** Add a server-owned readiness evaluator that aggregates installation, company profile, project publication, pricing, SMS and privacy facts into blocking findings, expose it in the tenant workspace, and enforce it inside the existing submit-audit service. Use the admin to curate real tenant content, then execute static, API, simulator and three-host release checks before requesting explicit authorization to submit.

**Tech Stack:** Bun, TypeScript, Fastify, Zod 4, Supabase, existing Douyin Open Platform release gateway, Next.js 15, Playwright/manual Douyin developer tools.

**Execution order:** Run last, after the project-content, budget-AI and appointment-CRM plans pass their own checks.

---

## File structure

Create:

- `packages/domain/src/douyin-release-readiness.ts` — finding codes, severity and result schema.
- `packages/domain/src/douyin-release-readiness.test.ts` — shared readiness contract tests.
- `apps/api/src/repositories/douyin-release-readiness.ts` — bounded readiness fact queries.
- `apps/api/src/repositories/douyin-release-readiness.test.ts` — query count/shape tests.
- `apps/api/src/services/douyin-release-readiness.ts` — deterministic blocker evaluator.
- `apps/api/src/services/douyin-release-readiness.test.ts` — every blocker and passing fixture.
- `apps/api/src/scripts/douyin-release-readiness.ts` — CLI report for one installation or tenant.
- `apps/admin/components/douyin-miniapp/release-readiness-panel.tsx` — blocking/warning UI.
- `apps/admin/components/douyin-miniapp/release-readiness-panel.test.ts` — display contract tests.
- `docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md` — completed evidence checklist.

Modify:

- `packages/domain/src/shared.ts` — export readiness contracts.
- `apps/api/src/schema/tenant-douyin-miniapp.ts` — readiness response schema.
- `apps/api/src/controllers/tenant-douyin-miniapp/index.ts` — readiness endpoint.
- `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts` — route test.
- `apps/api/src/repositories/tenant-douyin-miniapp-workspace.ts` — include readiness summary if appropriate.
- `apps/api/src/services/tenant-douyin-miniapp/workspace.ts` — load readiness.
- `apps/api/src/services/tenant-douyin-miniapp/releases.ts` — enforce readiness before submit-audit.
- `apps/api/src/services/tenant-douyin-miniapp/releases.test.ts` — blocker enforcement.
- `apps/admin/components/douyin-miniapp/workspace.tsx` — readiness panel placement.
- `apps/admin/components/douyin-miniapp/workspace.test.tsx` — blocked/ready action tests.
- `apps/admin/components/douyin-miniapp/workspace-release-dialogs.tsx` — disable submit with reasons.
- `apps/douyin-mini/src/ui-contracts.test.ts` — navigation/page completeness contract.
- `apps/douyin-mini/src/project-config.test.ts` — target and host configuration assertions.
- `package.json` — add a bounded readiness script command.

### Task 1: Define release readiness findings

**Files:**
- Create: `packages/domain/src/douyin-release-readiness.ts`
- Create: `packages/domain/src/douyin-release-readiness.test.ts`
- Modify: `packages/domain/src/shared.ts`

- [ ] **Step 1: Write the failing shared contract test**

```ts
import { describe, expect, test } from "bun:test";
import {
  DOUYIN_RELEASE_BLOCKER_CODES,
  DouyinReleaseReadinessSchema,
} from "./douyin-release-readiness";

describe("douyin release readiness", () => {
  test("uses stable blocker codes and rejects ready results with blockers", () => {
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain("PUBLIC_PROJECT_TEST_CONTENT");
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain("BUDGET_PRICING_MISSING");
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain("SMS_UNAVAILABLE");
    expect(() => DouyinReleaseReadinessSchema.parse({
      ready: true,
      checked_at: "2026-08-20T10:00:00+08:00",
      tenant: { id: "11111111-1111-4111-8111-111111111111", name: "晴天装饰" },
      blockers: [{ code: "SMS_UNAVAILABLE", message: "短信不可用", details: {} }],
      warnings: [],
      metrics: {},
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test packages/domain/src/douyin-release-readiness.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the strict contract**

Define stable blocker codes for installation, tenant, profile, service area, project count, project completeness, test content, privacy exposure, pricing, SMS, privacy version and host configuration. Define warning codes separately. Refine the schema so `ready` is true only when blockers are empty.

- [ ] **Step 4: Run tests**

Run: `bun test packages/domain/src/douyin-release-readiness.test.ts packages/domain/src/shared.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/douyin-release-readiness.ts packages/domain/src/douyin-release-readiness.test.ts packages/domain/src/shared.ts
git commit -m "feat(domain): add douyin release readiness contract"
```

### Task 2: Build the readiness repository and evaluator

**Files:**
- Create: `apps/api/src/repositories/douyin-release-readiness.ts`
- Create: `apps/api/src/repositories/douyin-release-readiness.test.ts`
- Create: `apps/api/src/services/douyin-release-readiness.ts`
- Create: `apps/api/src/services/douyin-release-readiness.test.ts`

- [ ] **Step 1: Write failing evaluator tests**

Create a passing fixture for 固始晴天装饰工程有限公司 with one active merchant installation, published profile, service area, active privacy version, active pricing, SMS readiness, six projects, at least two per phase, three images per project and two in-progress projects with logs.

Use table-driven cases:

```ts
test.each([
  ["profile missing", { profile: null }, "PUBLIC_PROFILE_MISSING"],
  ["too few projects", { projects: passing.projects.slice(0, 5) }, "PUBLIC_PROJECT_COUNT_LOW"],
  ["test content", { projects: [{ ...passing.projects[0], title: "E2E 可删除" }] }, "PUBLIC_PROJECT_TEST_CONTENT"],
  ["pricing missing", { activePricingVersion: null }, "BUDGET_PRICING_MISSING"],
  ["sms unavailable", { smsReady: false }, "SMS_UNAVAILABLE"],
])("blocks %s", (_name, override, code) => {
  const result = evaluateDouyinReleaseReadiness({ ...passing, ...override }, now);
  expect(result.ready).toBe(false);
  expect(result.blockers.map((item) => item.code)).toContain(code);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/douyin-release-readiness.test.ts`

Expected: FAIL because evaluator/repository are absent.

- [ ] **Step 3: Implement bounded fact queries**

Use a small fixed number of queries:

1. installation + tenant + runtime config;
2. profile + service-area count;
3. published project profiles joined to projects/properties, limited to 100;
4. grouped/bounded public image/log facts for those project IDs;
5. active pricing version count;
6. SMS provider readiness using existing configuration service.

Select necessary columns only. Do not query each project individually.

- [ ] **Step 4: Implement deterministic evaluation**

Enforce internal blockers:

- active merchant installation and active tenant;
- published profile with non-blank name, Logo, an introduction of at least 80 trimmed characters, service phone and at least one active service area;
- at least six published projects, with at least two `in_progress` and two `completed`;
- every project has title, description, area, layout, style, budget band and at least three images;
- at least two in-progress projects have public logs;
- title/description does not contain case-insensitive `e2e`, `smoke`, `测试`, `可删除` or a 10+ digit timestamp;
- no public title/description contains a mainland phone pattern or unit/room pattern;
- active budget pricing and non-blank disclaimer;
- valid privacy version and real SMS configuration;
- required host list is non-empty.

Return counts and project IDs in safe details, but do not return customer names, phones or internal addresses.

- [ ] **Step 5: Run focused tests**

Run: `bun test apps/api/src/repositories/douyin-release-readiness.test.ts apps/api/src/services/douyin-release-readiness.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/douyin-release-readiness.ts apps/api/src/repositories/douyin-release-readiness.test.ts apps/api/src/services/douyin-release-readiness.ts apps/api/src/services/douyin-release-readiness.test.ts
git commit -m "feat(douyin): evaluate release readiness"
```

### Task 3: Expose readiness and block submit-audit server-side

**Files:**
- Modify: `apps/api/src/schema/tenant-douyin-miniapp.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`

- [ ] **Step 1: Write failing controller and release tests**

```ts
expect(routes).toContainEqual({
  method: "GET",
  path: "/tenant/douyin-miniapp/release-readiness",
});

await expect(service.submitAudit(authContext, releaseId, body)).rejects.toMatchObject({
  statusCode: 409,
  code: "DOUYIN_RELEASE_NOT_READY",
  details: { blocker_codes: ["BUDGET_PRICING_MISSING"] },
});
expect(releaseGateway.submitAudit).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`

Expected: FAIL because the endpoint and gate do not exist.

- [ ] **Step 3: Add the readiness route**

Register `GET /tenant/douyin-miniapp/release-readiness`, require `douyin_miniapp.read`, resolve tenant from auth context and return the strict shared schema.

- [ ] **Step 4: Enforce the gate in submit-audit**

Immediately before claiming/submitting a release, re-evaluate readiness. If blockers exist, throw `Errors.business(409, "抖音小程序尚未达到提审条件", "DOUYIN_RELEASE_NOT_READY", { blocker_codes })`. Do not trust a readiness result previously loaded by the browser.

- [ ] **Step 5: Run API checks**

Run: `bun test apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/tenant-douyin-miniapp.ts apps/api/src/controllers/tenant-douyin-miniapp/index.ts apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts apps/api/src/services/tenant-douyin-miniapp/releases.ts apps/api/src/services/tenant-douyin-miniapp/releases.test.ts
git commit -m "feat(douyin): block incomplete release submissions"
```

### Task 4: Add CLI and tenant readiness UI

**Files:**
- Create: `apps/api/src/scripts/douyin-release-readiness.ts`
- Create: `apps/api/src/scripts/douyin-release-readiness.test.ts`
- Create: `apps/admin/components/douyin-miniapp/release-readiness-panel.tsx`
- Create: `apps/admin/components/douyin-miniapp/release-readiness-panel.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace.test.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-release-dialogs.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write failing CLI/UI tests**

Test CLI argument parsing for exactly one `--tenant-id` UUID and JSON output exit codes: `0` ready, `2` blocked, `1` operational error. Test UI grouping, metrics and disabled submit action when blocked.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/scripts/douyin-release-readiness.test.ts apps/admin/components/douyin-miniapp/release-readiness-panel.test.ts apps/admin/components/douyin-miniapp/workspace.test.tsx`

Expected: FAIL because CLI/panel are absent.

- [ ] **Step 3: Implement the CLI**

Add root script:

```json
"douyin:release-readiness": "cd apps/api && bun --env-file=.env src/scripts/douyin-release-readiness.ts"
```

The CLI prints tenant ID/name, ready flag, metrics, blocker codes/messages and warnings. It must not print full phone numbers, secrets or raw database errors.

- [ ] **Step 4: Implement the readiness panel**

Place the panel above release actions. Display each blocker with the exact admin route that resolves it: company profile, project content, budget pricing or SMS/system settings. Disable submit-audit when locally blocked, while retaining the server gate.

- [ ] **Step 5: Run checks**

Run: `bun test apps/api/src/scripts/douyin-release-readiness.test.ts apps/admin/components/douyin-miniapp/release-readiness-panel.test.ts apps/admin/components/douyin-miniapp/workspace.test.tsx`

Expected: PASS.

Run: `bun run api:check && bun run admin:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/scripts/douyin-release-readiness.ts apps/api/src/scripts/douyin-release-readiness.test.ts apps/admin/components/douyin-miniapp/release-readiness-panel.tsx apps/admin/components/douyin-miniapp/release-readiness-panel.test.ts apps/admin/components/douyin-miniapp/workspace.tsx apps/admin/components/douyin-miniapp/workspace.test.tsx apps/admin/components/douyin-miniapp/workspace-release-dialogs.tsx package.json
git commit -m "feat(douyin): surface release readiness"
```

### Task 5: Curate the target tenant's real public content

**Files:**
- No source-code change is required for content entry.
- Create during evidence capture: `docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md`

- [ ] **Step 1: Confirm the target installation before editing content**

Use the tenant workspace and read-only database checks to confirm the tenant name is exactly “固始晴天装饰工程有限公司”, the merchant authorization is active, and the authorizer AppID suffix matches the known merchant installation. Stop if the active installation resolves to the 5H acceptance tenant.

- [ ] **Step 2: Enter approved company content through admin**

Upload the company-approved Logo and banner, replace the short introduction with approved company copy, verify service phone/address/regions, and add only verifiable qualifications/trust metrics. Do not fabricate years, completed-project totals, awards or certificates.

- [ ] **Step 3: Publish approved project profiles**

Use the project-publication admin page to select at least six real projects, including at least two施工中 and two已完工. For each, enter a public title and description that do not contain customer identity or exact door information, set style/budget band, confirm area/layout, and verify at least three real images. Confirm at least two in-progress projects have public progress logs.

- [ ] **Step 4: Remove unsafe public records from publication**

Set test, smoke, timestamped, customer-named or exact-room projects to `hidden` or `draft`. Do not rename internal operational project records solely for the mini-program; sanitize through the public profile.

- [ ] **Step 5: Activate reviewed pricing and contact SLA**

Activate the company-approved pricing version, verify the disclaimer, privacy-policy version, SMS provider and configured contact-SLA copy. Do not publish guessed pricing.

- [ ] **Step 6: Run the readiness command**

Run: `bun run douyin:release-readiness -- --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b`

Expected: exit `0`, `ready: true`, zero blockers, at least six projects, phase minima satisfied, pricing active and SMS ready.

- [ ] **Step 7: Record evidence**

Create `docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md` with the exact readiness command output stripped of secrets, project counts, pricing version number, privacy version, SMS verification timestamp and content approver name supplied by the business.

- [ ] **Step 8: Commit the evidence document**

```bash
git add docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md
git commit -m "docs(douyin): record gushi release readiness"
```

### Task 6: Run static, API and browser verification

**Files:**
- Modify only implementation files from the preceding Douyin plans when a reproduced failure identifies a root cause.

- [ ] **Step 1: Run repository-wide focused tests**

Run: `bun test packages/domain/src/douyin-public-project.test.ts packages/domain/src/douyin-budget.test.ts packages/domain/src/douyin-lead.test.ts packages/domain/src/douyin-release-readiness.test.ts apps/api/src/repositories/douyin-miniapp-content.test.ts apps/api/src/services/douyin-budget apps/api/src/services/tenant-douyin-leads.test.ts apps/api/src/services/douyin-release-readiness.test.ts`

Expected: PASS.

- [ ] **Step 2: Run package checks in risk order**

Run: `bun run api:check`

Expected: PASS.

Run: `bun run douyin-mini:check`

Expected: PASS.

Run: `bun run admin:check`

Expected: PASS.

Run: `bun run check:permission-boundaries && bun run audit:supabase-writes`

Expected: PASS.

- [ ] **Step 3: Verify migrations**

Run: `supabase migration list`

Expected: public-project, budget and appointment migrations align Local/Remote.

- [ ] **Step 4: Smoke the API chain**

Using a valid Douyin mini-program session for the target installation, verify:

1. bootstrap resolves the target tenant;
2. project list/detail/log pagination;
3. deterministic estimate and AI success/failure paths;
4. SMS and appointment submission;
5. lead appears in tenant admin;
6. existing-customer auto-link;
7. new-phone manual conversion;
8. customer detail includes source/appointment/estimate.

- [ ] **Step 5: Smoke the admin in a browser**

Verify project publication, pricing versions, readiness panel, lead assignment/follow-up/conversion/invalidation and customer detail. Capture browser console and network errors; any failure must be root-caused before proceeding.

- [ ] **Step 6: Re-run readiness after smoke data cleanup**

Remove or hide any smoke-created public content through admin, then run:

`bun run douyin:release-readiness -- --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b`

Expected: still ready with zero blockers.

### Task 7: Verify every configured host and prepare review material

**Files:**
- Modify: `docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md`

- [ ] **Step 1: Confirm the exact host list from the release configuration**

Read the release record and Douyin Open Platform configuration. Record the exact configured hosts in the checklist; do not assume a host that is absent from the release.

- [ ] **Step 2: Execute the full path in each configured host**

For Douyin, Douyin Lite and the configured Huoshan/Toutiao host, complete:

```text
首页 -> 项目实景 -> 项目详情 -> 预算初算
-> AI 建议或可控降级 -> 免费量房 -> 短信验证
-> 预约成功编号 -> 后台收到线索 -> 人工转客户
```

Record date/time, app version, host version, tester, result and evidence filename for each host.

- [ ] **Step 3: Verify weak-network and double-submit behavior**

In at least one host, throttle the network or interrupt AI, retry appointment submit and return/re-enter pages. Confirm deterministic budget remains, form data remains after recoverable errors and one idempotency key produces one appointment.

- [ ] **Step 4: Capture review screenshots and video**

Capture screenshots of home, project list/detail, budget result/AI explanation and appointment success. Record one uninterrupted video from launch through successful appointment. Store only approved artifacts outside source control if they include test phone information; record sanitized filenames and checksums in the checklist.

- [ ] **Step 5: Write the review note**

Use this factual structure:

```text
本版本提供真实装修项目实景、按面积和装修条件计算的预算初算、
基于规则预算生成的 AI 个性化建议，以及短信验证后的免费量房申请。
体验路径：首页 -> 项目实景 -> 预算初算 -> 免费量房。
预算为初步估算，最终报价以现场量房、材料和施工范围为准。
```

Do not claim guaranteed price, guaranteed response time or capabilities absent from the build.

- [ ] **Step 6: Commit the completed checklist**

```bash
git add docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md
git commit -m "docs(douyin): complete host review checklist"
```

### Task 8: Submit only after an explicit release checkpoint

**Files:**
- No source-code modification.

- [ ] **Step 1: Present the final checkpoint to the user**

Report the target tenant, AppID suffix, template/release version, readiness result, static checks, migration alignment, three-host results and exact review note. State that submission is an external action and request explicit authorization to submit this release.

- [ ] **Step 2: Submit through the existing tenant release action after authorization**

Use the tenant workspace submit-audit action. Do not call the platform release API directly and do not publish before audit approval.

Expected: release status becomes `audit_pending`, and the returned audit identifier/log identifier is recorded without exposing tokens.

- [ ] **Step 3: Sync status without mutating unrelated releases**

Use the existing single-release sync action for the submitted release. If rejected, capture the exact host/reason/time and return to root-cause analysis. If approved, request a separate explicit authorization before invoking publish.

- [ ] **Step 4: Record the submission result**

Update the release checklist with release ID, version, submission time, audit state and sanitized evidence. Commit with:

```bash
git add docs/releases/douyin/2026-08-20-gushi-qingtian-review-checklist.md
git commit -m "docs(douyin): record audit submission"
```
