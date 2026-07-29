"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList } from "lucide-react";

import {
  formatPurchaseMoney,
  purchaseOrderActions,
  purchaseOrderStatusMeta,
} from "./purchase-order-rules";
import type { PurchaseOrderWithReferences } from "./purchase-order-types";

export function PurchaseOrderList({
  orders,
  loading,
  canManage,
  onOpen,
  onEdit,
}: {
  orders: PurchaseOrderWithReferences[];
  loading: boolean;
  canManage: boolean;
  onOpen: (order: PurchaseOrderWithReferences) => void;
  onEdit: (order: PurchaseOrderWithReferences) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>暂无采购单</EmptyTitle>
          <EmptyDescription>
            调整筛选条件，或新建一张项目采购单。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>采购单号</TableHead>
          <TableHead>项目</TableHead>
          <TableHead>供应商</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="text-right">含税总额</TableHead>
          <TableHead>更新时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const status = purchaseOrderStatusMeta[order.status];
          const actions = purchaseOrderActions(order.status, canManage);
          return (
            <TableRow key={order.id}>
              <TableCell className="font-mono font-medium">
                {order.order_no}
              </TableCell>
              <TableCell className="max-w-48 truncate">
                {order.project.name}
              </TableCell>
              <TableCell className="max-w-52 truncate">
                {order.supplier.name}
              </TableCell>
              <TableCell>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPurchaseMoney(order.total_amount, order.currency)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(order.updated_at)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpen(order)}
                  >
                    查看
                  </Button>
                  {actions.includes("edit") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(order)}
                    >
                      编辑
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
