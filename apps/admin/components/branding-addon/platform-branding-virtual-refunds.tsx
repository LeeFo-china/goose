"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, RotateCcw, Search } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { ListFooter } from "@/components/branding-addon/platform-branding-entitlement-orders";
import type {
  PlatformBrandingPageData,
  PlatformBrandingVirtualRefund,
  PlatformBrandingVirtualRefundDetail,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";
import type { ColumnDef } from "@tanstack/react-table";

export function PlatformBrandingVirtualRefunds({
  data,
  status,
  previousHref,
  nextHref,
}: {
  data: PlatformBrandingPageData<PlatformBrandingVirtualRefund>;
  status: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlatformBrandingVirtualRefundDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      return;
    }
    let active = true;
    setLoadingDetail(true);
    setDetail(null);
    setDetailError("");
    void requestBackendJson<PlatformBrandingVirtualRefundDetail>(
      `/platform/branding/virtual-payment/refunds/${selectedId}`,
      { fallbackMessage: "退款详情加载失败" },
    ).then((result) => {
      if (active) setDetail(result);
    }).catch((caught) => {
      if (active) {
        setDetailError(caught instanceof Error ? caught.message : "退款详情加载失败");
      }
    }).finally(() => {
      if (active) setLoadingDetail(false);
    });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const columns: ColumnDef<PlatformBrandingVirtualRefund>[] = [
    {
      accessorKey: "refund_no",
      header: "退款单",
      cell: ({ row }) => (
        <div className="min-w-[190px]">
          <div className="font-medium tabular-nums">{row.original.refund_no}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            订单 {row.original.out_trade_no}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "tenant_name",
      header: "租户",
      cell: ({ row }) => (
        <div className="min-w-[160px] truncate font-medium">{row.original.tenant_name}</div>
      ),
    },
    {
      accessorKey: "provider_channel",
      header: "处理渠道",
      cell: ({ row }) => (
        <div className="space-y-1">
          <Badge variant="outline" className="whitespace-nowrap">
            {row.original.provider_channel === "apple" ? "Apple 外部处理" : "微信商户发起"}
          </Badge>
          <div className="text-xs text-muted-foreground">
            {row.original.environment === "production" ? "生产环境" : "沙箱环境"}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[150px] whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "退款状态",
      cell: ({ row }) => <RefundBadge status={row.original.status} />,
    },
    {
      accessorKey: "compensation_status",
      header: "权益冲销",
      cell: ({ row }) => <CompensationBadge status={row.original.compensation_status} />,
    },
    {
      accessorKey: "amount_fen",
      header: "退款金额",
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatFen(row.original.amount_fen)}</span>,
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.created_at)}</span>,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(row.original.id)}>
            <Eye data-icon="inline-start" />查看详情
          </Button>
        </div>
      ),
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];

  return (
    <>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <form className="flex flex-wrap gap-3">
            <input type="hidden" name="view" value="refunds" />
            <Select name="refund_status" defaultValue={status || "all"}>
              <SelectTrigger className="w-48" aria-label="全部退款状态">
                <SelectValue placeholder="全部退款状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部退款状态</SelectItem>
                <SelectItem value="reviewing">审核中</SelectItem>
                <SelectItem value="submitted">已提交</SelectItem>
                <SelectItem value="external_required">外部处理</SelectItem>
                <SelectItem value="succeeded">退款成功</SelectItem>
                <SelectItem value="failed">退款失败</SelectItem>
                <SelectItem value="rejected">已拒绝</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit"><Search data-icon="inline-start" />筛选</Button>
            <Button variant="outline" asChild>
              <Link href="/platform/branding-addon?view=refunds">
                <RotateCcw data-icon="inline-start" />重置
              </Link>
            </Button>
          </form>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <DataTable
              columns={columns}
              data={data.list}
              emptyText="当前筛选条件下没有虚拟支付退款记录"
              minWidth="min-w-[1080px]"
              tableClassName="border-t-0"
            />
          </div>
          <ListFooter
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            unit="笔退款"
            previousHref={previousHref}
            nextHref={nextHref}
          />
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => {
        if (!open) setSelectedId(null);
      }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>退款详情</SheetTitle>
            <SheetDescription>核对微信退款事实和权益冲销结果。</SheetDescription>
          </SheetHeader>
          {loadingDetail ? <RefundDetailSkeleton /> : null}
          {detailError ? <p className="text-sm text-destructive" role="alert">{detailError}</p> : null}
          {detail ? <RefundDetail detail={detail} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function RefundDetail({ detail }: { detail: PlatformBrandingVirtualRefundDetail }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap gap-2">
        <RefundBadge status={detail.status} />
        <CompensationBadge status={detail.compensation_status} />
        <Badge variant="outline" className="whitespace-nowrap">
          {detail.platform_mode === "apple_external" ? "Apple 外部处理" : "微信商户发起"}
        </Badge>
      </div>
      <dl className="grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
        <DetailFact label="退款单号" value={detail.refund_no} />
        <DetailFact label="原支付单号" value={detail.order.out_trade_no} />
        <DetailFact label="退款金额" value={formatFen(detail.amount_fen)} />
        <DetailFact label="支付环境" value={detail.order.environment === "production" ? "生产环境" : "沙箱环境"} />
        <DetailFact label="创建时间" value={formatDate(detail.created_at)} />
        <DetailFact label="更新时间" value={formatDate(detail.updated_at)} />
      </dl>
      <div className="space-y-1.5">
        <h3 className="font-medium">退款原因</h3>
        <p className="rounded-md border p-3 text-muted-foreground">{detail.reason}</p>
      </div>
      <div className="space-y-1.5">
        <h3 className="font-medium">售后证据摘要</h3>
        <p className="rounded-md border p-3 text-muted-foreground">
          {detail.evidence_summary || "未填写"}
        </p>
      </div>
      {detail.last_error_summary || detail.compensation_last_error ? (
        <div className="space-y-1.5">
          <h3 className="font-medium text-destructive">异常信息</h3>
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
            {detail.last_error_summary || detail.compensation_last_error}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>;
}

function RefundDetailSkeleton() {
  return <div className="space-y-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>;
}

const refundMeta: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  reviewing: { label: "审核中", variant: "warning" },
  submitted: { label: "已提交", variant: "warning" },
  external_required: { label: "外部处理", variant: "warning" },
  succeeded: { label: "退款成功", variant: "success" },
  failed: { label: "退款失败", variant: "danger" },
  rejected: { label: "已拒绝", variant: "secondary" },
};

function RefundBadge({ status }: { status: string }) {
  const meta = refundMeta[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function CompensationBadge({ status }: { status: string }) {
  if (status === "succeeded") return <Badge variant="success">权益已冲销</Badge>;
  if (status === "failed") return <Badge variant="danger">冲销失败</Badge>;
  return <Badge variant="warning">等待冲销</Badge>;
}

function formatFen(amountFen: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amountFen / 100);
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
    : value;
}
