import { describe, expect, test } from "bun:test";
import { SETTING_DEFINITIONS } from "./definitions";

describe("AI social system setting definitions", () => {
  test("defines OpenRouter API key as a secret AI setting", () => {
    const byKey = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]));

    expect(byKey.get("OPENROUTER_API_KEY")).toMatchObject({
      groupCode: "ai",
      isSecret: true,
      envNames: ["OPENROUTER_API_KEY"],
    });
  });
});
