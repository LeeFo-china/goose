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
    const routeTable = readSource("./ai-route-table.tsx");
    const routeEditor = readSource("./use-ai-route-editor.ts");
    const routeOptions = readSource("./use-ai-route-model-options.ts");
    const modelSelector = readSource("./ai-route-model-selector.tsx");
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
    expect(routeOptions).toContain("route-model-options");
    expect(routeOptions).toContain('pageSize: "20"');
    expect(routeOptions).toContain('status: "active"');
    expect(routeOptions).toContain('page: String(page)');
    expect(panel).toContain("await reloadProviderState()");
    expect(routeEditor).toContain("await onSaved()");
    expect(panel).toContain("/platform/ai-config/providers?page=");
    expect(panel).toContain("/platform/ai-config/routes?page=");
    expect(panel).toContain("/platform/ai-config/providers?page=1&pageSize=100");
    expect(sections).toContain("pending ? (");
    expect(routeTable).toContain("loading || page.list.length === 0");
    expect(panel).not.toContain('className="m-0 min-h-0 flex-1 overflow-auto pr-1"');
    expect(panel).toContain('className="grid h-full min-h-0 auto-rows-max gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden"');

    expect(table).toContain("containerClassName");
    expect(routeTab).toContain('className="grid h-full min-h-0 auto-rows-max gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[380px_minmax(0,1fr)] xl:overflow-hidden"');
    expect(modelSelector).toContain("选择供应商");
    expect(modelSelector).toContain("搜索模型");
    expect(routeTab).toContain("primaryOptions");
    expect((routeTab + routeTable).match(/<Card className="flex min-h-0 flex-col overflow-hidden">/g)?.length ?? 0).toBe(2);
    expect(routeTab).toContain('<CardContent className="min-h-0 flex-1 overflow-auto">');
    expect(routeTab).toContain('<CardHeader className="shrink-0">');
    expect(routeTable).toContain('<CardContent className="min-h-0 flex-1 p-0">');
    expect(routeTable).toContain('<Table containerClassName="h-full" className="min-w-[980px]">');
    expect(routeTable).toContain('<TableHeader className="sticky top-0 bg-card">');
    expect(sections.match(/<Card className="flex min-h-0 flex-col overflow-hidden">/g)?.length ?? 0).toBe(4);
    expect(sections.match(/<CardHeader className="shrink-0">/g)?.length ?? 0).toBe(4);
    expect(sections.match(/<CardContent className="min-h-0 flex-1 overflow-auto">/g)?.length ?? 0).toBe(2);
    expect(sections.match(/<CardContent className="min-h-0 flex-1 p-0">/g)?.length ?? 0).toBe(2);
    expect(sections.match(/containerClassName="h-full"/g)?.length ?? 0).toBe(2);
    expect(sections.match(/<TableHeader className="sticky top-0 bg-card">/g)?.length ?? 0).toBe(2);
  });
});
