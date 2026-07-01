import Link from "next/link";
import { WalletCards } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FinanceFilterSelectField } from "@/components/finance/finance-filter-controls";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceWechatPayOrdersTable } from "@/components/finance/finance-wechat-pay-orders-table";
import { fetchWechatPayOrders } from "@/components/finance/finance-wechat-pay-requests";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FinanceWechatPayOrdersSearchParams = {
  page?: string;
  status?: string;
};

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待支付" },
  { value: "paid", label: "已支付" },
  { value: "closed", label: "已关闭" },
  { value: "failed", label: "支付失败" },
  { value: "refunded", label: "已退款" },
];

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function buildOrdersHref(input: {
  page: number;
  status?: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  return `/finance/wechat-pay/orders?${params}`;
}

export default async function FinanceWechatPayOrdersPage({
  searchParams,
}: {
  searchParams: Promise<FinanceWechatPayOrdersSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const status = clean(params.status);
  const data = await fetchWechatPayOrders({
    page,
    pageSize: 20,
    status,
  });
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <WalletCards aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">微信支付订单</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              微信支付订单号、应收计划、支付状态和微信交易号。当前共 {data.pagination.total} 条记录。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit tabular-nums">
            第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/wechat-pay">商户配置</Link>
          </Button>
        </div>
      </div>

      <FinanceModuleTabs activeTab="wechat-pay" />

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/wechat-pay/orders"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-[12rem_auto] md:items-end"
          >
            <FinanceFilterSelectField
              id="wechat-pay-order-status-filter"
              name="status"
              label="订单状态"
              value={status}
              options={ORDER_STATUS_OPTIONS}
            />
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/wechat-pay/orders">重置</Link>
              </Button>
            </div>
          </form>
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div
            data-testid="wechat-pay-orders-table-viewport"
            className="min-h-0 flex-1 overflow-auto"
          >
            <FinanceWechatPayOrdersTable rows={data.list} />
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
                  <Link
                    href={buildOrdersHref({
                      page: data.pagination.page - 1,
                      status,
                    })}
                  >
                    上一页
                  </Link>
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
                  <Link
                    href={buildOrdersHref({
                      page: data.pagination.page + 1,
                      status,
                    })}
                  >
                    下一页
                  </Link>
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
