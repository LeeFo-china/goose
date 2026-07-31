import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BUILD_ORDER = ["api", "admin", "h5", "web", "social-video-worker"];
const DEPLOY_ORDER = [
  "api",
  "admin",
  "h5",
  "web",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
];
const ALL_BUILD = new Set(BUILD_ORDER);
const ALL_DEPLOY = new Set(DEPLOY_ORDER);
const NOOP_SCRIPTS = new Set([
  "scripts/resolve-dev-change-plan.mjs",
  "scripts/verify-dev-build-plan.mjs",
  "scripts/validate-dev-database-target.mjs",
  "scripts/verify-dev-migration-evidence.mjs",
  "scripts/verify-migration-history.mjs",
  "scripts/validate-web-gate-inputs.mjs",
  "scripts/verify-web-gate-receipt.mjs",
]);
const SHARED_RUNTIME_PATHS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "bun.lock",
  "pnpm-workspace.yaml",
  "deploy/docker-compose.dev.yml",
  "scripts/prepare-site-content-deployment-secrets.sh",
]);

function isNoopPath(path) {
  return path.startsWith("docs/")
    || path.startsWith(".github/")
    || path.startsWith(".codex/")
    || path.startsWith(".agents/")
    || /(^|\/)(tests?|e2e)\//u.test(path)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)
    || path === "apps/web/lighthouse-summary.json"
    || NOOP_SCRIPTS.has(path)
    || path.endsWith(".md");
}

function addAllServices(build, deploy) {
  for (const service of ALL_BUILD) build.add(service);
  for (const service of ALL_DEPLOY) deploy.add(service);
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
  deploy.add("billing-reconcile-worker");
}

export function resolveDevChangePlan(paths, metadata) {
  const changedFiles = [...new Set(paths.map((path) => path.replaceAll("\\", "/")))]
    .filter(Boolean)
    .sort();
  const build = new Set();
  const deploy = new Set();
  const classifications = new Set();
  let migrationChanged = false;

  for (const path of changedFiles) {
    if (
      (path.startsWith("apps/h5/")
        || path === "docker/h5.Dockerfile"
        || path === "deploy/nginx/gooes-dev.conf")
      && !isNoopPath(path)
    ) {
      classifications.add("h5");
      build.add("h5");
      deploy.add("h5");
    } else if (path.startsWith("deploy/nginx/")) {
      throw new Error("unsupported automatic service: dev-nginx");
    } else if (isNoopPath(path)) {
      classifications.add("non-runtime");
    } else if (path.startsWith("supabase/migrations/")) {
      migrationChanged = true;
      classifications.add("migration");
    } else if (
      path.startsWith("apps/web/")
      || path === "docker/web.Dockerfile"
      || path === "deploy/docker-compose.web-dev.yml"
    ) {
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
    } else if (path.startsWith("packages/domain/") || SHARED_RUNTIME_PATHS.has(path)) {
      classifications.add("shared-runtime");
      addAllServices(build, deploy);
    } else {
      classifications.add("unknown-runtime");
      addAllServices(build, deploy);
    }
  }

  return {
    schema_version: 1,
    target_environment: "development",
    commit_sha: metadata.commitSha,
    before_sha: metadata.beforeSha,
    workflow_run_id: metadata.workflowRunId,
    migration_changed: migrationChanged,
    changed_files: changedFiles,
    classifications: [...classifications].sort(),
    build_services: BUILD_ORDER.filter((service) => build.has(service)),
    deploy_services: DEPLOY_ORDER.filter((service) => deploy.has(service)),
    no_op: build.size === 0 && deploy.size === 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commitSha = process.env.COMMIT_SHA ?? "";
  const beforeSha = process.env.BEFORE_SHA ?? "";
  const rawWorkflowRunId = process.env.WORKFLOW_RUN_ID ?? "";

  if (
    !/^[a-f0-9]{40}$/u.test(commitSha)
    || !/^[a-f0-9]{40}$/u.test(beforeSha)
    || !/^[1-9][0-9]*$/u.test(rawWorkflowRunId)
  ) {
    throw new Error("invalid immutable build-plan metadata");
  }

  const workflowRunId = Number(rawWorkflowRunId);
  if (!Number.isSafeInteger(workflowRunId)) {
    throw new Error("invalid immutable build-plan metadata");
  }

  const paths = readFileSync(0).toString("utf8").split("\0").filter(Boolean);
  const plan = resolveDevChangePlan(paths, { beforeSha, commitSha, workflowRunId });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}
