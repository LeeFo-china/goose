import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function countOccurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("Tenant marketing page layout", () => {
  test("keeps the right-side status labels from wrapping in every tab", () => {
    const source = readSource("./page.tsx");
    const statusGroupClassName =
      "flex w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden text-sm text-muted-foreground xl:w-auto xl:justify-end";
    const headerStart = source.indexOf(`className="${statusGroupClassName}"`);
    const headerEnd = source.indexOf("</CardHeader>", headerStart);
    const headerSource = source.slice(headerStart, headerEnd);

    expect(source).toContain(`className="${statusGroupClassName}"`);
    expect(headerSource).not.toContain(
      'className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"',
    );
    expect(source).toContain(
      'const marketingHeaderStatusBadgeClassName = "shrink-0 whitespace-nowrap tabular-nums";',
    );
    expect(headerSource).toContain("statusLabel.active");
    expect(headerSource).toContain("statusLabel.paused");
    expect(headerSource).toContain("生效中");
    expect(headerSource).toContain("草稿");
    expect(headerSource).toContain("下线");
    expect(headerSource).toContain("新线索");
    expect(headerSource).toContain("已转化");
    expect(headerSource).toContain("已作废");
    expect(
      countOccurrences(headerSource, "className={marketingHeaderStatusBadgeClassName}"),
    ).toBe(8);
  });
});
