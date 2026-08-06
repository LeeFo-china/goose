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
});
