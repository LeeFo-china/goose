# Automatic Development Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `main` push 后按变更路径构建受影响的不可变镜像，并在 migration 对齐时自动部署到开发服务器，同时保留现有手动发布与生产隔离边界。

**Architecture:** `Build Docker Images` 在 GitHub-hosted Runner 上生成不可变 build plan、构建选中镜像并上传 manifest；独立的 `Auto Deploy Dev` 通过 `workflow_run` 消费成功的 push 构建。开发 migration preflight、单服务部署和 Web Gate 通过 reusable workflow 复用现有实现，自动链路只编排证据，不复制部署逻辑。

**Tech Stack:** GitHub Actions YAML、Node.js ESM、Bun test、Supabase CLI 2.99.0、Docker Compose、GitHub CLI、腾讯云 CCR

---

## 实施前提与文件边界

实施时先使用 `using-git-worktrees` 从 `main` 创建 `feature/automatic-development-deployment` 独立工作树。不得修改生产工作流的触发器，不得自动 apply migration，不得修改 orange 仓库。

**新增文件：**

- `scripts/resolve-dev-change-plan.mjs`：把 NUL 分隔的变更路径解析为稳定 build plan。
- `scripts/verify-dev-build-plan.mjs`：在自动部署前严格校验 plan 的 schema、SHA、run ID、环境和服务集合。
- `scripts/validate-dev-database-target.mjs`：验证 dev 数据库 URL 没有指向生产环境。
- `scripts/verify-dev-migration-evidence.mjs`：校验 reusable migration Gate 输出与目标发布完全绑定。
- `.github/workflows/verify-dev-migration-history.yml`：只读的 reusable migration 对齐 Gate。
- `.github/workflows/auto-deploy-dev.yml`：消费自动构建证据并编排开发部署。
- `apps/web/tests/dev-change-plan.test.ts`：路径映射单元测试。
- `apps/web/tests/dev-build-plan.test.ts`：build plan 失败关闭测试。
- `apps/web/tests/dev-migration-evidence.test.ts`：migration evidence 篡改测试。
- `apps/web/tests/automatic-dev-deployment-contract.test.ts`：自动工作流和环境隔离契约。

**修改文件：**

- `.github/workflows/build-docker-images.yml`：增加 `main` push、build plan 和按计划构建。
- `.github/workflows/deploy-dev.yml`：增加 `workflow_call`，区分手动/自动构建证据，支持内联 Gate 回执。
- `.github/workflows/verify-dev-web-deployment-gate.yml`：增加 `workflow_call` 和回执输出，复用 migration Gate。
- `apps/web/tests/ci-environment-isolation-contract.test.ts`：覆盖新增开发 Runner 工作流和生产不变条件。
- `apps/web/tests/web-deployment-gate-contract.test.ts`：覆盖自动与手动两种 Web Gate 证据。
- `docs/superpowers/specs/2026-07-13-automatic-development-deployment-design.md`：保留已补充的 H5 失败关闭边界。

### Task 1: 路径到服务的纯函数解析器

**Files:**
- Create: `scripts/resolve-dev-change-plan.mjs`
- Create: `apps/web/tests/dev-change-plan.test.ts`

- [ ] **Step 1: 写路径映射失败测试**

创建表驱动测试，直接导入解析函数：

