import { Errors } from "@/errors/error-factory";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import {
  getGithubConfig,
  githubRequest,
  normalizeGithubError,
} from "@/gateways/github-actions";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { dockerServiceHealthService } from "@/services/docker-service-health";
import { platformAuditLogRepository } from "@/repositories/platform-audit-logs";
import type {
  AuthContext,
  EmployeeLite,
  GithubAnnotatedTag,
  GithubBranch,
  GithubCommit,
  GithubRef,
  GithubTag,
  GithubWorkflowJob,
  GithubWorkflowRun,
  NormalizedReleaseRun,
  PlatformReleaseDispatchAuditRecord,
  ProductionReleaseCandidate,
  ReleaseCreateRollbackTagInput,
  ReleaseCreateTagInput,
  ReleaseDispatchInput,
  ReleaseEnvironment,
  ReleaseProductionCandidateDeployInput,
  ReleaseProductionMigrationDispatchInput,
  ReleaseRefListQuery,
  ReleaseRefType,
  ReleaseRunListQuery,
  ReleaseRuntimeServiceVersion,
  ReleaseRuntimeService,
  ReleaseStage,
  ReleaseSuccessfulRefListQuery,
  ReleaseService,
  ReleaseWorkflow,
  ServiceHealthContainer,
  SuccessfulReleaseRef,
  ReleaseRunAudit,
  ReleaseRunFailureJobSummary,
} from "./types";

export const RELEASE_WORKFLOWS: Record<ReleaseEnvironment, ReleaseWorkflow> = {
  dev: {
    environment: "dev",
    workflowId: "release-dev.yml",
    label: "开发环境",
    defaultRef: "main",
    services: ["api", "admin", "social-video-worker", "cos-reconcile-worker", "billing-reconcile-worker"],
  },
  production: {
    environment: "production",
    workflowId: "release-production.yml",
    label: "生产环境",
    defaultRef: "main",
    services: ["all", "api", "admin", "social-video-worker", "cos-reconcile-worker", "billing-reconcile-worker"],
  },
};

export const LEGACY_RELEASE_WORKFLOWS: ReleaseWorkflow[] = [
  {
    environment: "dev",
    workflowId: "deploy-dev.yml",
    label: "开发环境历史发布",
    defaultRef: "main",
    services: ["api", "admin", "social-video-worker", "cos-reconcile-worker", "billing-reconcile-worker"],
  },
  {
    environment: "production",
    workflowId: "build-docker-images.yml",
    label: "生产环境历史构建",
    defaultRef: "main",
    services: ["all", "api", "admin", "social-video-worker", "cos-reconcile-worker", "billing-reconcile-worker"],
  },
];

const ADMIN_RELEASE_SERVICE_ORDER: Array<Exclude<ReleaseService, "all">> = [
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
];
const RUNTIME_RELEASE_SERVICE_ORDER: ReleaseRuntimeService[] = ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker", "billing-reconcile-worker"];

const LEGACY_RELEASE_WORKFLOW_IDS = new Set(LEGACY_RELEASE_WORKFLOWS.map((workflow) => workflow.workflowId));

const RELEASE_STAGE_LABELS: Record<ReleaseStage, string> = {
  build_queued: "构建排队中",
  building: "构建中",
  build_failed: "构建失败",
  ready_to_deploy: "可部署",
  deploy_queued: "部署排队中",
  deploying: "部署中",
  deploy_failed: "部署失败",
  deployed: "已部署",
  legacy: "历史记录",
};

export const PRODUCTION_MIGRATION_WORKFLOW: ReleaseWorkflow = {
  environment: "production",
  workflowId: "migrate-production-database.yml",
  label: "生产数据库迁移",
  defaultRef: "main",
  services: [],
};

function isLegacyReleaseWorkflow(workflow: ReleaseWorkflow) {
  return LEGACY_RELEASE_WORKFLOW_IDS.has(workflow.workflowId)
    || workflow.workflowId === PRODUCTION_MIGRATION_WORKFLOW.workflowId;
}

