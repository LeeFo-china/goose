import { Errors } from "@/errors/error-factory";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import type {
  ReleaseCreateRollbackTagInput,
  ReleaseCreateTagInput,
  ReleaseDispatchInput,
  ReleaseEnvironment,
  ReleaseRefListQuery,
  ReleaseRefType,
  ReleaseRunListQuery,
  ReleaseSuccessfulRefListQuery,
  ReleaseService,
} from "@/schema/release-deployments";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { dockerServiceHealthService, type ServiceHealthContainer } from "@/services/docker-service-health";
import {
  platformAuditLogRepository,
  type EmployeeLite,
  type PlatformReleaseDispatchAuditRecord,
} from "@/repositories/platform-audit-logs";

type GithubWorkflowRun = {
  id: number;
  name: string | null;
  display_title: string | null;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  head_branch: string | null;
  head_sha: string | null;
  html_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  run_started_at: string | null;
};

type NormalizedReleaseRun = {
  id: string;
  environment: ReleaseEnvironment;
  workflow_id: string;
  workflow_label: string;
  services: ReleaseService[] | null;
  service_label: string;
  audit: ReleaseRunAudit | null;
  title: string;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  head_branch: string | null;
  head_sha: string | null;
  html_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  run_started_at: string | null;
};

type ReleaseRunAudit = {
  id: string;
  summary: string | null;
  status: string | null;
  created_at: string;
  actor_employee_id: string | null;
  actor_user_id: string | null;
  actor_employee: EmployeeLite | null;
  reason: string | null;
  operation: string | null;
  operation_label: string | null;
  ref: string | null;
  ref_type_label: string | null;
  workflow_url: string | null;
  run_id: string | null;
  run_url: string | null;
};

type SuccessfulReleaseRef = {
  id: string;
  environment: ReleaseEnvironment;
  workflow_id: string;
  workflow_label: string;
  title: string;
  ref: string;
  ref_type: "commit";
  label: string;
  description: string;
  head_branch: string | null;
  head_sha: string;
  html_url: string | null;
  created_at: string | null;
  run_started_at: string | null;
};

type ReleaseRuntimeServiceVersion = {
  environment: ReleaseEnvironment;
  service: Exclude<ReleaseService, "all">;
  service_label: string;
  container_name: string;
  image: string;
  image_tag: string | null;
  image_id: string | null;
  revision: string | null;
  revision_short: string | null;
  build_ref: string | null;
  build_run_id: string | null;
  build_created_at: string | null;
  image_created_at: string | null;
  state: string;
  health: ServiceHealthContainer["health"];
  started_at: string | null;
  latest_successful_dev_sha: string | null;
  latest_successful_prod_sha: string | null;
  diff_status: "same_as_dev" | "behind_dev" | "ahead_of_dev" | "unknown";
  diff_label: string;
};

type GithubBranch = {
  name: string;
  commit?: {
    sha?: string;
  };
};

type GithubTag = {
  name: string;
  commit?: {
    sha?: string;
  };
};

type GithubCommit = {
  sha: string;
  commit?: {
    message?: string;
    author?: {
      name?: string | null;
      date?: string | null;
    } | null;
  };
  html_url?: string | null;
};

type GithubAnnotatedTag = {
  sha: string;
  tag: string;
  message: string;
  url: string;
};

type GithubRef = {
  ref: string;
  url: string;
  object?: {
    sha?: string;
    type?: string;
    url?: string;
  };
};

type ReleaseWorkflow = {
  environment: ReleaseEnvironment;
  workflowId: string;
  label: string;
  defaultRef: string;
  services: ReleaseService[];
};

const RELEASE_WORKFLOWS: Record<ReleaseEnvironment, ReleaseWorkflow> = {
  dev: {
    environment: "dev",
    workflowId: "deploy-dev.yml",
    label: "开发环境",
    defaultRef: "feature/multi-tenant",
    services: ["api", "admin", "social-video-worker", "cos-reconcile-worker"],
  },
  production: {
    environment: "production",
    workflowId: "build-docker-images.yml",
    label: "生产环境",
    defaultRef: "feature/multi-tenant",
    services: ["all", "api", "admin", "social-video-worker", "cos-reconcile-worker"],
  },
};

