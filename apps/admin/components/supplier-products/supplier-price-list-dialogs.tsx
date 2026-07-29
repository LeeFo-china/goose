"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  createSupplierResource,
  mutateSupplierResource,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import type {
  SupplierPriceList,
  SupplierSku,
} from "./supplier-product-types";

type Changed = () => void | Promise<void>;

export function CreatePriceListDialog({
  tenantSupplierId,
  onCreated,
}: {
  tenantSupplierId: string;
  onCreated: Changed;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);
  const invalid = !code.trim() || !name.trim() || !effectiveFrom ||
    reason.trim().length < 2;

  async function submit() {
    if (invalid) return;
    setSaving(true);
    try {
      const payload = {
        price_list_code: code.trim(),
        name: name.trim(),
        currency: "CNY",
        effective_from: new Date(effectiveFrom).toISOString(),
        effective_until: null,
        proxy_reason: reason.trim(),
      };
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: "supplier-price-create",
        resourcePath: "/supplier-price-lists/:priceListId",
        payload,
        allocateResourceId: true,
      });
      attemptRef.current = attempt;
      await createSupplierResource(
        `/supplier-price-lists/${attempt.resourceId}`,
        tenantSupplierId,
        payload,
        attempt.idempotencyKey,
      );
      attemptRef.current = null;
      toast.success("基础供货价草稿已创建");
      setOpen(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建价格草稿失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          新建价格草稿
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建默认基础供货价</DialogTitle>
          <DialogDescription>
            当前切片固定为 CNY、默认范围、数量 1 起的基础供货价。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="supplier-price-code">价格簿编码</FieldLabel>
            <Input id="supplier-price-code" value={code} onChange={(event) => setCode(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-price-name">价格簿名称</FieldLabel>
            <Input id="supplier-price-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-price-effective-from">生效时间</FieldLabel>
            <Input
              id="supplier-price-effective-from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </Field>
          <ReasonField id="supplier-price-create-reason" value={reason} onChange={setReason} />
        </FieldGroup>
        <DialogActions
          saving={saving}
          invalid={invalid}
          submitLabel="保存价格草稿"
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PriceItemDialog({
  tenantSupplierId,
  priceList,
  availableSkus,
  onChanged,
}: {
  tenantSupplierId: string;
  priceList: SupplierPriceList;
  availableSkus: SupplierSku[];
  onChanged: Changed;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skuId, setSkuId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [taxRate, setTaxRate] = useState("0.13");
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [reason, setReason] = useState("");
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);
  const invalid = !skuId || !unitPrice ||
    Number(unitPrice) < 0 || Number(taxRate) < 0 ||
    Number(taxRate) > 1 || reason.trim().length < 2;

  async function submit() {
    if (invalid) return;
    setSaving(true);
    try {
      const payload = {
        supplier_sku_id: skuId,
        minimum_quantity: 1,
        maximum_quantity: null,
        unit_price: Number(unitPrice),
        tax_rate: Number(taxRate),
        tax_inclusive: taxInclusive,
        expected_version: priceList.row_version,
        proxy_reason: reason.trim(),
      };
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: "supplier-price-item-upsert",
        resourcePath: `/supplier-price-lists/${priceList.id}/items/:itemId`,
        payload,
        allocateResourceId: true,
      });
      attemptRef.current = attempt;
      await mutateSupplierResource(
        `/supplier-price-lists/${priceList.id}/items/${attempt.resourceId}`,
        tenantSupplierId,
        payload,
        attempt.idempotencyKey,
        "PUT",
      );
      attemptRef.current = null;
      toast.success("基础供货价条目已保存");
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存价格条目失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus data-icon="inline-start" />
          添加价格条目
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加基础供货价条目</DialogTitle>
          <DialogDescription>
            仅可选择当前商品区已加载的 SKU；发布时服务端再次校验商品与 SKU 状态。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="supplier-price-item-sku">SKU</FieldLabel>
            <FormSelect
              id="supplier-price-item-sku"
              value={skuId}
              options={availableSkus.map((sku) => ({
                value: sku.id,
                label: `${sku.name} · ${sku.sku_code}`,
              }))}
              onChange={setSkuId}
            />
            <FieldDescription>
              如未看到 SKU，请先在“商品与 SKU”页签打开对应商品。
            </FieldDescription>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier-price-item-unit-price">基础单价</FieldLabel>
              <Input
                id="supplier-price-item-unit-price"
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-price-item-tax-rate">税率（0–1）</FieldLabel>
              <Input
                id="supplier-price-item-tax-rate"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
              />
            </Field>
          </div>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="supplier-price-item-tax-inclusive">含税价格</FieldLabel>
            <Switch
              id="supplier-price-item-tax-inclusive"
              checked={taxInclusive}
              onCheckedChange={setTaxInclusive}
            />
          </Field>
          <ReasonField id="supplier-price-item-reason" value={reason} onChange={setReason} />
        </FieldGroup>
        <DialogActions
          saving={saving}
          invalid={invalid}
          submitLabel="保存价格条目"
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PublishPriceDialog({
  tenantSupplierId,
  priceList,
  itemCount,
  onChanged,
}: {
  tenantSupplierId: string;
  priceList: SupplierPriceList;
  itemCount: number;
  onChanged: Changed;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);

  async function submit() {
    if (reason.trim().length < 2) return;
    setSaving(true);
    try {
      const path = `/supplier-price-lists/${priceList.id}/publish`;
      const payload = {
        expected_version: priceList.row_version,
        proxy_reason: reason.trim(),
      };
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: "supplier-price-publish",
        resourcePath: path,
        payload,
      });
      attemptRef.current = attempt;
      await mutateSupplierResource(
        path,
        tenantSupplierId,
        payload,
        attempt.idempotencyKey,
      );
      attemptRef.current = null;
      toast.success("基础供货价已发布");
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发布价格失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={itemCount === 0}>
          发布价格
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发布基础供货价</DialogTitle>
          <DialogDescription>
            生效时间 {formatDate(priceList.effective_from)}，共 {itemCount} 个条目。
            发布后不可修改，需要调整时应创建新版本。
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertTitle>发布前检查</AlertTitle>
          <AlertDescription>
            服务端会校验所有商品、SKU、目录引用和生效区间，并使用事务锁防止并发重叠。
          </AlertDescription>
        </Alert>
        <FieldGroup>
          <ReasonField id="supplier-price-publish-reason" value={reason} onChange={setReason} />
        </FieldGroup>
        <DialogActions
          saving={saving}
          invalid={reason.trim().length < 2}
          submitLabel="确认发布"
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReasonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>代录原因</FieldLabel>
      <Textarea
        id={id}
        value={value}
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>记录供应商报价单、邮件或书面授权来源。</FieldDescription>
    </Field>
  );
}

function DialogActions({
  saving,
  invalid,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  invalid: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        取消
      </Button>
      <Button
        type="button"
        disabled={saving || invalid}
        onClick={() => void onSubmit()}
      >
        {saving ? <Spinner data-icon="inline-start" /> : null}
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
