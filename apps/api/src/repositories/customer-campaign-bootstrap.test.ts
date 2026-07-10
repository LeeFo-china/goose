import { describe, expect, mock, test } from "bun:test";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { CustomerCampaignBootstrapRepository } from "./customer-campaign-bootstrap";

describe("CustomerCampaignBootstrapRepository cancellation", () => {
  test("cancels a marketing entry query without disabling direct SQL", async () => {
    const controller = new AbortController();
    let rejectQuery: ((reason: unknown) => void) | undefined;
    const query = Object.assign(
      new Promise<never>((_resolve, reject) => { rejectQuery = reject; }),
      { cancel: mock(() => rejectQuery?.(controller.signal.reason)) },
    );
    const directSql = mock(() => query);
    const repository = new CustomerCampaignBootstrapRepository({
      getDirectSql: () => directSql as unknown as NonNullable<ReturnType<typeof getDirectPostgresSql>>,
    });
    const input = {
      tenantId: "tenant-1",
      projectId: "project-1",
      campaignType: "share_assist" as const,
    };

    const loaded = repository.hasMatchingMarketingCampaign({
      ...input,
      signal: controller.signal,
    });
    controller.abort("deadline");

    await expect(loaded).rejects.toBe("deadline");
    expect(query.cancel).toHaveBeenCalledTimes(1);
    await repository.hasMatchingMarketingCampaign(input);
    expect(directSql).toHaveBeenCalledTimes(2);
  });
});