```ts
import { describe, expect, test } from "bun:test";

import { resolveDevChangePlan } from "../../../scripts/resolve-dev-change-plan.mjs";

const metadata = {
  beforeSha: "1".repeat(40),
  commitSha: "2".repeat(40),
  workflowRunId: 12345,
};

describe("development change plan", () => {
  test.each([
    ["web runtime", ["apps/web/components/official-site/site-footer.tsx"], ["api", "web"], ["api", "web"]],
    ["api runtime", ["apps/api/src/app.ts"], ["api", "social-video-worker"], ["api", "social-video-worker", "cos-reconcile-worker"]],
    ["admin runtime", ["apps/admin/app/page.tsx"], ["admin"], ["admin"]],
    ["domain runtime", ["packages/domain/src/index.ts"], ["api", "admin", "web", "social-video-worker"], ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"]],
  ])("maps %s", (_name, paths, buildServices, deployServices) => {
    const plan = resolveDevChangePlan(paths as string[], metadata);
    expect(plan.build_services).toEqual(buildServices);
    expect(plan.deploy_services).toEqual(deployServices);
    expect(plan.no_op).toBe(false);
  });

  test("deduplicates combined paths and marks migrations without applying them", () => {
    const plan = resolveDevChangePlan([
      "apps/web/app/page.tsx",
      "apps/api/src/app.ts",
      "supabase/migrations/20260713120000_example.sql",
    ], metadata);
    expect(plan.build_services).toEqual(["api", "web", "social-video-worker"]);
    expect(plan.deploy_services).toEqual(["api", "web", "social-video-worker", "cos-reconcile-worker"]);
    expect(plan.migration_changed).toBe(true);
  });

  test("returns no-op for docs, tests, lighthouse and workflow-only changes", () => {
    const plan = resolveDevChangePlan([
      "docs/readme.md",
      "apps/web/tests/example.test.ts",
      "apps/web/lighthouse-summary.json",
      ".github/workflows/example.yml",
    ], metadata);
    expect(plan.no_op).toBe(true);
    expect(plan.build_services).toEqual([]);
    expect(plan.deploy_services).toEqual([]);
  });

  test("fails closed for H5 and expands unknown runtime paths to all services", () => {
    expect(() => resolveDevChangePlan(["apps/h5/src/main.js"], metadata)).toThrow("unsupported automatic service: h5");
    expect(() => resolveDevChangePlan(["deploy/nginx/gooes-web-dev.conf"], metadata)).toThrow("unsupported automatic service: dev-nginx");
    const plan = resolveDevChangePlan(["config/runtime.toml"], metadata);
    expect(plan.build_services).toEqual(["api", "admin", "web", "social-video-worker"]);
    expect(plan.classifications).toContain("unknown-runtime");
  });

  test("treats deployment secrets preparation as shared runtime", () => {
    const plan = resolveDevChangePlan(["scripts/prepare-site-content-deployment-secrets.sh"], metadata);
    expect(plan.build_services).toEqual(["api", "admin", "web", "social-video-worker"]);
    expect(plan.deploy_services).toEqual(["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"]);
  });
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test apps/web/tests/dev-change-plan.test.ts`

Expected: FAIL，错误为无法找到 `scripts/resolve-dev-change-plan.mjs`。

- [ ] **Step 3: 实现稳定、有序、失败关闭的解析器**

实现并导出 `resolveDevChangePlan(paths, metadata)`。服务顺序必须固定，不能依赖 Set 插入的偶然顺序：

```js
const BUILD_ORDER = ["api", "admin", "web", "social-video-worker"];
const DEPLOY_ORDER = ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"];
const ALL_BUILD = new Set(BUILD_ORDER);
const ALL_DEPLOY = new Set(DEPLOY_ORDER);

function isNoopPath(path) {
  return path.startsWith("docs/")
    || path.startsWith(".github/")
    || path.startsWith(".codex/")
    || path.startsWith(".agents/")
    || /(^|\/)(tests?|e2e)\//u.test(path)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)
    || path === "apps/web/lighthouse-summary.json"
    || new Set([
      "scripts/resolve-dev-change-plan.mjs",
      "scripts/verify-dev-build-plan.mjs",
      "scripts/validate-dev-database-target.mjs",
      "scripts/verify-dev-migration-evidence.mjs",
      "scripts/verify-migration-history.mjs",
      "scripts/validate-web-gate-inputs.mjs",
      "scripts/verify-web-gate-receipt.mjs",
    ]).has(path)
    || path.endsWith(".md");
}

function addWeb(build, deploy) {
  build.add("api");
  build.add("web");
  deploy.add("api");
  deploy.add("web");
}

function addApi(build, deploy) {
  build.add("api");
  build.add("social-video-worker");
  deploy.add("api");
  deploy.add("social-video-worker");
  deploy.add("cos-reconcile-worker");
}

export function resolveDevChangePlan(paths, metadata) {
  const build = new Set();
  const deploy = new Set();
  const classifications = new Set();
  let migrationChanged = false;

  for (const rawPath of [...new Set(paths)].sort()) {
    const path = rawPath.replaceAll("\\", "/");
    if (!path) continue;
    if (path.startsWith("apps/h5/") && !isNoopPath(path)) {
      throw new Error("unsupported automatic service: h5");
    }
    if (path.startsWith("deploy/nginx/")) {
      throw new Error("unsupported automatic service: dev-nginx");
    }
    if (isNoopPath(path)) {
      classifications.add("non-runtime");
    } else if (path.startsWith("supabase/migrations/")) {
      migrationChanged = true;
      classifications.add("migration");
    } else if (path.startsWith("apps/web/") || path === "docker/web.Dockerfile" || path === "deploy/docker-compose.web-dev.yml") {
      classifications.add("web");
      addWeb(build, deploy);
    } else if (path.startsWith("apps/api/") || path === "docker/api.Dockerfile") {
      classifications.add("api");
      addApi(build, deploy);
    } else if (path.startsWith("apps/admin/") || path === "docker/admin.Dockerfile") {
      classifications.add("admin");
      build.add("admin");
      deploy.add("admin");
    } else if (path === "docker/social-video-worker.Dockerfile") {
      classifications.add("social-video-worker");
      build.add("social-video-worker");
      deploy.add("social-video-worker");
    } else if (path.startsWith("packages/domain/")
      || ["package.json", "pnpm-lock.yaml", "bun.lock", "pnpm-workspace.yaml", "deploy/docker-compose.dev.yml", "scripts/prepare-site-content-deployment-secrets.sh"].includes(path)) {
      classifications.add("shared-runtime");
      for (const service of ALL_BUILD) build.add(service);
      for (const service of ALL_DEPLOY) deploy.add(service);
    } else {
      classifications.add("unknown-runtime");
      for (const service of ALL_BUILD) build.add(service);
      for (const service of ALL_DEPLOY) deploy.add(service);
    }
  }

  return {
    schema_version: 1,
    target_environment: "development",
    commit_sha: metadata.commitSha,
    before_sha: metadata.beforeSha,
    workflow_run_id: metadata.workflowRunId,
    migration_changed: migrationChanged,
    changed_files: [...new Set(paths)].sort(),
    classifications: [...classifications].sort(),
    build_services: BUILD_ORDER.filter((service) => build.has(service)),
    deploy_services: DEPLOY_ORDER.filter((service) => deploy.has(service)),
    no_op: build.size === 0 && deploy.size === 0,
  };
}
```

