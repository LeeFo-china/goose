# Admin Release Center Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Admin super-admin development releases and implement evidence-bound, two-stage production candidate build and deployment.

**Architecture:** `release-dev.yml` and `release-production.yml` become stable Admin-facing orchestrators over reusable build and deploy workflows. The API dispatches only those orchestrators, validates production candidate artifacts through a dedicated GitHub gateway, and exposes normalized stages; the Admin workbench separates development release, production candidate build, evidence review, and explicit production deployment.

**Tech Stack:** Bun 1.3, TypeScript, Fastify decorators, Zod 4, GitHub Actions, GitHub REST API 2022-11-28, Next.js 15, React 19, shadcn/Radix, Tailwind CSS 3, Bun test, Playwright.

---

## Execution rules

- Execute in an isolated worktree created with `using-git-worktrees`; do not modify the main working tree during implementation.
- Use `test-driven-development`: add one failing contract at a time, observe the expected failure, implement the smallest complete behavior, and rerun the focused test.
- Use `coding-standards` for every TypeScript/JavaScript edit and Conventional Commit.
- Before editing Admin UI, invoke `shadcn`, `admin-design`, `impeccable`, and `design-taste-frontend`. Read component docs before use; do not introduce another visual system.
- Do not dispatch a real production deployment during implementation or verification.
- No database change is planned. If implementation unexpectedly needs schema, RLS, seed, function, or index changes, stop and return to design; do not modify a remote database manually.
- The API artifact reader adds one focused dependency, `fflate@0.8.2`, because GitHub returns artifact content as ZIP and the Bun runtime image does not guarantee a system `unzip`. A handwritten ZIP parser and a Docker system-package addition are rejected as larger and riskier alternatives.
- GitHub REST behavior must follow the official workflow-run and artifact endpoints: `GET /actions/runs/{run_id}`, `GET /actions/runs/{run_id}/artifacts`, and `GET /actions/artifacts/{artifact_id}/zip`.

## File map

### GitHub Actions and evidence scripts

- Create `.github/workflows/release-dev.yml`: stable Admin development build-and-deploy orchestrator.
- Create `.github/workflows/release-production.yml`: stable production candidate build/deploy orchestrator.
- Modify `.github/workflows/build-docker-images.yml`: add reusable inputs/outputs and environment-specific build-plan artifact names.
- Modify `.github/workflows/deploy-dev.yml`: accept same-run build evidence only from the trusted development orchestrator while retaining completed-run manual/automatic modes.
- Modify `.github/workflows/deploy-docker-services.yml`: validate non-Web production build evidence and allow an exact verified candidate Tag for reusable calls.
- Modify `.github/workflows/auto-deploy-dev.yml`: pass explicit completed-run evidence mode/path without changing automatic push semantics.
- Create `scripts/resolve-admin-release-services.mjs`: one canonical Admin service-to-image/deploy mapping; production `all` excludes Web.
- Create `scripts/verify-production-release-candidate.mjs`: fail-closed candidate/build-plan/manifest verifier used on runners.
- Create `scripts/release-orchestration-contract.test.ts`: source and service-mapping workflow contracts.
- Create `scripts/verify-production-release-candidate.test.ts`: valid and tampered evidence tests.

### API

- Create `apps/api/src/gateways/github-actions.ts`: GitHub JSON/binary requests and bounded artifact ZIP decoding.
- Create `apps/api/src/gateways/github-actions.test.ts`: redirect, exact artifact, expiry, size, ZIP, and JSON tests.
- Create `apps/api/src/services/release-deployments/legacy/candidates.ts`: production candidate validation/query/deploy orchestration.
- Create `apps/api/src/services/release-deployments/legacy/candidates.test.ts`: run/tag/artifact/service/idempotency tests.
- Create `apps/api/src/services/release-deployments/legacy/dispatch.test.ts`: Admin-to-workflow dispatch request regression tests.
- Modify `apps/api/src/schema/release-deployments.ts`: candidate params/deploy body and production build confirmation.
- Create `apps/api/src/schema/release-deployments.test.ts`: schema safety tests.
- Modify `apps/api/src/controllers/admin-ops/index.ts`: thin candidate GET/POST endpoints.
- Modify `apps/api/src/services/release-deployments/legacy-service.ts`: bind candidate methods.
- Modify `apps/api/src/services/release-deployments/legacy/{dispatch,runs,shared,types}.ts`: orchestrator mappings, stages, metadata, and types.
- Modify `apps/api/src/services/release-deployments/legacy/tags.ts`: candidate-oriented Tag and rollback Tag messages.
- Modify `apps/api/src/errors/error-codes.ts`: candidate-specific business errors.
- Modify `apps/api/package.json`, `bun.lock`, and `pnpm-lock.yaml`: add and lock `fflate@0.8.2` for runtime ZIP decoding.

### Admin

- Create `apps/admin/components/ops/release-candidate-evidence.tsx`: candidate evidence, disabled reasons, and final production confirmation.
- Create `apps/admin/components/ops/release-deployments-workbench.test.ts`: UI source and pure-state contracts.
- Modify `apps/admin/components/ops/ops-types.ts`: release stage and candidate types.
- Modify `apps/admin/components/ops/release-deployments-shared.ts`: candidate GET/deploy requests and stage presentation helpers.
- Modify `apps/admin/components/ops/release-deployments-panel.tsx`: production candidate selection/loading and refresh orchestration.
- Modify `apps/admin/components/ops/release-deployments-dispatch-card.tsx`: development release and production candidate build semantics.
- Modify `apps/admin/components/ops/release-deployments-sections.tsx`: stage-aware run table and candidate action.
- Modify `apps/admin/components/ops/ops-page-hardening.test.ts`: preserve shadcn card composition and no nested cards.
- Add `apps/admin/components/ui/spinner.tsx` through the shadcn CLI only if the installed registry docs confirm it is the current button-loading composition.

### Operations documentation

- Modify `docs/2026-05-17-admin-release-center-production-safety-guide.md`: describe the new two-stage production procedure, recovery, and prohibition on treating a build as deployment.

## Task 1: Lock the service and candidate evidence contracts

**Files:**
- Create: `scripts/resolve-admin-release-services.mjs`
- Create: `scripts/verify-production-release-candidate.mjs`
- Create: `scripts/release-orchestration-contract.test.ts`
- Create: `scripts/verify-production-release-candidate.test.ts`

- [ ] **Step 1: Write the failing service mapping tests**

Create `scripts/release-orchestration-contract.test.ts` with a subprocess helper that asserts exact canonical output:

```ts
import { describe, expect, test } from "bun:test";
const resolver = new URL("./resolve-admin-release-services.mjs", import.meta.url);

function resolve(mode: "requested" | "build", services: string) {
  const result = Bun.spawnSync(["node", resolver.pathname, mode, services]);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

describe("Admin release service mapping", () => {
  test("expands production all without Web", () => {
    expect(resolve("requested", "all")).toEqual({
      exitCode: 0,
      stdout: "api,admin,social-video-worker,cos-reconcile-worker",
      stderr: "",
    });
    expect(resolve("build", "all").stdout).toBe("api,admin,social-video-worker");
  });

  test("maps the COS worker to the immutable API image", () => {
    expect(resolve("requested", "cos-reconcile-worker").stdout).toBe("cos-reconcile-worker");
    expect(resolve("build", "cos-reconcile-worker").stdout).toBe("api");
  });

  test("deduplicates in stable dependency order and rejects Web", () => {
    expect(resolve("requested", "admin,api,admin").stdout).toBe("api,admin");
    expect(resolve("build", "web")).toMatchObject({ exitCode: 1 });
  });
});
```

