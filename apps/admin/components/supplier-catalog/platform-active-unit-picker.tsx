"use client";

import { requestBackendJson } from "@/lib/backend-client";

import { PaginatedCatalogOptionPicker } from "./paginated-catalog-option-picker";
import type { CatalogPage, CatalogUnit } from "./supplier-catalog-types";
import { buildPlatformActiveUnitOptionsPath } from "./supplier-catalog-v2-requests";

function loadActiveUnitPage(input: { page: number; pageSize: number; keyword: string }) {
  return requestBackendJson<CatalogPage<CatalogUnit>>(
    buildPlatformActiveUnitOptionsPath(input),
    { fallbackMessage: "加载标准单位失败" },
  );
}

export function PlatformActiveUnitPicker({
  value,
  pinned,
  onChange,
}: {
  value: string;
  pinned: CatalogUnit | null;
  onChange: (unit: CatalogUnit) => void;
}) {
  return (
    <PaginatedCatalogOptionPicker
      value={value}
      pinned={pinned}
      loadPage={loadActiveUnitPage}
      getLabel={(unit) => `${unit.name}（${unit.symbol}） · ${unit.code}`}
      searchLabel="搜索标准单位"
      selectLabel="选择标准单位"
      emptyDescription="调整关键词或翻页查找其他启用单位。"
      pageSize={100}
      onChange={onChange}
    />
  );
}