CLI 入口从 stdin 读取 NUL 分隔路径，通过 `COMMIT_SHA`、`BEFORE_SHA`、`WORKFLOW_RUN_ID` 生成 JSON；SHA 或 run ID 非法时必须非零退出。

```js
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commitSha = process.env.COMMIT_SHA ?? "";
  const beforeSha = process.env.BEFORE_SHA ?? "";
  const workflowRunId = Number(process.env.WORKFLOW_RUN_ID);
  if (!/^[a-f0-9]{40}$/u.test(commitSha) || !/^[a-f0-9]{40}$/u.test(beforeSha) || !Number.isSafeInteger(workflowRunId) || workflowRunId <= 0) {
    throw new Error("invalid immutable build-plan metadata");
  }
  const paths = readFileSync(0).toString("utf8").split("\0").filter(Boolean);
  process.stdout.write(`${JSON.stringify(resolveDevChangePlan(paths, { beforeSha, commitSha, workflowRunId }), null, 2)}\n`);
}
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `bun test apps/web/tests/dev-change-plan.test.ts`

Expected: PASS，8 个映射/边界测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add scripts/resolve-dev-change-plan.mjs apps/web/tests/dev-change-plan.test.ts
git commit -m "feat(ci): 增加开发部署变更解析器"
```

### Task 2: 不可变 build plan 校验器

**Files:**
- Create: `scripts/verify-dev-build-plan.mjs`
- Create: `apps/web/tests/dev-build-plan.test.ts`

- [ ] **Step 1: 写篡改与边界失败测试**

测试使用临时 JSON 文件和 `Bun.spawnSync`，合法样本包含 schema、development、40 位 SHA、正整数 run ID、白名单服务和一致的 `no_op`。对以下变体逐一断言 exit code 1：

```ts
const invalidVariants = [
  { target_environment: "production" },
  { commit_sha: "bad" },
  { workflow_run_id: 99999 },
  { build_services: ["api", "unknown"] },
  { deploy_services: ["web"] },
  { build_services: [], deploy_services: [], no_op: false },
  { build_services: ["web"], deploy_services: ["web"], no_op: false },
];
```

最后一个样本必须失败，因为 Web 缺少 API 同 SHA。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test apps/web/tests/dev-build-plan.test.ts`

Expected: FAIL，校验脚本不存在。

- [ ] **Step 3: 实现严格校验与规范化输出**

脚本参数固定为：

```text
node scripts/verify-dev-build-plan.mjs PLAN_PATH EXPECTED_SHA EXPECTED_RUN_ID
```

校验成功时只向 stdout 输出一行规范 JSON；任何未知字段、重复服务、乱序服务、环境/SHA/run ID 不匹配、no-op 矛盾或 Web 未包含 API 都拒绝。核心约束：

```js
const BUILD_ORDER = ["api", "admin", "web", "social-video-worker"];
const DEPLOY_ORDER = ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"];

if (plan.schema_version !== 1) reject("unsupported schema");
if (plan.target_environment !== "development") reject("environment mismatch");
if (plan.commit_sha !== expectedSha) reject("commit SHA mismatch");
if (plan.workflow_run_id !== Number(expectedRunId)) reject("workflow run mismatch");
if (plan.no_op !== (plan.build_services.length === 0 && plan.deploy_services.length === 0)) reject("no-op mismatch");
if (plan.deploy_services.includes("web")
  && (!plan.deploy_services.includes("api") || !plan.build_services.includes("api") || !plan.build_services.includes("web"))) {
  reject("web requires API and Web images");
}
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `bun test apps/web/tests/dev-build-plan.test.ts`

Expected: PASS，合法样本 1 个、非法样本至少 7 个。

- [ ] **Step 5: 提交**

