"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw, Send, UploadCloud } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  getGoodsActionAvailability,
  getGoodsPhasePresentation,
} from "@/components/settings/platform-virtual-payment-goods-flow-data";
import type {
  PlatformVirtualGoodsLifecycleSnapshot,
  PlatformVirtualPaymentMapping,
} from "@/components/settings/platform-virtual-payment-settings-types";
import type { SafeVirtualPaymentMutationFeedback } from
  "@/components/settings/platform-virtual-payment-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

type GoodsAction = "upload" | "publish" | "validate" | "refresh";

export function PlatformVirtualPaymentGoodsFlow({
  environment,
  mapping,
  snapshot,
  loading,
  pollExhausted,
  readonly,
  feedback,
  onRefresh,
  onUpload,
  onPublish,
  onValidate,
}: {
  environment: BrandingVirtualPaymentEnvironment;
  mapping: PlatformVirtualPaymentMapping | null;
  snapshot: PlatformVirtualGoodsLifecycleSnapshot | null;
  loading: boolean;
  pollExhausted: boolean;
  readonly: boolean;
  feedback: SafeVirtualPaymentMutationFeedback | null;
  onRefresh: () => Promise<void>;
  onUpload: () => Promise<void>;
  onPublish: () => Promise<void>;
  onValidate: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<GoodsAction | null>(null);
  const availability = getGoodsActionAvailability(snapshot);
  const blocked = readonly || Boolean(pendingAction) || !mapping;

  async function runAction(action: GoodsAction, callback: () => Promise<void>) {
    if (blocked && action !== "refresh") return;
    setPendingAction(action);
    try {
      await callback();
    } finally {
      setPendingAction(null);
    }
  }

  const uploadPresentation = getGoodsPhasePresentation(
    "upload",
    snapshot?.upload.state ?? "not_started",
  );
  const publishPresentation = getGoodsPhasePresentation(
    "publish",
    snapshot?.publish.state ?? "not_started",
  );
  const validationPresentation = getValidationPresentation(
    mapping?.validation_status,
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${environment}-goods-flow-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${environment}-goods-flow-title`} className="text-sm font-semibold">
            微信商品流程
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            按上传、发布、校验顺序完成。刷新状态不会修改微信侧数据。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(pendingAction) || loading || !mapping}
          onClick={() => void runAction("refresh", onRefresh)}
        >
          {pendingAction === "refresh" || loading
            ? <Spinner data-icon="inline-start" />
            : <RefreshCw data-icon="inline-start" />}
          刷新微信状态
        </Button>
      </div>

      {feedback ? <GoodsFeedback feedback={feedback} /> : null}
      {pollExhausted ? (
        <StatusAlert tone="warning">
          自动刷新已停止，微信任务可能仍在处理，请稍后手动刷新状态。
        </StatusAlert>
      ) : null}

      <ol className="grid gap-3 md:grid-cols-3">
        <GoodsStep
          title="上传商品"
          description="提交当前商品名称、价格和图片。"
          badge={uploadPresentation}
        />
        <GoodsStep
          title="发布商品"
          description="上传完成后发布到当前环境。"
          badge={publishPresentation}
        />
        <GoodsStep
          title="校验映射"
          description="只读核对微信状态与本地映射。"
          badge={validationPresentation}
        />
      </ol>

      <div className="flex flex-wrap justify-end gap-2">
        {availability.upload && mapping ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={blocked || loading}>
                {pendingAction === "upload"
                  ? <Spinner data-icon="inline-start" />
                  : <UploadCloud data-icon="inline-start" />}
                上传商品到微信
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认上传商品到微信</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmationCopy("upload", environment, mapping)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  onClick={() => void runAction("upload", onUpload)}
                >
                  确认上传商品
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        {availability.publish && mapping ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={blocked || loading}>
                {pendingAction === "publish"
                  ? <Spinner data-icon="inline-start" />
                  : <Send data-icon="inline-start" />}
                发布微信商品
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认发布微信商品</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmationCopy("publish", environment, mapping)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  onClick={() => void runAction("publish", onPublish)}
                >
                  确认发布商品
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        {availability.validate ? (
          <Button
            type="button"
            disabled={blocked || loading}
            onClick={() => void runAction("validate", onValidate)}
          >
            {pendingAction === "validate"
              ? <Spinner data-icon="inline-start" />
              : <CheckCircle2 data-icon="inline-start" />}
            校验映射
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function GoodsStep({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge: ReturnType<typeof getGoodsPhasePresentation>;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </li>
  );
}

function GoodsFeedback({ feedback }: { feedback: SafeVirtualPaymentMutationFeedback }) {
  return (
    <StatusAlert title="微信商品操作未完成">
      <span>{feedback.message}</span>
      {feedback.code || feedback.requestId ? (
        <span className="mt-1 block break-all text-xs">
          {feedback.code ? `错误码：${feedback.code}` : null}
          {feedback.code && feedback.requestId ? "；" : null}
          {feedback.requestId ? `Request-ID：${feedback.requestId}` : null}
        </span>
      ) : null}
    </StatusAlert>
  );
}

function getValidationPresentation(status?: "pending" | "valid" | "invalid") {
  if (status === "valid") return { label: "校验通过", variant: "success" as const };
  if (status === "invalid") return { label: "校验失败", variant: "danger" as const };
  return { label: "待校验", variant: "secondary" as const };
}

function confirmationCopy(
  action: "upload" | "publish",
  environment: BrandingVirtualPaymentEnvironment,
  mapping: PlatformVirtualPaymentMapping,
) {
  const verb = action === "upload" ? "上传" : "发布";
  const risk = environment === "production"
    ? "这是生产环境微信侧写操作，提交后会影响正式商品状态。"
    : "这是沙箱环境微信侧写操作。";
  return `${risk} 将${verb}商品 ${mapping.provider_product_id}，价格 ${formatFen(mapping.expected_amount_fen)} 元。`;
}

function formatFen(value: number) {
  return (value / 100).toFixed(2);
}
