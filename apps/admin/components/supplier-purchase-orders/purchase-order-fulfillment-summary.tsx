import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type {
  PurchaseOrderFulfillmentDetail,
  PurchaseOrderReceipt,
  PurchaseOrderReceiptPage,
  PurchaseOrderShipment,
  PurchaseOrderShipmentPage,
} from "./purchase-order-fulfillment-types";
import { formatPurchaseMoney } from "./purchase-order-rules";
import type { PurchaseOrderItem } from "./purchase-order-types";

const statusMeta = {
  confirmed: { label: "已确认", variant: "secondary" },
  partially_shipped: { label: "部分发货", variant: "outline" },
  shipped: { label: "已发货", variant: "secondary" },
  partially_received: { label: "部分收货", variant: "outline" },
  received: { label: "已收货", variant: "secondary" },
  received_with_variance: { label: "有差异已收货", variant: "danger" },
  cancelled: { label: "已取消", variant: "outline" },
} as const;

type TimelineEvent = {
  id: string;
  kind: "confirmed" | "shipment" | "receipt";
  label: "供应商确认" | "发货" | "收货";
  number: string;
  businessTime: string;
  detail: string;
  stableKey: string;
};

export function PurchaseOrderFulfillmentSummary({
  detail,
  shipments,
  receipts,
  purchaseOrderItems,
  historyBusy,
  onLoadMoreShipments,
  onLoadMoreReceipts,
}: {
  detail: PurchaseOrderFulfillmentDetail;
  shipments: PurchaseOrderShipmentPage;
  receipts: PurchaseOrderReceiptPage;
  purchaseOrderItems: PurchaseOrderItem[];
  historyBusy: "shipments" | "receipts" | null;
  onLoadMoreShipments: () => void;
  onLoadMoreReceipts: () => void;
}) {
  if (!detail.fulfillment) return null;
  const status = statusMeta[detail.fulfillment.status];
  const itemById = new Map(
    purchaseOrderItems.map((item) => [item.id, item]),
  );
  const timeline = buildTimeline(detail, shipments.list, receipts.list);

  return (
    <div className="min-w-0 max-w-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">履约汇总</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            供应商已确认 ·{" "}
            {formatDateTime(detail.fulfillment.confirmed_at)}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <div className="min-w-0 max-w-full rounded-md border">
        <Table containerClassName="min-w-0 max-w-full overflow-x-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-52">采购明细</TableHead>
              <TableHead className="text-right">采购</TableHead>
              <TableHead className="text-right">已发</TableHead>
              <TableHead className="text-right">已收</TableHead>
              <TableHead className="text-right">接受</TableHead>
              <TableHead className="text-right">拒收</TableHead>
              <TableHead className="text-right">接受含税金额</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.item_fulfillments.map((item) => {
              const purchaseItem = itemById.get(
                item.supplier_purchase_order_item_id,
              );
              return (
                <TableRow key={item.supplier_purchase_order_item_id}>
                  <TableCell>
                    <div
                      className="max-w-64 truncate font-medium"
                      title={purchaseItem?.product_name_snapshot ??
                        item.supplier_purchase_order_item_id}
                    >
                      {purchaseItem?.product_name_snapshot ??
                        item.supplier_purchase_order_item_id}
                    </div>
                    {purchaseItem ? (
                      <div
                        className="max-w-64 truncate text-xs text-muted-foreground"
                        title={`${purchaseItem.sku_name_snapshot} · ${purchaseItem.sku_code_snapshot}`}
                      >
                        {purchaseItem.sku_name_snapshot} ·{" "}
                        {purchaseItem.sku_code_snapshot}
                      </div>
                    ) : null}
                  </TableCell>
                  <QuantityCell value={item.ordered_quantity} />
                  <QuantityCell value={item.shipped_quantity} />
                  <QuantityCell value={item.received_quantity} />
                  <QuantityCell value={item.accepted_quantity} />
                  <QuantityCell value={item.rejected_quantity} />
                  <TableCell className="text-right tabular-nums">
                    {formatPurchaseMoney(item.accepted_total_amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Separator />
      <div className="min-w-0 max-w-full flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">履约时间线</h4>
          <p className="text-xs text-muted-foreground">
            当前显示发货 {shipments.list.length} /{" "}
            {shipments.pagination.total} 条，当前显示收货{" "}
            {receipts.list.length} / {receipts.pagination.total} 条
          </p>
        </div>
        <div className="min-w-0 max-w-full rounded-md border">
          <Table containerClassName="min-w-0 max-w-full overflow-x-auto">
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>业务时间</TableHead>
                <TableHead>单号</TableHead>
                <TableHead>摘要</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeline.map((event) => (
                <TableRow key={event.stableKey}>
                  <TableCell>
                    <Badge variant="outline">{event.label}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDateTime(event.businessTime)}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-48 truncate tabular-nums"
                      title={event.number}
                    >
                      {event.number}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-48 text-muted-foreground">
                    {event.detail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {shipments.pagination.page < shipments.pagination.totalPages ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={historyBusy !== null}
              onClick={onLoadMoreShipments}
            >
              {historyBusy === "shipments"
                ? <Spinner data-icon="inline-start" />
                : null}
              加载更多发货记录
            </Button>
          ) : null}
          {receipts.pagination.page < receipts.pagination.totalPages ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={historyBusy !== null}
              onClick={onLoadMoreReceipts}
            >
              {historyBusy === "receipts"
                ? <Spinner data-icon="inline-start" />
                : null}
              加载更多收货记录
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QuantityCell({ value }: { value: string }) {
  return (
    <TableCell className="text-right tabular-nums">{value}</TableCell>
  );
}

function buildTimeline(
  detail: PurchaseOrderFulfillmentDetail,
  shipments: PurchaseOrderShipment[],
  receipts: PurchaseOrderReceipt[],
): TimelineEvent[] {
  if (!detail.fulfillment) return [];
  const confirmation: TimelineEvent = {
    id: detail.fulfillment.id,
    kind: "confirmed",
    label: "供应商确认",
    number: "供应商已确认",
    businessTime: detail.fulfillment.confirmed_at,
    detail: [
      `确认人：${detail.fulfillment.confirmed_by_employee_id}`,
      detail.fulfillment.confirmation_remark,
    ].filter(Boolean).join(" · "),
    stableKey: `confirmed-${detail.fulfillment.id}`,
  };
  return [
    confirmation,
    ...shipments.map((shipment): TimelineEvent => ({
      id: shipment.id,
      kind: "shipment",
      label: "发货",
      number: shipment.shipment_no,
      businessTime: shipment.shipped_at,
      detail: [
        `${shipment.items.length} 个明细`,
        shipment.carrier_name,
        shipment.tracking_no,
        shipment.remark,
      ].filter(Boolean).join(" · "),
      stableKey: `shipment-${shipment.id}`,
    })),
    ...receipts.map((receipt): TimelineEvent => ({
      id: receipt.id,
      kind: "receipt",
      label: "收货",
      number: receipt.receipt_no,
      businessTime: receipt.received_at,
      detail: [
        `${receipt.items.length} 个明细`,
        receipt.remark,
      ].filter(Boolean).join(" · "),
      stableKey: `receipt-${receipt.id}`,
    })),
  ].sort((left, right) =>
    timestamp(right.businessTime) - timestamp(left.businessTime) ||
    left.stableKey.localeCompare(right.stableKey)
  );
}

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleString("zh-CN");
}