```bash
git add scripts/verify-dev-build-plan.mjs apps/web/tests/dev-build-plan.test.ts
git commit -m "feat(ci): 校验自动构建计划证据"
```

### Task 3: Build Docker Images 接入 main push 与 build plan

**Files:**
- Modify: `.github/workflows/build-docker-images.yml:1-224`
- Create: `apps/web/tests/automatic-dev-deployment-contract.test.ts`

- [ ] **Step 1: 写自动构建契约失败测试**

测试必须断言：

```ts
const build = read(".github/workflows/build-docker-images.yml");
expect(build).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
expect(build).toContain("resolve-dev-change-plan.mjs");
expect(build).toContain("build-plan.json");
expect(build).toContain("name: dev-build-plan");
expect(build).toContain("needs.validate-request.outputs.target_environment");
expect(build).toContain("github.event.before");
expect(build).toContain("fetch-depth: 0");
expect(build).toContain("workflow_dispatch:");
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test apps/web/tests/automatic-dev-deployment-contract.test.ts`

Expected: FAIL，缺少 push 与 build plan。

- [ ] **Step 3: 增加双触发和事件安全默认值**

将头部改为：

```yaml
name: Build Docker Images
run-name: >-
  Build ${{ github.event_name == 'push' && 'development affected services' || format('{0} {1}', inputs.target_environment, inputs.service || 'all') }}

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      target_environment:
        description: "Image configuration target"
        required: true
        default: development
        type: choice
        options: [development, production]
      service:
        description: "Service(s) to build. Use all or comma-separated values like api,admin"
        required: true
        default: all
        type: string
```

concurrency 对 push 使用固定 development 组，对手动请求保留环境/服务维度。`validate-request` 输出 `build_services`、`deploy_services`、`no_op`、`target_environment`。

- [ ] **Step 4: 生成并上传 build plan**

checkout 使用 `fetch-depth: 0`。push 分支执行：

```bash
git diff --name-only -z "${BEFORE_SHA}" "${GITHUB_SHA}" > changed-files.bin
COMMIT_SHA="${GITHUB_SHA}" \
BEFORE_SHA="${BEFORE_SHA}" \
WORKFLOW_RUN_ID="${GITHUB_RUN_ID}" \
node scripts/resolve-dev-change-plan.mjs < changed-files.bin > build-plan.json
```

当 before SHA 全零或 `git cat-file -e` 失败时，不把全仓历史路径交给常规解析器；直接生成 `build_services` / `deploy_services` 均为四个受支持服务、`no_op: false`、`classifications: ["fallback-all"]` 的安全全量 plan。这样不会因仓库中已有的 H5 或 Nginx 路径误触发增量发布禁止条件。手动分支继续调用 `resolve-web-deployment.mjs`，并生成同 schema 的手动 build plan。

使用 `actions/upload-artifact@v6` 上传：

```yaml
- name: Upload immutable build plan
  uses: actions/upload-artifact@v6
  with:
    name: dev-build-plan
    path: build-plan.json
    if-no-files-found: error
    retention-days: 30
```

build job 的 `environment` 和所有 `TARGET_ENVIRONMENT` 均读取 `needs.validate-request.outputs.target_environment`。矩阵保留 4 个服务，用现有 contains 条件跳过未选择项；no-op 时不得登录 CCR 或执行 Docker build。

- [ ] **Step 5: 验证自动和手动契约**

Run:

```bash
bun test apps/web/tests/automatic-dev-deployment-contract.test.ts apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/ci-environment-isolation-contract.test.ts
```

Expected: PASS；现有手动 `workflow_dispatch`、生产 all 构建语义和 GitHub-hosted Runner 契约保持通过。

- [ ] **Step 6: 提交**

```bash
git add .github/workflows/build-docker-images.yml apps/web/tests/automatic-dev-deployment-contract.test.ts
git commit -m "feat(ci): main推送按变更构建开发镜像"
```

### Task 4: 可复用的开发 migration 对齐 Gate

**Files:**
- Create: `scripts/validate-dev-database-target.mjs`
- Create: `apps/web/tests/dev-database-target.test.ts`
- Create: `scripts/verify-dev-migration-evidence.mjs`
- Create: `apps/web/tests/dev-migration-evidence.test.ts`
- Create: `.github/workflows/verify-dev-migration-history.yml`
- Modify: `apps/web/tests/ci-environment-isolation-contract.test.ts`

- [ ] **Step 1: 写数据库目标校验失败测试**

覆盖合法 dev URL、生产主机、生产 project ref、错误 host、缺少密码和非法 URL。调用接口固定为：

```text
node scripts/validate-dev-database-target.mjs DATABASE_URL ACTUAL_PROJECT_REF EXPECTED_HOST EXPECTED_PROJECT_REF BLOCKED_HOSTS BLOCKED_REFS
```

