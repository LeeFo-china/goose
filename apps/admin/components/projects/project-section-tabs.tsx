import Link from "next/link";
import { adminTabsListClassName, adminTabsTriggerClassName } from "@/components/admin/admin-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminSession } from "@/lib/backend";
import { cn } from "@/lib/utils";

export const projectSectionTabs = [
  { key: "list", label: "项目列表", href: "/projects" },
  { key: "health", label: "项目风险", href: "/projects/health" },
] as const;

export type ProjectSectionTabKey = typeof projectSectionTabs[number]["key"];

export function canViewProjectHealth(
  session: Pick<AdminSession, "permissions"> | null | undefined,
): boolean {
  if (!session) return false;

  return ["dashboard.read", "project.read"].every((code) =>
    session.permissions.some((permission) =>
      permission.code === code && permission.scope === "all"
    ),
  );
}

export function ProjectSectionTabs({
  activeTab,
  canViewHealth,
}: {
  activeTab: ProjectSectionTabKey;
  canViewHealth: boolean;
}) {
  const visibleTabs = projectSectionTabs.filter((tab) =>
    tab.key !== "health" || canViewHealth
  );

  if (visibleTabs.length < 2) return null;

  return (
    <Tabs value={activeTab} className="flex overflow-x-auto">
      <TabsList
        aria-label="项目分区"
        className={adminTabsListClassName}
      >
        {visibleTabs.map((tab) => {
          const active = tab.key === activeTab;

          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              asChild
              className={cn(
                adminTabsTriggerClassName,
                active && "pointer-events-none",
              )}
            >
              <Link href={tab.href} aria-current={active ? "page" : undefined}>
                {tab.label}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