export const SERVICE_LABELS: Record<ReleaseService, string> = {
  all: "全部服务",
  api: "API",
  admin: "Admin",
  "social-video-worker": "视频转文本 Worker",
  "cos-reconcile-worker": "COS 对账 Worker",
  "billing-reconcile-worker": "计费对账 Worker",
};
export const RUNTIME_SERVICE_LABELS: Record<ReleaseRuntimeService, string> = {
  api: SERVICE_LABELS.api,
  admin: SERVICE_LABELS.admin,
  web: "官网 Web",
  "social-video-worker": SERVICE_LABELS["social-video-worker"],
  "cos-reconcile-worker": SERVICE_LABELS["cos-reconcile-worker"],
  "billing-reconcile-worker": SERVICE_LABELS["billing-reconcile-worker"],
};

export const REF_TYPE_LABELS: Record<ReleaseRefType, string> = {
  branch: "分支",
  tag: "Tag",
  commit: "Commit",
};

export const RELEASE_OPERATION_LABELS = {
  release: "发布",
  rollback: "回滚",
} as const;

export function expandAdminReleaseServices(services: ReleaseService[]): Array<Exclude<ReleaseService, "all">> {
  if (services.includes("all")) return [...ADMIN_RELEASE_SERVICE_ORDER];
  const selected = new Set(services.filter((service): service is Exclude<ReleaseService, "all"> => service !== "all"));
  return ADMIN_RELEASE_SERVICE_ORDER.filter((service) => selected.has(service));
}

export function includesKeyword(value: string, keyword?: string) {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  if (!normalizedKeyword) return true;
  return value.toLowerCase().includes(normalizedKeyword);
}

