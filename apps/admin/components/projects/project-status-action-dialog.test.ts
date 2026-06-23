import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ProjectStatusActionDialog payment collection boundary", () => {
  test("states that admin project actions only verify confirmed payments", () => {
    const source = readFileSync(
      new URL("./project-status-action-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("已确认入账记录");
    expect(source).toContain("不会在此录入金额或凭证");
  });

  test("renders workflow output fields for procedure scheduling actions", () => {
    const source = readFileSync(
      new URL("./project-status-action-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("workflow_output_fields");
    expect(source).toContain("procedure_candidate");
    expect(source).toContain("planned_duration_days");
  });
});
