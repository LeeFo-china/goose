import { adminTabsListClassName, adminTabsTriggerClassName } from "@/components/admin/admin-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type FinanceModuleTab =
  | "overview"
  | "diagnostics"
  | "reconciliation"
  | "audits"
  | "reports"
  | "receivables"
  | "wechat-pay"
  | "wechat-pay-applyment"
  | "ledger";

export const FINANCE_MODULE_TABS: Array<{
  value: FinanceModuleTab;
  label: string;
  href: string;
}> = [
  { value: "overview", label: "财务总览", href: "/finance" },
  { value: "diagnostics", label: "财务诊断", href: "/finance/diagnostics" },
  { value: "reconciliation", label: "对账异常", href: "/finance/reconciliation" },
  { value: "audits", label: "修正审计", href: "/finance/audits" },
  { value: "reports", label: "运营报表", href: "/finance/reports" },
  { value: "receivables", label: "应收计划", href: "/finance/receivables" },
  { value: "wechat-pay", label: "微信支付", href: "/finance/wechat-pay" },
  { value: "wechat-pay-applyment", label: "支付开通", href: "/finance/wechat-pay/applyment" },
  { value: "ledger", label: "财务台账", href: "/finance/ledger" },
];

export function FinanceModuleTabs({
  activeTab,
}: {
  activeTab: FinanceModuleTab;
}) {
  return (
    <Tabs
      value={activeTab}
      aria-label="财务模块"
      className="shrink-0 overflow-x-auto overflow-y-hidden border-b"
    >
      <TabsList className={adminTabsListClassName}>
        {FINANCE_MODULE_TABS.map((tab) => {
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              asChild
              className={adminTabsTriggerClassName}
            >
              <a href={tab.href}>{tab.label}</a>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
