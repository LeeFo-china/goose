# Construction Log Process Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backend, Douyin mini-program, and WeChat mini-program display the concrete process captured by each construction log instead of repeating the generic title “施工进度”.

**Architecture:** Keep `stage_code` as the stable business identifier, derive `stage_label` on the backend from `@gooes/domain`, and persist the current workflow node title into `project_logs.node_name` when a client omits it. Both clients render `node_name > stage_label > local compatibility label > 施工记录`; historical logs are not guessed or destructively backfilled.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase, `@gooes/domain`, Douyin native mini-program, Taro WeChat mini-program (read-only handoff)

---

## Scope And Repository Boundary

- Writable repository: `/Users/leefo/Public/work/gooes`.
- Read-only counterpart: `/Users/leefo/Public/work/orange`.
- No database migration is required because `project_logs.node_name` already exists and is nullable.
- Do not rewrite historical `node_name` values unless a future migration can prove the exact workflow node for each row.
- The current workspace is on `docs/tenant-standard-template-design`; execute this plan in an isolated worktree created from the latest `main` so unrelated documentation work is not mixed into the feature branch.

### Task 1: Add Standard Stage Labels To The Douyin Log API

**Files:**
- Modify: `apps/api/src/services/douyin-miniapp/content.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/content.ts`

- [ ] **Step 1: Write the failing service test**

Extend the existing `listSiteLogs` test so a canonical stage code produces a Chinese label:

```ts
expect(result.items[0]).toMatchObject({
  stage_code: "plumbing_electrical",
  stage_label: "水电",
});
```

Add a second fixture with an unknown legacy code and assert that the code is preserved while
`stage_label` is `null`. This preserves rolling compatibility without exposing guessed text.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd apps/api
SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_PUBLISH=test-publish-key \
  SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
  bun test src/services/douyin-miniapp/content.test.ts
```

Expected: FAIL because `mapLog()` does not return `stage_label`.

- [ ] **Step 3: Add backend-owned label serialization**

Import the existing domain helpers and extend `mapLog()`:

```ts
import {
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  toDouyinProjectPhase,
} from "@gooes/domain";

function mapLog(log: DouyinContentLog, resolveImageUrls: (value: unknown) => string[]) {
  const stageLabel = isProjectLogStageCode(log.stage_code)
    ? PROJECT_LOG_STAGE_CONFIG[log.stage_code].label
    : null;

  return {
    id: log.id,
    stage_code: log.stage_code,
    stage_label: stageLabel,
    node_name: log.node_name,
    images: resolvedHttpsImages(log.images, resolveImageUrls),
    created_at: log.created_at,
  };
}
```

Do not add a repository query or migration; `stage_code` is already selected and the label is domain data.

- [ ] **Step 4: Run the focused API test**

Run:

```bash
cd apps/api
SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_PUBLISH=test-publish-key \
  SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
  bun test src/services/douyin-miniapp/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the API contract change**

```bash
git add apps/api/src/services/douyin-miniapp/content.ts \
  apps/api/src/services/douyin-miniapp/content.test.ts
git commit -m "fix(douyin): expose construction log stage labels"
```

### Task 2: Make The Douyin Template Render Concrete Process Titles

**Files:**
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/api/content-validation.ts`
- Modify: `apps/douyin-mini/src/api/content.test.ts`
- Modify: `apps/douyin-mini/src/api/sites.test.ts`
- Modify: `apps/douyin-mini/src/pages/site-detail/site-progress.ts`
- Modify: `apps/douyin-mini/src/pages/site-detail/site-progress.test.ts`

- [ ] **Step 1: Add failing response-validation tests**

Add `stage_label: "水电"` to a valid site-log fixture and assert that parsing preserves it. Add a
compatibility fixture where `stage_label` is absent and assert parsing still succeeds with `null`.

```ts
expect(parseSiteLogPage(payload)?.items[0]).toMatchObject({
  stage_code: "plumbing_electrical",
  stage_label: "水电",
});
```

- [ ] **Step 2: Add failing title-priority tests**

Extend `site-progress.test.ts` with these cases:

```ts
expect(buildSiteProgress([{
  id: FIRST_ID,
  stage_code: "plumbing_electrical",
  stage_label: "水电",
  node_name: "强弱电开槽验收",
  images: [],
  created_at: "2026-08-31T06:30:00.000Z",
}])[0]?.title).toBe("强弱电开槽验收");

