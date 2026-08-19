"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import {
  buildSkuResourcePath,
  loadAllCatalogOptions,
  loadSkuUnitConversions,
  mutateSupplierResource,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import {
  positiveDecimal,
  summarizeUnitConversionChain,
  unitConversionChainError,
} from "./supplier-product-rules";
import type {
  ProductApiScope,
  SupplierSku,
  SupplierSkuUnitConversion,
  SupplierSkuUnitConversionInput,
  UnitOption,
} from "./supplier-product-types";

const emptyEdge = (): SupplierSkuUnitConversionInput => ({
  from_unit_id: "",
  to_unit_id: "",
  factor: "",
});

export function SupplierUnitConversionDialog({
  scope,
  productId,
  sku,
  readOnly,
  onSaved,
}: {
  scope: ProductApiScope;
  productId: string;
  sku: SupplierSku;
  readOnly: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [edges, setEdges] = useState<SupplierSkuUnitConversionInput[]>([]);
  const [purchaseUnitId, setPurchaseUnitId] = useState(sku.purchase_unit_id);
  const [baseUnitId, setBaseUnitId] = useState(sku.base_unit_id);
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setPurchaseUnitId(sku.purchase_unit_id);
    setBaseUnitId(sku.base_unit_id);
    void Promise.all([
      loadAllCatalogOptions("units", scope),
      loadSkuUnitConversions(scope, productId, sku.id),
    ]).then(([unitOptions, conversions]) => {
      if (!active) return;
      setUnits(mergeUnitOptions(unitOptions as UnitOption[], sku, conversions));
      setEdges(conversions.length > 0
        ? conversions.map(({ from_unit_id, to_unit_id, factor }) => ({
            from_unit_id,
            to_unit_id,
            factor,
          }))
        : readOnly || sku.purchase_unit_id === sku.base_unit_id
          ? []
          : [emptyEdge()]);
    }).catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : "单位换算加载失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, productId, readOnly, scope, sku]);

  const completeEdges = edges.filter((edge) =>
    edge.from_unit_id && edge.to_unit_id && positiveDecimal(edge.factor));
  const chainError = unitConversionChainError(
    edges,
    purchaseUnitId,
    baseUnitId,
  );
  const summary = summarizeUnitConversionChain(
    completeEdges,
    units,
    purchaseUnitId,
  );

  async function submit() {
    if (readOnly || chainError) return;
    setSaving(true);
    const path = `${buildSkuResourcePath(scope, productId, sku.id)}/unit-conversions`;
    const payload = {
      expected_version: sku.version,
      purchase_unit_id: purchaseUnitId,
      base_unit_id: baseUnitId,
      conversions: completeEdges,
    };
    try {
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: `${scope.kind}-supplier-sku-unit-conversions`,
        resourcePath: path,
        payload,
      });
      attemptRef.current = attempt;
      await mutateSupplierResource(
        path,
        scope,
        payload,
        attempt.idempotencyKey,
        "PUT",
      );
      attemptRef.current = null;
      toast.success("单位换算已保存");
      setOpen(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存单位换算失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <ArrowRightLeft data-icon="inline-start" />
          {readOnly ? "查看换算" : "单位换算"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "查看" : "维护"} {sku.name} 的单位换算
          </DialogTitle>
          <DialogDescription>
            每条有向边表达“1 个源单位 = 换算系数 × 目标单位”。
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <FieldGroup>
            <div className="grid gap-3 md:grid-cols-2">
              <Field data-disabled={readOnly}>
                <FieldLabel htmlFor={`conversion-purchase-${sku.id}`}>采购单位</FieldLabel>
                <FormSelect
                  id={`conversion-purchase-${sku.id}`}
                  value={purchaseUnitId}
                  options={unitSelectOptions(units)}
                  disabled={readOnly}
                  onChange={setPurchaseUnitId}
                />
              </Field>
              <Field data-disabled={readOnly}>
                <FieldLabel htmlFor={`conversion-base-${sku.id}`}>库存基本单位</FieldLabel>
                <FormSelect
                  id={`conversion-base-${sku.id}`}
                  value={baseUnitId}
                  options={unitSelectOptions(units)}
                  disabled={readOnly}
                  onChange={setBaseUnitId}
                />
              </Field>
            </div>
            {edges.length === 0 ? (
              <Alert>
                <AlertTitle>暂无单位换算</AlertTitle>
                <AlertDescription>采购单位与库存基本单位相同时可以不添加换算边。</AlertDescription>
              </Alert>
            ) : edges.map((edge, index) => (
              <ConversionEdgeRow
                key={index}
                index={index}
                edge={edge}
                units={units}
                readOnly={readOnly}
                onChange={(next) => setEdges((current) =>
                  current.map((item, itemIndex) => itemIndex === index ? next : item))}
                onRemove={() => setEdges((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index))}
              />
            ))}
            {!readOnly ? (
              <Button
                type="button"
                variant="outline"
                disabled={edges.length >= 100}
                onClick={() => setEdges((current) => [...current, emptyEdge()])}
              >
                <Plus data-icon="inline-start" />
                添加换算边
              </Button>
            ) : null}
            <Alert>
              <AlertTitle>{chainError ? "换算链待完善" : "提交摘要"}</AlertTitle>
              <AlertDescription>
                {chainError ?? `${summary}；库存基本单位为 ${unitName(units, baseUnitId)}`}
              </AlertDescription>
            </Alert>
          </FieldGroup>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {readOnly ? "关闭" : "取消"}
          </Button>
          {!readOnly ? (
            <Button type="button" disabled={saving || loading || Boolean(chainError)} onClick={() => void submit()}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              保存单位换算
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversionEdgeRow({
  index,
  edge,
  units,
  readOnly,
  onChange,
  onRemove,
}: {
  index: number;
  edge: SupplierSkuUnitConversionInput;
  units: UnitOption[];
  readOnly: boolean;
  onChange: (edge: SupplierSkuUnitConversionInput) => void;
  onRemove: () => void;
}) {
  const number = index + 1;
  const options = unitSelectOptions(units);
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
      <Field data-disabled={readOnly}>
        <FieldLabel htmlFor={`conversion-from-${number}`}>源单位 {number}</FieldLabel>
        <FormSelect id={`conversion-from-${number}`} value={edge.from_unit_id} options={options} disabled={readOnly} onChange={(value) => onChange({ ...edge, from_unit_id: value })} />
      </Field>
      <Field data-disabled={readOnly}>
        <FieldLabel htmlFor={`conversion-to-${number}`}>目标单位 {number}</FieldLabel>
        <FormSelect id={`conversion-to-${number}`} value={edge.to_unit_id} options={options} disabled={readOnly} onChange={(value) => onChange({ ...edge, to_unit_id: value })} />
      </Field>
      <Field data-disabled={readOnly}>
        <FieldLabel htmlFor={`conversion-factor-${number}`}>换算系数 {number}</FieldLabel>
        <Input id={`conversion-factor-${number}`} value={edge.factor} disabled={readOnly} inputMode="decimal" onChange={(event) => onChange({ ...edge, factor: event.target.value })} />
      </Field>
      {!readOnly ? (
        <Button type="button" size="icon" variant="ghost" aria-label={`删除换算边 ${number}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
}

function unitSelectOptions(units: UnitOption[]) {
  return units.map((unit) => ({
    value: unit.id,
    label: `${unit.name}（${unit.symbol}） · ${unit.unit_dimension}`,
  }));
}

function unitName(units: UnitOption[], id: string) {
  return units.find((unit) => unit.id === id)?.name ?? "未选择";
}

function mergeUnitOptions(
  activeUnits: UnitOption[],
  sku: SupplierSku,
  conversions: SupplierSkuUnitConversion[],
) {
  const byId = new Map(activeUnits.map((unit) => [unit.id, unit]));
  for (const conversion of conversions) {
    byId.set(conversion.from_unit.id, conversion.from_unit);
    byId.set(conversion.to_unit.id, conversion.to_unit);
  }
  for (const unit of [sku.purchase_unit, sku.base_unit]) {
    if (!byId.has(unit.id)) {
      byId.set(unit.id, { ...unit, unit_dimension: "历史单位" });
    }
  }
  return [...byId.values()];
}
