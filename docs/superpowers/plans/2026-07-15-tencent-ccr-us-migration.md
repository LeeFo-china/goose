# Tencent CCR US Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every future Gooes application image build and pull to `useccr.ccs.tencentyun.com/america_goose`, fully migrate development, and prove production build/pull readiness without recreating production containers.

**Architecture:** GitHub repository variables provide one registry source of truth to build and deployment workflows. Every production image build performs a digest- and revision-bound pull check on the production runner before it succeeds. Service production candidates remain separate from the Web Gate; the Admin Web guide exposes the missing standalone production Web build step.

**Tech Stack:** GitHub Actions YAML, Docker/Compose, Tencent CCR, Bun tests, TypeScript/React Admin, Bash/JQ/GitHub CLI, SSH.

---

## File Map

- `.github/workflows/build-docker-images.yml`: consume registry variables and run production pull verification.
- `.github/workflows/deploy-dev.yml`: consume the same registry variables for all development pulls.
- `.github/workflows/deploy-docker-services.yml`: consume the same registry variables for production digest pulls and Web SHA pulls.
- `deploy/docker-compose.api.yml`: update the worker fallback image.
- `deploy/docker-compose.admin.yml`: update the Admin fallback image.
- `deploy/.env.admin.example`: update the standalone Admin image example.
- `scripts/release-orchestration-contract.test.ts`: enforce registry and production pull contracts.
- `apps/web/tests/web-rollback-cleanup.test.ts`: keep registry-specific cleanup fixtures current.
- `apps/admin/components/ops/release-deployments-panel.tsx`: expose the production Web build workflow in the super-admin guide.
- `apps/admin/components/ops/release-deployments-workbench.test.ts`: protect the Web build/Gate/deploy sequence.
- `docs/2026-05-16-*.md`, `docs/2026-05-17-*.md`, and `docs/dev/2026-05-17-*.md`: replace copy-paste registry commands.
- `docs/2026-07-15-tencent-ccr-us-migration-runbook.md`: record the current source of truth, rollout, verification, and rollback commands.
- `docs/2026-07-15-tencent-ccr-us-migration-execution-record.md`: record actual run IDs and server evidence after rollout.

References verified before implementation:

- GitHub repository variables are available through `${{ vars.NAME }}` and can populate workflow `env` values: <https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables>
- Reusable workflows do not inherit caller workflow-level `env`; repository variables are the supported cross-workflow configuration mechanism: <https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations>
- `secrets: inherit` passes repository secrets to directly called workflows: <https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows>

### Task 1: Unify The Registry Source Of Truth

**Files:**

- Modify: `scripts/release-orchestration-contract.test.ts`
- Modify: `.github/workflows/build-docker-images.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Modify: `.github/workflows/deploy-docker-services.yml`
- Modify: `deploy/docker-compose.api.yml`
- Modify: `deploy/docker-compose.admin.yml`
- Modify: `deploy/.env.admin.example`
- Modify: `apps/web/tests/web-rollback-cleanup.test.ts`

- [ ] **Step 1: Add the failing registry contract**

Add tracked file readers and this test to `scripts/release-orchestration-contract.test.ts`:

```ts
const apiCompose = readFileSync(
  new URL("../deploy/docker-compose.api.yml", import.meta.url),
  "utf8",
);
const adminCompose = readFileSync(
  new URL("../deploy/docker-compose.admin.yml", import.meta.url),
  "utf8",
);
const adminEnvExample = readFileSync(
  new URL("../deploy/.env.admin.example", import.meta.url),
  "utf8",
);

test("uses one US Tencent CCR source across active release paths", () => {
  for (const workflow of [buildWorkflow, deployDevWorkflow, deployProductionWorkflow]) {
    expect(workflow).toContain(
      "TENCENT_CCR_REGISTRY: ${{ vars.TENCENT_CCR_REGISTRY }}",
    );
    expect(workflow).toContain(
      "TENCENT_CCR_NAMESPACE: ${{ vars.TENCENT_CCR_NAMESPACE }}",
    );
    expect(workflow).not.toContain("TENCENT_CCR_REGISTRY: ccr.ccs.tencentyun.com");
  }

  for (const config of [apiCompose, adminCompose, adminEnvExample]) {
    expect(config).toContain("useccr.ccs.tencentyun.com/america_goose/");
    expect(config).not.toContain("ccr.ccs.tencentyun.com/gooes-goodcms/");
  }
});
```

- [ ] **Step 2: Run the contract and confirm the expected failure**

Run:

```bash
bun test scripts/release-orchestration-contract.test.ts
```

Expected: FAIL because all three workflows still hard-code `ccr.ccs.tencentyun.com` and tracked Compose/example files still reference `gooes-goodcms`.

- [ ] **Step 3: Update workflow registry configuration**

Use this workflow-level configuration in all three active Docker workflows:

```yaml
env:
  TENCENT_CCR_REGISTRY: ${{ vars.TENCENT_CCR_REGISTRY }}
  TENCENT_CCR_NAMESPACE: ${{ vars.TENCENT_CCR_NAMESPACE }}
