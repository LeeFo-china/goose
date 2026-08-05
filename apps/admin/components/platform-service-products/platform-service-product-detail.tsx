"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RefreshCw, Send } from "lucide-react";

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

import { PlatformServiceProductFormButton } from "./platform-service-product-form";
import {
  formatDateTime,
  formatDiscount,
  formatFen,
  getProductStatusMeta,
} from "./platform-service-product-rules";
import type {
  PlatformServiceProductListItem,
  PlatformServiceProductVersionView,
} from "./platform-service-product-types";

type PendingAction = "publish" | "archive" | "refresh" | null;

export function PlatformServiceProductDetail({
  product,
  open,
  onOpenChange,
  canManage,
}: {
  product: PlatformServiceProductListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const status = getProductStatusMeta(product.status);
  const isBusy = pendingAction !== null;

  async function refreshPage() {
    setPendingAction("refresh");
    setError("");
    setNotice("");
    router.refresh();
    setNotice("套餐列表已刷新。");
    setPendingAction(null);
  }

  async function runAction(action: "publish" | "archive") {
    setPendingAction(action);
    setError("");
    setNotice("");
    const path = action === "publish"
      ? `/platform/billing/service-products/${product.id}/publish`
      : `/platform/billing/service-products/${product.id}/archive`;
    try {
      await requestBackendJson(path, {
        method: "POST",
        body: JSON.stringify({
          expected_version: product.version,
          idempotency_key: crypto.randomUUID(),
        }),
        fallbackMessage: action === "publish" ? "发布套餐失败" : "归档套餐失败",
      });
      router.refresh();
      setNotice(action === "publish" ? "发布套餐已提交，请刷新查看最新版本。" : "套餐已归档。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "套餐操作失败");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {product.draft.title}
            <Badge variant={status.variant}>{status.label}</Badge>
            {product.has_unpublished_changes ? (
              <Badge variant="warning">有未发布修改</Badge>
            ) : (
              <Badge variant="success">已发布同步</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            管理平台技术服务套餐的草稿、发布版本、价格、服务范围和服务条款。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-4">
          <Fact label="套餐编码" value={product.code} />
          <Fact label="服务年限" value={`${product.draft.term_years} 年`} />
          <Fact label="标价" value={formatFen(product.draft.list_amount_fen)} />
          <Fact label="实付价" value={formatFen(product.draft.amount_fen)} />
          <Fact label="折扣" value={formatDiscount(product.draft.price_rate_basis_points)} />
          <Fact label="草稿版本" value={`v${product.version}`} />
          <Fact
            label="发布状态"
            value={product.published ? `已发布 v${product.published.version}` : "未发布"}
          />
          <Fact label="更新时间" value={formatDateTime(product.updated_at)} />
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <PlatformServiceProductFormButton
                product={product}
                onSaved={() => {
                  router.refresh();
                }}
              />
            ) : null}
            {canManage && product.status !== "archived" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void runAction("publish")}
                disabled={isBusy}
              >
                {pendingAction === "publish" ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                发布套餐
              </Button>
            ) : null}
            {canManage && product.status !== "archived" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runAction("archive")}
                disabled={isBusy}
              >
                {pendingAction === "archive" ? <Spinner data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
                归档套餐
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void refreshPage()}
            disabled={isBusy}
          >
            {pendingAction === "refresh" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新列表
          </Button>
        </div>

        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}

        <Separator />
        <div className="grid gap-4 lg:grid-cols-2">
          <VersionCard title="当前草稿" version={product.draft} />
          <VersionCard title="已发布版本" version={product.published} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionCard({
  title,
  version,
}: {
  title: string;
  version: PlatformServiceProductVersionView | null;
}) {
  if (!version) {
    return (
      <section className="rounded-md border bg-background p-4">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">当前没有已发布版本。</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <Badge variant="outline">v{version.version}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="套餐名称" value={version.title} />
        <Fact label="服务年限" value={`${version.term_years} 年`} />
        <Fact label="标价" value={formatFen(version.list_amount_fen)} />
        <Fact label="实付价" value={formatFen(version.amount_fen)} />
        <Fact label="折扣" value={formatDiscount(version.price_rate_basis_points)} />
        <Fact label="条款版本" value={`v${version.terms_version}`} />
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">服务范围</div>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {version.service_scope.map((item) => (
            <li key={item} className="rounded-md bg-muted/35 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">服务条款</div>
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/35 px-3 py-2 text-sm leading-6">
          {version.terms_content}
        </p>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
