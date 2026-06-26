"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import { IdentityIdCopyButton } from "@/components/admin/identity-id-copy-button";
import { getIdentityCopyMeta } from "@/components/admin/identity-copy-utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ProjectRowActions,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { projectWorkflowSummary } from "@/components/projects/project-list-workflow-display";

const PROJECT_TABLE_ROW_HEIGHT_CLASS_NAME = "h-[var(--project-table-row-height,75px)]";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  designing: { label: "设计中", variant: "default" },
  proposal_confirmed: { label: "方案已确认", variant: "warning" },
  signed: { label: "已签约", variant: "success" },
  design_finalized: { label: "设计定稿", variant: "default" },
  pending_start: { label: "待开工", variant: "warning" },
  started: { label: "已开工", variant: "warning" },
  constructing: { label: "施工中", variant: "warning" },
  on_hold: { label: "已暂停", variant: "danger" },
  acceptance: { label: "竣工验收", variant: "success" },
  final_acceptance_completed: { label: "已完成", variant: "success" },
  invalid: { label: "无效项目", variant: "secondary" },
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

function customerName(value: ProjectRecord["customer"]) {
  const item = relationOne(value);
  return item?.name || item?.phone_masked || item?.phone || "-";
}

function personName(value: ProjectRecord["designer"] | ProjectRecord["supervisor"]) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function propertyLabel(value: ProjectRecord["property"]) {
  const item = relationOne(value);
  if (!item) return "-";
  return [item.community, item.building_info].filter(Boolean).join(" ") || "-";
}

function projectStatusMeta(project: ProjectRecord) {
  const displayStatus = project.display_status || project.status || "";
  const displayLabel = project.display_status_label || project.status_label;
  const meta = statusMeta[displayStatus] || statusMeta[project.status || ""] || {
    label: displayStatus || "未知",
    variant: "outline" as const,
  };

  return {
    ...meta,
    label: displayLabel || meta.label,
  };
}

function ProjectIdentityCell({
  id,
  name,
  customer,
}: {
  id: string;
  name: string;
  customer: string;
}) {
  return (
    <div className="group/project-cell flex min-w-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="min-w-0 cursor-default border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-[10em] truncate font-semibold">
            {name}
          </div>
          <div className="w-[10em] truncate text-xs text-muted-foreground">
            {customer}
          </div>
        </TooltipTrigger>
        <TooltipContent align="start" className="max-w-[280px]">
          <div className="flex flex-col gap-1">
            <div className="break-all font-semibold">{name}</div>
            <div className="break-all text-xs opacity-90">客户：{customer}</div>
            <div className="break-all font-mono text-xs tabular-nums opacity-90">项目 ID：{id}</div>
          </div>
        </TooltipContent>
      </Tooltip>
      <IdentityIdCopyButton
        id={id}
        name={name}
        fallbackName="未命名项目"
        idLabel="项目ID"
        className="group-hover/project-cell:opacity-100 group-focus-within/project-cell:opacity-100"
      />
    </div>
  );
}

export function ProjectsTable({
  projects,
  onProjectChanged,
}: {
  projects: ProjectRecord[];
  onProjectChanged: (project?: ProjectRecord) => void;
}) {
  const columns = useMemo<ColumnDef<ProjectRecord>[]>(() => [
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => {
        const identity = getIdentityCopyMeta({
          id: row.original.id,
          name: row.original.name,
          fallbackName: "未命名项目",
        });

        return (
          <ProjectIdentityCell
            id={identity.id}
            name={identity.name}
            customer={customerName(row.original.customer)}
          />
        );
      },
      meta: {
        cellClassName: "w-[220px]",
      },
    },
    {
      id: "property",
      header: "房产",
      cell: ({ row }) => (
        <div className="max-w-[260px] truncate text-muted-foreground">
          {propertyLabel(row.original.property)}
        </div>
      ),
    },
    {
      id: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = projectStatusMeta(row.original);
        return (
          <Badge className="whitespace-nowrap" variant={meta.variant}>
            {meta.label}
          </Badge>
        );
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "workflow",
      header: "流程",
      cell: ({ row }) => {
        const summary = projectWorkflowSummary(row.original);
        return (
          <div className="flex min-w-[140px] flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="whitespace-nowrap">
                {summary.groupLabel}
              </Badge>
              <span className="truncate text-sm font-medium">
                {summary.nodeLabel}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {summary.statusLabel}
            </span>
          </div>
        );
      },
      meta: {
        cellClassName: "min-w-[180px]",
      },
    },
    {
      id: "budget",
      header: "预算",
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-medium tabular-nums">
          ¥{formatMoney(row.original.budget)}
        </span>
      ),
    },
    {
      id: "designer",
      header: "设计师",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {personName(row.original.designer)}
        </span>
      ),
    },
    {
      id: "supervisor",
      header: "工程负责人",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {personName(row.original.supervisor)}
        </span>
      ),
    },
    {
      id: "startDate",
      header: "开工日期",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {formatDate(row.original.start_date)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ProjectRowActions project={row.original} onChanged={onProjectChanged} />
        </div>
      ),
      meta: {
        headerClassName: "text-right lg:sticky lg:right-0 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
        cellClassName: "text-right lg:sticky lg:right-0 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
      },
    },
  ], [onProjectChanged]);

  return (
    <DataTable
      columns={columns}
      data={projects}
      emptyText="没有符合条件的项目"
      minWidth="min-w-[1320px]"
      tableClassName="border-t-0"
      headerClassName="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]"
      rowClassName={() => PROJECT_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
