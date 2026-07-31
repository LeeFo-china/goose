"use client";

import { ClipboardList, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

import { formatPaymentMoney } from "./payment-request-page-utils";
import { paymentRequestActions } from "./payment-request-rules";
import type {
  PaymentRequestAction,
  PaymentRequestPermissions,
  SupplierPaymentRequestListItem,
} from "./payment-request-types";
import {
  formatPaymentDateTime,
  paymentRequestStatusMeta,
  shortPaymentId,
} from "./payment-request-ui";

const actionLabels: Record<PaymentRequestAction, string> = {
  edit: "编辑草稿",
  submit: "提交审批",
  approve: "批准申请",
  reject: "驳回申请",
  cancel: "取消申请",
  pay: "确认付款",
  close: "关闭尾款",
};

export function PaymentRequestList({
  records,
  loading,
  permissions,
  pendingRequestId,
  onOpen,
  onAction,
}: {
  records: SupplierPaymentRequestListItem[];
  loading: boolean;
  permissions: PaymentRequestPermissions;
  pendingRequestId: string | null;
  onOpen: (record: SupplierPaymentRequestListItem) => void;
  onAction: (
    record: SupplierPaymentRequestListItem,
    action: PaymentRequestAction,
  ) => void;
}) {
  if (loading && records.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (records.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
          <EmptyTitle>暂无付款申请</EmptyTitle>
          <EmptyDescription>调整筛选条件，或从供应商应付页面发起申请。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table className="min-w-[1160px]" containerClassName="max-w-full overflow-x-auto">
      <TableHeader className="sticky top-0 bg-card">
        <TableRow>
          <TableHead>申请号</TableHead>
          <TableHead>项目</TableHead>
          <TableHead>供应商</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="text-right">申请金额</TableHead>
          <TableHead className="text-right">已付金额</TableHead>
          <TableHead>原因</TableHead>
          <TableHead>更新时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const actions = paymentRequestActions({
            status: record.status,
            invoiceBlocked: false,
          }, permissions);
          const pending = pendingRequestId === record.id;
          return (
            <TableRow key={record.id}>
              <TableCell className="font-mono font-medium">{record.request_no}</TableCell>
              <TableCell className="font-mono text-xs">
                {shortPaymentId(record.project_id)}
              </TableCell>
              <TableCell className="max-w-48 truncate">{record.supplier_name}</TableCell>
              <TableCell>
                <Badge variant={paymentRequestStatusMeta[record.status].variant}>
                  {paymentRequestStatusMeta[record.status].label}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPaymentMoney(record.requested_amount)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPaymentMoney(record.paid_amount)}
              </TableCell>
              <TableCell className="max-w-56 truncate">{record.reason}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatPaymentDateTime(record.updated_at)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onOpen(record)}
                  >
                    查看
                  </Button>
                  {actions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={pending}
                          aria-label={`更多操作 ${record.request_no}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          {actions.map((action) => (
                            <DropdownMenuItem
                              key={action}
                              disabled={pending}
                              onSelect={() => onAction(record, action)}
                            >
                              {actionLabels[action]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
