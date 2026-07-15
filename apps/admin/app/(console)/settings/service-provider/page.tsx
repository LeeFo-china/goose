import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
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
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <Building2 aria-hidden="true" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">服务商资料</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              维护小程序本地服务商页使用的公开资料和服务区域，提交后由平台复核发布。
            </p>
          </div>
          <Badge variant={canManage ? "secondary" : "outline"} className="w-fit">
            {canManage ? "可编辑并提交审核" : canRead ? "仅可查看" : "无访问权限"}
          </Badge>
        </div>
      </div>

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
