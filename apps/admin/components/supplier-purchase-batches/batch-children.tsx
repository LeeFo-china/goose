"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  loadBatchItems,
  loadBatchOrders,
  loadBatchRequisitions,
} from "./batch-api";
import { batchError } from "./batch-rules";
import { batchMoney, BatchPager, BatchReadState } from "./batch-page-parts";
import type {
  BatchAccess,
  BatchItem,
  BatchOrder,
  BatchRequisition,
  PageData,
} from "./batch-types";

type ChildResult = { kind: "items"; page: PageData<BatchItem> } | {
  kind: "requisitions";
  page: PageData<BatchRequisition>;
} | { kind: "orders"; page: PageData<BatchOrder> };
const childStatus: Record<string, string> = {
  draft: "草稿",
  pending_approval: "审批中",
  approved: "已批准",
  rejected: "已驳回",
  cancelled: "已取消",
  ordered: "已生成采购单",
  converted: "已转采购单",
  submitted: "已提交",
};
export function BatchChildren(
  { id, kind, access }: {
    id: string;
    kind: ChildResult["kind"];
    access: BatchAccess;
  },
) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ChildResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const request: Promise<ChildResult> = kind === "items"
      ? loadBatchItems(id, page, 20, controller.signal).then((data) => ({
        kind,
        page: data,
      }))
      : kind === "orders"
      ? loadBatchOrders(id, page, controller.signal).then((data) => ({
        kind,
        page: data,
      }))
      : loadBatchRequisitions(id, page, controller.signal).then((data) => ({
        kind,
        page: data,
      }));
    request.then((next) => {
      if (!controller.signal.aborted) {
        if (page > Math.max(1, next.page.pagination.totalPages)) {
          setPage(Math.max(1, next.page.pagination.totalPages));
          return;
        }
        setResult(next);
      }
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, kind, page, retry]);
  const current = !loading && !error && result?.kind === kind ? result : null;
  return (
    <div className="space-y-4">
      <BatchReadState
        loading={loading}
        error={error}
        empty={!current?.page.list.length}
        onRetry={() => setRetry((value) => value + 1)}
      />
      {current?.page.list.length
        ? (
          <Table className="min-w-[640px]">
            <TableHeader>
              {kind === "items"
                ? (
                  <TableRow>
                    <TableHead>商品 / SKU</TableHead>
                    <TableHead>供应商</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">冻结单价</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                  </TableRow>
                )
                : (
                  <TableRow>
                    <TableHead>单据编号</TableHead>
                    <TableHead>
                      {kind === "orders" ? "供应商" : "拆单轮次"}
                    </TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                  </TableRow>
                )}
            </TableHeader>
            <TableBody>
              {current.kind === "items"
                ? current.page.list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.product_name_snapshot} · {item.sku_name_snapshot}
                      <div className="text-xs text-muted-foreground">
                        {item.sku_code_snapshot}
                      </div>
                    </TableCell>
                    <TableCell>{item.supplier_name_snapshot}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity} {item.purchase_unit_name_snapshot}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {batchMoney(item.unit_price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {batchMoney(item.line_total_amount)}
                    </TableCell>
                  </TableRow>
                ))
                : current.kind === "requisitions"
                ? current.page.list.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.request_no}</TableCell>
                    <TableCell>第 {request.split_generation} 轮</TableCell>
                    <TableCell>
                      {childStatus[request.status] ?? "状态待确认"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {batchMoney(request.total_amount)}
                    </TableCell>
                  </TableRow>
                ))
                : current.page.list.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      {access.canViewOrders &&
                          (order.destination_type !== "warehouse" ||
                            access.canViewWarehouses)
                        ? (
                          <Button asChild variant="link" className="h-auto p-0">
                            <Link
                              href={`/supplier-purchase-orders?purchase_order_id=${
                                encodeURIComponent(order.id)
                              }`}
                            >
                              {order.order_no}
                            </Link>
                          </Button>
                        )
                        : order.order_no}
                    </TableCell>
                    <TableCell>{order.supplier.name}</TableCell>
                    <TableCell>
                      {childStatus[order.status] ?? "状态待确认"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {batchMoney(order.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )
        : null}
      <BatchPager
        pagination={current?.page.pagination}
        loading={loading}
        onPage={setPage}
      />
    </div>
  );
}
