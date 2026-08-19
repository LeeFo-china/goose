"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  refresh: () => Promise<ServiceAccessRefreshResult>;
  refreshing: boolean;
};

export type ServiceAccessRefreshResult =
  | { success: true }
  | { success: false; message: string; requestId?: string };

export type ServiceAccessRefreshRequester = <Response = unknown>(
  path: string,
) => Promise<Response>;

export type ServiceAccessRefreshOutcome = {
  loadResult: TenantServiceAccessLoadResult;
  result: ServiceAccessRefreshResult;
};

const ServiceAccessContext = createContext<ServiceAccessContextValue>({
  loadResult: { kind: "unavailable", message: UNAVAILABLE_MESSAGE },
  summary: null,
  permissionCodes: [],
  refresh: async () => ({
    success: false,
    message: UNAVAILABLE_MESSAGE,
  }),
  refreshing: false,
});

function unavailable(): TenantServiceAccessLoadResult {
  return { kind: "unavailable", message: UNAVAILABLE_MESSAGE };
}

export async function requestServiceAccessRefresh(
  requester: ServiceAccessRefreshRequester = requestBackendJson,
): Promise<ServiceAccessRefreshOutcome> {
  try {
    const payload = await requester<unknown>("/employee/service-access");
    const parsed = AdminTenantServiceAccessSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        loadResult: unavailable(),
        result: { success: false, message: UNAVAILABLE_MESSAGE },
      };
    }

    return {
      loadResult: { kind: "ready", summary: parsed.data },
      result: { success: true },
    };
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : UNAVAILABLE_MESSAGE;
    const requestId = getRequestId(error);
    return {
      loadResult: unavailable(),
      result: requestId
        ? { success: false, message, requestId }
        : { success: false, message },
    };
  }
}

function getRequestId(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("requestId" in error)) {
    return undefined;
  }

  const requestId = error.requestId;
  return typeof requestId === "string" && requestId.trim()
    ? requestId.trim()
    : undefined;
}

export function getServiceAccessProviderKey(
  initialLoadResult: TenantServiceAccessLoadResult,
): string {
  if (initialLoadResult.kind !== "ready") return initialLoadResult.kind;
  return [
    initialLoadResult.kind,
    initialLoadResult.summary.accessStatus,
  ].join(":");
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

  useEffect(() => {
    setLoadResult(initialLoadResult);
  }, [initialLoadResult]);

  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlightRef = useRef<Promise<ServiceAccessRefreshResult> | null>(
    null,
  );
  const permissionCodes = useMemo(
    () => session.permissions.map(({ code }) => code),
    [session.permissions],
  );

  const refresh = useCallback((): Promise<ServiceAccessRefreshResult> => {
    if (loadResult.kind === "bypass") {
      return Promise.resolve({ success: true });
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    setRefreshing(true);
    const refreshPromise = (async () => {
      try {
        const outcome = await requestServiceAccessRefresh();
        setLoadResult(outcome.loadResult);
        return outcome.result;
      } finally {
        refreshInFlightRef.current = null;
        setRefreshing(false);
      }
    })();
    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
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