Expected: 只有 host 为 `api-dev.goodcms.cn` 且实际 project ref 精确等于
`fclnkyatvfvmzgzdqlba` 时 exit 0；URL 不要求包含 project ref。

- [ ] **Step 2: 实现 URL 解析和失败关闭**

使用 Node `URL`，不得把完整数据库 URL、用户名或密码输出到日志：

```js
const [rawUrl, actualRef, expectedHost, expectedRef, blockedHosts = "", blockedRefs = ""] = process.argv.slice(2);
let databaseUrl;
try {
  databaseUrl = new URL(rawUrl);
} catch {
  reject("invalid database URL");
}
if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") reject("invalid protocol");
if (!databaseUrl.username || !databaseUrl.password) reject("database credentials missing");
if (databaseUrl.hostname !== expectedHost) reject("database host is not development");
if (actualRef !== expectedRef) reject("development project ref mismatch");
if (blockedHosts.split(/\s+/u).includes(databaseUrl.hostname)) reject("blocked host");
if (blockedRefs.split(/\s+/u).some((ref) => ref && (actualRef === ref || rawUrl.includes(ref)))) reject("blocked project ref");
```

- [ ] **Step 3: 运行单元测试**

Run: `bun test apps/web/tests/dev-database-target.test.ts`

Expected: PASS。

- [ ] **Step 4: 为 migration evidence 写失败测试并实现校验器**

合法 evidence 固定包含：

```json
{
  "environment": "development",
  "commit_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "migration_version": "20260711120000",
  "migration_history_aligned": true,
  "target_migration_present": true
}
```

对 environment、SHA、migration version、两个布尔字段逐一篡改，断言 exit 1。校验器接口固定为：

```text
node scripts/verify-dev-migration-evidence.mjs EVIDENCE_PATH EXPECTED_ENV EXPECTED_SHA EXPECTED_MIGRATION
```

实现必须 JSON parse 失败关闭、验证 expected env 只允许 `development`、验证 40 位 SHA 和固定 migration version，
然后逐字段严格相等；不得接受 truthy 字符串。

Run: `bun test apps/web/tests/dev-migration-evidence.test.ts`

Expected: PASS，合法样本通过，所有篡改样本拒绝。

- [ ] **Step 5: 创建 workflow_call migration Gate**

工作流输入和输出：

```yaml
on:
  workflow_call:
    inputs:
      commit_sha:
        required: true
        type: string
      migration_version:
        required: true
        type: string
      artifact_name:
        required: true
        type: string
    outputs:
      evidence_b64:
        description: "Base64 encoded immutable migration evidence"
        value: ${{ jobs.verify.outputs.evidence_b64 }}
```

job 必须运行于 `[self-hosted, Linux, X64, gooes-dev-deploy]` 和 `environment: development`，checkout 指定 commit，调用 `validate-web-gate-inputs.mjs`、`validate-dev-database-target.mjs`，然后执行现有严格检查：

```bash
pnpm dlx supabase@2.99.0 migration list --db-url "${SUPABASE_DB_URL}" > migration-history.txt
node scripts/verify-migration-history.mjs \
  migration-history.txt supabase/migrations "${MIGRATION_VERSION}" > strict-evidence.json
jq -n --arg environment development --arg sha "${COMMIT_SHA}" \
  --arg migration "${MIGRATION_VERSION}" --slurpfile strict strict-evidence.json \
  '{environment:$environment,commit_sha:$sha,migration_version:$migration} + $strict[0]' \
  > migration-evidence.json
echo "evidence_b64=$(base64 -w0 migration-evidence.json)" >> "${GITHUB_OUTPUT}"
```

上传前必须把 artifact name 限制为本仓库约定前缀和 40 位小写 SHA：

```bash
[[ "${ARTIFACT_NAME}" =~ ^(auto-predeploy-migration|web-gate-migration)-[a-f0-9]{40}$ ]]
```

然后以该白名单 artifact name 上传 evidence。任何 Local/Remote 不一致都必须在 Docker 操作前失败。

- [ ] **Step 6: 更新环境隔离契约并运行**

新增 workflow 名到开发 Runner 检查列表，断言其不包含生产 Runner 标签、`supabase db push` 或 migration apply。

Run: `bun test apps/web/tests/dev-database-target.test.ts apps/web/tests/dev-migration-evidence.test.ts apps/web/tests/ci-environment-isolation-contract.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add scripts/validate-dev-database-target.mjs scripts/verify-dev-migration-evidence.mjs apps/web/tests/dev-database-target.test.ts apps/web/tests/dev-migration-evidence.test.ts .github/workflows/verify-dev-migration-history.yml apps/web/tests/ci-environment-isolation-contract.test.ts
git commit -m "feat(ci): 增加开发迁移只读发布门"
```

### Task 5: Web Gate 支持 reusable 输出

