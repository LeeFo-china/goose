"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { PlatformServicePromotionFormButton } from "./platform-service-promotion-form";
import { formatPromotionDateTime, formatPromotionFen, getPromotionPhaseMeta, getPromotionVersionStatusMeta } from "./platform-service-promotion-rules";
import type { PlatformServicePromotionListItem, PlatformServicePromotionPricePreview, PlatformServicePromotionVersion } from "./platform-service-promotion-types";

type ConfirmAction = "publish" | "stop" | null;

export function PlatformServicePromotionDetail({ promotion, serverTime, open, onOpenChange, canManage }: {
  promotion: PlatformServicePromotionListItem;
  serverTime: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const phase = getPromotionPhaseMeta(promotion.phase);
  const canEdit = canManage && !promotion.archived_at;
  const hasCompletePreview = [1, 2, 3].every((term) => promotion.price_preview.some((price) => price.term_years === term));
  const canPublish = canEdit && promotion.draft?.publication_status === "draft"
    && Boolean(promotion.draft.starts_at && promotion.draft.ends_at) && hasCompletePreview;
  const canStop = canManage && promotion.published?.publication_status === "published"
    && (promotion.phase === "active" || promotion.phase === "scheduled");
  const validReason = reason.trim().length > 0 && reason.trim().length <= 500;

  function changeOpen(nextOpen: boolean) {
    if (!pendingRef.current) onOpenChange(nextOpen);
  }

  function requestConfirmation(action: ConfirmAction) {
    if (pendingRef.current) return;
    setError("");
    setReason("");
    setConfirmAction(action);
  }

  async function runAction() {
    if (pendingRef.current) return;
    if (!confirmAction || (confirmAction === "publish" ? !canPublish : !canStop)) return;
    if (confirmAction === "stop" && !validReason) {
      setError("请填写 1 至 500 个字符的停止原因");
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await requestBackendJson(
        confirmAction === "publish"
          ? `/platform/billing/service-promotions/${promotion.id}/publish`
          : `/platform/billing/service-promotions/${promotion.id}/stop`,
        {
          method: "POST",
          body: JSON.stringify({
            expected_version: promotion.version,
            idempotency_key: crypto.randomUUID(),
            ...(confirmAction === "stop" ? { reason: reason.trim() } : {}),
          }),
          fallbackMessage: confirmAction === "publish" ? "发布活动失败" : "停止活动失败",
        },
      );
      setConfirmAction(null);
      router.refresh();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "活动操作失败");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto" aria-busy={pending}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-5">
            <span className="break-all">{(promotion.draft ?? promotion.published)?.name ?? "限时活动"}</span>
            <Badge variant={phase.variant}>{phase.label}</Badge>
            <Badge variant="outline">v{promotion.version}</Badge>
          </DialogTitle>
          <DialogDescription>查看运营内容、草稿与发布版本，确认活动价格和时间。</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">状态以服务器返回为准，数据时间：{formatPromotionDateTime(serverTime)}</p>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <PlatformServicePromotionFormButton promotion={promotion} disabled={pending || !canEdit} onSaved={() => onOpenChange(false)} />
            <Button type="button" size="sm" disabled={pending || !canPublish} onClick={() => requestConfirmation("publish")}>发布活动</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || !canStop} onClick={() => requestConfirmation("stop")}>停止活动</Button>
          </div>
        ) : null}
        {canEdit && !canPublish ? <p className="text-xs text-muted-foreground">发布需有待发布草稿、完整排期及三档套餐价格预览。</p> : null}
        <Separator />
        <VersionSection title="当前草稿" version={promotion.draft} />
        <Separator />
        <VersionSection title="已发布版本" version={promotion.published} />
        <Separator />
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{promotion.draft ? "草稿价格预览" : "已发布价格预览"}</h3>
          <PromotionPricePreview prices={promotion.price_preview} />
        </section>
        <AlertDialog open={confirmAction !== null} onOpenChange={(nextOpen) => { if (!pendingRef.current && !nextOpen) setConfirmAction(null); }}>
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto" aria-busy={pending}>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmAction === "publish" ? "确认发布活动" : "确认停止活动"}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction === "publish" ? "发布后按活动时间向新订单提供优惠。请核对服务器返回的三档价格。" : "停止后新订单不再使用该活动优惠；历史订单保留原下单价格。请填写停止原因。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmAction === "publish" ? (
              <div className="flex flex-col gap-3">
                <p className="break-all text-sm font-medium">{promotion.draft?.title}</p>
                <p className="text-sm tabular-nums">{formatPromotionDateTime(promotion.draft?.starts_at)} 至 {formatPromotionDateTime(promotion.draft?.ends_at)}</p>
                <PromotionPricePreview prices={promotion.price_preview} />
              </div>
            ) : (
              <Field>
                <FieldLabel htmlFor={reasonId}>停止原因</FieldLabel>
                <Textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} maxLength={500} rows={3} required />
              </Field>
            )}
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
              <AlertDialogAction asChild>
                {confirmAction === "stop" ? (
                  <Button type="button" variant="destructive" disabled={pending || !validReason || !canStop} onClick={(event) => { event.preventDefault(); void runAction(); }}>
                    {pending ? <Spinner data-icon="inline-start" /> : null}确认停止活动
                  </Button>
                ) : (
                  <Button type="button" disabled={pending || !canPublish} onClick={(event) => { event.preventDefault(); void runAction(); }}>
                    {pending ? <Spinner data-icon="inline-start" /> : null}确认发布活动
                  </Button>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function PromotionPricePreview({ prices }: { prices: PlatformServicePromotionPricePreview[] }) {
  const terms = [{ years: 1, label: "1 年套餐" }, { years: 2, label: "2 年套餐" }, { years: 3, label: "3 年套餐" }];
  return (
    <dl className="divide-y text-sm">
      {terms.map(({ years, label }) => {
        const price = prices.find((item) => item.term_years === years);
        return (
          <div key={years} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <dt>{label}</dt>
            <dd className="flex flex-wrap gap-3 tabular-nums">
              {price ? <><span className="text-muted-foreground">套餐价 {formatPromotionFen(price.base_amount_fen)}</span><span className="font-medium">活动价 {formatPromotionFen(price.effective_amount_fen)}</span></> : <span className="text-muted-foreground">暂无可售套餐价格</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function VersionSection({ title, version }: { title: string; version: PlatformServicePromotionVersion | null }) {
  const status = version ? getPromotionVersionStatusMeta(version.publication_status) : null;
  return (
    <section className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{title}</h3>
        {version && status ? <Badge variant={status.variant}>{status.label} v{version.version_no}</Badge> : null}
      </div>
      {version ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <VersionFact label="活动名称" value={version.name} />
            <VersionFact label="活动角标" value={version.badge_text} />
            <VersionFact label="活动标题" value={version.title} />
            <VersionFact label="折扣" value={`${version.discount_rate_basis_points / 1000} 折`} />
            <VersionFact label="开始时间" value={formatPromotionDateTime(version.starts_at)} />
            <VersionFact label="结束时间" value={formatPromotionDateTime(version.ends_at)} />
          </dl>
          <p className="whitespace-pre-wrap break-words">{version.summary}</p>
          {version.rules_text ? <div><p className="mb-1 text-xs text-muted-foreground">活动规则</p><p className="whitespace-pre-wrap break-words">{version.rules_text}</p></div> : null}
          {version.stop_reason ? <div><p className="mb-1 text-xs text-muted-foreground">停止原因</p><p className="whitespace-pre-wrap break-words">{version.stop_reason}</p></div> : null}
        </>
      ) : <p className="text-muted-foreground">暂无{title}。</p>}
    </section>
  );
}

function VersionFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words tabular-nums">{value}</dd></div>;
}
