import { describe, expect, test } from "bun:test";
import { getIdentityCopyMeta } from "./identity-copy-utils";

describe("getIdentityCopyMeta", () => {
  test("uses the trimmed display name when present", () => {
    expect(getIdentityCopyMeta({
      id: "customer-1",
      name: "  李女士  ",
      fallbackName: "未命名客户",
    })).toEqual({
      id: "customer-1",
      name: "李女士",
    });
  });

  test("uses the fallback name when display name is blank", () => {
    expect(getIdentityCopyMeta({
      id: "project-1",
      name: "",
      fallbackName: "未命名项目",
    })).toEqual({
      id: "project-1",
      name: "未命名项目",
    });
  });
});
