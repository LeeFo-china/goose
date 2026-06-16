import { describe, expect, test } from "bun:test";
import { getEmployeeIdentityMeta } from "./employee-identity-utils";

describe("getEmployeeIdentityMeta", () => {
  test("uses the employee name when present", () => {
    expect(getEmployeeIdentityMeta({
      id: "employee-1",
      name: "王工",
    })).toEqual({
      id: "employee-1",
      name: "王工",
    });
  });

  test("falls back to the unnamed employee label", () => {
    expect(getEmployeeIdentityMeta({
      id: "employee-2",
      name: "  ",
    })).toEqual({
      id: "employee-2",
      name: "未命名员工",
    });
  });
});
