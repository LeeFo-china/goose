"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { catalogStatusMeta } from "@/components/supplier-catalog/supplier-catalog-types";
import { CatalogSpecDefinitionsDialogButton } from "@/components/supplier-catalog/catalog-spec-definitions-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TenantCategoryDialogButton } from "./tenant-category-dialog";
import { TenantCatalogStatusAction } from "./tenant-catalog-status-action";
import {
  TenantCatalogSourceBadge,
  TenantCategoryIdentity,
} from "./tenant-catalog-display";
import {
  canBrowseTenantCategoryChildren,
  getTenantCatalogCapabilities,
  tenantCategoryTrailHref,
} from "./tenant-catalog-rules";
import type {
  TenantCatalogCategory,
  TenantCategoryTrailItem,
} from "./tenant-catalog-types";
import type { CategoryReturnState } from "@/components/supplier-catalog/supplier-catalog-types";

export function TenantCategoryTable({
  records,
  categoryTrail,
  categoryReturnState,
}: {
  records: TenantCatalogCategory[];
  categoryTrail: TenantCategoryTrailItem[];
  categoryReturnState: CategoryReturnState;
}) {
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
        <div className="flex min-w-[260px] items-center gap-2">
          <TenantCategoryIdentity
            fullName={row.original.full_name}
            mappedPlatformName={row.original.mapped_platform_category?.full_name ?? null}
          />
          {canBrowseTenantCategoryChildren(row.original.level) ? (
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link
                href={tenantCategoryTrailHref([
                  ...categoryTrail,
                  {
                    id: row.original.id,
                    name: row.original.name,
                    ownershipScope: row.original.ownership_scope,
                    level: row.original.level,
                    returnState: categoryReturnState,
                  },
                ])}
                aria-label={`查看${row.original.name}的下级分类`}
              >
                查看下级
                <ChevronRight data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </div>
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
                <TenantCategoryDialogButton record={row.original} />
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
      emptyText={categoryTrail.length
        ? "当前分类下没有可见下级分类"
        : "当前筛选条件下没有可见分类"}
      minWidth="min-w-[900px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