```

Before each Docker login or image-base construction, retain `set -euo pipefail` and add:

```bash
test -n "${TENCENT_CCR_REGISTRY}"
test -n "${TENCENT_CCR_NAMESPACE}"
```

Replace every shell interpolation of `${{ vars.TENCENT_CCR_NAMESPACE }}` with `${TENCENT_CCR_NAMESPACE}`. Construct image bases only as:

```bash
image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"
```

or, in the image matrix build:

```bash
IMAGE_BASE="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${IMAGE_REPO}"
```

Remove the step-local `TENCENT_CCR_NAMESPACE` declaration from production evidence validation because the workflow-level value is authoritative.

- [ ] **Step 4: Update tracked image defaults and fixtures**

Use these exact active references:

```text
useccr.ccs.tencentyun.com/america_goose/goose-api:main
useccr.ccs.tencentyun.com/america_goose/goose-admin:main
useccr.ccs.tencentyun.com/america_goose/goose-web:main
useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:main
```

For `apps/web/tests/web-rollback-cleanup.test.ts`, replace its three old `goose-web` fixture tags with the new registry and update the expected removable SHA reference to:

```ts
`useccr.ccs.tencentyun.com/america_goose/goose-web:${sha}`
```

- [ ] **Step 5: Run focused contracts**

Run:

```bash
bun test scripts/release-orchestration-contract.test.ts \
  scripts/deploy-dev-workflow-contract.test.ts \
  apps/web/tests/web-rollback-cleanup.test.ts
```

Expected: all tests PASS and `git grep` below returns no matches:

```bash
! git grep -n 'ccr\.ccs\.tencentyun\.com/gooes-goodcms' -- \
  .github deploy scripts apps ':!docs/**'
```

- [ ] **Step 6: Commit the registry source change**

```bash
git add .github/workflows/build-docker-images.yml \
  .github/workflows/deploy-dev.yml \
  .github/workflows/deploy-docker-services.yml \
  deploy/docker-compose.api.yml \
  deploy/docker-compose.admin.yml \
  deploy/.env.admin.example \
  scripts/release-orchestration-contract.test.ts \
  apps/web/tests/web-rollback-cleanup.test.ts
git commit -m "ci: 统一腾讯CCR美国仓库配置"
```

### Task 2: Add Production-Runner Pull Verification

**Files:**

- Modify: `scripts/release-orchestration-contract.test.ts`
- Modify: `.github/workflows/build-docker-images.yml`

- [ ] **Step 1: Add failing production pull-verification contracts**

Append a `verify-production-pull` boundary by introducing a terminal marker comment after the job:

```yaml
  # End production pull verification
```

Then add this test:

```ts
test("pull-verifies every production SHA image without deploying", () => {
  const validationJob = sliceWorkflowJob(buildWorkflow, "validate-request", "build");
  const pullJob = sliceWorkflowJob(
    buildWorkflow,
    "verify-production-pull",
    "# End production pull verification",
  );

  expect(validationJob).toContain('test "${GITHUB_REF_TYPE}" = tag');
  expect(validationJob).toContain('[[ "${GITHUB_REF_NAME}" =~ ^v[0-9]{4}');
  expect(pullJob).toContain("needs: [validate-request, build]");
  expect(pullJob).toContain("runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]");
  expect(pullJob).toContain("environment: production");
  expect(pullJob).toContain('test "${RUNNER_NAME}" = "gooes-prod-vm-0-3"');
  expect(pullJob).toContain('test "${GITHUB_REF_TYPE}" = tag');
  expect(pullJob).toContain("production-build-plan");
  expect(pullJob).toContain('image-manifest-${service}');
  expect(pullJob).toContain('docker pull "${expected_image}"');
  expect(pullJob).toContain('org.opencontainers.image.revision');
  expect(pullJob).toContain(".RepoDigests");
  expect(pullJob).not.toContain("docker compose");
  expect(pullJob).not.toContain("docker restart");
  expect(pullJob).not.toContain("systemctl");
});
```

Adjust `sliceWorkflowJob` so its third argument may be either a YAML job key or the exact marker string:

```ts
function sliceWorkflowJob(workflow: string, job: string, nextBoundary: string): string {
  const start = workflow.indexOf(`  ${job}:`);
  const yamlBoundary = workflow.indexOf(`  ${nextBoundary}:`, start + 1);
  const markerBoundary = workflow.indexOf(nextBoundary, start + 1);
  const end = yamlBoundary >= 0 ? yamlBoundary : markerBoundary;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}
