import { githubActionsGateway } from "@/gateways/github-actions";
import {
  Errors,
  ErrorCodes,
  RELEASE_WORKFLOWS,
  SERVICE_LABELS,
  expandAdminReleaseServices,
  formatServiceLabels,
  getGithubConfig,
  platformAuditLogService,
  type AuthContext,
  type GithubCommit,
  type GithubWorkflowRun,
  type ProductionReleaseCandidate,
  type ReleaseProductionCandidateDeployInput,
  type ReleaseService,
} from "./shared";

type GithubWorkflowRunWithWorkflow = GithubWorkflowRun & {
  workflow_id?: number | null;
  path?: string | null;
};

type GithubWorkflowMetadata = {
  path?: string | null;
};

type GithubArtifactMetadata = {
  id: number;
  name: string;
  expired: boolean;
};

type GithubArtifactList = {
  artifacts?: GithubArtifactMetadata[];
};

type GithubActionsGateway = typeof githubActionsGateway;

type ProductionCandidateArtifact = {
  schema_version?: unknown;
  build_run_id?: unknown;
  tag?: unknown;
  commit_sha?: unknown;
  requested_services?: unknown;
  build_services?: unknown;
  target_environment?: unknown;
  build_plan_artifact?: unknown;
};

type ProductionBuildPlanArtifact = {
  schema_version?: unknown;
  workflow_run_id?: unknown;
  commit_sha?: unknown;
  target_environment?: unknown;
  no_op?: unknown;
  build_services?: unknown;
  deploy_services?: unknown;
};

type ImageManifestArtifact = {
  service?: unknown;
  digest?: unknown;
  commit_sha?: unknown;
  target_environment?: unknown;
};

type ProductionDeploymentReceiptArtifact = {
  schema_version?: unknown;
  build_run_id?: unknown;
  deploy_run_id?: unknown;
  tag?: unknown;
  commit_sha?: unknown;
  services?: unknown;
  completed_at?: unknown;
};

const PRODUCTION_RELEASE_WORKFLOW_PATH = ".github/workflows/release-production.yml";
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const TAG_PATTERN = /^v\d{4}\.\d{2}\.\d{2}\.\d+$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const REQUESTED_SERVICE_ORDER: Array<Exclude<ReleaseService, "all">> = [
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
];
const BUILD_SERVICE_ORDER = ["api", "admin", "social-video-worker"] as const;

function candidateInvalid(message: string, details?: Record<string, unknown>) {
  return Errors.business(409, message, ErrorCodes.RELEASE_CANDIDATE_INVALID, details);
}

function candidateNotReady(message: string, details?: Record<string, unknown>) {
  return Errors.business(409, message, ErrorCodes.RELEASE_CANDIDATE_NOT_READY, details);
}

function getGateway(context: any): GithubActionsGateway {
  return (context.githubActionsGateway || githubActionsGateway) as GithubActionsGateway;
}

function getRecordAudit(context: any) {
  return context.recordAudit || platformAuditLogService.recordBestEffort.bind(platformAuditLogService);
}

function assertFullSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !FULL_SHA_PATTERN.test(value)) {
    throw candidateInvalid(`${label}无效`);
  }
  return value;
}

function assertRunId(value: unknown, expected: string, label: string) {
  const normalized = typeof value === "number" ? String(value) : value;
  if (normalized !== expected) {
    throw candidateInvalid(`${label}不匹配`);
  }
}

function assertOrderedServices(
  value: unknown,
  allowed: readonly string[],
  fieldName: string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw candidateInvalid(`${fieldName}无效`);
  }
  let previousIndex = -1;
  return value.map((item) => {
    if (typeof item !== "string") throw candidateInvalid(`${fieldName}无效`);
    const serviceIndex = allowed.indexOf(item);
    if (serviceIndex === -1 || serviceIndex <= previousIndex) {
      throw candidateInvalid(`${fieldName}无效`);
    }
    previousIndex = serviceIndex;
    return item;
  });
}

