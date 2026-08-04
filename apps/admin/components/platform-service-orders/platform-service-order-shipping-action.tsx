"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw } from "lucide-react";

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
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

import {
  formatDateTime,
  getWechatShippingStatusMeta,
} from "./platform-service-order-rules";
import type { PlatformServiceOrderListItem } from "./platform-service-order-types";

export function PlatformServiceOrderShippingAction({
  order,
  canRetry,
}: {
  order: PlatformServiceOrderListItem;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const action = order.available_actions?.wechat_shipping_retry;
  const enabled = canRetry && (action?.enabled ?? false);
  const disabledReason = !canRetry
    ? "当前账号缺少平台技术服务工单管理权限"
    : action?.disabled_reason ?? undefined;
  const report = order.wechat_shipping_report;
  const statusMeta = getWechatShippingStatusMeta(report?.status || "not_started");

  function handleRetry() {
    setError("");
    startTransition(async () => {
      try {
        await requestBackendJson(
          `/platform/billing/service-orders/${order.id}/shipping-report/retry`,
          {
            method: "POST",
            fallbackMessage: "重新上报微信履约失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "重新上报微信履约失败",
        );
      }
    });
  }

  return (
    <Dialog open={enabled ? open : false} onOpenChange={(nextOpen) => {
      if (enabled) setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!enabled}
          title={disabledReason}
          className="min-w-36 justify-center"
        >
          <RefreshCcw data-icon="inline-start" />
          重新上报微信履约
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重新上报微信履约</DialogTitle>
          <DialogDescription>
            {order.order_no} · 当前状态：{statusMeta.label}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <div>最近尝试：{formatDateTime(report?.last_attempt_at)}</div>
          <div>微信错误码：{report?.wechat_errcode ?? "-"}</div>
          <div className="break-all">
            错误信息：{report?.wechat_errmsg || "-"}
          </div>
        </div>
        <FieldError>{error}</FieldError>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button type="button" onClick={handleRetry} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            确认重试
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
