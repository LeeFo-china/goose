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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  confirmPurchaseOrderFulfillment,
  loadPurchaseOrderFulfillment,
  loadPurchaseOrderReceipts,
  loadPurchaseOrderShipments,
} from "./purchase-order-fulfillment-api";
import { fulfillmentActions } from "./purchase-order-fulfillment-rules";
import { PurchaseOrderFulfillmentSummary } from "./purchase-order-fulfillment-summary";
import {
  appendPageById,
  beginFrozenCommand,
  canAbandonFrozenCommand,
  clearFrozenCommand,
  commandRetryMessage,
  createLatestRequestGuard,
  type FulfillmentLoadState,
  isUncertainCommandFailure,
  markFrozenCommandInFlight,
  markFrozenCommandUncertain,
  refreshAfterCommand,
} from "./purchase-order-fulfillment-ui-state";
import { useFrozenCommandSession } from "./purchase-order-fulfillment-command-state";
import type {
  PurchaseOrderFulfillmentConfirmPayload,
  PurchaseOrderFulfillmentDetail,
  PurchaseOrderReceiptPage,
  PurchaseOrderShipmentPage,
} from "./purchase-order-fulfillment-types";
import { PurchaseOrderReceiptDialog } from "./purchase-order-receipt-dialog";
import { PurchaseOrderShipmentDialog } from "./purchase-order-shipment-dialog";
import type {
  PurchaseOrderItem,
  PurchaseOrderWithReferences,
} from "./purchase-order-types";

