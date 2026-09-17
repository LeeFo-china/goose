import type { SafeDouyinVersionStage } from
  "@/gateways/douyin-open-platform/client";
import type { DouyinMiniappReleaseRecord } from
  "@/repositories/douyin-miniapp-releases";

const MAX_PROVIDER_SUMMARY_LENGTH = 200;

export function buildDouyinDeliverySummary(
  templateId: string,
  description: string,
): string {
  const prefix = `[#${templateId}] `;
  const remaining = MAX_PROVIDER_SUMMARY_LENGTH - Array.from(prefix).length;
  return prefix + Array.from(description.trim()).slice(0, remaining).join("");
}

export function matchesDouyinDeliveryStage(
  release: Pick<
    DouyinMiniappReleaseRecord,
    "template_version" | "provider_summary"
  >,
  stage: SafeDouyinVersionStage | undefined,
): boolean {
  if (!stage || stage.version !== release.template_version) return false;
  return release.provider_summary === null
    ? true
    : stage.summary === release.provider_summary;
}
