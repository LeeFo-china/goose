import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("客户项目助力摘要契约", () => {
  test("focus_campaign 过渡期同时返回 campaign_id 和 id", () => {
    const base = readSource("./legacy/base.ts");
    const types = readSource("./legacy/shared-types.ts");

    expect(types).toContain("campaign_id: string;");
    expect(base).toContain("campaign_id: campaign.id");
    expect(base).toContain("id: campaign.id");
  });

  test("摘要同时返回待领奖和当前活动并明确实例与营销活动 ID", () => {
    const base = readSource("./legacy/base.ts");
    const customerCampaigns = readSource("./legacy/customer-campaigns.ts");
    const types = readSource("./legacy/shared-types.ts");

    expect(types).toContain("instance_id: string;");
    expect(types).toContain("marketing_campaign_id: string | null;");
    expect(base).toContain("instance_id: campaign.id");
    expect(base).toContain("marketing_campaign_id: campaign.campaign_id");
    expect(customerCampaigns).toContain("pending_reward_campaign:");
    expect(customerCampaigns).toContain("active_campaign:");
  });
});
