"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestBackendJson } from "@/lib/backend-client";

import type {
  PageData,
  SupplierContract,
  SupplierEligibility,
  SupplierEvent,
  TenantSupplierRelationship,
} from "./supplier-types";

export type TenantSupplierDetailTab =
  | "settings"
  | "contracts"
  | "eligibility"
  | "regions"
  | "events";

type ResourceState<Data> = {
  data: Data | null;
  loading: boolean;
  error: string | null;
};

const initialState = <Data,>(): ResourceState<Data> => ({
  data: null,
  loading: false,
  error: null,
});

export function useTenantSupplierDetail({
  relationshipId,
  activeTab,
  open,
}: {
  relationshipId: string;
  activeTab: TenantSupplierDetailTab;
  open: boolean;
}) {
  const [detail, setDetail] =
    useState<ResourceState<TenantSupplierRelationship>>(initialState);
  const [contracts, setContracts] =
    useState<ResourceState<PageData<SupplierContract>>>(initialState);
  const [eligibility, setEligibility] =
    useState<ResourceState<SupplierEligibility>>(initialState);
  const [events, setEvents] =
    useState<ResourceState<PageData<SupplierEvent>>>(initialState);
  const [contractPage, setContractPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const requestSequence = useRef(0);

  const loadDetail = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setDetail((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<TenantSupplierRelationship>(
        `/suppliers/${relationshipId}`,
        { fallbackMessage: "合作供应商详情加载失败" },
      );
      if (requestId !== requestSequence.current) return null;
      setDetail({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (requestId !== requestSequence.current) return null;
      setDetail({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "合作供应商详情加载失败",
      });
      return null;
    }
  }, [relationshipId]);

  const loadContracts = useCallback(async (page: number) => {
    setContracts((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PageData<SupplierContract>>(
        `/suppliers/${relationshipId}/contracts?page=${page}&pageSize=10`,
        { fallbackMessage: "供应商合同加载失败" },
      );
      setContracts({ data, loading: false, error: null });
    } catch (error) {
      setContracts({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "供应商合同加载失败",
      });
    }
  }, [relationshipId]);

  const loadEligibility = useCallback(async () => {
    setEligibility((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<SupplierEligibility>(
        `/suppliers/${relationshipId}/order-eligibility`,
        { fallbackMessage: "新订单资格加载失败" },
      );
      setEligibility({ data, loading: false, error: null });
    } catch (error) {
      setEligibility({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "新订单资格加载失败",
      });
    }
  }, [relationshipId]);

  const loadEvents = useCallback(async (page: number) => {
    setEvents((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PageData<SupplierEvent>>(
        `/suppliers/${relationshipId}/events?page=${page}&pageSize=10`,
        { fallbackMessage: "合作操作记录加载失败" },
      );
      setEvents({ data, loading: false, error: null });
    } catch (error) {
      setEvents({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "合作操作记录加载失败",
      });
    }
  }, [relationshipId]);

  useEffect(() => {
    if (open) void loadDetail();
  }, [loadDetail, open]);

  useEffect(() => {
    if (!open) return;
    if (activeTab === "contracts") {
      void loadContracts(contractPage);
    } else if (activeTab === "eligibility") {
      void loadEligibility();
    } else if (activeTab === "events") {
      void loadEvents(eventPage);
    }
  }, [
    activeTab,
    contractPage,
    eventPage,
    loadContracts,
    loadEligibility,
    loadEvents,
    open,
  ]);

  return {
    detail,
    contracts,
    eligibility,
    events,
    contractPage,
    eventPage,
    setContractPage,
    setEventPage,
    loadDetail,
    loadContracts,
    loadEligibility,
    loadEvents,
  };
}
