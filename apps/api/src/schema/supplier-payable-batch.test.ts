import { describe, expect, test } from "bun:test";

import { SupplierPayableBatchQuerySchema } from "./supplier-payments";

const ID = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("SupplierPayableBatchQuerySchema", () => {
  test("trims and accepts one to one hundred unique UUIDs", () => {
    const ids = Array.from({ length: 100 }, (_, index) => ID(index));
    expect(SupplierPayableBatchQuerySchema.parse({
      ids: ` ${ids.join(" , ")} `,
    })).toEqual({ ids });
  });

  test("rejects empty, malformed, duplicate and oversized ID sets", () => {
    for (const ids of [
      "",
      `${ID(1)},bad`,
      `${ID(1)},${ID(1).toUpperCase()}`,
      Array.from({ length: 101 }, (_, index) => ID(index)).join(","),
    ]) {
      expect(SupplierPayableBatchQuerySchema.safeParse({ ids }).success)
        .toBe(false);
    }
  });
});
