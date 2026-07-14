"use client";

import Link from "next/link";
import { AlertTriangle, CircleAlert } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ProjectOperationalRiskFact } from "@gooes/domain";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatOverdueDays,
  formatProjectRiskDateTime,
  formatProjectRiskEvidence,
  getProjectOperationalRiskSeverityMeta,
  getProjectOperationalRiskTypeLabel,
} from "@/components/project-health/project-health-display";

function riskActionHref(item: ProjectOperationalRiskFact) {
  return `/projects/${item.project_id}`;
}

function toBadgeVariant(variant: "default" | "secondary" | "destructive" | "outline") {
  return variant === "destructive" ? "danger" : variant;
}

const columns: ColumnDef<ProjectOperationalRiskFact>[] = [
  {
    accessorKey: "severity",
    header: "严重度",
    cell: ({ row }) => {
      const meta = getProjectOperationalRiskSeverityMeta(row.original.severity);
      const Icon = meta.icon === "alert-triangle" ? AlertTriangle : CircleAlert;
      return (
        <Badge variant={toBadgeVariant(meta.badgeVariant)} className="gap-1">
          <Icon aria-hidden="true" className="size-3" />
          {meta.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "project_name",
    header: "项目",
    cell: ({ row }) => (
      <div className="max-w-[180px] truncate" title={row.original.project_name}>
        <div className="font-medium">{row.original.project_name}</div>
        <div className="truncate text-xs text-muted-foreground" title={row.original.project_id}>
          {row.original.project_id}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "risk_type",
    header: "风险事项",
    cell: ({ row }) => (
      <div className="max-w-[220px]">
        <div>{getProjectOperationalRiskTypeLabel(row.original.risk_type)}</div>
        <div className="truncate text-xs text-muted-foreground" title={row.original.risk_key}>
          {row.original.risk_key}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "assignee_employee_name",
    header: "责任人",
    cell: ({ row }) => row.original.assignee_employee_name || "未分配",
  },
  {
    id: "time",
    header: "发生/逾期时间",
    cell: ({ row }) => (
      <div className="text-sm tabular-nums">
        <div>{formatProjectRiskDateTime(row.original.occurred_at)}</div>
        <div className="text-xs text-muted-foreground">
          {formatOverdueDays(row.original.overdue_days)}
        </div>
      </div>
    ),
  },
  {
    id: "evidence",
    header: "证据摘要",
    cell: ({ row }) => {
      const evidence = formatProjectRiskEvidence(row.original.evidence);
      return (
        <div className="hidden max-w-[220px] gap-1 text-xs text-muted-foreground md:flex md:flex-col">
          {evidence.map((item) => (
            <span key={item} className="truncate" title={item}>{item}</span>
          ))}
        </div>
      );
    },
  },
  {
    id: "action",
    header: "操作",
    cell: ({ row }) => (
      <Button asChild variant="outline" size="sm">
        <Link href={riskActionHref(row.original)}>去处理</Link>
      </Button>
    ),
  },
];

export function ProjectHealthTable({
  items,
}: {
  items: ProjectOperationalRiskFact[];
}) {
  return (
    <DataTable
      columns={columns}
      data={items}
      emptyText="当前筛选没有项目风险"
      minWidth="min-w-[960px]"
      headerClassName="sticky top-0 z-10"
      tableClassName="border-t-0"
    />
  );
}
