import type {
  DouyinAuthorizationState,
  DouyinPublicProfileStatus,
  DouyinReleaseState,
} from "./workspace-types";

export type WorkspaceStatusTone =
  | "outline"
  | "secondary"
  | "success"
  | "warning"
  | "danger";

const authorizationLabels: Record<DouyinAuthorizationState, string> = {
  unbound: "未授权",
  active: "已授权",
  disabled: "已停用",
  revoked: "已解除授权",
};

const releaseLabels: Record<DouyinReleaseState, string> = {
  not_uploaded: "尚未上传",
  created: "版本已创建",
  uploaded: "已上传",
  testing: "体验测试中",
  audit_pending: "审核中",
  audit_rejected: "审核驳回",
  audit_approved: "审核通过",
  released: "已发布",
  sync_error: "状态同步失败",
};

const profileStatusMeta: Record<
  DouyinPublicProfileStatus,
  { label: string; tone: WorkspaceStatusTone }
> = {
  draft: { label: "公开资料草稿", tone: "outline" },
  pending_review: { label: "公开资料待审核", tone: "warning" },
  published: { label: "公开资料展示中", tone: "success" },
  suspended: { label: "公开资料已暂停", tone: "danger" },
};

export function authorizationLabel(state: DouyinAuthorizationState) {
  return authorizationLabels[state];
}

export function authorizationTone(
  state: DouyinAuthorizationState,
): WorkspaceStatusTone {
  if (state === "active") return "success";
  if (state === "disabled") return "warning";
  if (state === "revoked") return "danger";
  return "secondary";
}

export function releaseLabel(state: DouyinReleaseState) {
  return releaseLabels[state];
}

export function releaseTone(
  state: DouyinReleaseState,
): WorkspaceStatusTone {
  if (state === "released" || state === "audit_approved") return "success";
  if (
    state === "testing"
    || state === "audit_pending"
    || state === "uploaded"
  ) {
    return "warning";
  }
  if (state === "audit_rejected" || state === "sync_error") return "danger";
  return "secondary";
}

export function releaseAuditRejectionReason(release: {
  status: string;
  audit_result: {
    status?: "pending" | "approved" | "rejected" | "failed";
    reason?: string;
  } | null;
}): string | null {
  const reason = release.audit_result?.reason?.trim();
  if (!reason) return null;
  if (release.status === "audit_rejected" || release.audit_result?.status === "rejected") {
    return reason;
  }
  return null;
}

export function profileStatusLabel(state: DouyinPublicProfileStatus) {
  return profileStatusMeta[state].label;
}

export function profileStatusTone(state: DouyinPublicProfileStatus) {
  return profileStatusMeta[state].tone;
}

export function workspaceNextAction(input: {
  authorizationState: DouyinAuthorizationState;
  releaseState: DouyinReleaseState;
}) {
  if (input.authorizationState !== "active") {
    return "授权抖音小程序";
  }

  switch (input.releaseState) {
    case "not_uploaded":
    case "created":
      return "上传首个版本";
    case "uploaded":
    case "testing":
      return "生成体验二维码";
    case "audit_rejected":
    case "sync_error":
      return "处理审核反馈";
    case "audit_approved":
      return "同步审核状态";
    case "released":
      return "查看运行状态";
    case "audit_pending":
      return "等待平台审核";
  }
}
