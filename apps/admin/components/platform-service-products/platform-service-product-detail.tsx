"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, RefreshCw, Send } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
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
  getNextPublishedVersion,
  getPlatformServiceProductChangedFields,
} from "./platform-service-product-action-rules";
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
type ConfirmAction = "publish" | "archive" | null;

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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const status = getProductStatusMeta(product.status);
  const isBusy = pendingAction !== null;
  const changedFields = getPlatformServiceProductChangedFields(product);
  const nextPublishedVersion = getNextPublishedVersion(product);

  function changeConfirmation(
    action: Exclude<ConfirmAction, null>,
    nextOpen: boolean,
  ) {
    if (isBusy) return;
    setConfirmAction(nextOpen ? action : null);
    setError("");
    if (nextOpen) setNotice("");
  }

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
      setConfirmAction(null);
      setNotice(action === "publish" ? "发布套餐已提交，请刷新查看最新版本。" : "套餐已归档。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "套餐操作失败");
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmProductAction(
    event: MouseEvent<HTMLButtonElement>,
    action: "publish" | "archive",
  ) {
    event.preventDefault();
    await runAction(action);
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
              <AlertDialog
                open={confirmAction === "publish"}
                onOpenChange={(nextOpen) => changeConfirmation("publish", nextOpen)}
              >
                <AlertDialogTrigger asChild>
                  <Button type="button" size="sm" disabled={isBusy}>
                    <Send data-icon="inline-start" />
                    发布套餐
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认发布套餐</AlertDialogTitle>
                    <AlertDialogDescription>
                      发布后，小程序将读取 v{nextPublishedVersion} 作为新的购买版本。
                      价格和条款变化只影响新订单，已有订单继续使用下单时的快照。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="grid gap-3 rounded-md border bg-muted/25 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{product.draft.title}</span>
                      <Badge variant="outline">
                        草稿 v{product.version} → 发布 v{nextPublishedVersion}
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Fact label="标价" value={formatFen(product.draft.list_amount_fen)} />
                      <Fact label="实付价" value={formatFen(product.draft.amount_fen)} />
                      <Fact label="条款版本" value={`v${product.draft.terms_version}`} />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">本次变更</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {changedFields.length > 0 ? (
                          changedFields.map((field) => (
                            <Badge key={field} variant="secondary">
                              {field}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            草稿与当前发布版本没有配置差异
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {error ? <StatusAlert>{error}</StatusAlert> : null}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isBusy}>取消</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        type="button"
                        disabled={isBusy}
                        onClick={(event) => void confirmProductAction(event, "publish")}
                      >
                        {pendingAction === "publish" ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Send data-icon="inline-start" />
                        )}
                        确认发布套餐
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {canManage && product.status !== "archived" ? (
              <AlertDialog
                open={confirmAction === "archive"}
                onOpenChange={(nextOpen) => changeConfirmation("archive", nextOpen)}
              >
                <AlertDialogTrigger asChild>
                  <Button type="button" size="sm" variant="outline" disabled={isBusy}>
                    <Archive data-icon="inline-start" />
                    归档套餐
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认归档套餐</AlertDialogTitle>
                    <AlertDialogDescription>
                      归档后，小程序将不再展示和销售该套餐。
                      历史订单与已经生成的发布版本仍会保留，当前后台没有恢复归档套餐的操作入口。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="rounded-md border bg-destructive/5 p-4 text-sm">
                    <div className="font-medium">{product.draft.title}</div>
                    <div className="mt-1 text-muted-foreground">
                      套餐编码 {product.code}，当前实付价 {formatFen(product.draft.amount_fen)}
                    </div>
                  </div>
                  {error ? <StatusAlert>{error}</StatusAlert> : null}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isBusy}>取消</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isBusy}
                        onClick={(event) => void confirmProductAction(event, "archive")}
                      >
                        {pendingAction === "archive" ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Archive data-icon="inline-start" />
                        )}
                        确认归档套餐
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
