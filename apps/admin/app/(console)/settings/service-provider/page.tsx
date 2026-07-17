import { redirect } from "next/navigation";

import { ServiceProviderWorkspace } from "@/components/service-provider/service-provider-workspace";
import {
  SERVICE_PROVIDER_AREA_PAGE_SIZE,
  SERVICE_PROVIDER_MANAGE_PERMISSION,
  SERVICE_PROVIDER_READ_PERMISSION,
} from "@/components/service-provider/service-provider-actions";
import type {
  ListData,
  ServiceProviderArea,
  ServiceProviderProfile,
} from "@/components/service-provider/service-provider-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const emptyAreas: ListData<ServiceProviderArea> = {
  list: [],
  pagination: {
    page: 1,
    pageSize: SERVICE_PROVIDER_AREA_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  },
};

export default async function TenantServiceProviderSettingsPage() {
  const [session, token] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
  ]);
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map((permission) => permission.code));
  const canManage = permissions.has(SERVICE_PROVIDER_MANAGE_PERMISSION);
  const canRead = canManage || permissions.has(SERVICE_PROVIDER_READ_PERMISSION);

  const [profileResult, areasResult] = canRead
    ? await Promise.all([
      fetchTenantData<ServiceProviderProfile>(token, "/tenant/service-provider-profile"),
      fetchTenantData<ListData<ServiceProviderArea>>(
        token,
        `/tenant/service-provider-areas?page=1&pageSize=${SERVICE_PROVIDER_AREA_PAGE_SIZE}`,
        emptyAreas,
      ),
    ])
    : [
      { data: null, error: null },
      { data: emptyAreas, error: null },
    ];

  const loadError = [profileResult.error, areasResult.error].filter(Boolean).join("；") || null;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col overflow-hidden">
      <ServiceProviderWorkspace
        profile={profileResult.data}
        areas={areasResult.data || emptyAreas}
        canRead={canRead}
        canManage={canManage}
        loadError={loadError}
      />
    </div>
  );
}

async function fetchTenantData<Result>(
  token: string | null,
  path: string,
  fallback: Result | null = null,
) {
  if (!token) return { data: fallback, error: "缺少登录凭证" };
  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<Result>(response);
    return { data: payload.data ?? fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "服务商资料加载失败",
    };
  }
}
