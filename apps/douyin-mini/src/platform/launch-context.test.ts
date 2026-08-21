import { describe, expect, test } from "bun:test";

import { captureLaunchContext } from "./launch-context";

describe("launch context entry-path compatibility", () => {
  test("preserves the budget cold-start page accepted by the API", () => {
    expect(captureLaunchContext({
      path: "/pages/budget/index",
      scene: "021001",
      query: {},
    }).entry_path).toBe("pages/budget/index");
  });

  test("falls back unknown paths to the canonical home page", () => {
    expect(captureLaunchContext({
      path: "/pages/admin/index",
      scene: "021001",
      query: {},
    }).entry_path).toBe("pages/home/index");
  });
});