**Files:**
- Modify: `.github/workflows/verify-dev-web-deployment-gate.yml:1-137`
- Modify: `apps/web/tests/web-gate-workflow-input-safety.test.ts`
- Modify: `apps/web/tests/web-deployment-gate-contract.test.ts`
- Modify: `apps/web/tests/web-gate-receipt.test.ts`

- [ ] **Step 1: 写 workflow_call 和回执输出失败测试**

断言 Gate 同时保留 `workflow_dispatch`，新增 `workflow_call`，输出 `receipt_b64`，并通过
`./.github/workflows/verify-dev-migration-history.yml` 获取 migration evidence。

- [ ] **Step 2: 运行测试确认 RED**

Run: `bun test apps/web/tests/web-gate-workflow-input-safety.test.ts apps/web/tests/web-deployment-gate-contract.test.ts`

Expected: FAIL，缺少 workflow_call/output。

- [ ] **Step 3: 增加可复用输入输出并拆分 migration job**

在 `on` 下增加：

```yaml
workflow_call:
  inputs:
    commit_sha:
      required: true
      type: string
    migration_version:
      required: true
      type: string
  outputs:
    receipt_b64:
      description: "Base64 encoded successful development web gate receipt"
      value: ${{ jobs.verify.outputs.receipt_b64 }}
```

增加 `migration` job 调用 reusable Gate，artifact name 固定为
`web-gate-migration-${{ inputs.commit_sha }}`。原 `verify` job `needs: migration`，删除重复的 Supabase CLI 步骤，改为：

```bash
printf '%s' "${MIGRATION_EVIDENCE_B64}" | base64 -d > migration-evidence.json
node scripts/verify-dev-migration-evidence.mjs \
  migration-evidence.json development "${GATE_COMMIT_SHA}" "${GATE_MIGRATION_VERSION}"
```

创建回执的 step 设置 `id: receipt`，job outputs 映射：

```yaml
outputs:
  receipt_b64: ${{ steps.receipt.outputs.receipt_b64 }}
```

回执写入后执行 `echo "receipt_b64=$(base64 -w0 web-deployment-gate-receipt.json)" >> "${GITHUB_OUTPUT}"`，同时保留 `actions/upload-artifact@v6` 审计 artifact。

- [ ] **Step 4: 验证 secret 与输入安全**

所有 `${{ inputs.* }}` 继续只进入 step `env`，不得直接插入 `run`。`GOOES_WEB_PROXY_SHARED_SECRET` 只暴露给 API 签名探针步骤。

Run:

```bash
bun test apps/web/tests/web-gate-workflow-input-safety.test.ts apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/web-gate-receipt.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/verify-dev-web-deployment-gate.yml apps/web/tests/web-gate-workflow-input-safety.test.ts apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/web-gate-receipt.test.ts
git commit -m "refactor(ci): 复用开发Web发布门"
```

### Task 6: Deploy Dev 支持手动与自动证据

**Files:**
- Modify: `.github/workflows/deploy-dev.yml:1-298`
- Modify: `apps/web/tests/web-deployment-gate-contract.test.ts`
- Modify: `apps/web/tests/web-rollback-workflow-contract.test.ts`

- [ ] **Step 1: 写双入口失败测试**

断言 `deploy-dev.yml` 同时包含 `workflow_dispatch` 与 `workflow_call`，callable inputs 包括：

```yaml
service: string
commit_sha: string
build_run_id: string
expected_build_event: string
gate_receipt_b64: string (optional)
```

测试还要断言手动路径继续校验独立 Gate run，自动路径调用同一个 `verify-web-gate-receipt.mjs`，部署工作流不包含 `docker build`。

- [ ] **Step 2: 运行测试确认 RED**

Run: `bun test apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/web-rollback-workflow-contract.test.ts`

Expected: FAIL，缺少 workflow_call 和自动 receipt。

- [ ] **Step 3: 增加 reusable inputs 并禁止部署中途取消**

保留手动 inputs，新增 `workflow_call.inputs`。自动调用显式传 `expected_build_event: push`；手动路径默认
`workflow_dispatch`。将 deploy concurrency 改为 `cancel-in-progress: false`。

构建 run 校验从硬编码 event 改为：

```bash
test "$(jq -r '.path' <<< "${run_json}")" = ".github/workflows/build-docker-images.yml"
test "$(jq -r '.event' <<< "${run_json}")" = "${EXPECTED_BUILD_EVENT}"
test "$(jq -r '.conclusion' <<< "${run_json}")" = "success"
test "$(jq -r '.head_sha' <<< "${run_json}")" = "${SOURCE_SHA}"
```

`EXPECTED_BUILD_EVENT` 只允许 `push|workflow_dispatch`；push 仅允许在 reusable 调用且当前 caller event 为
`workflow_run`。

- [ ] **Step 4: 自动 Web 使用 Gate 输出，手动 Web 使用 Gate run**

