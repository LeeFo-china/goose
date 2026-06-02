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

export async function assertTagNotExists(this: any, tag: string) {
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

export async function generateNextReleaseTagName(this: any) {
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

export async function resolveCommit(this: any, ref: string) {
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

export async function createTag(this: any, authContext: AuthContext, input: ReleaseCreateTagInput) {
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

export async function createRollbackTag(this: any, authContext: AuthContext, input: ReleaseCreateRollbackTagInput) {
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
