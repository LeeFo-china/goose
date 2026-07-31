"use client";

import { CircleDollarSign } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import { canMergePayables, canSelectPayable } from "./payable-rules";
import type { SupplierPayable, SupplierPayableStatus } from "./payable-types";

const statusMeta: Record<SupplierPayableStatus, {
  label: string;
  variant: "outline" | "secondary" | "success" | "warning" | "danger";
}> = {
  open: { label: "待申请", variant: "outline" },
  reserved: { label: "已申请待付", variant: "warning" },
  partially_paid: { label: "部分付款", variant: "secondary" },
  paid: { label: "已付清", variant: "success" },
  overdue: { label: "已逾期", variant: "danger" },
};

export function PayableList({
  records,
  loading,
  canCreate,
  selectedIds,
  projectNames,
  supplierNames,
  onToggle,
  onCreateOne,
}: {
  records: SupplierPayable[];
  loading: boolean;
  canCreate: boolean;
  selectedIds: Set<string>;
  projectNames: Record<string, string>;
  supplierNames: Record<string, string>;
  onToggle: (record: SupplierPayable) => void;
  onCreateOne: (record: SupplierPayable) => void;
}) {
  if (loading && records.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (records.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleDollarSign />
          </EmptyMedia>
          <EmptyTitle>暂无供应商应付</EmptyTitle>
          <EmptyDescription>
            当前筛选范围内没有已验收入账的采购应付。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const selected = records.find(({ id }) => selectedIds.has(id));
  return (
    <Table containerClassName="min-w-[1480px] overflow-x-auto">
      <TableHeader className="sticky top-0 bg-card">
        <TableRow>
          <TableHead className="w-12"><span className="sr-only">选择</span></TableHead>
          <TableHead>项目</TableHead>
          <TableHead>供应商</TableHead>
          <TableHead>采购/收货单</TableHead>
          <TableHead>发生/到期</TableHead>
          <TableHead className="text-right">应付</TableHead>
          <TableHead className="text-right">已申请未付</TableHead>
          <TableHead className="text-right">已付</TableHead>
          <TableHead className="text-right">可申请</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const checked = selectedIds.has(record.id);
          const selectable = canCreate && canSelectPayable(record) &&
            (!selected || checked || canMergePayables(selected, record));
          return (
            <TableRow key={record.id} data-state={checked ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={checked}
                  disabled={!selectable}
                  aria-label={`选择应付 ${shortId(record.id)}`}
                  onCheckedChange={() => onToggle(record)}
                />
              </TableCell>
              <TableCell className="max-w-44 truncate">
                {projectNames[record.project_id] ??
                  `项目 ${shortId(record.project_id)}`}
              </TableCell>
              <TableCell className="max-w-48 truncate">
                {supplierNames[record.tenant_supplier_id] ??
                  `供应商 ${shortId(record.tenant_supplier_id)}`}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1 font-mono text-xs">
                  <span>采购 {shortId(record.supplier_purchase_order_id)}</span>
                  <span className="text-muted-foreground">
                    收货 {shortId(record.receipt_id)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1 text-xs tabular-nums">
                  <span>{formatDate(record.occurred_at)}</span>
                  <span className="text-muted-foreground">
                    到期 {formatDate(record.due_at)}
                  </span>
                </div>
              </TableCell>
              <MoneyCell value={record.amount} />
              <MoneyCell value={record.reserved_amount} />
              <MoneyCell value={record.paid_amount} />
              <MoneyCell value={record.available_to_request_amount} />
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <Badge variant={statusMeta[record.status].variant}>
                    {statusMeta[record.status].label}
                  </Badge>
                  {record.invoice_required_before_payment ? (
                    <span className="text-xs text-muted-foreground">付款前需发票</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {canCreate && canSelectPayable(record) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onCreateOne(record)}
                  >
                    发起申请
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">不可申请</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function MoneyCell({ value }: { value: string }) {
  return (
    <TableCell className="text-right font-mono tabular-nums">
      {formatMoney(value)}
    </TableCell>
  );
}

function formatMoney(value: string) {
  if (!/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value)) return "-";
  const [integer, fraction] = value.split(".");
  return `¥${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("zh-CN");
}

function shortId(value: string) {
  return value.slice(0, 8) || "未知";
}
