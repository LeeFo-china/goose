"use client";

import { Search } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type {
  RequisitionBudgetStatus,
  RequisitionStatus,
} from "./requisition-types";

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "pending_approval", label: "待审批" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已驳回" },
  { value: "cancelled", label: "已取消" },
  { value: "converted", label: "已生成采购单" },
] as const;
const budgetOptions = [
  { value: "all", label: "全部预算状态" },
  { value: "unchecked", label: "未检查" },
  { value: "within_budget", label: "预算内" },
  { value: "over_budget", label: "超预算" },
] as const;

export function RequisitionFilters({
  keyword,
  status,
  budgetStatus,
  projectId,
  tenantSupplierId,
  projectOptions,
  supplierOptions,
  loading,
  loadingMore,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  onKeywordChange,
  onSearch,
  onStatusChange,
  onBudgetStatusChange,
  onProjectChange,
  onSupplierChange,
  onPendingApproval,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
}: {
  keyword: string;
  status: RequisitionStatus | "all";
  budgetStatus: RequisitionBudgetStatus | "all";
  projectId: string;
  tenantSupplierId: string;
  projectOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  loadingMore: boolean;
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onStatusChange: (value: RequisitionStatus | "all") => void;
  onBudgetStatusChange: (
    value: RequisitionBudgetStatus | "all",
  ) => void;
  onProjectChange: (value: string) => void;
  onSupplierChange: (value: string) => void;
  onPendingApproval: () => void;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
        <Input
          aria-label="搜索采购申请"
          value={keyword}
          placeholder="搜索申请号"
          disabled={loading}
          onChange={(event) => onKeywordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
        />
        <FormSelect
          id="requisition-status-filter"
          value={status}
          options={statusOptions}
          disabled={loading}
          onChange={(value) =>
            onStatusChange(value as RequisitionStatus | "all")}
        />
        <FormSelect
          id="requisition-budget-filter"
          value={budgetStatus}
          options={budgetOptions}
          disabled={loading}
          onChange={(value) =>
            onBudgetStatusChange(value as RequisitionBudgetStatus | "all")}
        />
        <FormSelect
          id="requisition-project-filter"
          value={projectId}
          options={projectOptions}
          disabled={loading}
          onChange={onProjectChange}
        />
        <FormSelect
          id="requisition-supplier-filter"
          value={tenantSupplierId}
          options={supplierOptions}
          disabled={loading}
          onChange={onSupplierChange}
        />
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={onSearch}
        >
          <Search data-icon="inline-start" />
          搜索
        </Button>
      </div>
      <div>
        <Button
          type="button"
          size="sm"
          variant={status === "pending_approval" ? "secondary" : "outline"}
          disabled={loading}
          onClick={onPendingApproval}
        >
          待审批
        </Button>
        {canLoadMoreProjects ? (
          <Button type="button" size="sm" variant="ghost"
            disabled={loadingMore} onClick={onLoadMoreProjects}>
            加载更多项目筛选项
          </Button>
        ) : null}
        {canLoadMoreSuppliers ? (
          <Button type="button" size="sm" variant="ghost"
            disabled={loadingMore} onClick={onLoadMoreSuppliers}>
            加载更多供应商筛选项
          </Button>
        ) : null}
      </div>
    </div>
  );
}
