import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function countOccurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("Tenant marketing page layout", () => {
  test("removes helper copy and page badge from the embedded H5 leads filters", () => {
    const source = readSource("../../../components/marketing/h5-leads-panel.tsx");

    expect(source).not.toContain("按活动页、处理状态、关键词和提交日期筛选线索。");
    expect(source).not.toContain("第 {pagination.page || 1} / {Math.max(pagination.totalPages || 0, 1)} 页");
  });

  test("lets the embedded H5 leads table fill the marketing tab data area", () => {
    const source = readSource("../../../components/marketing/h5-leads-panel.tsx");

    expect(source).toContain(
      'return <div className="flex min-h-0 flex-1 flex-col">{content}</div>;',
    );
    expect(source).toContain(
      'embedded ? "relative flex min-h-0 flex-1 flex-col" : "relative flex flex-col gap-4"',
    );
    expect(source).toContain(
      'embedded ? "min-h-0 flex-1 overflow-auto" : ""',
    );
  });

  test("keeps the right-side status labels from wrapping in every tab", () => {
    const source = readSource("./page.tsx");
    const headerRowClassName =
      "flex flex-col gap-3 py-3 xl:flex-row xl:items-center xl:justify-between";
    const statusGroupClassName =
      "flex w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden text-sm text-muted-foreground xl:w-auto xl:justify-end";
    const headerStart = source.indexOf(`className="${statusGroupClassName}"`);
    const headerEnd = source.indexOf("</CardHeader>", headerStart);
    const headerSource = source.slice(headerStart, headerEnd);

    expect(source).toContain(`className="${headerRowClassName}"`);
    expect(source).not.toContain(
      'className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between"',
    );
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
