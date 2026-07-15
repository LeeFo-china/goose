import { requestBackendJson } from "@/lib/backend-client";
import type {
  AdministrativeAreaOption,
  ListData,
  ServiceProviderArea,
  ServiceProviderMutationResult,
  ServiceProviderProfile,
} from "./service-provider-types";

export const SERVICE_PROVIDER_READ_PERMISSION = "service_provider.profile.read";
export const SERVICE_PROVIDER_MANAGE_PERMISSION = "service_provider.profile.manage";
export const SERVICE_PROVIDER_AREA_PAGE_SIZE = 20;

type ProfilePatch = {
  version: number;
  public_name?: string | null;
  introduction?: string | null;
  public_phone?: string | null;
  address_province?: string | null;
  address_city?: string | null;
  address_district?: string | null;
  address_region_code?: string | null;
  address?: string | null;
  address_latitude?: number | null;
  address_longitude?: number | null;
};

type AreaPayload = {
  version: number;
  province?: string | null;
  city: string;
  district?: string | null;
  adcode: string;
  service_radius_km?: number | null;
  priority: number;
};

function mutationInit(body: unknown, fallbackMessage: string, method: "POST" | "PATCH") {
  return {
    method,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
    fallbackMessage,
  };
}

export function fetchServiceProviderProfile() {
  return requestBackendJson<ServiceProviderProfile>("/tenant/service-provider-profile");
}

export function fetchServiceProviderAreas(page: number, pageSize = SERVICE_PROVIDER_AREA_PAGE_SIZE) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(Math.min(pageSize, 100)),
  });
  return requestBackendJson<ListData<ServiceProviderArea>>(
    `/tenant/service-provider-areas?${params.toString()}`,
  );
}

export function updateServiceProviderProfile(body: ProfilePatch) {
  return requestBackendJson<ServiceProviderMutationResult>(
    "/tenant/service-provider-profile",
    mutationInit(body, "保存服务商资料失败", "PATCH"),
  );
}

export function submitServiceProviderProfile(version: number) {
  return requestBackendJson<ServiceProviderMutationResult>(
    "/tenant/service-provider-profile/submit",
    mutationInit({ version }, "提交平台发布审核失败", "POST"),
  );
}

export function createServiceProviderArea(body: AreaPayload) {
  return requestBackendJson<ServiceProviderMutationResult>(
    "/tenant/service-provider-areas",
    mutationInit(body, "新增服务区域失败", "POST"),
  );
}

export function updateServiceProviderArea(areaId: string, body: AreaPayload) {
  return requestBackendJson<ServiceProviderMutationResult>(
    `/tenant/service-provider-areas/${areaId}`,
    mutationInit(body, "更新服务区域失败", "PATCH"),
  );
}

export async function fetchPublicAdministrativeAreas(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  const data = await requestBackendJson<{ list: AdministrativeAreaOption[] }>(
    `/public/administrative-areas?${params.toString()}`,
  );
  return data.list || [];
}