```

- [ ] **Step 2: Run the contract and confirm the expected failure**

Run:

```bash
bun test scripts/release-orchestration-contract.test.ts
```

Expected: FAIL because `verify-production-pull` does not exist.

- [ ] **Step 3: Reject non-Tag production builds before any image push**

In `Resolve build plan`, after `TARGET_ENVIRONMENT` has been resolved and before writing `build-plan.json`, add:

```bash
if [ "${TARGET_ENVIRONMENT}" = production ]; then
  test "${GITHUB_REF_TYPE}" = tag
  [[ "${GITHUB_REF_NAME}" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]]
fi
```

This must execute in `validate-request`, before the matrix `build` job can log in or push a mutable `:main` tag.

- [ ] **Step 4: Add the production pull-verification job**

Add this job after `build` in `.github/workflows/build-docker-images.yml`. Preserve the existing matrix build and manifest upload steps.

```yaml
  verify-production-pull:
    name: Verify production images from production runner
    needs: [validate-request, build]
    if: ${{ needs.validate-request.outputs.target_environment == 'production' && needs.validate-request.outputs.no_op != 'true' && needs.build.result == 'success' }}
    runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]
    environment: production
    timeout-minutes: 30
    env:
      BUILD_SERVICES: ${{ needs.validate-request.outputs.build_services }}
    steps:
      - name: Guard production pull verification
        run: |
          set -euo pipefail
          test "${RUNNER_NAME}" = "gooes-prod-vm-0-3"
          test "${GITHUB_REF_TYPE}" = tag
          [[ "${GITHUB_REF_NAME}" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]]
          [[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]
          test -n "${BUILD_SERVICES}"
          test -n "${TENCENT_CCR_REGISTRY}"
          test -n "${TENCENT_CCR_NAMESPACE}"

      - name: Download immutable production evidence
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          evidence_dir="${RUNNER_TEMP}/production-pull-${GITHUB_RUN_ID}"
          rm -rf "${evidence_dir}"
          mkdir -p "${evidence_dir}"
          gh run download "${GITHUB_RUN_ID}" -n production-build-plan -D "${evidence_dir}"
          for service in ${BUILD_SERVICES}; do
            gh run download "${GITHUB_RUN_ID}" -n "image-manifest-${service}" -D "${evidence_dir}"
          done
          test "$(jq -r '.target_environment' "${evidence_dir}/build-plan.json")" = production
          test "$(jq -r '.commit_sha' "${evidence_dir}/build-plan.json")" = "${GITHUB_SHA}"
          test "$(jq -r '.build_services | join(" ")' "${evidence_dir}/build-plan.json")" = "${BUILD_SERVICES}"
          echo "PULL_EVIDENCE_DIR=${evidence_dir}" >> "${GITHUB_ENV}"

      - name: Login to Tencent CCR
        env:
          TENCENT_CCR_USERNAME: ${{ secrets.TENCENT_CCR_USERNAME }}
          TENCENT_CCR_PASSWORD: ${{ secrets.TENCENT_CCR_PASSWORD }}
        run: |
          set -euo pipefail
          test -n "${TENCENT_CCR_USERNAME}"
          test -n "${TENCENT_CCR_PASSWORD}"
          for attempt in 1 2 3 4 5; do
            if printf '%s' "${TENCENT_CCR_PASSWORD}" | docker login "${TENCENT_CCR_REGISTRY}" \
              -u "${TENCENT_CCR_USERNAME}" --password-stdin; then
              exit 0
            fi
            sleep $((attempt * 5))
          done
          exit 1

      - name: Pull and verify immutable images
        run: |
          set -euo pipefail
          cleanup_images=()
          cleanup() {
            for image in "${cleanup_images[@]}"; do
              docker image rm "${image}" >/dev/null 2>&1 || true
            done
          }
          trap cleanup EXIT

          for service in ${BUILD_SERVICES}; do
            case "${service}" in
              api) image_repo=goose-api ;;
              admin) image_repo=goose-admin ;;
              web) image_repo=goose-web ;;
              social-video-worker) image_repo=goose-social-video-worker ;;
              *) echo "Unsupported build service: ${service}"; exit 1 ;;
            esac

            manifest="${PULL_EVIDENCE_DIR}/image-manifest-${service}.json"
            test "$(jq -r '.service' "${manifest}")" = "${service}"
            test "$(jq -r '.commit_sha' "${manifest}")" = "${GITHUB_SHA}"
            test "$(jq -r '.target_environment' "${manifest}")" = production
            expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:${GITHUB_SHA}"
            test "$(jq -r '.image' "${manifest}")" = "${expected_image}"
            digest="$(jq -er '.digest | select(type == "string" and test("^sha256:[a-f0-9]{64}$"))' "${manifest}")"
            expected_digest_ref="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}@${digest}"

            if ! docker image inspect "${expected_image}" >/dev/null 2>&1; then
              cleanup_images+=("${expected_image}")
            fi
            docker pull "${expected_image}"
            revision="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${expected_image}")"
            test "${revision}" = "${GITHUB_SHA}"
            repo_digests="$(docker image inspect -f '{{json .RepoDigests}}' "${expected_image}")"
            jq -e --arg expected "${expected_digest_ref}" 'index($expected) != null' <<< "${repo_digests}" >/dev/null
          done

  # End production pull verification
