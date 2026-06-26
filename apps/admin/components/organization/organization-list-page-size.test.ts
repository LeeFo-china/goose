import { describe, expect, test } from "bun:test";
import {
  calculateOrganizationListPageSize,
  calculateOrganizationListRowHeight,
  ORGANIZATION_TABLE_HEADER_HEIGHT,
  ORGANIZATION_TABLE_MAX_PAGE_SIZE,
  ORGANIZATION_TABLE_MIN_PAGE_SIZE,
  ORGANIZATION_TABLE_ROW_HEIGHT,
} from "./organization-list-page-size";

describe("organization list page size", () => {
  test("fits whole department rows into the available viewport height", () => {
    expect(calculateOrganizationListPageSize({
      viewportHeight: 640,
      headerHeight: ORGANIZATION_TABLE_HEADER_HEIGHT,
      rowHeight: ORGANIZATION_TABLE_ROW_HEIGHT,
    })).toBe(5);
  });

  test("accounts for horizontal scrollbar height before counting rows", () => {
    expect(calculateOrganizationListPageSize({
      viewportHeight: 640,
      headerHeight: ORGANIZATION_TABLE_HEADER_HEIGHT,
      rowHeight: ORGANIZATION_TABLE_ROW_HEIGHT,
      scrollbarHeight: 17,
    })).toBe(5);
  });

  test("clamps page size to the API-supported range", () => {
    expect(calculateOrganizationListPageSize({ viewportHeight: 10 })).toBe(
      ORGANIZATION_TABLE_MIN_PAGE_SIZE,
    );
    expect(calculateOrganizationListPageSize({
      viewportHeight: 99999,
    })).toBe(ORGANIZATION_TABLE_MAX_PAGE_SIZE);
  });

  test("stretches rows to consume leftover viewport height without shrinking below baseline", () => {
    expect(calculateOrganizationListRowHeight({
      viewportHeight: 640,
      headerHeight: ORGANIZATION_TABLE_HEADER_HEIGHT,
      pageSize: 5,
    })).toBe(119);
    expect(calculateOrganizationListRowHeight({
      viewportHeight: 360,
      headerHeight: ORGANIZATION_TABLE_HEADER_HEIGHT,
      pageSize: 6,
    })).toBe(ORGANIZATION_TABLE_ROW_HEIGHT);
  });

  test("uses the real department row baseline so the list does not request one row too many", () => {
    expect(calculateOrganizationListPageSize({
      viewportHeight: 554,
      headerHeight: 33,
      rowHeight: ORGANIZATION_TABLE_ROW_HEIGHT,
    })).toBe(4);
    expect(calculateOrganizationListRowHeight({
      viewportHeight: 554,
      headerHeight: 33,
      pageSize: 4,
    })).toBe(129);
  });
});
