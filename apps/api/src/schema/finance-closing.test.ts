import { describe, expect, test } from "bun:test";
import {
  CloseFinanceClosingPeriodSchema,
  CreateFinanceClosingDraftSchema,
  FinanceClosingPeriodListQuerySchema,
  ReopenFinanceClosingPeriodSchema,
} from "@/schema/finance-closing";

describe("finance closing schemas", () => {
  test("parses paginated closing period list filters", () => {
    expect(
      FinanceClosingPeriodListQuerySchema.parse({
        month: "2026-06",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      month: "2026-06",
      page: 2,
      pageSize: 50,
    });
  });

  test("validates draft and close inputs", () => {
    expect(
      CreateFinanceClosingDraftSchema.parse({
        month: "2026-06",
        notes: "草稿",
      }),
    ).toEqual({ month: "2026-06", notes: "草稿" });
    expect(CloseFinanceClosingPeriodSchema.parse({})).toEqual({});
  });

  test("requires reopen reason", () => {
    expect(() =>
      ReopenFinanceClosingPeriodSchema.parse({ reason: "" })
    ).toThrow();
    expect(
      ReopenFinanceClosingPeriodSchema.parse({ reason: "补录费用" }),
    ).toEqual({ reason: "补录费用" });
  });
});
