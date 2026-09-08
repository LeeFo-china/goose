"use client";

import { useEffect, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import { ProcurementConfirmDialog } from "@/components/supplier-procurement-editor/procurement-confirm-dialog";
import { procurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import { ProcurementPurposeField } from "@/components/supplier-procurement-editor/procurement-purpose-field";
import { ProcurementRemarkField } from "@/components/supplier-procurement-editor/procurement-remark-field";
import { ProcurementWorkbenchLayout } from "@/components/supplier-procurement-editor/procurement-workbench-layout";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { loadBatchItems, loadBatchProjects } from "./batch-api";
import { BatchCatalog } from "./batch-catalog";
import { BatchLines } from "./batch-lines";
import { BatchOptionPicker } from "./batch-option-picker";
import { batchMoney } from "./batch-page-parts";
import {
  type BatchContextChange,
  batchContextChangeRequiresConfirmation,
  batchDraftFromDetail,
  type BatchDraftValidation,
  batchError,
  changeDestination,
  draftPayload,
  isSameBatchContext,
  validateBatchDraft,
} from "./batch-rules";
import { BatchWarehousePicker } from "./batch-warehouse-picker";
import { useBatchCommand } from "./use-batch-command";
import type {
  BatchCommandResult,
  BatchDetail,
  BatchDraft,
  NamedOption,
} from "./batch-types";

const RECENTLY_ADDED_FEEDBACK_MS = 1_600;

export function BatchEditor({
  record,
  warehouseBlocker,
  onClose,
  onAccepted,
}: {
  record: BatchDetail | null;
  warehouseBlocker: string | null;
  onClose: () => void;
  onAccepted: (result: BatchCommandResult) => void;
}) {
  const [draft, setDraft] = useState<BatchDraft>(() => batchDraftFromDetail(record));
  const [project, setProject] = useState<NamedOption | null>(
    record?.project ?? null,
  );
  const [warehouse, setWarehouse] = useState<NamedOption | null>(
    record?.warehouse ?? null,
  );
  const [loading, setLoading] = useState(Boolean(record));
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [validation, setValidation] = useState<BatchDraftValidation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingContext, setPendingContext] = useState<BatchContextChange | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [recentlyAddedSkuId, setRecentlyAddedSkuId] = useState<string | null>(null);
  const command = useBatchCommand(record?.id ?? "new", onAccepted, () => {});

  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    loadBatchItems(record.id, 1, 100, controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      if (items.pagination.total > 100) {
        setLoadError("批次明细超出 100 行上限，请联系管理员核查");
        return;
      }
      setDraft((current) => ({
        ...current,
        lines: items.list.map((item) => ({
          supplier_sku_id: item.supplier_sku_id,
          supplier_id: item.supplier_id,
          supplier_name: item.supplier_name_snapshot,
          quantity: item.quantity,
          cost_category_id: item.cost_category_id,
          name: `${item.product_name_snapshot} · ${item.sku_name_snapshot}`,
          sku_code: item.sku_code_snapshot,
          unit_price: item.unit_price,
          purchase_unit_name: item.purchase_unit_name_snapshot,
        })),
      }));
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setLoadError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [record, retry]);

  useEffect(() => {
    if (!recentlyAddedSkuId) return;
    const timeout = window.setTimeout(
      () => setRecentlyAddedSkuId(null),
      RECENTLY_ADDED_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedSkuId]);

  const disabled = loading || Boolean(loadError) || command.busy ||
    Boolean(command.pending) || !command.ready;
  const destinationReady = draft.destination_type === "project"
    ? Boolean(draft.project_id)
    : Boolean(draft.warehouse_id) && !warehouseBlocker;
  const summary = procurementSummary(draft.lines.map((line) => ({
    supplierId: line.supplier_id,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    costCategoryId: line.cost_category_id,
  })));

  function updateDraft(next: (current: BatchDraft) => BatchDraft) {
    setDraft(next);
    setDirty(true);
    setValidation(null);
  }

  function applyContextChange(change: BatchContextChange) {
    setRecentlyAddedSkuId(null);
    if (change.kind === "destination") {
      updateDraft((current) =>
        changeDestination(current, change.destinationType)
      );
      setProject(null);
      setWarehouse(null);
      return;
    }
    if (change.kind === "project") {
      setProject(change.option);
      setWarehouse(null);
      updateDraft((current) => ({
        ...current,
        project_id: change.option.id,
        warehouse_id: null,
        lines: [],
      }));
      return;
    }
    setWarehouse(change.option);
    setProject(null);
    updateDraft((current) => ({
      ...current,
      project_id: null,
      warehouse_id: change.option.id,
      lines: [],
    }));
  }

  function requestContextChange(change: BatchContextChange) {
    if (isSameBatchContext(change, draft, project, warehouse)) return;
    if (batchContextChangeRequiresConfirmation(draft)) {
      setPendingContext(change);
      return;
    }
    applyContextChange(change);
  }

  function requestClose() {
    if (command.busy) return;
    if (command.pending || !dirty) {
      onClose();
      return;
    }
    setConfirmClose(true);
  }

  function save() {
    if (
      disabled || (draft.destination_type === "warehouse" && warehouseBlocker)
    ) return;
    const nextValidation = validateBatchDraft(draft);
    setValidation(nextValidation);
    if (!nextValidation) {
      void command.execute(
        "save-draft",
        record?.id ?? "new",
        draftPayload(draft, record?.version ?? 0),
      );
    }
  }

  const alerts = loadError || command.pending || command.error || validation
    ? (
      <div className="space-y-2 border-b px-5 py-3">
        {loadError
          ? (
            <StatusAlert>
              {loadError}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRetry((value) => value + 1)}
              >
                重试明细
              </Button>
            </StatusAlert>
          )
          : null}
        {command.pending
          ? (
            <StatusAlert tone="warning">
              存在结果未确认的{command.pending.kind === "save-draft"
                ? "保存"
                : "采购"}请求，字段已锁定。请使用原请求重试；关闭窗口不会清除请求。
            </StatusAlert>
          )
          : null}
        {command.error || validation
          ? <StatusAlert>{command.error || validation?.message}</StatusAlert>
          : null}
      </div>
    )
    : null;

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-[76rem]">
          <SheetTitle className="sr-only">
            {record ? "编辑采购批次" : "新建采购批次"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            选择采购去向和商品，填写数量及成本类目后保存草稿。
          </SheetDescription>
          <ProcurementWorkbenchLayout
            title={record ? "编辑采购批次" : "新建采购批次"}
            alerts={alerts}
            context={
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,1fr)_minmax(17rem,1fr)_minmax(15rem,0.8fr)]">
                <Tabs
                  value={draft.destination_type}
                  onValueChange={(type) => {
                    if (
                      !disabled &&
                      (type === "project" || type === "warehouse")
                    ) {
                      requestContextChange({
                        kind: "destination",
                        destinationType: type,
                      });
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
                      onChange={(option) =>
                        requestContextChange({ kind: "project", option })}
                    />
                  </TabsContent>
                  <TabsContent value="warehouse">
                    {warehouseBlocker
                      ? (
                        <StatusAlert tone="warning">
                          {warehouseBlocker}
                        </StatusAlert>
                      )
                      : (
                        <BatchWarehousePicker
                          value={warehouse}
                          disabled={disabled}
                          onChange={(option) =>
                            requestContextChange({
                              kind: "warehouse",
                              option,
                            })}
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
                  onChange={(reason) =>
                    updateDraft((current) => ({ ...current, reason }))}
                />
                <div className="min-w-0 space-y-3">
                  <Field>
                    <FieldLabel htmlFor="batch-delivery">
                      期望到货日期
                    </FieldLabel>
                    <Input
                      id="batch-delivery"
                      type="date"
                      value={draft.expected_delivery_date}
                      disabled={disabled}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          expected_delivery_date: event.target.value,
                        }))}
                    />
                  </Field>
                  <ProcurementRemarkField
                    value={draft.remark}
                    disabled={disabled}
                    onChange={(remark) =>
                      updateDraft((current) => ({ ...current, remark }))}
                  />
                </div>
                {warehouseBlocker && draft.destination_type === "project"
                  ? (
                    <p className="text-sm text-muted-foreground xl:col-span-3">
                      {warehouseBlocker}
                    </p>
                  )
                  : null}
              </div>
            }
            catalog={destinationReady
              ? (
                <BatchCatalog
                  key={`${draft.destination_type}:${draft.project_id}:${draft.warehouse_id}`}
                  destination={draft}
                  lines={draft.lines}
                  disabled={disabled}
                  onAdd={(item) => {
                    setRecentlyAddedSkuId(item.supplier_sku_id);
                    updateDraft((current) => ({
                      ...current,
                      lines: [...current.lines, {
                        supplier_sku_id: item.supplier_sku_id,
                        supplier_id: item.supplier_id,
                        supplier_name: item.supplier_name,
                        name: `${item.product_name} · ${item.sku_name}`,
                        sku_code: item.sku_code,
                        quantity: "1",
                        cost_category_id: item.default_cost_category_id ?? "",
                        category_name: item.default_cost_category_name ?? "",
                        unit_price: item.unit_price,
                        purchase_unit_name: item.purchase_unit_name,
                      }],
                    }));
                  }}
                />
              )
              : (
                <div className="flex min-h-48 items-center justify-center px-5 py-10 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">
                    先选择采购项目或仓库，再从商品目录加入商品。
                  </p>
                </div>
              )}
            selection={
              <BatchLines
                lines={draft.lines}
                disabled={disabled}
                recentlyAddedSkuId={recentlyAddedSkuId}
                onChange={(lines) => {
                  if (
                    recentlyAddedSkuId &&
                    !lines.some((line) =>
                      line.supplier_sku_id === recentlyAddedSkuId
                    )
                  ) {
                    setRecentlyAddedSkuId(null);
                  }
                  updateDraft((current) => ({ ...current, lines }));
                }}
              />
            }
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                  aria-live="polite"
                >
                  <span>
                    <strong className="tabular-nums">
                      {summary.itemCount}
                    </strong>{" "}
                    个 SKU
                  </span>
                  <span>
                    <strong className="tabular-nums">
                      {summary.supplierCount}
                    </strong>{" "}
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
                    disabled={command.busy}
                    onClick={requestClose}
                  >
                    关闭
                  </Button>
                  {command.pending
                    ? (
                      <Button
                        type="button"
                        disabled={command.busy || !command.canRetry}
                        onClick={command.retry}
                      >
                        {command.busy ? "正在确认…" : "使用原请求重试"}
                      </Button>
                    )
                    : (
                      <Button
                        type="button"
                        disabled={disabled || !destinationReady}
                        onClick={save}
                      >
                        {loading
                          ? "正在加载明细…"
                          : command.busy
                          ? "正在保存…"
                          : "保存草稿"}
                      </Button>
                    )}
                </div>
              </div>
            }
          />
        </SheetContent>
      </Sheet>
      <ProcurementConfirmDialog
        open={Boolean(pendingContext)}
        title="更换采购范围？"
        description={`更换去向、项目或仓库会清空 ${draft.lines.length} 个已选商品。`}
        confirmLabel="清空并更换"
        onCancel={() => setPendingContext(null)}
        onConfirm={() => {
          if (pendingContext) applyContextChange(pendingContext);
          setPendingContext(null);
        }}
      />
      <ProcurementConfirmDialog
        open={confirmClose}
        title="放弃未保存的更改？"
        description="当前采购批次有尚未保存的修改，关闭后这些修改不会保留。"
        confirmLabel="放弃更改"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
}
