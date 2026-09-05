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
    expect(page).not.toContain("openRouterProviderId");
    expect(page).not.toContain("catalog-runs?page=1&pageSize=20");
    expect(page).not.toContain("/platform/ai-config/models?page=1&pageSize=100");

    expect(panel).toContain('className="flex min-h-0 flex-1 flex-col gap-4"');
    expect(panel).toContain('className="w-fit shrink-0"');
    expect(panel).toContain('<TabsTrigger value="routes">场景路由</TabsTrigger>');
    expect(panel).toContain('<TabsTrigger value="providers">供应商</TabsTrigger>');
    expect(panel).not.toContain('<TabsTrigger value="catalog">OpenRouter 目录</TabsTrigger>');
    expect(panel).not.toContain('<TabsTrigger value="models">模型</TabsTrigger>');
    expect(panel.match(/className="m-0 min-h-0 flex-1 overflow-hidden"/g)?.length ?? 0).toBe(2);
    expect(panel).toContain("page={providerPage}");
    expect(panel).not.toContain("page={modelPage}");
    expect(panel).toContain("routePage={routePage}");
    expect(panel).toContain("providerOptions");
    expect(panel).not.toContain("modelOptions");
    expect(panel).toContain("providers={providerOptions}");
    expect(panel).toContain("route-model-options");
    expect(panel).toContain("await reloadProviderState()");
    expect(panel).toContain("await reloadRouteState()");
    expect(panel).toContain("/platform/ai-config/providers?page=");
    expect(panel).toContain("/platform/ai-config/routes?page=");
    expect(panel).toContain("/platform/ai-config/providers?page=1&pageSize=100");
    expect(sections).toContain("pending ? (");
    expect(routeTab).toContain("isRouteLoading ? (");
    expect(panel).not.toContain('className="m-0 min-h-0 flex-1 overflow-auto pr-1"');
    expect(panel.match(/className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-\[360px_minmax\(0,1fr\)\] xl:overflow-hidden"/g)?.length ?? 0).toBe(1);

    expect(table).toContain("containerClassName");
    expect(routeTab).toContain('className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden"');
    expect(routeTab).toContain("选择供应商");
    expect(routeTab).toContain("搜索模型");
    expect(routeTab).toContain("primaryOptions");
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
