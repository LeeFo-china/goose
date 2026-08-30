import type { DouyinVersionListResult } from "@/gateways/douyin-open-platform/client";
import type {
  DouyinMiniappReleaseRecord,
  UpdateDouyinMiniappReleaseInput,
} from "@/repositories/douyin-miniapp-releases";

type AuditInput = { readonly host_names: string[]; readonly audit_note: string };

export function sameAuditIntent(
  release: DouyinMiniappReleaseRecord,
  input: AuditInput,
): boolean {
  const expectedHosts = new Set(input.host_names);
  return release.audit_note === input.audit_note
    && release.audit_host_names.length === input.host_names.length
    && release.audit_host_names.every((host) => expectedHosts.has(host));
}

export function clearedAuditRetryPatch(
  operatorId: string,
): UpdateDouyinMiniappReleaseInput {
  return {
    status: "testing",
    auditHostNames: [],
    auditNote: null,
    auditResult: null,
    submittedAt: null,
    auditedAt: null,
    platformOperatorId: operatorId,
  };
}

export function isStoredExplicitAuditRejection(
  release: DouyinMiniappReleaseRecord,
): boolean {
  return release.submitted_at === null
    && release.audit_result?.status === "failed"
    && release.audit_result.error_code === "DOUYIN_OPEN_PLATFORM_API_ERROR";
}

export function hasRejectedAuditVersion(
  versions: DouyinVersionListResult,
  templateVersion: string,
): boolean {
  return versions.audit?.version === templateVersion
    && String(versions.audit.status) === "2";
}
