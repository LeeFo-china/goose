"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Loader2, XCircle } from "lucide-react";
import type {
  PlatformRechargeRefundRequest,
  PlatformRechargeRefundRequestDetailData,
  PlatformRechargeRefundStatus,
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

type ReviewAction = "approve" | "reject";

async function requestJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

export function RechargeRefundRequestDetailButton({
  request,
}: {
  request: PlatformRechargeRefundRequest;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<ReviewAction | null>(null);
  const [detail, setDetail] = useState<PlatformRechargeRefundRequestDetailData | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const currentRequest = detail?.request ?? request;
  const canApprove = currentRequest.status === "pending_review";
  const canReject = currentRequest.status === "pending_review" || currentRequest.status === "approved";
  const canReview = canApprove || canReject;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setReviewNote("");
    requestJson<PlatformRechargeRefundRequestDetailData>(
      `/api/backend/platform/billing/recharge-refund-requests/${request.id}`,
    )
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载退款申请失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, request.id]);

  async function submitReview(action: ReviewAction) {
    const note = reviewNote.trim();
    if (!note) {
      setError("请填写审核备注");
      return;
    }

    setError("");
    setSubmittingAction(action);
    try {
      const endpoint = action === "approve"
        ? `/api/backend/platform/billing/recharge-refund-requests/${request.id}/approve`
        : `/api/backend/platform/billing/recharge-refund-requests/${request.id}/reject`;
      const data = await requestJson<PlatformRechargeRefundRequestDetailData>(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({ review_note: note }),
        },
      );
      setDetail(data);
      setReviewNote("");
      refreshAfterDialogClose(router);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "审核退款申请失败");
    } finally {
      setSubmittingAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Eye data-icon="inline-start" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[84vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>退款申请详情</DialogTitle>
          <DialogDescription>{currentRequest.request_no}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            加载中
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <RequestSummary request={currentRequest} />
            <RequestTextBlock label="退款原因" value={currentRequest.reason} />
            {currentRequest.review_note ? (
              <RequestTextBlock label="审核备注" value={currentRequest.review_note} />
            ) : null}
            {currentRequest.failure_message ? (
              <RequestTextBlock label="失败原因" value={currentRequest.failure_message} />
            ) : null}
            {canReview ? (
              <Field>
                <FieldLabel htmlFor={`review-note-${currentRequest.id}`}>审核备注</FieldLabel>
                <Textarea
                  id={`review-note-${currentRequest.id}`}
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="填写审核依据或驳回原因"
                  maxLength={500}
                />
              </Field>
            ) : null}
          </div>
        )}
        <FieldError>{error}</FieldError>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={Boolean(submittingAction)}
          >
            关闭
          </Button>
          {canReject ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => submitReview("reject")}
              disabled={loading || Boolean(submittingAction)}
            >
              {submittingAction === "reject" ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <XCircle data-icon="inline-start" />
              )}
              驳回
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              type="button"
              onClick={() => submitReview("approve")}
              disabled={loading || Boolean(submittingAction)}
            >
              {submittingAction === "approve" ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <CheckCircle2 data-icon="inline-start" />
              )}
              通过
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestSummary({ request }: { request: PlatformRechargeRefundRequest }) {
  return (
    <section className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <InfoItem label="租户" value={request.tenant?.name || request.tenant?.slug || request.tenant_id} />
      <InfoItem label="状态" value={refundStatusLabel(request.status)} badgeStatus={request.status} />
      <InfoItem label="申请金额" value={formatFen(request.requested_amount_fen)} />
      <InfoItem label="申请积分" value={formatCredits(request.requested_credits)} />
      <InfoItem label="充值订单" value={request.order?.order_no || request.order_id} />
      <InfoItem label="微信交易号" value={request.order?.transaction_id || "-"} />
      <InfoItem label="商户单号" value={request.order?.out_trade_no || "-"} />
      <InfoItem label="申请时间" value={formatDateTime(request.created_at)} />
      <InfoItem label="审核时间" value={formatDateTime(request.reviewed_at)} />
      <InfoItem label="退款单号" value={request.out_refund_no || "-"} />
      <InfoItem label="微信退款 ID" value={request.wechat_refund_id || "-"} />
      <InfoItem label="退款金额" value={formatFen(request.refund_amount_fen)} />
    </section>
  );
}

function InfoItem({
  label,
  value,
  badgeStatus,
}: {
  label: string;
  value: string;
  badgeStatus?: PlatformRechargeRefundStatus;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">
        {badgeStatus ? (
          <Badge variant={refundStatusVariant(badgeStatus)}>{value}</Badge>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function RequestTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{value}</p>
    </section>
  );
}

function formatFen(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `¥${(Number(value || 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function refundStatusLabel(status: PlatformRechargeRefundStatus) {
  const labels: Record<PlatformRechargeRefundStatus, string> = {
    pending_review: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    refunding: "退款中",
    refunded: "已退款",
    failed: "退款失败",
  };
  return labels[status];
}

function refundStatusVariant(status: PlatformRechargeRefundStatus) {
  if (status === "refunded") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  if (status === "pending_review" || status === "refunding") return "warning";
  return "secondary";
}
