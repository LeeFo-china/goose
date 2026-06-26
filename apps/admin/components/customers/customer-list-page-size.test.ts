import { describe, expect, test } from "bun:test";
import {
  calculateCustomerListPageSize,
  calculateCustomerListRowHeight,
} from "./customer-list-page-size";

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

  test("accounts for horizontal scrollbar height when fitting rows", () => {
    expect(calculateCustomerListPageSize({
      viewportHeight: 805,
      headerHeight: 40,
      rowHeight: 75,
      scrollbarHeight: 16,
    })).toBe(9);
  });

  test("stretches rows to use the remaining list space after page size is known", () => {
    expect(calculateCustomerListRowHeight({
      viewportHeight: 805,
      headerHeight: 40,
      scrollbarHeight: 15,
      pageSize: 10,
    })).toBe(75);

    expect(calculateCustomerListRowHeight({
      viewportHeight: 850,
      headerHeight: 40,
      scrollbarHeight: 0,
      pageSize: 10,
    })).toBe(81);
  });
});
