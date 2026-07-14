import { githubActionsGateway } from "@/gateways/github-actions";
import {
  AppError,
  Errors,
  ErrorCodes,
} from "./shared";
import type {
  AuthContext,
  GithubWorkflowRun,
  ReleaseMigrationMode,
  ReleaseProductionMigrationPrecheckDispatchInput,
} from "./types";

type GithubWorkflowRunWithWorkflow = GithubWorkflowRun & {
  workflow_id?: number | null;
  path?: string | null;
};

type GithubWorkflowMetadata = {
  path?: string | null;
};

type GithubActionsGateway = typeof githubActionsGateway;

type ProductionMigrationPrecheckArtifact = {
  schema_version?: unknown;
  workflow_run_id?: unknown;
  mode?: unknown;
  commit_sha?: unknown;
  before_count?: unknown;
  before_latest?: unknown;
  after_count?: unknown;
  after_latest?: unknown;
  pending_count?: unknown;
  pending_versions?: unknown;
  applied_count?: unknown;
  applied_versions?: unknown;
  checked_at?: unknown;
};

const PRODUCTION_MIGRATION_WORKFLOW_PATH = ".github/workflows/migrate-production-database.yml";
const PRODUCTION_MIGRATION_PRECHECK_ARTIFACT = "production-migration-precheck";
const PRODUCTION_MIGRATION_PRECHECK_FILE = "migration-precheck.json";
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function getGateway(context: any): GithubActionsGateway {
  return (context.githubActionsGateway || githubActionsGateway) as GithubActionsGateway;
}

function migrationPrecheckInvalid(message: string, details?: Record<string, unknown>) {
  return Errors.business(409, message, ErrorCodes.RELEASE_CANDIDATE_INVALID, details);
}

function assertNumber(value: unknown, fieldName: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw migrationPrecheckInvalid(`${fieldName}无效`);
  }
  return value as number;
}

function assertString(value: unknown, fieldName: string) {
  if (typeof value !== "string") throw migrationPrecheckInvalid(`${fieldName}无效`);
  return value;
}

function assertStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) throw migrationPrecheckInvalid(`${fieldName}无效`);
  return value.map((item) => assertString(item, fieldName));
}

async function assertMigrationWorkflowPath(
  gateway: GithubActionsGateway,
  run: GithubWorkflowRunWithWorkflow,
) {
  if (run.path) {
    if (run.path !== PRODUCTION_MIGRATION_WORKFLOW_PATH) {
      throw migrationPrecheckInvalid("生产迁移预检查来源工作流无效", { path: run.path });
    }
    return;
  }

  if (!Number.isSafeInteger(run.workflow_id) || (run.workflow_id ?? 0) <= 0) {
    throw migrationPrecheckInvalid("生产迁移预检查缺少工作流信息");
  }
  const workflow = await gateway.request<GithubWorkflowMetadata>(`/actions/workflows/${run.workflow_id}`);
  if (workflow.path !== PRODUCTION_MIGRATION_WORKFLOW_PATH) {
    throw migrationPrecheckInvalid("生产迁移预检查来源工作流无效", { path: workflow.path || null });
  }
}

function normalizePrecheckArtifact(raw: ProductionMigrationPrecheckArtifact, runId: string) {
  if (!raw || typeof raw !== "object") throw migrationPrecheckInvalid("生产迁移预检查结果无效");
  if (raw.schema_version !== 1) throw migrationPrecheckInvalid("生产迁移预检查结果版本无效");

  const workflowRunId = String(assertNumber(raw.workflow_run_id, "生产迁移预检查 Run"));
  if (workflowRunId !== runId) throw migrationPrecheckInvalid("生产迁移预检查 Run ID 不匹配");

  const mode = raw.mode;
  if (mode !== "plan" && mode !== "apply") throw migrationPrecheckInvalid("生产迁移预检查模式无效");
  const commitSha = assertString(raw.commit_sha, "生产迁移预检查 Commit SHA");
  if (!FULL_SHA_PATTERN.test(commitSha)) throw migrationPrecheckInvalid("生产迁移预检查 Commit SHA 无效");

  const pendingCount = assertNumber(raw.pending_count, "生产待迁移数量");
  const pendingVersions = assertStringArray(raw.pending_versions, "生产待迁移版本");
  if (pendingVersions.length !== pendingCount) {
    throw migrationPrecheckInvalid("生产待迁移版本数量不一致");
  }

  return {
    mode: mode as ReleaseMigrationMode,
    commit_sha: commitSha,
    before_count: assertNumber(raw.before_count, "生产迁移前版本数量"),
    before_latest: assertString(raw.before_latest, "生产迁移前最新版本"),
    after_count: assertNumber(raw.after_count, "生产迁移后版本数量"),
    after_latest: assertString(raw.after_latest, "生产迁移后最新版本"),
    pending_count: pendingCount,
    pending_versions: pendingVersions,
    applied_count: assertNumber(raw.applied_count, "生产已执行迁移数量"),
    applied_versions: assertStringArray(raw.applied_versions, "生产已执行迁移版本"),
    checked_at: assertString(raw.checked_at, "生产迁移预检查时间"),
  };
}

export async function getProductionMigrationPrecheck(this: any, runId: string) {
  const gateway = getGateway(this);
  const run = await gateway.request<GithubWorkflowRunWithWorkflow>(`/actions/runs/${encodeURIComponent(runId)}`);
  await assertMigrationWorkflowPath(gateway, run);

  const base = {
    run_id: String(run.id),
    run_url: run.html_url,
    status: run.status,
    conclusion: run.conclusion,
    ready: false,
    needs_migration: null as boolean | null,
    mode: null as ReleaseMigrationMode | null,
    commit_sha: run.head_sha,
    before_count: null as number | null,
    before_latest: null as string | null,
    after_count: null as number | null,
    after_latest: null as string | null,
    pending_count: null as number | null,
    pending_versions: [] as string[],
    applied_count: null as number | null,
    applied_versions: [] as string[],
    checked_at: null as string | null,
  };

  if (run.status !== "completed") {
    return { ...base, message: "迁移对比检查执行中，请稍后刷新。" };
  }
  if (run.conclusion !== "success") {
    return { ...base, message: "迁移对比检查失败，请查看 GitHub Actions 日志。" };
  }

  try {
    const artifact = await gateway.downloadArtifactJson<ProductionMigrationPrecheckArtifact>({
      runId,
      artifactName: PRODUCTION_MIGRATION_PRECHECK_ARTIFACT,
      fileName: PRODUCTION_MIGRATION_PRECHECK_FILE,
    });
    const normalized = normalizePrecheckArtifact(artifact, runId);
    const needsMigration = normalized.pending_count > 0;
    return {
      ...base,
      ...normalized,
      ready: true,
      needs_migration: needsMigration,
      message: needsMigration
        ? `发现 ${normalized.pending_count} 个待执行 migration。`
        : "当前版本无需迁移。",
    };
  } catch (error) {
    if (error instanceof AppError && error.code === ErrorCodes.RELEASE_CANDIDATE_INVALID) {
      return { ...base, message: "迁移对比结果生成中或已过期，请稍后刷新或重新预检查。" };
    }
    throw error;
  }
}

export async function dispatchProductionMigrationPrecheck(
  this: any,
  authContext: AuthContext,
  input: ReleaseProductionMigrationPrecheckDispatchInput,
) {
  const refType = input.ref_type === "tag" ? "tag" : "branch";
  return this.dispatchProductionMigration(authContext, {
    mode: "plan",
    ref_type: refType,
    ref: input.ref,
    reason: input.reason || "生产数据库迁移对比预检查",
  });
}
