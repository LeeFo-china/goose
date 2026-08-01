"use client";

import type {
  ProductFormField,
} from "@/components/branding-addon/platform-branding-addon-product-form-data";
import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductFormValues,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function PlatformBrandingAddonProductFields({
  product,
  values,
  fieldErrors,
  pending,
  onEdit,
}: {
  product: PlatformBrandingAddonProduct;
  values: PlatformBrandingAddonProductFormValues;
  fieldErrors: Partial<Record<ProductFormField, string>>;
  pending: boolean;
  onEdit: (patch: Partial<PlatformBrandingAddonProductFormValues>) => void;
}) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-3">
        <div className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">商品编码</dt>
          <dd className="truncate font-medium" title={product.code}>
            {product.code}
          </dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">权益编码</dt>
          <dd
            className="truncate font-medium"
            title={product.entitlement_code}
          >
            {product.entitlement_code}
          </dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">购买周期</dt>
          <dd className="font-medium">{product.term_years} 个自然年</dd>
        </div>
      </dl>

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(fieldErrors.name)}>
          <FieldLabel htmlFor="branding-addon-product-name">
            商品名称
          </FieldLabel>
          <Input
            id="branding-addon-product-name"
            value={values.name}
            onChange={(event) => onEdit({ name: event.target.value })}
            maxLength={100}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.name)}
            required
          />
          <FieldError>{fieldErrors.name}</FieldError>
        </Field>

        <Field data-invalid={Boolean(fieldErrors.amountYuan)}>
          <FieldLabel htmlFor="branding-addon-product-amount">
            各平台统一年度售价（元）
          </FieldLabel>
          <Input
            id="branding-addon-product-amount"
            type="text"
            inputMode="decimal"
            value={values.amountYuan}
            onChange={(event) => onEdit({ amountYuan: event.target.value })}
            placeholder="例如 99.00"
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.amountYuan)}
            required={values.enabled}
          />
          <FieldDescription>
            iOS、安卓和鸿蒙用户售价一致，平台费率不转嫁给用户。
          </FieldDescription>
          <FieldError>{fieldErrors.amountYuan}</FieldError>
        </Field>

        <Field
          className="md:col-span-2"
          data-invalid={Boolean(fieldErrors.purchaseNotes)}
        >
          <FieldLabel htmlFor="branding-addon-product-notes">
            购买说明
          </FieldLabel>
          <Textarea
            id="branding-addon-product-notes"
            value={values.purchaseNotes}
            onChange={(event) => onEdit({ purchaseNotes: event.target.value })}
            maxLength={500}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.purchaseNotes)}
            required
          />
          <FieldDescription>
            订单创建时会保存商品名称、售价和购买说明快照。
          </FieldDescription>
          <FieldError>{fieldErrors.purchaseNotes}</FieldError>
        </Field>

        <Field className="md:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <FieldLabel htmlFor="branding-addon-product-enabled">
                上架销售
              </FieldLabel>
              <FieldDescription>
                下架后不能创建新订单，既有订单和权益不受影响。
              </FieldDescription>
            </div>
            <Switch
              id="branding-addon-product-enabled"
              checked={values.enabled}
              onCheckedChange={(enabled) => onEdit({ enabled })}
              disabled={pending}
            />
          </div>
        </Field>
      </FieldGroup>
    </div>
  );
}
