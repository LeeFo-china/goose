"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  buildProductResourcePath,
  createSupplierResource,
  mutateSupplierResource,
} from "./supplier-product-api";
import { CatalogSearchSelect } from "./catalog-search-select";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import {
  buildSupplierProductDialogPayload,
  isSupplierProductDialogInvalid,
  shouldShowProductCodeField,
} from "./supplier-product-dialog-state";
import type { ProductApiScope, SupplierProduct } from "./supplier-product-types";

export function SupplierProductDialog({
  scope,
  product,
  disabled,
  onSaved,
}: {
  scope: ProductApiScope;
  product?: SupplierProduct;
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productCode, setProductCode] = useState(product?.product_code ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.category.id ?? "");
  const [brandId, setBrandId] = useState(product?.brand.id ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);
  const isPlatform = scope.kind === "platform";
  const form = {
    scope,
    product,
    productCode,
    name,
    categoryId,
    brandId,
    description,
  };
  const showProductCodeField = shouldShowProductCodeField(scope, product);

  useEffect(() => {
    if (!open) return;
    setProductCode(product?.product_code ?? "");
    setName(product?.name ?? "");
    setCategoryId(product?.category.id ?? "");
    setBrandId(product?.brand.id ?? "");
    setDescription(product?.description ?? "");
  }, [open, product, scope]);

  const invalid = isSupplierProductDialogInvalid(form);

  async function submit() {
    if (invalid) return;
    setSaving(true);
    const payload = buildSupplierProductDialogPayload(form);
    const resourcePath = product
      ? buildProductResourcePath(scope, product.id)
      : `${scope.kind === "platform" ? "/platform" : ""}/supplier-products/:productId`;
    try {
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: `${scope.kind}-supplier-product-${product ? "update" : "create"}`,
        resourcePath,
        payload,
        allocateResourceId: !product,
      });
      attemptRef.current = attempt;
      if (product) {
        await mutateSupplierResource(
          buildProductResourcePath(scope, product.id),
          scope,
          payload,
          attempt.idempotencyKey,
          "PATCH",
        );
      } else {
        await createSupplierResource(
          buildProductResourcePath(scope, attempt.resourceId!),
          scope,
          payload,
          attempt.idempotencyKey,
        );
      }
      attemptRef.current = null;
      toast.success(product ? "供应商商品已更新" : "供应商商品已创建");
      setOpen(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存商品失败");
    } finally {
      setSaving(false);
    }
  }

  const title = product
    ? `编辑${isPlatform ? "平台共享" : "租户私有"}商品`
    : `新增${isPlatform ? "平台共享" : "租户私有"}商品`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size={product ? "sm" : "default"}
          variant={product ? "ghost" : "default"}
          disabled={disabled}
        >
          {product ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {product ? "编辑商品" : isPlatform ? "新增平台商品" : "新增商品"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isPlatform
              ? "平台商品对所有租户共享，只能在此平台入口维护。"
              : "商品永久归当前租户私有，不会共享给其他租户。"}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            {showProductCodeField ? (
              <Field>
                <FieldLabel htmlFor={`supplier-product-code-${product?.id ?? "new"}`}>商品编码</FieldLabel>
                <Input id={`supplier-product-code-${product?.id ?? "new"}`} value={productCode} maxLength={80} onChange={(event) => setProductCode(event.target.value)} />
              </Field>
            ) : (
              <Field data-disabled>
                <FieldLabel htmlFor={`supplier-product-code-${product?.id ?? "new"}`}>商品编码</FieldLabel>
                <Input id={`supplier-product-code-${product?.id ?? "new"}`} value="保存后系统自动生成" disabled readOnly />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor={`supplier-product-name-${product?.id ?? "new"}`}>商品名称</FieldLabel>
              <Input id={`supplier-product-name-${product?.id ?? "new"}`} value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
            </Field>
            <CatalogSearchSelect
              id={`supplier-product-category-${product?.id ?? "new"}`}
              kind="categories"
              scope={scope}
              value={categoryId}
              selectedOption={product?.category}
              onChange={setCategoryId}
            />
            <CatalogSearchSelect
              id={`supplier-product-brand-${product?.id ?? "new"}`}
              kind="brands"
              scope={scope}
              value={brandId}
              selectedOption={product?.brand}
              createCategoryId={categoryId}
              onChange={setBrandId}
            />
          </div>
          <Field>
            <FieldLabel htmlFor={`supplier-product-description-${product?.id ?? "new"}`}>商品说明</FieldLabel>
            <Textarea id={`supplier-product-description-${product?.id ?? "new"}`} value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button type="button" disabled={saving || invalid} onClick={() => void submit()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存商品
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
