"use client";

import { type FormEvent, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { VirtualBenefitType } from "@gooes/domain";

import { StatusAlert } from "@/components/admin/status-alert";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  buildVirtualProductPayload,
  createInitialVirtualProductFormValues,
  DEFAULT_VIRTUAL_PRODUCT_FORM_VALUES,
  updateVirtualProductType,
} from "./platform-virtual-product-form-data";
import { VirtualProductImageField } from "./platform-virtual-product-image-field";
import {
  durationUnitLabels,
  refundTemplateLabels,
  virtualProductTypeOptions,
} from "./platform-virtual-product-rules";
import type {
  PlatformVirtualProductDetailData,
  PlatformVirtualProductFormValues,
} from "./platform-virtual-product-types";

export function PlatformVirtualProductFormButton({
  product,
  onSaved,
}: {
  product?: PlatformVirtualProductDetailData | null;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() =>
    createInitialVirtualProductFormValues(product)
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isEditing = Boolean(product);

  function update(patch: Partial<PlatformVirtualProductFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildVirtualProductPayload(values, product?.version);
    if (!payload.ok) {
      setError(payload.message);
      return;
    }

    setPending(true);
    setError("");
    try {
      await requestBackendJson(
        product
          ? `/platform/virtual-products/${product.id}`
          : "/platform/virtual-products",
        {
          method: product ? "PATCH" : "POST",
          body: JSON.stringify(payload.body),
          fallbackMessage: product ? "虚拟商品保存失败" : "虚拟商品创建失败",
        },
      );
      setNotice(product ? "虚拟商品已保存。" : "虚拟商品已创建，渠道商品 ID 已由系统生成。");
      onSaved?.();
      if (!product) setValues(DEFAULT_VIRTUAL_PRODUCT_FORM_VALUES);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "虚拟商品保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={isEditing ? "outline" : "default"}>
          {isEditing ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {isEditing ? "编辑商品" : "新建虚拟商品"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑虚拟商品" : "新建虚拟商品"}</DialogTitle>
          <DialogDescription>
            渠道商品 ID 由系统自动生成并绑定微信虚拟支付映射，表单只维护本地商品事实。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="virtual-product-name">商品名称</FieldLabel>
              <Input
                id="virtual-product-name"
                value={values.name}
                onChange={(event) => update({ name: event.target.value })}
                maxLength={100}
                required
                disabled={pending}
              />
            </Field>
            <ProductTypeField
              value={values.productType}
              disabled={pending || isEditing}
              onChange={(value) => update(updateVirtualProductType(value))}
            />
            <Field>
              <FieldLabel htmlFor="virtual-product-amount">统一售价</FieldLabel>
              <Input
                id="virtual-product-amount"
                value={values.amountYuan}
                onChange={(event) => update({ amountYuan: event.target.value })}
                inputMode="decimal"
                placeholder="例如 199.00"
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="virtual-product-entitlement">权益编码</FieldLabel>
              <Input
                id="virtual-product-entitlement"
                value={values.entitlementCode}
                onChange={(event) => update({ entitlementCode: event.target.value })}
                maxLength={100}
                placeholder="例如 custom_support_branding"
                required
                disabled={pending}
              />
            </Field>
            <VirtualProductGrantFields values={values} update={update} disabled={pending} />
            <RefundTemplateField
              value={values.refundTemplate}
              disabled={pending}
              onChange={(value) => update({ refundTemplate: value })}
            />
            <VirtualProductImageField value={values} disabled={pending} onChange={update} />
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="virtual-product-notes">购买说明</FieldLabel>
              <Textarea
                id="virtual-product-notes"
                value={values.purchaseNotes}
                onChange={(event) => update({ purchaseNotes: event.target.value })}
                maxLength={500}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {isEditing ? "保存商品" : "创建商品"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductTypeField({
  value,
  disabled,
  onChange,
}: {
  value: VirtualBenefitType;
  disabled: boolean;
  onChange: (value: VirtualBenefitType) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="virtual-product-type">商品类型</FieldLabel>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as VirtualBenefitType)}
        disabled={disabled}
      >
        <SelectTrigger id="virtual-product-type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {virtualProductTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>保存后类型不建议频繁变更，避免影响发放账本语义。</FieldDescription>
    </Field>
  );
}

function RefundTemplateField({
  value,
  disabled,
  onChange,
}: {
  value: PlatformVirtualProductFormValues["refundTemplate"];
  disabled: boolean;
  onChange: (value: PlatformVirtualProductFormValues["refundTemplate"]) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="virtual-product-refund">退款模板</FieldLabel>
      <Select
        value={value}
        onValueChange={(nextValue) =>
          onChange(nextValue as PlatformVirtualProductFormValues["refundTemplate"])}
        disabled={disabled}
      >
        <SelectTrigger id="virtual-product-refund">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Object.entries(refundTemplateLabels).map(([optionValue, label]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function VirtualProductGrantFields({
  values,
  update,
  disabled,
}: {
  values: PlatformVirtualProductFormValues;
  update: (patch: Partial<PlatformVirtualProductFormValues>) => void;
  disabled: boolean;
}) {
  if (values.productType === "duration") {
    return (
      <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="virtual-product-duration-value">发放时长</FieldLabel>
          <Input
            id="virtual-product-duration-value"
            value={values.durationValue}
            onChange={(event) => update({ durationValue: event.target.value })}
            inputMode="numeric"
            required
            disabled={disabled}
          />
        </Field>
        <DurationUnitField
          value={values.durationUnit}
          disabled={disabled}
          onChange={(durationUnit) => update({ durationUnit })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="virtual-product-grant-amount">发放数量</FieldLabel>
        <Input
          id="virtual-product-grant-amount"
          value={values.grantAmount}
          onChange={(event) => update({ grantAmount: event.target.value })}
          inputMode="numeric"
          required
          disabled={disabled}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="virtual-product-expiry-mode">有效期</FieldLabel>
        <Select
          value={values.expiryMode}
          onValueChange={(value) => update({
            expiryMode: value as PlatformVirtualProductFormValues["expiryMode"],
          })}
          disabled={disabled}
        >
          <SelectTrigger id="virtual-product-expiry-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="permanent">永久有效</SelectItem>
              <SelectItem value="fixed_duration">固定有效期</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {values.expiryMode === "fixed_duration" ? (
        <Field>
          <FieldLabel htmlFor="virtual-product-expiry-value">有效期数值</FieldLabel>
          <Input
            id="virtual-product-expiry-value"
            value={values.expiryValue}
            onChange={(event) => update({ expiryValue: event.target.value })}
            inputMode="numeric"
            required
            disabled={disabled}
          />
        </Field>
      ) : null}
    </div>
  );
}

function DurationUnitField({
  value,
  disabled,
  onChange,
}: {
  value: PlatformVirtualProductFormValues["durationUnit"];
  disabled: boolean;
  onChange: (value: PlatformVirtualProductFormValues["durationUnit"]) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="virtual-product-duration-unit">时长单位</FieldLabel>
      <Select
        value={value}
        onValueChange={(nextValue) =>
          onChange(nextValue as PlatformVirtualProductFormValues["durationUnit"])}
        disabled={disabled}
      >
        <SelectTrigger id="virtual-product-duration-unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Object.entries(durationUnitLabels).map(([optionValue, label]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