```bash
if [ -n "${INLINE_GATE_RECEIPT_B64}" ]; then
  test "${EXPECTED_BUILD_EVENT}" = push
  test -z "${INPUT_GATE_RUN_ID}"
  printf '%s' "${INLINE_GATE_RECEIPT_B64}" | base64 -d > web-deployment-gate-receipt.json
else
  test "${EXPECTED_BUILD_EVENT}" = workflow_dispatch
  [[ "${INPUT_GATE_RUN_ID}" =~ ^[0-9]+$ ]]
  # 保留现有 run path、conclusion 和 artifact 下载校验
fi
node scripts/verify-web-gate-receipt.mjs \
  web-deployment-gate-receipt.json development "${SOURCE_SHA}" 20260711120000
```

不要把 receipt 写入日志。后续 compose、health、Web rollback 和 summary 步骤保持同一实现。

- [ ] **Step 5: 运行开发部署全部契约**

Run:

```bash
bun test apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/web-rollback-workflow-contract.test.ts apps/web/tests/ci-environment-isolation-contract.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add .github/workflows/deploy-dev.yml apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/web-rollback-workflow-contract.test.ts
git commit -m "refactor(ci): 复用开发单服务部署"
```

### Task 7: Auto Deploy Dev 编排器

**Files:**
- Create: `.github/workflows/auto-deploy-dev.yml`
- Modify: `apps/web/tests/automatic-dev-deployment-contract.test.ts`
- Modify: `apps/web/tests/ci-environment-isolation-contract.test.ts`

- [ ] **Step 1: 写事件、顺序和生产隔离失败测试**

断言：workflow 只监听 `Build Docker Images` completed/main；authorize 同时校验 conclusion、上游 event 和 branch；全局 concurrency 不取消；migration 在所有 `uses: deploy-dev.yml` 之前；Web job 依赖 API barrier 与 Gate receipt；文件中不存在生产 Runner、生产 IP、production environment 或 migration apply。

- [ ] **Step 2: 运行测试确认 RED**

Run: `bun test apps/web/tests/automatic-dev-deployment-contract.test.ts apps/web/tests/ci-environment-isolation-contract.test.ts`

Expected: FAIL，自动部署 workflow 不存在。

- [ ] **Step 3: 创建受限 workflow_run 入口与 plan 授权 job**

```yaml
name: Auto Deploy Dev
run-name: Auto dev deploy ${{ github.event.workflow_run.head_sha }}

on:
  workflow_run:
    workflows: [Build Docker Images]
    types: [completed]
    branches: [main]

permissions:
  contents: read
  actions: read

concurrency:
  group: auto-deploy-development
  cancel-in-progress: false
```

authorize job 仅在 conclusion success、event push、head_branch main 时运行。使用上游 run ID 下载
`dev-build-plan`，调用严格 verifier，然后把 `commit_sha`、`build_run_id`、`no_op`、`has_api`、`has_web` 和
非 Web matrix 写入 job outputs。

- [ ] **Step 4: migration preflight 与 API barrier**

非 no-op 时调用：

```yaml
migration:
  needs: authorize
  if: ${{ needs.authorize.outputs.no_op == 'false' }}
  uses: ./.github/workflows/verify-dev-migration-history.yml
  with:
    commit_sha: ${{ needs.authorize.outputs.commit_sha }}
    migration_version: "20260711120000"
    artifact_name: auto-predeploy-migration-${{ needs.authorize.outputs.commit_sha }}
  secrets: inherit
```

`deploy-api` 在 has_api 时调用 reusable Deploy Dev，传上游 build run ID 和
`expected_build_event: push`。增加普通 ubuntu barrier job，使用 `if: always()` 只接受 migration/API 的
`success|skipped`，API 失败时 exit 1，阻止 Worker 和 Web。

- [ ] **Step 5: 串行部署 Admin/Worker 并执行 Web Gate**

非 Web、非 API 服务使用动态 matrix，`max-parallel: 1`，每项调用同一 Deploy Dev。authorize 同时输出
`has_rest`，空 matrix 时跳过该 job；增加 rest barrier，只接受 `success|skipped` 并将真实失败向后传播。

Web Gate：

```yaml
web-gate:
  needs: [authorize, api-ready, rest-ready]
  if: ${{ needs.authorize.outputs.has_web == 'true' }}
  uses: ./.github/workflows/verify-dev-web-deployment-gate.yml
  with:
    commit_sha: ${{ needs.authorize.outputs.commit_sha }}
    migration_version: "20260711120000"
  secrets: inherit

deploy-web:
  needs: [authorize, web-gate]
  if: ${{ needs.authorize.outputs.has_web == 'true' }}
  uses: ./.github/workflows/deploy-dev.yml
  with:
    service: web
    commit_sha: ${{ needs.authorize.outputs.commit_sha }}
    build_run_id: ${{ needs.authorize.outputs.build_run_id }}
    expected_build_event: push
    gate_receipt_b64: ${{ needs.web-gate.outputs.receipt_b64 }}
  secrets: inherit
```

