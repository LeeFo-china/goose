import type {
  DouyinAuthorizationState,
  DouyinReleaseState,
} from "./workspace-types";

export type WorkspaceStatusTone =
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
      return "发布小程序";
    case "released":
      return "查看运行状态";
    case "audit_pending":
      return "等待平台审核";
  }
}
