"use client";

import { Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { InventoryWarehouseFilter } from "@/components/inventory/inventory-warehouse-filter";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  changeOrderDestination,
  type OrderDestinationFilters,
} from "./purchase-order-destination-filters";

type Props = {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onReset: () => void;
  loading: boolean;
  destination: OrderDestinationFilters;
  onDestinationChange: (value: OrderDestinationFilters) => void;
  canViewWarehouses: boolean;
  projectOptions: { value: string; label: string }[];
  supplierOptions: { value: string; label: string }[];
  tenantSupplierId: string;
  onSupplierChange: (value: string) => void;
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  loadingMoreOptions: boolean;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
};

export function PurchaseOrderFilters(props: Props) {
  const { destination, onDestinationChange } = props;
  const options = [
    { value: "all", label: "全部去向" },
    { value: "project", label: "项目采购" },
    ...(props.canViewWarehouses
      ? [{ value: "warehouse", label: "仓库补货" }]
      : []),
  ];
  return (
    <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Field>
        <FieldLabel htmlFor="purchase-order-keyword">采购单号</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id="purchase-order-keyword"
            aria-label="搜索采购单"
            value={props.keyword}
            maxLength={80}
            placeholder="搜索采购单号"
            onChange={(event) => props.onKeywordChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onSearch();
            }}
          />
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="purchase-order-destination-filter">
          采购去向
        </FieldLabel>
        <FormSelect
          id="purchase-order-destination-filter"
          value={destination.destinationType}
          options={options}
          onChange={(value) => {
            if (
              value === "all" || value === "project" ||
              (value === "warehouse" && props.canViewWarehouses)
            ) onDestinationChange(changeOrderDestination(destination, value));
          }}
        />
      </Field>
      {destination.destinationType === "warehouse" && props.canViewWarehouses
        ? (
          <InventoryWarehouseFilter
            canViewWarehouses
            value={destination.warehouse}
            onChange={(warehouse) =>
              onDestinationChange({
                ...destination,
                projectId: "all",
                warehouse,
              })}
          />
        )
        : (
          <Field>
            <FieldLabel htmlFor="purchase-order-project-filter">
              项目
            </FieldLabel>
            <FormSelect
              id="purchase-order-project-filter"
              value={destination.projectId}
              options={props.projectOptions}
              onChange={(projectId) =>
                onDestinationChange({
                  ...destination,
                  projectId,
                  warehouse: null,
                })}
            />
            {props.canLoadMoreProjects && (
              <Button
                variant="link"
                size="sm"
                disabled={props.loadingMoreOptions}
                onClick={props.onLoadMoreProjects}
              >
                加载更多项目
              </Button>
            )}
          </Field>
        )}
      <Field>
        <FieldLabel htmlFor="purchase-order-supplier-filter">供应商</FieldLabel>
        <FormSelect
          id="purchase-order-supplier-filter"
          value={props.tenantSupplierId}
          options={props.supplierOptions}
          onChange={props.onSupplierChange}
        />
        {props.canLoadMoreSuppliers && (
          <Button
            variant="link"
            size="sm"
            disabled={props.loadingMoreOptions}
            onClick={props.onLoadMoreSuppliers}
          >
            加载更多供应商
          </Button>
        )}
      </Field>
      <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
        <Button
          type="button"
          variant="outline"
          disabled={props.loading}
          onClick={props.onSearch}
        >
          搜索
        </Button>
        <Button type="button" variant="ghost" onClick={props.onReset}>
          清除筛选
        </Button>
      </div>
    </FieldGroup>
  );
}
