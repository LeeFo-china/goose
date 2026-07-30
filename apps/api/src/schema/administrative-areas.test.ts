import { describe, expect, test } from "bun:test";

import { AdministrativeAreaListQuerySchema } from "./administrative-areas";

describe("AdministrativeAreaListQuerySchema", () => {
  test("normalizes a bounded comma-separated adcode batch", () => {
    const result = AdministrativeAreaListQuerySchema.safeParse({
      adcodes: "411503, 411502,411503",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.adcodes).toEqual(["411502", "411503"]);
  });

  test("rejects administrative area batches above 100 codes", () => {
    const result = AdministrativeAreaListQuerySchema.safeParse({
      adcodes: Array.from({ length: 101 }, (_, index) =>
        String(410000 + index)
      ).join(","),
    });

    expect(result.success).toBe(false);
  });
});
