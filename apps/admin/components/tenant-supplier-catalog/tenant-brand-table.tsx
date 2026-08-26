"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { catalogStatusMeta } from "@/components/supplier-catalog/supplier-catalog-types";
import { Badge } from "@/components/ui/badge";

import { TenantBrandDialogButton } from "./tenant-brand-dialog";
import { TenantCatalogSourceBadge } from "./tenant-catalog-display";
import { TenantCatalogStatusAction } from "./tenant-catalog-status-action";
import type { TenantCatalogBrand } from "./tenant-catalog-types";

export function TenantBrandTable({ records }: { records: TenantCatalogBrand[] }) {
  const columns: ColumnDef<TenantCatalogBrand>[] = [
    { accessorKey: "name", header: "品牌", cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
    {
      accessorKey: "category_id",
      header: "所属分类",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.category?.full_name ?? row.original.category?.name ?? "-"}
        </span>
      ),
    },
    { accessorKey: "ownership_scope", header: "来源", cell: ({ row }) => <TenantCatalogSourceBadge ownershipScope={row.original.ownership_scope} /> },
    { accessorKey: "status", header: "状态", cell: ({ row }) => { const meta = catalogStatusMeta[row.original.status]; return <Badge variant={meta.variant}>{meta.label}</Badge>; } },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => row.original.ownership_scope === "tenant" ? (
        <div className="flex justify-end gap-1">
          <TenantBrandDialogButton record={row.original} />
          <TenantCatalogStatusAction kind="brand" record={row.original} />
        </div>
      ) : <span className="text-sm text-muted-foreground">只读</span>,
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];
  return <DataTable columns={columns} data={records} emptyText="当前筛选条件下没有可见品牌" minWidth="min-w-[900px]" tableClassName="border-t-0" rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME} />;
}
