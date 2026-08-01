"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { isOrderRefundable } from "@/components/branding-addon/platform-branding-addon-product-form-data";
import type {
  PlatformBrandingEntitlementOrder,
  PlatformBrandingPageData,
  PlatformBrandingVirtualRefund,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import type { ColumnDef } from "@tanstack/react-table";

type OrderFilters = {
  keyword: string;
  paymentChannel: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  refundStatus: string;
};

export function PlatformBrandingEntitlementOrders({
  data,
  filters,
  previousHref,
  nextHref,
  canRefund,
}: {
  data: PlatformBrandingPageData<PlatformBrandingEntitlementOrder>;
  filters: OrderFilters;
  previousHref: string | null;
  nextHref: string | null;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [selectedOrder, setSelectedOrder] =
    useState<PlatformBrandingEntitlementOrder | null>(null);
  const [reason, setReason] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function openRefund(order: PlatformBrandingEntitlementOrder) {
    setSelectedOrder(order);
    setReason("");
    setEvidenceSummary("");
    setError("");
  }

  function submitRefund() {
    if (!selectedOrder || !reason.trim()) {
      setError("请填写退款原因");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const refund = await requestBackendJson<PlatformBrandingVirtualRefund>(
          "/platform/branding/virtual-payment/refunds",
          {
            method: "POST",
            body: JSON.stringify({
              order_id: selectedOrder.id,
              idempotency_key: crypto.randomUUID(),
              reason: reason.trim(),
              evidence_summary: evidenceSummary.trim(),
            }),
            fallbackMessage: "退款申请创建失败",
          },
        );
        setSelectedOrder(null);
        toast.success(
          refund.platform_mode === "apple_external"
            ? "退款记录已创建，请等待 Apple 外部处理"
            : "退款已提交微信处理",
        );
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "退款申请创建失败");
      }
    });
  }

  const columns: ColumnDef<PlatformBrandingEntitlementOrder>[] = [
    {
      accessorKey: "order_no",
      header: "订单",
      cell: ({ row }) => (
        <div className="min-w-[190px]">
          <div className="font-medium tabular-nums">{row.original.order_no}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatDate(row.original.created_at)}
          </div>
        </div>
      ),
    },
    {
      id: "tenant",
      header: "租户",
      cell: ({ row }) => (
        <div className="min-w-[160px]">
          <div className="truncate font-medium">
            {row.original.tenant.name || "未命名租户"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.tenant.slug || row.original.tenant_id}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "payment_channel",
      header: "支付通道",
      cell: ({ row }) => (
        <div className="space-y-1">
          <Badge variant="outline" className="whitespace-nowrap">
            {row.original.payment_channel === "wechat_virtual"
              ? "微信虚拟支付"
              : "普通支付"}
          </Badge>
          <div className="text-xs text-muted-foreground">
            {platformLabel(row.original.payment_platform)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "payment_status",
      header: "支付状态",
      cell: ({ row }) => <StateBadge state={row.original.payment_status} />,
    },
    {
      accessorKey: "fulfillment_status",
      header: "履约状态",
      cell: ({ row }) => <StateBadge state={row.original.fulfillment_status} />,
    },
    {
      accessorKey: "refund_status",
      header: "退款状态",
      cell: ({ row }) => <StateBadge state={row.original.refund_status} />,
    },
    {
      accessorKey: "amount_fen",
      header: "金额",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatFen(row.original.amount_fen)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const refundable = isOrderRefundable(row.original);
        const isAppleHint = row.original.payment_platform === "ios";
        return (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openRefund(row.original)}
              disabled={!canRefund || !refundable}
            >
              申请退款
            </Button>
            {refundable && isAppleHint ? (
              <span className="text-xs text-muted-foreground">Apple 外部处理</span>
            ) : null}
          </div>
        );
      },
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];

  return (
    <>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <form className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_150px_150px_150px_auto]">
            <input type="hidden" name="view" value="orders" />
            <Input name="keyword" defaultValue={filters.keyword} placeholder="搜索订单号、租户名称或租户标识" />
            <FilterSelect name="payment_channel" value={filters.paymentChannel} placeholder="全部通道" options={[
              ["legacy_direct", "普通支付"],
              ["wechat_virtual", "微信虚拟支付"],
            ]} />
            <FilterSelect name="payment_status" value={filters.paymentStatus} placeholder="全部支付" options={[
              ["pending", "待支付"], ["succeeded", "支付成功"],
              ["closed", "已关闭"], ["failed", "支付失败"],
            ]} />
            <FilterSelect name="fulfillment_status" value={filters.fulfillmentStatus} placeholder="全部履约" options={[
              ["pending", "待履约"], ["granted", "已发放"],
              ["grant_failed", "发放失败"],
            ]} />
            <FilterSelect name="refund_status" value={filters.refundStatus} placeholder="全部退款" options={[
              ["none", "未退款"], ["reviewing", "审核中"],
              ["submitted", "已提交"], ["external_required", "外部处理"],
              ["succeeded", "退款成功"], ["failed", "退款失败"],
              ["rejected", "已拒绝"],
            ]} />
            <div className="flex gap-2">
              <Button type="submit"><Search data-icon="inline-start" />筛选</Button>
              <Button variant="outline" asChild>
                <Link href="/platform/branding-addon?view=orders">
                  <RotateCcw data-icon="inline-start" />重置
                </Link>
              </Button>
            </div>
          </form>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <DataTable
              columns={columns}
              data={data.list}
              emptyText="当前筛选条件下没有品牌权益订单"
              minWidth="min-w-[1180px]"
              tableClassName="border-t-0"
            />
          </div>
          <ListFooter
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            unit="个订单"
            previousHref={previousHref}
            nextHref={nextHref}
          />
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(selectedOrder)} onOpenChange={(open) => {
        if (!open && !pending) setSelectedOrder(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认发起全额退款</AlertDialogTitle>
            <AlertDialogDescription>
              订单 {selectedOrder?.order_no} 将按微信查单确认的可信渠道处理，成功后系统自动冲销对应权益。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {selectedOrder?.payment_platform === "ios" ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                该订单由客户端报告为 iOS，界面提示 Apple 外部处理。最终退款渠道仍由后端微信查单事实决定。
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="branding-refund-reason" className="text-sm font-medium">退款原因</label>
              <Textarea id="branding-refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="branding-refund-evidence" className="text-sm font-medium">售后证据摘要</label>
              <Textarea id="branding-refund-evidence" value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} maxLength={1000} disabled={pending} />
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !reason.trim()}
              onClick={(event) => {
                event.preventDefault();
                submitRefund();
              }}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "提交中" : "确认退款"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FilterSelect({ name, value, placeholder, options }: {
  name: string;
  value: string;
  placeholder: string;
  options: Array<[string, string]>;
}) {
  return (
    <Select name={name} defaultValue={value || "all"}>
      <SelectTrigger aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map(([optionValue, label]) => (
          <SelectItem key={optionValue} value={optionValue}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ListFooter({ page, totalPages, total, unit, previousHref, nextHref }: {
  page: number;
  totalPages: number;
  total: number;
  unit: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span className="tabular-nums">第 {page} / {Math.max(1, totalPages)} 页，共 {total} {unit}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!previousHref} asChild={Boolean(previousHref)}>
          {previousHref ? <Link href={previousHref}>上一页</Link> : <span>上一页</span>}
        </Button>
        <Button variant="outline" size="sm" disabled={!nextHref} asChild={Boolean(nextHref)}>
          {nextHref ? <Link href={nextHref}>下一页</Link> : <span>下一页</span>}
        </Button>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const meta = stateMeta[state] ?? { label: state, variant: "outline" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

const stateMeta: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "待处理", variant: "warning" },
  succeeded: { label: "成功", variant: "success" },
  closed: { label: "已关闭", variant: "secondary" },
  failed: { label: "失败", variant: "danger" },
  granted: { label: "已发放", variant: "success" },
  grant_failed: { label: "发放失败", variant: "danger" },
  none: { label: "未退款", variant: "outline" },
  reviewing: { label: "审核中", variant: "warning" },
  submitted: { label: "已提交", variant: "warning" },
  external_required: { label: "外部处理", variant: "warning" },
  rejected: { label: "已拒绝", variant: "secondary" },
};

function platformLabel(platform: PlatformBrandingEntitlementOrder["payment_platform"]) {
  return ({
    ios: "iOS",
    android: "安卓",
    harmony: "鸿蒙",
    windows: "Windows",
    unknown: "平台未知",
  })[platform];
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
