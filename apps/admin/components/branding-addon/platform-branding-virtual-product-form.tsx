"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";
import { RefreshCw, Save, ShieldCheck } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformBrandingAddonProductFields } from "@/components/branding-addon/platform-branding-addon-product-form";
import {
  buildModePatch,
  buildProductPatch,
  createProductFormValues,
  formatFenAsYuanInput,
  parseYuanInputToFen,
  type ProductFormField,
  ProductFormValidationError,
} from "@/components/branding-addon/platform-branding-addon-product-form-data";
import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductFormValues,
  PlatformBrandingAddonProductPatch,
  PlatformBrandingAddonProductResult,
  PlatformBrandingVirtualProduct,
  PlatformBrandingVirtualProductStatus,
  PlatformBrandingVirtualProductSummary,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import {
  MappingFact,
  MappingInput,
} from "@/components/branding-addon/platform-branding-virtual-product-fields";
import {
  buildMappingPatch,
  createDraft,
  createDrafts,
  emptySummary,
  environmentLabels,
  getAvailableModes,
  type MappingDraft,
  modeLabels,
  replaceMapping,
  validationLabel,
  validationVariant,
} from "@/components/branding-addon/platform-branding-virtual-product-form-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  BrandingPurchaseMode,
  BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

const VERSION_CONFLICT_CODES = new Set([
  "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
  "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
]);