expect(buildSiteProgress([{
  id: SECOND_ID,
  stage_code: "tiling",
  stage_label: "瓦工",
  node_name: null,
  images: [],
  created_at: "2026-08-30T06:30:00.000Z",
}])[0]?.title).toBe("瓦工");

expect(buildSiteProgress([{
  id: THIRD_ID,
  stage_code: null,
  stage_label: null,
  node_name: null,
  images: [],
  created_at: "2026-08-29T06:30:00.000Z",
}])[0]?.title).toBe("施工记录");
```

- [ ] **Step 3: Run the focused Douyin tests and verify they fail**

Run:

```bash
cd apps/douyin-mini
bun test src/api/content.test.ts src/api/sites.test.ts \
  src/pages/site-detail/site-progress.test.ts
```

Expected: FAIL because `PublicSiteLog`, the parser, and the title builder do not consume
`stage_label`, and the final fallback is still “施工进度”.

- [ ] **Step 4: Extend the Douyin log model and parser**

Add the nullable field:

```ts
export type PublicSiteLog = {
  id: string;
  stage_code: string | null;
  stage_label: string | null;
  node_name: string | null;
  images: string[];
  created_at: string;
};
```

In `parseSiteLog()`, accept a missing field during rolling deployment and normalize it to `null`:

```ts
const stageLabel = value.stage_label === undefined ? null : value.stage_label;
if (!isNullableBoundedString(stageLabel, 80)) return null;

return images ? {
  id: value.id,
  stage_code: value.stage_code,
  stage_label: stageLabel,
  node_name: value.node_name,
  images,
  created_at: value.created_at,
} : null;
```

- [ ] **Step 5: Replace the generic title fallback**

Keep the compatibility map only for old API responses, and include all current canonical codes:

```ts
const STAGE_LABELS: Record<string, string> = {
  measure: "量房",
  demolition: "拆改",
  plumbing_electrical: "水电",
  tiling: "瓦工",
  woodwork: "木工",
  painting: "油工",
  installation: "安装",
  completion: "竣工",
  started: "已开工",
  construction: "施工中",
  constructing: "施工中",
  "water-electric": "水电",
};
```

Resolve each title with this exact priority:

```ts
const stageLabel = typeof item.stage_label === "string" && item.stage_label.trim()
  ? item.stage_label.trim()
  : "";

title: nodeName
  || stageLabel
  || (stageCode ? STAGE_LABELS[stageCode] : "")
  || "施工记录",
```

- [ ] **Step 6: Run the complete Douyin mini-program check**

Run:

```bash
pnpm douyin-mini:check
```

Expected: all Bun tests pass and TypeScript exits with code `0`.

- [ ] **Step 7: Commit the template change**

```bash
git add apps/douyin-mini/src/models/index.ts \
  apps/douyin-mini/src/api/content-validation.ts \
  apps/douyin-mini/src/api/content.test.ts \
  apps/douyin-mini/src/pages/site-detail/site-progress.ts \
  apps/douyin-mini/src/pages/site-detail/site-progress.test.ts
git commit -m "fix(douyin): show concrete construction process titles"
```

### Task 3: Snapshot The Current Workflow Process When Creating Logs

**Files:**
- Create: `apps/api/src/services/project-logs/node-name.ts`
- Create: `apps/api/src/services/project-logs/node-name.test.ts`
- Modify: `apps/api/src/services/project-workflow-mutation-guards.ts`
- Modify: `apps/api/src/services/project-workflow-mutation-guards.test.ts`
- Modify: `apps/api/src/services/project-logs.ts`
- Modify: `apps/api/src/services/project-logs.test.ts`

- [ ] **Step 1: Write failing pure resolver tests**

Create tests for three rules:

```ts
expect(resolveProjectLogNodeName({
  requestedNodeName: "厨房墙砖铺贴",
  stageCode: "tiling",
  workflowProgress,
})).toBe("厨房墙砖铺贴");

