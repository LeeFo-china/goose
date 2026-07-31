"use client";

import { Search } from "lucide-react";

import { FormSelect, type SelectOption } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { paymentRequestStatusMeta } from "./payment-request-ui";
import type { PaymentRequestWorkspaceState } from "./payment-request-page-utils";

export function PaymentRequestFilters({
  state,
  keyword,
  loading,
  optionsLoading,
  projectOptions,
  supplierOptions,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
  onKeywordChange,
  onSearch,
  onChange,
  onReset,
}: {
  state: PaymentRequestWorkspaceState;
  keyword: string;
  loading: boolean;
  optionsLoading: boolean;
  projectOptions: SelectOption[];
  supplierOptions: SelectOption[];
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onChange: (patch: Partial<PaymentRequestWorkspaceState>) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldGroup className="grid gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Field className="lg:col-span-2">
          <FieldLabel htmlFor="payment-request-keyword">申请号或原因</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="payment-request-keyword"
              value={keyword}
              maxLength={100}
              disabled={loading}
              placeholder="搜索申请号或原因"
              onChange={(event) => onKeywordChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
            />
            <Button type="button" variant="outline" disabled={loading} onClick={onSearch}>
              <Search data-icon="inline-start" />
              查询
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel>状态</FieldLabel>
          <Select
            value={state.status}
            disabled={loading}
            onValueChange={(status) => onChange({
              status: status as PaymentRequestWorkspaceState["status"],
            })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(paymentRequestStatusMeta).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-request-project">项目</FieldLabel>
          <FormSelect
            id="payment-request-project"
            value={state.projectId}
            options={projectOptions}
            disabled={loading || optionsLoading}
            onChange={(projectId) => onChange({ projectId })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-request-supplier">供应商</FieldLabel>
          <FormSelect
            id="payment-request-supplier"
            value={state.tenantSupplierId}
            options={supplierOptions}
            disabled={loading || optionsLoading}
            onChange={(tenantSupplierId) => onChange({ tenantSupplierId })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-request-created-from">创建开始日期</FieldLabel>
          <Input
            id="payment-request-created-from"
            type="date"
            value={state.createdFrom}
            disabled={loading}
            onChange={(event) => onChange({ createdFrom: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-request-created-to">创建结束日期</FieldLabel>
          <Input
            id="payment-request-created-to"
            type="date"
            value={state.createdTo}
            disabled={loading}
            onChange={(event) => onChange({ createdTo: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>&nbsp;</FieldLabel>
          <Button type="button" variant="ghost" disabled={loading} onClick={onReset}>
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
              disabled={optionsLoading}
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
              disabled={optionsLoading}
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
