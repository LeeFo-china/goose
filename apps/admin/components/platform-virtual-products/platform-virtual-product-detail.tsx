"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  UploadCloud,
} from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { requestBackendJson } from "@/lib/backend-client";
import type { VirtualPaymentEnvironment } from "@gooes/domain";

import { PlatformVirtualProductFormButton } from "./platform-virtual-product-form";
import {
  formatFen,
  formatVirtualProductDate,
  getGrantRule,
  getProductTypeLabel,
  goodsStateMeta,
  productStatusMeta,
  summarizeGrantRule,
  validationStatusMeta,
  virtualEnvironmentLabels,
} from "./platform-virtual-product-rules";
import type {
  PlatformVirtualProductDetailData,
  PlatformVirtualProductListItem,
  PlatformVirtualProductMapping,
} from "./platform-virtual-product-types";

type PendingAction =
  | "load"
  | "refresh"
  | "activate"
  | "suspend"
  | "archive"
  | `${VirtualPaymentEnvironment}:upload`
  | `${VirtualPaymentEnvironment}:publish`
  | `${VirtualPaymentEnvironment}:validate`
  | null;

type LoadDetailOptions = {
  showLoading?: boolean;
  clearError?: boolean;
};

export function PlatformVirtualProductDetail({
  product,
  open,
  onOpenChange,
  canManage,
  canPublish,
}: {
  product: PlatformVirtualProductListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [detail, setDetail] = useState<PlatformVirtualProductDetailData | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadDetail({
    showLoading = detail === null,
    clearError = true,
  }: LoadDetailOptions = {}) {
    if (showLoading) setPendingAction("load");
    if (clearError) setError("");
    try {
      const nextDetail = await requestBackendJson<PlatformVirtualProductDetailData>(
        `/platform/virtual-products/${product.id}`,
        { fallbackMessage: "虚拟商品详情加载失败" },
      );
      setDetail(nextDetail);
      return nextDetail;
    } catch (caught) {
      if (clearError) {
        setError(caught instanceof Error ? caught.message : "虚拟商品详情加载失败");
      }
      return null;
    } finally {
      if (showLoading) setPendingAction(null);
    }
  }

  useEffect(() => {
    if (open) void loadDetail();
  }, [open, product.id]);

  async function runTransition(action: "activate" | "suspend" | "archive") {
    if (!detail) return;
    setPendingAction(action);
    setError("");
    setNotice("");
    try {
      await requestBackendJson(`/platform/virtual-products/${detail.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ version: detail.version }),
        fallbackMessage: "虚拟商品状态调整失败",
      });
      await loadDetail({ showLoading: false, clearError: false });
      setNotice("虚拟商品状态已更新。");
    } catch (caught) {
      const actionError = caught instanceof Error ? caught.message : "虚拟商品状态调整失败";
      await loadDetail({ showLoading: false, clearError: false });
      setError(actionError);
    } finally {
      setPendingAction(null);
    }
  }

  async function runChannelAction(
    environment: VirtualPaymentEnvironment,
    action: "upload" | "publish" | "validate",
  ) {
    if (!detail) return;
    setPendingAction(`${environment}:${action}`);
    setError("");
    setNotice("");
    const path = action === "upload"
      ? `/platform/virtual-products/${product.id}/channel-mappings/${environment}/goods/upload`
      : action === "publish"
      ? `/platform/virtual-products/${product.id}/channel-mappings/${environment}/goods/publish`
      : `/platform/virtual-products/${product.id}/channel-mappings/${environment}/validate`;
    try {
      await requestBackendJson(path, {
        method: "POST",
        body: JSON.stringify({ version: detail.version }),
        fallbackMessage: "微信虚拟商品操作失败",
      });
      await requestBackendJson(
        `/platform/virtual-products/${product.id}/channel-mappings/${environment}`,
        { fallbackMessage: "微信状态刷新失败" },
      );
      await loadDetail({ showLoading: false, clearError: false });
      setNotice("微信商品状态已刷新。");
    } catch (caught) {
      const actionError = caught instanceof Error ? caught.message : "微信虚拟商品操作失败";
      await loadDetail({ showLoading: false, clearError: false });
      setError(actionError);
    } finally {
      setPendingAction(null);
    }
  }

  async function refreshDetail() {
    setPendingAction("refresh");
    setError("");
    setNotice("");
    const refreshed = await loadDetail({ showLoading: false });
    if (refreshed) setNotice("详情已刷新。");
    setPendingAction(null);
  }

  const current = detail ?? product;
  const status = productStatusMeta[current.status];
  const isBusy = pendingAction !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {current.name}
            <Badge variant={status.variant}>{status.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            查看商品事实、系统生成渠道商品 ID、微信上传发布状态和自动发放规则。
          </DialogDescription>
        </DialogHeader>

        {pendingAction === "load" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner data-icon="inline-start" />
            正在加载虚拟商品详情
          </div>
        ) : null}
        {!detail && error ? <StatusAlert>{error}</StatusAlert> : null}
        {!detail && notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}

        {detail ? (
          <div className="flex flex-col gap-5">
            <section className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-4">
              <Fact label="系统编码" value={detail.code} />
              <Fact label="类型" value={getProductTypeLabel(detail.product_type)} />
              <Fact label="售价" value={formatFen(detail.amount_fen)} />
              <Fact label="更新时间" value={formatVirtualProductDate(detail.updated_at)} />
              <div className="md:col-span-4">
                <Fact label="自动发放" value={summarizeGrantRule(getGrantRule(detail))} />
              </div>
            </section>

            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {canManage ? (
                  <PlatformVirtualProductFormButton
                    product={detail}
                    onSaved={async () => {
                      await loadDetail({ showLoading: false });
                    }}
                  />
                ) : null}
                {canManage && detail.status === "draft" ? (
                  <Button type="button" size="sm" onClick={() => void runTransition("activate")} disabled={isBusy}>
                    {pendingAction === "activate" ? <Spinner data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
                    启用商品
                  </Button>
                ) : null}
                {canManage && detail.status === "active" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void runTransition("suspend")} disabled={isBusy}>
                    {pendingAction === "suspend" ? <Spinner data-icon="inline-start" /> : <PauseCircle data-icon="inline-start" />}
                    暂停商品
                  </Button>
                ) : null}
                {canManage && detail.status !== "archived" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void runTransition("archive")} disabled={isBusy}>
                    {pendingAction === "archive" ? <Spinner data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
                    归档商品
                  </Button>
                ) : null}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void refreshDetail()} disabled={isBusy}>
                {pendingAction === "refresh" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                刷新详情
              </Button>
            </div>
            <DetailOperationFeedback
              pendingAction={pendingAction}
              error={error}
              notice={notice}
            />

            <Separator />
            <section className="grid gap-4 lg:grid-cols-2">
              {(["sandbox", "production"] as const).map((environment) => (
                <ChannelCard
                  key={environment}
                  environment={environment}
                  productVersion={detail.version}
                  mapping={findMapping(detail.mappings, environment)}
                  canPublish={canPublish}
                  pendingAction={pendingAction}
                  onAction={runChannelAction}
                />
              ))}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailOperationFeedback({
  pendingAction,
  error,
  notice,
}: {
  pendingAction: PendingAction;
  error: string;
  notice: string;
}) {
  if (pendingAction && pendingAction !== "load") {
    return (
      <div className="min-h-9 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
        <span className="inline-flex items-center gap-2">
          <Spinner data-icon="inline-start" />
          操作中：{getPendingActionLabel(pendingAction)}
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-9 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" aria-live="assertive">
        {error}
      </div>
    );
  }
  if (notice) {
    return (
      <div className="min-h-9 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success" aria-live="polite">
        {notice}
      </div>
    );
  }
  return <div className="min-h-9" aria-live="polite" />;
}

function ChannelCard({
  environment,
  productVersion,
  mapping,
  canPublish,
  pendingAction,
  onAction,
}: {
  environment: VirtualPaymentEnvironment;
  productVersion: number;
  mapping: PlatformVirtualProductMapping | null;
  canPublish: boolean;
  pendingAction: PendingAction;
  onAction: (
    environment: VirtualPaymentEnvironment,
    action: "upload" | "publish" | "validate",
  ) => Promise<void>;
}) {
  const validation = mapping
    ? validationStatusMeta[mapping.validation_status]
    : validationStatusMeta.pending;
  const upload = mapping ? goodsStateMeta[mapping.upload_state] : goodsStateMeta.not_started;
  const publish = mapping ? goodsStateMeta[mapping.publish_state] : goodsStateMeta.not_started;
  const synced = mapping?.synced_product_version === productVersion;
  const isBusy = pendingAction !== null;

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{virtualEnvironmentLabels[environment]}</h3>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            渠道商品 ID：{mapping?.provider_product_id ?? "未生成"}
          </p>
        </div>
        <Badge variant={validation.variant}>{validation.label}</Badge>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact label="上传状态" value={<Badge variant={upload.variant}>{upload.label}</Badge>} />
        <Fact label="发布状态" value={<Badge variant={publish.variant}>{publish.label}</Badge>} />
        <Fact label="渠道状态" value={mapping?.channel.status === "active" ? "已启用" : "未启用"} />
        <Fact label="同步版本" value={synced ? "已同步当前版本" : "需重新同步"} />
        <Fact label="AppID" value={mapping?.channel.app_id || "-"} />
        <Fact label="OfferID" value={mapping?.channel.offer_id || "-"} />
      </div>
      {mapping?.last_error_summary ? (
        <StatusAlert>{mapping.last_error_summary}</StatusAlert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isBusy || !canPublish || !mapping}
          onClick={() => void onAction(environment, "upload")}
        >
          {pendingAction === `${environment}:upload`
            ? <Spinner data-icon="inline-start" />
            : <UploadCloud data-icon="inline-start" />}
          上传商品到微信
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy || !canPublish || !mapping}
          onClick={() => void onAction(environment, "publish")}
        >
          {pendingAction === `${environment}:publish`
            ? <Spinner data-icon="inline-start" />
            : <Send data-icon="inline-start" />}
          发布微信商品
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy || !canPublish || !mapping}
          onClick={() => void onAction(environment, "validate")}
        >
          {pendingAction === `${environment}:validate`
            ? <Spinner data-icon="inline-start" />
            : <CheckCircle2 data-icon="inline-start" />}
          校验映射
        </Button>
      </div>
    </div>
  );
}

function getPendingActionLabel(action: Exclude<PendingAction, null | "load">) {
  if (action === "refresh") return "刷新详情";
  if (action === "activate") return "启用商品";
  if (action === "suspend") return "暂停商品";
  if (action === "archive") return "归档商品";
  if (action.endsWith(":upload")) return "上传商品到微信";
  if (action.endsWith(":publish")) return "发布微信商品";
  return "校验映射";
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function findMapping(
  mappings: PlatformVirtualProductMapping[] | undefined,
  environment: VirtualPaymentEnvironment,
) {
  return mappings?.find((item) => item.channel.environment === environment) ?? null;
}
