"use client";

import {
  PaginatedCatalogOptionPicker,
  type CatalogPickerOption,
} from "@/components/supplier-catalog/paginated-catalog-option-picker";
import type { CatalogPage } from "@/components/supplier-catalog/supplier-catalog-types";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

import { buildTenantPlatformBrandOptionsPath } from "./tenant-catalog-requests";
import type { TenantCatalogBrand } from "./tenant-catalog-types";

async function loadPlatformBrandPage(input: { page: number; pageSize: number; keyword: string }) {
  const result = await requestBackendJson<CatalogPage<TenantCatalogBrand>>(
    buildTenantPlatformBrandOptionsPath(input),
    { fallbackMessage: "加载平台品牌失败" },
  );
  return {
    ...result,
    list: result.list.map(({ id, code, name }) => ({ id, code, name })),
  };
}

export function TenantPlatformBrandPicker({
  value,
  pinned,
  onChange,
}: {
  value: string;
  pinned: TenantCatalogBrand["mapped_platform_brand"] | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <PaginatedCatalogOptionPicker<CatalogPickerOption>
        value={value}
        pinned={pinned ?? null}
        loadPage={loadPlatformBrandPage}
        getLabel={(brand) => `${brand.name} · ${brand.code}`}
        searchLabel="搜索平台品牌"
        selectLabel="选择平台品牌映射"
        emptyDescription="调整关键词或翻页查找其他平台品牌。"
        onChange={(brand) => onChange(brand.id)}
      />
      {value ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>清除平台品牌映射</Button> : null}
    </div>
  );
}
