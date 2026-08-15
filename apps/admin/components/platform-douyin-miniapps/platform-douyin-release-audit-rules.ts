import { getDouyinAuditRejectionReason } from "@/lib/douyin-audit-rejection-reason";

export type PlatformDouyinInstallation = {
  id: string;
  authorizer_appid: string;
  installation_kind: "merchant" | "template_development";
  authorization_status:
    | "authorized_unbound"
    | "active"
    | "disabled"
    | "revoked";
  tenant: { id: string; name: string } | null;
};

export type PlatformDouyinReleaseAudit = {
  id: string;
  installation_id: string;
  template_id: string;
  template_version: string;
  description: string;
  status:
    | "created"
    | "uploaded"
    | "testing"
    | "audit_pending"
    | "audit_rejected"
    | "audit_approved"
    | "released"
    | "failed";
  audit_result: {
    status?: "pending" | "approved" | "rejected" | "failed";
    reason?: string;
    error_code?: string;
  } | null;
  audited_at: string | null;
  updated_at: string;
};

export type PlatformDouyinReleaseListData = {
  list: PlatformDouyinReleaseAudit[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function getDouyinReleaseAuditOptions(
  installations: readonly PlatformDouyinInstallation[],
) {
  const merchants = installations.filter(
    (installation) =>
      installation.installation_kind === "merchant"
      && installation.authorization_status === "active",
  );
  return {
    merchants,
    defaultMerchantId: merchants[0]?.id ?? "",
  };
}

const releaseStatusLabels: Record<
  PlatformDouyinReleaseAudit["status"],
  string
> = {
  created: "版本已创建",
  uploaded: "已上传",
  testing: "体验测试中",
  audit_pending: "审核中",
  audit_rejected: "审核驳回",
  audit_approved: "审核通过",
  released: "已发布",
  failed: "同步失败",
};

export function releaseAuditStatusLabel(
  status: PlatformDouyinReleaseAudit["status"],
) {
  return releaseStatusLabels[status];
}

export function releaseAuditStatusTone(
  status: PlatformDouyinReleaseAudit["status"],
): "secondary" | "success" | "warning" | "danger" {
  if (status === "released" || status === "audit_approved") return "success";
  if (status === "audit_rejected" || status === "failed") return "danger";
  if (status === "audit_pending" || status === "testing" || status === "uploaded") {
    return "warning";
  }
  return "secondary";
}

export function douyinAuditRejectionReason(
  release: PlatformDouyinReleaseAudit | null,
): string | null {
  return getDouyinAuditRejectionReason(release);
}
