import { describe, expect, test } from "bun:test";
import { calculateCustomerListPageSize } from "./customer-list-page-size";

describe("calculateCustomerListPageSize", () => {
  test("fits rows into the measured customer table viewport without vertical overflow", () => {
    expect(calculateCustomerListPageSize({
      viewportHeight: 851,
      headerHeight: 40,
      rowHeight: 75,
    })).toBe(10);
  });

  test("clamps page size to backend pagination bounds", () => {
    expect(calculateCustomerListPageSize({
      viewportHeight: 20,
      headerHeight: 40,
      rowHeight: 75,
    })).toBe(1);

    expect(calculateCustomerListPageSize({
      viewportHeight: 10_000,
      headerHeight: 40,
      rowHeight: 75,
    })).toBe(100);
  });
});