const SERVICE_LABELS: Record<ReleaseService, string> = {
  all: "全部服务",
  api: "API",
  admin: "Admin",
  "social-video-worker": "视频转文本 Worker",
  "cos-reconcile-worker": "COS 对账 Worker",
};

const REF_TYPE_LABELS: Record<ReleaseRefType, string> = {
  branch: "分支",
  tag: "Tag",
  commit: "Commit",
};

const RELEASE_OPERATION_LABELS = {
  release: "发布",
  rollback: "回滚",
} as const;

function getGithubConfig() {
  const token = process.env.GITHUB_RELEASE_TOKEN || process.env.GITHUB_TOKEN || "";
  const repository = process.env.GITHUB_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "LeeFo-china/goose";

  if (!token) {
    throw Errors.business(
      500,
      "缺少 GitHub 发布令牌 GITHUB_RELEASE_TOKEN",
      ErrorCodes.RELEASE_CONFIG_MISSING,
    );
  }

  return {
    token,
    repository,
    apiBase: `https://api.github.com/repos/${repository}`,
    webBase: `https://github.com/${repository}`,
  };
}

function normalizeGithubError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function githubRequest<T>(path: string, init: RequestInit = {}) {
  const config = getGithubConfig();
  const response = await fetch(`${config.apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  if (response.status === 204) return null as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Errors.business(
      response.status,
      normalizeGithubError(payload, "GitHub Actions 请求失败"),
      ErrorCodes.RELEASE_DISPATCH_FAILED,
      payload,
    );
  }

  return payload as T;
}

function includesKeyword(value: string, keyword?: string) {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  if (!normalizedKeyword) return true;
  return value.toLowerCase().includes(normalizedKeyword);
}

function formatCommitTitle(commit: GithubCommit) {
  const firstLine = commit.commit?.message?.split("\n")[0]?.trim();
  return firstLine || commit.sha;
}

function formatDateTime(value: string | null | undefined) {
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

function getShanghaiReleaseTagPrefix(date = new Date()) {
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

function normalizeWorkflowRun(workflow: ReleaseWorkflow, run: GithubWorkflowRun): NormalizedReleaseRun {
  const services = inferRunServices(workflow, run);
  return {
    id: String(run.id),
    environment: workflow.environment,
    workflow_id: workflow.workflowId,
    workflow_label: workflow.label,
    services,
    service_label: services ? formatServiceLabels(services) : inferFallbackServiceLabel(workflow, run),
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

function getMetadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function getAuditRunId(record: PlatformReleaseDispatchAuditRecord) {
  const metadata = record.metadata;
  return getMetadataValue(metadata, "run_id") || "";
}

function isReleaseService(value: unknown): value is ReleaseService {
  return typeof value === "string" && value in SERVICE_LABELS;
}

function getAuditServices(record: PlatformReleaseDispatchAuditRecord) {
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

function normalizeRunAudit(record: PlatformReleaseDispatchAuditRecord): ReleaseRunAudit {
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

function parseServicesFromText(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  const match = text.match(/\b(?:Dev|Production)\s+deploy\s+(.+)$/i);
  if (!match?.[1]) return null;
  const raw = match[1].split(",").map((item) => item.trim()).filter(Boolean);
  if (raw.includes("all")) return ["all"] as ReleaseService[];
  const services = raw.filter(isReleaseService);
  return services.length ? services : null;
}

function inferRunServices(_workflow: ReleaseWorkflow, run: GithubWorkflowRun) {
  return parseServicesFromText(run.display_title)
    || parseServicesFromText(run.name);
}

function inferFallbackServiceLabel(workflow: ReleaseWorkflow, run: GithubWorkflowRun) {
  if (workflow.environment === "dev" && run.event === "push") return "自动识别";
  return "未记录";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDispatchServices(input: ReleaseDispatchInput) {
  const selected = input.services?.length ? input.services : [input.service];
  const unique = Array.from(new Set(selected));
  if (unique.includes("all")) return ["all"] as ReleaseService[];
  return unique;
}

function formatServiceLabels(services: ReleaseService[]) {
  if (services.includes("all")) return SERVICE_LABELS.all;
  return services.map((service) => SERVICE_LABELS[service]).join("、");
}

function getRuntimeService(name: string): Exclude<ReleaseService, "all"> | null {
  if (name === "gooes-api" || name === "gooes-api-dev") return "api";
  if (name === "gooes-admin" || name === "gooes-admin-dev") return "admin";
  if (name === "gooes-social-video-worker" || name === "gooes-social-video-worker-dev") return "social-video-worker";
  if (name === "gooes-cos-reconcile-worker" || name === "gooes-cos-reconcile-worker-dev") return "cos-reconcile-worker";
  return null;
}

function getRuntimeEnvironment(name: string): ReleaseEnvironment {
  return name.endsWith("-dev") ? "dev" : "production";
}

function getReleaseEnvironmentOrder(environment: ReleaseEnvironment) {
  return environment === "production" ? 0 : 1;
}

function getReleaseServiceOrder(service: Exclude<ReleaseService, "all">) {
  return ["api", "admin", "social-video-worker", "cos-reconcile-worker"].indexOf(service);
}

function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 12) : null;
}

function isFullSha(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{40}$/i.test(value));
}

function getLatestSuccessfulRunFromPayload(workflow: ReleaseWorkflow, runs: GithubWorkflowRun[]) {
  const run = runs.find((item) => item.conclusion === "success" && Boolean(item.head_sha));
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

async function compareRuntimeWithDev(runtimeSha: string | null, latestDevSha: string | null) {
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

class ReleaseDeploymentService {
  getOptions() {
    let configured = true;
    let repository = "LeeFo-china/goose";
    let webBase = "https://github.com/LeeFo-china/goose";

    try {
      const config = getGithubConfig();
      repository = config.repository;
      webBase = config.webBase;
    } catch {
      configured = false;
    }

    return {
      configured,
      repository,
      environments: Object.values(RELEASE_WORKFLOWS).map((item) => ({
        environment: item.environment,
        label: item.label,
        workflow_id: item.workflowId,
        default_ref: item.defaultRef,
        workflow_url: `${webBase}/actions/workflows/${item.workflowId}`,
        services: item.services.map((service) => ({
          value: service,
          label: SERVICE_LABELS[service],
        })),
      })),
    };
  }

  private async getLatestSuccessfulRefsByEnvironment() {
    const entries = await Promise.all(
      Object.values(RELEASE_WORKFLOWS).map(async (workflow) => {
        const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
          `/actions/workflows/${workflow.workflowId}/runs?status=completed&per_page=20`,
        );
        return [workflow.environment, getLatestSuccessfulRunFromPayload(workflow, payload.workflow_runs || [])] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<ReleaseEnvironment, SuccessfulReleaseRef | null>;
  }

  async getRuntimeVersions() {
    const snapshot = await dockerServiceHealthService.getSnapshot();
    let latestSuccessful: Record<ReleaseEnvironment, SuccessfulReleaseRef | null> = {
      dev: null,
      production: null,
    };

    try {
      latestSuccessful = await this.getLatestSuccessfulRefsByEnvironment();
    } catch {
      latestSuccessful = { dev: null, production: null };
    }

    const latestDevSha = latestSuccessful.dev?.head_sha || null;
    const latestProdSha = latestSuccessful.production?.head_sha || null;
    const compareCache = new Map<string, Awaited<ReturnType<typeof compareRuntimeWithDev>>>();

    const services: ReleaseRuntimeServiceVersion[] = [];
    for (const container of snapshot.containers) {
      const service = getRuntimeService(container.name);
      if (!service) continue;

      const revision = container.revision || (isFullSha(container.image_tag) ? container.image_tag : null);
      const cacheKey = `${revision || ""}:${latestDevSha || ""}`;
      let comparison = compareCache.get(cacheKey);
      if (!comparison) {
        comparison = await compareRuntimeWithDev(revision, latestDevSha);
        compareCache.set(cacheKey, comparison);
      }

      services.push({
        environment: getRuntimeEnvironment(container.name),
        service,
        service_label: SERVICE_LABELS[service],
        container_name: container.name,
        image: container.image,
        image_tag: container.image_tag,
        image_id: container.image_id,
        revision,
        revision_short: shortSha(revision),
        build_ref: container.build_ref,
        build_run_id: container.build_run_id,
        build_created_at: container.build_created_at,
        image_created_at: container.image_created_at,
        state: container.state,
        health: container.health,
        started_at: container.started_at,
        latest_successful_dev_sha: latestDevSha,
        latest_successful_prod_sha: latestProdSha,
        diff_status: comparison.status,
        diff_label: comparison.label,
      });
    }

    return {
      checked_at: new Date().toISOString(),
      latest_successful: latestSuccessful,
      services: services.sort((left, right) => {
        const envOrder = getReleaseEnvironmentOrder(left.environment) - getReleaseEnvironmentOrder(right.environment);
        if (envOrder !== 0) return envOrder;
        return getReleaseServiceOrder(left.service) - getReleaseServiceOrder(right.service);
      }),
    };
  }

  async listRuns(query: ReleaseRunListQuery) {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 10, 30);
    const environments = query.environment
      ? [RELEASE_WORKFLOWS[query.environment]]
      : Object.values(RELEASE_WORKFLOWS);

    const results = await Promise.all(
      environments.map(async (workflow) => {
        const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
          `/actions/workflows/${workflow.workflowId}/runs?per_page=${pageSize}&page=${page}`,
        );

        return (payload.workflow_runs || []).map((run) => normalizeWorkflowRun(workflow, run));
      }),
    );

    const list = results
      .flat()
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, pageSize);
    const hydratedList = await this.hydrateRunServiceLabels(list);

    return {
      list: hydratedList,
      pagination: {
        page,
        pageSize,
        total: hydratedList.length,
        totalPages: hydratedList.length > 0 ? 1 : 0,
      },
    };
  }

  private async hydrateRunServiceLabels(list: NormalizedReleaseRun[]) {
    if (list.length === 0) return list;

    try {
      const records = await platformAuditLogRepository.listRecentReleaseDispatches(120);
      const byRunId = new Map<string, PlatformReleaseDispatchAuditRecord>();
      for (const record of records) {
        const runId = getAuditRunId(record);
        if (runId && !byRunId.has(runId)) {
          byRunId.set(runId, record);
        }
      }

      return list.map((run) => {
        const record = byRunId.get(run.id);
        const services = record ? getAuditServices(record) : null;
        if (!record) return run;
        return {
          ...run,
          services: services?.length ? services : run.services,
          service_label: services?.length ? formatServiceLabels(services) : run.service_label,
          audit: normalizeRunAudit(record),
        };
      });
    } catch {
      return list;
    }
  }

  async listSuccessfulRefs(query: ReleaseSuccessfulRefListQuery) {
    const pageSize = Math.min(query.pageSize || 8, 20);
    const environments = query.environment
      ? [RELEASE_WORKFLOWS[query.environment]]
      : Object.values(RELEASE_WORKFLOWS);

    const results = await Promise.all(
      environments.map(async (workflow) => {
        const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
          `/actions/workflows/${workflow.workflowId}/runs?status=completed&per_page=50`,
        );

        return (payload.workflow_runs || [])
          .filter((run) => run.conclusion === "success" && Boolean(run.head_sha))
          .map((run): SuccessfulReleaseRef => {
            const title = run.display_title || run.name || workflow.label;
            const headSha = run.head_sha as string;

            return {
              id: String(run.id),
              environment: workflow.environment,
              workflow_id: workflow.workflowId,
              workflow_label: workflow.label,
              title,
              ref: headSha,
              ref_type: "commit",
              label: `${headSha.slice(0, 7)} ${title}`,
              description: [
                workflow.label,
                run.head_branch ? `来源 ${run.head_branch}` : "",
                formatDateTime(run.created_at),
              ].filter(Boolean).join(" · "),
              head_branch: run.head_branch,
              head_sha: headSha,
              html_url: run.html_url,
              created_at: run.created_at,
              run_started_at: run.run_started_at,
            };
          });
      }),
    );

    const deduped = new Map<string, SuccessfulReleaseRef>();
    for (const item of results.flat()) {
      const key = `${item.environment}:${item.head_sha.toLowerCase()}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }

    const list = [...deduped.values()]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, pageSize);

    return {
      list,
      pagination: {
        page: 1,
        pageSize,
        total: list.length,
        totalPages: list.length > 0 ? 1 : 0,
      },
    };
  }

  async listRefs(query: ReleaseRefListQuery) {
    if (query.type === "branch") {
      return this.listBranchRefs(query);
    }

    if (query.type === "tag") {
      return this.listTagRefs(query);
    }

    return this.listCommitRefs(query);
  }

  private async listBranchRefs(query: ReleaseRefListQuery) {
    const keyword = query.keyword?.trim();
    const branches = await githubRequest<GithubBranch[]>("/branches?per_page=50");
    const list = branches
      .filter((item) => includesKeyword(item.name, keyword))
      .map((item) => ({
        value: item.name,
        label: item.name,
        description: item.commit?.sha ? `最新提交 ${item.commit.sha.slice(0, 7)}` : "分支",
        type: "branch" as const,
      }));

    const defaultRef = RELEASE_WORKFLOWS.dev.defaultRef;
    if (includesKeyword(defaultRef, keyword) && !list.some((item) => item.value === defaultRef)) {
      list.unshift({
        value: defaultRef,
        label: defaultRef,
        description: "默认开发分支",
        type: "branch" as const,
      });
    }

    return {
      list: list.slice(0, 30),
    };
  }

  private async listTagRefs(query: ReleaseRefListQuery) {
    const keyword = query.keyword?.trim();
    const tags = await githubRequest<GithubTag[]>("/tags?per_page=50");
    return {
      list: tags
        .filter((item) => includesKeyword(`${item.name} ${item.commit?.sha || ""}`, keyword))
        .map((item) => ({
          value: item.name,
          label: item.name,
          description: item.commit?.sha ? `提交 ${item.commit.sha.slice(0, 7)}` : "Tag",
          type: "tag" as const,
        }))
        .slice(0, 30),
    };
  }

  private async listCommitRefs(query: ReleaseRefListQuery) {
    const keyword = query.keyword?.trim();
    const baseRef = query.base_ref?.trim() || RELEASE_WORKFLOWS.dev.defaultRef;
    const params = new URLSearchParams({
      sha: baseRef,
      per_page: "50",
    });
    const commits = await githubRequest<GithubCommit[]>(`/commits?${params.toString()}`);
    const list = commits
      .filter((item) => includesKeyword(`${item.sha} ${formatCommitTitle(item)}`, keyword))
      .map((item) => ({
        value: item.sha,
        label: `${item.sha.slice(0, 7)} ${formatCommitTitle(item)}`,
        description: [
          baseRef,
          item.commit?.author?.name,
          formatDateTime(item.commit?.author?.date),
        ].filter(Boolean).join(" · "),
        type: "commit" as const,
        url: item.html_url || null,
      }))
      .slice(0, 30);

    return { list };
  }

  private async assertRefExists(input: ReleaseDispatchInput) {
    if (input.ref_type === "branch") {
      await githubRequest<GithubBranch>(`/branches/${encodeURIComponent(input.ref)}`);
      return;
    }

    if (input.ref_type === "tag") {
      const tags = await githubRequest<GithubTag[]>("/tags?per_page=100");
      const matched = tags.some((item) => item.name === input.ref);
      if (!matched) {
        throw Errors.business(
          404,
          "发布 Tag 不存在，请重新选择",
          ErrorCodes.RELEASE_REF_NOT_FOUND,
          { ref: input.ref, ref_type: input.ref_type },
        );
      }
      return;
    }

    await githubRequest<GithubCommit>(`/commits/${encodeURIComponent(input.ref)}`);
  }

  private async assertTagNotExists(tag: string) {
    const tags = await githubRequest<GithubTag[]>("/tags?per_page=100");
    const matched = tags.some((item) => item.name === tag);
    if (matched) {
      throw Errors.business(
        409,
        "发布 Tag 已存在，请使用新的版本号",
        ErrorCodes.RELEASE_TAG_ALREADY_EXISTS,
        { tag },
      );
    }
  }

  private async generateNextReleaseTagName() {
    const tags = await githubRequest<GithubTag[]>("/tags?per_page=100");
    const prefix = getShanghaiReleaseTagPrefix();
    const pattern = new RegExp(`^${prefix.replaceAll(".", "\\.")}\\.(\\d+)$`);
    const maxNumber = tags.reduce((currentMax, item) => {
      const matched = item.name.match(pattern);
      if (!matched) return currentMax;
      const value = Number(matched[1]);
      return Number.isFinite(value) ? Math.max(currentMax, value) : currentMax;
    }, 0);

    return `${prefix}.${maxNumber + 1}`;
  }

  private async resolveCommit(ref: string) {
    try {
      return await githubRequest<GithubCommit>(`/commits/${encodeURIComponent(ref)}`);
    } catch (error) {
      if (error instanceof AppError && error.statusCode !== 404) {
        throw error;
      }

      throw Errors.business(
        404,
        "来源版本不存在，请选择有效的 Commit、Tag 或分支",
        ErrorCodes.RELEASE_REF_NOT_FOUND,
        { ref },
      );
    }
  }

  async createTag(authContext: AuthContext, input: ReleaseCreateTagInput) {
    await this.assertTagNotExists(input.tag);

    const config = getGithubConfig();
    const commit = await this.resolveCommit(input.source_ref);
    const tagObject = await githubRequest<GithubAnnotatedTag>("/git/tags", {
      method: "POST",
      body: JSON.stringify({
        tag: input.tag,
        message: input.message,
        object: commit.sha,
        type: "commit",
      }),
    });

    const ref = await githubRequest<GithubRef>("/git/refs", {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/tags/${input.tag}`,
        sha: tagObject.sha,
      }),
    });

    const htmlUrl = `${config.webBase}/tree/${encodeURIComponent(input.tag)}`;

    await platformAuditLogService.recordBestEffort({
      action: "platform_release_tag_create",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "github_release_tag",
      resourceLabel: input.tag,
      status: "success",
      summary: `创建生产发布 Tag：${input.tag}`,
      metadata: {
        tag: input.tag,
        message: input.message,
        source_ref: input.source_ref,
        target_sha: commit.sha,
        tag_sha: tagObject.sha,
        ref: ref.ref,
        html_url: htmlUrl,
      },
    });

    return {
      tag: input.tag,
      ref_type: "tag" as const,
      source_ref: input.source_ref,
      target_sha: commit.sha,
      tag_sha: tagObject.sha,
      html_url: htmlUrl,
      message: "发布 Tag 已创建，可以直接选择该 Tag 发起生产发布。",
    };
  }

  async createRollbackTag(authContext: AuthContext, input: ReleaseCreateRollbackTagInput) {
    const commit = await this.resolveCommit(input.source_ref);
    const tag = await this.generateNextReleaseTagName();
    const message = input.message?.trim() || `rollback to ${commit.sha.slice(0, 7)}`;
    const result = await this.createTag(authContext, {
      tag,
      source_ref: commit.sha,
      message,
    });

    return {
      ...result,
      rollback: true,
      message: "回滚 Tag 已创建，请确认生产发布信息后再提交发布。",
    };
  }

  private async listActiveRuns(workflow: ReleaseWorkflow) {
    const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
      `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&status=in_progress&per_page=10`,
    );
    const inProgress = payload.workflow_runs || [];
    const queuedPayload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
      `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&status=queued&per_page=10`,
    );
    return [...inProgress, ...(queuedPayload.workflow_runs || [])];
  }

  private async assertWorkflowIdle(workflow: ReleaseWorkflow) {
    const activeRuns = await this.listActiveRuns(workflow);
    if (activeRuns.length === 0) return;

    const latest = activeRuns[0];
    throw Errors.business(
      409,
      `${workflow.label}已有发布任务正在执行，请等待完成后再提交`,
      ErrorCodes.RELEASE_WORKFLOW_BUSY,
      latest ? {
        workflow_id: workflow.workflowId,
        run_id: latest.id,
        status: latest.status,
        html_url: latest.html_url,
      } : undefined,
    );
  }

  private async findRecentRun(workflow: ReleaseWorkflow, input: ReleaseDispatchInput) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) {
        await sleep(1500);
      }

      const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
        `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&per_page=10`,
      );
      const run = (payload.workflow_runs || []).find((item) => {
        if (input.ref_type === "commit") {
          return item.head_sha?.toLowerCase() === input.ref.toLowerCase();
        }
        return item.head_branch === input.ref;
      }) || payload.workflow_runs?.[0];

      if (run) {
        return normalizeWorkflowRun(workflow, run);
      }
    }

    return null;
  }

  async dispatch(authContext: AuthContext, input: ReleaseDispatchInput) {
    const workflow = RELEASE_WORKFLOWS[input.environment];
    const services = normalizeDispatchServices(input);
    if (services.some((service) => !workflow.services.includes(service))) {
      throw Errors.badRequest("该环境不支持选择的服务");
    }

    await this.assertWorkflowIdle(workflow);
    await this.assertRefExists(input);

    const config = getGithubConfig();
    const releaseServiceInput = services.includes("all") ? "all" : services.join(",");
    const serviceLabel = formatServiceLabels(services);
    const operation = input.operation || "release";
    const operationLabel = RELEASE_OPERATION_LABELS[operation];
    const inputs = { service: releaseServiceInput };

    await githubRequest<null>(
      `/actions/workflows/${workflow.workflowId}/dispatches`,
      {
        method: "POST",
        body: JSON.stringify({
          ref: input.ref,
          inputs,
        }),
      },
    );

    const workflowUrl = `${config.webBase}/actions/workflows/${workflow.workflowId}`;
    const run = await this.findRecentRun(workflow, input);

    await platformAuditLogService.recordBestEffort({
      action: "platform_release_dispatch",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "github_actions_workflow",
      resourceLabel: `${workflow.label} ${serviceLabel}`,
      status: "success",
      summary: `发起${workflow.label}${operationLabel}：${serviceLabel}`,
      metadata: {
        environment: input.environment,
        operation,
        operation_label: operationLabel,
        service: services.includes("all") ? "all" : services[0],
        services,
        ref_type: input.ref_type,
        ref_type_label: REF_TYPE_LABELS[input.ref_type],
        ref: input.ref,
        reason: input.reason || null,
        workflow_id: workflow.workflowId,
        workflow_url: workflowUrl,
        run_id: run?.id || null,
        run_url: run?.html_url || null,
      },
    });

    return {
      environment: input.environment,
      service: services.includes("all") ? "all" : services[0],
      services,
      service_label: serviceLabel,
      ref: input.ref,
      workflow_id: workflow.workflowId,
      workflow_url: workflowUrl,
      run,
      message: "已提交 GitHub Actions 发布任务，请在发布记录中查看状态。",
    };
  }
}

export const releaseDeploymentService = new ReleaseDeploymentService();
