"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  createTenantBrand,
  createTenantCategory,
  updateTenantBrand,
  updateTenantCategory,
} from "./tenant-supplier-catalog-api";
import type {
  TenantCatalogBrand,
  TenantCatalogCategory,
} from "./tenant-supplier-catalog-types";

export function TenantCategoryDialog({
  category,
  parentId,
  onClose,
  onSaved,
}: {
  category?: TenantCatalogCategory;
  parentId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(category?.code ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [mapped, setMapped] = useState(
    category?.mapped_platform_category_id ?? "",
  );
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      if (category) {
        await updateTenantCategory(category.id, {
          expected_version: category.version,
          name,
          mapped_platform_category_id: mapped.trim() || null,
        });
      } else {
        await createTenantCategory(
          {
            parent_id: parentId ?? null,
            code,
            name,
            mapped_platform_category_id: mapped.trim() || null,
          },
          crypto.randomUUID(),
        );
      }
      toast.success(category ? "分类已更新" : "分类已新增");
      onSaved();
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "编辑分类" : "新增分类"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          {!category ? (
            <Field>
              <FieldLabel htmlFor="category-code">分类编码</FieldLabel>
              <Input
                id="category-code"
                placeholder="分类编码"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="category-name">分类名称</FieldLabel>
            <Input
              id="category-name"
              placeholder="分类名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="category-mapped">
              平台分类映射 ID（可选）
            </FieldLabel>
            <Input
              id="category-mapped"
              placeholder="平台分类映射 ID"
              value={mapped}
              onChange={(event) => setMapped(event.target.value)}
            />
          </Field>
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "保存中..." : "保存"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

export function TenantBrandDialog({
  brand,
  onClose,
  onSaved,
}: {
  brand?: TenantCatalogBrand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(brand?.code ?? "");
  const [name, setName] = useState(brand?.name ?? "");
  const [mapped, setMapped] = useState(brand?.mapped_platform_brand_id ?? "");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      if (brand) {
        await updateTenantBrand(brand.id, {
          expected_version: brand.version,
          name,
          mapped_platform_brand_id: mapped.trim() || null,
        });
      } else {
        await createTenantBrand(
          {
            code,
            name,
            mapped_platform_brand_id: mapped.trim() || null,
          },
          crypto.randomUUID(),
        );
      }
      toast.success(brand ? "品牌已更新" : "品牌已新增");
      onSaved();
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{brand ? "编辑品牌" : "新增品牌"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          {!brand ? (
            <Field>
              <FieldLabel htmlFor="brand-code">品牌编码</FieldLabel>
              <Input
                id="brand-code"
                placeholder="品牌编码"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="brand-name">品牌名称</FieldLabel>
            <Input
              id="brand-name"
              placeholder="品牌名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="brand-mapped">
              平台品牌映射 ID（可选）
            </FieldLabel>
            <Input
              id="brand-mapped"
              placeholder="平台品牌映射 ID"
              value={mapped}
              onChange={(event) => setMapped(event.target.value)}
            />
          </Field>
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "保存中..." : "保存"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
