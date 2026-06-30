"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceCorrectionAuditRecord,
} from "@/components/finance/finance-correction-audit-requests";
import {
  financeCorrectionAuditDomainMeta,
  financeCorrectionAuditOperationLabel,
  safeFinanceCorrectionAuditHref,
} from "@/components/finance/finance-correction-audit-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-ledger-utils";

function projectName(row: FinanceCorrectionAuditRecord) {
  return row.project_name || row.project_id || "-";
}

export function FinanceCorrectionAuditTable({
  rows,
}: {
  rows: FinanceCorrectionAuditRecord[];
}) {
  const columns: ColumnDef<FinanceCorrectionAuditRecord>[] = [
    {
      accessorKey: "occurred_at",
      header: "发生时间",
      cell: ({ row }) => formatFinanceDateTime(row.original.occurred_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground tabular-nums",
      },
    },
    {
      accessorKey: "operation",
      header: "类型",
      cell: ({ row }) => {
        const domainMeta = financeCorrectionAuditDomainMeta(row.original.domain);
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {financeCorrectionAuditOperationLabel(row.original.operation)}
            </span>
            <Badge variant={domainMeta.variant}>{domainMeta.label}</Badge>
          </div>
        );
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <div className="truncate font-medium">{projectName(row.original)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.project_id || "-"}
          </div>
        </div>
      ),
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
      id: "actor",
      header: "操作人",
      cell: ({ row }) => (
        <div className="max-w-[10rem] truncate">
          {row.original.actor_employee_name ||
            row.original.actor_employee_id ||
            "-"}
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      accessorKey: "reason",
      header: "原因",
      cell: ({ row }) => (
        <div className="max-w-[22rem] truncate">
          {row.original.reason || "-"}
        </div>
      ),
    },
    {
      id: "subject",
      header: "关联对象",
      cell: ({ row }) => (
        <div className="max-w-[18rem] space-y-1 text-xs text-muted-foreground">
          <div className="truncate">
            应收：{row.original.receivable_plan_id || "-"}
          </div>
          <div className="truncate">
            收款：{row.original.payment_id || "-"}
          </div>
          <div className="truncate">
            台账：{row.original.ledger_id || "-"}
          </div>
        </div>
      ),
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link href={safeFinanceCorrectionAuditHref(row.original.target.href)}>
            {row.original.target.label || "查看"}
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      ),
      meta: {
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="当前筛选条件下暂无修正审计记录"
      minWidth="min-w-[1280px]"
    />
  );
}
