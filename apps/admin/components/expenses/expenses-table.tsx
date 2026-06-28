"use client";

import { type ColumnDef } from "@tanstack/react-table";
import {
  EXPENSE_MODE_VALUES,
  EXPENSE_STATUS_VALUES,
  ExpenseModeConfig,
  ExpenseStatusConfig,
} from "@gooes/domain";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ExpenseRowActions,
  type ExpenseRecord,
} from "@/components/expenses/expense-mutations";
import { expenseCostCategoryLabel } from "@/components/expenses/expense-mutation-shared";

type ExpenseUpdatedHandler = (expense: ExpenseRecord) => void;

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = Object.fromEntries(
  EXPENSE_STATUS_VALUES.map((value) => {
    const type = ExpenseStatusConfig[value].type;
    return [
      value,
      {
        label: ExpenseStatusConfig[value].label,
        variant: type === "success"
          ? "success"
          : type === "warning"
            ? "warning"
            : type === "danger"
              ? "danger"
              : type === "primary"
                ? "default"
                : "outline",
      },
    ];
  }),
);

const modeMeta: Record<string, string> = Object.fromEntries(
  EXPENSE_MODE_VALUES.map((value) => [
    value,
    ExpenseModeConfig[value].label,
  ]),
);

const EXPENSE_IDENTITY_COLUMN_CLASS_NAME = "w-[44%] min-w-0 lg:w-[220px]";
const EXPENSE_EMPLOYEE_COLUMN_CLASS_NAME = "hidden w-[96px] whitespace-nowrap lg:table-cell";
const EXPENSE_PROJECT_COLUMN_CLASS_NAME = "hidden w-[150px] min-w-0 xl:table-cell";
const EXPENSE_COST_CATEGORY_COLUMN_CLASS_NAME = "hidden w-[120px] whitespace-nowrap 2xl:table-cell";
const EXPENSE_AMOUNT_COLUMN_CLASS_NAME = "w-[22%] whitespace-nowrap lg:w-[112px]";
const EXPENSE_STATUS_COLUMN_CLASS_NAME = "w-[16%] whitespace-nowrap lg:w-[92px]";
const EXPENSE_WORKFLOW_COLUMN_CLASS_NAME = "hidden w-[140px] min-w-0 xl:table-cell";
const EXPENSE_ASSIGNEE_COLUMN_CLASS_NAME = "hidden w-[96px] whitespace-nowrap 2xl:table-cell";
const EXPENSE_CREATED_AT_COLUMN_CLASS_NAME = "hidden w-[104px] whitespace-nowrap 2xl:table-cell";
const EXPENSE_ACTION_COLUMN_CLASS_NAME = "w-[18%] text-right lg:w-24";

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

function ExpenseIdentityCell({
  id,
  title,
  requestNo,
  mode,
}: {
  id: string;
  title: string;
  requestNo: string;
  mode: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="block w-full min-w-0 cursor-default border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="truncate font-medium">
          {title}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {requestNo}
        </div>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[280px]">
        <div className="flex flex-col gap-1">
          <div className="break-all font-medium">{title}</div>
          <div className="break-all text-xs opacity-90">单号：{requestNo}</div>
          <div className="break-all text-xs opacity-90">模式：{mode}</div>
          <div className="break-all text-xs opacity-90">申请 ID：{id}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function ExpensesTable({
  expenses,
  currentEmployeeId,
  onExpenseUpdated,
}: {
  expenses: ExpenseRecord[];
  currentEmployeeId: string | null;
  onExpenseUpdated?: ExpenseUpdatedHandler;
}) {
  const columns: ColumnDef<ExpenseRecord>[] = [
    {
      accessorKey: "title",
      header: "申请",
      cell: ({ row }) => (
        <ExpenseIdentityCell
          id={row.original.id}
          title={row.original.title || "未命名费用申请"}
          requestNo={row.original.request_no || row.original.id}
          mode={modeMeta[row.original.mode] || row.original.mode}
        />
      ),
      meta: {
        headerClassName: EXPENSE_IDENTITY_COLUMN_CLASS_NAME,
        cellClassName: EXPENSE_IDENTITY_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "employee",
      header: "申请人",
      cell: ({ row }) => employeeName(row.original),
      meta: {
        headerClassName: EXPENSE_EMPLOYEE_COLUMN_CLASS_NAME,
        cellClassName: EXPENSE_EMPLOYEE_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="truncate text-muted-foreground">
          {projectName(row.original)}
        </div>
      ),
      meta: {
        headerClassName: EXPENSE_PROJECT_COLUMN_CLASS_NAME,
        cellClassName: EXPENSE_PROJECT_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "cost_category",
      header: "成本归集",
      cell: ({ row }) => expenseCostCategoryLabel(row.original),
      meta: {
        headerClassName: EXPENSE_COST_CATEGORY_COLUMN_CLASS_NAME,
        cellClassName: `${EXPENSE_COST_CATEGORY_COLUMN_CLASS_NAME} text-muted-foreground`,
      },
    },
    {
      accessorKey: "total_amount",
      header: "金额",
      cell: ({ row }) => `¥${formatMoney(row.original.total_amount)}`,
      meta: {
        headerClassName: EXPENSE_AMOUNT_COLUMN_CLASS_NAME,
        cellClassName: `${EXPENSE_AMOUNT_COLUMN_CLASS_NAME} font-medium tabular-nums`,
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
        headerClassName: EXPENSE_STATUS_COLUMN_CLASS_NAME,
        cellClassName: EXPENSE_STATUS_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "workflow_state",
      header: "当前节点",
      cell: ({ row }) => (
        <div className="truncate text-muted-foreground">
          {row.original.workflow_state?.current_node_title ||
            row.original.workflow_state?.current_node_key ||
            "未接入流程"}
        </div>
      ),
      meta: {
        headerClassName: EXPENSE_WORKFLOW_COLUMN_CLASS_NAME,
        cellClassName: EXPENSE_WORKFLOW_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "assignee",
      header: "处理人",
      cell: ({ row }) => assigneeName(row.original),
      meta: {
        headerClassName: EXPENSE_ASSIGNEE_COLUMN_CLASS_NAME,
        cellClassName: `${EXPENSE_ASSIGNEE_COLUMN_CLASS_NAME} text-muted-foreground`,
      },
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) => formatDate(row.original.created_at),
      meta: {
        headerClassName: EXPENSE_CREATED_AT_COLUMN_CLASS_NAME,
        cellClassName: `${EXPENSE_CREATED_AT_COLUMN_CLASS_NAME} text-muted-foreground tabular-nums`,
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">操作</div>,
      cell: ({ row, table }) => {
        const meta = table.options.meta as { onExpenseUpdated?: ExpenseUpdatedHandler } | undefined;

        return (
          <div className="flex justify-end">
            <ExpenseRowActions
              expense={row.original}
              currentEmployeeId={currentEmployeeId}
              onExpenseUpdated={meta?.onExpenseUpdated}
            />
          </div>
        );
      },
      meta: {
        headerClassName: EXPENSE_ACTION_COLUMN_CLASS_NAME,
        cellClassName: EXPENSE_ACTION_COLUMN_CLASS_NAME,
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={expenses}
      emptyText="没有符合条件的费用申请"
      containerClassName="overflow-x-hidden"
      tableContainerClassName="overflow-x-hidden"
      tableClassName="border-t-0 table-fixed"
      headerClassName="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]"
      tableMeta={{ onExpenseUpdated }}
    />
  );
}
