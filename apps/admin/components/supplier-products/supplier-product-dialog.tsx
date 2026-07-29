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
import { Textarea } from "@/components/ui/textarea";

import {
  createSupplierResource,
  loadCatalogOptions,
} from "./supplier-product-api";
import type { CatalogOption } from "./supplier-product-types";

export function SupplierProductDialog({
  tenantSupplierId,
  disabled,
  onCreated,
}: {
  tenantSupplierId: string;
  disabled?: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [brands, setBrands] = useState<CatalogOption[]>([]);
  const [productCode, setProductCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [description, setDescription] = useState("");
  const [proxyReason, setProxyReason] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setOptionsLoading(true);
    void Promise.all([
      loadCatalogOptions("categories"),
      loadCatalogOptions("brands"),
    ]).then(([categoryPage, brandPage]) => {
      if (!active) return;
      setCategories(categoryPage.list);
      setBrands(brandPage.list);
    }).catch((error) => {
      if (active) {
        toast.error(
          error instanceof Error ? error.message : "供应标准目录加载失败",
        );
      }
    }).finally(() => {
      if (active) setOptionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const invalid = !productCode.trim() || !name.trim() || !categoryId ||
    !brandId || proxyReason.trim().length < 2;

  async function submit() {
    if (invalid) return;
    setSaving(true);
    try {
      const productId = crypto.randomUUID();
      await createSupplierResource(
        `/supplier-products/${productId}`,
        tenantSupplierId,
        {
          product_code: productCode.trim(),
          name: name.trim(),
          category_id: categoryId,
          brand_id: brandId,
          description: description.trim() || null,
          proxy_reason: proxyReason.trim(),
        },
        "supplier-product-create",
      );
      toast.success("供应商商品已创建");
      setOpen(false);
      reset();
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建商品失败");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setProductCode("");
    setName("");
    setCategoryId("");
    setBrandId("");
    setDescription("");
    setProxyReason("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus data-icon="inline-start" />
          新增商品
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增供应商商品</DialogTitle>
          <DialogDescription>
            商品引用平台标准分类和品牌；启用前至少需要一个已启用 SKU。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier-product-code">商品编码</FieldLabel>
              <Input
                id="supplier-product-code"
                value={productCode}
                maxLength={80}
                onChange={(event) => setProductCode(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-product-name">商品名称</FieldLabel>
              <Input
                id="supplier-product-name"
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field data-disabled={optionsLoading}>
              <FieldLabel htmlFor="supplier-product-category">
                标准分类
              </FieldLabel>
              <FormSelect
                id="supplier-product-category"
                value={categoryId}
                disabled={optionsLoading}
                options={categories.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.code}`,
                }))}
                onChange={setCategoryId}
              />
            </Field>
            <Field data-disabled={optionsLoading}>
              <FieldLabel htmlFor="supplier-product-brand">品牌</FieldLabel>
              <FormSelect
                id="supplier-product-brand"
                value={brandId}
                disabled={optionsLoading}
                options={brands.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.code}`,
                }))}
                onChange={setBrandId}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="supplier-product-description">
              商品说明
            </FieldLabel>
            <Textarea
              id="supplier-product-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-product-proxy-reason">
              代录原因
            </FieldLabel>
            <Textarea
              id="supplier-product-proxy-reason"
              value={proxyReason}
              maxLength={500}
              placeholder="例如：依据供应商盖章商品资料代录"
              onChange={(event) => setProxyReason(event.target.value)}
            />
            <FieldDescription>
              proxy_reason 会写入不可变审计事件，至少 2 个字符。
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || invalid}
            onClick={() => void submit()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存商品
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
