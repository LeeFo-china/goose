import Link from "next/link";
import { cn } from "@/lib/utils";

export type FinanceProjectSummaryView = "all" | "danger" | "info";

export function FinanceProjectSummaryViewTabs({
  activeView,
  hrefs,
}: {
  activeView: FinanceProjectSummaryView;
  hrefs: Record<FinanceProjectSummaryView, string>;
}) {
  const tabs: Array<{ value: FinanceProjectSummaryView; label: string }> = [
    { value: "all", label: "全部项目" },
    { value: "danger", label: "高风险项目" },
    { value: "info", label: "待补基础数据" },
  ];

  return (
    <nav
      aria-label="项目财务明细视图"
      className="overflow-x-auto overflow-y-hidden"
    >
      <div className="flex min-w-max items-center gap-5">
        {tabs.map((tab) => {
          const active = tab.value === activeView;

          return (
            <Link
              key={tab.value}
              href={hrefs[tab.value]}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "border-primary text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
