import { describe, expect, test } from "bun:test";
import {
  calculateProjectListPageSize,
  calculateProjectListRowHeight,
} from "./project-list-page-size";

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

  test("defaults to the real project table minimum row height", () => {
    expect(calculateProjectListPageSize({
      viewportHeight: 851,
      headerHeight: 40,
    })).toBe(10);
    expect(calculateProjectListRowHeight({
      viewportHeight: 851,
      headerHeight: 40,
      pageSize: 11,
    })).toBe(75);
  });

  test("accounts for horizontal scrollbar height when fitting rows", () => {
    expect(calculateProjectListPageSize({
      viewportHeight: 804,
      headerHeight: 40,
      rowHeight: 75,
      scrollbarHeight: 15,
    })).toBe(9);
  });

  test("stretches rows to use the remaining list space after page size is known", () => {
    expect(calculateProjectListRowHeight({
      viewportHeight: 851,
      headerHeight: 40,
      pageSize: 10,
    })).toBeCloseTo(81.1);
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
