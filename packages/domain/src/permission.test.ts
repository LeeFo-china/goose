import { describe, expect, test } from "bun:test";
import { PermissionCodeConfig, PERMISSION_CODE_VALUES } from "./permission";

describe("finance receivable permissions", () => {
  test("exposes receivable permissions in domain permission constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("finance.receivable.view");
    expect(PERMISSION_CODE_VALUES).toContain("finance.receivable.manage");
    expect(PermissionCodeConfig["finance.receivable.view"]).toEqual({
      label: "查看应收计划",
      module: "finance",
    });
    expect(PermissionCodeConfig["finance.receivable.manage"]).toEqual({
      label: "管理应收计划",
      module: "finance",
    });
  });
});
