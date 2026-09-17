import { describe, expect, test } from "bun:test";
import {
  buildDouyinDeliverySummary,
  matchesDouyinDeliveryStage,
} from "./delivery-summary";

describe("Douyin release delivery summary", () => {
  test("builds a deterministic bounded marker", () => {
    expect(buildDouyinDeliverySummary("78690", "装修行业生产模板"))
      .toBe("[#78690] 装修行业生产模板");
    expect(
      Array.from(buildDouyinDeliverySummary("78690", "设".repeat(300))).length,
    ).toBeLessThanOrEqual(200);
  });

  test("matches marked releases by both version and summary", () => {
    const release = {
      template_version: "0.1.39",
      provider_summary: "[#78690] 装修行业生产模板",
    };
    expect(matchesDouyinDeliveryStage(release, {
      version: "0.1.39",
      summary: "[#78690] 装修行业生产模板",
    })).toBe(true);
    expect(matchesDouyinDeliveryStage(release, {
      version: "0.1.39",
      summary: "[#78689] 旧模板",
    })).toBe(false);
    expect(matchesDouyinDeliveryStage(release, {
      version: "0.1.40",
      summary: "[#78690] 装修行业生产模板",
    })).toBe(false);
  });

  test("keeps legacy unmarked releases compatible by version", () => {
    expect(matchesDouyinDeliveryStage({
      template_version: "0.1.38",
      provider_summary: null,
    }, {
      version: "0.1.38",
      summary: "历史版本说明",
    })).toBe(true);
  });
});
