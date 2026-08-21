import { CircleAlert, ReceiptText } from "lucide-react";

import { getPaymentStatusMeta, getServiceStatusMeta } from "@/components/platform-service-orders/platform-service-order-rules";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatServiceAccessDateTime } from "./service-access-display";
import {
  formatServiceAmountFen,
  type ServiceOrder,
} from "./service-purchase-api";

export function ServiceOrderList({
  orders,
  loading,
  error,
  onRetry,
}: {
  orders: readonly ServiceOrder[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">正在加载最近订单</p>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>服务订单加载失败</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            重试
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (orders.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptText aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>暂无服务订单</EmptyTitle>
          <EmptyDescription>
            当前企业还没有技术服务订单。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table containerClassName="rounded-md border">
      <caption className="sr-only">最近 20 条本企业技术服务订单</caption>
      <TableHeader>
        <TableRow>
          <TableHead>订单</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>年限</TableHead>
          <TableHead>金额</TableHead>
          <TableHead>创建时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const payment = getPaymentStatusMeta(order.payment_status);
          const service = getServiceStatusMeta(order.service_status);
          return (
            <TableRow key={order.id}>
              <TableCell className="min-w-52">
                <p className="font-medium">{order.order_no}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.product_code}
                </p>
              </TableCell>
              <TableCell className="min-w-36">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={payment.variant}>{payment.label}</Badge>
                  <Badge variant={service.variant}>{service.label}</Badge>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {order.term_years} 年
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium tabular-nums">
                {formatServiceAmountFen(order.amount_fen)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                {formatServiceAccessDateTime(order.created_at)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
