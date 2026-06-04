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
  getMetadataValue,
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
  type GithubWorkflowJob,
  type GithubWorkflowRun,
  type NormalizedReleaseRun,
  type PlatformReleaseDispatchAuditRecord,
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

export async function listRuns(this: any, query: ReleaseRunListQuery) {
  const page = query.page || 1;
  const pageSize = Math.min(query.pageSize || 10, 30);
  const environments = query.environment
    ? [RELEASE_WORKFLOWS[query.environment]]
    : Object.values(RELEASE_WORKFLOWS);

  const results = await Promise.all(
    environments.map(async (workflow) => {
      const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
        `/actions/workflows/${workflow.workflowId}/runs?per_page=100&page=1`,
      );

      return (payload.workflow_runs || []).map((run) => normalizeWorkflowRun(workflow, run));
    }),
  );

  const mergedList = results
    .flat()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const total = mergedList.length;
  const list = mergedList.slice((page - 1) * pageSize, page * pageSize);
  const hydratedList = await this.hydrateRunServiceLabels(list);

  return {
    list: hydratedList,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    },
  };
}

export async function getRunFailureSummary(this: any, runId: string) {
  const payload = await githubRequest<{ total_count?: number; jobs?: GithubWorkflowJob[] }>(
    `/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`,
  );
  const jobs = payload.jobs || [];
  const failedJobs = jobs.map(summarizeFailureJob).filter((item): item is ReleaseRunFailureJobSummary => Boolean(item));

  return {
    run_id: runId,
    total_jobs: payload.total_count ?? jobs.length,
    failed_jobs: failedJobs,
    has_failure: failedJobs.length > 0,
    summary: failedJobs.length
      ? `${failedJobs.length} 个 Job 异常`
      : "未发现失败 Job 或失败步骤",
  };
}

export async function hydrateRunServiceLabels(this: any, list: NormalizedReleaseRun[]) {
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
      const auditRef = record ? getMetadataValue(record.metadata, "ref") : null;
      const isMatchingAudit = !auditRef || auditRef === run.head_branch || auditRef === run.head_sha;
      const services = record && isMatchingAudit ? getAuditServices(record) : null;
      if (!record) return run;
      return {
        ...run,
        services: services?.length ? services : run.services,
        service_label: services?.length ? formatServiceLabels(services) : run.service_label,
        audit: isMatchingAudit ? normalizeRunAudit(record) : run.audit,
      };
    });
  } catch {
    return list;
  }
}

export async function listSuccessfulRefs(this: any, query: ReleaseSuccessfulRefListQuery) {
  const page = query.page || 1;
  const pageSize = Math.min(query.pageSize || 8, 20);
  const environments = query.environment
    ? [RELEASE_WORKFLOWS[query.environment]]
    : Object.values(RELEASE_WORKFLOWS);

  const results = await Promise.all(
    environments.map(async (workflow) => {
      const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
        `/actions/workflows/${workflow.workflowId}/runs?status=completed&per_page=100`,
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

  const mergedList = [...deduped.values()]
    .filter((item) => matchesSuccessfulRefKeyword(item, query.keyword))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const total = mergedList.length;
  const list = mergedList.slice((page - 1) * pageSize, page * pageSize);

  return {
    list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    },
  };
}
