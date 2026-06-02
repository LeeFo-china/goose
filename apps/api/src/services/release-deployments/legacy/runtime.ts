import {
  AppError,
  Errors,
  ErrorCodes,
  REF_TYPE_LABELS,
  RELEASE_OPERATION_LABELS,
  RELEASE_WORKFLOWS,
  SERVICE_LABELS,
  compareRuntimeWithDev,
  dockerServiceHealthService,
  formatCommitTitle,
  formatDateTime,
  formatServiceLabels,
  getAuditRunId,
  getAuditServices,
  getGithubConfig,
  getLatestSuccessfulRunFromPayload,
  getReleaseEnvironmentOrder,
  getReleaseServiceOrder,
  getRuntimeEnvironment,
  getRuntimeService,
  getShanghaiReleaseTagPrefix,
  githubRequest,
  includesKeyword,
  isFullSha,
  matchesSuccessfulRefKeyword,
  normalizeDispatchServices,
  normalizeRunAudit,
  normalizeWorkflowRun,
  platformAuditLogRepository,
  platformAuditLogService,
  shortSha,
  sleep,
  summarizeFailureJob,
  type AuthContext,
  type GithubBranch,
  type GithubCommit,
  type GithubRef,
  type GithubTag,
  type GithubAnnotatedTag,
  type GithubWorkflowRun,
  type NormalizedReleaseRun,
  type ReleaseCreateRollbackTagInput,
  type ReleaseCreateTagInput,
  type ReleaseDispatchInput,
  type ReleaseEnvironment,
  type ReleaseRefListQuery,
  type ReleaseRunFailureJobSummary,
  type ReleaseRunListQuery,
  type ReleaseRuntimeServiceVersion,
  type ReleaseService,
  type ReleaseSuccessfulRefListQuery,
  type ReleaseWorkflow,
  type SuccessfulReleaseRef,
} from "./shared";

export function getOptions(this: any) {
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

export async function getLatestSuccessfulRefsByEnvironment(this: any) {
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

export async function getRuntimeVersions(this: any) {
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
