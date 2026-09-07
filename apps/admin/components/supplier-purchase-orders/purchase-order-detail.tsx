"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  cancelPurchaseOrder,
  loadPurchaseOrder,
  loadPurchaseOrderFinancialSummary,
  loadPurchaseOrderItems,
  submitPurchaseOrder,
} from "./purchase-order-api";
import {
  PurchaseOrderFinancialSummary,
} from "./purchase-order-financial-summary";
import {
  failedFinancialSummaryState,
  loadedFinancialSummaryState,
  loadingFinancialSummaryState,
  unloadedFinancialSummaryState,
} from "./purchase-order-financial-summary-state";
import {
  PurchaseOrderFulfillmentPanel,
} from "./purchase-order-fulfillment-panel";
import {
  canCancelWithFulfillment,
  createLatestRequestGuard,
  type FulfillmentLoadState,
  unloadedFulfillmentState,
} from "./purchase-order-fulfillment-ui-state";
import {
  commandErrorMessage,
  canManagePurchaseOrder,
  purchaseOrderDestinationLabel,
  formatPurchaseMoney,
  purchaseOrderActions,
  purchaseOrderStatusMeta,
} from "./purchase-order-rules";
import type {
  PurchaseOrderItem,
  PurchaseOrderItemPage,
  PurchaseOrderWithReferences,
} from "./purchase-order-types";
import { PurchaseOrderItemTable } from "./purchase-order-item-table";

