"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { catalogStatusMeta } from "@/components/supplier-catalog/supplier-catalog-types";
import { CatalogSpecDefinitionsDialogButton } from "@/components/supplier-catalog/catalog-spec-definitions-dialog";
import { Badge } from "@/components/ui/badge";

import { TenantCategoryDialogButton } from "./tenant-category-dialog";
import { TenantCatalogStatusAction } from "./tenant-catalog-status-action";
import {
  TenantCatalogSourceBadge,
  TenantCategoryIdentity,
} from "./tenant-catalog-display";
import { getTenantCatalogCapabilities } from "./tenant-catalog-rules";
import type { TenantCatalogCategory } from "./tenant-catalog-types";

export function TenantCategoryTable({
  records,
}: {
  records: TenantCatalogCategory[];
}) {
  const platformCategories = records.filter((record) =>
    record.ownership_scope === "platform"
  );
  const platformNames = new Map(
    platformCategories.map((record) => [record.id, record.full_name]),
  );
  const columns: ColumnDef<TenantCatalogCategory>[] = [
    {
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
    },
    {
      accessorKey: "full_name",
      header: "完整分类名 / 平台映射",
      cell: ({ row }) => (
        <TenantCategoryIdentity
          fullName={row.original.full_name}
          mappedPlatformName={row.original.mapped_platform_category_id
            ? platformNames.get(row.original.mapped_platform_category_id) ??
              `平台分类 ${row.original.mapped_platform_category_id}`
            : null}
        />
      ),
    },
    {
      accessorKey: "ownership_scope",
      header: "来源",
      cell: ({ row }) => (
        <TenantCatalogSourceBadge ownershipScope={row.original.ownership_scope} />
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = catalogStatusMeta[row.original.status];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const capabilities = getTenantCatalogCapabilities(row.original);
        return (
          <div className="flex justify-end gap-1 whitespace-nowrap">
            <CatalogSpecDefinitionsDialogButton
              scope="tenant"
              category={row.original}
            />
            {capabilities.canEdit ? (
              <>
            <TenantCategoryDialogButton
              record={row.original}
              platformCategories={platformCategories}
            />
                <TenantCatalogStatusAction kind="category" record={row.original} />
              </>
            ) : <span className="self-center text-sm text-muted-foreground">只读</span>}
          </div>
        );
      },
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={records}
      emptyText="当前筛选条件下没有可见分类"
      minWidth="min-w-[900px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
