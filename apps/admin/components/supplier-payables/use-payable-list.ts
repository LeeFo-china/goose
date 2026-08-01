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
  purchaseOrderId: string;
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
  purchaseOrderId: "all",
  status: "all",
  dueFrom: "",
  dueTo: "",
};

export type PayableModulePreflight =
  | "unknown"
  | "checking"
  | "enabled"
  | "disabled"
  | "error";

export function payableLoadPolicy({
  canView,
  canReadSettings,
  preflight,
}: {
  canView: boolean;
  canReadSettings: boolean;
  preflight: PayableModulePreflight;
}) {
  if (!canView) {
    return { shouldPreflightSettings: false, shouldLoadPayables: false };
  }
  return {
    shouldPreflightSettings: canReadSettings && preflight === "unknown",
    shouldLoadPayables: preflight === "enabled" ||
      (!canReadSettings && preflight === "unknown"),
  };
}

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

export function beginPayableListRequest(
  _current: SupplierPayablePage,
): SupplierPayablePage {
  return emptyPage();
}

export function nextPayableRetryAttempt(current: number) {
  return Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
}

export function payableDateRange(dueFrom: string, dueTo: string) {
  const start = dueFrom ? localDateBoundary(dueFrom, "start") : null;
  const end = dueTo ? localDateBoundary(dueTo, "end") : null;
  if (start && end && start.getTime() > end.getTime()) {
    throw new Error("到期结束日期不能早于开始日期");
  }
  return {
    ...(start ? { due_from: start.toISOString() } : {}),
    ...(end ? { due_to: end.toISOString() } : {}),
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
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
    ...(filters.purchaseOrderId !== "all"
      ? { purchase_order_id: filters.purchaseOrderId }
      : {}),
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...payableDateRange(filters.dueFrom, filters.dueTo),
  }), [
    filters.dueFrom,
    filters.dueTo,
    filters.projectId,
    filters.purchaseOrderId,
    filters.status,
    filters.tenantSupplierId,
  ]);

  const reload = useCallback(async () => {
    if (!canLoad) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setErrorCode(null);
    setHasLoaded(false);
    setRecords(beginPayableListRequest);
    try {
      const next = await listSupplierPayables(queryFor(filters.page));
      if (requestVersion.current === version) {
        setRecords(next);
        setHasLoaded(true);
      }
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(errorMessage(caught, "供应商应付列表加载失败"));
        setErrorCode(requestErrorCode(caught));
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
      setErrorCode(null);
      setHasLoaded(false);
      return;
    }
    void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [canLoad, reload]);

  useEffect(() => {
    if (!canLoad) return;
    const handlePaymentCommand = () => void reload();
    window.addEventListener("supplier-payment-command", handlePaymentCommand);
    return () => {
      window.removeEventListener(
        "supplier-payment-command",
        handlePaymentCommand,
      );
    };
  }, [canLoad, reload]);

  const clear = useCallback(() => {
    requestVersion.current += 1;
    setRecords(emptyPage());
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setErrorCode(null);
    setHasLoaded(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (
      !canLoad || loading || loadingMore ||
      records.pagination.page >= records.pagination.totalPages
    ) return;
    const version = ++requestVersion.current;
    setLoadingMore(true);
    setError(null);
    setErrorCode(null);
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
        setErrorCode(requestErrorCode(caught));
      }
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }, [canLoad, loading, loadingMore, queryFor, records.pagination]);

  return {
    records,
    loading,
    loadingMore,
    error,
    errorCode,
    hasLoaded,
    clear,
    reload,
    loadMore,
  };
}

function emptyPage(): SupplierPayablePage {
  return {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

function localDateBoundary(value: string, boundary: "start" | "end") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("无效的到期日期");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(
    boundary === "start" ? 0 : 23,
    boundary === "start" ? 0 : 59,
    boundary === "start" ? 0 : 59,
    boundary === "start" ? 0 : 999,
  );
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("无效的到期日期");
  }
  return date;
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

function requestErrorCode(caught: unknown) {
  if (!caught || typeof caught !== "object" || !("code" in caught)) {
    return null;
  }
  const code = (caught as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
