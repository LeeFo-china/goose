import { isDouyinTestQrUrlUsable } from "@gooes/domain";
import type { DouyinVersionListResult } from "@/gateways/douyin-open-platform/client";
import type { DouyinDeployableTemplate } from "@/repositories/douyin-deployable-templates";
import type { DouyinMiniappReleaseRecord } from "@/repositories/douyin-miniapp-releases";
import { matchesDouyinDeliveryStage } from
  "@/services/platform-douyin-miniapp-releases/delivery-summary";
import { compareDouyinTemplateVersion } from "./template-version";

export type TenantDouyinReleaseAction = "create_test_version" | "generate_test_qr"
  | "generate_audit_qr" | "submit_audit" | "sync_status" | "publish";
export type TenantDouyinTemplateSelectionKind =
  | "recommended" | "stable" | "rollback" | "current_online" | "release";
export type TenantDouyinReleaseOption = {
  readonly id: string;
  readonly source: "confirmed_template" | "release";
  readonly release_id: string | null;
  readonly template_id: string;
  readonly template_version: string;
  readonly description: string;
  readonly stage: "ready_to_upload" | DouyinMiniappReleaseRecord["status"];
  readonly actions: readonly TenantDouyinReleaseAction[];
  readonly test_qr_url: string | null;
  readonly updated_at: string;
  readonly is_recommended: boolean;
  readonly selection_kind: TenantDouyinTemplateSelectionKind;
};

type Input = {
  readonly templates: readonly DouyinDeployableTemplate[];
  readonly releases: readonly DouyinMiniappReleaseRecord[];
  readonly versions: DouyinVersionListResult | null;
};

export function buildTenantDouyinReleaseOptions(input: Input): TenantDouyinReleaseOption[] {
  const options: TenantDouyinReleaseOption[] = [];
  for (const template of input.templates) {
    const exact = input.releases.find((release) => release.template_id === template.template_id
      && release.template_version === template.template_version);
    if (shouldOfferTemplate(exact, template, input.versions)) {
      options.push(templateOption(template, input.versions));
    }
  }
  for (const release of input.releases) {
    if (isAmbiguousLegacyRevision(release, input.templates)) continue;
    const actions = releaseActions(release, input.versions);
    if (actions.length === 0 && release.status !== "released") continue;
    if (!matchesProviderState(release, input.versions)) continue;
    options.push(releaseOption(release, actions));
  }
  return options;
}

export function buildPagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}

function shouldOfferTemplate(exact: DouyinMiniappReleaseRecord | undefined,
  template: DouyinDeployableTemplate,
  versions: DouyinVersionListResult | null): boolean {
  if (exact?.status === "created" || exact?.status === "failed") return true;
  if (!exact) return true;
  return exact.status === "released" && matchesTemplateStage(template, versions?.current);
}

function isAmbiguousLegacyRevision(release: DouyinMiniappReleaseRecord,
  templates: readonly DouyinDeployableTemplate[]): boolean {
  const exact = templates.some((template) => template.template_id === release.template_id
    && template.template_version === release.template_version);
  return !exact && templates.some((template) =>
    release.template_version === template.template_version
    && release.template_id !== template.template_id);
}

function matchesProviderState(release: DouyinMiniappReleaseRecord,
  versions: DouyinVersionListResult | null): boolean {
  if (!versions) return true;
  if (["uploaded", "testing", "audit_rejected"].includes(release.status)) {
    return matchesDouyinDeliveryStage(release, versions.latest);
  }
  if (["audit_pending", "audit_approved"].includes(release.status)) {
    return matchesDouyinDeliveryStage(release, versions.audit);
  }
  return release.status !== "released"
    || matchesDouyinDeliveryStage(release, versions.current);
}

function releaseActions(release: DouyinMiniappReleaseRecord,
  versions: DouyinVersionListResult | null): TenantDouyinReleaseAction[] {
  if (!versions) return [];
  switch (release.status) {
    case "uploaded": return ["generate_test_qr"];
    case "testing": return isDouyinTestQrUrlUsable(
      release.latest_test_qr_url ?? release.test_qr_url) ? ["submit_audit"] : ["generate_test_qr"];
    case "audit_rejected": return isDouyinTestQrUrlUsable(
      release.latest_test_qr_url ?? release.test_qr_url) ? ["submit_audit"] : ["generate_test_qr"];
    case "audit_pending": return isDouyinTestQrUrlUsable(release.audit_qr_url)
      ? ["sync_status"] : ["sync_status", "generate_audit_qr"];
    case "audit_approved": return ["publish"];
    case "failed": return ["sync_status"];
    default: return [];
  }
}

function templateOption(template: DouyinDeployableTemplate,
  versions: DouyinVersionListResult | null): TenantDouyinReleaseOption {
  const selectionKind = templateSelectionKind(template, versions);
  return {
    id: template.id, source: "confirmed_template", release_id: null,
    template_id: template.template_id, template_version: template.template_version,
    description: template.description, stage: "ready_to_upload",
    actions: selectionKind === "current_online" ? [] : ["create_test_version"],
    test_qr_url: null, updated_at: template.confirmed_at,
    is_recommended: template.is_current,
    selection_kind: selectionKind,
  };
}

function releaseOption(release: DouyinMiniappReleaseRecord,
  actions: readonly TenantDouyinReleaseAction[]): TenantDouyinReleaseOption {
  return {
    id: release.id, source: "release", release_id: release.id,
    template_id: release.template_id, template_version: release.template_version,
    description: release.description, stage: release.status, actions,
    test_qr_url: release.latest_test_qr_url ?? release.test_qr_url,
    updated_at: release.updated_at,
    is_recommended: false,
    selection_kind: "release",
  };
}

function templateSelectionKind(template: DouyinDeployableTemplate,
  versions: DouyinVersionListResult | null): TenantDouyinTemplateSelectionKind {
  if (matchesTemplateStage(template, versions?.current)) return "current_online";
  if (template.is_current) return "recommended";
  const currentVersion = versions?.current?.version;
  if (!currentVersion) return "stable";
  const compared = compareDouyinTemplateVersion(template.template_version, currentVersion);
  return compared !== null && compared < 0 ? "rollback" : "stable";
}

function matchesTemplateStage(template: DouyinDeployableTemplate,
  stage: DouyinVersionListResult["current"]): boolean {
  return stage?.version === template.template_version
    && stage.summary?.startsWith(`[#${template.template_id}]`) === true;
}
