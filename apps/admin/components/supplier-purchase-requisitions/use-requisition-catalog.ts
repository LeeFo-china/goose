"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PurchaseOrderCatalogItem,
  PurchaseOrderCatalogPage,
} from "@/components/supplier-purchase-orders/purchase-order-types";

import { loadRequisitionCatalog } from "./requisition-api";
import { errorMessage } from "./requisition-page-utils";
import {
  createRequisitionRequestAuthority,
  isAbortError,
} from "./requisition-request-authority";

export const emptyRequisitionCatalog: PurchaseOrderCatalogPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function useRequisitionCatalog({
  open,
  tenantSupplierId,
  onLoaded,
}: {
  open: boolean;
  tenantSupplierId: string;
  onLoaded: (items: PurchaseOrderCatalogItem[]) => void;
}) {
  const [catalog, setCatalog] = useState(emptyRequisitionCatalog);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const requestVersion = useRef(0);
  const requests = useRef(createRequisitionRequestAuthority()).current;

  const load = useCallback(async () => {
    requests.invalidate();
    const version = ++requestVersion.current;
    if (!open || !tenantSupplierId) {
      setCatalog(emptyRequisitionCatalog);
      setError(null);
      setLoading(false);
      return;
    }
    const request = requests.begin();
    setLoading(true);
    setError(null);
    try {
      const next = await loadRequisitionCatalog(
        tenantSupplierId,
        page,
        appliedKeyword,
        request.controller.signal,
      );
      if (
        !requests.isCurrent(request) ||
        requestVersion.current !== version
      ) return;
      setCatalog(next);
      onLoaded(next.list);
    } catch (caught) {
      if (isAbortError(caught) || !requests.isCurrent(request)) return;
      if (requestVersion.current === version) {
        setError(errorMessage(caught, "可采购目录加载失败"));
      }
    } finally {
      if (
        requests.isCurrent(request) &&
        requestVersion.current === version
      ) setLoading(false);
    }
  }, [appliedKeyword, contextVersion, onLoaded, open, page, requests, tenantSupplierId]);

  useEffect(() => {
    void load();
    return () => requests.invalidate();
  }, [load, requests]);

  const reset = useCallback(() => {
    requests.invalidate();
    requestVersion.current += 1;
    setCatalog(emptyRequisitionCatalog);
    setKeyword("");
    setAppliedKeyword("");
    setPage(1);
    setLoading(false);
    setError(null);
    setContextVersion((value) => value + 1);
  }, [requests]);

  const abort = useCallback(() => {
    requests.invalidate();
    requestVersion.current += 1;
    setLoading(false);
  }, [requests]);

  return {
    catalog,
    page,
    keyword,
    loading,
    error,
    setKeyword,
    setPage,
    search: () => {
      setPage(1);
      setAppliedKeyword(keyword.trim());
      setContextVersion((value) => value + 1);
    },
    retry: load,
    dismissError: () => setError(null),
    reset,
    abort,
  };
}
