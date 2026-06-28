import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("AI model routing page layout", () => {
  test("keeps the routing workspace inside the console viewport", () => {
    const page = readSource("../../app/(console)/platform/ai-models/page.tsx");
    const panel = readSource("./ai-model-routing-panel.tsx");
    const routeTab = readSource("./ai-model-route-tab.tsx");
    const sections = readSource("./ai-model-routing-sections.tsx");
    const table = readSource("../ui/table.tsx");

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).toContain('className="shrink-0"');
    expect(page).toContain('className="grid shrink-0 gap-3 md:grid-cols-3"');

    expect(panel).toContain('className="flex min-h-0 flex-1 flex-col gap-4"');
    expect(panel).toContain('className="w-fit shrink-0"');
    expect(panel.match(/className="m-0 min-h-0 flex-1 overflow-hidden"/g)?.length ?? 0).toBe(3);
    expect(panel).not.toContain('className="m-0 min-h-0 flex-1 overflow-auto pr-1"');
    expect(panel.match(/className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-\[360px_minmax\(0,1fr\)\] xl:overflow-hidden"/g)?.length ?? 0).toBe(2);

    expect(table).toContain("containerClassName");
    expect(routeTab).toContain('className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden"');
    expect(routeTab.match(/<Card className="flex min-h-0 flex-col overflow-hidden">/g)?.length ?? 0).toBe(2);
    expect(routeTab).toContain('<CardContent className="min-h-0 flex-1 overflow-auto">');
    expect(routeTab).toContain('<CardHeader className="shrink-0">');
    expect(routeTab).toContain('<CardContent className="min-h-0 flex-1 p-0">');
    expect(routeTab).toContain('<Table containerClassName="h-full" className="min-w-[980px]">');
    expect(routeTab).toContain('<TableHeader className="sticky top-0 bg-card">');
    expect(sections.match(/<Card className="flex min-h-0 flex-col overflow-hidden">/g)?.length ?? 0).toBe(4);
    expect(sections.match(/<CardHeader className="shrink-0">/g)?.length ?? 0).toBe(4);
    expect(sections.match(/<CardContent className="min-h-0 flex-1 overflow-auto">/g)?.length ?? 0).toBe(2);
    expect(sections.match(/<CardContent className="min-h-0 flex-1 p-0">/g)?.length ?? 0).toBe(2);
    expect(sections.match(/containerClassName="h-full"/g)?.length ?? 0).toBe(2);
    expect(sections.match(/<TableHeader className="sticky top-0 bg-card">/g)?.length ?? 0).toBe(2);
  });
});
