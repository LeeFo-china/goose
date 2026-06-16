import Link from "next/link";
import { ScrollText } from "lucide-react";
import { FinanceLedgerTable } from "@/components/finance/finance-ledger-table";
import { fetchFinanceLedger } from "@/components/finance/finance-requests";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";

type FinanceLedgerPageSearchParams = {
  page?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function ledgerPageHref(page: number) {
  return `/finance/ledger?page=${page}`;
}

export default async function FinanceLedgerPage({
  searchParams,
}: {
  searchParams: Promise<FinanceLedgerPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const data = await fetchFinanceLedger({ page, pageSize: 20 });
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <ScrollText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">财务台账</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              项目收款和费用打款流水。当前共 {data.pagination.total} 条记录。
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
        </Badge>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceLedgerTable rows={data.list} />
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>当前显示 {data.list.length} 条，共 {data.pagination.total} 条</span>
              <Badge variant="outline" className="tabular-nums">
                每页 {data.pagination.pageSize} 条
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!canGoPrev}
                asChild={canGoPrev}
              >
                {canGoPrev ? (
                  <Link href={ledgerPageHref(data.pagination.page - 1)}>上一页</Link>
                ) : (
                  <span>上一页</span>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canGoNext}
                asChild={canGoNext}
              >
                {canGoNext ? (
                  <Link href={ledgerPageHref(data.pagination.page + 1)}>下一页</Link>
                ) : (
                  <span>下一页</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
