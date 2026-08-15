"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
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
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  createSupplierResource,
  loadCatalogOptions,
  loadCategorySpecDefinitions,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import type { CatalogOption } from "./supplier-product-types";
import {
  collectSpecValues,
  suggestedSkuName,
  type SupplierSkuSpecDefinition,
  type SupplierSkuSpecValue,
} from "./supplier-sku-spec-rules";
import {
  SupplierUnitConversionEditor,
  type SupplierUnitConversionEdge,
} from "./supplier-unit-conversion-editor";

export function SupplierSkuDialog({
  tenantSupplierId,
  productId,
  categoryId,
  disabled,
  onCreated,
}: {
  tenantSupplierId: string;
  productId: string;
  categoryId?: string;
  disabled?: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<CatalogOption[]>([]);
  const [skuCode, setSkuCode] = useState("");
  const [name, setName] = useState("");
  const [specification, setSpecification] = useState("");
  const [model, setModel] = useState("");
  const [purchaseUnitId, setPurchaseUnitId] = useState("");
  const [batchManaged, setBatchManaged] = useState(false);
  const [colorManaged, setColorManaged] = useState(false);
  const [serialManaged, setSerialManaged] = useState(false);
  const [proxyReason, setProxyReason] = useState("");
  const [specs, setSpecs] = useState<SupplierSkuSpecDefinition[]>([]);
  const [specInputs, setSpecInputs] = useState<Record<string, string>>({});
  const [conversions, setConversions] = useState<SupplierUnitConversionEdge[]>(
    [],
  );
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadCatalogOptions("units").then((page) => {
      if (active) setUnits(page.list);
    }).catch((error) => {
      if (active) {
        toast.error(error instanceof Error ? error.message : "单位加载失败");
      }
    });
    if (categoryId) {
      void loadCategorySpecDefinitions(categoryId).then((page) => {
        if (active) setSpecs(page.list);
      }).catch((error) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : "规格模板加载失败");
        }
      });
    }
    return () => {
      active = false;
    };
  }, [open, categoryId]);

  const invalid = !skuCode.trim() || !name.trim() || !purchaseUnitId ||
    proxyReason.trim().length < 2;

  async function submit() {
    if (invalid) return;
    setSaving(true);
    try {
      const payload = {
        sku_code: skuCode.trim(),
        name: name.trim(),
        specification: specification.trim() || null,
        model: model.trim() || null,
        purchase_unit_id: purchaseUnitId,
        batch_managed: batchManaged,
        color_managed: colorManaged,
        serial_managed: serialManaged,
        spec_values: collectSpecValues(specs, specInputs),
        unit_conversions: conversions.map((edge) => ({
          from_unit_id: edge.fromUnitId,
          to_unit_id: edge.toUnitId,
          factor: edge.factor,
        })),
        proxy_reason: proxyReason.trim(),
      };
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: "supplier-sku-create",
        resourcePath: `/supplier-products/${productId}/skus/:skuId`,
        payload,
        allocateResourceId: true,
      });
      attemptRef.current = attempt;
      await createSupplierResource(
        `/supplier-products/${productId}/skus/${attempt.resourceId}`,
        tenantSupplierId,
        payload,
        attempt.idempotencyKey,
      );
      attemptRef.current = null;
      toast.success("供应商 SKU 已创建");
      setOpen(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建 SKU 失败");
    } finally {
      setSaving(false);
    }
  }

  function applySuggestedName() {
    const nextName = suggestedSkuName(
      specs,
      collectSpecValues(specs, specInputs),
      "",
    );
    if (nextName) setName(nextName);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <Plus data-icon="inline-start" />
          新增 SKU
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增供应商 SKU</DialogTitle>
          <DialogDescription>
            单位换算快照由服务端从供应标准目录计算，客户端不能直接填写。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier-sku-code">SKU 编码</FieldLabel>
              <Input
                id="supplier-sku-code"
                value={skuCode}
                maxLength={80}
                onChange={(event) => setSkuCode(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-sku-name">SKU 名称</FieldLabel>
              <Input
                id="supplier-sku-name"
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
              {specs.some((spec) => spec.participates_in_sku_name) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={applySuggestedName}
                >
                  按规格生成名称
                </Button>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-sku-specification">
                规格
              </FieldLabel>
              <Input
                id="supplier-sku-specification"
                value={specification}
                maxLength={240}
                onChange={(event) => setSpecification(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-sku-model">型号</FieldLabel>
              <Input
                id="supplier-sku-model"
                value={model}
                maxLength={160}
                onChange={(event) => setModel(event.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="supplier-sku-purchase-unit">
              采购单位
            </FieldLabel>
            <FormSelect
              id="supplier-sku-purchase-unit"
              value={purchaseUnitId}
              options={units.map((item) => ({
                value: item.id,
                label: `${item.name}${item.symbol ? `（${item.symbol}）` : ""} · ${item.code}`,
              }))}
              onChange={setPurchaseUnitId}
            />
          </Field>
          {specs.length > 0 ? (
            <FieldSet>
              <FieldLegend variant="label">结构化规格</FieldLegend>
              <FieldDescription>
                规格值独立于展示名称，参与命名的规格会进入建议名称。
              </FieldDescription>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                {specs.map((spec) => (
                  <SpecField
                    key={spec.id}
                    spec={spec}
                    value={specInputs[spec.name] ?? ""}
                    onChange={(value) =>
                      setSpecInputs((current) => ({
                        ...current,
                        [spec.name]: value,
                      }))
                    }
                  />
                ))}
              </FieldGroup>
            </FieldSet>
          ) : null}
          <FieldSet>
            <FieldLegend variant="label">管理属性</FieldLegend>
            <FieldDescription>
              这些属性会影响后续采购履约，本阶段只保存主数据。
            </FieldDescription>
            <FieldGroup className="grid gap-3 md:grid-cols-3">
              <BooleanField
                id="supplier-sku-batch"
                label="批次管理"
                checked={batchManaged}
                onCheckedChange={setBatchManaged}
              />
              <BooleanField
                id="supplier-sku-color"
                label="颜色管理"
                checked={colorManaged}
                onCheckedChange={setColorManaged}
              />
              <BooleanField
                id="supplier-sku-serial"
                label="序列号管理"
                checked={serialManaged}
                onCheckedChange={setSerialManaged}
              />
            </FieldGroup>
          </FieldSet>
          <SupplierUnitConversionEditor
            units={units}
            purchaseUnitId={purchaseUnitId}
            edges={conversions}
            onChange={setConversions}
          />
          <Field>
            <FieldLabel htmlFor="supplier-sku-proxy-reason">
              代录原因
            </FieldLabel>
            <Textarea
              id="supplier-sku-proxy-reason"
              value={proxyReason}
              maxLength={500}
              placeholder="例如：依据供应商 SKU 清单代录"
              onChange={(event) => setProxyReason(event.target.value)}
            />
            <FieldDescription>
              proxy_reason 会写入不可变审计事件。
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || invalid}
            onClick={() => void submit()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存 SKU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BooleanField({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <FieldLabel htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
    </Field>
  );
}

function SpecField({
  spec,
  value,
  onChange,
}: {
  spec: SupplierSkuSpecDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  if (spec.value_type === "boolean") {
    return (
      <Field orientation="horizontal">
        <Switch
          id={`spec-${spec.id}`}
          checked={value === "true"}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        />
        <FieldLabel htmlFor={`spec-${spec.id}`} className="font-normal">
          {spec.name}
          {spec.required ? "（必填）" : ""}
        </FieldLabel>
      </Field>
    );
  }

  if (spec.value_type === "single_enum") {
    return (
      <Field>
        <FieldLabel htmlFor={`spec-${spec.id}`}>
          {spec.name}
          {spec.required ? "（必填）" : ""}
        </FieldLabel>
        <Select
          value={value || undefined}
          onValueChange={onChange}
        >
          <SelectTrigger id={`spec-${spec.id}`}>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {spec.enum_options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor={`spec-${spec.id}`}>
        {spec.name}
        {spec.required ? "（必填）" : ""}
        {spec.unit_dimension ? `（${spec.unit_dimension}）` : ""}
      </FieldLabel>
      <Input
        id={`spec-${spec.id}`}
        type={
          spec.value_type === "number"
            ? "number"
            : spec.value_type === "date"
              ? "date"
              : "text"
        }
        value={value}
        placeholder={
          spec.value_type === "multi_enum" ? "多个选项用逗号分隔" : undefined
        }
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
