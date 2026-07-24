"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { SupplierCatalogStatusAction } from "./supplier-catalog-actions";
import {
  CatalogBrandDialogButton,
  CatalogCategoryDialogButton,
  CatalogUnitDialogButton,
} from "./supplier-catalog-dialogs";
import { categoryTrailHref } from "./supplier-catalog-rules";
import {
  catalogStatusMeta,
  formatCatalogDate,
  type CatalogBrand,
  type CatalogCategory,
  type CatalogUnit,
  type CatalogView,
  type CategoryReturnState,
  type CategoryTrailItem,
} from "./supplier-catalog-types";

export function SupplierCatalogTable({
  view,
  categories,
  brands,
  units,
  categoryTrail,
  categoryReturnState,
}: {
  view: CatalogView;
  categories: CatalogCategory[];
  brands: CatalogBrand[];
  units: CatalogUnit[];
  categoryTrail: CategoryTrailItem[];
  categoryReturnState: CategoryReturnState;
}) {
  if (view === "categories") {
    return (
      <CategoryTable
        records={categories}
        categoryTrail={categoryTrail}
        categoryReturnState={categoryReturnState}
      />
    );
  }
  if (view === "brands") return <BrandTable records={brands} />;
  return <UnitTable records={units} />;
}

function CategoryTable({
  records,
  categoryTrail,
  categoryReturnState,
}: {
  records: CatalogCategory[];
  categoryTrail: CategoryTrailItem[];
  categoryReturnState: CategoryReturnState;
}) {
  const parentName = categoryTrail.at(-1)?.name ?? "根级";
  const columns: ColumnDef<CatalogCategory>[] = [
    {
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.code}</span>
      ),
      meta: { cellClassName: "min-w-[140px]" },
    },
    {
      accessorKey: "name",
      header: "名称",
      cell: ({ row }) => (
        <div className="flex min-w-[180px] items-center gap-2">
          <span className="truncate font-semibold">{row.original.name}</span>
          {row.original.level < 6 ? (
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link
                href={categoryTrailHref([
                  ...categoryTrail,
                  {
                    id: row.original.id,
                    name: row.original.name,
                    returnState: categoryReturnState,
                  },
                ])}
                aria-label={`查看${row.original.name}的下级类目`}
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
      accessorKey: "level",
      header: "层级",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.level}</span>
      ),
    },
    {
      accessorKey: "parent_id",
      header: "上级类目",
      cell: () => parentName,
      meta: { cellClassName: "whitespace-nowrap" },
    },
    statusColumn<CatalogCategory>(),
    sortColumn<CatalogCategory>(),
    updatedAtColumn<CatalogCategory>(),
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <CatalogCategoryDialogButton
            record={row.original}
            parentId={row.original.parent_id}
            parentName={parentName}
            parentLevel={Math.max(0, row.original.level - 1)}
          />
          <SupplierCatalogStatusAction
            kind="category"
            record={row.original}
          />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={records}
      emptyText={
        categoryTrail.length
          ? "当前类目下还没有下级类目，可直接新建"
          : "尚未建立标准类目，可从根级开始新建"
      }
      minWidth="min-w-[980px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

function BrandTable({ records }: { records: CatalogBrand[] }) {
  const columns: ColumnDef<CatalogBrand>[] = [
    {
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.code}</span>
      ),
      meta: { cellClassName: "min-w-[140px]" },
    },
    {
      accessorKey: "name",
      header: "品牌",
      cell: ({ row }) => (
        <span className="font-semibold">{row.original.name}</span>
      ),
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      accessorKey: "legal_name",
      header: "法定名称",
      cell: ({ row }) => row.original.legal_name || "-",
      meta: { cellClassName: "min-w-[220px]" },
    },
    statusColumn<CatalogBrand>(),
    sortColumn<CatalogBrand>(),
    updatedAtColumn<CatalogBrand>(),
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <CatalogBrandDialogButton record={row.original} />
          <SupplierCatalogStatusAction kind="brand" record={row.original} />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={records}
      emptyText="当前筛选条件下没有品牌"
      minWidth="min-w-[920px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

function UnitTable({ records }: { records: CatalogUnit[] }) {
  const columns: ColumnDef<CatalogUnit>[] = [
    {
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.code}</span>
      ),
      meta: { cellClassName: "min-w-[140px]" },
    },
    {
      accessorKey: "name",
      header: "名称 / 符号",
      cell: ({ row }) => (
        <div>
          <div className="font-semibold">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.symbol}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[160px]" },
    },
    {
      accessorKey: "base_unit_id",
      header: "基准单位",
      cell: ({ row }) => {
        if (!row.original.base_unit_id) return "本身";
        const baseUnit = row.original.base_unit;
        return baseUnit
          ? `${baseUnit.name}（${baseUnit.symbol}） · ${baseUnit.code}`
          : "基准单位信息缺失";
      },
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      accessorKey: "conversion_factor",
      header: "换算系数",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.conversion_factor}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    statusColumn<CatalogUnit>(),
    updatedAtColumn<CatalogUnit>(),
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <CatalogUnitDialogButton
            record={row.original}
          />
          <SupplierCatalogStatusAction kind="unit" record={row.original} />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={records}
      emptyText="当前筛选条件下没有单位"
      minWidth="min-w-[960px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

function statusColumn<RecordType extends {
  status: "active" | "inactive";
}>(): ColumnDef<RecordType> {
  return {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = catalogStatusMeta[row.original.status];
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: { cellClassName: "whitespace-nowrap" },
  };
}
function sortColumn<RecordType extends {
  sort_order: number;
}>(): ColumnDef<RecordType> {
  return {
    accessorKey: "sort_order",
    header: "排序",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.sort_order}</span>
    ),
  };
}

function updatedAtColumn<RecordType extends {
  updated_at: string;
}>(): ColumnDef<RecordType> {
  return {
    accessorKey: "updated_at",
    header: "更新时间",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        {formatCatalogDate(row.original.updated_at)}
      </span>
    ),
  };
}
