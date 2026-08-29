"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogSpecValue } from "@gooes/domain";
import { Pencil, Plus, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import {
  buildSkuResourcePath,
  createSupplierResource,
  loadAllSpecDefinitions,
  mutateSupplierResource,
} from "./supplier-product-api";
import { CatalogSearchSelect } from "./catalog-search-select";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import { buildSuggestedSkuName } from "./supplier-product-rules";
import { SupplierSpecFields } from "./supplier-spec-fields";
import type {
  CatalogSpecDefinition,
  ProductApiScope,
  SupplierProduct,
  SupplierSku,
} from "./supplier-product-types";

export function SupplierSkuDialog({
  scope,
  product,
  sku,
  disabled,
  onSaved,
}: {
  scope: ProductApiScope;
  product: SupplierProduct;
  sku?: SupplierSku;
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [definitions, setDefinitions] = useState<CatalogSpecDefinition[]>([]);
  const [name, setName] = useState(sku?.name ?? "");
  const [specification, setSpecification] = useState(sku?.specification ?? "");
  const [model, setModel] = useState(sku?.model ?? "");
  const [purchaseUnitId, setPurchaseUnitId] = useState(sku?.purchase_unit_id ?? "");
  const [batchManaged, setBatchManaged] = useState(sku?.batch_managed ?? false);
  const [colorManaged, setColorManaged] = useState(sku?.color_managed ?? false);
  const [serialManaged, setSerialManaged] = useState(sku?.serial_managed ?? false);
  const [specValues, setSpecValues] = useState<Record<string, CatalogSpecValue>>(
    sku?.spec_values ?? {},
  );
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(sku?.name ?? "");
    setSpecification(sku?.specification ?? "");
    setModel(sku?.model ?? "");
    setPurchaseUnitId(sku?.purchase_unit_id ?? "");
    setBatchManaged(sku?.batch_managed ?? false);
    setColorManaged(sku?.color_managed ?? false);
    setSerialManaged(sku?.serial_managed ?? false);
    setSpecValues(sku?.spec_values ?? {});
    let active = true;
    setLoading(true);
    void loadAllSpecDefinitions(product.category.id, scope).then((specDefinitions) => {
      if (!active) return;
      setDefinitions(specDefinitions);
      setSpecValues((current) => withSpecDefaults(current, specDefinitions));
    }).catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : "SKU 表单资料加载失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, product.category.id, scope, sku]);

  const invalid = loading || !name.trim() ||
    !purchaseUnitId || !requiredSpecsPresent(definitions, specValues);

  async function submit() {
    if (invalid) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      specification: specification.trim() || null,
      model: model.trim() || null,
      batch_managed: batchManaged,
      color_managed: colorManaged,
      serial_managed: serialManaged,
      spec_values: specValues,
    };
    const payload = sku
      ? { ...fields, expected_version: sku.version }
      : { ...fields, purchase_unit_id: purchaseUnitId };
    const resourcePath = sku
      ? buildSkuResourcePath(scope, product.id, sku.id)
      : `${buildSkuResourcePath(scope, product.id, ":skuId")}`;
    try {
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: `${scope.kind}-supplier-sku-${sku ? "update" : "create"}`,
        resourcePath,
        payload,
        allocateResourceId: !sku,
      });
      attemptRef.current = attempt;
      if (sku) {
        await mutateSupplierResource(
          buildSkuResourcePath(scope, product.id, sku.id),
          scope,
          payload,
          attempt.idempotencyKey,
          "PATCH",
        );
      } else {
        await createSupplierResource(
          buildSkuResourcePath(scope, product.id, attempt.resourceId!),
          scope,
          payload,
          attempt.idempotencyKey,
        );
      }
      attemptRef.current = null;
      toast.success(sku ? "供应商 SKU 已更新" : "供应商 SKU 已创建");
      setOpen(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存 SKU 失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          {sku ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {sku ? "编辑 SKU" : "新增 SKU"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{sku ? "编辑供应商 SKU" : "新增供应商 SKU"}</DialogTitle>
          <DialogDescription>
            规格控件来自“{product.category.name}”当前模板，不从 SKU 名称反向解析。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`supplier-sku-code-${sku?.id ?? "new"}`}>SKU 编码</FieldLabel>
              <Input
                id={`supplier-sku-code-${sku?.id ?? "new"}`}
                value={sku?.sku_code ?? "保存后系统自动生成"}
                disabled readOnly
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`supplier-sku-name-${sku?.id ?? "new"}`}>SKU 名称</FieldLabel>
              <div className="flex gap-2">
                <Input id={`supplier-sku-name-${sku?.id ?? "new"}`} value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setName(buildSuggestedSkuName(product, definitions, specValues))}
                >
                  <WandSparkles data-icon="inline-start" />
                  使用建议名称
                </Button>
              </div>
            </Field>
          </div>
          <SupplierSpecFields
            definitions={definitions}
            values={specValues}
            onChange={(code, value) => setSpecValues((current) => {
              if (value === undefined) {
                const next = { ...current };
                delete next[code];
                return next;
              }
              return { ...current, [code]: value };
            })}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={`supplier-sku-specification-${sku?.id ?? "new"}`}>可读规格说明</FieldLabel>
              <Input id={`supplier-sku-specification-${sku?.id ?? "new"}`} value={specification} maxLength={240} onChange={(event) => setSpecification(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`supplier-sku-model-${sku?.id ?? "new"}`}>型号</FieldLabel>
              <Input id={`supplier-sku-model-${sku?.id ?? "new"}`} value={model} maxLength={160} onChange={(event) => setModel(event.target.value)} />
            </Field>
            {sku ? (
              <Field data-disabled>
                <FieldLabel htmlFor={`supplier-sku-unit-${sku.id}`}>采购单位</FieldLabel>
                <Input
                  id={`supplier-sku-unit-${sku.id}`}
                  value={`${sku.purchase_unit.name}（${sku.purchase_unit.symbol}）`}
                  disabled
                />
                <FieldDescription>采购单位和库存基本单位请在“单位换算”中原子维护。</FieldDescription>
              </Field>
            ) : (
              <CatalogSearchSelect
                id="supplier-sku-unit-new"
                kind="units"
                scope={scope}
                value={purchaseUnitId}
                label="采购单位"
                onChange={setPurchaseUnitId}
              />
            )}
          </div>
          <FieldSet>
            <FieldLegend variant="label">管理属性</FieldLegend>
            <FieldDescription>这些属性会影响后续采购履约。</FieldDescription>
            <FieldGroup className="grid gap-3 md:grid-cols-3">
              <BooleanField id="supplier-sku-batch" label="批次管理" checked={batchManaged} onCheckedChange={setBatchManaged} />
              <BooleanField id="supplier-sku-color" label="颜色管理" checked={colorManaged} onCheckedChange={setColorManaged} />
              <BooleanField id="supplier-sku-serial" label="序列号管理" checked={serialManaged} onCheckedChange={setSerialManaged} />
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button type="button" disabled={saving || invalid} onClick={() => void submit()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存 SKU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function withSpecDefaults(
  values: Record<string, CatalogSpecValue>,
  definitions: CatalogSpecDefinition[],
) {
  const next = { ...values };
  for (const definition of definitions) {
    if (next[definition.code] !== undefined) continue;
    if (definition.value_type === "boolean") next[definition.code] = false;
    if (definition.value_type === "multi_enum") next[definition.code] = [];
  }
  return next;
}

function requiredSpecsPresent(
  definitions: CatalogSpecDefinition[],
  values: Record<string, CatalogSpecValue>,
) {
  return definitions.every((definition) => {
    if (!definition.is_required) return true;
    const value = values[definition.code];
    return value !== undefined && value !== "" &&
      (!Array.isArray(value) || value.length > 0);
  });
}

function BooleanField({ id, label, checked, onCheckedChange }: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <FieldLabel htmlFor={id} className="font-normal">{label}</FieldLabel>
    </Field>
  );
}
