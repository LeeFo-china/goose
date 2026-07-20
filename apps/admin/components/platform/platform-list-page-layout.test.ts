import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const platformPages: ReadonlyArray<{
  name: string;
  layoutPath: string;
  paramsPath?: string;
}> = [
  { name: "tenants", layoutPath: "../../app/(console)/platform/tenants/page.tsx" },
  {
    name: "devices",
    layoutPath: "../../app/(console)/platform/devices/page-sections.tsx",
    paramsPath: "../../app/(console)/platform/devices/page.tsx",
  },
  { name: "leads", layoutPath: "../../app/(console)/platform/leads/page.tsx" },
  { name: "marketing pages", layoutPath: "../../app/(console)/platform/marketing-pages/page.tsx" },
  { name: "picture library", layoutPath: "../../app/(console)/platform/picture-library/page.tsx" },
  { name: "usage", layoutPath: "../../app/(console)/platform/usage/page.tsx" },
  { name: "billing", layoutPath: "../../app/(console)/platform/billing/page.tsx" },
  { name: "audit logs", layoutPath: "../../app/(console)/platform/audit-logs/page.tsx" },
  {
    name: "tenant onboarding",
    layoutPath: "../../app/(console)/platform/tenant-onboarding/page.tsx",
  },
];

const platformTabbedSources: ReadonlyArray<{
  name: string;
  path: string;
}> = [
  { name: "devices", path: "../../app/(console)/platform/devices/page-sections.tsx" },
  { name: "billing", path: "../../app/(console)/platform/billing/page.tsx" },
  { name: "partners", path: "../../app/(console)/platform/partners/page.tsx" },
  { name: "tenant onboarding", path: "../../app/(console)/platform/tenant-onboarding/page.tsx" },
  { name: "picture library", path: "../../app/(console)/platform/picture-library/page.tsx" },
  { name: "usage", path: "../../app/(console)/platform/usage/page.tsx" },
  { name: "device tabs nav", path: "../../components/platform-devices/platform-device-tabs-nav.tsx" },
  { name: "identity diagnostics result", path: "../../components/platform-identity-diagnostics/identity-diagnostics-result.tsx" },
];

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function readTabsTriggerTags(source: string) {
  return source.match(/<TabsTrigger[\s\S]*?>/g) ?? [];
}

function readSummarySource(path: string) {
  const source = readSource(path);
  const summaryStart = source.indexOf("summary={");
  const summaryEnd = [
    source.indexOf("tabs=", summaryStart),
    source.indexOf("listHeader=", summaryStart),
    source.indexOf("filters=", summaryStart),
    source.indexOf("pagination=", summaryStart),
  ]
    .filter((index) => index > summaryStart)
    .sort((left, right) => left - right)[0] ?? -1;

  expect(summaryStart, path).toBeGreaterThanOrEqual(0);
  expect(summaryEnd, path).toBeGreaterThan(summaryStart);

  return source.slice(summaryStart, summaryEnd);
}

function readInputSourceAroundPlaceholder(path: string, placeholder: string) {
  const source = readSource(path);
  const placeholderIndex = source.indexOf(`placeholder="${placeholder}"`);
  const inputStart = source.lastIndexOf("<Input", placeholderIndex);
  const inputEnd = source.indexOf("/>", placeholderIndex);

  expect(placeholderIndex, `${path}:${placeholder}`).toBeGreaterThanOrEqual(0);
  expect(inputStart, `${path}:${placeholder}`).toBeGreaterThanOrEqual(0);
  expect(inputEnd, `${path}:${placeholder}`).toBeGreaterThan(placeholderIndex);

  return source.slice(inputStart, inputEnd);
}

