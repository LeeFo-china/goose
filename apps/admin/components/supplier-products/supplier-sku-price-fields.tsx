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
  disabledNotice = disabled ? "启用 SKU 后可调整供货价" : null,
  effectiveUntilNotice,
  unitPriceError,
  onChange,
}: {
  idPrefix: string;
  value: SupplierSkuPriceForm;
  purchaseUnitSymbol: string;
  disabled: boolean;
  disabledNotice?: string | null;
  effectiveUntilNotice: string | null;
  unitPriceError?: string | null;
  onChange: (value: SupplierSkuPriceForm) => void;
}) {
  const priceId = `${idPrefix}-unit-price`;
  const taxRateId = `${idPrefix}-tax-rate`;
  const taxInclusiveId = `${idPrefix}-tax-inclusive`;
  const priceErrorId = `${priceId}-error`;
  const priceRequirementId = `${priceId}-requirement`;
  const taxRateRequirementId = `${taxRateId}-requirement`;
  const priceDescriptionIds = unitPriceError
    ? `${priceRequirementId} ${priceErrorId}`
    : priceRequirementId;

  return (
    <FieldSet className="border-t pt-5">
      <FieldLegend>采购价格</FieldLegend>
      <FieldDescription>保存后立即用于新的采购业务。</FieldDescription>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(unitPriceError)} data-disabled={disabled}>
          <FieldLabel htmlFor={priceId}>
            基础供货价<RequiredMarker />
          </FieldLabel>
          <div className="relative">
            <Input
              id={priceId}
              inputMode="decimal"
              className="pr-28 tabular-nums"
              value={value.unitPrice}
              disabled={disabled}
              required
              aria-required="true"
              aria-invalid={Boolean(unitPriceError)}
              aria-describedby={priceDescriptionIds}
              onChange={(event) => onChange({
                ...value,
                unitPrice: event.target.value,
              })}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex max-w-24 items-center truncate text-sm text-muted-foreground">
              元 / {purchaseUnitSymbol}
            </span>
          </div>
          <FieldDescription id={priceRequirementId} className="sr-only">
            基础供货价为必填项，必须大于 0 且最多保留两位小数。
          </FieldDescription>
          <FieldError id={priceErrorId} role="alert">{unitPriceError}</FieldError>
        </Field>
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor={taxRateId}>
            税率<RequiredMarker />
          </FieldLabel>
          <Select
            value={value.taxRate}
            disabled={disabled}
            required
            onValueChange={(taxRate) => onChange({ ...value, taxRate })}
          >
            <SelectTrigger
              id={taxRateId}
              aria-required="true"
              aria-describedby={taxRateRequirementId}
            >
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
          <FieldDescription id={taxRateRequirementId} className="sr-only">
            税率为必填项。
          </FieldDescription>
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
      {disabledNotice ? (
        <FieldDescription>{disabledNotice}</FieldDescription>
      ) : !disabled && effectiveUntilNotice ? (
        <FieldDescription>{effectiveUntilNotice}</FieldDescription>
      ) : null}
    </FieldSet>
  );
}

function RequiredMarker() {
  return (
    <>
      <span aria-hidden="true" className="text-destructive"> *</span>
      <span className="sr-only">（必填）</span>
    </>
  );
}
