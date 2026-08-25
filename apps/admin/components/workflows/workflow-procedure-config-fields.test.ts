import { describe, expect, test } from "bun:test";
import {
  formatCandidateDepartmentInput,
  parseCandidateDepartmentInput,
} from "./workflow-procedure-config-fields";

describe("candidate department display", () => {
  test("formats common department codes as Chinese text", () => {
    expect(formatCandidateDepartmentInput(["PROJECT", "INSTALLATION"])).toBe(
      "项目部、安装部",
    );
  });

  test("parses Chinese department labels back to stored codes", () => {
    expect(parseCandidateDepartmentInput("项目部、安装部")).toEqual([
      "PROJECT",
      "INSTALLATION",
    ]);
  });
});