const emptyDetail: PurchaseOrderFulfillmentDetail = {
  fulfillment: null,
  item_fulfillments: [],
};
const emptyShipments: PurchaseOrderShipmentPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const emptyReceipts: PurchaseOrderReceiptPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function PurchaseOrderFulfillmentPanel({
  order,
  purchaseOrderItems,
  canManage,
  onOrderChanged,
  onLoadStateChange,
}: {
  order: PurchaseOrderWithReferences;
  purchaseOrderItems: PurchaseOrderItem[];
  canManage: boolean;
  onOrderChanged: () => Promise<number | null>;
  onLoadStateChange: (state: FulfillmentLoadState) => void;
}) {
  const [detail, setDetail] = useState(emptyDetail);
  const [shipments, setShipments] = useState(emptyShipments);
  const [receipts, setReceipts] = useState(emptyReceipts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRemark, setConfirmRemark] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmCommand, saveConfirmCommand] = useFrozenCommandSession<
    PurchaseOrderFulfillmentConfirmPayload,
    SupplierCommandAttempt
  >(
    order.id,
    "confirm",
  );
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [historyBusy, setHistoryBusy] =
    useState<"shipments" | "receipts" | null>(null);
  const requestGuard = useRef(createLatestRequestGuard());
  const historyRequestGuard = useRef(createLatestRequestGuard());
  const handledOrderVersion = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const isLatest = requestGuard.current.start();
    historyRequestGuard.current.invalidate();
    setLoading(true);
    setHistoryBusy(null);
    setError(null);
    setHistoryError(null);
    onLoadStateChange({ loaded: false, error: false, status: null });
    try {
      const [nextDetail, nextShipments, nextReceipts] = await Promise.all([
        loadPurchaseOrderFulfillment(order.id),
        loadPurchaseOrderShipments(order.id, 1, 20),
        loadPurchaseOrderReceipts(order.id, 1, 20),
      ]);
      if (!isLatest()) return false;
      setDetail(nextDetail);
      setShipments(nextShipments);
      setReceipts(nextReceipts);
      if (nextDetail.fulfillment) {
        saveConfirmCommand(clearFrozenCommand(), order.id);
      }
      onLoadStateChange({
        loaded: true,
        error: false,
        status: nextDetail.fulfillment?.status ?? null,
      });
      return true;
    } catch (caught) {
      if (!isLatest()) return false;
      setError(errorMessage(caught, "采购履约事实加载失败"));
      onLoadStateChange({ loaded: false, error: true, status: null });
      return false;
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [onLoadStateChange, order.id, order.version, saveConfirmCommand]);

  useEffect(() => {
    if (handledOrderVersion.current === order.version) {
      handledOrderVersion.current = null;
      return;
    }
    handledOrderVersion.current = null;
    requestGuard.current.invalidate();
    historyRequestGuard.current.invalidate();
    setDetail(emptyDetail);
    setShipments(emptyShipments);
    setReceipts(emptyReceipts);
    setHistoryBusy(null);
    void reload();
  }, [order.version, reload]);

  useEffect(() => () => {
    requestGuard.current.invalidate();
    historyRequestGuard.current.invalidate();
  }, []);

  const actions = fulfillmentActions(detail, canManage, order.status);

  async function handleSaved() {
    const version = await onOrderChanged();
    if (version === null) return false;
    handledOrderVersion.current = version;
    return await reload();
  }

  useEffect(() => {
    if (confirmCommand) {
      setConfirmRemark(confirmCommand.payload.remark ?? "");
    }
  }, [confirmCommand]);

  async function loadMoreHistory(kind: "shipments" | "receipts") {
    if (historyBusy) return;
    const current = kind === "shipments" ? shipments : receipts;
    if (current.pagination.page >= current.pagination.totalPages) return;
    const isLatest = historyRequestGuard.current.start();
    setHistoryBusy(kind);
    setHistoryError(null);
    try {
      const nextPage = kind === "shipments"
        ? await loadPurchaseOrderShipments(
          order.id,
          current.pagination.page + 1,
          current.pagination.pageSize,
        )
        : await loadPurchaseOrderReceipts(
          order.id,
          current.pagination.page + 1,
          current.pagination.pageSize,
        );
      if (!isLatest()) return;
      if (kind === "shipments") {
        setShipments((value) =>
          appendPageById(value, nextPage as PurchaseOrderShipmentPage)
        );
      } else {
        setReceipts((value) =>
          appendPageById(value, nextPage as PurchaseOrderReceiptPage)
        );
      }
    } catch (caught) {
      if (isLatest()) {
        setHistoryError(errorMessage(caught, "履约历史加载失败"));
      }
    } finally {
      if (isLatest()) setHistoryBusy(null);
    }
  }

  async function handleConfirm() {
    if (confirmBusy) return;
    let activeCommand = confirmCommand?.phase === "uncertain"
      ? markFrozenCommandInFlight(confirmCommand)
      : null;
    if (!activeCommand) {
      const confirmedAt = new Date().toISOString();
      const payload: PurchaseOrderFulfillmentConfirmPayload = {
        expected_version: order.version,
        confirmed_at: confirmedAt,
        remark: confirmRemark.trim() || null,
      };
      const attempt = resolveSupplierCommandAttempt(null, {
        scope: "purchase-order:confirm-fulfillment",
        resourcePath: order.id,
        payload,
      });
      activeCommand = beginFrozenCommand(attempt, payload, order.id);
    }
    saveConfirmCommand(activeCommand);
    setConfirmBusy(true);
    setError(null);
    try {
      await confirmPurchaseOrderFulfillment(
        activeCommand.resourcePath,
        activeCommand.payload,
        activeCommand.attempt.idempotencyKey,
      );
      saveConfirmCommand(clearFrozenCommand(), activeCommand.resourcePath);
      setConfirmOpen(false);
      toast.success("供应商确认事实已记录");
    } catch (caught) {
      const message = errorMessage(caught, "记录供应商确认失败");
      setError(message);
      toast.error(commandRetryMessage(caught, message));
      saveConfirmCommand(isUncertainCommandFailure(caught)
        ? markFrozenCommandUncertain(activeCommand)
        : clearFrozenCommand(), activeCommand.resourcePath);
      if (errorCode(caught).includes("VERSION_CONFLICT")) {
        await Promise.all([reload(), onOrderChanged()]);
      }
      setConfirmBusy(false);
      return;
    }
    setConfirmBusy(false);
    const refreshed = await refreshAfterCommand(handleSaved);
    if (!refreshed) toast.error("确认事实已提交，但刷新失败，请手动刷新");
  }

  function handleConfirmOpen(nextOpen: boolean) {
    if (confirmBusy) return;
    setConfirmOpen(nextOpen);
    if (nextOpen && !confirmCommand) {
      setConfirmRemark("");
    }
  }

  function abandonConfirmAttempt() {
    if (!canAbandonFrozenCommand(confirmCommand)) return;
    saveConfirmCommand(clearFrozenCommand(), confirmCommand.resourcePath);
    setConfirmRemark("");
    setError(null);
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-md border p-4"
      aria-labelledby="purchase-order-fulfillment-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="purchase-order-fulfillment-title"
            className="text-base font-semibold"
          >
            采购履约
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            由租户员工代供应商录入确认事实，再登记发货与收货。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void reload()}
        >
          {loading ? <Spinner data-icon="inline-start" /> : null}
          刷新履约
        </Button>
      </div>
      {error ? (
        <StatusAlert>
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void reload()}
          >
            重试加载
          </Button>
        </StatusAlert>
      ) : null}
      {!canManage ? (
        <StatusAlert tone="warning">
          当前账号仅可查看履约事实，不能确认、发货或收货。
        </StatusAlert>
      ) : null}
      {historyError ? <StatusAlert>{historyError}</StatusAlert> : null}
      {error ? null : loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail.fulfillment ? (
        <PurchaseOrderFulfillmentSummary
          detail={detail}
          shipments={shipments}
          receipts={receipts}
          purchaseOrderItems={purchaseOrderItems}
          historyBusy={historyBusy}
          onLoadMoreShipments={() => void loadMoreHistory("shipments")}
          onLoadMoreReceipts={() => void loadMoreHistory("receipts")}
        />
      ) : (
        <Empty className="min-h-44 border">
          <EmptyHeader>
            <EmptyTitle>尚未记录供应商确认</EmptyTitle>
            <EmptyDescription>
              租户员工代供应商记录确认后才能登记发货，不修改采购快照。
            </EmptyDescription>
          </EmptyHeader>
          {actions.includes("confirm") ? (
            <EmptyContent>
              <Button type="button" onClick={() => handleConfirmOpen(true)}>
                记录供应商确认
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      )}
      {!loading && detail.fulfillment && actions.length ? (
        <div className="flex flex-wrap justify-end gap-2">
          {actions.includes("ship") ? (
            <Button type="button" onClick={() => setShipmentOpen(true)}>
              登记发货
            </Button>
          ) : null}
          {actions.includes("receive") ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setReceiptOpen(true)}
            >
              登记收货
            </Button>
          ) : null}
        </div>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={handleConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>记录供应商确认？</AlertDialogTitle>
            <AlertDialogDescription>
              租户员工代供应商录入该事实，并以当前采购单版本创建履约快照。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {confirmCommand?.phase === "uncertain" ? (
            <StatusAlert tone="warning">
              上次请求结果不确定，重试会复用原请求；放弃后将创建新请求。
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={abandonConfirmAttempt}
              >
                放弃本次尝试
              </Button>
            </StatusAlert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="purchase-order-confirm-remark">
                供应商确认备注
              </FieldLabel>
              <Textarea
                id="purchase-order-confirm-remark"
                value={confirmRemark}
                maxLength={500}
                disabled={confirmBusy || confirmCommand !== null}
                placeholder="可选"
                onChange={(event) => setConfirmRemark(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>返回</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
            >
              {confirmBusy ? <Spinner data-icon="inline-start" /> : null}
              记录供应商确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {detail.fulfillment ? (
        <>
          <PurchaseOrderShipmentDialog
            open={shipmentOpen}
            orderId={order.id}
            fulfillment={detail.fulfillment}
            items={detail.item_fulfillments}
            purchaseOrderItems={purchaseOrderItems}
            onOpenChange={setShipmentOpen}
            onSaved={handleSaved}
          />
          <PurchaseOrderReceiptDialog
            open={receiptOpen}
            orderId={order.id}
            fulfillment={detail.fulfillment}
            items={detail.item_fulfillments}
            purchaseOrderItems={purchaseOrderItems}
            onOpenChange={setReceiptOpen}
            onSaved={handleSaved}
          />
        </>
      ) : null}
    </section>
  );
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "";
  }
  return typeof error.code === "string" ? error.code : "";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
