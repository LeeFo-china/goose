import { customerCampaignBootstrapRepository } from "@/repositories/customer-campaign-bootstrap";

const CAMPAIGN_ENTRY_CACHE_TTL_MS = 60_000;

type CachedCampaignEntry = {
  expiresAt: number;
  value: boolean;
};

class CustomerCampaignBootstrapService {
  private campaignEntryCache = new Map<string, CachedCampaignEntry>();

  async hasShareAssistEntry(input: {
    tenantId: string | null;
    projectId: string;
  }) {
    const cacheKey = this.buildCacheKey("share_assist", input);
    const cached = this.getCachedEntry(cacheKey);
    if (cached !== null) return cached;

    const [marketingCampaign, legacyConfig] = await Promise.all([
      customerCampaignBootstrapRepository.hasMatchingMarketingCampaign({
        campaignType: "share_assist",
        projectId: input.projectId,
        tenantId: input.tenantId,
      }),
      customerCampaignBootstrapRepository.hasActiveLegacyShareConfig(input.projectId),
    ]);

    if (marketingCampaign === null || legacyConfig === null) return null;
    const hasEntry = marketingCampaign || legacyConfig;
    this.setCachedEntry(cacheKey, hasEntry);
    return hasEntry;
  }

  async hasAppointmentRewardEntry(input: {
    tenantId: string | null;
    projectId: string;
  }) {
    const cacheKey = this.buildCacheKey("appointment_reward", input);
    const cached = this.getCachedEntry(cacheKey);
    if (cached !== null) return cached;

    const hasEntry = await customerCampaignBootstrapRepository.hasMatchingMarketingCampaign({
      campaignType: "appointment_reward",
      projectId: input.projectId,
      tenantId: input.tenantId,
    });
    if (hasEntry !== null) this.setCachedEntry(cacheKey, hasEntry);
    return hasEntry;
  }

  private buildCacheKey(
    campaignType: "share_assist" | "appointment_reward",
    input: { tenantId: string | null; projectId: string },
  ) {
    return `${campaignType}:${input.tenantId ?? "global"}:${input.projectId}`;
  }

  private getCachedEntry(cacheKey: string) {
    const cached = this.campaignEntryCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.campaignEntryCache.delete(cacheKey);
      return null;
    }
    return cached.value;
  }

  private setCachedEntry(cacheKey: string, value: boolean) {
    this.campaignEntryCache.set(cacheKey, {
      expiresAt: Date.now() + CAMPAIGN_ENTRY_CACHE_TTL_MS,
      value,
    });
  }
}

export const customerCampaignBootstrapService =
  new CustomerCampaignBootstrapService();
