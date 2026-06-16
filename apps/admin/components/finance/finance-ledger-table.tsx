"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
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

export function FinanceLedgerTable({ rows }: { rows: FinanceLedgerRecord[] }) {
  const columns: ColumnDef<FinanceLedgerRecord>[] = [
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
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="暂无财务台账流水"
      minWidth="min-w-[980px]"
    />
  );
}
