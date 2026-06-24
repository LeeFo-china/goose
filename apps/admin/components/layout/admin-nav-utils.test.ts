import { describe, expect, test } from "bun:test";
import { isActivePath } from "./admin-nav-utils";

describe("admin nav active matching", () => {
  test("keeps exact nav items inactive on nested routes", () => {
    expect(isActivePath("/finance", "/finance", { exact: true })).toBe(true);
    expect(isActivePath("/finance/ledger", "/finance", { exact: true })).toBe(
      false,
    );
  });

  test("keeps prefix matching for section nav items by default", () => {
    expect(isActivePath("/projects/project-1", "/projects")).toBe(true);
  });
});
