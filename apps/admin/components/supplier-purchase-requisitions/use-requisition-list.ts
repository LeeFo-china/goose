"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadRequisitions } from "./requisition-api";
import { errorMessage } from "./requisition-page-utils";
import type { RequisitionWorkspaceState } from "./requisition-page-utils";
import type { RequisitionPage } from "./requisition-types";

const emptyPage: RequisitionPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function useRequisitionList(
  canView: boolean,
  state: RequisitionWorkspaceState,
) {
  const [records, setRecords] = useState(emptyPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRequestVersion = useRef(0);

  const reload = useCallback(async () => {
    if (!canView) return;
    const version = ++listRequestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadRequisitions(state.page, {
        ...(state.keyword ? { keyword: state.keyword } : {}),
        ...(state.status !== "all" ? { status: state.status } : {}),
        ...(state.budgetStatus !== "all"
          ? { budget_status: state.budgetStatus }
          : {}),
        ...(state.projectId !== "all"
          ? { project_id: state.projectId }
          : {}),
        ...(state.tenantSupplierId !== "all"
          ? { tenant_supplier_id: state.tenantSupplierId }
          : {}),
      });
      if (listRequestVersion.current === version) setRecords(next);
    } catch (caught) {
      if (listRequestVersion.current === version) {
        setError(errorMessage(caught, "采购申请列表加载失败"));
      }
    } finally {
      if (listRequestVersion.current === version) setLoading(false);
    }
  }, [canView, state]);

  useEffect(() => {
    void reload();
    return () => {
      listRequestVersion.current += 1;
    };
  }, [reload]);

  return { records, loading, error, reload };
}
