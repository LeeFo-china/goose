"use client";

import { useEffect, useState } from "react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadBatchItems, loadBatchProjects } from "./batch-api";
import { BatchCatalog } from "./batch-catalog";
import { BatchLines } from "./batch-lines";
import { BatchOptionPicker } from "./batch-option-picker";
import { BatchWarehousePicker } from "./batch-warehouse-picker";
import {
  batchError,
  changeDestination,
  draftError,
  draftPayload,
  newBatchDraft,
} from "./batch-rules";
import { useBatchCommand } from "./use-batch-command";
import type {
  BatchCommandResult,
  BatchDetail,
  BatchDraft,
  NamedOption,
} from "./batch-types";

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
  const [draft, setDraft] = useState<BatchDraft>(() =>
    record
      ? {
        ...newBatchDraft(),
        destination_type: record.destination_type,
        project_id: record.project_id,
        warehouse_id: record.warehouse_id,
        reason: record.reason,
        remark: record.remark ?? "",
        expected_delivery_date: record.expected_delivery_date ?? "",
      }
      : newBatchDraft()
  );
  const [project, setProject] = useState<NamedOption | null>(
    record?.project ?? null,
  );
  const [warehouse, setWarehouse] = useState<NamedOption | null>(
    record?.warehouse ?? null,
  );
  const [loading, setLoading] = useState(Boolean(record));
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [validation, setValidation] = useState("");
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
        })),
      }));
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setLoadError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [record, retry]);
  const disabled = loading || Boolean(loadError) || command.busy ||
    Boolean(command.pending) || !command.ready;
  const destinationReady = draft.destination_type === "project"
    ? Boolean(draft.project_id)
    : Boolean(draft.warehouse_id) && !warehouseBlocker;
  function save() {
    if (
      disabled || (draft.destination_type === "warehouse" && warehouseBlocker)
    ) return;
    const error = draftError(draft);
    setValidation(error ?? "");
    if (!error) {
      void command.execute(
        "save-draft",
        record?.id ?? "new",
        draftPayload(draft, record?.version ?? 0),
      );
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !command.busy) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-5xl">
        <SheetHeader className="shrink-0 border-b p-5 pr-12">
          <SheetTitle>{record ? "编辑采购批次" : "新建采购批次"}</SheetTitle>
          <SheetDescription>
            按采购去向选择商品，保存后统一冻结价格并预览供应商拆单。
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
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
            ? <StatusAlert>{command.error || validation}</StatusAlert>
            : null}
          <FieldGroup>
            <Tabs
              value={draft.destination_type}
              onValueChange={(type) => {
                if (!disabled && (type === "project" || type === "warehouse")) {
                  setDraft(changeDestination(draft, type));
                  setProject(null);
                  setWarehouse(null);
                  setValidation("");
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
                  onChange={(next) => {
                    setProject(next);
                    setDraft((current) => ({
                      ...current,
                      project_id: next.id,
                      warehouse_id: null,
                      lines: [],
                    }));
                  }}
                />
              </TabsContent>
              <TabsContent value="warehouse">
                {warehouseBlocker
                  ? <StatusAlert tone="warning">{warehouseBlocker}</StatusAlert>
                  : (
                    <BatchWarehousePicker
                      value={warehouse}
                      disabled={disabled}
                      onChange={(next) => {
                        setWarehouse(next);
                        setDraft((current) => ({
                          ...current,
                          project_id: null,
                          warehouse_id: next.id,
                          lines: [],
                        }));
                      }}
                    />
                  )}
              </TabsContent>
            </Tabs>
            {warehouseBlocker && draft.destination_type === "project"
              ? (
                <p className="text-sm text-muted-foreground">
                  {warehouseBlocker}
                </p>
              )
              : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="batch-reason">采购原因（必填）</FieldLabel>
                <Textarea
                  id="batch-reason"
                  value={draft.reason}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, reason: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="batch-delivery">期望到货日期</FieldLabel>
                <Input
                  id="batch-delivery"
                  type="date"
                  value={draft.expected_delivery_date}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      expected_delivery_date: event.target.value,
                    })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="batch-remark">备注</FieldLabel>
              <Textarea
                id="batch-remark"
                value={draft.remark}
                maxLength={500}
                disabled={disabled}
                onChange={(event) =>
                  setDraft({ ...draft, remark: event.target.value })}
              />
            </Field>
          </FieldGroup>
          {destinationReady
            ? (
              <BatchCatalog
                key={`${draft.destination_type}:${draft.project_id}:${draft.warehouse_id}`}
                destination={draft}
                lines={draft.lines}
                disabled={disabled}
                onAdd={(item) =>
                  setDraft((current) => ({
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
                    }],
                  }))}
              />
            )
            : (
              <p className="text-sm text-muted-foreground">
                先选择有效采购去向，再加载可采购商品。切换项目或仓库会清空已选商品。
              </p>
            )}
          <BatchLines
            lines={draft.lines}
            disabled={disabled}
            onChange={(lines) => setDraft({ ...draft, lines })}
          />
        </div>
        <SheetFooter className="shrink-0 border-t p-5">
          <Button
            type="button"
            variant="outline"
            disabled={command.busy}
            onClick={onClose}
          >
            关闭
          </Button>
          {command.pending
            ? (
              <Button
                type="button"
                disabled={command.busy}
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