最后一个 always summary job 展示 plan、build run 和各 job result；不得用 `exit 0` 掩盖上游失败。

- [ ] **Step 6: 运行契约测试**

Run:

```bash
bun test apps/web/tests/automatic-dev-deployment-contract.test.ts apps/web/tests/ci-environment-isolation-contract.test.ts apps/web/tests/web-deployment-gate-contract.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add .github/workflows/auto-deploy-dev.yml apps/web/tests/automatic-dev-deployment-contract.test.ts apps/web/tests/ci-environment-isolation-contract.test.ts
git commit -m "feat(ci): 自动编排开发环境部署"
```

### Task 8: 全量静态验证与安全审查

**Files:**
- Modify only if a failing existing contract exposes a real regression.

- [ ] **Step 1: 解析所有 workflow YAML**

Run:

```bash
ruby -e 'require "yaml"; Dir[".github/workflows/*.yml"].each { |file| YAML.load_file(file, aliases: true); puts file }'
```

Expected: 每个 workflow 路径输出一次，无 Psych/YAML 异常。

- [ ] **Step 2: 运行 Web/CI 全量测试和检查**

Run:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web check
```

Expected: 所有测试 0 failure；typecheck、visible copy 和 Lighthouse summary 通过。

- [ ] **Step 3: 运行 API/Admin/Domain 最小检查**

Run:

```bash
pnpm --dir packages/domain build
bun test packages/domain/src
pnpm --dir apps/api check
pnpm --dir apps/admin check
```

Expected: 全部 exit 0。

- [ ] **Step 4: 审查生产隔离与危险命令**

Run:

```bash
rg -n "gooes-prod-deploy|1\.13\.20\.39|/opt/supabase/docker|supabase db push|docker (?:system|image|container|builder) prune" \
  .github/workflows/auto-deploy-dev.yml .github/workflows/verify-dev-migration-history.yml
```

Expected: 无匹配。另运行 `git diff --check`，Expected: exit 0。

- [ ] **Step 5: 请求代码审查并修复阻断项**

使用 `requesting-code-review`，重点审查 workflow_run 权限升级风险、输入到 shell 的边界、跨 run artifact 绑定、
skipped job 传播、migration 是否真的发生在首个 Docker 操作前。只修复与本规格直接相关的问题。

- [ ] **Step 6: 提交审查修正（如有）**

```bash
git add .github/workflows scripts apps/web/tests
git commit -m "fix(ci): 加固自动开发部署证据链"
```

无修正时跳过该提交，不创建空 commit。

### Task 9: 合并、推送与真实 Actions 验收

**Files:**
- No source changes unless live evidence exposes a reproducible defect.

- [ ] **Step 1: 使用 finishing-a-development-branch 合并回 main**

合并前再次运行 Task 8 的 Web tests/check。普通 merge 成功后在 `main` 重跑 Web tests/check，再清理 worktree 和本地分支。

- [ ] **Step 2: 推送 main 并观察首次 no-op 计划**

Run:

```bash
git push origin main
gh run list --workflow "Build Docker Images" --branch main --limit 5
```

Expected: push 触发一个 Build Docker Images run；由于本次只含 CI、脚本、测试与文档变化，plan 为 no-op，
所有 Docker build step 跳过，后续 Auto Deploy Dev 成功结束且没有容器 revision 变化。

- [ ] **Step 3: 核对 no-op 证据与开发容器未变化**

下载 `dev-build-plan`，用本地 verifier 验证 SHA/run ID。通过 SSH 只读记录 API/Admin/Web/Worker 当前 revision，
确认与 push 前一致。

- [ ] **Step 4: 保留手动发布回归能力**

在 GitHub Actions UI/CLI 确认以下工作流仍可 dispatch，不实际触发 production：

```text
Build Docker Images
Deploy Dev
Verify Development Web Deployment Gate
Migrate Dev Database
Deploy Docker Services
```

- [ ] **Step 5: 首次真实运行时 push 验收**

下一个经过正常评审的 API/Admin/Web/Domain 运行时提交作为端到端验收样本，不创建无业务意义的 canary 代码。
持续观察直至：selected image build success、migration preflight success、selected deploy success、Web 需要时 Gate success、
被选容器 revision 等于该 commit、未选容器 revision 不变。

若自动链路失败，使用失败 run 的日志定位根因；需要止血时禁用新 push/workflow_run 触发，继续使用现有手动 Build/Gate/Deploy，
不得放宽 SHA、环境、migration 或 Gate 校验。

## 参考资料

- [GitHub reusable workflow reference](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [GitHub workflow trigger events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)
