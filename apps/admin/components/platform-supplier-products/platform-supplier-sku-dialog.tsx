"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import {
  createPlatformSupplierSku,
  loadPlatformCatalogUnits,
} from "./platform-supplier-products-api";

export function PlatformSupplierSkuDialog({
  supplierId,
  productId,
  onCreated,
}: {
  supplierId: string;
  productId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<
    { id: string; code: string; name: string; symbol?: string }[]
  >([]);
  const [skuCode, setSkuCode] = useState("");
  const [name, setName] = useState("");
  const [purchaseUnitId, setPurchaseUnitId] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    loadPlatformCatalogUnits().then((page) => {
      if (active) setUnits(page.list);
    }).catch((caught) => {
      if (active) {
        toast.error(caught instanceof Error ? caught.message : "单位加载失败");
      }
    });
    return () => {
      active = false;
    };
  }, [open]);

  async function submit() {
    if (!skuCode.trim() || !name.trim() || !purchaseUnitId) return;
    setSaving(true);
    try {
      await createPlatformSupplierSku(
        supplierId,
        productId,
        crypto.randomUUID(),
        {
          sku_code: skuCode.trim(),
          name: name.trim(),
          purchase_unit_id: purchaseUnitId,
          batch_managed: false,
          color_managed: false,
          serial_managed: false,
        },
        crypto.randomUUID(),
      );
      toast.success("平台 SKU 已新增");
      setOpen(false);
      onCreated();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "新增失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus data-icon="inline-start" />
          新增 SKU
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新增平台 SKU</DialogTitle>
          <DialogDescription>
            平台共享 SKU 资料不维护租户成交价。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="platform-sku-code">SKU 编码</FieldLabel>
            <Input
              id="platform-sku-code"
              value={skuCode}
              maxLength={80}
              onChange={(event) => setSkuCode(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-sku-name">SKU 名称</FieldLabel>
            <Input
              id="platform-sku-name"
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-sku-unit">采购单位</FieldLabel>
            <FormSelect
              id="platform-sku-unit"
              value={purchaseUnitId}
              options={units.map((unit) => ({
                value: unit.id,
                label: `${unit.name}${unit.symbol ? `（${unit.symbol}）` : ""} · ${unit.code}`,
              }))}
              onChange={setPurchaseUnitId}
            />
          </Field>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
