"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
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
import { Switch } from "@/components/ui/switch";

import {
  getSupplierSkuTaxRateOptions,
  type SupplierSkuPriceForm,
} from "./supplier-sku-price-form";

export function SupplierSkuPriceFields({
  idPrefix,
  value,
  purchaseUnitSymbol,
  disabled,
  effectiveUntilNotice,
  unitPriceError,
  onChange,
}: {
  idPrefix: string;
  value: SupplierSkuPriceForm;
  purchaseUnitSymbol: string;
  disabled: boolean;
  effectiveUntilNotice: string | null;
  unitPriceError?: string | null;
  onChange: (value: SupplierSkuPriceForm) => void;
}) {
  const priceId = `${idPrefix}-unit-price`;
  const taxRateId = `${idPrefix}-tax-rate`;
  const taxInclusiveId = `${idPrefix}-tax-inclusive`;
  const priceErrorId = `${priceId}-error`;

  return (
    <FieldSet className="border-t pt-5">
      <FieldLegend>采购价格</FieldLegend>
      <FieldDescription>保存后立即用于新的采购业务。</FieldDescription>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(unitPriceError)} data-disabled={disabled}>
          <FieldLabel htmlFor={priceId}>基础供货价</FieldLabel>
          <div className="relative">
            <Input
              id={priceId}
              inputMode="decimal"
              className="pr-28 tabular-nums"
              value={value.unitPrice}
              disabled={disabled}
              aria-invalid={Boolean(unitPriceError)}
              aria-describedby={unitPriceError ? priceErrorId : undefined}
              onChange={(event) => onChange({
                ...value,
                unitPrice: event.target.value,
              })}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex max-w-24 items-center truncate text-sm text-muted-foreground">
              元 / {purchaseUnitSymbol}
            </span>
          </div>
          <FieldError id={priceErrorId}>{unitPriceError}</FieldError>
        </Field>
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor={taxRateId}>税率</FieldLabel>
          <Select
            value={value.taxRate}
            disabled={disabled}
            onValueChange={(taxRate) => onChange({ ...value, taxRate })}
          >
            <SelectTrigger id={taxRateId}>
              <SelectValue placeholder="选择税率" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {getSupplierSkuTaxRateOptions(value.taxRate).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Field orientation="horizontal" data-disabled={disabled}>
        <Switch
          id={taxInclusiveId}
          checked={value.taxInclusive}
          disabled={disabled}
          onCheckedChange={(taxInclusive) => onChange({
            ...value,
            taxInclusive,
          })}
        />
        <FieldLabel htmlFor={taxInclusiveId} className="font-normal">
          含税价格
        </FieldLabel>
      </Field>
      {disabled ? (
        <FieldDescription>启用 SKU 后可调整供货价</FieldDescription>
      ) : effectiveUntilNotice ? (
        <FieldDescription>{effectiveUntilNotice}</FieldDescription>
      ) : null}
    </FieldSet>
  );
}
