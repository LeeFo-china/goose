import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("camera naming contract", () => {
  test("uses the camera name as the single location label", () => {
    const fields = readFileSync(
      new URL("./camera-settings-fields.tsx", import.meta.url),
      "utf8",
    );
    const table = readFileSync(
      new URL("./cameras-table.tsx", import.meta.url),
      "utf8",
    );
    const mutations = readFileSync(
      new URL("./camera-mutations.tsx", import.meta.url),
      "utf8",
    );
    const dialog = readFileSync(
      new URL("./camera-form-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(fields).toContain("摄像头名称");
    expect(fields).not.toContain(">安装位置</FieldLabel>");
    expect(fields).not.toContain('name="position"');
    expect(fields).toContain("showAdvanced: boolean");
    expect(fields).toContain("{showAdvanced ? (");
    expect(fields).toContain("CollapsibleContent");
    expect(table).not.toContain("未设置位置");
    expect(table).not.toContain("row.original.position");
    expect(mutations).toContain("advanced");
    expect(dialog).toContain('pageSize: "20"');
    expect(dialog).toContain("deviceKeyword.trim()");
    expect(dialog).toContain("loadMoreDevices");
  });
});
