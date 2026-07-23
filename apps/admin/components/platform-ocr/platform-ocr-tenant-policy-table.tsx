"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { PlatformOcrTenantPolicyDialog } from "@/components/platform-ocr/platform-ocr-tenant-policy-dialog";
import {
  getOcrDocumentLabel,
  type PlatformOcrTenantPolicy,
} from "@/components/platform-ocr/platform-ocr-types";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function PlatformOcrTenantPolicyTable({
  records,
}: {
  records: PlatformOcrTenantPolicy[];
}) {
  const [selectedPolicy, setSelectedPolicy] = useState<PlatformOcrTenantPolicy | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const columns: ColumnDef<PlatformOcrTenantPolicy>[] = [
    {
      id: "tenant",
      header: "租户",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.tenant_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.tenant_slug}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[220px]" },
    },
    {
      accessorKey: "enabled",
      header: "灰度状态",
      cell: ({ row }) => (
        <Badge variant={row.original.enabled ? "success" : "secondary"}>
          {row.original.enabled ? "已启用" : "未启用"}
        </Badge>
      ),
    },
    {
      id: "capabilities",
      header: "允许能力",
      cell: ({ row }) => row.original.allowed_document_types.length > 0 ? (
        <div className="flex min-w-[240px] flex-wrap gap-1">
          {row.original.allowed_document_types.map((documentType) => (
            <Badge key={documentType} variant="outline">
              {getOcrDocumentLabel(documentType)}
            </Badge>
          ))}
        </div>
      ) : <span className="text-muted-foreground">未配置</span>,
    },
    {
      accessorKey: "daily_limit",
      header: "每日额度",
      cell: ({ row }) => row.original.daily_limit == null
        ? <span className="text-muted-foreground">平台默认</span>
        : row.original.daily_limit.toLocaleString("zh-CN"),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "enabled_at",
      header: "启用时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(row.original.enabled_at)}
        </span>
      ),
    },
    {
      accessorKey: "updated_at",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(row.original.updated_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectedPolicy(row.original);
            setDialogOpen(true);
          }}
        >
          <Settings2 data-icon="inline-start" />
          配置
        </Button>
      ),
      meta: { cellClassName: "w-[96px] whitespace-nowrap" },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={records}
        emptyText="暂无符合条件的租户"
        minWidth="min-w-[1180px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
      />
      <PlatformOcrTenantPolicyDialog
        policy={selectedPolicy}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
