"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Link2, Pencil } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import { FinanceLedgerAllocationDialog } from "@/components/finance/finance-ledger-allocation-dialog";
import { FinanceLedgerPaymentRepairDialog } from "@/components/finance/finance-ledger-payment-repair-dialog";
import type { FinanceCostCategoryRecord } from "@/components/finance/finance-cost-budget-requests";
import type { FinanceLedgerRecord } from "@/components/finance/finance-requests";
import {
  financeDirectionMeta,
  formatFinanceDateTime,
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";

function projectName(row: FinanceLedgerRecord) {
  return row.project?.name || "-";
}

function handlerName(row: FinanceLedgerRecord) {
  return row.handler?.name || row.handler?.phone || "-";
}

function entryTypeLabel(row: FinanceLedgerRecord) {
  return row.summary || row.entry_type || "-";
}

function costCategoryLabel(row: FinanceLedgerRecord) {
  if (row.cost_category?.name || row.cost_category?.code) {
    return row.cost_category.name || row.cost_category.code;
  }
  return row.direction === "out" ? "待归集" : "-";
}

function canRepairProjectPayment(row: FinanceLedgerRecord) {
  return row.direction === "in" &&
    row.entry_type === "project_payment" &&
    !row.payment_id &&
    !row.legacy_payment_ledger_marked_at;
}

function repairStatus(row: FinanceLedgerRecord) {
  if (row.payment_id) return "已关联收款";
  if (row.legacy_payment_ledger_marked_at) return "已标记历史";
  return "-";
}

type PaymentRepairState = {
  ledger: FinanceLedgerRecord;
  mode: "link" | "legacy";
};

export function FinanceLedgerTable({
  rows,
  costCategories = [],
  canManageAllocation = false,
  canManageReconciliation = false,
}: {
  rows: FinanceLedgerRecord[];
  costCategories?: FinanceCostCategoryRecord[];
  canManageAllocation?: boolean;
  canManageReconciliation?: boolean;
}) {
  const [ledgerRows, setLedgerRows] = useState(rows);
  const [editingLedger, setEditingLedger] = useState<FinanceLedgerRecord | null>(null);
  const [paymentRepair, setPaymentRepair] = useState<PaymentRepairState | null>(null);

  useEffect(() => {
    setLedgerRows(rows);
  }, [rows]);

  const columns: ColumnDef<FinanceLedgerRecord>[] = useMemo(() => [
    {
      accessorKey: "occurred_at",
      header: "时间",
      cell: ({ row }) => formatFinanceDateTime(row.original.occurred_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem] truncate font-medium">
          {projectName(row.original)}
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "entry_type",
      header: "类型",
      cell: ({ row }) => (
        <div className="max-w-[20rem] truncate">
          {entryTypeLabel(row.original)}
        </div>
      ),
      meta: {
        cellClassName: "text-muted-foreground",
      },
    },
    {
      id: "cost_category",
      header: "成本归集",
      cell: ({ row }) => costCategoryLabel(row.original),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      accessorKey: "direction",
      header: "方向",
      cell: ({ row }) => {
        const meta = financeDirectionMeta(row.original.direction);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "amount",
      header: "金额",
      cell: ({ row }) => formatFinanceMoney(row.original.amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right font-medium tabular-nums",
      },
    },
    {
      id: "handler",
      header: "经办人",
      cell: ({ row }) => handlerName(row.original),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    ...(canManageAllocation
      ? [{
        id: "allocation_action",
        header: "归集",
        cell: ({ row }) => {
          const editable = row.original.direction === "out";
          return editable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setEditingLedger(row.original)}
            >
              <Pencil data-icon="inline-start" />
              调整
            </Button>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
        meta: {
          cellClassName: "whitespace-nowrap text-right",
          headerClassName: "text-right",
        },
      } satisfies ColumnDef<FinanceLedgerRecord>]
      : []),
    ...(canManageReconciliation
      ? [{
        id: "payment_repair_action",
        header: "收款修正",
        cell: ({ row }) => {
          if (!canRepairProjectPayment(row.original)) {
            return <span className="text-muted-foreground">{repairStatus(row.original)}</span>;
          }
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setPaymentRepair({ ledger: row.original, mode: "link" })}
              >
                <Link2 data-icon="inline-start" />
                关联
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setPaymentRepair({ ledger: row.original, mode: "legacy" })}
              >
                <Archive data-icon="inline-start" />
                历史
              </Button>
            </div>
          );
        },
        meta: {
          cellClassName: "whitespace-nowrap text-right",
          headerClassName: "text-right",
        },
      } satisfies ColumnDef<FinanceLedgerRecord>]
      : []),
  ], [canManageAllocation, canManageReconciliation]);

  const minWidth = canManageAllocation || canManageReconciliation
    ? "min-w-[1260px]"
    : "min-w-[1080px]";

  return (
    <>
      <DataTable
        columns={columns}
        data={ledgerRows}
        emptyText="暂无财务台账流水"
        minWidth={minWidth}
      />
      {editingLedger ? (
        <FinanceLedgerAllocationDialog
          ledger={editingLedger}
          categories={costCategories}
          onClose={() => setEditingLedger(null)}
          onSaved={(updatedLedger) => {
            setEditingLedger(null);
            setLedgerRows((current) => current.map((row) =>
              row.id === updatedLedger.id ? updatedLedger : row
            ));
          }}
        />
      ) : null}
      {paymentRepair ? (
        <FinanceLedgerPaymentRepairDialog
          ledger={paymentRepair.ledger}
          mode={paymentRepair.mode}
          onClose={() => setPaymentRepair(null)}
          onSaved={(updatedLedger) => {
            setPaymentRepair(null);
            setLedgerRows((current) => current.map((row) =>
              row.id === updatedLedger.id ? updatedLedger : row
            ));
          }}
        />
      ) : null}
    </>
  );
}
