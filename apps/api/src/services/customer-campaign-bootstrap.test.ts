import { describe, expect, mock, test } from "bun:test";
import { CustomerCampaignBootstrapService } from "./customer-campaign-bootstrap";

describe("CustomerCampaignBootstrapService cancellation", () => {
  test("forwards the signal to both share campaign entry queries", async () => {
    const hasMatchingMarketingCampaign = mock(async () => false);
    const hasActiveLegacyShareConfig = mock(async () => false);
    const service = new CustomerCampaignBootstrapService({
      hasMatchingMarketingCampaign,
      hasActiveLegacyShareConfig,
    });
    const signal = new AbortController().signal;

    await service.hasShareAssistEntry({
      tenantId: "tenant-1",
      projectId: "project-1",
      signal,
    });

    expect(hasMatchingMarketingCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ signal }),
    );
    expect(hasActiveLegacyShareConfig).toHaveBeenCalledWith("project-1", signal);
  });

  test("rejects an already aborted appointment entry before querying", async () => {
    const hasMatchingMarketingCampaign = mock(async () => false);
    const service = new CustomerCampaignBootstrapService({
      hasMatchingMarketingCampaign,
      hasActiveLegacyShareConfig: mock(async () => false),
    });
    const controller = new AbortController();
    controller.abort("deadline");

    await expect(service.hasAppointmentRewardEntry({
      tenantId: "tenant-1",
      projectId: "project-1",
      signal: controller.signal,
    })).rejects.toBe("deadline");
    expect(hasMatchingMarketingCampaign).not.toHaveBeenCalled();
  });
});