```

- [ ] **Step 5: Run focused tests**

```bash
bun test scripts/release-orchestration-contract.test.ts
```

Expected: PASS. Confirm the pull job contains no Compose, restart, Nginx, or system service command.

- [ ] **Step 6: Commit production pull verification**

```bash
git add .github/workflows/build-docker-images.yml scripts/release-orchestration-contract.test.ts
git commit -m "ci: 增加生产镜像拉取预检"
```

### Task 3: Correct The Super-Admin Production Web Chain

**Files:**

- Modify: `apps/admin/components/ops/release-deployments-workbench.test.ts`
- Modify: `apps/admin/components/ops/release-deployments-panel.tsx`

- [ ] **Step 1: Add the failing Admin contract**

Extend `keeps official website publishing as an independent gated entry` with:

```ts
expect(panelSource).toContain('productionBuild: "build-docker-images.yml"');
expect(panelSource).toContain("先构建生产 Web SHA 镜像");
expect(panelSource).toContain("生产 Web 构建");
```

- [ ] **Step 2: Run the Admin test and confirm failure**

```bash
bun test apps/admin/components/ops/release-deployments-workbench.test.ts
```

Expected: FAIL because the production Web build workflow is not linked.

- [ ] **Step 3: Add the production Web build link without weakening the Gate**

Add the workflow ID:

```ts
const WEB_RELEASE_WORKFLOWS = {
  devGate: "verify-dev-web-deployment-gate.yml",
  devDeploy: "deploy-dev.yml",
  productionBuild: "build-docker-images.yml",
  productionGate: "verify-web-deployment-gate.yml",
  productionDeploy: "deploy-docker-services.yml",
} as const;
```

In `WebReleaseGuideCard`, resolve `productionBuildUrl`. Keep Web outside the service multi-select and change only the production sequence to:

```tsx
steps={[
  "先在服务发布中完成 API/Admin/Worker 候选构建与必要部署。",
  `运行 ${WEB_RELEASE_WORKFLOWS.productionBuild}，从同一发布 Tag 构建 production / web SHA 镜像。`,
  `运行 ${WEB_RELEASE_WORKFLOWS.productionGate}，确认 release manifest、migration 与 smoke 证据。`,
  `运行 ${WEB_RELEASE_WORKFLOWS.productionDeploy}，选择 service=web 并填入 gate_run_id 与确认文本。`,
]}
actions={[
  { label: "生产 Web 构建", href: productionBuildUrl },
  { label: "生产 Web Gate", href: productionGateUrl },
  { label: "生产 Web 部署", href: productionDeployUrl },
]}
```

Use concise production description text containing `先构建生产 Web SHA 镜像`.

- [ ] **Step 4: Verify the Admin change**

```bash
bun test apps/admin/components/ops/release-deployments-workbench.test.ts
bun run admin:check
```

Expected: both commands PASS. No API release schema or service list changes are required.

- [ ] **Step 5: Commit the Admin correction**

```bash
git add apps/admin/components/ops/release-deployments-panel.tsx \
  apps/admin/components/ops/release-deployments-workbench.test.ts
git commit -m "fix(admin): 补充生产Web镜像构建入口"
```

### Task 4: Update Operational Documentation

**Files:**

- Create: `docs/2026-07-15-tencent-ccr-us-migration-runbook.md`
- Modify: `docs/2026-05-16-admin-containerized-release-standardization.md`
- Modify: `docs/2026-05-16-container-release-and-nginx-stability.md`
- Modify: `docs/2026-05-16-github-actions-self-hosted-runner-build.md`
- Modify: `docs/2026-05-16-tencent-ccr-dual-push-integration.md`
- Modify: `docs/2026-05-17-docker-release-sha-tag-rollback-plan.md`
- Modify: `docs/2026-05-17-new-server-github-actions-docker-release-summary.md`
- Modify: `docs/dev/2026-05-17-dev-fast-release-and-database-strategy.md`
- Modify: `docs/dev/2026-05-17-dev-server-vm-0-11-configuration-summary.md`

- [ ] **Step 1: Replace executable old-registry examples**

In every listed historical operational document, replace:

```text
ccr.ccs.tencentyun.com/gooes-goodcms
```

with:

```text
useccr.ccs.tencentyun.com/america_goose
```

Also replace standalone current registry/namespace declarations:

```text
Registry: ccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=gooes-goodcms
```

with:

```text
Registry: useccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=america_goose
```

Do not modify server `.env.backup-*` files or Orange.

- [ ] **Step 2: Create the migration runbook**

Write `docs/2026-07-15-tencent-ccr-us-migration-runbook.md` with these concrete sections:

```markdown
# 腾讯 CCR 美国仓库迁移 Runbook