- [ ] **Step 2: Run the service mapping contract and observe the expected failure**

Run:

```bash
bun test scripts/release-orchestration-contract.test.ts
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement the canonical service resolver**

Create `scripts/resolve-admin-release-services.mjs` with this exact behavior:

```js
const [mode = "requested", rawServices = ""] = process.argv.slice(2);
const requestedOrder = ["api", "admin", "social-video-worker", "cos-reconcile-worker"];
const allowed = new Set(requestedOrder);

function reject(message) {
  console.error(message);
  process.exit(1);
}

if (mode !== "requested" && mode !== "build") reject(`Unknown mode: ${mode}`);

const normalized = rawServices.replaceAll(/\s/g, "");
const selected = normalized === "all"
  ? requestedOrder
  : normalized.split(",").filter(Boolean);

if (selected.length === 0) reject("No Admin release service selected");
for (const service of selected) {
  if (!allowed.has(service)) reject(`Unsupported Admin release service: ${service}`);
}

const requested = requestedOrder.filter((service) => selected.includes(service));
const result = mode === "requested"
  ? requested
  : [
      ...(requested.some((service) => service === "api" || service === "cos-reconcile-worker") ? ["api"] : []),
      ...(requested.includes("admin") ? ["admin"] : []),
      ...(requested.includes("social-video-worker") ? ["social-video-worker"] : []),
    ];

console.log(result.join(","));
```

- [ ] **Step 4: Write failing production candidate verifier tests**

Create `scripts/verify-production-release-candidate.test.ts`. Build one valid candidate, plan, and manifest set in memory and assert these mutations throw: development environment, wrong run ID, wrong SHA, service mismatch, missing API manifest for COS, Web service, and malformed digest.

```ts
import { describe, expect, test } from "bun:test";
import { verifyProductionReleaseCandidate } from "./verify-production-release-candidate.mjs";

const sha = "a".repeat(40);
const candidate = {
  schema_version: 1,
  build_run_id: 123,
  tag: "v2026.07.13.1",
  commit_sha: sha,
  requested_services: ["api", "cos-reconcile-worker"],
  build_services: ["api"],
  target_environment: "production",
  build_plan_artifact: "production-build-plan",
};
const plan = {
  schema_version: 1,
  workflow_run_id: 123,
  commit_sha: sha,
  target_environment: "production",
  build_services: ["api"],
  deploy_services: ["api", "cos-reconcile-worker"],
  no_op: false,
};
const manifests = {
  api: {
    service: "api",
    commit_sha: sha,
    target_environment: "production",
    digest: `sha256:${"b".repeat(64)}`,
  },
};

