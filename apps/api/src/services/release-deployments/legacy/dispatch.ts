import {
  AppError,
  Errors,
  ErrorCodes,
  REF_TYPE_LABELS,
  RELEASE_OPERATION_LABELS,
  PRODUCTION_MIGRATION_WORKFLOW,
  RELEASE_WORKFLOWS,
  SERVICE_LABELS,
  compareRuntimeWithDev,
  dockerServiceHealthService,
  expandAdminReleaseServices,
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
  type ReleaseProductionMigrationDispatchInput,
  type ReleaseRefListQuery,
  type ReleaseRunFailureJobSummary,
  type ReleaseRunListQuery,
  type ReleaseRuntimeServiceVersion,
  type ReleaseService,
  type ReleaseSuccessfulRefListQuery,
  type ReleaseWorkflow,
  type SuccessfulReleaseRef,
} from "./shared";

type ReleaseDispatchStage = "release" | "build";
type ReleaseRecentRunStage = ReleaseDispatchStage | "deploy";

export function buildReleaseDispatchRequest(input: ReleaseDispatchInput): {
  workflowId: string;
  ref: string;
  stage: ReleaseDispatchStage;
  inputs: Record<string, string>;
} {
  const services = normalizeDispatchServices(input);
  const serviceInput = expandAdminReleaseServices(services).join(",");

  if (input.environment === "production") {
    return {
      workflowId: RELEASE_WORKFLOWS.production.workflowId,
      ref: input.ref,
      stage: "build",
      inputs: {
        operation: "build",
        service: serviceInput,
        confirm_text: input.confirm_text || "",
        reason: input.reason || "",
      },
    };
  }

  return {
    workflowId: RELEASE_WORKFLOWS.dev.workflowId,
    ref: input.ref,
    stage: "release",
    inputs: {
      service: serviceInput,
      operation: input.operation || "release",
      reason: input.reason || "",
    },
  };
}

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

export function matchesRecentRunStage(run: NormalizedReleaseRun, stage?: ReleaseRecentRunStage) {
  if (!stage) return true;
  if (stage === "release") {
    return run.stage === "deploy_queued"
      || run.stage === "deploying"
      || run.stage === "deploy_failed"
      || run.stage === "deployed";
  }
  if (stage === "build") {
    return run.stage === "build_queued"
      || run.stage === "building"
      || run.stage === "build_failed"
      || run.stage === "ready_to_deploy";
  }
  return run.stage === "deploy_queued"
    || run.stage === "deploying"
    || run.stage === "deploy_failed"
    || run.stage === "deployed";
}

export async function findRecentRun(
  this: any,
  workflow: ReleaseWorkflow,
  input: ReleaseDispatchInput,
  stage?: ReleaseRecentRunStage,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) {
      await sleep(1500);
    }

    const payload = await githubRequest<{ workflow_runs?: GithubWorkflowRun[] }>(
      `/actions/workflows/${workflow.workflowId}/runs?event=workflow_dispatch&per_page=10`,
    );
    for (const item of payload.workflow_runs || []) {
      const isMatchingRef = input.ref_type === "commit"
        ? item.head_sha?.toLowerCase() === input.ref.toLowerCase()
        : item.head_branch === input.ref;
      if (!isMatchingRef) continue;

      const run = normalizeWorkflowRun(workflow, item);
      if (matchesRecentRunStage(run, stage)) {
        return run;
      }
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
  const dispatchRequest = buildReleaseDispatchRequest(input);
  const expandedServices = expandAdminReleaseServices(services);
  const serviceLabel = formatServiceLabels(services);
  const operation = input.operation || "release";
  const operationLabel = RELEASE_OPERATION_LABELS[operation];

  await githubRequest<null>(
    `/actions/workflows/${dispatchRequest.workflowId}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: dispatchRequest.ref,
        inputs: dispatchRequest.inputs,
      }),
    },
  );

  const workflowUrl = `${config.webBase}/actions/workflows/${dispatchRequest.workflowId}`;
  const run = await this.findRecentRun(workflow, input, dispatchRequest.stage);
  const commitSha = run?.head_sha || null;

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
      stage: dispatchRequest.stage,
      operation,
      operation_label: operationLabel,
      service: services.includes("all") ? "all" : services[0],
      services: expandedServices,
      ref_type: input.ref_type,
      ref_type_label: REF_TYPE_LABELS[input.ref_type],
      ref: input.ref,
      reason: input.reason || null,
      commit_sha: commitSha,
      workflow_id: dispatchRequest.workflowId,
      workflow_url: workflowUrl,
      run_id: run?.id || null,
      run_url: run?.html_url || null,
    },
  });

  return {
    environment: input.environment,
    service: services.includes("all") ? "all" : services[0],
    services: expandedServices,
    service_label: serviceLabel,
    ref: input.ref,
    stage: dispatchRequest.stage,
    workflow_id: dispatchRequest.workflowId,
    workflow_url: workflowUrl,
    run,
    message: input.environment === "dev"
      ? "已提交开发环境构建与发布任务，请在发布记录中查看各阶段状态。"
      : "已提交生产候选构建，构建成功并校验证据后才能部署。",
  };
}

export async function dispatchProductionMigration(
  this: any,
  authContext: AuthContext,
  input: ReleaseProductionMigrationDispatchInput,
) {
  const workflow = PRODUCTION_MIGRATION_WORKFLOW;
  await this.assertWorkflowIdle(workflow);

  if (input.ref_type === "branch") {
    await githubRequest<GithubBranch>(`/branches/${encodeURIComponent(input.ref)}`);
  } else {
    const tags = await githubRequest<GithubTag[]>("/tags?per_page=100");
    const matched = tags.some((item) => item.name === input.ref);
    if (!matched) {
      throw Errors.business(
        404,
        "迁移版本 Tag 不存在，请重新选择",
        ErrorCodes.RELEASE_REF_NOT_FOUND,
        { ref: input.ref, ref_type: input.ref_type },
      );
    }
  }

  const config = getGithubConfig();
  const inputs = {
    mode: input.mode,
    confirm_text: input.mode === "apply" ? input.confirm_text || "" : "",
  };

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
  const run = await this.findRecentRun(workflow, {
    environment: "production",
    service: "all",
    services: ["all"],
    ref_type: input.ref_type,
    ref: input.ref,
    operation: "release",
    reason: input.reason,
    confirm_text: input.confirm_text,
  });
  const modeLabel = input.mode === "apply" ? "执行" : "预检查";

  await platformAuditLogService.recordBestEffort({
    action: "platform_release_dispatch",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    resourceType: "github_actions_workflow",
    resourceLabel: `${workflow.label} ${modeLabel}`,
    status: "success",
    summary: `发起${workflow.label}${modeLabel}`,
    metadata: {
      environment: "production",
      operation: "migration",
      operation_label: modeLabel,
      migration_mode: input.mode,
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
    mode: input.mode,
    ref: input.ref,
    ref_type: input.ref_type,
    workflow_id: workflow.workflowId,
    workflow_url: workflowUrl,
    run,
    message: `已提交生产数据库迁移${modeLabel}任务，请在发布记录中查看状态。`,
  };
}
