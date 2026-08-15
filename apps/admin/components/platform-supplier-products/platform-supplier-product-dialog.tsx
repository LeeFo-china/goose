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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  createPlatformSupplierProduct,
  loadPlatformCatalogOptions,
} from "./platform-supplier-products-api";

export function PlatformSupplierProductDialog({
  supplierId,
  onCreated,
}: {
  supplierId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [brands, setBrands] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [productCode, setProductCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      loadPlatformCatalogOptions("categories"),
      loadPlatformCatalogOptions("brands"),
    ]).then(([categoryPage, brandPage]) => {
      if (!active) return;
      setCategories(categoryPage.list);
      setBrands(brandPage.list);
    }).catch((caught) => {
      if (active) {
        toast.error(caught instanceof Error ? caught.message : "目录加载失败");
      }
    });
    return () => {
      active = false;
    };
  }, [open]);

  async function submit() {
    if (!productCode.trim() || !name.trim() || !categoryId || !brandId) return;
    setSaving(true);
    try {
      await createPlatformSupplierProduct(
        supplierId,
        crypto.randomUUID(),
        {
          product_code: productCode.trim(),
          name: name.trim(),
          category_id: categoryId,
          brand_id: brandId,
          description: description.trim() || null,
        },
        crypto.randomUUID(),
      );
      toast.success("平台共享商品已新增");
      setOpen(false);
      onCreated();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "新增失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus data-icon="inline-start" />
          新增商品
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增平台共享商品</DialogTitle>
          <DialogDescription>
            平台共享商品只共享商品资料，不维护租户成交价。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="platform-product-code">商品编码</FieldLabel>
            <Input
              id="platform-product-code"
              value={productCode}
              maxLength={80}
              onChange={(event) => setProductCode(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-product-name">商品名称</FieldLabel>
            <Input
              id="platform-product-name"
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-product-category">平台分类</FieldLabel>
            <FormSelect
              id="platform-product-category"
              value={categoryId}
              options={categories.map((category) => ({
                value: category.id,
                label: `${category.name} · ${category.code}`,
              }))}
              onChange={setCategoryId}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-product-brand">平台品牌</FieldLabel>
            <FormSelect
              id="platform-product-brand"
              value={brandId}
              options={brands.map((brand) => ({
                value: brand.id,
                label: `${brand.name} · ${brand.code}`,
              }))}
              onChange={setBrandId}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-product-description">
              商品说明（可选）
            </FieldLabel>
            <Textarea
              id="platform-product-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
