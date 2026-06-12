import { describe, expect, test } from "bun:test";
import { ExpenseRequestListQuerySchema } from "./expense-requests";

describe("ExpenseRequestListQuerySchema", () => {
  test("does not expose legacy current_step filtering", () => {
    const result = ExpenseRequestListQuerySchema.safeParse({
      page: "1",
      pageSize: "20",
      current_step: "payment",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("current_step" in result.data).toBe(false);
    }
  });
});
