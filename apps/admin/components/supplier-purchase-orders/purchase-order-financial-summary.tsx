import { StatusAlert } from "@/components/admin/status-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { formatPurchaseMoney } from "./purchase-order-rules";
import type {
  SupplierPurchaseOrderFinancialSummary,
} from "./purchase-order-types";

export type PurchaseOrderFinancialSummaryProps = {
  summary: SupplierPurchaseOrderFinancialSummary | null;
  isLoading: boolean;
  error: string | null;
};

const summaryFacts = [
  { key: "accepted_amount", label: "合格收货" },
  { key: "payable_amount", label: "已形成应付" },
  { key: "reserved_request_amount", label: "已申请未付" },
  { key: "paid_amount", label: "已付" },
  { key: "open_amount", label: "未付应付" },
] as const;

export function PurchaseOrderFinancialSummary({
  summary,
  isLoading,
  error,
}: PurchaseOrderFinancialSummaryProps) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b bg-muted/20 p-4">
        <CardTitle>采购财务闭环</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryFacts.map(({ key }) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        ) : summary ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryFacts.map(({ key, label }) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 truncate font-mono text-sm font-semibold tabular-nums">
                  {formatPurchaseMoney(summary[key])}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
