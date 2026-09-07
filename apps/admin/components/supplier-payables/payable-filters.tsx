"use client";

import { RotateCcw } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { InventoryWarehouseFilter } from "@/components/inventory/inventory-warehouse-filter";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { PayableFiltersState } from "./use-payable-list";

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "open", label: "待申请" },
  { value: "reserved", label: "已申请待付" },
  { value: "partially_paid", label: "部分付款" },
  { value: "paid", label: "已付清" },
  { value: "overdue", label: "已逾期" },
] as const;

type PayableFiltersProps = {
  canViewWarehouses: boolean;
  filters: PayableFiltersState;
  projectOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  purchaseOrderOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  loadingMoreOptions: boolean;
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  canLoadMorePurchaseOrders: boolean;
  onChange: (
    patch: Partial<Omit<PayableFiltersState, "page">>,
  ) => void;
  onReset: () => void;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
  onLoadMorePurchaseOrders: () => void;
};

export function PayableFilters({
  canViewWarehouses,
  filters,
  projectOptions,
  supplierOptions,
  purchaseOrderOptions,
  loading,
  loadingMoreOptions,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  canLoadMorePurchaseOrders,
  onChange,
  onReset,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
  onLoadMorePurchaseOrders,
}: PayableFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <Field>
          <FieldLabel htmlFor="payable-destination">采购去向</FieldLabel>
          <FormSelect id="payable-destination" value={filters.destinationType}
            options={[{ value: "all", label: "全部去向" }, { value: "project", label: "项目采购" },
              ...(canViewWarehouses ? [{ value: "warehouse", label: "仓库补货" }] : [])]}
            onChange={(destinationType) => {
              if (destinationType === "all" || destinationType === "project" || (destinationType === "warehouse" && canViewWarehouses)) onChange({ destinationType });
            }} />
        </Field>
        {filters.destinationType === "warehouse" && canViewWarehouses ? (
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
          <InventoryWarehouseFilter canViewWarehouses value={filters.warehouseId === "all" ? null : { id: filters.warehouseId, name: filters.warehouseName || "已选仓库" }}
            onChange={(warehouse) => onChange({ warehouseId: warehouse?.id ?? "all", warehouseName: warehouse?.name ?? "", projectId: "all" })} />
          </div>
        ) : (
        <Field>
          <FieldLabel htmlFor="payable-project-filter">项目</FieldLabel>
          <FormSelect
            id="payable-project-filter"
            value={filters.projectId}
            options={projectOptions}
            disabled={loading}
            onChange={(projectId) => onChange({ projectId })}
          />
        </Field>
        )}
        <Field>
          <FieldLabel htmlFor="payable-supplier-filter">供应商</FieldLabel>
          <FormSelect
            id="payable-supplier-filter"
            value={filters.tenantSupplierId}
            options={supplierOptions}
            disabled={loading}
            onChange={(tenantSupplierId) => onChange({ tenantSupplierId })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payable-purchase-order-filter">
            采购单
          </FieldLabel>
          <FormSelect
            id="payable-purchase-order-filter"
            value={filters.purchaseOrderId}
            options={purchaseOrderOptions}
            disabled={loading}
            onChange={(purchaseOrderId) => onChange({ purchaseOrderId })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payable-status-filter">状态</FieldLabel>
          <FormSelect
            id="payable-status-filter"
            value={filters.status}
            options={statusOptions}
            disabled={loading}
            onChange={(status) => onChange({
              status: status as PayableFiltersState["status"],
            })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payable-due-from">到期开始日期</FieldLabel>
          <Input
            id="payable-due-from"
            type="date"
            value={filters.dueFrom}
            disabled={loading}
            onChange={(event) => onChange({ dueFrom: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payable-due-to">到期结束日期</FieldLabel>
          <Input
            id="payable-due-to"
            type="date"
            value={filters.dueTo}
            disabled={loading}
            onChange={(event) => onChange({ dueTo: event.target.value })}
          />
        </Field>
        <Field className="justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onReset}
          >
            <RotateCcw data-icon="inline-start" />
            重置筛选
          </Button>
        </Field>
      </FieldGroup>
      <LoadMoreFilterOptions
        loading={loadingMoreOptions}
        projects={canLoadMoreProjects}
        suppliers={canLoadMoreSuppliers}
        purchaseOrders={canLoadMorePurchaseOrders}
        onProjects={onLoadMoreProjects}
        onSuppliers={onLoadMoreSuppliers}
        onPurchaseOrders={onLoadMorePurchaseOrders}
      />
    </div>
  );
}

function LoadMoreFilterOptions({
  loading,
  projects,
  suppliers,
  purchaseOrders,
  onProjects,
  onSuppliers,
  onPurchaseOrders,
}: {
  loading: boolean;
  projects: boolean;
  suppliers: boolean;
  purchaseOrders: boolean;
  onProjects: () => void;
  onSuppliers: () => void;
  onPurchaseOrders: () => void;
}) {
  if (!projects && !suppliers && !purchaseOrders) return null;
  const actions = [
    { visible: projects, label: "加载更多项目筛选项", onClick: onProjects },
    { visible: suppliers, label: "加载更多供应商筛选项", onClick: onSuppliers },
    {
      visible: purchaseOrders,
      label: "加载更多采购单筛选项",
      onClick: onPurchaseOrders,
    },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.filter(({ visible }) => visible).map(({ label, onClick }) => (
        <Button
          key={label}
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={onClick}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