## 当前配置

- Registry: `useccr.ccs.tencentyun.com`
- Namespace: `america_goose`
- Secrets: `TENCENT_CCR_USERNAME`、`TENCENT_CCR_PASSWORD`
- 服务镜像：`goose-api`、`goose-admin`、`goose-web`、`goose-social-video-worker`
- `gooes-cos-reconcile-worker` 复用 `goose-api`

## 发布边界

- 开发：`release-dev.yml` 构建并部署。
- 生产服务：`release-production.yml` 只先构建候选，部署需要二次确认。
- 生产 Web：`build-docker-images.yml` 构建 SHA 镜像，再走独立 Gate 和 Web-only 部署。
- 每个 production 构建先由生产 Runner 完成拉取、digest 和 revision 校验。

## 回滚变量

旧仓库在生产实际切换前保留：

```text
TENCENT_CCR_REGISTRY=ccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=gooes-goodcms
```

回滚变量后只能部署旧仓库中已经存在且有构建证据的 SHA。
```

Include this operator command block:

```bash
gh variable set TENCENT_CCR_REGISTRY --repo LeeFo-china/goose --body useccr.ccs.tencentyun.com
gh variable set TENCENT_CCR_NAMESPACE --repo LeeFo-china/goose --body america_goose

# Production service candidate: build and pull-verify, do not deploy.
gh workflow run release-production.yml --repo LeeFo-china/goose --ref v2026.07.15.1 \
  -f operation=build -f service=all -f confirm_text='确认构建生产候选' \
  -f reason='build america_goose production service candidate without deployment'

# Production Web: separate image build and pull verification, do not run its Gate/deploy yet.
gh workflow run build-docker-images.yml --repo LeeFo-china/goose --ref v2026.07.15.1 \
  -f target_environment=production -f service=web
```

State explicitly that development migration is driven by the trusted `main` push build plan and
`auto-deploy-dev.yml`, and that server `.env` updates occur only after the corresponding image and
pull checks succeed.

- [ ] **Step 3: Verify documentation consistency**

```bash
if rg -n 'ccr\.ccs\.tencentyun\.com/gooes-goodcms' \
  docs/2026-05-16-*.md docs/2026-05-17-*.md docs/dev/2026-05-17-*.md; then
  exit 1
fi
git diff --check
```

Expected: the first command has no output; `git diff --check` succeeds.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/2026-05-16-*.md docs/2026-05-17-*.md \
  docs/dev/2026-05-17-*.md \
  docs/2026-07-15-tencent-ccr-us-migration-runbook.md
git commit -m "docs(ci): 更新腾讯CCR美国仓库运维口径"
```

### Task 5: Verify, Review, And Merge The Repository Change

**Files:**

- Verify all files changed in Tasks 1-4.

- [ ] **Step 1: Run the complete focused verification set**

```bash
bun test scripts/release-orchestration-contract.test.ts \
  scripts/deploy-dev-workflow-contract.test.ts \
  scripts/verify-production-release-candidate.test.ts \
  apps/web/tests/web-rollback-cleanup.test.ts \
  apps/admin/components/ops/release-deployments-workbench.test.ts
bun run admin:check
git diff --check origin/main...HEAD
git status --short --branch
```

Expected: all tests and Admin checks pass; diff check is empty; only intentional committed changes exist.

- [ ] **Step 2: Verify active paths contain no retired configuration**

```bash
! git grep -n 'TENCENT_CCR_REGISTRY: ccr\.ccs\.tencentyun\.com' -- .github
! git grep -n 'ccr\.ccs\.tencentyun\.com/gooes-goodcms' -- \
  .github deploy scripts apps ':!docs/**'
```

Expected: both commands return no matches.

- [ ] **Step 3: Perform code review**

Use the `requesting-code-review` skill. Review security boundaries, production non-deployment guarantees, variable propagation, manifest validation, Admin Web separation, and test coverage. Fix findings before pushing.

- [ ] **Step 4: Set and verify repository variables**

```bash
gh variable set TENCENT_CCR_REGISTRY \
  --repo LeeFo-china/goose \
  --body useccr.ccs.tencentyun.com
gh variable set TENCENT_CCR_NAMESPACE \
  --repo LeeFo-china/goose \
  --body america_goose
gh variable list --repo LeeFo-china/goose
```

