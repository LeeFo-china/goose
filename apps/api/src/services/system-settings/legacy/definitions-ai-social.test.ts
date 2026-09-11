import { describe, expect, test } from "bun:test";
import { SETTING_DEFINITIONS } from "./definitions";

describe("AI social system setting definitions", () => {
  test("defines Ark API key as a dedicated secret setting", () => {
    const matches = SETTING_DEFINITIONS.filter((item) => item.key === "ARK_API_KEY");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      groupCode: "ai", valueType: "string", isSecret: true,
      envNames: ["ARK_API_KEY"],
    });
  });

  test("defines OpenRouter API key as a secret AI setting", () => {
    const byKey = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]));

    expect(byKey.get("OPENROUTER_API_KEY")).toMatchObject({
      groupCode: "ai",
      isSecret: true,
      envNames: ["OPENROUTER_API_KEY"],
    });
  });
});