export function PlatformBrandingVirtualProductForm({
  initialProduct,
  initialVirtualProducts,
}: {
  initialProduct: PlatformBrandingAddonProduct;
  initialVirtualProducts: PlatformBrandingVirtualProductSummary[];
}) {
  const [product, setProduct] = useState(initialProduct);
  const [summaries, setSummaries] = useState(initialVirtualProducts);
  const [values, setValues] = useState(() =>
    createProductFormValues(initialProduct)
  );
  const [purchaseMode, setPurchaseMode] = useState(initialProduct.purchase_mode);
  const [environment, setEnvironment] =
    useState<BrandingVirtualPaymentEnvironment>("production");
  const [drafts, setDrafts] = useState(() => createDrafts(initialVirtualProducts));
  const [dirtyEnvironments, setDirtyEnvironments] = useState<
    Set<BrandingVirtualPaymentEnvironment>
  >(new Set());
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ProductFormField, string>>
  >({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedSummary = summaries.find(
    (summary) => summary.environment === environment,
  ) ?? emptySummary(environment);
  const draft = drafts[environment];
  const availableModes = useMemo(
    () => getAvailableModes(product.purchase_mode),
    [product.purchase_mode],
  );
  const parsedAmount = parseYuanInputToFen(values.amountYuan);
  const editedAmountFen = parsedAmount.ok ? parsedAmount.amountFen : null;
  const isMappingAmountCurrent = selectedSummary.mapping?.expected_amount_fen ===
    editedAmountFen;
  const shouldSaveSelectedMapping = dirtyEnvironments.has(environment) ||
    Boolean(selectedSummary.mapping && !isMappingAmountCurrent);

  function clearFeedback() {
    setError("");
    setSaved("");
    setHasVersionConflict(false);
    setFieldErrors({});
  }

  function editProduct(patch: Partial<PlatformBrandingAddonProductFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    clearFeedback();
  }

  function editMapping(patch: Partial<MappingDraft>) {
    setDrafts((current) => {
      const nextDraft = { ...current[environment], ...patch };
      if (!("status" in patch) && nextDraft.status === "active") {
        nextDraft.status = "draft";
      }
      return { ...current, [environment]: nextDraft };
    });
    setDirtyEnvironments((current) => new Set(current).add(environment));
    clearFeedback();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    let payload: PlatformBrandingAddonProductPatch;
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

    if (purchaseMode !== product.purchase_mode) {
      const modePatch = buildModePatch({
        current: product.purchase_mode,
        next: purchaseMode,
        version: product.version,
      });
      if (!modePatch.ok) {
        setError(modePatch.message);
        return;
      }
      payload.purchase_mode = modePatch.patch.purchase_mode;
    }

    if (shouldSaveSelectedMapping) {
      const mappingPatch = buildMappingPatch({
        environment,
        draft,
        summary: selectedSummary,
        amountFen: payload.amount_fen ?? product.amount_fen,
      });
      if (!mappingPatch.ok) {
        setError(mappingPatch.message);
        return;
      }
      payload.virtual_product = mappingPatch.patch;
    }

    startTransition(async () => {
      try {
        const result = await requestBackendJson<PlatformBrandingAddonProductResult>(
          "/platform/branding/entitlement-product",
          {
            method: "PATCH",
            body: JSON.stringify(payload),
            fallbackMessage: "品牌权益商品保存失败",
          },
        );
        setProduct(result.product);
        setValues(createProductFormValues(result.product));
        setPurchaseMode(result.product.purchase_mode);
        if (result.virtual_product) {
          const savedMapping = result.virtual_product;
          setSummaries((current) => replaceMapping(current, savedMapping));
          setDrafts((current) => ({
            ...current,
            [savedMapping.environment]: createDraft(savedMapping),
          }));
          setDirtyEnvironments((current) => {
            const next = new Set(current);
            next.delete(savedMapping.environment);
            return next;
          });
        }
        setSaved(`配置已保存，商品版本为 ${result.product.version}`);
      } catch (submitError) {
        handleRequestError(submitError, "品牌权益商品保存失败");
      }
    });
  }

  function validateMapping() {
    if (!selectedSummary.mapping || dirtyEnvironments.has(environment)) return;
    clearFeedback();
    startTransition(async () => {
      try {
        const result = await requestBackendJson<{
          virtual_product: PlatformBrandingVirtualProduct;
        }>(
          `/platform/branding/entitlement-product/virtual-products/${environment}/validate`,
          {
            method: "POST",
            body: JSON.stringify({ version: selectedSummary.mapping!.version }),
            fallbackMessage: "虚拟商品映射校验失败",
          },
        );
        setSummaries((current) => replaceMapping(current, result.virtual_product));
        setSaved(`${environmentLabels[environment]}映射校验通过`);
      } catch (validationError) {
        handleRequestError(validationError, "虚拟商品映射校验失败");
      }
    });
  }

  function handleRequestError(caught: unknown, fallback: string) {
    const code = caught && typeof caught === "object" && "code" in caught
      ? String(caught.code ?? "")
      : "";
    const conflict = VERSION_CONFLICT_CODES.has(code);
    setHasVersionConflict(conflict);
    setError(
      conflict
        ? "配置已被其他管理员修改，请重新加载后再保存。"
        : caught instanceof Error
          ? caught.message
          : fallback,
    );
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-4 border-b">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>{product.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              统一维护商品售价、购买通道和微信虚拟商品映射。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={product.enabled ? "success" : "secondary"}>
              {product.enabled ? "已上架" : "已下架"}
            </Badge>
            <Badge variant={product.purchase_mode === "wechat_virtual" ? "success" : "outline"}>
              {modeLabels[product.purchase_mode]}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto p-5">
          <div className="space-y-6">
            {product.purchase_mode === "maintenance" || purchaseMode === "maintenance" ? (
              <StatusAlert tone="warning" title="当前处于维护模式">
                新订单创建已暂停。确认旧普通支付待支付订单已经收敛后，才可启用微信虚拟支付。
              </StatusAlert>
            ) : null}
            {error ? (
              <StatusAlert title={hasVersionConflict ? "配置版本冲突" : "操作失败"}>
                {error}
              </StatusAlert>
            ) : null}
            {saved ? (
              <StatusAlert tone="success" title="操作成功">{saved}</StatusAlert>
            ) : null}

            <section className="space-y-3" aria-labelledby="branding-product-basics">
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

            <section className="space-y-3 border-t pt-5" aria-labelledby="branding-payment-channel">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                <div>
                  <h2 id="branding-payment-channel" className="text-sm font-semibold">
                    支付通道
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    独立商户号继续保留给后续实物商城，数字权益切换后不提供普通支付回退。
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="branding-purchase-mode">购买模式</FieldLabel>
                  <Select
                    value={purchaseMode}
                    onValueChange={(value) => {
                      setPurchaseMode(value as BrandingPurchaseMode);
                      clearFeedback();
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger id="branding-purchase-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>{modeLabels[mode]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <section className="space-y-4 border-t pt-5" aria-labelledby="branding-virtual-mapping">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="branding-virtual-mapping" className="text-sm font-semibold">
                    微信虚拟商品映射
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    沙箱和生产配置互相隔离，生产映射校验有效后才能切换通道。
                  </p>
                </div>
                <Tabs
                  value={environment}
                  onValueChange={(value) => setEnvironment(value as BrandingVirtualPaymentEnvironment)}
                >
                  <TabsList>
                    <TabsTrigger value="sandbox">沙箱</TabsTrigger>
                    <TabsTrigger value="production">生产</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-3">
                <MappingFact label="环境" value={environmentLabels[environment]} />
                <MappingFact
                  label="映射校验"
                  value={isMappingAmountCurrent
                    ? validationLabel(selectedSummary.mapping?.validation_status)
                    : "售价待同步"}
                  badgeVariant={isMappingAmountCurrent
                    ? validationVariant(selectedSummary.mapping?.validation_status)
                    : "warning"}
                />
                <MappingFact
                  label="支付密钥"
                  value={selectedSummary.secret.configured
                    ? `已配置，版本 ${selectedSummary.secret.revision ?? "未知"}`
                    : "未配置"}
                  badgeVariant={selectedSummary.secret.configured ? "success" : "danger"}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <MappingInput
                  id={`branding-app-id-${environment}`}
                  label="小程序 AppID"
                  value={draft.appId}
                  onChange={(appId) => editMapping({ appId })}
                  disabled={pending}
                />
                <MappingInput
                  id={`branding-merchant-id-${environment}`}
                  label="虚拟支付商户号"
                  value={draft.virtualMerchantId}
                  onChange={(virtualMerchantId) => editMapping({ virtualMerchantId })}
                  disabled={pending}
                />
                <MappingInput
                  id={`branding-offer-id-${environment}`}
                  label="Offer ID"
                  value={draft.offerId}
                  onChange={(offerId) => editMapping({ offerId })}
                  disabled={pending}
                />
                <MappingInput
                  id={`branding-provider-product-id-${environment}`}
                  label="微信商品 ID"
                  value={draft.providerProductId}
                  onChange={(providerProductId) => editMapping({ providerProductId })}
                  disabled={pending}
                />
                <Field>
                  <FieldLabel htmlFor={`branding-mapping-status-${environment}`}>
                    映射状态
                  </FieldLabel>
                  <Select
                    value={draft.status}
                    onValueChange={(status) => editMapping({
                      status: status as PlatformBrandingVirtualProductStatus,
                    })}
                    disabled={pending}
                  >
                    <SelectTrigger id={`branding-mapping-status-${environment}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="active">启用</SelectItem>
                      <SelectItem value="disabled">停用</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    修改关键映射字段后会自动切换为草稿，保存后需要重新校验。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`branding-mapping-amount-${environment}`}>
                    映射售价
                  </FieldLabel>
                  <Input
                    id={`branding-mapping-amount-${environment}`}
                    value={selectedSummary.mapping
                      ? `¥${formatFenAsYuanInput(selectedSummary.mapping.expected_amount_fen)}`
                      : "未配置"}
                    readOnly
                  />
                  <FieldDescription>
                    当前统一售价为 {values.amountYuan ? `¥${values.amountYuan}` : "未配置"}，
                    保存当前映射后同步。
                  </FieldDescription>
                </Field>
              </div>
            </section>
          </div>
        </CardContent>

        <CardFooter className="shrink-0 flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={validateMapping}
            disabled={pending || !selectedSummary.mapping ||
              dirtyEnvironments.has(environment) || !isMappingAmountCurrent}
          >
            {pending ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
            校验当前映射
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {hasVersionConflict ? (
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw data-icon="inline-start" />
                重新加载
              </Button>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              {pending ? "保存中" : "保存配置"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
