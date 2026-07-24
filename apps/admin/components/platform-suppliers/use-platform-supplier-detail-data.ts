"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestBackendJson } from "@/lib/backend-client";

import type {
  PageData,
  PlatformSupplierDetailRecord,
  SupplierAddress,
  SupplierContact,
  SupplierEvent,
  SupplierQualification,
  SupplierServiceRegion,
} from "./platform-supplier-types";
import { isLatestResourceRequest } from "./platform-supplier-rules";

type DetailTab =
  | "profile"
  | "qualifications"
  | "regions"
  | "contacts"
  | "events";

export type ResourceState<Data> = {
  data: Data | null;
  loading: boolean;
  error: string | null;
};

function initialState<Data>(): ResourceState<Data> {
  return { data: null, loading: false, error: null };
}

export function usePlatformSupplierDetailData({
  supplierId,
  activeTab,
  open,
}: {
  supplierId: string;
  activeTab: DetailTab;
  open: boolean;
}) {
  const [detail, setDetail] =
    useState<ResourceState<PlatformSupplierDetailRecord>>(initialState);
  const [qualifications, setQualifications] =
    useState<ResourceState<PageData<SupplierQualification>>>(initialState);
  const [regions, setRegions] =
    useState<ResourceState<PageData<SupplierServiceRegion>>>(initialState);
  const [contacts, setContacts] =
    useState<ResourceState<PageData<SupplierContact>>>(initialState);
  const [addresses, setAddresses] =
    useState<ResourceState<PageData<SupplierAddress>>>(initialState);
  const [events, setEvents] =
    useState<ResourceState<PageData<SupplierEvent>>>(initialState);
  const [qualificationPage, setQualificationPage] = useState(1);
  const [regionPage, setRegionPage] = useState(1);
  const [contactPage, setContactPage] = useState(1);
  const [addressPage, setAddressPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const detailRequestId = useRef(0);
  const qualificationRequestId = useRef(0);
  const regionRequestId = useRef(0);
  const contactRequestId = useRef(0);
  const addressRequestId = useRef(0);
  const eventRequestId = useRef(0);

  const loadDetail = useCallback(async () => {
    const requestId = ++detailRequestId.current;
    setDetail((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PlatformSupplierDetailRecord>(
        `/platform/suppliers/${supplierId}`,
        { fallbackMessage: "供应商详情加载失败" },
      );
      if (!isLatestResourceRequest(requestId, detailRequestId.current)) {
        return null;
      }
      setDetail({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (!isLatestResourceRequest(requestId, detailRequestId.current)) {
        return null;
      }
      setDetail({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "供应商详情加载失败",
      });
      return null;
    }
  }, [supplierId]);

  const loadQualifications = useCallback(async (page: number) => {
    const requestId = ++qualificationRequestId.current;
    setQualifications((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    try {
      const data = await requestBackendJson<PageData<SupplierQualification>>(
        `/platform/suppliers/${supplierId}/qualifications?page=${page}&pageSize=10`,
        { fallbackMessage: "供应商资质加载失败" },
      );
      if (
        !isLatestResourceRequest(requestId, qualificationRequestId.current)
      ) return;
      setQualifications({ data, loading: false, error: null });
    } catch (error) {
      if (
        !isLatestResourceRequest(requestId, qualificationRequestId.current)
      ) return;
      setQualifications({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "供应商资质加载失败",
      });
    }
  }, [supplierId]);

  const loadRegions = useCallback(async (page: number) => {
    const requestId = ++regionRequestId.current;
    setRegions((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PageData<SupplierServiceRegion>>(
        `/platform/suppliers/${supplierId}/service-regions?page=${page}&pageSize=10`,
        { fallbackMessage: "服务区域加载失败" },
      );
      if (!isLatestResourceRequest(requestId, regionRequestId.current)) return;
      setRegions({ data, loading: false, error: null });
    } catch (error) {
      if (!isLatestResourceRequest(requestId, regionRequestId.current)) return;
      setRegions({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "服务区域加载失败",
      });
    }
  }, [supplierId]);

  const loadContacts = useCallback(async (page: number) => {
    const requestId = ++contactRequestId.current;
    setContacts((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PageData<SupplierContact>>(
        `/platform/suppliers/${supplierId}/contacts?page=${page}&pageSize=10`,
        { fallbackMessage: "联系人加载失败" },
      );
      if (!isLatestResourceRequest(requestId, contactRequestId.current)) return;
      setContacts({ data, loading: false, error: null });
    } catch (error) {
      if (!isLatestResourceRequest(requestId, contactRequestId.current)) return;
      setContacts({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "联系人加载失败",
      });
    }
  }, [supplierId]);

  const loadAddresses = useCallback(async (page: number) => {
    const requestId = ++addressRequestId.current;
    setAddresses((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PageData<SupplierAddress>>(
        `/platform/suppliers/${supplierId}/addresses?page=${page}&pageSize=10`,
        { fallbackMessage: "地址加载失败" },
      );
      if (!isLatestResourceRequest(requestId, addressRequestId.current)) return;
      setAddresses({ data, loading: false, error: null });
    } catch (error) {
      if (!isLatestResourceRequest(requestId, addressRequestId.current)) return;
      setAddresses({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "地址加载失败",
      });
    }
  }, [supplierId]);

  const loadEvents = useCallback(async (page: number) => {
    const requestId = ++eventRequestId.current;
    setEvents((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await requestBackendJson<PageData<SupplierEvent>>(
        `/platform/suppliers/${supplierId}/events?page=${page}&pageSize=10`,
        { fallbackMessage: "操作记录加载失败" },
      );
      if (!isLatestResourceRequest(requestId, eventRequestId.current)) return;
      setEvents({ data, loading: false, error: null });
    } catch (error) {
      if (!isLatestResourceRequest(requestId, eventRequestId.current)) return;
      setEvents({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "操作记录加载失败",
      });
    }
  }, [supplierId]);

  useEffect(() => {
    if (open) void loadDetail();
  }, [loadDetail, open]);

  useEffect(() => {
    if (!open) return;
    if (activeTab === "qualifications") {
      void loadQualifications(qualificationPage);
    } else if (activeTab === "regions") {
      void loadRegions(regionPage);
    } else if (activeTab === "contacts") {
      void loadContacts(contactPage);
      void loadAddresses(addressPage);
    } else if (activeTab === "events") {
      void loadEvents(eventPage);
    }
  }, [
    activeTab,
    addressPage,
    contactPage,
    eventPage,
    loadAddresses,
    loadContacts,
    loadEvents,
    loadQualifications,
    loadRegions,
    open,
    qualificationPage,
    regionPage,
  ]);

  async function refreshActive() {
    await loadDetail();
    if (activeTab === "qualifications") {
      await loadQualifications(qualificationPage);
    } else if (activeTab === "regions") {
      await loadRegions(regionPage);
    } else if (activeTab === "contacts") {
      void loadContacts(contactPage);
      void loadAddresses(addressPage);
    } else if (activeTab === "events") {
      await loadEvents(eventPage);
    }
  }

  return {
    detail,
    qualifications,
    regions,
    contacts,
    addresses,
    events,
    qualificationPage,
    regionPage,
    contactPage,
    addressPage,
    eventPage,
    setQualificationPage,
    setRegionPage,
    setContactPage,
    setAddressPage,
    setEventPage,
    loadDetail,
    loadQualifications,
    loadRegions,
    loadContacts,
    loadAddresses,
    loadEvents,
    refreshActive,
  };
}
