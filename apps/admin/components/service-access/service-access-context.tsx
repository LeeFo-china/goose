"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AdminTenantServiceAccessSchema,
  type AdminTenantServiceAccess,
} from "@gooes/domain";

import type { AdminSession } from "@/lib/backend";
import { requestBackendJson } from "@/lib/backend-client";
import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";

const UNAVAILABLE_MESSAGE = "服务状态暂时无法加载，请稍后重试";

export type ServiceAccessContextValue = {
  loadResult: TenantServiceAccessLoadResult;
  summary: AdminTenantServiceAccess | null;
  permissionCodes: readonly string[];
  refresh: () => Promise<void>;
  refreshing: boolean;
};

const ServiceAccessContext = createContext<ServiceAccessContextValue>({
  loadResult: { kind: "unavailable", message: UNAVAILABLE_MESSAGE },
  summary: null,
  permissionCodes: [],
  refresh: async () => undefined,
  refreshing: false,
});

function unavailable(): TenantServiceAccessLoadResult {
  return { kind: "unavailable", message: UNAVAILABLE_MESSAGE };
}

export function ServiceAccessProvider({
  session,
  initialLoadResult,
  children,
}: {
  session: AdminSession;
  initialLoadResult: TenantServiceAccessLoadResult;
  children: ReactNode;
}) {
  const [loadResult, setLoadResult] = useState(initialLoadResult);
  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const permissionCodes = useMemo(
    () => session.permissions.map(({ code }) => code),
    [session.permissions],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (loadResult.kind === "bypass" || refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      const payload = await requestBackendJson<unknown>(
        "/employee/service-access",
      );
      const parsed = AdminTenantServiceAccessSchema.safeParse(payload);
      setLoadResult(parsed.success
        ? { kind: "ready", summary: parsed.data }
        : unavailable());
    } catch {
      setLoadResult(unavailable());
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }, [loadResult.kind]);

  const value = useMemo<ServiceAccessContextValue>(() => ({
    loadResult,
    summary: loadResult.kind === "ready" ? loadResult.summary : null,
    permissionCodes,
    refresh,
    refreshing,
  }), [loadResult, permissionCodes, refresh, refreshing]);

  return (
    <ServiceAccessContext.Provider value={value}>
      {children}
    </ServiceAccessContext.Provider>
  );
}

export function useServiceAccess(): ServiceAccessContextValue {
  return useContext(ServiceAccessContext);
}