function expectedBuildServices(services: Array<Exclude<ReleaseService, "all">>) {
  const requested = new Set(services);
  return BUILD_SERVICE_ORDER.filter((service) =>
    service === "api"
      ? requested.has("api")
        || requested.has("cos-reconcile-worker")
        || requested.has("billing-reconcile-worker")
      : requested.has(service)
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function assertProductionWorkflowPath(
  gateway: ReturnType<typeof getGateway>,
  run: GithubWorkflowRunWithWorkflow,
) {
  if (run.path) {
    if (run.path !== PRODUCTION_RELEASE_WORKFLOW_PATH) {
      throw candidateInvalid("生产候选来源工作流无效", { path: run.path });
    }
    return;
  }

  if (!Number.isSafeInteger(run.workflow_id) || (run.workflow_id ?? 0) <= 0) {
    throw candidateInvalid("生产候选缺少工作流信息");
  }
  const workflow = await gateway.request<GithubWorkflowMetadata>(`/actions/workflows/${run.workflow_id}`);
  if (workflow.path !== PRODUCTION_RELEASE_WORKFLOW_PATH) {
    throw candidateInvalid("生产候选来源工作流无效", { path: workflow.path || null });
  }
}

function assertSuccessfulCandidateRun(run: GithubWorkflowRunWithWorkflow, runId: string) {
  if (String(run.id) !== runId) {
    throw candidateInvalid("生产候选 Run ID 不匹配");
  }
  if (run.event !== "workflow_dispatch") {
    throw candidateInvalid("生产候选必须来自手动发布编排");
  }
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw candidateNotReady("生产候选构建尚未成功完成", {
      status: run.status,
      conclusion: run.conclusion,
    });
  }
  return assertFullSha(run.head_sha, "生产候选 Commit SHA");
}

function normalizeCandidateArtifact(
  raw: ProductionCandidateArtifact,
  runId: string,
  runSha: string,
): {
  tag: string;
  commitSha: string;
  services: Array<Exclude<ReleaseService, "all">>;
  buildServices: ProductionReleaseCandidate["build_services"];
} {
  if (!raw || typeof raw !== "object") throw candidateInvalid("生产候选证据无效");
  if (raw.schema_version !== 1) throw candidateInvalid("生产候选证据版本无效");
  assertRunId(raw.build_run_id, runId, "生产候选构建 Run");
  const tag = typeof raw.tag === "string" && TAG_PATTERN.test(raw.tag)
    ? raw.tag
    : null;
  if (!tag) throw candidateInvalid("生产候选 Tag 无效");
  const commitSha = assertFullSha(raw.commit_sha, "生产候选 Commit SHA");
  if (commitSha.toLowerCase() !== runSha.toLowerCase()) {
    throw candidateInvalid("生产候选 Commit SHA 与构建 Run 不一致");
  }
  if (raw.target_environment !== "production") {
    throw candidateInvalid("生产候选环境无效");
  }
  if (raw.build_plan_artifact !== "production-build-plan") {
    throw candidateInvalid("生产候选构建计划证据无效");
  }

  const services = assertOrderedServices(
    raw.requested_services,
    REQUESTED_SERVICE_ORDER,
    "生产候选服务",
  ) as Array<Exclude<ReleaseService, "all">>;
  const buildServices = assertOrderedServices(
    raw.build_services,
    BUILD_SERVICE_ORDER,
    "生产候选镜像服务",
  ) as ProductionReleaseCandidate["build_services"];
  if (!arraysEqual(buildServices, expectedBuildServices(services))) {
    throw candidateInvalid("生产候选镜像服务与发布服务不一致");
  }

  return { tag, commitSha, services, buildServices };
}

function validatePlan(
  raw: ProductionBuildPlanArtifact,
  runId: string,
  commitSha: string,
  services: Array<Exclude<ReleaseService, "all">>,
  buildServices: ProductionReleaseCandidate["build_services"],
) {
  if (!raw || typeof raw !== "object") throw candidateInvalid("生产构建计划无效");
  if (raw.schema_version !== 1) throw candidateInvalid("生产构建计划版本无效");
  assertRunId(raw.workflow_run_id, runId, "生产构建计划 Run");
  const planSha = assertFullSha(raw.commit_sha, "生产构建计划 Commit SHA");
  if (planSha.toLowerCase() !== commitSha.toLowerCase()) {
    throw candidateInvalid("生产构建计划 Commit SHA 不一致");
  }
  if (raw.target_environment !== "production" || raw.no_op !== false) {
    throw candidateInvalid("生产构建计划环境无效");
  }
  const planBuildServices = assertOrderedServices(raw.build_services, BUILD_SERVICE_ORDER, "生产构建计划镜像服务");
  const planDeployServices = assertOrderedServices(raw.deploy_services, REQUESTED_SERVICE_ORDER, "生产构建计划发布服务");
  if (!arraysEqual(planBuildServices, buildServices) || !arraysEqual(planDeployServices, services)) {
    throw candidateInvalid("生产构建计划服务与候选不一致");
  }
}

function validateManifest(
  raw: ImageManifestArtifact,
  service: ProductionReleaseCandidate["build_services"][number],
  commitSha: string,
) {
  if (!raw || typeof raw !== "object") throw candidateInvalid("生产镜像 Manifest 无效");
  if (raw.service !== service) throw candidateInvalid("生产镜像 Manifest 服务不一致");
  const manifestSha = assertFullSha(raw.commit_sha, "生产镜像 Manifest Commit SHA");
  if (manifestSha.toLowerCase() !== commitSha.toLowerCase()) {
    throw candidateInvalid("生产镜像 Manifest Commit SHA 不一致");
  }
  if (raw.target_environment !== "production") {
    throw candidateInvalid("生产镜像 Manifest 环境无效");
  }
  if (typeof raw.digest !== "string" || !DIGEST_PATTERN.test(raw.digest)) {
    throw candidateInvalid("生产镜像 Manifest digest 无效");
  }
}

async function getReceiptState(
  gateway: ReturnType<typeof getGateway>,
  runId: string,
  expected: {
    tag: string;
    commitSha: string;
    services: Array<Exclude<ReleaseService, "all">>;
  },
) {
  const receiptName = `production-deployment-receipt-${runId}`;
  const payload = await gateway.request<GithubArtifactList>(
    `/actions/artifacts?name=${encodeURIComponent(receiptName)}&per_page=100`,
  );
  if (!payload || !Array.isArray(payload.artifacts)) {
    throw candidateInvalid("生产部署回执元数据无效");
  }
  const matches = payload.artifacts.filter((item) => item.name === receiptName && !item.expired);
  if (matches.length > 1) {
    throw candidateInvalid("生产部署回执重复");
  }
  if (matches.length === 1) {
    const receiptArtifact = matches[0];
    if (!receiptArtifact) throw candidateInvalid("生产部署回执元数据无效");
    const receipt = await gateway.downloadArtifactJsonById<ProductionDeploymentReceiptArtifact>({
      artifactId: receiptArtifact.id,
      fileName: "production-deployment-receipt.json",
    });
    if (receipt.schema_version !== 1) throw candidateInvalid("生产部署回执版本无效");
    assertRunId(receipt.build_run_id, runId, "生产部署回执构建 Run");
    if (typeof receipt.deploy_run_id !== "number" || !Number.isSafeInteger(receipt.deploy_run_id)) {
      throw candidateInvalid("生产部署回执部署 Run 无效");
    }
    if (receipt.tag !== expected.tag) throw candidateInvalid("生产部署回执 Tag 不一致");
    const receiptSha = assertFullSha(receipt.commit_sha, "生产部署回执 Commit SHA");
    if (receiptSha.toLowerCase() !== expected.commitSha.toLowerCase()) {
      throw candidateInvalid("生产部署回执 Commit SHA 不一致");
    }
    const receiptServices = assertOrderedServices(receipt.services, REQUESTED_SERVICE_ORDER, "生产部署回执服务");
    if (!arraysEqual(receiptServices, expected.services)) {
      throw candidateInvalid("生产部署回执服务不一致");
    }
    if (typeof receipt.completed_at !== "string" || !receipt.completed_at.trim()) {
      throw candidateInvalid("生产部署回执完成时间无效");
    }
  }
  return {
    alreadyDeployed: matches.length === 1,
    blockedReason: matches.length === 1 ? "该生产候选已部署，请创建新的候选后再操作。" : null,
  };
}

export async function getProductionCandidate(this: any, runId: string): Promise<ProductionReleaseCandidate> {
  const gateway = getGateway(this);
  const run = await gateway.request<GithubWorkflowRunWithWorkflow>(`/actions/runs/${encodeURIComponent(runId)}`);
  await assertProductionWorkflowPath(gateway, run);
  const runSha = assertSuccessfulCandidateRun(run, runId);

  const candidateArtifact = await gateway.downloadArtifactJson<ProductionCandidateArtifact>({
    runId,
    artifactName: "production-release-candidate",
    fileName: "production-release-candidate.json",
  });
  const normalized = normalizeCandidateArtifact(candidateArtifact, runId, runSha);

  const manifestPromises = normalized.buildServices.map((service) =>
    gateway.downloadArtifactJson<ImageManifestArtifact>({
      runId,
      artifactName: `image-manifest-${service}`,
      fileName: `image-manifest-${service}.json`,
    })
  );
  const [tagCommit, plan, receiptState, manifests] = await Promise.all([
    this.resolveCommit(normalized.tag) as Promise<GithubCommit>,
    gateway.downloadArtifactJson<ProductionBuildPlanArtifact>({
      runId,
      artifactName: "production-build-plan",
      fileName: "build-plan.json",
    }),
    getReceiptState(gateway, runId, {
      tag: normalized.tag,
      commitSha: normalized.commitSha,
      services: normalized.services,
    }),
    Promise.all(manifestPromises),
  ]);

  if (!tagCommit?.sha || tagCommit.sha.toLowerCase() !== normalized.commitSha.toLowerCase()) {
    throw candidateInvalid("生产候选 Tag 指向的 Commit 不一致");
  }
  validatePlan(plan, runId, normalized.commitSha, normalized.services, normalized.buildServices);
  manifests.forEach((manifest, index) => {
    const service = normalized.buildServices[index];
    if (!service) throw candidateInvalid("生产镜像 Manifest 缺失");
    validateManifest(manifest, service, normalized.commitSha);
  });

  return {
    build_run_id: runId,
    tag: normalized.tag,
    commit_sha: normalized.commitSha,
    services: normalized.services,
    build_services: normalized.buildServices,
    target_environment: "production",
    manifest_verified: true,
    ready_to_deploy: !receiptState.alreadyDeployed,
    already_deployed: receiptState.alreadyDeployed,
    blocked_reason: receiptState.blockedReason,
    run_url: run.html_url,
    created_at: run.created_at,
  };
}

export async function dispatchProductionCandidate(
  this: any,
  authContext: AuthContext,
  runId: string,
  input: ReleaseProductionCandidateDeployInput,
) {
  const candidate = await this.getProductionCandidate(runId);
  if (candidate.already_deployed) {
    throw Errors.business(
      409,
      "该生产候选已部署，请创建新的候选后再操作。",
      ErrorCodes.RELEASE_CANDIDATE_ALREADY_DEPLOYED,
      { build_run_id: runId },
    );
  }

  const requestedServices = expandAdminReleaseServices(input.services);
  if (!arraysEqual(requestedServices, candidate.services)) {
    throw candidateInvalid("部署服务必须与生产候选服务完全一致", {
      requested_services: requestedServices,
      candidate_services: candidate.services,
    });
  }

  const gateway = getGateway(this);
  const workflow = RELEASE_WORKFLOWS.production;
  await this.assertWorkflowIdle?.(workflow);

  const inputs = {
    operation: "deploy",
    service: candidate.services.join(","),
    build_run_id: candidate.build_run_id,
    commit_sha: candidate.commit_sha,
    confirm_text: input.confirm_text,
    reason: input.reason || "",
  };
  await gateway.request<null>(`/actions/workflows/${workflow.workflowId}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref: candidate.tag,
      inputs,
    }),
  });

  const config = getGithubConfig();
  const workflowUrl = `${config.webBase}/actions/workflows/${workflow.workflowId}`;
  const run = await this.findRecentRun?.(workflow, {
    environment: "production",
    service: candidate.services[0],
    services: candidate.services,
    ref_type: "tag",
    ref: candidate.tag,
    operation: "release",
    reason: input.reason,
    confirm_text: input.confirm_text,
  }, "deploy");

  await getRecordAudit(this)({
    action: "platform_release_dispatch",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    resourceType: "github_actions_workflow",
    resourceLabel: `${workflow.label} ${formatServiceLabels(candidate.services)}`,
    status: "success",
    summary: `发起生产候选部署：${formatServiceLabels(candidate.services)}`,
    metadata: {
      environment: "production",
      stage: "deploy",
      operation: "deploy",
      operation_label: "部署",
      service: candidate.services[0],
      services: candidate.services,
      ref_type: "tag",
      ref_type_label: "Tag",
      ref: candidate.tag,
      reason: input.reason || null,
      commit_sha: candidate.commit_sha,
      build_run_id: candidate.build_run_id,
      workflow_id: workflow.workflowId,
      workflow_url: workflowUrl,
      run_id: run?.id || null,
      run_url: run?.html_url || null,
    },
  });

  return {
    environment: "production",
    service: candidate.services[0],
    services: candidate.services,
    service_label: formatServiceLabels(candidate.services),
    ref: candidate.tag,
    stage: "deploy",
    workflow_id: workflow.workflowId,
    workflow_url: workflowUrl,
    run,
    message: "已提交生产候选部署任务，请在发布记录中查看状态。",
  };
}
