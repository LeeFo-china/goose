import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readTabsTriggerTags(source: string) {
  return source.match(/<TabsTrigger[\s\S]*?>/g) ?? [];
}

describe("shadcn tabs usage", () => {
  test("uses shadcn tabs for organization and settings tab containers", () => {
    const organizationTabs = readSource("../organization/organization-tabs.tsx");
    const settingsTabs = readSource("../settings/settings-tabs.tsx");

    for (const source of [organizationTabs, settingsTabs]) {
      expect(source).toContain('from "@/components/ui/tabs"');
      expect(source).toContain("<Tabs");
      expect(source).toContain("<TabsList");
      expect(source).toContain("<TabsTrigger");
      expect(source).toContain("<TabsContent");
      expect(source).not.toContain("<button");
      expect(source).not.toContain("aria-pressed");
    }
  });

  test("uses shadcn tabs for finance module navigation and summary views", () => {
    const moduleTabs = readSource("../finance/finance-module-tabs.tsx");
    const summaryViewTabs = readSource("../finance/finance-project-summary-view-tabs.tsx");

    for (const source of [moduleTabs, summaryViewTabs]) {
      expect(source).toContain('from "@/components/ui/tabs"');
      expect(source).toContain("<Tabs");
      expect(source).toContain("<TabsList");
      expect(source).toContain("<TabsTrigger");
      expect(source).not.toContain("<nav");
      expect(source).toContain("@/components/admin/admin-tabs");
      expect(source).toContain("adminTabsListClassName");
      expect(source).toContain("adminTabsTrigger");
    }
  });

  test("uses shared line tabs across tenant-side horizontal tab containers", () => {
    const shared = readSource("../admin/admin-tabs.ts");
    const tenantHorizontalTabSources = [
      "../projects/project-section-tabs.tsx",
      "../projects/project-detail-dialog.tsx",
      "../cameras/cameras-workspace-tabs.tsx",
      "../usage/usage-list-actions.tsx",
      "../finance/finance-module-tabs.tsx",
      "../finance/finance-project-summary-view-tabs.tsx",
      "../../app/(console)/finance/reports/page.tsx",
      "../organization/organization-tabs.tsx",
      "../marketing/marketing-tabs-nav.tsx",
      "../ops/ops-tabs.tsx",
      "../settings/platform-payment-settings-panel.tsx",
    ];

    expect(shared).toContain(
      'export const adminTabsListClassName = "h-auto w-full justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0";',
    );
    expect(shared).toContain(
      'export const adminTabsTriggerClassName = "shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground";',
    );
    expect(shared).toContain(
      'export const adminTabsTriggerWithBadgeClassName = `${adminTabsTriggerClassName} gap-2 whitespace-nowrap`;',
    );

    for (const path of tenantHorizontalTabSources) {
      const source = readSource(path);
      const triggerTags = readTabsTriggerTags(source);

      expect(source, path).toContain("@/components/admin/admin-tabs");
      expect(source, path).toContain("adminTabsListClassName");
      expect(triggerTags.length, path).toBeGreaterThan(0);
      expect(source, path).not.toContain('className="w-max"');
      expect(source, path).not.toContain('className="h-auto min-w-max justify-start"');
      expect(source, path).not.toContain("rounded-lg border bg-secondary");
      for (const triggerTag of triggerTags) {
        expect(triggerTag, path).toMatch(
          /className=\{(?:adminTabsTrigger(?:WithBadge)?ClassName|tabsTriggerClassName|cn\(\s*adminTabsTrigger(?:WithBadge)?ClassName)/,
        );
      }
    }
  });
});
