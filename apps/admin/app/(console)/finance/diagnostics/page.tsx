import { LineChart } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceDiagnosticsPanel,
  type FinanceDiagnosticView,
} from "@/components/finance/finance-diagnostics-panel";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { fetchFinanceProjectSummaries } from "@/components/finance/finance-requests";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";

type FinanceDiagnosticsSearchParams = {
  view?: string;
};

function resolveDiagnosticView(value: string | undefined): FinanceDiagnosticView {
  if (value === "danger" || value === "data" || value === "receivables") {
    return value;
  }
  return "all";
}

export default async function FinanceDiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<FinanceDiagnosticsSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const activeView = resolveDiagnosticView(params.view);
  const data = await fetchFinanceProjectSummaries({
    page: 1,
    pageSize: 20,
  });

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-visible lg:h-[calc(100vh-6.5625rem)] lg:overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <LineChart aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">财务诊断</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              预算、成本归集、利润异常与逾期应收的处理工作区
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          共 {data.summary.project_count || data.pagination.total || 0} 个项目
        </Badge>
      </div>

      <FinanceModuleTabs activeTab="diagnostics" />

      {data.error ? (
        <div className="shrink-0">
          <StatusAlert>{data.error}</StatusAlert>
        </div>
      ) : null}

      <FinanceDiagnosticsPanel
        summary={data.summary}
        analytics={data.analytics}
        activeView={activeView}
      />
    </div>
  );
}