export function formatCommitTitle(commit: GithubCommit) {
  const firstLine = commit.commit?.message?.split("\n")[0]?.trim();
  return firstLine || commit.sha;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function getShanghaiReleaseTagPrefix(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value || String(date.getFullYear());
  const month = parts.find((item) => item.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find((item) => item.type === "day")?.value || String(date.getDate()).padStart(2, "0");
  return `v${year}.${month}.${day}`;
}

export function normalizeWorkflowRun(workflow: ReleaseWorkflow, run: GithubWorkflowRun): NormalizedReleaseRun {
  const services = inferRunServices(workflow, run);
  const legacy = isLegacyReleaseWorkflow(workflow);
  const stage = inferReleaseStage(workflow, run, legacy);
  return {
    id: String(run.id),
    environment: workflow.environment,
    workflow_id: workflow.workflowId,
    workflow_label: workflow.label,
    services,
    service_label: services ? formatServiceLabels(services) : inferFallbackServiceLabel(workflow, run),
    stage,
    stage_label: RELEASE_STAGE_LABELS[stage],
    legacy,
    audit: null,
    title: run.display_title || run.name || workflow.label,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    head_branch: run.head_branch,
    head_sha: run.head_sha,
    html_url: run.html_url,
    created_at: run.created_at,
    updated_at: run.updated_at,
    run_started_at: run.run_started_at,
  };
}

export function inferReleaseStage(
  workflow: ReleaseWorkflow,
  run: GithubWorkflowRun,
  legacy = isLegacyReleaseWorkflow(workflow),
): ReleaseStage {
  if (legacy) return "legacy";

  const status = run.status || "";
  const conclusion = run.conclusion || "";
  const title = `${run.display_title || ""} ${run.name || ""}`.toLowerCase();
  const isDeploy = workflow.environment === "dev" || /\bproduction\s+deploy\b/.test(title);

  if (isDeploy) {
    if (status === "queued" || status === "waiting" || status === "requested" || status === "pending") {
      return "deploy_queued";
    }
    if (status === "in_progress") return "deploying";
    if (status === "completed" && conclusion === "success") return "deployed";
    return "deploy_failed";
  }

  if (status === "queued" || status === "waiting" || status === "requested" || status === "pending") {
    return "build_queued";
  }
  if (status === "in_progress") return "building";
  if (status === "completed" && conclusion === "success") return "ready_to_deploy";
  return "build_failed";
}

export function getMetadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

export function getAuditRunId(record: PlatformReleaseDispatchAuditRecord) {
  const metadata = record.metadata;
  return getMetadataValue(metadata, "run_id") || "";
}

export function isReleaseService(value: unknown): value is ReleaseService {
  return typeof value === "string" && value in SERVICE_LABELS;
}

export function getAuditServices(record: PlatformReleaseDispatchAuditRecord) {
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { services?: unknown; service?: unknown }).services;
  if (Array.isArray(value)) {
    const services = value.filter(isReleaseService);
    if (services.length) return services;
  }
  const service = (metadata as { service?: unknown }).service;
  if (isReleaseService(service)) return [service];
  return null;
}

export function normalizeRunAudit(record: PlatformReleaseDispatchAuditRecord): ReleaseRunAudit {
  return {
    id: record.id,
    summary: record.summary,
    status: record.status,
    created_at: record.created_at,
    actor_employee_id: record.actor_employee_id,
    actor_user_id: record.actor_user_id,
    actor_employee: record.actor_employee,
    reason: getMetadataValue(record.metadata, "reason"),
    operation: getMetadataValue(record.metadata, "operation"),
    operation_label: getMetadataValue(record.metadata, "operation_label"),
    ref: getMetadataValue(record.metadata, "ref"),
    ref_type_label: getMetadataValue(record.metadata, "ref_type_label"),
    workflow_url: getMetadataValue(record.metadata, "workflow_url"),
    run_id: getMetadataValue(record.metadata, "run_id"),
    run_url: getMetadataValue(record.metadata, "run_url"),
  };
}

export function parseServicesFromText(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  const match = text.match(/\b(?:Dev\s+release|Dev\s+deploy|Production\s+build|Production\s+deploy)\s+(.+?)(?:\s+(?:from|candidate)\b.*)?$/i);
  if (!match?.[1]) return null;
  const raw = match[1].split(",").map((item) => item.trim()).filter(Boolean);
  if (raw.includes("all")) return ["all"] as ReleaseService[];
  const services = raw.filter(isReleaseService);
  return services.length ? services : null;
}

export function inferRunServices(_workflow: ReleaseWorkflow, run: GithubWorkflowRun) {
  return parseServicesFromText(run.display_title)
    || parseServicesFromText(run.name);
}

export function inferFallbackServiceLabel(workflow: ReleaseWorkflow, run: GithubWorkflowRun) {
  if (workflow.workflowId === PRODUCTION_MIGRATION_WORKFLOW.workflowId) return "数据库迁移";
  if (workflow.environment === "dev" && run.event === "push") return "自动识别";
  return "未记录";
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeDispatchServices(input: ReleaseDispatchInput) {
  const selected = input.services?.length ? input.services : [input.service];
  const unique = Array.from(new Set(selected));
  if (unique.includes("all")) return ["all"] as ReleaseService[];
  return unique;
}

export function formatServiceLabels(services: ReleaseService[]) {
  if (services.includes("all")) return SERVICE_LABELS.all;
  return services.map((service) => SERVICE_LABELS[service]).join("、");
}

export function getRuntimeService(name: string): ReleaseRuntimeService | null {
  if (name === "gooes-api" || name === "gooes-api-dev") return "api";
  if (name === "gooes-admin" || name === "gooes-admin-dev") return "admin";
  if (name === "gooes-web" || name === "gooes-web-dev") return "web";
  if (name === "gooes-social-video-worker" || name === "gooes-social-video-worker-dev") return "social-video-worker";
  if (name === "gooes-cos-reconcile-worker" || name === "gooes-cos-reconcile-worker-dev") return "cos-reconcile-worker";
  if (name === "gooes-billing-reconcile-worker" || name === "gooes-billing-reconcile-worker-dev") return "billing-reconcile-worker";
  return null;
}

export function getRuntimeEnvironment(name: string): ReleaseEnvironment {
  return name.endsWith("-dev") ? "dev" : "production";
}

export function getReleaseEnvironmentOrder(environment: ReleaseEnvironment) {
  return environment === "production" ? 0 : 1;
}

export function getReleaseServiceOrder(service: ReleaseRuntimeService) {
  return RUNTIME_RELEASE_SERVICE_ORDER.indexOf(service);
}

export function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 12) : null;
}

export function isFullSha(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{40}$/i.test(value));
}

export function getLatestSuccessfulRunFromPayload(workflow: ReleaseWorkflow, runs: GithubWorkflowRun[]) {
  const run = runs.find((item) => {
    if (item.conclusion !== "success" || !item.head_sha) return false;
    return inferReleaseStage(workflow, item) === "deployed";
  });
  if (!run?.head_sha) return null;
  const title = run.display_title || run.name || workflow.label;
  return {
    id: String(run.id),
    environment: workflow.environment,
    workflow_id: workflow.workflowId,
    workflow_label: workflow.label,
    title,
    ref: run.head_sha,
    ref_type: "commit" as const,
    label: `${run.head_sha.slice(0, 7)} ${title}`,
    description: [
      workflow.label,
      run.head_branch ? `来源 ${run.head_branch}` : "",
      formatDateTime(run.created_at),
    ].filter(Boolean).join(" · "),
    head_branch: run.head_branch,
    head_sha: run.head_sha,
    html_url: run.html_url,
    created_at: run.created_at,
    run_started_at: run.run_started_at,
  };
}

