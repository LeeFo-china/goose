"use client";

import { RotateCcw } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
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

export function PayableFilters({
  filters,
  projectOptions,
  supplierOptions,
  loading,
  loadingMoreOptions,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  onChange,
  onReset,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
}: {
  filters: PayableFiltersState;
  projectOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  loadingMoreOptions: boolean;
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  onChange: (
    patch: Partial<Omit<PayableFiltersState, "page">>,
  ) => void;
  onReset: () => void;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
      {canLoadMoreProjects || canLoadMoreSuppliers ? (
        <div className="flex flex-wrap gap-2">
          {canLoadMoreProjects ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loadingMoreOptions}
              onClick={onLoadMoreProjects}
            >
              加载更多项目筛选项
            </Button>
          ) : null}
          {canLoadMoreSuppliers ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loadingMoreOptions}
              onClick={onLoadMoreSuppliers}
            >
              加载更多供应商筛选项
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
