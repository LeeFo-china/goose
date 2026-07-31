"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listSupplierPayables } from "./payable-api";
import type {
  SupplierPayableListQuery,
  SupplierPayablePage,
  SupplierPayableStatus,
} from "./payable-types";

export type PayableFiltersState = {
  page: number;
  projectId: string;
  tenantSupplierId: string;
  status: SupplierPayableStatus | "all";
  dueFrom: string;
  dueTo: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const initialPayableFilters: PayableFiltersState = {
  page: 1,
  projectId: "all",
  tenantSupplierId: "all",
  status: "all",
  dueFrom: "",
  dueTo: "",
};

export function resetPayableFilters(
  current: PayableFiltersState,
  patch: Partial<Omit<PayableFiltersState, "page">>,
): PayableFiltersState {
  return { ...current, ...patch, page: 1 };
}

export function appendPayablePage(
  current: SupplierPayablePage,
  next: SupplierPayablePage,
): SupplierPayablePage {
  const seen = new Set(current.list.map(({ id }) => id));
  return {
    list: [
      ...current.list,
      ...next.list.filter(({ id }) => !seen.has(id)),
    ],
    pagination: next.pagination,
  };
}

export function buildPaymentRequestHref(payableIds: string[]) {
  const ids = [...new Set(payableIds)]
    .filter((id) => UUID_PATTERN.test(id))
    .slice(0, 100);
  const query = new URLSearchParams({
    create: "1",
    payableIds: ids.join(","),
  });
  return `/supplier-payment-requests?${query}`;
}

export function usePayableList(
  canLoad: boolean,
  filters: PayableFiltersState,
) {
  const [records, setRecords] = useState(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const queryFor = useCallback((page: number): SupplierPayableListQuery => ({
    page,
    pageSize: 20,
    ...(filters.projectId !== "all"
      ? { project_id: filters.projectId }
      : {}),
    ...(filters.tenantSupplierId !== "all"
      ? { tenant_supplier_id: filters.tenantSupplierId }
      : {}),
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.dueFrom ? { due_from: startOfDay(filters.dueFrom) } : {}),
    ...(filters.dueTo ? { due_to: endOfDay(filters.dueTo) } : {}),
  }), [
    filters.dueFrom,
    filters.dueTo,
    filters.projectId,
    filters.status,
    filters.tenantSupplierId,
  ]);

  const reload = useCallback(async () => {
    if (!canLoad) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      const next = await listSupplierPayables(queryFor(filters.page));
      if (requestVersion.current === version) setRecords(next);
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(errorMessage(caught, "供应商应付列表加载失败"));
      }
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [canLoad, filters.page, queryFor]);

  useEffect(() => {
    if (!canLoad) {
      requestVersion.current += 1;
      setRecords(emptyPage());
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      return;
    }
    void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [canLoad, reload]);

  const loadMore = useCallback(async () => {
    if (
      !canLoad || loading || loadingMore ||
      records.pagination.page >= records.pagination.totalPages
    ) return;
    const version = ++requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await listSupplierPayables(
        queryFor(records.pagination.page + 1),
      );
      if (requestVersion.current === version) {
        setRecords((current) => appendPayablePage(current, next));
      }
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(errorMessage(caught, "更多供应商应付加载失败"));
      }
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }, [canLoad, loading, loadingMore, queryFor, records.pagination]);

  return { records, loading, loadingMore, error, reload, loadMore };
}

function emptyPage(): SupplierPayablePage {
  return {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

function startOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

function endOfDay(value: string) {
  return `${value}T23:59:59.999Z`;
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}
