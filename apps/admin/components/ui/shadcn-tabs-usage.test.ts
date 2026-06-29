import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
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
      expect(source).not.toContain("border-b-2 border-transparent");
    }
  });
});
