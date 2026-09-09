"use client";

import type { ProcurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import { ProcurementPurposeField } from "@/components/supplier-procurement-editor/procurement-purpose-field";
import { ProcurementRemarkField } from "@/components/supplier-procurement-editor/procurement-remark-field";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { loadBatchProjects } from "./batch-api";
import { BatchOptionPicker } from "./batch-option-picker";
import { batchMoney } from "./batch-page-parts";
import type { BatchDraftValidation } from "./batch-rules";
import type { BatchDraft, DestinationType, NamedOption } from "./batch-types";
import { BatchWarehousePicker } from "./batch-warehouse-picker";

export function BatchEditorContext({
  draft,
  project,
  warehouse,
  warehouseBlocker,
  disabled,
  validation,
  onDestinationChange,
  onProjectChange,
  onWarehouseChange,
  onReasonChange,
  onDeliveryDateChange,
  onRemarkChange,
}: {
  draft: BatchDraft;
  project: NamedOption | null;
  warehouse: NamedOption | null;
  warehouseBlocker: string | null;
  disabled: boolean;
  validation: BatchDraftValidation | null;
  onDestinationChange: (destination: DestinationType) => void;
  onProjectChange: (project: NamedOption) => void;
  onWarehouseChange: (warehouse: NamedOption) => void;
  onReasonChange: (reason: string) => void;
  onDeliveryDateChange: (date: string) => void;
  onRemarkChange: (remark: string) => void;
}) {
  return (
    <div className="max-h-[min(14rem,40dvh)] overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
      <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(18rem,1fr)_minmax(17rem,1fr)_minmax(15rem,0.8fr)] [&_button]:min-h-11 md:[&_button]:min-h-9">
        <Tabs
          value={draft.destination_type}
          onValueChange={(type) => {
            if (
              !disabled && (type === "project" || type === "warehouse")
            ) {
              onDestinationChange(type);
            }
          }}
        >
          <TabsList aria-label="采购去向">
            <TabsTrigger value="project" disabled={disabled}>
              项目采购
            </TabsTrigger>
            <TabsTrigger
              value="warehouse"
              disabled={disabled || Boolean(warehouseBlocker)}
            >
              仓库补货
            </TabsTrigger>
          </TabsList>
          <TabsContent value="project">
            <BatchOptionPicker
              id="batch-project"
              label="采购项目"
              value={project}
              load={loadBatchProjects}
              disabled={disabled}
              onChange={onProjectChange}
            />
          </TabsContent>
          <TabsContent value="warehouse">
            {warehouseBlocker
              ? <StatusAlert tone="warning">{warehouseBlocker}</StatusAlert>
              : (
                <BatchWarehousePicker
                  value={warehouse}
                  disabled={disabled}
                  onChange={onWarehouseChange}
                />
              )}
          </TabsContent>
        </Tabs>
        <ProcurementPurposeField
          destinationType={draft.destination_type}
          value={draft.reason}
          disabled={disabled}
          error={validation?.field === "reason"
            ? validation.message
            : undefined}
          onChange={onReasonChange}
        />
        <div className="min-w-0 space-y-3 md:col-span-2 lg:col-span-1">
          <Field>
            <FieldLabel htmlFor="batch-delivery">期望到货日期</FieldLabel>
            <Input
              id="batch-delivery"
              type="date"
              value={draft.expected_delivery_date}
              disabled={disabled}
              onChange={(event) => onDeliveryDateChange(event.target.value)}
            />
          </Field>
          <ProcurementRemarkField
            value={draft.remark}
            disabled={disabled}
            onChange={onRemarkChange}
          />
        </div>
        {warehouseBlocker && draft.destination_type === "project"
          ? (
            <p className="text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
              {warehouseBlocker}
            </p>
          )
          : null}
      </div>
    </div>
  );
}

export function BatchEditorFooter({
  summary,
  loading,
  disabled,
  destinationReady,
  commandBusy,
  hasPendingCommand,
  canRetry,
  onClose,
  onRetry,
  onSave,
}: {
  summary: ProcurementSummary;
  loading: boolean;
  disabled: boolean;
  destinationReady: boolean;
  commandBusy: boolean;
  hasPendingCommand: boolean;
  canRetry: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:flex sm:flex-wrap sm:text-sm"
        aria-live="polite"
      >
        <span>
          <strong className="tabular-nums">{summary.itemCount}</strong> 个 SKU
        </span>
        <span>
          <strong className="tabular-nums">{summary.supplierCount}</strong>{" "}
          家供应商
        </span>
        <span>
          参考货值{" "}
          <strong className="tabular-nums">
            {batchMoney(summary.referenceAmount)}
          </strong>
        </span>
        <span
          className={summary.missingCategoryCount
            ? "font-medium text-warning-foreground"
            : "text-muted-foreground"}
        >
          缺成本类目{" "}
          <strong className="tabular-nums">
            {summary.missingCategoryCount}
          </strong>
        </span>
      </div>
      <div className="flex shrink-0 justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={commandBusy}
          className="min-h-11 md:min-h-9"
          onClick={onClose}
        >
          关闭
        </Button>
        {hasPendingCommand
          ? (
            <Button
              type="button"
              disabled={commandBusy || !canRetry}
              className="min-h-11 md:min-h-9"
              onClick={onRetry}
            >
              {commandBusy ? "正在确认…" : "使用原请求重试"}
            </Button>
          )
          : (
            <Button
              type="button"
              disabled={disabled || !destinationReady}
              className="min-h-11 md:min-h-9"
              onClick={onSave}
            >
              {loading
                ? "正在加载明细…"
                : commandBusy
                ? "正在保存…"
                : "保存草稿"}
            </Button>
          )}
      </div>
    </div>
  );
}
