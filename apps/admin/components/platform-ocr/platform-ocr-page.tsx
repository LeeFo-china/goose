"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import {
  getOcrDocumentLabel,
  getOcrSceneLabel,
  getOcrStatusLabel,
  type PlatformOcrRecognition,
} from "@/components/platform-ocr/platform-ocr-types";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function shortId(value?: string | null) {
  if (!value) return "-";
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function statusVariant(status: PlatformOcrRecognition["status"]) {
  if (status === "succeeded") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "processing") return "warning" as const;
  return "secondary" as const;
}

const columns: ColumnDef<PlatformOcrRecognition>[] = [
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)}>
        {getOcrStatusLabel(row.original.status)}
      </Badge>
    ),
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    id: "document",
    header: "识别类型",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {getOcrDocumentLabel(row.original.document_type)}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {getOcrSceneLabel(row.original.scene)} · {row.original.provider_action}
        </div>
      </div>
    ),
    meta: { cellClassName: "min-w-[220px]" },
  },
  {
    accessorKey: "tenant_id",
    header: "租户",
    cell: ({ row }) => (
      <span className="font-mono text-xs" title={row.original.tenant_id}>
        {shortId(row.original.tenant_id)}
      </span>
    ),
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    id: "subject",
    header: "业务对象",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs">
        <div>{row.original.subject_type || "-"}</div>
        <div className="font-mono text-muted-foreground" title={row.original.subject_id || undefined}>
          {shortId(row.original.subject_id)}
        </div>
      </div>
    ),
    meta: { cellClassName: "min-w-[150px]" },
  },
  {
    id: "usage",
    header: "调用",
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-sm">
        <div>{row.original.duration_ms == null ? "-" : `${row.original.duration_ms} ms`}</div>
        <div className="text-xs text-muted-foreground">
          计费单元 {row.original.billable_units}
        </div>
      </div>
    ),
  },
  {
    id: "diagnostics",
    header: "诊断",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs">
        <div className="truncate font-mono" title={row.original.provider_request_id || undefined}>
          {row.original.provider_request_id || "-"}
        </div>
        <div className="truncate text-muted-foreground">
          {row.original.provider_error_code
            ? `${row.original.provider_error_code} · ${row.original.provider_error_message_safe || "调用失败"}`
            : "无错误"}
        </div>
      </div>
    ),
    meta: { cellClassName: "min-w-[260px] max-w-[360px]" },
  },
  {
    accessorKey: "created_at",
    header: "发起时间",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDate(row.original.created_at)}
      </span>
    ),
  },
];

export function PlatformOcrTable({
  records,
}: {
  records: PlatformOcrRecognition[];
}) {
  return (
    <DataTable
      columns={columns}
      data={records}
      emptyText="暂无 OCR 调用记录"
      minWidth="min-w-[1180px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
