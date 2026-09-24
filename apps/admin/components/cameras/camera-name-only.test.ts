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

    expect(fields).toContain("摄像头名称");
    expect(fields).not.toContain(">安装位置</FieldLabel>");
    expect(fields).not.toContain('name="position"');
    expect(fields).toContain('mode: "create" | "edit"');
    expect(fields).toContain('mode === "edit"');
    expect(fields).toContain("CollapsibleContent");
    expect(table).not.toContain("未设置位置");
    expect(table).not.toContain("row.original.position");
  });
});
