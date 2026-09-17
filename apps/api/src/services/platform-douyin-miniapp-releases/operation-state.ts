import type {
  DouyinVersionListResult,
  SafeDouyinVersionStage,
} from "@/gateways/douyin-open-platform/client";
import type {
  DouyinMiniappReleaseRecord,
  UpdateDouyinMiniappReleaseInput,
} from "@/repositories/douyin-miniapp-releases";
import { matchesDouyinDeliveryStage } from "./delivery-summary";
import { auditVersionMismatch, mapAuditStatus, safeAuditResult } from "./support";

export function auditPatch(
  release: DouyinMiniappReleaseRecord,
  audit: SafeDouyinVersionStage,
  logId: string,
  now: string,
): UpdateDouyinMiniappReleaseInput {
  const mapped = mapAuditStatus(audit.status);
  const submittedAt = release.submitted_at ?? now;
  const auditedAt = mapped.releaseStatus === "audit_pending" ? undefined : release.audited_at ?? now;
  return {
    status: mapped.releaseStatus,
    auditResult: safeAuditResult(mapped.auditStatus, audit.reason),
    submittedAt,
    ...(auditedAt ? { auditedAt } : {}),
    douyinLogId: logId,
    platformOperatorId: release.platform_operator_id,
  };
}

export function releasedPatch(
  release: DouyinMiniappReleaseRecord,
  logId: string,
  now: string,
): UpdateDouyinMiniappReleaseInput & { auditedAt: string; releasedAt: string } {
  return {
    status: "released",
    auditResult: { status: "approved" },
    submittedAt: release.submitted_at ?? now,
    auditedAt: release.audited_at ?? now,
    releasedAt: release.released_at ?? now,
    douyinLogId: logId,
    platformOperatorId: release.platform_operator_id,
  };
}

export function recoveryPatch(
  release: DouyinMiniappReleaseRecord,
  versions: DouyinVersionListResult,
  now: string,
  includeLatest = true,
): UpdateDouyinMiniappReleaseInput | null {
  if (matchesDouyinDeliveryStage(release, versions.current)) {
    return releasedPatch(release, versions.logId, now);
  }
  if (matchesDouyinDeliveryStage(release, versions.audit)) {
    return auditPatch(release, versions.audit!, versions.logId, now);
  }
  if (includeLatest && matchesDouyinDeliveryStage(release, versions.latest)) {
    return { status: "uploaded", auditResult: null, douyinLogId: versions.logId,
      platformOperatorId: release.platform_operator_id };
  }
  return null;
}

export function syncStatusPatch(
  release: DouyinMiniappReleaseRecord,
  versions: DouyinVersionListResult,
  now: string,
): UpdateDouyinMiniappReleaseInput {
  const recovered = recoveryPatch(release, versions, now, release.status === "failed");
  if (recovered) return recovered;
  if (!matchesDouyinDeliveryStage(release, versions.audit)) throw auditVersionMismatch();
  return auditPatch(release, versions.audit!, versions.logId, now);
}
