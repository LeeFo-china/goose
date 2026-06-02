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

export async function listRefs(this: any, query: ReleaseRefListQuery) {
  if (query.type === "branch") {
    return this.listBranchRefs(query);
  }

  if (query.type === "tag") {
    return this.listTagRefs(query);
  }

  return this.listCommitRefs(query);
}

export async function listBranchRefs(this: any, query: ReleaseRefListQuery) {
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

export async function listTagRefs(this: any, query: ReleaseRefListQuery) {
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

export async function listCommitRefs(this: any, query: ReleaseRefListQuery) {
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

export async function assertRefExists(this: any, input: ReleaseDispatchInput) {
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
