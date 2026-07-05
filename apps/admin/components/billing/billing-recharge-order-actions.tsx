"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import type {
  PlatformRechargeOrder,
  PlatformRechargeOrderDetailData,
} from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

async function requestJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

export function RechargeOrderDetailButton({ order }: { order: PlatformRechargeOrder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<PlatformRechargeOrderDetailData | null>(null);
  const [error, setError] = useState("");
  const currentOrder = detail?.order ?? order;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    requestJson<PlatformRechargeOrderDetailData>(
      `/api/backend/platform/billing/recharge-orders/${order.id}`,
    )
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载订单详情失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order.id]);

  function compensate() {
    setError("");
    startTransition(async () => {
      try {
        await requestJson(`/api/backend/platform/billing/recharge-orders/${order.id}/compensate`, {
          method: "POST",
          body: JSON.stringify({ reason: "Admin 订单详情手动查单" }),
        });
        const data = await requestJson<PlatformRechargeOrderDetailData>(
          `/api/backend/platform/billing/recharge-orders/${order.id}`,
        );
        setDetail(data);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "查单补偿失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Eye data-icon="inline-start" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[84vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>充值订单详情</DialogTitle>
          <DialogDescription>{currentOrder.order_no}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            加载中
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <OrderSummary order={currentOrder} />
            <NotificationTable detail={detail} />
            <AuditLogTable detail={detail} />
          </div>
        )}
        <FieldError>{error}</FieldError>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>关闭</Button>
          {currentOrder.status === "pending" ? (
            <Button type="button" onClick={compensate} disabled={pending || loading}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              查单补偿
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderSummary({ order }: { order: PlatformRechargeOrder }) {
  return (
    <section className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <InfoItem label="租户" value={order.tenant?.name || order.tenant?.slug || order.tenant_id} />
      <InfoItem label="商户单号" value={order.out_trade_no || "-"} />
      <InfoItem label="微信交易号" value={order.transaction_id || "-"} />
      <InfoItem label="状态" value={orderStatusLabel(order.status)} />
      <InfoItem label="充值金额" value={formatFen(order.amount_fen)} />
      <InfoItem label="实付金额" value={formatFen(order.paid_amount_fen)} />
      <InfoItem label="到账积分" value={formatCredits(order.credits + order.bonus_credits)} />
      <InfoItem label="支付时间" value={formatDateTime(order.paid_at)} />
    </section>
  );
}

function NotificationTable({ detail }: { detail: PlatformRechargeOrderDetailData | null }) {
  const notifications = detail?.notifications ?? [];
  return (
    <section className="flex flex-col gap-2">
      <div className="text-sm font-medium">微信通知</div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>通知</TableHead>
              <TableHead>事件</TableHead>
              <TableHead>处理</TableHead>
              <TableHead>错误</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatDateTime(item.created_at)}</TableCell>
                <TableCell className="max-w-56 truncate">{item.notify_id}</TableCell>
                <TableCell>{item.event_type}</TableCell>
                <TableCell>
                  <Badge variant={item.processed ? "success" : "secondary"}>{item.processed ? "已处理" : "未处理"}</Badge>
                </TableCell>
                <TableCell className="max-w-56 truncate">{item.error_message || "-"}</TableCell>
              </TableRow>
            ))}
            {!notifications.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-16 text-center text-sm text-muted-foreground">
                  暂无微信通知
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function AuditLogTable({ detail }: { detail: PlatformRechargeOrderDetailData | null }) {
  const auditLogs = detail?.audit_logs ?? [];
  return (
    <section className="flex flex-col gap-2">
      <div className="text-sm font-medium">平台审计</div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>摘要</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatDateTime(item.created_at)}</TableCell>
                <TableCell>{item.action}</TableCell>
                <TableCell>
                  <Badge variant={item.status === "success" ? "success" : "danger"}>{item.status}</Badge>
                </TableCell>
                <TableCell className="max-w-80 truncate">{item.summary || "-"}</TableCell>
              </TableRow>
            ))}
            {!auditLogs.length ? (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center text-sm text-muted-foreground">
                  暂无平台审计
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function formatFen(value: number) {
  return `¥${(Number(value || 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCredits(value: number) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
    refunded: "已退款",
  };
  return labels[status] || status;
}
