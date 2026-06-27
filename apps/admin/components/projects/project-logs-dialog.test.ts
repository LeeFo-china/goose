import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ProjectLogsPanel lightweight layout", () => {
  test("renders construction logs as a flat list instead of stacked cards", () => {
    const source = readFileSync(
      new URL("./project-logs-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("overflow-hidden border-y bg-background/60");
    expect(source).toContain("border-b px-4 py-4 last:border-b-0");
    expect(source).toContain("size-14");
    expect(source).toContain("已展示最近 {logs.length} 条，共 {total} 条");
    expect(source).not.toContain("rounded-md border bg-card p-4");
    expect(source).not.toContain("before:absolute");
    expect(source).not.toContain("size-20");
    expect(source).not.toContain("暂仅展示最近 10 条");
  });
});
