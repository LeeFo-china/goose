"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { buildPromotionPublishBody } from "./platform-service-promotion-form-data";
import { PlatformServicePromotionFormButton } from "./platform-service-promotion-form";
import { formatPromotionDateTime, formatPromotionFen, getPromotionPhaseMeta, getPromotionVersionStatusMeta } from "./platform-service-promotion-rules";
import type { PlatformServicePromotionListItem, PlatformServicePromotionPage, PlatformServicePromotionPricePreview, PlatformServicePromotionVersion } from "./platform-service-promotion-types";

type ConfirmAction = "publish" | "stop" | null;

export function PlatformServicePromotionDetail({ promotion, serverTime, page, pageSize, open, onOpenChange, canManage }: {
  promotion: PlatformServicePromotionListItem;
  serverTime: string;
  page: number;
  pageSize: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [confirmationPromotion, setConfirmationPromotion] = useState<PlatformServicePromotionListItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const phase = getPromotionPhaseMeta(promotion.phase);
  const canEdit = canManage && !promotion.archived_at;
  const canRequestPublish = canEdit && promotion.draft?.publication_status === "draft"
    && Boolean(promotion.draft.starts_at && promotion.draft.ends_at);
  const canPublish = canManage && confirmationPromotion !== null && isPromotionPublishable(confirmationPromotion);
  const canStop = canManage && promotion.published?.publication_status === "published"
    && (promotion.phase === "active" || promotion.phase === "scheduled");
  const validReason = reason.trim().length > 0 && reason.trim().length <= 500;

  function changeOpen(nextOpen: boolean) {
    if (!pendingRef.current) onOpenChange(nextOpen);
  }

  async function requestConfirmation(action: Exclude<ConfirmAction, null>) {
    if (pendingRef.current) return;
    setError("");
    setReason("");
    if (action === "stop") {
      setConfirmationPromotion(promotion);
      setConfirmAction(action);
      return;
    }
    if (!canRequestPublish) return;
    pendingRef.current = true;
    setPending(true);
    setConfirmationPromotion(null);
    try {
      const freshPromotion = await loadPromotionPreview(promotion.id, page, pageSize);
      if (!freshPromotion) {
        setError("当前页找不到该活动，请刷新列表后重试。");
        return;
      }
      if (!isPromotionPublishable(freshPromotion)) {
        setError("活动已变化，或三档套餐暂不可售。请刷新列表并检查草稿、排期和套餐价格。");
        return;
      }
      setConfirmationPromotion(freshPromotion);
      setConfirmAction("publish");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取最新活动价格失败");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function runAction() {
    if (pendingRef.current) return;
    if (!confirmAction || !confirmationPromotion || (confirmAction === "publish" ? !canPublish : !canStop)) return;
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
          ? `/platform/billing/service-promotions/${confirmationPromotion.id}/publish`
          : `/platform/billing/service-promotions/${confirmationPromotion.id}/stop`,
        {
          method: "POST",
          body: JSON.stringify(confirmAction === "publish"
            ? buildPromotionPublishBody(confirmationPromotion, crypto.randomUUID())
            : {
              expected_version: confirmationPromotion.version,
              idempotency_key: crypto.randomUUID(),
              reason: reason.trim(),
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
            <Button type="button" size="sm" disabled={pending || !canRequestPublish} onClick={() => void requestConfirmation("publish")}>
              {pending && !confirmAction ? <Spinner data-icon="inline-start" /> : null}
              {pending && !confirmAction ? "正在读取价格" : "发布活动"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || !canStop} onClick={() => void requestConfirmation("stop")}>停止活动</Button>
          </div>
        ) : null}
        {canEdit && !canRequestPublish ? <p className="text-xs text-muted-foreground">发布需有待发布草稿和完整排期；确认前将读取最新套餐价格。</p> : null}
        {error && !confirmAction ? <StatusAlert>{error}</StatusAlert> : null}
        <Separator />
        <VersionSection title="当前草稿" version={promotion.draft} />
        <Separator />
        <VersionSection title="已发布版本" version={promotion.published} />
        <Separator />
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{promotion.draft ? "草稿价格预览" : "已发布价格预览"}</h3>
          <PromotionPricePreview prices={promotion.price_preview} />
        </section>
        <Dialog open={confirmAction !== null} onOpenChange={(nextOpen) => { if (!pendingRef.current && !nextOpen) setConfirmAction(null); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto" aria-busy={pending}>
            <DialogHeader>
              <DialogTitle>{confirmAction === "publish" ? "确认发布活动" : "确认停止活动"}</DialogTitle>
              <DialogDescription>
                {confirmAction === "publish" ? "只影响发布后创建的新订单，已有订单继续使用订单快照。发布后到开始时间自动生效，到结束时间自动恢复日常价。" : "停止后新订单不再使用该活动优惠；历史订单保留原下单价格。请填写停止原因。"}
              </DialogDescription>
            </DialogHeader>
            {confirmAction === "publish" && confirmationPromotion ? (
              <div className="flex flex-col gap-3">
                <p className="break-all text-sm font-medium">{confirmationPromotion.draft?.title} · 活动版本 v{confirmationPromotion.version}</p>
                <p className="text-sm tabular-nums">{formatPromotionDateTime(confirmationPromotion.draft?.starts_at)} 至 {formatPromotionDateTime(confirmationPromotion.draft?.ends_at)}</p>
                {confirmationPromotion.phase === "active" && confirmationPromotion.published ? (
                  <StatusAlert tone="warning">新内容和价格将立即影响后续新订单</StatusAlert>
                ) : null}
                <PromotionPricePreview prices={confirmationPromotion.price_preview} />
              </div>
            ) : (
              <Field>
                <FieldLabel htmlFor={reasonId}>停止原因</FieldLabel>
                <Textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} maxLength={500} rows={3} required />
              </Field>
            )}
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => { if (!pendingRef.current) setConfirmAction(null); }}>取消</Button>
                {confirmAction === "stop" ? (
                  <Button type="button" variant="destructive" disabled={pending || !validReason || !canStop} onClick={(event) => { event.preventDefault(); void runAction(); }}>
                    {pending ? <Spinner data-icon="inline-start" /> : null}确认停止活动
                  </Button>
                ) : (
                  <Button type="button" disabled={pending || !canPublish} onClick={(event) => { event.preventDefault(); void runAction(); }}>
                    {pending ? <Spinner data-icon="inline-start" /> : null}确认发布活动
                  </Button>
                )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              {price ? <><span className="text-muted-foreground">标价 {formatPromotionFen(price.list_amount_fen)}</span><span className="text-muted-foreground">日常价 {formatPromotionFen(price.base_amount_fen)}</span><span className="font-medium">活动价 {formatPromotionFen(price.effective_amount_fen)}</span></> : <span className="text-muted-foreground">暂无可售套餐价格</span>}
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

export async function loadPromotionPreview(promotionId: string, page: number, pageSize: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await requestBackendJson<PlatformServicePromotionPage>(
    `/platform/billing/service-promotions?${query}`,
    { method: "GET", cache: "no-store", fallbackMessage: "读取最新活动价格失败" },
  );
  return result.list.find((item) => item.id === promotionId);
}

function isPromotionPublishable(promotion: PlatformServicePromotionListItem) {
  return !promotion.archived_at && promotion.draft?.publication_status === "draft"
    && Boolean(promotion.draft.starts_at && promotion.draft.ends_at)
    && [1, 2, 3].every((term) => promotion.price_preview.some((price) => price.term_years === term));
}
