import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type {
  ReleaseDispatchInput,
  ReleaseEnvironment,
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

        return (payload.workflow_runs || []).map((run) => ({
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
        }));
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

  async dispatch(authContext: AuthContext, input: ReleaseDispatchInput) {
    const workflow = RELEASE_WORKFLOWS[input.environment];
    if (!workflow.services.includes(input.service)) {
      throw Errors.badRequest("该环境不支持选择的服务");
    }

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

    await platformAuditLogService.recordBestEffort({
      action: "platform_release_dispatch",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "github_actions_workflow",
      resourceId: workflow.workflowId,
      resourceLabel: `${workflow.label} ${SERVICE_LABELS[input.service]}`,
      status: "success",
      summary: `发起${workflow.label}发布：${SERVICE_LABELS[input.service]}`,
      metadata: {
        environment: input.environment,
        service: input.service,
        ref: input.ref,
        reason: input.reason || null,
        workflow_id: workflow.workflowId,
        workflow_url: workflowUrl,
      },
    });

    return {
      environment: input.environment,
      service: input.service,
      service_label: SERVICE_LABELS[input.service],
      ref: input.ref,
      workflow_id: workflow.workflowId,
      workflow_url: workflowUrl,
      message: "已提交 GitHub Actions 发布任务，请在发布记录中查看状态。",
    };
  }
}

export const releaseDeploymentService = new ReleaseDeploymentService();
