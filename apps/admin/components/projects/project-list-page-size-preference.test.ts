import { describe, expect, test } from "bun:test";
import {
  PROJECT_LIST_PAGE_SIZE_COOKIE,
  PROJECT_LIST_PAGE_SIZE_STORAGE_KEY,
  normalizeProjectListPreferredPageSize,
  persistProjectListPageSize,
} from "./project-list-page-size-preference";

describe("project list page size preference", () => {
  test("normalizes remembered page size with project list bounds", () => {
    expect(normalizeProjectListPreferredPageSize("7")).toBe(7);
    expect(normalizeProjectListPreferredPageSize("0")).toBe(1);
    expect(normalizeProjectListPreferredPageSize("1000")).toBe(100);
    expect(normalizeProjectListPreferredPageSize("not-a-number")).toBe(7);
  });

  test("persists measured page size for the next server render", () => {
    const storage = new Map<string, string>();
    const documentLike = { cookie: "" };

    persistProjectListPageSize(9, {
      storage: {
        setItem: (key, value) => storage.set(key, value),
      },
      document: documentLike,
    });

    expect(storage.get(PROJECT_LIST_PAGE_SIZE_STORAGE_KEY)).toBe("9");
    expect(documentLike.cookie).toContain(`${PROJECT_LIST_PAGE_SIZE_COOKIE}=9`);
    expect(documentLike.cookie).toContain("Max-Age=");
    expect(documentLike.cookie).toContain("SameSite=Lax");
  });
});
