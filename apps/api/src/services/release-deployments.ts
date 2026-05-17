import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type {
  ReleaseDispatchInput,
  ReleaseEnvironment,
  ReleaseRefListQuery,
  ReleaseRefType,
  ReleaseRunListQuery,
  ReleaseService,
} from "@/schema/release-deployments";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

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
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeWorkflowRun(workflow: ReleaseWorkflow, run: GithubWorkflowRun): NormalizedReleaseRun {
  return {
    id: String(run.id),
    environment: workflow.environment,
    workflow_id: workflow.workflowId,
    workflow_label: workflow.label,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  async listRuns(query: ReleaseRunListQuery) {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 10, 30);
    const environments = query.environment
      ? [RELEASE_WORKFLOWS[query.environment]]
      : Object.values(RELEASE_WORKFLOWS);

    const results = await Promise.all(
      environments.map(async (workflow) => {
        const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
          `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&per_page=${pageSize}&page=${page}`,
        );

        return (payload.workflow_runs || []).map((run) => normalizeWorkflowRun(workflow, run));
      }),
    );

    const list = results
      .flat()
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, pageSize);

    return {
      list,
      pagination: {
        page,
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
    if (!workflow.services.includes(input.service)) {
      throw Errors.badRequest("该环境不支持选择的服务");
    }

    await this.assertWorkflowIdle(workflow);
    await this.assertRefExists(input);

    const config = getGithubConfig();
    const inputs = input.environment === "production"
      ? { service: input.service }
      : { service: input.service };

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
      resourceLabel: `${workflow.label} ${SERVICE_LABELS[input.service]}`,
      status: "success",
      summary: `发起${workflow.label}发布：${SERVICE_LABELS[input.service]}`,
      metadata: {
        environment: input.environment,
        service: input.service,
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
      service: input.service,
      service_label: SERVICE_LABELS[input.service],
      ref: input.ref,
      workflow_id: workflow.workflowId,
      workflow_url: workflowUrl,
      run,
      message: "已提交 GitHub Actions 发布任务，请在发布记录中查看状态。",
    };
  }
}

export const releaseDeploymentService = new ReleaseDeploymentService();
