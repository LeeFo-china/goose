"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  ExpenseRowActions,
  type ExpenseRecord,
} from "@/components/expenses/expense-mutations";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  draft: { label: "草稿", variant: "outline" },
  pending: { label: "审批中", variant: "warning" },
  approved: { label: "待打款", variant: "default" },
  rejected: { label: "已驳回", variant: "danger" },
  paid: { label: "已完成", variant: "success" },
  cancelled: { label: "已撤回", variant: "secondary" },
};

const modeMeta: Record<string, string> = {
  reimbursement: "员工报销",
  advance: "预借款",
  direct: "公司直付",
  petty_cash: "备用金",
};

const stepMeta: Record<string, string> = {
  draft: "草稿",
  manager_review: "待主管审核",
  finance_review: "待财务审核",
  payment: "待打款",
  done: "已完成",
  cancelled: "已作废",
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function employeeName(expense: ExpenseRecord) {
  const employee = relationOne(expense.employee);
  return employee?.name || employee?.phone || "-";
}

function assigneeName(expense: ExpenseRecord) {
  const assignee = relationOne(expense.assignee);
  return assignee?.name || assignee?.phone || "-";
}

function projectName(expense: ExpenseRecord) {
  const project = relationOne(expense.project);
  return project?.name || "-";
}

export function ExpensesTable({
  expenses,
  currentEmployeeId,
}: {
  expenses: ExpenseRecord[];
  currentEmployeeId: string | null;
}) {
  const columns: ColumnDef<ExpenseRecord>[] = [
    {
      accessorKey: "title",
      header: "申请",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">
            {row.original.title || "未命名费用申请"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.request_no || row.original.id}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {modeMeta[row.original.mode] || row.original.mode}
          </div>
        </div>
      ),
    },
    {
      id: "employee",
      header: "申请人",
      cell: ({ row }) => employeeName(row.original),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => projectName(row.original),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      accessorKey: "total_amount",
      header: "金额",
      cell: ({ row }) => `¥${formatMoney(row.original.total_amount)}`,
      meta: {
        cellClassName: "whitespace-nowrap font-medium",
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = statusMeta[row.original.status || ""] || {
          label: row.original.status || "未知",
          variant: "outline" as const,
        };

        return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "current_step",
      header: "当前节点",
      cell: ({ row }) => stepMeta[row.original.current_step] || row.original.current_step || "-",
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      id: "assignee",
      header: "处理人",
      cell: ({ row }) => assigneeName(row.original),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) => formatDate(row.original.created_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <ExpenseRowActions
          expense={row.original}
          currentEmployeeId={currentEmployeeId}
        />
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "relative whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={expenses}
      emptyText="没有符合条件的费用申请"
      minWidth="min-w-[1360px]"
    />
  );
}
