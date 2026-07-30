"use client";

import { useCallback, useEffect, useState } from "react";
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
import type {
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
}: {
  order: PurchaseOrderWithReferences;
  purchaseOrderItems: PurchaseOrderItem[];
  canManage: boolean;
  onOrderChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState(emptyDetail);
  const [shipments, setShipments] = useState(emptyShipments);
  const [receipts, setReceipts] = useState(emptyReceipts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRemark, setConfirmRemark] = useState("");
  const [confirmSubmittedAt, setConfirmSubmittedAt] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmAttempt, setConfirmAttempt] =
    useState<SupplierCommandAttempt | null>(null);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDetail, nextShipments, nextReceipts] = await Promise.all([
        loadPurchaseOrderFulfillment(order.id),
        loadPurchaseOrderShipments(order.id, 1, 20),
        loadPurchaseOrderReceipts(order.id, 1, 20),
      ]);
      setDetail(nextDetail);
      setShipments(nextShipments);
      setReceipts(nextReceipts);
    } catch (caught) {
      setError(errorMessage(caught, "采购履约事实加载失败"));
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    setDetail(emptyDetail);
    setShipments(emptyShipments);
    setReceipts(emptyReceipts);
    void reload();
  }, [reload]);

  const actions = fulfillmentActions(detail, canManage, order.status);

  async function handleSaved() {
    await Promise.all([reload(), onOrderChanged()]);
  }

  async function handleConfirm() {
    if (confirmBusy) return;
    const confirmedAt = confirmSubmittedAt || new Date().toISOString();
    setConfirmSubmittedAt(confirmedAt);
    const payload = {
      expected_version: order.version,
      confirmed_at: confirmedAt,
      remark: confirmRemark.trim() || null,
    };
    const nextAttempt = resolveSupplierCommandAttempt(confirmAttempt, {
      scope: "purchase-order:confirm-fulfillment",
      resourcePath: order.id,
      payload,
    });
    setConfirmAttempt(nextAttempt);
    setConfirmBusy(true);
    setError(null);
    try {
      await confirmPurchaseOrderFulfillment(
        order.id,
        payload,
        nextAttempt.idempotencyKey,
      );
      setConfirmAttempt(null);
      setConfirmOpen(false);
      toast.success("供应商确认事实已记录");
      await handleSaved();
    } catch (caught) {
      const message = errorMessage(caught, "记录供应商确认失败");
      setError(message);
      toast.error(retryMessage(caught, message));
      if (shouldClearAttempt(caught)) setConfirmAttempt(null);
      if (errorCode(caught).includes("VERSION_CONFLICT")) {
        await Promise.all([reload(), onOrderChanged()]);
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  function handleConfirmOpen(nextOpen: boolean) {
    if (confirmBusy) return;
    setConfirmOpen(nextOpen);
    if (nextOpen) {
      setConfirmRemark("");
      setConfirmSubmittedAt("");
      setConfirmAttempt(null);
    }
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
      {error ? null : loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail.fulfillment ? (
        <PurchaseOrderFulfillmentSummary
          detail={detail}
          shipments={shipments.list}
          receipts={receipts.list}
          purchaseOrderItems={purchaseOrderItems}
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
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="purchase-order-confirm-remark">
                供应商确认备注
              </FieldLabel>
              <Textarea
                id="purchase-order-confirm-remark"
                value={confirmRemark}
                maxLength={500}
                disabled={confirmBusy}
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

function isUncertainFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return true;
  }
  return typeof error.status !== "number" || error.status >= 500;
}

function shouldClearAttempt(error: unknown) {
  return !isUncertainFailure(error);
}

function retryMessage(error: unknown, message: string) {
  return isUncertainFailure(error)
    ? `${message}，可直接重试，系统会复用本次请求标识`
    : message;
}
