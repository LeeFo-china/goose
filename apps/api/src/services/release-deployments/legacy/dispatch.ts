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

export async function listActiveRuns(this: any, workflow: ReleaseWorkflow) {
  const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
    `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&status=in_progress&per_page=10`,
  );
  const inProgress = payload.workflow_runs || [];
  const queuedPayload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
    `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&status=queued&per_page=10`,
  );
  return [...inProgress, ...(queuedPayload.workflow_runs || [])];
}

export async function assertWorkflowIdle(this: any, workflow: ReleaseWorkflow) {
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

export async function findRecentRun(this: any, workflow: ReleaseWorkflow, input: ReleaseDispatchInput) {
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

export async function dispatch(this: any, authContext: AuthContext, input: ReleaseDispatchInput) {
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