export function PurchaseOrderDetail({
  open,
  order,
  canViewPurchaseOrders,
  canManage,
  canViewWarehouses = false,
  canManageWarehouses = false,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  order: PurchaseOrderWithReferences | null;
  canViewPurchaseOrders: boolean;
  canManage: boolean;
  canViewWarehouses?: boolean;
  canManageWarehouses?: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState(order);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [itemPagination, setItemPagination] = useState<PurchaseOrderItemPage['pagination']>({ page: 1, pageSize: 100, total: 0, totalPages: 0 });
  const [loadingMoreItems, setLoadingMoreItems] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const itemRequestGuard = useRef(createLatestRequestGuard());
  // Coordinate full refresh and page appends synchronously, before React rerenders.
  const itemRefreshInFlight = useRef(false);
  const canRead = canViewPurchaseOrders && (order?.destination_type !== "warehouse" || canViewWarehouses);
  const [loading, setLoading] = useState(false);
  const [hasLoadedDetail, setHasLoadedDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [commandAttempt, setCommandAttempt] =
    useState<SupplierCommandAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [financialSummaryState, setFinancialSummaryState] = useState(
    unloadedFinancialSummaryState,
  );
  const [fulfillmentState, setFulfillmentState] =
    useState<FulfillmentLoadState>(unloadedFulfillmentState);
  const requestGuard = useRef(createLatestRequestGuard());
  const financialSummaryRequestGuard = useRef(createLatestRequestGuard());

  const reloadFinancialSummary = useCallback(async () => {
    const isLatest = financialSummaryRequestGuard.current.start();
    if (!order || !canRead) return;
    setFinancialSummaryState(loadingFinancialSummaryState);
    try {
      const summary = await loadPurchaseOrderFinancialSummary(order.id);
      if (isLatest()) {
        setFinancialSummaryState(loadedFinancialSummaryState(summary));
      }
    } catch (caught) {
      if (isLatest()) {
        setFinancialSummaryState(failedFinancialSummaryState(
          errorMessage(caught, "采购单财务摘要加载失败"),
        ));
      }
    }
  }, [canRead, order]);

  const reload = useCallback(async () => {
    const isLatest = requestGuard.current.start();
    if (!order || !canRead) return null;
    itemRefreshInFlight.current = true;
    itemRequestGuard.current.invalidate();
    setLoadingMoreItems(false);
    setItemError(null);
    setLoading(true);
    setError(null);
    setFulfillmentState(unloadedFulfillmentState);
    try {
      const [latest, itemPage] = await Promise.all([
        loadPurchaseOrder(order.id),
        loadPurchaseOrderItems(order.id),
      ]);
      if (!isLatest()) return null;
      setCurrent(latest);
      setItems(itemPage.list);
      setItemPagination(itemPage.pagination);
      setHasLoadedDetail(true);
      return latest.version;
    } catch (caught) {
      if (!isLatest()) return null;
      setError(errorMessage(caught, "采购单详情加载失败"));
      return null;
    } finally {
      if (isLatest()) {
        itemRefreshInFlight.current = false;
        setLoading(false);
      }
    }
  }, [order, canRead]);

  async function loadMoreItems() {
    if (!order || !canRead || loading || itemRefreshInFlight.current || loadingMoreItems || itemPagination.page >= itemPagination.totalPages) return;
    const isLatest = itemRequestGuard.current.start();
    setLoadingMoreItems(true); setItemError(null);
    try {
      const next = await loadPurchaseOrderItems(order.id, itemPagination.page + 1);
      if (!isLatest()) return;
      setItems((previous) => Array.from(new Map([...previous, ...next.list].map((item) => [item.id, item])).values()));
      setItemPagination(next.pagination);
    } catch (caught) {
      if (isLatest()) setItemError(errorMessage(caught, "更多采购明细加载失败"));
    } finally {
      if (isLatest()) setLoadingMoreItems(false);
    }
  }

  useEffect(() => {
    requestGuard.current.invalidate();
    itemRequestGuard.current.invalidate();
    financialSummaryRequestGuard.current.invalidate();
    setCurrent(order);
    setItems([]);
    setFinancialSummaryState(unloadedFinancialSummaryState);
    setHasLoadedDetail(false);
    setFulfillmentState(unloadedFulfillmentState);
    setCancelReason("");
    setCommandAttempt(null);
    if (open && canRead) {
      void reload();
      if (canViewPurchaseOrders) void reloadFinancialSummary();
    }
    return () => {
      requestGuard.current.invalidate();
      itemRequestGuard.current.invalidate();
      itemRefreshInFlight.current = false;
      financialSummaryRequestGuard.current.invalidate();
    };
  }, [
    canViewPurchaseOrders,
    canRead,
    open,
    order,
    reload,
    reloadFinancialSummary,
  ]);

  const handleFulfillmentChanged = useCallback(async () => {
    const version = await reload();
    if (canViewPurchaseOrders) void reloadFinancialSummary();
    onChanged();
    return version;
  }, [canViewPurchaseOrders, onChanged, reload, reloadFinancialSummary]);

  async function runCommand(action: "submit" | "cancel") {
    if (!current || busy || !canRead || !purchaseOrderActions(current.status, canManage, current.destination_type, canManageWarehouses).includes(action)) return;
    setBusy(true);
    setError(null);
    const payload = action === "submit"
      ? { expected_version: current.version }
      : {
        expected_version: current.version,
        reason: cancelReason.trim(),
      };
    const nextAttempt = resolveSupplierCommandAttempt(commandAttempt, {
      scope: `purchase-order:${action}`,
      resourcePath: current.id,
      payload,
    });
    setCommandAttempt(nextAttempt);
    try {
      if (action === "submit") {
        await submitPurchaseOrder(
          current.id,
          current.version,
          nextAttempt.idempotencyKey,
        );
        toast.success("采购单已提交");
      } else {
        await cancelPurchaseOrder(
          current.id,
          current.version,
          cancelReason.trim(),
          nextAttempt.idempotencyKey,
        );
        toast.success("采购单已取消");
      }
      await reload();
      if (canViewPurchaseOrders) void reloadFinancialSummary();
      setCommandAttempt(null);
      onChanged();
    } catch (caught) {
      const code = errorCode(caught);
      setError(commandErrorMessage(
        code,
        errorMessage(caught, "采购单操作失败"),
      ));
      if (code === "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT") {
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  const actions = current
    ? purchaseOrderActions(current.status, canManage && canRead, current.destination_type, canManageWarehouses)
    : [];
  const visibleActions = actions.filter((action) =>
    action !== "cancel" || canCancelWithFulfillment(fulfillmentState)
  );
  const status = current ? purchaseOrderStatusMeta[current.status] : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] min-w-0 max-w-5xl grid-cols-[minmax(0,1fr)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>采购单详情</DialogTitle>
          <DialogDescription>
            查看采购去向、供应商、价格快照和采购明细。
          </DialogDescription>
        </DialogHeader>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {!canRead ? <StatusAlert>当前账号没有该采购去向的查看权限。</StatusAlert> : !current || !hasLoadedDetail ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="min-w-0 max-w-full grid gap-3 rounded-md border p-4 md:grid-cols-3">
              <Fact label="采购单号" value={current.order_no} mono />
              <Fact label="采购去向" value={purchaseOrderDestinationLabel(current)} />
              <Fact label="供应商" value={current.supplier.name} />
              <Fact
                label="状态"
                value={status
                  ? <Badge variant={status.variant}>{status.label}</Badge>
                  : "-"}
              />
              <Fact
                label="计价时间"
                value={formatDateTime(current.priced_at)}
              />
              <Fact label="版本" value={String(current.version)} mono />
              <Fact
                label="未税金额"
                value={formatPurchaseMoney(current.subtotal_amount)}
                mono
              />
              <Fact
                label="税额"
                value={formatPurchaseMoney(current.tax_amount)}
                mono
              />
              <Fact
                label="含税总额"
                value={formatPurchaseMoney(current.total_amount)}
                mono
              />
            </div>
            {current.destination_type === "warehouse" && <p className="text-sm text-muted-foreground">仓库补货由审批后的采购申请生成，不计入项目预算或项目成本。</p>}
            <PurchaseOrderItemTable items={items} pagination={itemPagination} loading={loading || loadingMoreItems} error={itemError} onLoadMore={() => void loadMoreItems()} />
            {canViewPurchaseOrders ? (
              <PurchaseOrderFinancialSummary
                summary={financialSummaryState.summary}
                isLoading={financialSummaryState.isLoading}
                error={financialSummaryState.error}
              />
            ) : null}
            <PurchaseOrderFulfillmentPanel
              order={current}
              purchaseOrderItems={items}
              canManage={canRead && canManagePurchaseOrder(current, canManage, canManageWarehouses)}
              onOrderChanged={handleFulfillmentChanged}
              onLoadStateChange={setFulfillmentState}
            />
          </>
        )}
        <DialogFooter className="min-w-0 max-w-full">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          {visibleActions.includes("submit") ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" disabled={busy}>提交采购单</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认提交采购单？</AlertDialogTitle>
                  <AlertDialogDescription>
                    提交时会重新校验当前供应价格；提交后采购事实不可编辑。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>返回</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    onClick={() => void runCommand("submit")}
                  >
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    确认提交
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {visibleActions.includes("cancel") ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={busy}>
                  取消采购单
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认取消采购单？</AlertDialogTitle>
                  <AlertDialogDescription>
                    取消后不可恢复，请填写可审计的取消原因。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Field>
                  <FieldLabel htmlFor="purchase-order-cancel-reason">
                    取消原因
                  </FieldLabel>
                  <Textarea
                    id="purchase-order-cancel-reason"
                    value={cancelReason}
                    maxLength={500}
                    onChange={(event) => setCancelReason(event.target.value)}
                  />
                </Field>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>返回</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy || cancelReason.trim().length < 2}
                    onClick={() => void runCommand("cancel")}
                  >
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    确认取消
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-sm",
        mono && "font-mono tabular-nums",
      )}>
        {value}
      </div>
    </div>
  );
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
    ? error.code
    : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
