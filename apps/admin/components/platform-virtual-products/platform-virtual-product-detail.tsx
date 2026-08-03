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
  | "activate"
  | "suspend"
  | "archive"
  | `${VirtualPaymentEnvironment}:upload`
  | `${VirtualPaymentEnvironment}:publish`
  | `${VirtualPaymentEnvironment}:validate`
  | null;

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
  }: { showLoading?: boolean } = {}) {
    if (showLoading) setPendingAction("load");
    setError("");
    try {
      setDetail(await requestBackendJson<PlatformVirtualProductDetailData>(
        `/platform/virtual-products/${product.id}`,
        { fallbackMessage: "虚拟商品详情加载失败" },
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "虚拟商品详情加载失败");
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
      setNotice("虚拟商品状态已更新。");
      await loadDetail({ showLoading: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "虚拟商品状态调整失败");
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
      setNotice("微信商品状态已刷新。");
      await loadDetail({ showLoading: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "微信虚拟商品操作失败");
      await loadDetail({ showLoading: false });
    } finally {
      setPendingAction(null);
    }
  }

  const current = detail ?? product;
  const status = productStatusMeta[current.status];
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
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}

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
                {canManage ? <PlatformVirtualProductFormButton product={detail} onSaved={loadDetail} /> : null}
                {canManage && detail.status === "draft" ? (
                  <Button type="button" size="sm" onClick={() => void runTransition("activate")}>
                    {pendingAction === "activate" ? <Spinner data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
                    启用商品
                  </Button>
                ) : null}
                {canManage && detail.status === "active" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void runTransition("suspend")}>
                    {pendingAction === "suspend" ? <Spinner data-icon="inline-start" /> : <PauseCircle data-icon="inline-start" />}
                    暂停商品
                  </Button>
                ) : null}
                {canManage && detail.status !== "archived" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void runTransition("archive")}>
                    {pendingAction === "archive" ? <Spinner data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
                    归档商品
                  </Button>
                ) : null}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadDetail()}>
                <RefreshCw data-icon="inline-start" />
                刷新详情
              </Button>
            </div>

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
          disabled={!canPublish || !mapping}
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
          disabled={!canPublish || !mapping}
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
          disabled={!canPublish || !mapping}
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