describe("Platform list page layout", () => {
  test("defines the shared fixed-height platform list shell", () => {
    const shellUrl = new URL("./platform-list-shell.tsx", import.meta.url);
    const pageSizeUrl = new URL("./platform-list-page-size.ts", import.meta.url);

    expect(existsSync(shellUrl)).toBe(true);
    expect(existsSync(pageSizeUrl)).toBe(true);
    if (!existsSync(shellUrl)) return;

    const shell = readFileSync(shellUrl, "utf8");
    expect(shell).toContain("calculatePlatformListPageSize");
    expect(shell).toContain("calculatePlatformListRowHeight");
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("data-testid={tableViewportTestId}");
    expect(shell).toContain("min-h-0 flex-1 overflow-auto");
    expect(shell).toContain("absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-[1px]");
    expect(shell).toContain("router.push");
  });

  test("does not auto-resize platform list pagination while Radix overlays lock the page", () => {
    const shell = readSource("./platform-list-shell.tsx");

    expect(shell).toContain("isPageInteractionLockedByOverlay");
    expect(shell).toContain("overlayResizeGuardUntilRef");
    expect(shell).toContain("PLATFORM_LIST_OVERLAY_RESIZE_SETTLE_MS");
    expect(shell).toContain("now < overlayResizeGuardUntilRef.current");
    expect(shell).toContain("hasExplicitPageSize");
    expect(shell).toContain("new URLSearchParams(window.location.search).has(pageSizeKey)");
    expect(shell).toContain('document.body.dataset.scrollLocked === "1"');
    expect(shell).toContain('[role="listbox"][data-state="open"]');
  });

  test("moves all target platform lists into the project-style workspace", () => {
    for (const page of platformPages) {
      const source = readSource(page.layoutPath);
      const paramsSource = page.paramsPath ? readSource(page.paramsPath) : source;

      expect(source, page.name).toContain("PlatformListPageShell");
      expect(source, page.name).toContain("h-[calc(100vh-6.5625rem)]");
      expect(source, page.name).toContain("min-h-0 flex-col gap-5 overflow-hidden");
      expect(paramsSource, page.name).toContain("normalizePlatformListPageSize");
      expect(paramsSource, page.name).toContain("pageSize");
    }
  });

  test("keeps platform H5 pages paginated by measured viewport size", () => {
    const source = readSource("../../app/(console)/platform/marketing-pages/page.tsx");

    expect(source).toContain("pageSize?: string");
    expect(source).toContain("query.set(\"pageSize\", String(input.pageSize))");
    expect(source).not.toContain("pageSize=100");
    expect(source).not.toContain("pageSize: 100");
  });

  test("removes the platform H5 page list header copy", () => {
    const source = readSource("../../app/(console)/platform/marketing-pages/page.tsx");

    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("<CardTitle>H5 活动页列表</CardTitle>");
    expect(source).not.toContain("统一管理平台公域 H5 页面");
    expect(source).not.toContain("共 {pagination.total} 个");
  });

  test("uses shadcn tabs directly for platform tabbed lists", () => {
    const devicesPage = readSource("../../app/(console)/platform/devices/page-sections.tsx");
    const usagePage = readSource("../../app/(console)/platform/usage/page.tsx");
    const picturePage = readSource("../../app/(console)/platform/picture-library/page.tsx");
    const billingPage = readSource("../../app/(console)/platform/billing/page.tsx");

    expect(devicesPage).toContain("TabsList");
    expect(devicesPage).toContain("TabsTrigger");
    expect(devicesPage).not.toContain("PlatformDeviceTabsNav");

    expect(usagePage).toContain("TabsList");
    expect(usagePage).toContain("TabsTrigger");
    expect(usagePage).not.toContain("UsageTabsNav");

    expect(picturePage).toContain("TabsList");
    expect(picturePage).toContain("TabsTrigger");
    expect(billingPage).toContain("TabsList");
    expect(billingPage).toContain("TabsTrigger");
  });

  test("keeps picture library tabs standard and removes the asset list header copy", () => {
    const source = readSource("../../app/(console)/platform/picture-library/page.tsx");
    const tabsStart = source.indexOf("tabs={");
    const listHeaderStart = source.indexOf("listHeader=", tabsStart);
    const filtersStart = source.indexOf("filters=", listHeaderStart);
    const tabsSource = source.slice(tabsStart, listHeaderStart);
    const listHeaderSource = source.slice(listHeaderStart, filtersStart);

    expect(tabsStart).toBeGreaterThanOrEqual(0);
    expect(listHeaderStart).toBeGreaterThan(tabsStart);
    expect(filtersStart).toBeGreaterThan(listHeaderStart);
    expect(tabsSource).toContain("<TabsList");
    expect(tabsSource).toContain("className={platformTabsListClassName}");
    expect(tabsSource).toContain("className={platformTabsTriggerClassName}");
    expect(listHeaderSource).toContain('activeTab === "health"');
    expect(listHeaderSource).toContain(": null}");
    expect(source).not.toContain("<CardTitle>图片列表</CardTitle>");
    expect(source).not.toContain("<CardTitle>分类管理</CardTitle>");
    expect(source).not.toContain("已停用 {summary.inactiveCategories} 个");
    expect(source).not.toContain("共 {categories.length} 个");
    expect(source).not.toContain("<CardTitle>评论治理</CardTitle>");
    expect(source).not.toContain("本页可见 {summary.currentVisibleComments} 条");
    expect(source).not.toContain("已隐藏 {summary.currentHiddenComments} 条");
    expect(source).not.toContain("共 {comments.pagination.total} 条");
    expect(source).not.toContain("当前筛选：");
    expect(source).not.toContain("全部分类");
    expect(source).not.toContain("共 {assets.pagination.total} 张");
  });

  test("keeps platform usage tabs inside the shadcn workspace", () => {
    const source = readSource("../../app/(console)/platform/usage/page.tsx");
    const tabsStart = source.indexOf("tabs={");
    const listHeaderStart = source.indexOf("listHeader=", tabsStart);
    const filtersStart = source.indexOf("filters=", tabsStart);
    const tabsSource = source.slice(tabsStart, listHeaderStart === -1 ? filtersStart : listHeaderStart);
    const listHeaderSource = source.slice(listHeaderStart, filtersStart);

    expect(tabsStart).toBeGreaterThanOrEqual(0);
    expect(listHeaderStart).toBeGreaterThan(tabsStart);
    expect(filtersStart).toBeGreaterThan(tabsStart);
    expect(tabsSource).toContain("<TabsList");
    expect(tabsSource).toContain("USAGE_TABS.map");
    expect(source).toContain("用量概览");
    expect(source).toContain("AI 明细");
    expect(source).toContain("短信明细");
    expect(source).toContain("短视频明细");
    expect(tabsSource).toContain("className={platformTabsListClassName}");
    expect(tabsSource).toContain("className={platformTabsTriggerClassName}");
    expect(listHeaderSource).toContain('tab === "summary"');
    expect(listHeaderSource).toContain("<UsageSummaryCards");
    expect(source).toContain('<TabsContent value="summary" className="m-0 min-h-full"');
    expect(source).toContain('<TabsContent value="ai" className="m-0 min-h-full"');
    expect(source).toContain('<TabsContent value="sms" className="m-0 min-h-full"');
    expect(source).toContain('<TabsContent value="social_video" className="m-0 min-h-full"');
    expect(source).not.toContain("summary={<UsageSummaryCards");
    expect(source).not.toContain("<CardTitle>平台用量</CardTitle>");
    expect(source).not.toContain("当前页合计。平台全量成本结算后续可由日汇总任务生成。");
    expect(source).not.toContain("共 {activePagination.total} {unit}");
  });

  test("keeps platform usage filters on shadcn controls without grid placeholders", () => {
    const source = readSource("../../components/usage/usage-list-actions.tsx");

    expect(source).toContain("@/components/ui/select");
    expect(source).toContain("<Select");
    expect(source).toContain("<SelectGroup>");
    expect(source).toContain("<SelectItem");
    expect(source).toContain("<SelectTrigger");
    expect(source).toContain("<SelectValue");
    expect(source).toContain("grid grid-cols-2 gap-2");
    expect(source).toContain("xl:grid-cols-[160px_160px_minmax(220px,1fr)_180px_160px_72px]");
    expect(source).toContain('const filterSelectClassName = "h-9 min-w-0 bg-card shadow-none";');
    expect(source).toContain("className={filterSelectClassName}");
    expect(source).not.toContain("@/components/admin/form-select");
    expect(source).not.toContain("<FormSelect");
    expect(source).not.toContain("<div />");
  });

  test("keeps platform usage overview as a compact shadcn data strip", () => {
    const source = readSource("../../components/usage/usage-summary-cards.tsx");

    expect(source).toContain("@/components/ui/badge");
    expect(source).toContain("@/components/ui/separator");
    expect(source).toContain('data-testid="usage-overview-panel"');
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("grid-flow-col");
    expect(source).not.toContain("@/components/ui/card");
    expect(source).not.toContain("<Card");
  });

  test("keeps tenant usage page in the same fixed shadcn workspace", () => {
    const source = readSource("../../app/(console)/usage/page.tsx");

    expect(source).toContain("h-[calc(100vh-6.5625rem)]");
    expect(source).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(source).toContain("TabsList");
    expect(source).toContain("TabsTrigger");
    expect(source).toContain("TabsContent");
    expect(source).toContain('className="w-full justify-start overflow-x-auto overflow-y-hidden"');
    expect(source).toContain("tenant-usage-list-table-viewport");
    expect(source).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(source).toContain('tab === "summary" ? <UsageSummaryCards');
    expect(source).not.toContain("UsageTabsNav");
    expect(source).not.toContain("<CardTitle>本租户用量</CardTitle>");
  });

  test("keeps platform tabs left aligned without the segmented background", () => {
    const shared = readSource("./platform-tabs.ts");

    expect(shared).toContain(
      'export const platformTabsListClassName = "h-auto w-full justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0";',
    );
    expect(shared).toContain(
      'export const platformTabsTriggerClassName = "shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground";',
    );
    expect(shared).toContain(
      'export const platformTabsTriggerWithBadgeClassName = `${platformTabsTriggerClassName} gap-2 whitespace-nowrap`;',
    );

    for (const item of platformTabbedSources) {
      const source = readSource(item.path);
      const triggerTags = readTabsTriggerTags(source);

      expect(source, item.name).toContain("@/components/platform/platform-tabs");
      expect(source, item.name).toContain("className={platformTabsListClassName}");
      expect(triggerTags.length, item.name).toBeGreaterThan(0);
      for (const triggerTag of triggerTags) {
        expect(triggerTag, item.name).toMatch(/className=\{platformTabsTrigger(?:WithBadge)?ClassName\}/);
      }
      expect(source, item.name).not.toContain('className="w-full justify-start overflow-x-auto overflow-y-hidden"');
      expect(source, item.name).not.toContain('className="h-auto w-full justify-start overflow-x-auto"');
      expect(source, item.name).not.toContain('className="flex flex-wrap justify-start"');
    }
  });

  test("keeps billing center tabs inside the platform list workspace", () => {
    const source = readSource("../../app/(console)/platform/billing/page.tsx");
    const tabsStart = source.indexOf("tabs={");
    const listHeaderStart = source.indexOf("listHeader=", tabsStart);
    const paginationStart = source.indexOf("pagination=", tabsStart);
    const tabsSource = source.slice(tabsStart, listHeaderStart === -1 ? paginationStart : listHeaderStart);

    expect(tabsStart).toBeGreaterThanOrEqual(0);
    expect(paginationStart).toBeGreaterThan(tabsStart);
    expect(tabsSource).toContain("className={platformTabsListClassName}");
    expect(tabsSource).toContain("className={platformTabsTriggerClassName}");
    expect(tabsSource).not.toContain("<TabsList>");
    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("<CardTitle>计费运营</CardTitle>");
    expect(source).not.toContain("账户、试算、价格和流水集中在同一管理区内。");
    expect(source).not.toContain("当前 {summaryResult.data.active_account_count} 个有效账户");
  });

  test("removes the platform audit list header copy", () => {
    const source = readSource("../../app/(console)/platform/audit-logs/page.tsx");

    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("<CardTitle>审计记录</CardTitle>");
    expect(source).not.toContain("当前筛选：");
    expect(source).not.toContain('<Badge variant="outline">全部操作</Badge>');
    expect(source).not.toContain("共 {pagination.total} 条");
  });

  test("removes the platform tenant list header filter and total copy", () => {
    const source = readSource("../../app/(console)/platform/tenants/page.tsx");

    expect(source).toContain("<CardTitle>租户列表</CardTitle>");
    expect(source).not.toContain("当前筛选：");
    expect(source).not.toContain('<Badge variant="outline">全部状态</Badge>');
    expect(source).not.toContain("共 {pagination.total} 个");
  });

  test("removes the platform lead list header copy", () => {
    const source = readSource("../../app/(console)/platform/leads/page.tsx");

    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("<CardTitle>线索列表</CardTitle>");
    expect(source).not.toContain("当前筛选：");
    expect(source).not.toContain('<Badge variant="outline">全部状态</Badge>');
    expect(source).not.toContain("共 {pagination.total} 条");
  });

  test("removes the platform device tab list header copy", () => {
    const source = readSource("../../app/(console)/platform/devices/page-sections.tsx");

    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("设备归属列表");
    expect(source).not.toContain("腾讯云设备列表");
    expect(source).not.toContain("全部厂商");
    expect(source).not.toContain("全部绑定");
    expect(source).not.toContain("包含设备基本信息与通道归属");
    expect(source).not.toContain('activeTab === "ownership" ? "个" : "台"');
  });

  test("removes the tenant account header copy from the billing tenant tab", () => {
    const source = readSource("../../app/(console)/platform/billing/billing-account-tabs.tsx");

    expect(source).not.toContain('title="租户账户"');
    expect(source).not.toContain('description="租户积分余额和人工充值入口。"');
    expect(source).not.toContain('badge={`${tenants.pagination.total} 个账户`}');
  });

  test("keeps billing filters as a compact shadcn toolbar", () => {
    const shared = readSource("../../app/(console)/platform/billing/billing-page-shared.tsx");
    const filterSelect = readSource("../../components/admin/filter-select.tsx");

    expect(shared).toContain("FieldGroup");
    expect(shared).toContain('className="border-b bg-muted/20 p-3"');
    expect(shared).toContain('className="flex flex-wrap items-end gap-3"');
    expect(shared).toContain('className="h-9"');
    expect(shared).toContain("<RotateCcw");
    expect(shared).toContain("<SlidersHorizontal");
    expect(shared).not.toContain('className="my-4 rounded-md border bg-muted/20 p-3"');
    expect(shared).not.toContain("grid gap-3 md:grid-cols-4 xl:grid-cols-6");
    expect(filterSelect).toContain('className="min-w-fit flex-row items-center gap-2"');
  });

  test("keeps billing tenant filters compact without redundant visible labels", () => {
    const tenantTab = readSource("../../app/(console)/platform/billing/billing-account-tabs.tsx");
    const shared = readSource("../../app/(console)/platform/billing/billing-page-shared.tsx");
    const filterSelect = readSource("../../components/admin/filter-select.tsx");

    expect(tenantTab).toContain('labelVisibility="srOnly"');
    expect(shared).toContain('labelVisibility = "visible"');
    expect(shared).toContain('className={labelVisibility === "srOnly" ? "sr-only" : undefined}');
    expect(shared).toContain('className="ml-auto flex shrink-0 items-center gap-2"');
    expect(filterSelect).toContain('className="min-w-fit flex-row items-center gap-2"');
    expect(filterSelect).toContain('className="shrink-0 text-sm font-medium text-foreground"');
    expect(filterSelect).toContain('className="w-36 md:w-40"');
  });

  test("aligns picture library search inputs with the inline filter control height", () => {
    const assetSearch = readInputSourceAroundPlaceholder(
      "../../components/picture-library/picture-library-list-actions.tsx",
      "搜索图片标题",
    );
    const commentSearch = readInputSourceAroundPlaceholder(
      "../../components/picture-library/picture-comment-actions.tsx",
      "搜索评论内容",
    );

    expect(assetSearch).toContain('className="h-9"');
    expect(commentSearch).toContain('className="h-9"');
  });

  test("does not nest div-based badges inside CardDescription paragraphs", () => {
    const sources = [
      readSource("../../app/(console)/platform/devices/page-sections.tsx"),
      readSource("../../app/(console)/platform/leads/page.tsx"),
      readSource("../../app/(console)/platform/audit-logs/page.tsx"),
    ];

    for (const source of sources) {
      expect(source).not.toContain('CardDescription className="flex flex-wrap items-center gap-2"');
    }
  });

  test("keys direct summary stat siblings passed through the client shell", () => {
    const pages = [
      "../../app/(console)/platform/tenants/page.tsx",
      "../../app/(console)/platform/marketing-pages/page.tsx",
      "../../app/(console)/platform/leads/page.tsx",
      "../../app/(console)/platform/billing/page.tsx",
      "../../app/(console)/platform/picture-library/page.tsx",
      "../../app/(console)/platform/audit-logs/page.tsx",
    ];

    for (const page of pages) {
      const summary = readSummarySource(page);
      const statTags = [...summary.matchAll(/<(?:Card|SummaryItem)(?=\s|>)([^>]*)>/g)];

      expect(statTags.length, page).toBeGreaterThan(0);
      for (const [, attributes] of statTags) {
        expect(attributes, page).toContain("key=");
      }
    }
  });

  test("keeps platform tenant loading aligned with the fixed-height list shell", () => {
    const loading = readSource("../../app/(console)/platform/tenants/loading.tsx");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3");
    expect(loading).not.toContain("<Card>");
  });

  test("keeps platform lead loading aligned with the fixed-height list shell", () => {
    const loading = readSource("../../app/(console)/platform/leads/loading.tsx");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3");
    expect(loading).toContain("md:grid-cols-[180px_1fr_72px]");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3");
    expect(loading).not.toContain("flex flex-col justify-between gap-3 md:flex-row md:items-center");
    expect(loading).not.toContain('Skeleton className="h-5 w-24"');
    expect(loading).not.toContain('Skeleton className="mt-2 h-4 w-40"');
  });

  test("keeps platform site content loading aligned with the fixed-height list shell", () => {
    const loading = readSource("../../app/(console)/platform/site-content/loading.tsx");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3");
    expect(loading).toContain("md:grid-cols-[150px_150px_minmax(220px,1fr)_72px]");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3");
    expect(loading).not.toContain("h-full");
    expect(loading).not.toContain("grid gap-4 md:grid-cols-2");
    expect(loading).not.toContain("min-h-52 flex-1");
  });

  test("keeps platform audit loading aligned with the fixed-height list shell", () => {
    const loading = readSource("../../app/(console)/platform/audit-logs/loading.tsx");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3");
    expect(loading).toContain("md:grid-cols-[190px_1fr_72px]");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");
    expect(loading).toContain("shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3");
    expect(loading).not.toContain("<Card>");
  });
});
