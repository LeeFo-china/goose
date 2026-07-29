"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Save } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  buildProductPatch,
  createProductFormValues,
} from "@/components/branding-addon/platform-branding-addon-product-form-data";
import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductResult,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { requestBackendJson } from "@/lib/backend-client";

const VERSION_CONFLICT_CODE = "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT";

export function PlatformBrandingAddonProductForm({
  initialProduct,
}: {
  initialProduct: PlatformBrandingAddonProduct;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [values, setValues] = useState(() =>
    createProductFormValues(initialProduct)
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setHasVersionConflict(false);

    let payload;
    try {
      payload = buildProductPatch(product, values);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "请检查商品配置",
      );
      return;
    }

    startTransition(async () => {
      try {
        const result = await requestBackendJson<
          PlatformBrandingAddonProductResult
        >("/platform/branding/entitlement-product", {
          method: "PATCH",
          body: JSON.stringify(payload),
          fallbackMessage: "品牌权益商品保存失败",
        });
        setProduct(result.product);
        setValues(createProductFormValues(result.product));
        setSaved(true);
      } catch (submitError) {
        const code = submitError && typeof submitError === "object" &&
            "code" in submitError
          ? submitError.code
          : null;
        if (code === VERSION_CONFLICT_CODE) {
          setHasVersionConflict(true);
          setError("配置已被其他管理员修改，请重新加载后再保存。");
          return;
        }
        setError(
          submitError instanceof Error
            ? submitError.message
            : "品牌权益商品保存失败",
        );
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>{product.name}</CardTitle>
            <CardDescription>
              商品版本 {product.version} · 配置保存后立即影响新创建的订单。
            </CardDescription>
          </div>
          <Badge variant={product.enabled ? "success" : "secondary"}>
            {product.enabled ? "已上架" : "已下架"}
          </Badge>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <dl className="grid gap-3 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">商品编码</dt>
              <dd className="truncate font-medium" title={product.code}>
                {product.code}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">权益编码</dt>
              <dd
                className="truncate font-medium"
                title={product.entitlement_code}
              >
                {product.entitlement_code}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">购买周期</dt>
              <dd className="font-medium">{product.term_years} 个自然年</dd>
            </div>
          </dl>

          {error ? (
            <StatusAlert
              title={hasVersionConflict ? "配置版本冲突" : "保存失败"}
            >
              {error}
            </StatusAlert>
          ) : null}
          {saved ? (
            <StatusAlert tone="success" title="保存成功">
              商品配置已更新，新版本为 {product.version}。
            </StatusAlert>
          ) : null}

          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="branding-addon-product-name">
                商品名称
              </FieldLabel>
              <Input
                id="branding-addon-product-name"
                value={values.name}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    name: event.target.value,
                  }))}
                maxLength={100}
                disabled={pending}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="branding-addon-product-amount">
                年度价格（元）
              </FieldLabel>
              <Input
                id="branding-addon-product-amount"
                type="text"
                inputMode="decimal"
                value={values.amountYuan}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    amountYuan: event.target.value,
                  }))}
                placeholder="例如 99.00"
                disabled={pending}
                required
              />
              <FieldDescription>
                最低 0.01 元，最多两位小数；接口按整数分保存。
              </FieldDescription>
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="branding-addon-product-notes">
                购买说明
              </FieldLabel>
              <Textarea
                id="branding-addon-product-notes"
                value={values.purchaseNotes}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    purchaseNotes: event.target.value,
                  }))}
                maxLength={500}
                disabled={pending}
                required
              />
              <FieldDescription>
                将随商品展示；订单创建后保存当时的购买说明快照。
              </FieldDescription>
            </Field>

            <Field className="md:col-span-2">
              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="branding-addon-product-enabled">
                    上架销售
                  </FieldLabel>
                  <FieldDescription>
                    下架后租户不能新建订单，既有订单和权益不受影响。
                  </FieldDescription>
                </div>
                <Switch
                  id="branding-addon-product-enabled"
                  checked={values.enabled}
                  onCheckedChange={(enabled) =>
                    setValues((current) => ({ ...current, enabled }))}
                  disabled={pending}
                />
              </div>
            </Field>
          </FieldGroup>

          <div className="rounded-md border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
            价格修改只影响新订单，历史订单保留创建时的商品快照。数字权益支付
            成功并开通后不支持退款。
          </div>
        </CardContent>

        <CardFooter className="flex flex-wrap justify-end gap-2 border-t pt-5">
          {hasVersionConflict ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              disabled={pending}
            >
              <RefreshCw data-icon="inline-start" />
              重新加载
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending
              ? <Spinner data-icon="inline-start" />
              : <Save data-icon="inline-start" />}
            {pending ? "保存中" : "保存配置"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