Expected: both exact values are listed. Secret values must not be printed; only verify names with `gh secret list`.

- [ ] **Step 5: Push, open a focused PR, and wait for checks**

```bash
git push -u origin chore/tencent-ccr-us-migration
gh pr create \
  --repo LeeFo-china/goose \
  --base main \
  --head chore/tencent-ccr-us-migration \
  --title "ci: 迁移腾讯CCR美国镜像仓库" \
  --body-file docs/2026-07-15-tencent-ccr-us-migration-runbook.md
gh pr checks --repo LeeFo-china/goose --watch
```

Expected: PR checks succeed. The root checkout's three local-only commits are absent from the PR because the worktree started at `origin/main`.

- [ ] **Step 6: Merge the PR and record the immutable main SHA**

```bash
gh pr merge --repo LeeFo-china/goose --squash --delete-branch=false
git fetch origin main
git rev-parse origin/main
```

Expected: the PR is merged and `origin/main` points to the migration commit. Do not reset, rebase, or modify `/Users/leefo/Public/work/gooes`.

### Task 6: Migrate All Development Services

**Files/State:**

- GitHub Actions: `release-dev.yml`, or the trusted automatic main build/deploy chain.
- Development server: `/opt/gooes-dev/docker/.env`.
- No database change.

- [ ] **Step 1: Require the main-triggered development build plan to select every service**

```bash
merge_sha="$(git rev-parse origin/main)"
for attempt in $(seq 1 30); do
  dev_build_run_id="$(gh run list \
    --repo LeeFo-china/goose \
    --branch main \
    --workflow build-docker-images.yml \
    --limit 20 \
    --json databaseId,headSha,event \
    --jq ".[] | select(.headSha == \"${merge_sha}\" and .event == \"push\") | .databaseId" \
    | head -n 1)"
  if [ -n "${dev_build_run_id}" ]; then break; fi
  sleep 5
done
test -n "${dev_build_run_id}"
gh run watch "${dev_build_run_id}" --repo LeeFo-china/goose --exit-status

dev_plan_dir="$(mktemp -d)"
gh run download "${dev_build_run_id}" \
  --repo LeeFo-china/goose \
  -n dev-build-plan \
  -D "${dev_plan_dir}"
jq -e '
  .build_services == ["api", "admin", "web", "social-video-worker"] and
  .deploy_services == ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"]
' "${dev_plan_dir}/build-plan.json"
```

Expected: the tracked Compose changes are classified as shared/unknown runtime changes, so the trusted plan selects all four image builds and all five deployments. If this assertion fails, stop and fix the resolver contract; do not substitute `release-dev.yml service=all`, because that service orchestrator intentionally excludes Web.

- [ ] **Step 2: Wait for the automatic development deployment to finish**

```bash
for attempt in $(seq 1 30); do
  dev_deploy_run_id="$(gh run list \
    --repo LeeFo-china/goose \
    --workflow auto-deploy-dev.yml \
    --limit 20 \
    --json databaseId,displayTitle \
    --jq ".[] | select(.displayTitle == \"Auto dev deploy ${merge_sha}\") | .databaseId" \
    | head -n 1)"
  if [ -n "${dev_deploy_run_id}" ]; then break; fi
  sleep 5
done
test -n "${dev_deploy_run_id}"
gh run watch "${dev_deploy_run_id}" --repo LeeFo-china/goose --exit-status
```

Expected: API, Admin, Web, social-video-worker, and cos-reconcile-worker deployment jobs succeed. Image manifests for API, Admin, Web, and social-video-worker contain the merged main SHA and the US registry.

- [ ] **Step 3: Verify development runtime before changing `.env`**

```bash
ssh -o BatchMode=yes ubuntu@43.165.126.30 \
  'docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" | grep "^gooes-"'
```

Expected: the five development application containers are healthy/running and use `useccr.ccs.tencentyun.com/america_goose`. The COS worker uses `goose-api`.

- [ ] **Step 4: Back up and update the active development image defaults**

Run a remote script that edits only image keys:

```bash
ssh -o BatchMode=yes ubuntu@43.165.126.30 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/gooes-dev/docker
stamp="$(date +%Y%m%d%H%M%S)"
cp -p .env ".env.bak.ccr-us-${stamp}"
update_key() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${value}#" .env
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
}
base=useccr.ccs.tencentyun.com/america_goose
update_key GOOES_API_IMAGE "${base}/goose-api:dev"
update_key GOOES_ADMIN_IMAGE "${base}/goose-admin:dev"
update_key GOOES_WEB_IMAGE "${base}/goose-web:dev"
update_key GOOES_SOCIAL_VIDEO_WORKER_IMAGE "${base}/goose-social-video-worker:dev"
REMOTE
```

