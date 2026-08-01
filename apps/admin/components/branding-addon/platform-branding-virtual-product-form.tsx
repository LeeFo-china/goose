"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Save } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformBrandingAddonProductFields } from "@/components/branding-addon/platform-branding-addon-product-form";
import {
  buildProductPatch,
  createProductFormValues,
  type ProductFormField,
  ProductFormValidationError,
} from "@/components/branding-addon/platform-branding-addon-product-form-data";
import { PlatformBrandingPaymentSummary } from "@/components/branding-addon/platform-branding-payment-summary";
import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductFormValues,
  PlatformBrandingPaymentReadiness,
  PlatformBrandingVirtualProductSummary,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { requestBackendJson } from "@/lib/backend-client";

const VERSION_CONFLICT_CODE = "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT";

export function PlatformBrandingVirtualProductForm({
  initialProduct,
  paymentSummaries,
  paymentReadiness,
}: {
  initialProduct: PlatformBrandingAddonProduct;
  paymentSummaries: PlatformBrandingVirtualProductSummary[];
  paymentReadiness: PlatformBrandingPaymentReadiness | null;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [currentReadiness, setCurrentReadiness] = useState(paymentReadiness);
  const [values, setValues] = useState(() =>
    createProductFormValues(initialProduct)
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ProductFormField, string>>
  >({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentReadiness(paymentReadiness);
  }, [paymentReadiness]);

  function clearFeedback() {
    setError("");
    setSaved("");
    setHasVersionConflict(false);
    setFieldErrors({});
  }

  function editProduct(patch: Partial<PlatformBrandingAddonProductFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setCurrentReadiness(null);
    clearFeedback();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    let payload;
    try {
      payload = buildProductPatch(product, values);
    } catch (validationError) {
      if (validationError instanceof ProductFormValidationError) {
        setFieldErrors({ [validationError.field]: validationError.message });
        return;
      }
      setError("请检查商品配置");
      return;
    }

    startTransition(async () => {
      try {
        const result = await requestBackendJson<{
          product: PlatformBrandingAddonProduct;
        }>("/platform/branding/entitlement-product", {
          method: "PATCH",
          body: JSON.stringify(payload),
          fallbackMessage: "品牌权益商品保存失败",
        });
        setProduct(result.product);
        setValues(createProductFormValues(result.product));
        setSaved(`商品已保存，当前版本为 ${result.product.version}`);
        router.refresh();
      } catch (submitError) {
        handleRequestError(submitError);
      }
    });
  }

  function handleRequestError(caught: unknown) {
    const code = caught && typeof caught === "object" && "code" in caught
      ? String(caught.code ?? "")
      : "";
    const conflict = code === VERSION_CONFLICT_CODE;
    setHasVersionConflict(conflict);
    setError(
      conflict
        ? "商品已被其他管理员修改，请重新加载后再保存。"
        : caught instanceof Error
          ? caught.message
          : "品牌权益商品保存失败",
    );
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-4 border-b">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>{product.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              维护数字权益商品的统一售价、购买说明和上架状态。
            </p>
          </div>
          <Badge variant={product.enabled ? "success" : "secondary"}>
            {product.enabled ? "已上架" : "已下架"}
          </Badge>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto p-5">
          <div className="flex flex-col gap-6">
            {error ? (
              <StatusAlert title={hasVersionConflict ? "商品版本冲突" : "保存失败"}>
                {error}
              </StatusAlert>
            ) : null}
            {saved ? (
              <StatusAlert tone="success" title="保存成功">{saved}</StatusAlert>
            ) : null}

            <section
              className="flex flex-col gap-3"
              aria-labelledby="branding-product-basics"
            >
              <div>
                <h2 id="branding-product-basics" className="text-sm font-semibold">
                  商品基础信息
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  价格变更只影响新订单，历史订单继续使用创建时快照。
                </p>
              </div>
              <PlatformBrandingAddonProductFields
                product={product}
                values={values}
                fieldErrors={fieldErrors}
                pending={pending}
                onEdit={editProduct}
              />
            </section>

            <PlatformBrandingPaymentSummary
              product={product}
              summaries={paymentSummaries}
              readiness={currentReadiness}
            />
          </div>
        </CardContent>

        <CardFooter className="shrink-0 flex-wrap justify-end gap-2 border-t pt-5">
          {hasVersionConflict ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              <RefreshCw data-icon="inline-start" />
              重新加载
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending
              ? <Spinner data-icon="inline-start" />
              : <Save data-icon="inline-start" />}
            {pending ? "保存中" : "保存商品"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
