import { cn } from "@/lib/utils";

export type FinanceModuleTab =
  | "overview"
  | "diagnostics"
  | "receivables"
  | "ledger";

const FINANCE_MODULE_TABS: Array<{
  value: FinanceModuleTab;
  label: string;
  href: string;
}> = [
  { value: "overview", label: "财务总览", href: "/finance" },
  { value: "diagnostics", label: "财务诊断", href: "/finance/diagnostics" },
  { value: "receivables", label: "应收计划", href: "/finance/receivables" },
  { value: "ledger", label: "财务台账", href: "/finance/ledger" },
];

export function FinanceModuleTabs({
  activeTab,
}: {
  activeTab: FinanceModuleTab;
}) {
  return (
    <nav
      aria-label="财务模块"
      className="shrink-0 overflow-x-auto overflow-y-hidden border-b"
    >
      <div className="flex min-w-max items-center gap-5">
        {FINANCE_MODULE_TABS.map((tab) => {
          const active = tab.value === activeTab;

          return (
            <a
              key={tab.value}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "border-primary text-foreground",
              )}
            >
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
