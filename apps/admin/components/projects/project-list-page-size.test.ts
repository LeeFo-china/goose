import { describe, expect, test } from "bun:test";
import { calculateProjectListPageSize } from "./project-list-page-size";

describe("calculateProjectListPageSize", () => {
  test("fits rows into the measured table viewport without vertical overflow", () => {
    expect(calculateProjectListPageSize({
      viewportHeight: 616,
      headerHeight: 40,
      rowHeight: 72,
    })).toBe(8);
  });

  test("uses measured row height so the final item does not create a scrollbar", () => {
    expect(calculateProjectListPageSize({
      viewportHeight: 851,
      headerHeight: 40,
      rowHeight: 75,
    })).toBe(10);
  });

  test("clamps page size to safe backend pagination bounds", () => {
    expect(calculateProjectListPageSize({
      viewportHeight: 20,
      headerHeight: 40,
      rowHeight: 72,
    })).toBe(1);

    expect(calculateProjectListPageSize({
      viewportHeight: 10_000,
      headerHeight: 40,
      rowHeight: 72,
    })).toBe(100);
  });
});
