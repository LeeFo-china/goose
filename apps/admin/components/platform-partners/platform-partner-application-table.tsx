"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  ApplicationDetailButton,
  ApprovePartnerApplicationButton,
  RejectPartnerApplicationButton,
} from "@/components/platform-partners/platform-partner-application-actions";
import type {
  PlatformPartnerApplicationRecord,
  PlatformPartnerLevel,
} from "@/components/platform-partners/platform-partner-types";
import {
  applicationStatusOptions,
  optionLabel,
} from "@/components/platform-partners/platform-partner-types";

export function PlatformPartnerApplicationsTable({
  list,
  levels,
}: {
  list: PlatformPartnerApplicationRecord[];
  levels: PlatformPartnerLevel[];
}) {
  return (
    <DataTable
      columns={buildApplicationColumns(levels)}
      data={list}
      emptyText="还没有官网合伙人申请"
      minWidth="min-w-[1120px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

function buildApplicationColumns(
  levels: PlatformPartnerLevel[],
): ColumnDef<PlatformPartnerApplicationRecord>[] {
  return [
    {
      accessorKey: "applicant_name",
      header: "申请主体",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.applicant_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.application_no}
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "联系人",
      cell: ({ row }) => (
        <div>
          <div>{row.original.contact_name}</div>
          <div className="text-xs text-muted-foreground">{row.original.phone}</div>
        </div>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "region",
      header: "意向区域",
      cell: ({ row }) => row.original.region_name ||
        row.original.region_codes.join(" / ") ||
        "-",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <ApplicationStatusBadge status={row.original.status} />
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "source_channel",
      header: "来源",
      cell: ({ row }) => row.original.source_channel,
      meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
    },
    {
      accessorKey: "created_at",
      header: "提交时间",
      cell: ({ row }) => formatDate(row.original.created_at),
      meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <ApplicationDetailButton application={row.original} />
          <ApprovePartnerApplicationButton application={row.original} levels={levels} />
          <RejectPartnerApplicationButton application={row.original} />
        </div>
      ),
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];
}

function ApplicationStatusBadge({
  status,
}: {
  status: PlatformPartnerApplicationRecord["status"];
}) {
  const variant = status === "approved"
    ? "success"
    : status === "submitted" || status === "reviewing"
      ? "warning"
      : "danger";
  return (
    <Badge variant={variant}>
      {optionLabel(applicationStatusOptions, status)}
    </Badge>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