- [ ] **Step 5: Verify development configuration and public health**

```bash
ssh -o BatchMode=yes ubuntu@43.165.126.30 \
  'cd /opt/gooes-dev/docker && docker compose --env-file .env -f docker-compose.dev.yml config --images'
curl --noproxy '*' -fsS https://api-dev.goodcms.cn/ >/dev/null
curl --noproxy '*' -fsS https://admin-dev.goodcms.cn/login >/dev/null
curl --noproxy '*' -fsS https://www-dev.goodcms.cn/ >/dev/null
```

Expected: all application images resolve to the US registry and all public checks succeed.

### Task 7: Build And Pull-Verify Production Without Deployment

**Files/State:**

- Git tag: `v2026.07.15.1`.
- GitHub Actions: `release-production.yml` service candidate and `build-docker-images.yml` Web build.
- Production server: `/opt/supabase/docker/.env` and `.env.admin` only.
- Running containers and Nginx must remain unchanged.

- [ ] **Step 1: Capture production runtime evidence before any build**

```bash
ssh -o BatchMode=yes ubuntu@1.13.20.39 \
  'docker ps --no-trunc --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}" | grep "^.*|gooes-"' \
  > /tmp/gooes-prod-before-ccr-migration.txt
```

Also record `https://api.goodcms.cn/` and `https://admin.goodcms.cn/login` HTTP status.

- [ ] **Step 2: Create the production candidate Tag from merged main**

```bash
merge_sha="$(git rev-parse origin/main)"
test -z "$(git tag --list v2026.07.15.1)"
git tag -a v2026.07.15.1 "${merge_sha}" -m "Tencent CCR US migration candidate"
git push origin v2026.07.15.1
```

Expected: the Tag points exactly to `origin/main` and matches the production workflow's `vYYYY.MM.DD.N` guard.

- [ ] **Step 3: Build the production service candidate**

```bash
gh workflow run release-production.yml \
  --repo LeeFo-china/goose \
  --ref v2026.07.15.1 \
  -f operation=build \
  -f service=all \
  -f confirm_text='确认构建生产候选' \
  -f reason='build america_goose production service candidate without deployment'
```

Resolve and wait for the exact run:

```bash
for attempt in $(seq 1 30); do
  prod_service_run_id="$(gh run list \
    --repo LeeFo-china/goose \
    --workflow release-production.yml \
    --limit 10 \
    --json databaseId,headSha,displayTitle \
    --jq ".[] | select(.headSha == \"${merge_sha}\" and .displayTitle == \"Production build all candidate v2026.07.15.1\") | .databaseId" \
    | head -n 1)"
  if [ -n "${prod_service_run_id}" ]; then break; fi
  sleep 5
done
test -n "${prod_service_run_id}"
gh run watch "${prod_service_run_id}" --repo LeeFo-china/goose --exit-status
```

Expected: API, Admin, and social-video-worker build manifests pass the production-runner pull job; an immutable `production-release-candidate` artifact is published; deployment is skipped.

- [ ] **Step 4: Build and pull-verify the separate production Web image**

```bash
gh workflow run build-docker-images.yml \
  --repo LeeFo-china/goose \
  --ref v2026.07.15.1 \
  -f target_environment=production \
  -f service=web
```

Resolve and wait for the exact Web build:

```bash
for attempt in $(seq 1 30); do
  prod_web_run_id="$(gh run list \
    --repo LeeFo-china/goose \
    --workflow build-docker-images.yml \
    --limit 10 \
    --json databaseId,headSha,displayTitle \
    --jq ".[] | select(.headSha == \"${merge_sha}\" and .displayTitle == \"Build production web\") | .databaseId" \
    | head -n 1)"
  if [ -n "${prod_web_run_id}" ]; then break; fi
  sleep 5
done
test -n "${prod_web_run_id}"
gh run watch "${prod_web_run_id}" --repo LeeFo-china/goose --exit-status
```

Expected: `goose-web:${merge_sha}` and `goose-web:main` are pushed to the US registry, and the same production-runner pull verification passes without a Web deployment.

- [ ] **Step 5: Prove production runtime was unchanged**

```bash
ssh -o BatchMode=yes ubuntu@1.13.20.39 \
  'docker ps --no-trunc --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}" | grep "^.*|gooes-"' \
  > /tmp/gooes-prod-after-ccr-build.txt
diff -u /tmp/gooes-prod-before-ccr-migration.txt /tmp/gooes-prod-after-ccr-build.txt
```

Expected: no diff. Public API/Admin checks remain successful. No production deploy workflow has run.

- [ ] **Step 6: Back up and passively update production image defaults**