describe("production release candidate evidence", () => {
  test("accepts a complete production candidate", () => {
    expect(verifyProductionReleaseCandidate(candidate, plan, manifests, {
      runId: "123",
      sha,
      services: ["api", "cos-reconcile-worker"],
    })).toEqual(candidate);
  });

  test.each([
    ["environment", { ...candidate, target_environment: "development" }],
    ["run", { ...candidate, build_run_id: 124 }],
    ["sha", { ...candidate, commit_sha: "c".repeat(40) }],
    ["web", { ...candidate, requested_services: ["web"] }],
  ])("rejects tampered %s evidence", (_name, value) => {
    expect(() => verifyProductionReleaseCandidate(value, plan, manifests, {
      runId: "123",
      sha,
      services: ["api", "cos-reconcile-worker"],
    })).toThrow();
  });
});
```

- [ ] **Step 5: Run the candidate test and observe the missing verifier failure**

Run:

```bash
bun test scripts/verify-production-release-candidate.test.ts
```

Expected: FAIL with a missing module/export error.

- [ ] **Step 6: Implement the fail-closed candidate verifier**

Create `scripts/verify-production-release-candidate.mjs`. Export `verifyProductionReleaseCandidate(candidate, plan, manifests, expected)` and provide a CLI accepting candidate path, plan path, manifest directory, expected run ID, expected SHA, and expected comma-separated services. The function must:

```js
const RELEASE_SERVICES = ["api", "admin", "social-video-worker", "cos-reconcile-worker"];
const IMAGE_SERVICES = ["api", "admin", "social-video-worker"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function verifyProductionReleaseCandidate(candidate, plan, manifests, expected) {
  assert(candidate?.schema_version === 1, "candidate schema_version must be 1");
  assert(String(candidate.build_run_id) === String(expected.runId), "candidate build_run_id mismatch");
  assert(candidate.target_environment === "production", "candidate environment must be production");
  assert(candidate.commit_sha === expected.sha && /^[a-f0-9]{40}$/.test(candidate.commit_sha), "candidate SHA mismatch");
  assert(/^v\d{4}\.\d{2}\.\d{2}\.\d+$/.test(candidate.tag), "candidate tag is invalid");
  assert(Array.isArray(candidate.requested_services), "candidate requested_services missing");
  assert(candidate.requested_services.every((service) => RELEASE_SERVICES.includes(service)), "candidate service is invalid");
  assert(!candidate.requested_services.includes("web"), "production Web is not an Admin release service");
  assert(sameArray(candidate.requested_services, expected.services), "candidate service scope mismatch");
  assert(plan?.schema_version === 1, "build plan schema_version must be 1");
  assert(String(plan.workflow_run_id) === String(expected.runId), "build plan run mismatch");
  assert(plan.commit_sha === expected.sha, "build plan SHA mismatch");
  assert(plan.target_environment === "production", "build plan environment mismatch");
  assert(plan.no_op === false, "production candidate cannot be no-op");
  assert(Array.isArray(candidate.build_services), "candidate build_services missing");
  assert(Array.isArray(plan.build_services), "build plan build_services missing");
  assert(Array.isArray(plan.deploy_services), "build plan deploy_services missing");
  assert(sameArray(plan.build_services, candidate.build_services), "build service mismatch");
  assert(sameArray(plan.deploy_services, candidate.requested_services), "deploy service mismatch");
  for (const service of candidate.build_services) {
    assert(IMAGE_SERVICES.includes(service), `unsupported image service: ${service}`);
    const manifest = manifests[service];
    assert(manifest?.service === service, `manifest service mismatch: ${service}`);
    assert(manifest.commit_sha === expected.sha, `manifest SHA mismatch: ${service}`);
    assert(manifest.target_environment === "production", `manifest environment mismatch: ${service}`);
    assert(/^sha256:[a-f0-9]{64}$/.test(manifest.digest), `manifest digest mismatch: ${service}`);
  }
  return candidate;
}
```

The CLI must catch validation errors, print only the validation message to stderr, and exit 1. On success it prints the normalized candidate JSON to stdout.

Use this concrete CLI boundary after the exported function:

```js
if (import.meta.main) {
  try {
    const [candidatePath, planPath, manifestDirectory, runId, sha, rawServices] = process.argv.slice(2);
    assert(candidatePath && planPath && manifestDirectory && runId && sha && rawServices, "candidate verifier arguments are required");
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const manifests = Object.fromEntries(
      candidate.build_services.map((service) => [
        service,
        JSON.parse(readFileSync(join(manifestDirectory, `image-manifest-${service}.json`), "utf8")),
      ]),
    );
    const verified = verifyProductionReleaseCandidate(candidate, plan, manifests, {
      runId,
      sha,
      services: rawServices.split(",").filter(Boolean),
    });
    process.stdout.write(`${JSON.stringify(verified)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "candidate evidence is invalid");
    process.exit(1);
  }
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun test scripts/verify-production-release-candidate.test.ts
```

Expected: PASS. The workflow-file test remains red until Tasks 3 and 4, so run only the verifier test at this checkpoint.

- [ ] **Step 8: Commit the evidence primitives**

```bash
git add scripts/resolve-admin-release-services.mjs scripts/verify-production-release-candidate.mjs scripts/release-orchestration-contract.test.ts scripts/verify-production-release-candidate.test.ts
git commit -m "test(ci): 固化版本发布证据契约"
```

## Task 2: Make the image build workflow reusable without changing push behavior

**Files:**
- Modify: `.github/workflows/build-docker-images.yml`
- Modify: `scripts/release-orchestration-contract.test.ts`

- [ ] **Step 1: Add failing reusable-build assertions**

Extend the workflow contract test with assertions for:

```ts
import { readFileSync } from "node:fs";

const build = readFileSync(new URL("../.github/workflows/build-docker-images.yml", import.meta.url), "utf8");
expect(build).toContain("workflow_call:");
expect(build).toContain("value: ${{ jobs.validate-request.outputs.build_services }}");
expect(build).toContain("value: ${{ jobs.validate-request.outputs.target_environment }}");
expect(build).toContain("production-build-plan");
expect(build).toContain("dev-build-plan");
```

Also assert `auto-deploy-dev.yml` still downloads `dev-build-plan` and still requires upstream event `push`.

- [ ] **Step 2: Run the focused contract and verify it fails**

Run:

```bash
bun test scripts/release-orchestration-contract.test.ts --test-name-pattern "reusable build"
```

Expected: FAIL because `workflow_call` and production plan naming are absent.

- [ ] **Step 3: Add reusable inputs and outputs**

Under `on:` in `.github/workflows/build-docker-images.yml`, retain `push` and `workflow_dispatch`, then add:

```yaml
  workflow_call:
    inputs:
      target_environment:
        required: true
        type: string
      service:
        required: true
        type: string
    outputs:
      build_services:
        value: ${{ jobs.validate-request.outputs.build_services }}
      deploy_services:
        value: ${{ jobs.validate-request.outputs.deploy_services }}
      no_op:
        value: ${{ jobs.validate-request.outputs.no_op }}
      target_environment:
        value: ${{ jobs.validate-request.outputs.target_environment }}
```

Keep the current push branch unchanged. In the non-push branch, use the shared `inputs.target_environment` and `inputs.service`, which are defined for both manual and reusable calls.

- [ ] **Step 4: Upload an environment-specific build plan**

Change the plan upload step to:

```yaml
      - name: Upload immutable build plan
        uses: actions/upload-artifact@v6
        with:
          name: ${{ steps.resolve.outputs.target_environment == 'production' && 'production-build-plan' || 'dev-build-plan' }}
          path: build-plan.json
          if-no-files-found: error
          retention-days: 30
```

Do not rename the development artifact consumed by `auto-deploy-dev.yml`.

- [ ] **Step 5: Run build/automatic-deploy contracts**

Run:

```bash
bun test scripts/release-orchestration-contract.test.ts scripts/deploy-dev-workflow-contract.test.ts
```

Expected: PASS. Development and production orchestrator tests are added only in their owning tasks, so the committed suite stays green.

- [ ] **Step 6: Commit the reusable build contract**

```bash
git add .github/workflows/build-docker-images.yml scripts/release-orchestration-contract.test.ts
git commit -m "refactor(ci): 提供可复用镜像构建契约"
```

## Task 3: Implement the trusted development release orchestrator

**Files:**
- Create: `.github/workflows/release-dev.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Modify: `.github/workflows/auto-deploy-dev.yml`
- Modify: `scripts/release-orchestration-contract.test.ts`

- [ ] **Step 1: Add failing development orchestration assertions**

Assert that `release-dev.yml`:

```ts
expect(dev).toContain("uses: ./.github/workflows/build-docker-images.yml");
expect(dev).toContain("target_environment: development");
expect(dev).toContain("uses: ./.github/workflows/verify-dev-migration-history.yml");
expect(dev).toContain("uses: ./.github/workflows/deploy-dev.yml");
expect(dev).toContain("evidence_mode: same_run");
expect(dev).toContain("expected_build_workflow_path: .github/workflows/release-dev.yml");
expect(dev).not.toContain("gooes-prod-deploy");
expect(dev).not.toContain("1.13.20.39");
```

Assert `deploy-dev.yml` contains an explicit `same_run|completed_run` case and trusted path allowlist, and that `auto-deploy-dev.yml` passes `completed_run` plus `.github/workflows/build-docker-images.yml`.

- [ ] **Step 2: Run the development contract and observe failure**

```bash
bun test scripts/release-orchestration-contract.test.ts --test-name-pattern "development orchestrator"
```

Expected: FAIL because the orchestrator and evidence-mode inputs are absent.

- [ ] **Step 3: Create `.github/workflows/release-dev.yml`**

Implement these jobs and dependencies:

```yaml
name: Release Dev
run-name: Dev release ${{ inputs.service }} from ${{ github.ref_name }}

on:
  workflow_dispatch:
    inputs:
      service:
        required: true
        type: string
      operation:
        required: true
        default: release
        type: choice
        options: [release, rollback]
      reason:
        required: false
        default: ""
        type: string

permissions:
  contents: read
  actions: read

concurrency:
  group: admin-release-development
  cancel-in-progress: false
```

The `prepare` job checks out the selected ref, requires a full `github.sha`, calls `node scripts/resolve-admin-release-services.mjs requested/build`, and exports requested CSV, build CSV, API flag, rest flag, and a JSON matrix. The `build` job calls `build-docker-images.yml` with `development`. The `migration` job calls `verify-dev-migration-history.yml` with the existing pinned migration version and `auto-predeploy-migration-${{ github.sha }}`. Deploy API first when selected; deploy remaining services with `max-parallel: 1`. Every call to `deploy-dev.yml` passes:

```yaml
      commit_sha: ${{ github.sha }}
      build_run_id: ${{ github.run_id }}
      expected_build_event: workflow_dispatch
      evidence_mode: same_run
      expected_build_workflow_path: .github/workflows/release-dev.yml
```

Add an always-run summary that fails when any required barrier failed and writes ref, SHA, requested/build services, build result, migration result, each deploy result, and final outcome to `GITHUB_STEP_SUMMARY`.

- [ ] **Step 4: Extend `deploy-dev.yml` evidence validation**

Add optional `workflow_call` inputs:

```yaml
      evidence_mode:
        required: false
        default: completed_run
        type: string
      expected_build_workflow_path:
        required: false
        default: .github/workflows/build-docker-images.yml
        type: string
```

In “Validate immutable build evidence”, use this exact security split:

```bash
case "${EVIDENCE_MODE}" in
  same_run)
    test "${INPUT_BUILD_RUN_ID}" = "${GITHUB_RUN_ID}"
    test "$(jq -r '.path | split("@")[0]' <<< "${current_run_json}")" = "${EXPECTED_BUILD_WORKFLOW_PATH}"
    test "$(jq -r '.event' <<< "${current_run_json}")" = "workflow_dispatch"
    test "$(jq -r '.head_sha' <<< "${current_run_json}")" = "${SOURCE_SHA}"
    test "${EXPECTED_BUILD_WORKFLOW_PATH}" = ".github/workflows/release-dev.yml"
    ;;
  completed_run)
    run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${INPUT_BUILD_RUN_ID}")"
    test "$(jq -r '.path | split("@")[0]' <<< "${run_json}")" = "${EXPECTED_BUILD_WORKFLOW_PATH}"
    test "${EXPECTED_BUILD_WORKFLOW_PATH}" = ".github/workflows/build-docker-images.yml"
    test "$(jq -r '.event' <<< "${run_json}")" = "${EXPECTED_BUILD_EVENT}"
    test "$(jq -r '.conclusion' <<< "${run_json}")" = success
    test "$(jq -r '.head_sha' <<< "${run_json}")" = "${SOURCE_SHA}"
    ;;
  *) exit 1 ;;
esac
```

Keep all manifest environment/SHA/digest checks after this split. Normalize `.path` by stripping an optional `@ref` suffix because the current GitHub workflow-run representation may include it.

- [ ] **Step 5: Make automatic development calls explicit**

For every `deploy-dev.yml` call in `.github/workflows/auto-deploy-dev.yml`, pass:

```yaml
      evidence_mode: completed_run
      expected_build_workflow_path: .github/workflows/build-docker-images.yml
```

Do not change the `workflow_run` branch/event/conclusion authorization.

- [ ] **Step 6: Run development workflow tests**

```bash
bun test scripts/release-orchestration-contract.test.ts scripts/deploy-dev-workflow-contract.test.ts
```

Expected: development orchestration and existing remote-image contracts PASS; production orchestrator assertion remains red until Task 4.

- [ ] **Step 7: Commit development orchestration**

```bash
git add .github/workflows/release-dev.yml .github/workflows/deploy-dev.yml .github/workflows/auto-deploy-dev.yml scripts/release-orchestration-contract.test.ts
git commit -m "feat(ci): 增加后台开发发布编排"
```

## Task 4: Implement production candidate build and evidence-bound deployment

**Files:**
- Create: `.github/workflows/release-production.yml`
- Modify: `.github/workflows/deploy-docker-services.yml`
- Modify: `scripts/release-orchestration-contract.test.ts`

- [ ] **Step 1: Add failing production orchestration assertions**

Require the production workflow to contain:

```ts
expect(production).toContain("options: [build, deploy]");
expect(production).toContain("target_environment: production");
expect(production).toContain("production-release-candidate");
expect(production).toContain("production-deployment-receipt-");
expect(production).toContain("verify-production-release-candidate.mjs");
expect(production).toContain("confirm_text");
expect(production).not.toContain("target_environment: development");
expect(production).not.toContain('"web"');
```

Require `deploy-docker-services.yml` to accept `build_run_id`, validate manifests before `Ensure Docker daemon`, keep manual `main` guard, and use exact Tag/SHA guard for reusable calls.

- [ ] **Step 2: Run the production contract and observe failure**

```bash
bun test scripts/release-orchestration-contract.test.ts --test-name-pattern "production orchestrator"
```

Expected: FAIL because `release-production.yml` is absent.

- [ ] **Step 3: Create the production build phase**

Create `.github/workflows/release-production.yml` with manual inputs:

```yaml
name: Release Production
run-name: Production ${{ inputs.operation }} ${{ inputs.service }} candidate ${{ inputs.build_run_id || github.ref_name }}

on:
  workflow_dispatch:
    inputs:
      operation:
        required: true
        type: choice
        options: [build, deploy]
      service:
        required: true
        type: string
      build_run_id:
        required: false
        default: ""
        type: string
      commit_sha:
        required: false
        default: ""
        type: string
      confirm_text:
        required: true
        type: string
      reason:
        required: false
        default: ""
        type: string
```

Use `permissions: contents: read, actions: read`, production environment only on the actual deploy job, and `cancel-in-progress: false`. Build runs use a Tag-scoped concurrency group; deploy runs use a candidate-scoped wrapper group, while `deploy-docker-services.yml` remains the global production Docker mutex.

The `prepare-build` job runs only for `build`, requires `GITHUB_REF_TYPE=tag`, `确认构建生产候选`, a valid release Tag, and canonical requested/build services. The reusable `build` job passes explicit `target_environment: production` and canonical build CSV.

After build succeeds, the `candidate` job downloads `production-build-plan` and each required `image-manifest-<service>`, runs the verifier, creates this artifact, and uploads it as `production-release-candidate`:

```json
{
  "schema_version": 1,
  "build_run_id": 123,
  "tag": "v2026.07.13.1",
  "commit_sha": "40-character SHA",
  "requested_services": ["api", "admin"],
  "build_services": ["api", "admin"],
  "target_environment": "production",
  "build_plan_artifact": "production-build-plan"
}
```

The job fails if any required plan/manifest is absent; artifact upload is the final candidate-build step so a successful build-phase run proves candidate creation completed.

- [ ] **Step 4: Implement the production deploy phase**

The `authorize-deploy` job runs only for `deploy`, requires:

```bash
test "${GITHUB_REF_TYPE}" = tag
test "${CONFIRM_TEXT}" = "确认部署生产环境"
[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]
[[ "${COMMIT_SHA}" =~ ^[a-f0-9]{40}$ ]]
test "${GITHUB_SHA}" = "${COMMIT_SHA}"
```

It fetches the build run, requires normalized path `.github/workflows/release-production.yml`, event `workflow_dispatch`, conclusion `success`, matching head SHA, downloads `production-release-candidate`, `production-build-plan`, and every required manifest, then calls `verify-production-release-candidate.mjs` with the canonical requested services. Before allowing deployment it queries repository artifacts by exact name `production-deployment-receipt-${BUILD_RUN_ID}` and rejects a non-expired prior success receipt.

Call `deploy-docker-services.yml` with canonical requested services, `built_image_sha`, `build_run_id`, and `确认部署生产环境`. The wrapper summary reports the reusable deploy result but does not upload the success receipt itself.

- [ ] **Step 5: Strengthen `deploy-docker-services.yml` before Docker mutation**

Add reusable input `build_run_id`. In the guard:

- manual `workflow_dispatch` remains restricted to `main` and its existing confirmation;
- reusable `workflow_call` requires the current normalized path to be `.github/workflows/release-production.yml`, `GITHUB_REF_TYPE=tag`, `built_image_sha=GITHUB_SHA`, a numeric build run ID, and the exact confirmation;
- download and validate candidate, production build plan, and manifests before `Ensure Docker daemon`;
- query `production-deployment-receipt-${BUILD_RUN_ID}` again after acquiring the global production deployment mutex and before any Docker mutation, closing the race between two queued wrappers;
- reject `web` and reject any requested service not in the Admin release resolver;
- keep production Runner name `gooes-prod-vm-0-3`, directory `/opt/supabase/docker`, and environment `production` unchanged.

Change the global production concurrency to `cancel-in-progress: false`. As the final step after all existing container/domain health checks pass, `deploy-docker-services.yml` uploads a JSON receipt named `production-deployment-receipt-${BUILD_RUN_ID}` containing schema version, build/deploy run IDs, Tag, SHA, canonical services, and completion time. Because receipt upload is inside the globally serialized reusable workflow, the next queued deployment sees it before Docker mutation.

Do not weaken the existing Web-only Gate. The Admin production orchestrator does not pass Web.

- [ ] **Step 6: Run all workflow/evidence tests**

```bash
bun test scripts/release-orchestration-contract.test.ts scripts/verify-production-release-candidate.test.ts scripts/deploy-dev-workflow-contract.test.ts
```

Expected: PASS with no missing workflow and no development/production cross-use.

- [ ] **Step 7: Commit production orchestration**

```bash
git add .github/workflows/release-production.yml .github/workflows/deploy-docker-services.yml scripts/release-orchestration-contract.test.ts
git commit -m "feat(ci): 增加生产候选发布编排"
```

## Task 5: Add the bounded GitHub artifact gateway and request schemas

**Files:**
- Create: `apps/api/src/gateways/github-actions.ts`
- Create: `apps/api/src/gateways/github-actions.test.ts`
- Create: `apps/api/src/schema/release-deployments.test.ts`
- Modify: `apps/api/src/schema/release-deployments.ts`
- Modify: `apps/api/src/services/release-deployments/legacy/shared.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/package.json`
- Modify: `bun.lock`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing schema tests**

Test these exact rules:

```ts
import { describe, expect, test } from "bun:test";
import {
  ReleaseDispatchSchema,
  ReleaseProductionCandidateDeploySchema,
  ReleaseProductionCandidateParamsSchema,
} from "./release-deployments";

describe("release deployment schemas", () => {
  test("requires candidate-build confirmation for production dispatch", () => {
    expect(ReleaseDispatchSchema.safeParse({
      environment: "production",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      confirm_text: "确认构建生产候选",
    }).success).toBe(true);
    expect(ReleaseDispatchSchema.safeParse({
      environment: "production",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      confirm_text: "确认发布生产",
    }).success).toBe(false);
    expect(ReleaseDispatchSchema.safeParse({
      environment: "production",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      operation: "rollback",
      confirm_text: "确认构建生产候选",
    }).success).toBe(true);
  });

  test("allows a development rollback to an explicitly selected Ref", () => {
    expect(ReleaseDispatchSchema.safeParse({
      environment: "dev",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      operation: "rollback",
    }).success).toBe(true);
  });

  test("requires numeric candidate run and exact deploy confirmation", () => {
    expect(ReleaseProductionCandidateParamsSchema.safeParse({ runId: "123" }).success).toBe(true);
    expect(ReleaseProductionCandidateParamsSchema.safeParse({ runId: "abc" }).success).toBe(false);
    expect(ReleaseProductionCandidateDeploySchema.safeParse({
      services: ["api"],
      confirm_text: "确认部署生产环境",
      reason: "受控发布",
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run schema tests and observe missing schemas**

```bash
bun test apps/api/src/schema/release-deployments.test.ts
```

Expected: FAIL with missing candidate schema exports and old confirmation semantics.

- [ ] **Step 3: Implement request schemas and error codes**

In `release-deployments.ts`, require `确认构建生产候选` for both production `release` and `rollback`, because both operations only build a candidate in the first phase. Remove the existing rule that rejects development `rollback`; development rollback still uses an explicitly selected branch or Tag and the same development orchestrator. Add:

```ts
export const ReleaseProductionCandidateParamsSchema = z.object({
  runId: z.string().trim().regex(/^\d+$/, "GitHub Run ID 必须是数字"),
});

export const ReleaseProductionCandidateDeploySchema = z.object({
  services: z.array(ReleaseServiceSchema.exclude(["all"])).min(1, "请选择部署服务").max(4),
  confirm_text: z.literal("确认部署生产环境", {
    error: "部署生产候选需要输入：确认部署生产环境",
  }),
  reason: z.string().trim().max(200, "部署原因不能超过 200 个字符").optional(),
});
```

Export inferred types. Add `RELEASE_CANDIDATE_NOT_READY`, `RELEASE_CANDIDATE_INVALID`, and `RELEASE_CANDIDATE_ALREADY_DEPLOYED` to `error-codes.ts`.

- [ ] **Step 4: Write failing GitHub artifact gateway tests**

Mock `fetch` and use `zipSync` from `fflate` to cover:

- exact non-expired artifact selection from `/actions/runs/123/artifacts?name=production-release-candidate`;
- following `/actions/artifacts/99/zip` and decoding `production-release-candidate.json`;
- rejection of expired, missing, duplicate, compressed archive larger than 5 MiB, JSON entry larger than 1 MiB, missing file, and malformed JSON;
- JSON requests continue wrapping GitHub errors with `RELEASE_DISPATCH_FAILED`.

The success assertion is:

```ts
expect(await githubActionsGateway.downloadArtifactJson({
  runId: "123",
  artifactName: "production-release-candidate",
  fileName: "production-release-candidate.json",
})).toEqual({ schema_version: 1, build_run_id: 123 });
```

- [ ] **Step 5: Run the gateway test and observe missing dependency/module failure**

```bash
bun test apps/api/src/gateways/github-actions.test.ts
```

Expected: FAIL because the gateway and ZIP dependency do not exist.

- [ ] **Step 6: Add and lock the verified ZIP dependency**

```bash
bun add --cwd apps/api --exact fflate@0.8.2
pnpm install --lockfile-only
```

Verify `apps/api/package.json` contains exact `fflate: "0.8.2"`, and both lockfiles changed. The package exports `unzipSync`/`zipSync` with ESM types at this pinned version.

- [ ] **Step 7: Implement `github-actions.ts`**

Move `getGithubConfig`, `normalizeGithubError`, and `githubRequest` from `legacy/shared.ts` into the gateway, retaining the API version header and `Errors.business` behavior. Add:

```ts
import { unzipSync } from "fflate";

const MAX_ARTIFACT_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_ARTIFACT_JSON_BYTES = 1024 * 1024;

type GithubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  archive_download_url: string;
};

async function downloadArtifactJson<T>({ runId, artifactName, fileName }: {
  runId: string;
  artifactName: string;
  fileName: string;
}): Promise<T> {
  const payload = await githubRequest<{ artifacts?: GithubArtifact[] }>(
    `/actions/runs/${encodeURIComponent(runId)}/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`,
  );
  const matches = (payload.artifacts || []).filter((item) => item.name === artifactName && !item.expired);
  if (matches.length !== 1) {
    throw Errors.business(409, "发布证据缺失、重复或已过期", ErrorCodes.RELEASE_CANDIDATE_INVALID);
  }
  const artifact = matches[0];
  if (artifact.size_in_bytes > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw Errors.business(413, "发布证据归档过大", ErrorCodes.RELEASE_CANDIDATE_INVALID);
  }
  const archive = await githubBinaryRequest(`/actions/artifacts/${artifact.id}/zip`);
  if (archive.byteLength > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw Errors.business(413, "发布证据归档过大", ErrorCodes.RELEASE_CANDIDATE_INVALID);
  }
  const entries = unzipSync(new Uint8Array(archive));
  const content = entries[fileName];
  if (!content || content.byteLength > MAX_ARTIFACT_JSON_BYTES) {
    throw Errors.business(409, "发布证据文件缺失或过大", ErrorCodes.RELEASE_CANDIDATE_INVALID);
  }
  try {
    return JSON.parse(new TextDecoder().decode(content)) as T;
  } catch {
    throw Errors.business(409, "发布证据 JSON 无效", ErrorCodes.RELEASE_CANDIDATE_INVALID);
  }
}

export const githubActionsGateway = {
  request: githubRequest,
  downloadArtifactJson,
  getConfig: getGithubConfig,
};
```

`githubBinaryRequest` must use the same authentication/API headers, `redirect: "follow"`, require a successful response, and return `response.arrayBuffer()` without attempting JSON parsing. Re-export gateway functions from `legacy/shared.ts` temporarily so existing refs/tags/runtime modules do not require unrelated restructuring.

- [ ] **Step 8: Run focused API tests and checks**

```bash
bun test apps/api/src/schema/release-deployments.test.ts apps/api/src/gateways/github-actions.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and no type errors.

- [ ] **Step 9: Commit the API boundary**

```bash
git add apps/api/src/gateways/github-actions.ts apps/api/src/gateways/github-actions.test.ts apps/api/src/schema/release-deployments.ts apps/api/src/schema/release-deployments.test.ts apps/api/src/services/release-deployments/legacy/shared.ts apps/api/src/errors/error-codes.ts apps/api/package.json bun.lock pnpm-lock.yaml
git commit -m "feat(api): 增加发布证据网关"
```

## Task 6: Repair API dispatch, candidate validation, stages, and endpoints

**Files:**
- Create: `apps/api/src/services/release-deployments/legacy/dispatch.test.ts`
- Create: `apps/api/src/services/release-deployments/legacy/candidates.ts`
- Create: `apps/api/src/services/release-deployments/legacy/candidates.test.ts`
- Modify: `apps/api/src/services/release-deployments/legacy/{dispatch,runs,shared,types}.ts`
- Modify: `apps/api/src/services/release-deployments/legacy/tags.ts`
- Modify: `apps/api/src/services/release-deployments/legacy-service.ts`
- Modify: `apps/api/src/controllers/admin-ops/index.ts`

- [ ] **Step 1: Write the dispatch regression test**

Export a pure `buildReleaseDispatchRequest(input)` helper and test:

```ts
expect(buildReleaseDispatchRequest({
  environment: "dev",
  service: "api",
  ref_type: "branch",
  ref: "main",
  operation: "release",
  reason: "验证开发发布",
})).toEqual({
  workflowId: "release-dev.yml",
  ref: "main",
  stage: "release",
  inputs: { service: "api", operation: "release", reason: "验证开发发布" },
});

expect(buildReleaseDispatchRequest({
  environment: "production",
  service: "all",
  ref_type: "tag",
  ref: "v2026.07.13.1",
  operation: "release",
  reason: "候选构建",
  confirm_text: "确认构建生产候选",
})).toEqual({
  workflowId: "release-production.yml",
  ref: "v2026.07.13.1",
  stage: "build",
  inputs: {
    operation: "build",
    service: "api,admin,social-video-worker,cos-reconcile-worker",
    confirm_text: "确认构建生产候选",
    reason: "候选构建",
  },
});
```

Also assert neither request targets `deploy-dev.yml` nor `build-docker-images.yml`.

- [ ] **Step 2: Run the dispatch test and observe failure**

```bash
bun test apps/api/src/services/release-deployments/legacy/dispatch.test.ts
```

Expected: FAIL because the helper and new mappings are absent.

- [ ] **Step 3: Implement stable dispatch requests**

Change `RELEASE_WORKFLOWS` to `release-dev.yml` and `release-production.yml`. Keep existing service whitelist. Add a shared `expandAdminReleaseServices` matching the script order and use it in `buildReleaseDispatchRequest`.

`dispatch()` must use the helper, keep ref existence and workflow-idle checks, and record `stage`, normalized `services`, `commit_sha` when known, workflow/run URLs, operation, ref, and reason in audit metadata. The response message is environment-specific:

- development: `已提交开发环境构建与发布任务，请在发布记录中查看各阶段状态。`
- production: `已提交生产候选构建，构建成功并校验证据后才能部署。`

Include `stage` in the dispatch response. Update Tag messages in `tags.ts`:

- normal Tag: `发布 Tag 已创建，可以使用该 Tag 构建生产候选。`
- rollback Tag: `回滚 Tag 已创建，请构建并验证生产候选后再部署。`

Add a focused source assertion that `可以直接选择该 Tag 发起生产发布` is absent.

- [ ] **Step 4: Write candidate service tests with a mocked gateway**

Cover:

- successful run path/event/conclusion/SHA;
- candidate, plan, tag-resolved commit, and manifests all matching;
- missing/expired artifact -> `RELEASE_CANDIDATE_INVALID`;
- failed/in-progress run -> `RELEASE_CANDIDATE_NOT_READY`;
- client services differ from candidate -> invalid;
- existing non-expired deployment receipt -> GET returns `already_deployed: true`, `ready_to_deploy: false`, and a concrete blocked reason; POST returns `RELEASE_CANDIDATE_ALREADY_DEPLOYED`;
- successful deploy dispatch uses candidate Tag as `ref` and passes `operation=deploy`, full SHA, build run ID, exact services, confirmation, and reason;
- audit metadata includes `stage=deploy` and `build_run_id`.

Build ZIP responses with the tested gateway rather than bypassing artifact parsing in the integration-style success case.

- [ ] **Step 5: Run candidate tests and observe missing service behavior**

```bash
bun test apps/api/src/services/release-deployments/legacy/candidates.test.ts
```

Expected: FAIL with missing candidate methods/types.

- [ ] **Step 6: Implement candidate types and service**

Add the API response type:

```ts
export type ProductionReleaseCandidate = {
  build_run_id: string;
  tag: string;
  commit_sha: string;
  services: Exclude<ReleaseService, "all">[];
  build_services: Array<"api" | "admin" | "social-video-worker">;
  target_environment: "production";
  manifest_verified: true;
  ready_to_deploy: boolean;
  already_deployed: boolean;
  blocked_reason: string | null;
  run_url: string | null;
  created_at: string | null;
};
```

In `candidates.ts`, implement `getProductionCandidate(runId)` and `dispatchProductionCandidate(authContext, runId, input)`. The read method performs all server-side validations, resolves the Tag through the existing `resolveCommit`, downloads artifacts concurrently only for the one requested candidate, checks for the exact deployment-receipt artifact, and returns normalized evidence. A receipt is a readable terminal state rather than a GET error. The POST calls the read method again immediately before dispatch and rejects `already_deployed`; it never accepts client SHA, Tag, environment, or run outcome.

Bind methods in `legacy-service.ts` and use `Errors.business` with the new codes for every rejection.

- [ ] **Step 7: Add thin controller endpoints**

Import candidate schemas and add:

```ts
@Get("/admin/ops/releases/production-candidates/:runId")
async getProductionReleaseCandidate(request: FastifyRequest, reply: FastifyReply) {
  await this.getRequiredPlatformAdminContext(request);
  const paramsResult = ReleaseProductionCandidateParamsSchema.safeParse(request.params);
  if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
  const data = await releaseDeploymentService.getProductionCandidate(paramsResult.data.runId);
  return ResponseHandler.success(data);
}

@Post("/admin/ops/releases/production-candidates/:runId/deploy")
async deployProductionReleaseCandidate(request: FastifyRequest, reply: FastifyReply) {
  const authContext = await this.getRequiredPlatformAdminContext(request);
  const paramsResult = ReleaseProductionCandidateParamsSchema.safeParse(request.params);
  if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
  const bodyResult = ReleaseProductionCandidateDeploySchema.safeParse(request.body || {});
  if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
  const data = await releaseDeploymentService.dispatchProductionCandidate(
    authContext,
    paramsResult.data.runId,
    bodyResult.data,
  );
  return ResponseHandler.success(data);
}
```

- [ ] **Step 8: Normalize release stages and exclude build-only runs from successful releases**

Add `ReleaseStage` and these fields to `NormalizedReleaseRun`: `stage`, `stage_label`, `legacy`. Derive stage from the stable workflow plus run title/status:

```ts
export type ReleaseStage =
  | "build_queued"
  | "building"
  | "build_failed"
  | "ready_to_deploy"
  | "deploy_queued"
  | "deploying"
  | "deploy_failed"
  | "deployed"
  | "legacy";
```

Production `build` success becomes `ready_to_deploy`; production `deploy` success and development orchestrator success become `deployed`. Add an explicit `LEGACY_RELEASE_WORKFLOWS` read-only list so old `deploy-dev.yml` and `build-docker-images.yml` runs remain visible as `legacy`, while dispatch/options use only the two new orchestrators. In `listSuccessfulRefs`, use only successful `deployed` runs from the stable orchestrators, never a production candidate build or old build-only run.

Extend candidate tests or add focused run normalization tests for queued/running/failed/success build, deploy, development release, and legacy cases.

- [ ] **Step 9: Run API release tests and full static check**

```bash
bun test apps/api/src/schema/release-deployments.test.ts apps/api/src/gateways/github-actions.test.ts apps/api/src/services/release-deployments/legacy/dispatch.test.ts apps/api/src/services/release-deployments/legacy/candidates.test.ts
bun run api:check
```

Expected: all tests PASS; typecheck/build/file-size PASS.

- [ ] **Step 10: Commit the repaired API orchestration**

```bash
git add apps/api/src/controllers/admin-ops/index.ts apps/api/src/services/release-deployments apps/api/src/errors/error-codes.ts apps/api/src/schema/release-deployments.ts apps/api/src/schema/release-deployments.test.ts
git commit -m "fix(api): 修复后台版本发布编排"
```

## Task 7: Add Admin release stage and candidate request contracts

**Files:**
- Create: `apps/admin/components/ops/release-deployments-workbench.test.ts`
- Modify: `apps/admin/components/ops/ops-types.ts`
- Modify: `apps/admin/components/ops/release-deployments-shared.ts`

- [ ] **Step 1: Write failing pure-state and source contracts**

Test `statusLabel`, `statusVariant`, and `isReleaseRunActive` for every new stage. Read the shared source and require exact API paths:

```ts
expect(sharedSource).toContain("/admin/ops/releases/production-candidates/${encodeURIComponent(runId)}");
expect(sharedSource).toContain("/deploy");
expect(statusLabel(run({ stage: "ready_to_deploy" }))).toBe("可部署");
expect(statusLabel(run({ stage: "deploy_failed" }))).toBe("部署失败");
expect(isReleaseRunActive(run({ stage: "building" }))).toBe(true);
expect(isReleaseRunActive(run({ stage: "ready_to_deploy" }))).toBe(false);
```

The test fixture must include all required `ReleaseRun` fields instead of using `as any`.

- [ ] **Step 2: Run the Admin contract and observe failure**

```bash
bun test apps/admin/components/ops/release-deployments-workbench.test.ts
```

Expected: FAIL because stage/candidate types and request functions are absent.

- [ ] **Step 3: Add Admin types and requests**

Mirror the API `ReleaseStage` and `ProductionReleaseCandidate` types in `ops-types.ts`. Add `stage`, `stage_label`, and `legacy` to `ReleaseRun`, and `stage` to `ReleaseDispatchResult`. Extend audit with `stage`, `commit_sha`, and `build_run_id`.

Add:

```ts
export async function fetchProductionReleaseCandidate(runId: string) {
  return requestBackendJson<ProductionReleaseCandidate>(
    `/admin/ops/releases/production-candidates/${encodeURIComponent(runId)}`,
    { cache: "no-store", fallbackMessage: "生产候选证据校验失败" },
  );
}

export async function deployProductionReleaseCandidate(runId: string, payload: {
  services: Exclude<ReleaseService, "all">[];
  confirm_text: "确认部署生产环境";
  reason?: string;
}) {
  return requestBackendJson<ReleaseDispatchResult>(
    `/admin/ops/releases/production-candidates/${encodeURIComponent(runId)}/deploy`,
    { method: "POST", body: JSON.stringify(payload), fallbackMessage: "生产候选部署提交失败" },
  );
}
```

Make `statusLabel`, `statusVariant`, and active polling stage-first, with legacy fallback to raw GitHub status.

- [ ] **Step 4: Run Admin state tests and static check**

```bash
bun test apps/admin/components/ops/release-deployments-workbench.test.ts
pnpm --dir apps/admin check
```

Expected: PASS.

- [ ] **Step 5: Commit the Admin data contract**

```bash
git add apps/admin/components/ops/ops-types.ts apps/admin/components/ops/release-deployments-shared.ts apps/admin/components/ops/release-deployments-workbench.test.ts
git commit -m "feat(admin): 增加发布候选状态契约"
```

## Task 8: Build the stage-aware Admin release workbench

**Files:**
- Create: `apps/admin/components/ops/release-candidate-evidence.tsx`
- Modify: `apps/admin/components/ops/release-deployments-panel.tsx`
- Modify: `apps/admin/components/ops/release-deployments-dispatch-card.tsx`
- Modify: `apps/admin/components/ops/release-deployments-sections.tsx`
- Modify: `apps/admin/components/ops/ops-page-hardening.test.ts`
- Modify: `apps/admin/components/ops/release-deployments-workbench.test.ts`
- Optional create through CLI: `apps/admin/components/ui/spinner.tsx`

- [ ] **Step 1: Read installed shadcn component docs before composing UI**

Run from the repository root after invoking the `shadcn` skill:

```bash
pnpm dlx shadcn@latest docs alert -c apps/admin
pnpm dlx shadcn@latest docs alert-dialog -c apps/admin
pnpm dlx shadcn@latest docs badge -c apps/admin
pnpm dlx shadcn@latest docs button -c apps/admin
pnpm dlx shadcn@latest docs field -c apps/admin
pnpm dlx shadcn@latest docs skeleton -c apps/admin
pnpm dlx shadcn@latest docs spinner -c apps/admin
```

Inspect nearby Ops components and `.agents/skills/impeccable/reference/product.md`. If `Spinner` is not already installed and current docs confirm the registry component, add it with:

```bash
pnpm dlx shadcn@latest add spinner -c apps/admin
```

Do not add a new component library.

- [ ] **Step 2: Add failing UI source contracts**

Extend the workbench test to require:

```ts
expect(dispatchSource).toContain("构建并发布到开发环境");
expect(dispatchSource).toContain("构建生产候选");
expect(dispatchSource).toContain("确认构建生产候选");
expect(dispatchSource).not.toContain("生产发布会触发构建并重建对应生产容器");
expect(candidateSource).toContain("部署此构建到生产");
expect(candidateSource).toContain("确认部署生产环境");
expect(candidateSource).toContain("Commit SHA");
expect(candidateSource).toContain("构建 Run");
expect(candidateSource).toContain("镜像清单已验证");
expect(candidateSource).toContain("AlertDialog");
expect(candidateSource).not.toContain("<Card");
```

Extend `ops-page-hardening.test.ts` to assert the primary release card still owns the layout and candidate evidence does not introduce a nested Card.

- [ ] **Step 3: Run UI source contracts and observe failure**

```bash
bun test apps/admin/components/ops/release-deployments-workbench.test.ts apps/admin/components/ops/ops-page-hardening.test.ts
```

Expected: FAIL on missing candidate component and old production wording.

- [ ] **Step 4: Implement `ReleaseCandidateEvidence`**

Use a flat `section` with `border-t`, not a Card. Props are the selected ready run, `configured`, and `onSubmitted`. On run change, load the candidate once; show layout-matching Skeleton rows, inline destructive Alert on validation failure, and evidence rows for Tag, full/short SHA, build Run link, service labels, build time, and verified manifest badge.

The deploy action is disabled when loading, not configured, not ready, already deployed, candidate services are empty, confirmation mismatches, or a request is pending. Show the first disabled reason next to the action. The final AlertDialog must contain:

```tsx
<AlertDialogTitle>确认部署生产候选</AlertDialogTitle>
<AlertDialogDescription>
  将把候选 {candidate.tag} 的 {candidate.commit_sha.slice(0, 12)} 部署到生产环境。
  本次只使用构建 Run {candidate.build_run_id} 的已验证镜像。
</AlertDialogDescription>
<Field>
  <FieldLabel htmlFor="production-deploy-confirm">生产确认</FieldLabel>
  <Input
    id="production-deploy-confirm"
    value={confirmText}
    onChange={(event) => setConfirmText(event.target.value)}
    placeholder="输入：确认部署生产环境"
  />
  <FieldDescription>输入完整确认文本后才能部署。</FieldDescription>
</Field>
```

The confirm button calls `deployProductionReleaseCandidate(candidate.build_run_id, { services: candidate.services, confirm_text: "确认部署生产环境", reason })`, uses Spinner composition while pending, emits success/error toast, closes only on success, clears confirmation, and triggers snapshot refresh.

- [ ] **Step 5: Correct development and production build forms**

In `release-deployments-dispatch-card.tsx`:

- development primary label: `构建并发布到开发环境`;
- production primary label: `构建生产候选`;
- production confirmation input and validation: `确认构建生产候选`;
- production description: `此操作只构建并校验生产镜像，不会修改生产容器。`;
- successful production dispatch Alert title: `生产候选构建已提交`;
- rollback Tag follows the same candidate-build wording;
- the successful-ref action previously labeled `回滚发布` becomes `构建回滚候选`; its confirmation explains that no production container changes during this step, and it dispatches with `confirm_text: "确认构建生产候选"`;
- pending buttons use Spinner composition and keep one-line text;
- labels remain above inputs with `FieldGroup`/`Field`; Select items stay in `SelectGroup` as required by installed shadcn docs.

- [ ] **Step 6: Wire candidate selection and stage-aware records**

In `release-deployments-panel.tsx`, derive the newest `ready_to_deploy` production run from `currentRuns`, allow `ReleaseRunsCard` to select another ready candidate, and render `ReleaseCandidateEvidence` below the production build form separated by `Separator`. After dispatch/deploy, extend force polling and refresh snapshots.

In `release-deployments-sections.tsx`:

- render `stage_label` badge instead of generic success/failure;
- show `候选证据` action only for `ready_to_deploy` production runs;
- keep failure summary for build/deploy failures;
- label legacy workflows `历史任务` and never offer candidate deployment;
- preserve the six-column compact table on desktop; below 768px allow horizontal table scrolling but never hide Tag/SHA/run evidence in the candidate section.

- [ ] **Step 7: Run UI tests and Admin checks**

```bash
bun test apps/admin/components/ops/release-deployments-workbench.test.ts apps/admin/components/ops/ops-page-hardening.test.ts
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Expected: tests, file-size check, typecheck, and Next build PASS.

- [ ] **Step 8: Inspect desktop and mobile states in a browser**

After static checks pass, use `browser:control-in-app-browser` or the existing Playwright setup. Verify `/ops?tab=releases` at 1440×900 and 390×844 with a platform-admin session:

- token/config missing Alert;
- development idle and pending buttons;
- production build form;
- candidate Skeleton, validation error, ready evidence, already-deployed disabled state;
- final confirmation dialog;
- no nested cards, clipped text, horizontal page overflow, wrapped primary CTA, missing focus indication, or hidden evidence.

Capture screenshots for the implementation review; do not submit the deploy confirmation.

- [ ] **Step 9: Commit the Admin workbench**

```bash
git add apps/admin/components/ops apps/admin/components/ui/spinner.tsx
git commit -m "feat(admin): 重构两阶段版本发布工作台"
```

If `spinner.tsx` was already present or registry addition was unnecessary, omit it from `git add`.

## Task 9: Update the runbook and perform completion verification

**Files:**
- Modify: `docs/2026-05-17-admin-release-center-production-safety-guide.md`
- Verify all files changed in Tasks 1-8

- [ ] **Step 1: Update the operator runbook**

Document the exact procedures:

1. Development: select Ref and services, click `构建并发布到开发环境`, then require build, migration preflight, deploy, and health stages to succeed.
2. Production phase one: create/select Tag, choose services, enter `确认构建生产候选`, and verify Tag/SHA/build Run/manifests; production containers must remain unchanged.
3. Production phase two: select the candidate, enter `确认部署生产环境`, and verify deploy/health success.
4. Build failure never creates a deployable candidate; deploy failure may retry the same valid candidate; an already successful candidate cannot deploy again.
5. Production Web and database migration continue through their dedicated Gate/migration procedures.
6. Recovery uses workflow links, candidate/receipt artifacts, and immutable SHA; never fill a different SHA manually.

- [ ] **Step 2: Run the complete local verification matrix**

```bash
bun test scripts/release-orchestration-contract.test.ts scripts/verify-production-release-candidate.test.ts scripts/deploy-dev-workflow-contract.test.ts
bun test apps/api/src/schema/release-deployments.test.ts apps/api/src/gateways/github-actions.test.ts apps/api/src/services/release-deployments/legacy/dispatch.test.ts apps/api/src/services/release-deployments/legacy/candidates.test.ts
bun test apps/admin/components/ops/release-deployments-workbench.test.ts apps/admin/components/ops/ops-page-hardening.test.ts
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
```

Expected: every command exits 0. Confirm tests actually inspect both orchestrators, both evidence modes, production environment binding, candidate artifacts, API dispatch inputs, server-side validation, UI stages, and no nested cards.

- [ ] **Step 3: Perform a requirement-by-requirement audit**

Create a temporary checklist outside Git tracking and prove each design requirement from current files or command output:

- stable Admin workflow mappings;
- development one-click build/preflight/deploy/health;
- production explicit build then deploy;
- production build fixed to production configuration;
- exact Tag/SHA/run/service/manifest binding;
- no Admin production Web expansion;
- all errors use error factory;
- controller/service/gateway boundaries;
- build-only run not treated as deployment;
- loading/error/empty/disabled/mobile UI states;
- old manual workflows and production migration remain available;
- no database or orange changes.

Any missing or indirect evidence returns to the owning task; absence of a failing test is not proof.

- [ ] **Step 4: Request code review before integration**

Invoke `requesting-code-review` and review the full range from the plan base commit to HEAD. Resolve findings with `receiving-code-review`; rerun the focused test for every change, then rerun the complete verification matrix.

- [ ] **Step 5: Commit runbook changes**

```bash
git add docs/2026-05-17-admin-release-center-production-safety-guide.md
git commit -m "docs(ops): 更新两阶段生产发布手册"
```

- [ ] **Step 6: Integrate with `finishing-a-development-branch`**

After all local checks and review pass, use `finishing-a-development-branch` to merge into local `main`. Push only after confirming the branch contains no production deployment trigger beyond explicit `workflow_dispatch` and no secrets. Clean the worktree after merge and push.

- [ ] **Step 7: Verify real Actions without deploying production**

After push:

1. Observe workflow syntax/contract checks on GitHub.
2. From Admin, dispatch one controlled development release for a non-Web service and confirm the target development container revision equals the run SHA.
3. Create or select a test release Tag and dispatch production candidate build only.
4. Confirm the production candidate run used `production`, uploaded candidate/build-plan/manifests, and Admin shows matching Tag/SHA/run/services.
5. Confirm production container revisions did not change.
6. Do not click `部署此构建到生产`; real production deployment requires a separate maintenance-window authorization from the user.

If GitHub or Runner connectivity fails, record run URL, failing job/step, request ID where available, and Runner name. Network failure is not evidence that the code path is correct; rerun after connectivity recovers.
