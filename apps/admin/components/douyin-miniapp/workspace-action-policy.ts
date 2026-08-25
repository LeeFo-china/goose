"use client";

import { isDouyinTestQrUrlUsable } from "@gooes/domain";

import type { TenantDouyinWorkspace } from "./workspace-types";

export type TenantDouyinWorkspaceAction =
  | "authorize"
  | "create_test_version"
  | "get_test_qr"
  | "get_audit_qr"
  | "submit_audit"
  | "sync_status"
  | "publish";

export type AuditChecklist = {
  authorizationActive: boolean;
  profilePublished: boolean;
  testQrReady: boolean;
  readinessReady: boolean;
  auditFieldsComplete: boolean;
};

export function availableWorkspaceActions(
  workspace: TenantDouyinWorkspace,
): TenantDouyinWorkspaceAction[] {
  if (workspace.authorization_state !== "active") return ["authorize"];

  const release = workspace.latest_release;
  const hasNewTemplate = workspace.available_template?.state === "new_available";
  const blocksNewTemplate = release?.status === "created"
    || release?.status === "audit_pending"
    || release?.status === "audit_approved";
  if (hasNewTemplate && !blocksNewTemplate) {
    if (release?.status === "audit_rejected" || release?.status === "failed") {
      return ["sync_status", "create_test_version"];
    }
    return ["create_test_version"];
  }
  if (!release) return [];

  switch (workspace.release_state) {
    case "uploaded":
      return ["get_test_qr"];
    case "testing":
      return isDouyinTestQrUrlUsable(release.latest_test_qr_url ?? release.test_qr_url)
        ? ["submit_audit"]
        : ["get_test_qr"];
    case "audit_pending":
      return isDouyinTestQrUrlUsable(release.audit_qr_url)
        ? ["sync_status"]
        : ["sync_status", "get_audit_qr"];
    case "audit_rejected":
      return isDouyinTestQrUrlUsable(release.latest_test_qr_url ?? release.test_qr_url)
        ? ["sync_status", "submit_audit"]
        : ["sync_status", "get_test_qr"];
    case "audit_approved":
      return ["publish"];
    case "sync_error":
      return ["sync_status"];
    case "created":
      return ["create_test_version"];
    case "not_uploaded":
    case "released":
      return [];
  }
}

export function canSubmitAudit(checklist: AuditChecklist) {
  return Object.values(checklist).every(Boolean);
}

export function parseAuditHostNames(value: string) {
  return Array.from(new Set(
    value
      .split(/[\n,，]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

export function actionSummary(actions: TenantDouyinWorkspaceAction[]) {
  if (actions.includes("authorize")) return "连接租户自有抖音小程序";
  if (actions.includes("get_test_qr")) return "生成体验二维码并完成手机验收";
  if (actions.includes("get_audit_qr")) return "获取审核版二维码并保留扫码入口";
  if (actions.includes("submit_audit")) return "核对提审信息并提交平台审核";
  if (actions.includes("sync_status")) return "从抖音开放平台同步审核状态";
  if (actions.includes("publish")) return "审核已通过，可以正式发布";
  if (actions.includes("create_test_version")) return "生成体验版并完成验收";
  return "平台侧正在准备版本或当前版本已经发布";
}

export function permissionForActions(
  actions: TenantDouyinWorkspaceAction[],
  canManage: boolean,
  canSubmitAuditPermission: boolean,
  canPublish: boolean,
) {
  return actions.length === 0 || actions.every((action) => {
    if (action === "submit_audit") return canSubmitAuditPermission;
    if (action === "publish") return canPublish;
    return canManage;
  });
}