expect(resolveProjectLogNodeName({
  requestedNodeName: null,
  stageCode: "plumbing_electrical",
  workflowProgress,
})).toBe("水电布管布线");

expect(resolveProjectLogNodeName({
  requestedNodeName: null,
  stageCode: "woodwork",
  workflowProgress: null,
})).toBeNull();
```

The fixture must contain a current timeline node whose `attributes.stage_code` is
`plumbing_electrical` and whose `node_title` is `水电布管布线`.

- [ ] **Step 2: Run the resolver test and verify it fails**

Run:

```bash
cd apps/api
bun test src/services/project-logs/node-name.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure resolver**

```ts
import type { ProjectLogStageCode } from "@gooes/domain";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";

export function resolveProjectLogNodeName(input: {
  requestedNodeName?: string | null;
  stageCode: ProjectLogStageCode;
  workflowProgress: ProjectWorkflowProgress | null;
}) {
  const requested = input.requestedNodeName?.trim();
  if (requested) return requested;
  if (input.workflowProgress?.source !== "workflow_runtime") return null;

  const node = input.workflowProgress.timeline_nodes.find((item) =>
    item.attributes.stage_code === input.stageCode &&
    (item.node_key === input.workflowProgress?.current_node_key || item.status === "current")
  );
  return node?.node_title.trim() || null;
}
```

Do not fall back to the project’s current node if its `stage_code` differs from the submitted log.

- [ ] **Step 4: Make the workflow guard return verified progress**

After `assertProjectWorkflowStageMutationAllowedFromProgress()` succeeds, return the fetched
`workflowProgress` from `assertProjectWorkflowStageMutationAllowed()`. Add a guard test that asserts
the returned object is the exact verified runtime object. Existing callers may ignore the return value.

- [ ] **Step 5: Write the failing project-log creation test**

Update the guard mock to return a workflow runtime with the current `tiling` node. Add a creation case
with `node_name: null` and assert the repository receives:

```ts
expect(create).toHaveBeenCalledWith(expect.objectContaining({
  stage_code: "tiling",
  node_name: "瓦工铺贴",
}));
```

Retain the existing explicit-name case and assert that a client-supplied non-empty name is not
overwritten.

- [ ] **Step 6: Resolve the snapshot in the service layer**

Capture the verified workflow progress returned by the guard, build a normalized payload with
`resolveProjectLogNodeName()`, and pass that payload to `createWorkflowApprovedConstructionLog()`.
The controller remains HTTP-only and the repository remains responsible only for persistence.

- [ ] **Step 7: Run focused backend tests**

Run:

```bash
cd apps/api
bun test src/services/project-logs/node-name.test.ts \
  src/services/project-workflow-mutation-guards.test.ts \
  src/services/project-logs.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the workflow snapshot change**

```bash
git add apps/api/src/services/project-logs/node-name.ts \
  apps/api/src/services/project-logs/node-name.test.ts \
  apps/api/src/services/project-workflow-mutation-guards.ts \
  apps/api/src/services/project-workflow-mutation-guards.test.ts \
  apps/api/src/services/project-logs.ts \
  apps/api/src/services/project-logs.test.ts
git commit -m "fix(project-logs): snapshot workflow process names"
```

### Task 4: Verify The Complete Gooes Change

**Files:**
- Verify: `apps/api/src/services/douyin-miniapp/content.test.ts`
- Verify: `apps/api/src/services/project-logs.test.ts`
- Verify: `apps/douyin-mini/src/pages/site-detail/site-progress.test.ts`
- Verify: `apps/douyin-mini/src/api/sites.test.ts`
- Verify: `docs/state_machine_migrate/2026-08-31-project-log-process-title-wechat-handoff.md`

- [ ] **Step 1: Run the API checks**

```bash
pnpm api:typecheck
pnpm api:build
pnpm api:check-file-size
```

Expected: every command exits with code `0`.

- [ ] **Step 2: Run the complete Douyin checks**

```bash
pnpm douyin-mini:check
```

Expected: all tests pass and typecheck exits with code `0`.

- [ ] **Step 3: Run focused regression tests once more**

```bash
cd apps/api
SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_PUBLISH=test-publish-key \
  SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
  bun test src/services/douyin-miniapp/content.test.ts \
    src/services/project-logs/node-name.test.ts \
    src/services/project-workflow-mutation-guards.test.ts \
    src/services/project-logs.test.ts