export function matchesSuccessfulRefKeyword(item: SuccessfulReleaseRef, keyword?: string) {
  const normalized = keyword?.trim().toLowerCase();
  if (!normalized) return true;
  return [
    item.head_sha,
    item.head_sha.slice(0, 12),
    item.head_sha.slice(0, 7),
    item.title,
    item.head_branch,
    item.workflow_label,
  ].some((value) => value?.toLowerCase().includes(normalized));
}

export function isProblemConclusion(value: string | null | undefined) {
  return value === "failure" || value === "timed_out" || value === "cancelled" || value === "action_required";
}

export function summarizeFailureJob(job: GithubWorkflowJob): ReleaseRunFailureJobSummary | null {
  const failedSteps = (job.steps || [])
    .filter((step) => isProblemConclusion(step.conclusion))
    .map((step) => ({
      name: step.name || `Step ${step.number || "-"}`,
      number: step.number,
      status: step.status,
      conclusion: step.conclusion,
      started_at: step.started_at,
      completed_at: step.completed_at,
    }));

  if (!isProblemConclusion(job.conclusion) && failedSteps.length === 0) return null;

  return {
    id: String(job.id),
    name: job.name || `Job ${job.id}`,
    status: job.status,
    conclusion: job.conclusion,
    html_url: job.html_url,
    started_at: job.started_at,
    completed_at: job.completed_at,
    failed_steps: failedSteps,
  };
}

export async function compareRuntimeWithDev(runtimeSha: string | null, latestDevSha: string | null) {
  if (!isFullSha(runtimeSha) || !isFullSha(latestDevSha)) {
    return { status: "unknown" as const, label: "缺少可比对的 Commit SHA" };
  }
  if (runtimeSha?.toLowerCase() === latestDevSha?.toLowerCase()) {
    return { status: "same_as_dev" as const, label: "与最新 dev 成功版本一致" };
  }

  try {
    const payload = await githubRequest<{ status?: string }>(
      `/compare/${encodeURIComponent(runtimeSha as string)}...${encodeURIComponent(latestDevSha as string)}`,
    );
    if (payload.status === "ahead") return { status: "behind_dev" as const, label: "落后最新 dev 成功版本" };
    if (payload.status === "behind") return { status: "ahead_of_dev" as const, label: "领先于最新 dev 或发布链路不一致" };
    if (payload.status === "identical") return { status: "same_as_dev" as const, label: "与最新 dev 成功版本一致" };
    return { status: "unknown" as const, label: "与最新 dev 分支存在分叉" };
  } catch {
    return { status: "unknown" as const, label: "Commit 差异比对失败" };
  }
}

export {
  AppError,
  Errors,
  ErrorCodes,
  getGithubConfig,
  githubRequest,
  normalizeGithubError,
  dockerServiceHealthService,
  platformAuditLogRepository,
  platformAuditLogService,
};

export type {
  AuthContext,
  EmployeeLite,
  GithubAnnotatedTag,
  GithubBranch,
  GithubCommit,
  GithubRef,
  GithubTag,
  GithubWorkflowJob,
  GithubWorkflowRun,
  NormalizedReleaseRun,
  PlatformReleaseDispatchAuditRecord,
  ProductionReleaseCandidate,
  ReleaseCreateRollbackTagInput,
  ReleaseCreateTagInput,
  ReleaseDispatchInput,
  ReleaseEnvironment,
  ReleaseProductionCandidateDeployInput,
  ReleaseProductionMigrationDispatchInput,
  ReleaseRefListQuery,
  ReleaseRefType,
  ReleaseRunFailureJobSummary,
  ReleaseRunListQuery,
  ReleaseRuntimeServiceVersion,
  ReleaseRunAudit,
  ReleaseRuntimeService,
  ReleaseService,
  ReleaseStage,
  ReleaseSuccessfulRefListQuery,
  ServiceHealthContainer,
  ReleaseWorkflow,
  SuccessfulReleaseRef,
} from "./types";
