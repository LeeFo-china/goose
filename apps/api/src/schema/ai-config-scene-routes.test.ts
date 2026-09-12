import { describe, expect, test } from "bun:test";

import {
  AiSceneRoutePayloadSchema,
  SystemAiSceneListQuerySchema,
  UpdateAiSceneRoutePayloadSchema,
} from "@/schema/ai-config";

describe("AI scene route schemas", () => {
  test("leaves route name and modality for server-side registry derivation", () => {
    expect(AiSceneRoutePayloadSchema.parse({
      scene_code: "decoration_qa",
    })).toEqual({
      scene_source: "registered",
      scene_code: "decoration_qa",
      quality_tier: "balanced",
      status: "active",
    });
  });

  test("bounds system scene pagination at one hundred rows", () => {
    expect(SystemAiSceneListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(SystemAiSceneListQuerySchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(false);
  });

  test("does not inject create defaults into an omitted PATCH tier or status", () => {
    expect(UpdateAiSceneRoutePayloadSchema.parse({
      expected_version: 2,
      name: "重命名场景",
    })).toEqual({
      expected_version: 2,
      name: "重命名场景",
    });
  });
});
