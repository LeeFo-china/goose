"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { BatchOptionPicker } from "./batch-option-picker";
import {
  type BatchFilters as Filters,
  loadBatchProjects,
  loadBatchWarehouses,
} from "./batch-api";
import { BATCH_STATUS_LABELS } from "./batch-rules";
import type { NamedOption } from "./batch-types";

const loadHistoricalWarehouses = (
  page: number,
  keyword: string,
  signal?: AbortSignal,
) => loadBatchWarehouses(page, keyword, false, signal);
export function BatchFilters(
  { filters, canViewWarehouses, onChange }: {
    filters: Filters;
    canViewWarehouses: boolean;
    onChange: (filters: Filters) => void;
  },
) {
  const [keyword, setKeyword] = useState(filters.keyword ?? "");
  useEffect(() => {
    setKeyword(filters.keyword ?? "");
  }, [filters.keyword]);
  const [project, setProject] = useState<NamedOption | null>(null);
  const [warehouse, setWarehouse] = useState<NamedOption | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]">
        <Field>
          <FieldLabel htmlFor="batch-keyword">搜索批次</FieldLabel>
          <div className="flex gap-2">
            <InputGroup>
              <InputGroupAddon>
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                id="batch-keyword"
                placeholder="批次编号 / 采购原因"
                maxLength={80}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onChange({
                      ...filters,
                      keyword: keyword.trim() || undefined,
                    });
                  }
                }}
              />
            </InputGroup>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({ ...filters, keyword: keyword.trim() || undefined })}
            >
              搜索
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="batch-status">状态</FieldLabel>
          <FormSelect
            id="batch-status"
            value={filters.status ?? "all"}
            options={[
              { value: "all", label: "全部状态" },
              ...Object.entries(BATCH_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(status) =>
              onChange({
                ...filters,
                status: status in BATCH_STATUS_LABELS
                  ? status as Filters["status"]
                  : undefined,
              })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="batch-destination-filter">采购去向</FieldLabel>
          <FormSelect
            id="batch-destination-filter"
            value={filters.destinationType ?? "all"}
            options={[
              { value: "all", label: "全部去向" },
              { value: "project", label: "项目采购" },
              ...(canViewWarehouses
                ? [{ value: "warehouse", label: "仓库补货" }]
                : []),
            ]}
            onChange={(value) => {
              setProject(null);
              setWarehouse(null);
              onChange({
                ...filters,
                destinationType: value === "project" || value === "warehouse"
                  ? value
                  : undefined,
                projectId: undefined,
                warehouseId: undefined,
              });
            }}
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setKeyword("");
            setProject(null);
            setWarehouse(null);
            onChange({});
          }}
        >
          清除筛选
        </Button>
      </div>
      {filters.destinationType === "project"
        ? (
          <div className="max-w-lg">
            <BatchOptionPicker
              id="batch-filter-project"
              label="项目"
              value={project}
              load={loadBatchProjects}
              onChange={(next) => {
                setProject(next);
                onChange({
                  ...filters,
                  projectId: next.id,
                  warehouseId: undefined,
                });
              }}
            />
          </div>
        )
        : filters.destinationType === "warehouse" && canViewWarehouses
        ? (
          <div className="max-w-lg">
            <BatchOptionPicker
              id="batch-filter-warehouse"
              label="仓库"
              value={warehouse}
              load={loadHistoricalWarehouses}
              onChange={(next) => {
                setWarehouse(next);
                onChange({
                  ...filters,
                  projectId: undefined,
                  warehouseId: next.id,
                });
              }}
            />
          </div>
        )
        : null}
    </div>
  );
}
