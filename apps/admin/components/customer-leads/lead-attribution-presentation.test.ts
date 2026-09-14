import { describe, expect, test } from "bun:test";

import { attributionBasis, officialAttributionEntries } from "./lead-attribution-presentation";

describe("lead attribution presentation", () => {
  test("separates captured video source from manually marked campaign", () => {
    const attribution = { source_type: "short_video", campaign_code: "campaign-a",
      analysis_info: { type: 1, unique_id: "brand_01",
        video_item_id: "encrypted-video-1" } } as const;
    expect(attributionBasis(attribution)).toBe("抖音接口返回（客户端采集）");
    expect(officialAttributionEntries(attribution.analysis_info)).toEqual([
      ["来源抖音号", "brand_01"], ["视频标识（加密 ID）", "encrypted-video-1"],
    ]);
    expect(attributionBasis({ campaign_code: "campaign-a" })).toBe("链接参数（手工标记）");
    expect(attributionBasis({ source_type: "direct" })).toBe("未识别");
  });
});
