"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { listSupplierPayableFilterOptions } from "@/components/supplier-payables/payable-api";
import type {
  SupplierPayableFilterOption,
  SupplierPayableFilterOptionType,
} from "@/components/supplier-payables/payable-types";

const FILTER_TYPES = ["project", "supplier"] as const;
const PAGE_SIZE = 20;
type FilterType = typeof FILTER_TYPES[number];
type OptionState = Record<FilterType, SupplierPayableFilterOption[]>;
type PageState = Record<FilterType, { page: number; totalPages: number }>;

const emptyOptions: OptionState = { project: [], supplier: [] };
const emptyPages: PageState = {
  project: { page: 1, totalPages: 1 },
  supplier: { page: 1, totalPages: 1 },
};

export function usePaymentRequestFilterOptions(
  active: boolean,
  onError: (message: string) => void,
) {
  const [options, setOptions] = useState<OptionState>(emptyOptions);
  const [pages, setPages] = useState<PageState>(emptyPages);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true);
    void Promise.all(FILTER_TYPES.map((type) =>
      listSupplierPayableFilterOptions({ type, page: 1, pageSize: PAGE_SIZE })
    )).then((results) => {
      if (!current) return;
      setOptions({ project: results[0].list, supplier: results[1].list });
      setPages({
        project: pageOf(results[0].pagination),
        supplier: pageOf(results[1].pagination),
      });
    }).catch((caught) => {
      if (current) onError(errorMessage(caught, "付款申请筛选项加载失败"));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [active, onError]);

  const loadMore = useCallback(async (type: FilterType) => {
    const currentPage = pages[type];
    if (loading || currentPage.page >= currentPage.totalPages) return;
    setLoading(true);
    try {
      const next = await listSupplierPayableFilterOptions({
        type: type as SupplierPayableFilterOptionType,
        page: currentPage.page + 1,
        pageSize: PAGE_SIZE,
      });
      setOptions((current) => ({
        ...current,
        [type]: mergeOptions(current[type], next.list),
      }));
      setPages((current) => ({
        ...current,
        [type]: pageOf(next.pagination),
      }));
    } catch (caught) {
      onError(errorMessage(caught, "更多付款申请筛选项加载失败"));
    } finally {
      setLoading(false);
    }
  }, [loading, onError, pages]);

  return useMemo(() => ({
    projectOptions: withAll("全部项目", options.project),
    supplierOptions: withAll("全部供应商", options.supplier),
    loading,
    canLoadMoreProjects: pages.project.page < pages.project.totalPages,
    canLoadMoreSuppliers: pages.supplier.page < pages.supplier.totalPages,
    loadMore,
  }), [loadMore, loading, options, pages]);
}

function withAll(label: string, items: SupplierPayableFilterOption[]) {
  return [{ value: "all", label }, ...items.map((item) => ({
    value: item.id,
    label: item.label,
  }))];
}

function mergeOptions(
  current: SupplierPayableFilterOption[],
  next: SupplierPayableFilterOption[],
) {
  const ids = new Set(current.map(({ id }) => id));
  return [...current, ...next.filter(({ id }) => !ids.has(id))];
}

function pageOf(pagination: { page: number; totalPages: number }) {
  return { page: pagination.page, totalPages: Math.max(1, pagination.totalPages) };
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
