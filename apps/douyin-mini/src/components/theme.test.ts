import { describe, expect, test } from "bun:test";
import { resolveThemeColor } from "./theme";

describe("tenant theme", () => {
  test("invalid tenant colors fall back to neutral ink", () => {
    expect(resolveThemeColor("not-a-color")).toEqual({
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
      contrastRatio: expect.any(Number),
    });
  });

  test("valid tenant colors keep the color and choose the stronger foreground", () => {
    const result = resolveThemeColor("#F1C40F");
    expect(result.primaryColor).toBe("#F1C40F");
    expect(result.primaryTextColor).toBe("#000000");
    expect(result.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});
