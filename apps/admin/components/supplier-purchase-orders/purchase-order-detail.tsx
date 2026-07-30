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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  cancelPurchaseOrder,
  loadPurchaseOrder,
  loadPurchaseOrderItems,
  submitPurchaseOrder,
} from "./purchase-order-api";
import {
  PurchaseOrderFulfillmentPanel,
} from "./purchase-order-fulfillment-panel";
import {
  commandErrorMessage,
  formatPurchaseMoney,
  purchaseOrderActions,
  purchaseOrderStatusMeta,
} from "./purchase-order-rules";
import type {
  PurchaseOrderItem,
  PurchaseOrderWithReferences,
} from "./purchase-order-types";

export function PurchaseOrderDetail({
  open,
  order,
  canManage,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  order: PurchaseOrderWithReferences | null;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState(order);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [commandAttempt, setCommandAttempt] =
    useState<SupplierCommandAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    try {
      const [latest, itemPage] = await Promise.all([
        loadPurchaseOrder(order.id),
        loadPurchaseOrderItems(order.id),
      ]);
      setCurrent(latest);
      setItems(itemPage.list);
    } catch (caught) {
      setError(errorMessage(caught, "采购单详情加载失败"));
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    setCurrent(order);
    setCancelReason("");
    setCommandAttempt(null);
    if (open) void reload();
  }, [open, order, reload]);

  const handleFulfillmentChanged = useCallback(async () => {
    await reload();
    await onChanged();
  }, [onChanged, reload]);

  async function runCommand(action: "submit" | "cancel") {
    if (!current || busy) return;
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
    ? purchaseOrderActions(current.status, canManage)
    : [];
  const status = current ? purchaseOrderStatusMeta[current.status] : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>采购单详情</DialogTitle>
          <DialogDescription>
            查看项目、供应商、价格快照和采购明细。
          </DialogDescription>
        </DialogHeader>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {loading || !current ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
              <Fact label="采购单号" value={current.order_no} mono />
              <Fact label="项目" value={current.project.name} />
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品 / SKU</TableHead>
                    <TableHead>单位</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">单价</TableHead>
                    <TableHead className="text-right">含税金额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">
                          {item.product_name_snapshot}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.sku_name_snapshot} · {item.sku_code_snapshot}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.purchase_unit_symbol_snapshot}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPurchaseMoney(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPurchaseMoney(item.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PurchaseOrderFulfillmentPanel
              order={current}
              purchaseOrderItems={items}
              canManage={canManage}
              onOrderChanged={handleFulfillmentChanged}
            />
          </>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          {actions.includes("submit") ? (
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
          {actions.includes("cancel") ? (
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
    <div>
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