```bash
ssh -o BatchMode=yes ubuntu@1.13.20.39 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/supabase/docker
stamp="$(date +%Y%m%d%H%M%S)"
cp -p .env ".env.bak.ccr-us-${stamp}"
cp -p .env.admin ".env.admin.bak.ccr-us-${stamp}"
update_key() {
  file="$1"
  key="$2"
  value="$3"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}
base=useccr.ccs.tencentyun.com/america_goose
update_key .env GOOES_API_IMAGE "${base}/goose-api:main"
update_key .env GOOES_ADMIN_IMAGE "${base}/goose-admin:main"
update_key .env GOOES_SOCIAL_VIDEO_WORKER_IMAGE "${base}/goose-social-video-worker:main"
update_key .env.admin GOOES_ADMIN_IMAGE "${base}/goose-admin:main"
REMOTE
```

Do not run `docker compose pull`, `docker compose up`, `docker restart`, or Nginx commands.

- [ ] **Step 7: Validate passive production configuration**

```bash
ssh -o BatchMode=yes ubuntu@1.13.20.39 \
  'cd /opt/supabase/docker && docker compose --env-file .env -f docker-compose.api.yml -f docker-compose.admin.yml config --images'
```

Expected: API, Admin, social-video-worker, and the COS worker's shared API image resolve to the US registry. A second container snapshot still matches the pre-build snapshot.

### Task 8: Record Final Evidence And Close The Migration

**Files:**

- Create: `docs/2026-07-15-tencent-ccr-us-migration-execution-record.md`

- [ ] **Step 1: Write the execution record with actual evidence**

The document must contain the actual values collected during Tasks 5-7 for:

```markdown
# 腾讯 CCR 美国仓库迁移执行记录

- 合并 PR、main SHA、生产候选 Tag
- GitHub registry/namespace 变量值和 secret 名称
- 开发 build/deploy Run ID 与四个镜像 manifest
- 开发五个容器的镜像、revision、health
- 生产服务候选 Run ID、Web 构建 Run ID、pull verification 结果
- 生产构建前后容器快照对比结果
- 两台服务器 `.env` 备份文件名
- 公网 API/Admin/Web smoke 结果
- 旧 CCR 保留范围和下一次生产实际切换步骤
```

Do not include credentials, JWTs, database URLs, Docker auth payloads, or unrelated `.env` values.

- [ ] **Step 2: Verify final state**

```bash
merge_sha="$(git rev-parse origin/main)"
dev_deploy_run_id="$(gh run list --repo LeeFo-china/goose \
  --workflow auto-deploy-dev.yml --limit 20 --json databaseId,displayTitle \
  --jq ".[] | select(.displayTitle == \"Auto dev deploy ${merge_sha}\") | .databaseId" | head -n 1)"
prod_service_run_id="$(gh run list --repo LeeFo-china/goose \
  --workflow release-production.yml --limit 20 --json databaseId,headSha,displayTitle \
  --jq ".[] | select(.headSha == \"${merge_sha}\" and .displayTitle == \"Production build all candidate v2026.07.15.1\") | .databaseId" | head -n 1)"
prod_web_run_id="$(gh run list --repo LeeFo-china/goose \
  --workflow build-docker-images.yml --limit 20 --json databaseId,headSha,displayTitle \
  --jq ".[] | select(.headSha == \"${merge_sha}\" and .displayTitle == \"Build production web\") | .databaseId" | head -n 1)"
test -n "${dev_deploy_run_id}"
test -n "${prod_service_run_id}"
test -n "${prod_web_run_id}"
gh variable list --repo LeeFo-china/goose
gh secret list --repo LeeFo-china/goose
gh run view "${dev_deploy_run_id}" --repo LeeFo-china/goose --json status,conclusion,headSha,url
gh run view "${prod_service_run_id}" --repo LeeFo-china/goose --json status,conclusion,headSha,url
gh run view "${prod_web_run_id}" --repo LeeFo-china/goose --json status,conclusion,headSha,url
git diff --check
```

Expected: all three runs are completed successfully and bound to the intended SHA; the execution record contains no secret values.

- [ ] **Step 3: Commit and merge the execution record**

Create a focused follow-up branch from updated `origin/main`, commit with:

```bash
git add docs/2026-07-15-tencent-ccr-us-migration-execution-record.md
git commit -m "docs(ci): 记录腾讯CCR美国仓库迁移结果"
```

Push, open a docs-only PR, wait for checks, and merge it. Keep the root checkout and Orange untouched.

- [ ] **Step 4: Final acceptance statement**

Report these facts explicitly:

- All future build/deploy workflows use repository variables for `useccr.ccs.tencentyun.com/america_goose`.
- Development runs entirely from the new registry.
- Production images exist and were actually pulled/verified from the production runner.
- Production running containers were not recreated and still await the next approved production deployment for runtime cutover.
- The old registry and timestamped server environment backups remain available for rollback.
