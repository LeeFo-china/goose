import { describe, expect, test } from "bun:test";

import { sourceSchema } from "./leads-workbench-contract";

const source = { attribution: { source_type: "short_video",
  analysis_info: { type: 1, unique_id: "brand_01", video_item_id: "encrypted-video-1" } },
  demand: null, budget: null, ai: null };

describe("Douyin lead source contract", () => {
  test("accepts official source fields and rejects unprojected secrets", () => {
    expect(sourceSchema.safeParse(source).success).toBe(true);
    expect(sourceSchema.safeParse({ ...source, attribution: {
      analysis_info: { type: 2, unique_id: "anchor_01", live_room_id: "room-1" },
    } }).success).toBe(true);
    expect(sourceSchema.safeParse({ ...source,
      attribution: { ...source.attribution,
        analysis_info: { ...source.attribution.analysis_info, token: "secret" } },
    }).success).toBe(false);
  });
});
