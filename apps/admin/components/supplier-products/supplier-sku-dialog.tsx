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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  createSupplierResource,
  loadCatalogOptions,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import type { CatalogOption } from "./supplier-product-types";

export function SupplierSkuDialog({
  tenantSupplierId,
  productId,
  disabled,
  onCreated,
}: {
  tenantSupplierId: string;
  productId: string;
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
    return () => {
      active = false;
    };
  }, [open]);

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