cd ../douyin-mini
bun test src/api/content.test.ts src/api/sites.test.ts \
  src/pages/site-detail/site-progress.test.ts
```

Expected: zero failures.

- [ ] **Step 4: Confirm no database migration was introduced**

```bash
git diff --name-only main...HEAD -- supabase/migrations
```

Expected: no output.

- [ ] **Step 5: Commit the handoff document if it is not already committed**

```bash
git add docs/state_machine_migrate/2026-08-31-project-log-process-title-wechat-handoff.md
git commit -m "docs(miniprogram): document construction log title contract"
```

### Task 5: Development Deployment And Cross-Client Smoke

**Files:**
- Read-only reference: `/Users/leefo/Public/work/orange/src/services/project_log_helpers.ts`
- Read-only reference: `/Users/leefo/Public/work/orange/src/packageVisitor/pages/visitor-project-detail/components/ProjectLogTimeline.tsx`
- No orange file may be modified from the gooes workspace.

- [ ] **Step 1: Push a feature branch and create a PR**

Use a feature branch based on current `main`, push it, and open a PR with the focused test evidence.
Do not include changes from `docs/tenant-standard-template-design`.

- [ ] **Step 2: Deploy the PR/main candidate to development**

Wait for API and admin/Douyin build jobs to finish. Do not continue if the image build or development
deployment is red.

- [ ] **Step 3: Run API smoke in development**

For a published in-progress project with existing logs, verify:

```text
GET /front/projects/:id/logs?page=1&pageSize=10
GET /douyin-mini/sites/:id/logs?page=1&pageSize=20
```

Expected:

- Both responses remain paginated.
- Canonical logs include Chinese `stage_label`.
- Logs with a saved `node_name` preserve it.
- No customer phone, exact address, employee details, or internal-only content is added.

- [ ] **Step 4: Create one new workflow log without a client node name**

Create the log through the normal authenticated employee flow while a procedure node is current.
Read it back and verify `node_name` equals that procedure’s workflow node title and remains unchanged
after the workflow advances.

- [ ] **Step 5: Ask the WeChat team to run its checklist**

Send the handoff document and request the orange commit SHA plus evidence for visitor detail, customer
home/detail/share, and employee detail. The gooes agent remains read-only against orange.

### Task 6: Merge And Release

**Files:**
- No additional source files.

- [ ] **Step 1: Squash merge after required checks pass**

Use one squash commit describing backend snapshotting, Douyin display compatibility, and tests. Update
local `main` with fast-forward only after the PR is merged.

- [ ] **Step 2: Monitor development deployment**

Confirm the merged commit is the deployed API revision and the development smoke still passes.

- [ ] **Step 3: Upload and confirm the new Douyin template**

Upload `apps/douyin-mini`, confirm it as the latest platform template, generate a new tenant experience
version, and verify the timeline shows concrete process titles. An API deployment alone cannot update an
already released Douyin client template.

- [ ] **Step 4: Deploy the backend to production**

Deploy only after development API, Douyin experience version, and WeChat test evidence all pass. Monitor
the production release and verify the production API revision.

- [ ] **Step 5: Publish client versions independently**

Publish the reviewed Douyin tenant version through its normal audit/release flow. The WeChat team owns
its own review and release. Verify both clients against the same project-log fixtures after release.

- [ ] **Step 6: Production acceptance**

Confirm all of the following:

```text
specific node_name present  -> display concrete process name
node_name missing           -> display Chinese stage_label
both missing                -> display “施工记录”
canonical stage_code        -> never display internal English code
workflow advanced           -> historical title remains unchanged
```
